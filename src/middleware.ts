import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': 'true',
};

// Path looks like a file if the last segment has a known extension (middleware can't use fs)
const FILE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif',
    'mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v',
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
    'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml', 'md', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'rs', 'go', 'rb', 'php', 'sh', 'bash', 'zsh',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'bin', 'ipa', 'apk', 'xapk',
    'exe', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa', 'woff', 'woff2', 'ttf', 'otf', 'eot',
    'bat', 'p12', 'url', 'mobileprovision',
]);

function looksLikeFile(pathname: string): boolean {
    const lastSegment = pathname.replace(/\/$/, '').split('/').pop() || '';
    const dotIndex = lastSegment.lastIndexOf('.');
    if (dotIndex > 0) {
        const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
        return FILE_EXTENSIONS.has(ext);
    }
    return false;
}

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // CORS for API routes - allow anywhere
    if (pathname.startsWith('/api')) {
        if (request.method === 'OPTIONS') {
            return new NextResponse(null, {
                headers: corsHeaders,
            });
        }
        // Rewrite trailing slash so Next.js doesn't send 308 (CORS blocks that redirect)
        if (pathname.length > 4 && pathname.endsWith('/')) {
            const url = request.nextUrl.clone();
            url.pathname = pathname.slice(0, -1);
            const response = NextResponse.rewrite(url);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                response.headers.set(key, value);
            });
            return response;
        }
        const response = NextResponse.next();
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    // /files/*: if it looks like a file (has known extension), let the route serve it (route uses fs.stat).
    // Otherwise treat as directory and rewrite to explorer so URL stays /files/... (rewrite only allowed in middleware).
    if (pathname.startsWith('/files/') || pathname === '/files') {
        if (looksLikeFile(pathname)) {
            return NextResponse.next();
        }
        const explorerPath = pathname.replace(/^\/files/, '/explorer') || '/explorer/public';
        return NextResponse.rewrite(new URL(explorerPath, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/api/:path*',
        '/files/:path*',
        '/files',
        '/explorer/:path*',
        '/explorer',
    ],
};
