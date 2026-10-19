import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fsp from 'fs/promises';
import { getResolvedAbsPath, getSafeExistingAbsPath } from '@/lib/files';
import { serveFileWithRangeSupport } from '@/lib/fileResponses';
import { verifySharePassword } from '@/lib/sharePasswords';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    const share = db.prepare('SELECT file_path, password, expires_at FROM shares WHERE id = ?').get(id) as {
        file_path: string;
        password: string | null;
        expires_at: string | null;
    } | undefined;

    if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (!(await verifySharePassword(share.password, password))) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const relativePath = (share.file_path || '').replace(/\\/g, '/');
    const resolvedPath = getResolvedAbsPath(relativePath);
    if (!resolvedPath) return NextResponse.json({ message: "Invalid path" }, { status: 403 });

    const fullPath = await getSafeExistingAbsPath(relativePath);
    if (!fullPath) {
        try {
            await fsp.access(resolvedPath);
        } catch {
            return NextResponse.json({ message: "File not found" }, { status: 404 });
        }
        return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    const isDownload = searchParams.get('download') === '1';
    return serveFileWithRangeSupport(req, fullPath, {
        download: isDownload,
        cacheControl: 'private, no-store',
    });
}
