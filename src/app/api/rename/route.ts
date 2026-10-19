import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'path';
import { getSession } from '@/lib/auth';
import { getSafeExistingAbsPath, invalidateFolderSizeCache } from '@/lib/files';
import db from '@/lib/db';

function isManagedFilePath(relativePath: string) {
    return relativePath.startsWith('public/') || relativePath.startsWith('private/');
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const user = db.prepare('SELECT can_delete, can_access_private, is_admin FROM users WHERE id = ?').get(session.id) as { can_delete: number; can_access_private: number; is_admin: number } | undefined;
    if (!user || (user.is_admin !== 1 && user.can_delete !== 1)) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
        const { oldPath, newName } = await req.json();
        if (!oldPath || !newName || typeof oldPath !== 'string' || typeof newName !== 'string') {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }
        if (oldPath.includes('..') || newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }
        const normalizedOld = oldPath.replace(/^\/+/, '').replace(/\\/g, '/');
        const parent = await getSafeExistingAbsPath(path.posix.dirname(normalizedOld));
        const fullOldPath = parent ? path.join(parent, path.posix.basename(normalizedOld)) : null;
        if (!fullOldPath) return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        if (normalizedOld === 'public' || normalizedOld === 'private') {
            return NextResponse.json({ message: "Cannot rename root folders" }, { status: 400 });
        }
        if (!isManagedFilePath(normalizedOld)) {
            return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        }
        if (normalizedOld.startsWith('private/') && user.is_admin !== 1 && user.can_access_private !== 1) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        if (!await fs.lstat(fullOldPath).catch(() => null)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const dir = path.dirname(fullOldPath);
        const fullNewPath = path.join(dir, newName);
        // `dir` is already a verified managed root descendant, including mounted roots.
        if (path.dirname(fullNewPath) !== dir) {
            return NextResponse.json({ message: "Access denied" }, { status: 403 });
        }

        if (await fs.lstat(fullNewPath).catch(() => null)) return NextResponse.json({ message: "Already exists" }, { status: 409 });

        await fs.rename(fullOldPath, fullNewPath);
        const parentPath = path.posix.dirname(normalizedOld);
        if (parentPath && parentPath !== '.') invalidateFolderSizeCache(parentPath);
        return NextResponse.json({ message: "Renamed" });
    } catch {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
