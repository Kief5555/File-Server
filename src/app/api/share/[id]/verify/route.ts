import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySharePassword } from '@/lib/sharePasswords';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const { password } = await req.json();

    const share = db.prepare('SELECT password, expires_at FROM shares WHERE id = ?').get(id) as {
        password: string | null;
        expires_at: string | null;
    } | undefined;

    if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (await verifySharePassword(share.password, password)) {
        return NextResponse.json({ message: "Verified" });
    }

    return NextResponse.json({ message: "Invalid password" }, { status: 401 });
}
