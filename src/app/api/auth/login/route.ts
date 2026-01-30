import { NextResponse } from 'next/server';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ message: "Missing credentials" }, { status: 400 });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
        }

        const token = signToken({ id: user.id, username: user.username });

        const cookieStore = await cookies();
        cookieStore.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        return NextResponse.json({ message: "Logged in", user: { username: user.username } });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
