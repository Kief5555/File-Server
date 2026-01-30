import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import crypto from 'crypto';

// Generate a short random URL-safe ID
function generateShortId(): string {
    return crypto.randomBytes(8).toString('base64url');
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const { path: filePath, password, expiresIn } = await req.json();
        
        // Generate a short, URL-safe ID
        const id = generateShortId();
        
        // Calculate expiration date if provided (in hours)
        let expiresAt = null;
        if (expiresIn && expiresIn > 0) {
            const expDate = new Date();
            expDate.setHours(expDate.getHours() + expiresIn);
            expiresAt = expDate.toISOString();
        }

        db.prepare('INSERT INTO shares (id, file_path, password, created_by, expires_at) VALUES (?, ?, ?, ?, ?)').run(
            id, 
            filePath, 
            password || null,
            session.id,
            expiresAt
        );

        // Return the short URL
        return NextResponse.json({ link: `/u/${id}`, id });
    } catch (e) {
        console.error('Share error:', e);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    
    // List shares created by this user (or all for admin)
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    const isAdmin = user?.is_admin === 1;
    
    let shares;
    if (isAdmin) {
        shares = db.prepare('SELECT id, file_path, password, created_at, expires_at FROM shares ORDER BY created_at DESC').all();
    } else {
        shares = db.prepare('SELECT id, file_path, password, created_at, expires_at FROM shares WHERE created_by = ? ORDER BY created_at DESC').all(session.id);
    }
    
    return NextResponse.json(shares);
}

export async function DELETE(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    
    try {
        const { id } = await req.json();
        
        // Check ownership or admin
        const share = db.prepare('SELECT created_by FROM shares WHERE id = ?').get(id) as { created_by: number } | undefined;
        if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });
        
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
        const isAdmin = user?.is_admin === 1;
        
        if (share.created_by !== session.id && !isAdmin) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
        }
        
        db.prepare('DELETE FROM shares WHERE id = ?').run(id);
        
        return NextResponse.json({ message: "Share deleted" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
