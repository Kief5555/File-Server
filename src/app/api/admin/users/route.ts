import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { getSession } from '@/lib/auth';

function isSqliteUniqueError(error: unknown): error is { code: string } {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    
    // Check if user is admin
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    if (!user || user.is_admin !== 1) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const users = db.prepare('SELECT id, username, can_upload, can_delete, can_access_private, is_admin, created_at FROM users').all();
    return NextResponse.json(users);
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    
    // Check if user is admin
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    if (!user || user.is_admin !== 1) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    try {
        const { username, password, can_upload, can_delete, can_access_private } = await req.json();
        if (!username || !password) return NextResponse.json({ message: "Missing fields" }, { status: 400 });

        const hashedPassword = await bcrypt.hash(password, 10);

        db.prepare('INSERT INTO users (username, password, can_upload, can_delete, can_access_private) VALUES (?, ?, ?, ?, ?)').run(
            username, 
            hashedPassword, 
            can_upload ? 1 : 0, 
            can_delete ? 1 : 0, 
            can_access_private ? 1 : 0
        );

        return NextResponse.json({ message: "User created" });
    } catch (error: unknown) {
        if (isSqliteUniqueError(error)) {
            return NextResponse.json({ message: "User already exists" }, { status: 409 });
        }
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    
    // Check if user is admin
    const adminUser = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    if (!adminUser || adminUser.is_admin !== 1) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    try {
        const { id, can_upload, can_delete, can_access_private } = await req.json();
        if (!id) return NextResponse.json({ message: "Missing user ID" }, { status: 400 });

        // Don't allow modifying admin permissions
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id) as { is_admin: number } | undefined;
        if (user?.is_admin === 1) {
            return NextResponse.json({ message: "Cannot modify admin permissions" }, { status: 403 });
        }

        db.prepare('UPDATE users SET can_upload = ?, can_delete = ?, can_access_private = ? WHERE id = ?').run(
            can_upload ? 1 : 0,
            can_delete ? 1 : 0,
            can_access_private ? 1 : 0,
            id
        );

        return NextResponse.json({ message: "User updated" });
    } catch {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    
    // Check if user is admin
    const adminUser = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
    if (!adminUser || adminUser.is_admin !== 1) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    try {
        const { id } = await req.json();
        
        // Don't allow deleting admin
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id) as { is_admin: number } | undefined;
        if (user?.is_admin === 1) {
            return NextResponse.json({ message: "Cannot delete admin" }, { status: 403 });
        }
        
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return NextResponse.json({ message: "User deleted" });
    } catch {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
