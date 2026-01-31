import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

// Common file extensions that indicate the path is a file, not a directory
const FILE_EXTENSIONS = new Set([
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif',
    // Videos
    'mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v',
    // Audio
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
    // Documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
    // Code
    'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml', 'md', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'rs', 'go', 'rb', 'php', 'sh', 'bash', 'zsh',
    // Archives
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    // Other
    'exe', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa', 'woff', 'woff2', 'ttf', 'otf', 'eot'
]);

function looksLikeFile(pathname: string): boolean {
    const lastSegment = pathname.split('/').pop() || '';
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
            return new NextResponse(null, { status: 204, headers: corsHeaders });
        }
        // Strip trailing slash via rewrite so Next.js doesn't send 308 (CORS blocks redirect)
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

    // Redirect /explorer/* to /files/* - user should never see /explorer in URL
    if (pathname.startsWith('/explorer')) {
        const filesPath = pathname.replace(/^\/explorer/, '/files');
        return NextResponse.redirect(new URL(filesPath || '/files/public', request.url));
    }

    // Handle /files/* paths
    if (pathname.startsWith('/files/') || pathname === '/files') {
        // If it looks like a file path (has known file extension), let it through to route.ts
        if (looksLikeFile(pathname)) {
            return NextResponse.next();
        }

        // It's a directory - internally rewrite to /explorer/* for UI rendering
        // URL stays as /files/... in the browser
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
