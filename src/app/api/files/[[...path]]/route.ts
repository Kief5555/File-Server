import { NextResponse } from 'next/server';
import fsp from 'fs/promises';
import { getSession } from '@/lib/auth';
import { listFiles, getResolvedAbsPath, getSafeExistingAbsPath } from '@/lib/files';
import { serveFileWithRangeSupport } from '@/lib/fileResponses';

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

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
    let pathSegments: string[] | undefined;
    try {
        const p = await params;
        pathSegments = p.path;
    } catch { }

    if (!pathSegments) {
        pathSegments = getPathFromUrl(req.url);
    }

    const url = new URL(req.url);
    const password = url.searchParams.get('password');
    const session = await getSession();

    try {
        const result = await listFiles(pathSegments, session, password);
        return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error";
        if (message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        if (message === "Not found") return NextResponse.json({ message: "Not found" }, { status: 404 });
        if (message === "No permissions" || message === "Access denied") return NextResponse.json({ message: "Access denied" }, { status: 403 });

        // If it's not a directory, serve the file with range support
        if (message === "Not a directory") {
            const requestedPath = pathSegments.join('/');
            const resolvedPath = getResolvedAbsPath(requestedPath);
            if (resolvedPath) {
                const absPath = await getSafeExistingAbsPath(requestedPath);
                if (!absPath) {
                    try {
                        await fsp.access(resolvedPath);
                    } catch {
                        return NextResponse.json({ message: "Not found" }, { status: 404 });
                    }
                    return NextResponse.json({ message: "Access denied" }, { status: 403 });
                }
                const isDownload = url.searchParams.get('download') === '1';
                const cacheControl = pathSegments[0] === 'public' ? 'public, max-age=3600' : 'private, no-store';
                return serveFileWithRangeSupport(req, absPath, { download: isDownload, cacheControl });
            }
        }

        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
