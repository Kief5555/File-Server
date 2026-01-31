import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';
import { getResolvedAbsPath, invalidateFolderSizeCache } from '@/lib/files';

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const { oldPath, newName } = await req.json();
        if (!oldPath || !newName || typeof oldPath !== 'string' || typeof newName !== 'string') {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }
        if (oldPath.includes('..') || newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }
        const normalizedOld = oldPath.replace(/^\/+/, '').replace(/\\/g, '/');
        const fullOldPath = getResolvedAbsPath(normalizedOld);
        if (!fullOldPath) return NextResponse.json({ message: "Invalid path" }, { status: 400 });

        if (!fs.existsSync(fullOldPath)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const dir = path.dirname(fullOldPath);
        const fullNewPath = path.join(dir, newName);
        const filesRoot = path.join(process.cwd(), 'files');
        const resolvedRoot = path.resolve(filesRoot);
        if (fullNewPath !== resolvedRoot && !fullNewPath.startsWith(resolvedRoot + path.sep)) {
            return NextResponse.json({ message: "Access denied" }, { status: 403 });
        }

        if (fs.existsSync(fullNewPath)) return NextResponse.json({ message: "Already exists" }, { status: 409 });

        fs.renameSync(fullOldPath, fullNewPath);
        const parentPath = path.posix.dirname(normalizedOld);
        if (parentPath && parentPath !== '.') invalidateFolderSizeCache(parentPath);
        return NextResponse.json({ message: "Renamed" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
