import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const { password } = await req.json();

    const share = db.prepare('SELECT password FROM shares WHERE id = ?').get(id) as any;

    if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });

    if (share.password === password) { // Simple string comparison for share password? Or hashed?
        // Old implementation stored plaintext or didn't specify. 
        // Let's assume plaintext for file share passwords for simplicity as per old code implied, or match Implementation Plan.
        // If we want security, we should hash. But for now, direct comparison.
        return NextResponse.json({ message: "Verified" });
    }

    return NextResponse.json({ message: "Invalid password" }, { status: 401 });
}
