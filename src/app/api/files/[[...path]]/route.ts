import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { getSession } from '@/lib/auth';
import { listFiles, getAbsPath } from '@/lib/files';
import mime from 'mime-types';

// Helper to safely parse path from URL if params fail or are ambiguous
function getPathFromUrl(url: string) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname; // /api/files/public/foo
    // Remove /api/files prefix
    const match = pathname.match(/^\/api\/files\/?(.*)/);
    if (match && match[1]) {
        return match[1].split('/').filter(Boolean); // ['public', 'foo']
    }
    return [];
}

// Node Buffer max ~2 GiB; for larger files we must stream and force download
const MAX_BUFFER_SIZE = 2 * 1024 * 1024 * 1024;

// Serve file with range request support (needed for video/audio seeking)
async function serveFileWithRangeSupport(req: Request, absPath: string, mimetype: string, isDownload: boolean) {
    const stat = await fsp.stat(absPath);
    const fileSize = stat.size;
    const fileName = path.basename(absPath);
    const isLargeFile = fileSize > MAX_BUFFER_SIZE;
    const disposition = isDownload || isLargeFile ? 'attachment' : 'inline';
    
    const rangeHeader = req.headers.get('range');
    
    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (start >= fileSize || end >= fileSize || start > end) {
            return new NextResponse(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${fileSize}` }
            });
        }
        const chunkSize = end - start + 1;
        // For range > 2 GiB we cannot Buffer.concat; stream instead
        if (chunkSize > MAX_BUFFER_SIZE) {
            const nodeStream = fs.createReadStream(absPath, { start, end });
            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
            return new NextResponse(webStream, {
                status: 206,
                headers: {
                    'Content-Type': mimetype,
                    'Content-Length': chunkSize.toString(),
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': `${disposition}; filename="${fileName}"`,
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }
        return new Promise<NextResponse>((resolve) => {
            const fileStream = fs.createReadStream(absPath, { start, end });
            const chunks: Buffer[] = [];
            fileStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            fileStream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(new NextResponse(buffer, {
                    status: 206,
                    headers: {
                        'Content-Type': mimetype,
                        'Content-Length': chunkSize.toString(),
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Disposition': `${disposition}; filename="${fileName}"`,
                        'Cache-Control': 'public, max-age=3600'
                    }
                }));
            });
            fileStream.on('error', () => resolve(new NextResponse(null, { status: 500 })));
        });
    }

    const nodeStream = fs.createReadStream(absPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new NextResponse(webStream, {
        headers: {
            'Content-Type': mimetype,
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Disposition': `${disposition}; filename="${fileName}"`,
            'Cache-Control': 'public, max-age=3600'
        }
    });
}

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
    let pathSegments: string[] | undefined;
    try {
        const p = await params;
        pathSegments = p.path;
    } catch (e) { }

    if (!pathSegments) {
        pathSegments = getPathFromUrl(req.url);
    }

    const url = new URL(req.url);
    const password = url.searchParams.get('password');
    const session = await getSession();

    try {
        const result = await listFiles(pathSegments, session, password);
        return NextResponse.json(result);
    } catch (error: any) {
        if (error.message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        if (error.message === "Not found") return NextResponse.json({ message: "Not found" }, { status: 404 });
        if (error.message === "Access denied") return NextResponse.json({ message: "Access denied" }, { status: 403 });

        // If it's not a directory, serve the file with range support
        if (error.message === "Not a directory") {
            const absPath = getAbsPath(pathSegments);
            if (absPath && fs.existsSync(absPath)) {
                const mimetype = mime.lookup(absPath) || 'application/octet-stream';
                const isDownload = url.searchParams.get('download') === '1';
                return await serveFileWithRangeSupport(req, absPath, mimetype, isDownload);
            }
        }

        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
