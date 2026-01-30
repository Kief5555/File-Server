import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';

const filesRoot = path.join(process.cwd(), 'files');

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const { path: targetPath } = await req.json();
        if (!targetPath || targetPath.includes('..')) return NextResponse.json({ message: "Invalid path" }, { status: 400 });

        const fullPath = path.join(filesRoot, targetPath);
        if (!fullPath.startsWith(filesRoot)) return NextResponse.json({ message: "Access denied" }, { status: 403 });

        if (!fs.existsSync(fullPath)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        } // Using sync methods in serverless/lambdas is generally acceptable for FS if not high scale, but async preferred. 
        // Next.js App Router API routes run in Node environment by default so sync works.

        return NextResponse.json({ message: "Deleted" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
