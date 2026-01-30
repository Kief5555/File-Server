import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import db, { getSetting, setSetting } from '@/lib/db';

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

    const privatePassword = getSetting('private_password') || '';
    
    return NextResponse.json({
        private_password: privatePassword,
    });
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
        const { private_password } = await req.json();
        
        if (private_password !== undefined) {
            setSetting('private_password', private_password);
        }
        
        return NextResponse.json({ message: "Settings updated" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
