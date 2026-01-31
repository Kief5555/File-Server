import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';
import { getResolvedAbsPath, invalidateFolderSizeCache } from '@/lib/files';

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const { path: targetPath } = await req.json();
        if (!targetPath || typeof targetPath !== 'string') return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        const normalized = targetPath.replace(/^\/+/, '').replace(/\\/g, '/');
        const fullPath = getResolvedAbsPath(normalized);
        if (!fullPath) return NextResponse.json({ message: "Invalid path" }, { status: 400 });

        if (!fs.existsSync(fullPath)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        const parentPath = path.posix.dirname(normalized);
        if (parentPath && parentPath !== '.') invalidateFolderSizeCache(parentPath);

        return NextResponse.json({ message: "Deleted" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
