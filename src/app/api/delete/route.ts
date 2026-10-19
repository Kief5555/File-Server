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
        const { path: targetPath } = await req.json();
        if (!targetPath || typeof targetPath !== 'string') return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        const normalized = targetPath.replace(/^\/+/, '').replace(/\\/g, '/');
        if (normalized === 'public' || normalized === 'private') {
            return NextResponse.json({ message: "Cannot delete root folders" }, { status: 400 });
        }
        if (!isManagedFilePath(normalized)) {
            return NextResponse.json({ message: "Invalid path" }, { status: 400 });
        }
        if (normalized.startsWith('private/') && user.is_admin !== 1 && user.can_access_private !== 1) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }
        const parent = await getSafeExistingAbsPath(path.posix.dirname(normalized));
        const fullPath = parent ? path.join(parent, path.posix.basename(normalized)) : null;
        if (!fullPath) return NextResponse.json({ message: "Invalid path" }, { status: 400 });

        if (!await fs.lstat(fullPath).catch(() => null)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const stat = await fs.lstat(fullPath);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
            await fs.rm(fullPath, { recursive: true, force: true });
        } else {
            await fs.unlink(fullPath);
        }
        const parentPath = path.posix.dirname(normalized);
        if (parentPath && parentPath !== '.') invalidateFolderSizeCache(parentPath);

        return NextResponse.json({ message: "Deleted" });
    } catch {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
