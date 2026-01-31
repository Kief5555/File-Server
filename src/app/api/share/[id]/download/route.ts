import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { getResolvedAbsPath } from '@/lib/files';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const password = searchParams.get('password');

    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as any;

    if (!share) return NextResponse.json({ message: "Not found" }, { status: 404 });

    if (share.password && share.password !== password) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const relativePath = (share.file_path || '').replace(/\\/g, '/');
    const fullPath = getResolvedAbsPath(relativePath);
    if (!fullPath) return NextResponse.json({ message: "Invalid path" }, { status: 403 });

    if (!fs.existsSync(fullPath)) return NextResponse.json({ message: "File not found" }, { status: 404 });

    const fileBuffer = fs.readFileSync(fullPath);
    const mimetype = mime.lookup(fullPath) || 'application/octet-stream';
    const filename = path.basename(fullPath);

    return new NextResponse(fileBuffer, {
        headers: {
            'Content-Type': mimetype,
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });

    // Note: Streaming is better for large files.
    // Next.js: `return new NextResponse(fs.createReadStream(fullPath) ...)`
    // But `NextResponse` body expects BodyInit which includes ReadableStream.
    // `fs.createReadStream` is a node stream. We need to convert or use `stream-to-web`?
    // Actually, `new Response(readableStream)` works. 
    // For now, buffer is fine for small files, but "chunked upload" implies potentially large files. 
    // Optimization: Use `node:stream/web` or similar if needed later.
}
