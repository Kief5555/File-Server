import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';
import { getAbsPath } from '@/lib/files';
import db, { getSetting } from '@/lib/db';
import mime from 'mime-types';

// Serve file with range request support (needed for video/audio seeking)
function serveFileWithRangeSupport(req: Request, absPath: string, mimetype: string, isDownload: boolean) {
    const stat = fs.statSync(absPath);
    const fileSize = stat.size;
    const fileName = path.basename(absPath);
    const disposition = isDownload ? 'attachment' : 'inline';
    
    const rangeHeader = req.headers.get('range');
    
    if (rangeHeader) {
        // Parse range header: "bytes=start-end"
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
            return new NextResponse(null, {
                status: 416, // Range Not Satisfiable
                headers: {
                    'Content-Range': `bytes */${fileSize}`
                }
            });
        }
        
        const chunkSize = end - start + 1;
        
        // Create a readable stream for the range
        const fileStream = fs.createReadStream(absPath, { start, end });
        const chunks: Buffer[] = [];
        
        return new Promise<NextResponse>((resolve) => {
            fileStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            fileStream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(new NextResponse(buffer, {
                    status: 206, // Partial Content
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
            fileStream.on('error', () => {
                resolve(new NextResponse(null, { status: 500 }));
            });
        });
    }
    
    // No range header - serve the whole file
    const fileBuffer = fs.readFileSync(absPath);
    return new NextResponse(fileBuffer, {
        headers: {
            'Content-Type': mimetype,
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Disposition': `${disposition}; filename="${fileName}"`,
            'Cache-Control': 'public, max-age=3600'
        }
    });
}

// This route handler serves actual files for download/embedding
// Directory requests are handled by middleware (rewritten to /explorer/*)
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
    const p = await params;
    const url = new URL(req.url);
    const isDownload = url.searchParams.get('download') === '1';

    // Extract path segments
    let pathSegments = p.path || [];
    if (pathSegments.length > 0 && pathSegments[0] === 'files') {
        pathSegments = pathSegments.slice(1);
    }

    // Default to 'public' if empty
    if (pathSegments.length === 0) {
        pathSegments = ['public'];
    }

    const session = await getSession();

    // Access check for private files
    if (pathSegments[0] === 'private') {
        const providedPassword = url.searchParams.get('password');
        const privatePassword = getSetting('private_password');
        
        // Check if user has session and permission, OR if password matches
        let hasAccess = false;
        
        if (session) {
            // Check user permissions - anyone with can_access_private permission or admin
            const user = db.prepare('SELECT can_access_private, is_admin FROM users WHERE id = ?').get(session.id) as { can_access_private: number; is_admin: number } | undefined;
            if (user) {
                // Admin always has access, or user with can_access_private permission
                if (user.is_admin === 1 || user.can_access_private === 1) {
                    hasAccess = true;
                }
            }
        }
        
        // Check password access
        if (privatePassword && providedPassword === privatePassword) {
            hasAccess = true;
        }
        
        if (!hasAccess) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }
    }

    // Try to serve the file
    const absPath = getAbsPath(pathSegments);
    if (!absPath) {
        return NextResponse.json({ message: "Invalid path" }, { status: 400 });
    }

    if (!fs.existsSync(absPath)) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const stats = fs.statSync(absPath);

    // If it's a directory, rewrite to show UI (fallback - middleware should handle this)
    if (stats.isDirectory()) {
        return NextResponse.redirect(new URL(`/files/${pathSegments.join('/')}`, req.url));
    }

    // Serve the file with range support for video/audio seeking
    const mimetype = mime.lookup(absPath) || 'application/octet-stream';
    return serveFileWithRangeSupport(req, absPath, mimetype, isDownload);
}
