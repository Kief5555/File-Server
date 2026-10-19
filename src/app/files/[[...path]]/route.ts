import { NextResponse } from 'next/server';
import fsp from 'fs/promises';
import { getSession } from '@/lib/auth';
import { getResolvedAbsPath, getSafeExistingAbsPath } from '@/lib/files';
import db, { getSetting } from '@/lib/db';
import { serveFileWithRangeSupport } from '@/lib/fileResponses';

// This route handler serves actual files for download/embedding
// Directory requests are handled by proxy (rewritten to /explorer/*)
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
    const requestedPath = pathSegments.join('/');
    const resolvedPath = getResolvedAbsPath(requestedPath);
    if (!resolvedPath) {
        return NextResponse.json({ message: "Invalid path" }, { status: 400 });
    }

    const absPath = await getSafeExistingAbsPath(requestedPath);
    if (!absPath) {
        try {
            await fsp.access(resolvedPath);
        } catch {
            return NextResponse.json({ message: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    let stats;
    try {
        stats = await fsp.stat(absPath);
    } catch {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    // If it's a directory (e.g. folder named "file.pdf"), redirect to explorer (rewrite is only allowed in proxy)
    if (stats.isDirectory()) {
        const explorerPath = `/explorer/${pathSegments.join('/')}`;
        return NextResponse.redirect(new URL(explorerPath, req.url));
    }

    // Serve the file with range support for video/audio seeking
    const cacheControl = pathSegments[0] === 'public' ? 'public, max-age=3600' : 'private, no-store';
    return serveFileWithRangeSupport(req, absPath, { download: isDownload, cacheControl });
}
