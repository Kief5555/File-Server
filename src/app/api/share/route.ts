import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isPathUnderRoot } from '@/lib/files';
import { hashSharePassword } from '@/lib/sharePasswords';
import crypto from 'crypto';

// Generate a short random URL-safe ID
function generateShortId(): string {
    return crypto.randomBytes(8).toString('base64url');
}

const isPublicPath = (normalized: string) =>
    normalized === 'public' || normalized.startsWith('public/');

export async function POST(req: Request) {
    const session = await getSession();

    try {
        const { path: filePath, password, expiresIn } = await req.json();
        if (!filePath || typeof filePath !== 'string') {
            return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        }
        const normalized = filePath.replace(/^\/+/, '').replace(/\\/g, '/');
        if (!isPathUnderRoot(normalized) || (!normalized.startsWith('public/') && normalized !== 'public' && !normalized.startsWith('private/') && normalized !== 'private')) {
            return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        }

        // Private paths require login; public paths can be shared without login
        if (!isPublicPath(normalized) && !session) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        if (password !== undefined && password !== null && typeof password !== 'string') {
            return NextResponse.json({ message: "Invalid password" }, { status: 400 });
        }
        if (typeof password === 'string' && password.length > 256) {
            return NextResponse.json({ message: "Password is too long" }, { status: 400 });
        }

        const id = generateShortId();
        let expiresAt = null;
        if (expiresIn && expiresIn > 0) {
            const expDate = new Date();
            expDate.setHours(expDate.getHours() + expiresIn);
            expiresAt = expDate.toISOString();
        }
        const storedPassword = password ? await hashSharePassword(password) : null;

        db.prepare('INSERT INTO shares (id, file_path, password, created_by, expires_at) VALUES (?, ?, ?, ?, ?)').run(
            id,
            normalized,
            storedPassword,
            session?.id ?? null,
            expiresAt
        );

        return NextResponse.json({ link: `/u/${id}`, id });
    } catch (e) {
        console.error('Share error:', e);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    
    // List shares created by this user (or all for admin)
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    const isAdmin = user?.is_admin === 1;
    
    let shares;
    if (isAdmin) {
        shares = db.prepare('SELECT id, file_path, (password IS NOT NULL) AS has_password, created_at, expires_at FROM shares ORDER BY created_at DESC').all();
    } else {
        shares = db.prepare('SELECT id, file_path, (password IS NOT NULL) AS has_password, created_at, expires_at FROM shares WHERE created_by = ? ORDER BY created_at DESC').all(session.id);
    }
    
    return NextResponse.json(shares);
}

export async function DELETE(req: Request) {
    const session = await getSession();

    try {
        const { id } = await req.json();
        const share = db.prepare('SELECT created_by FROM shares WHERE id = ?').get(id) as { created_by: number | null } | undefined;
        if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });

        if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
        const isAdmin = user?.is_admin === 1;
        if (share.created_by === null && !isAdmin) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
        }
        if (share.created_by !== session.id && !isAdmin) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
        }

        db.prepare('DELETE FROM shares WHERE id = ?').run(id);
        return NextResponse.json({ message: "Share deleted" });
    } catch {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
