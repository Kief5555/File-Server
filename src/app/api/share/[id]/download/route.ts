import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import mime from 'mime-types';
import { getResolvedAbsPath } from '@/lib/files';

const MAX_BUFFER_SIZE = 2 * 1024 * 1024 * 1024; // 2 GiB

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

    const mimetype = mime.lookup(fullPath) || 'application/octet-stream';
    const filename = path.basename(fullPath);
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    if (fileSize > MAX_BUFFER_SIZE) {
        const nodeStream = fs.createReadStream(fullPath);
        const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
        return new NextResponse(webStream, {
            headers: {
                'Content-Type': mimetype,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': fileSize.toString()
            }
        });
    }

    const fileBuffer = fs.readFileSync(fullPath);
    return new NextResponse(fileBuffer, {
        headers: {
            'Content-Type': mimetype,
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
}
