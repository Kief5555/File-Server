import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import mime from 'mime-types';

const MAX_INLINE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const UNSAFE_INLINE_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml']);

type FileResponseOptions = {
    download?: boolean;
    cacheControl?: string;
};

type ByteRange = {
    start: number;
    end: number;
};

function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
    if (!rangeHeader.startsWith('bytes=') || fileSize < 1) return null;

    const range = rangeHeader.slice('bytes='.length).trim();
    if (!range || range.includes(',')) return null;

    const parts = range.split('-');
    if (parts.length !== 2) return null;

    const [startRaw, endRaw] = parts;
    if (startRaw === '') {
        const suffixLength = Number(endRaw);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
        return {
            start: Math.max(fileSize - suffixLength, 0),
            end: fileSize - 1,
        };
    }

    const start = Number(startRaw);
    const end = endRaw === '' ? fileSize - 1 : Number(endRaw);

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start < 0 || end < start || start >= fileSize) return null;

    return {
        start,
        end: Math.min(end, fileSize - 1),
    };
}

function getContentDisposition(disposition: 'inline' | 'attachment', fileName: string): string {
    const fallbackName = fileName.replace(/[^\x20-\x7E]|["\\]/g, '_');
    const encodedName = encodeURIComponent(fileName)
        .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, '%2A');

    return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

function getBaseHeaders(
    absPath: string,
    mimetype: string,
    fileSize: number,
    download: boolean,
    cacheControl: string,
) {
    const fileName = path.basename(absPath);
    const isLargeFile = fileSize > MAX_INLINE_FILE_BYTES;
    const isUnsafeInlineType = UNSAFE_INLINE_TYPES.has(mimetype);
    const disposition = download || isLargeFile || isUnsafeInlineType ? 'attachment' : 'inline';

    return {
        'Content-Type': mimetype,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': getContentDisposition(disposition, fileName),
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
    };
}

export async function serveFileWithRangeSupport(
    req: Request,
    absPath: string,
    options: FileResponseOptions = {},
): Promise<NextResponse> {
    const stat = await fsp.stat(absPath);
    if (!stat.isFile()) {
        return NextResponse.json({ message: "Not a file" }, { status: 400 });
    }

    const fileSize = stat.size;
    const mimetype = mime.lookup(absPath) || 'application/octet-stream';
    const cacheControl = options.cacheControl ?? 'private, no-store';
    const baseHeaders = getBaseHeaders(absPath, mimetype, fileSize, options.download === true, cacheControl);
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const lastModified = stat.mtime.toUTCString();
    const headers = { ...baseHeaders, ETag: etag, 'Last-Modified': lastModified };
    const ifNoneMatch = req.headers.get('if-none-match');
    const modifiedSince = req.headers.get('if-modified-since');
    if (ifNoneMatch
        ? ifNoneMatch.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')
        : modifiedSince && Date.parse(modifiedSince) >= Math.floor(stat.mtimeMs / 1000) * 1000) {
        return new NextResponse(null, { status: 304, headers });
    }
    const ifRange = req.headers.get('if-range');
    const rangeAllowed = !ifRange || ifRange === etag || Date.parse(ifRange) >= Math.floor(stat.mtimeMs / 1000) * 1000;
    const rangeHeader = rangeAllowed ? req.headers.get('range') : null;

    if (rangeHeader) {
        const byteRange = parseByteRange(rangeHeader, fileSize);
        if (!byteRange) {
            return new NextResponse(null, {
                status: 416,
                headers: {
                    'Content-Range': `bytes */${fileSize}`,
                    'Cache-Control': cacheControl,
                    'X-Content-Type-Options': 'nosniff',
                },
            });
        }

        const { start, end } = byteRange;
        const chunkSize = end - start + 1;
        const webStream = req.method === 'HEAD' ? null : Readable.toWeb(
            fs.createReadStream(absPath, { start, end, highWaterMark: 256 * 1024, signal: req.signal }),
        ) as ReadableStream<Uint8Array>;

        return new NextResponse(webStream, {
            status: 206,
            headers: {
                ...headers,
                'Content-Length': chunkSize.toString(),
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            },
        });
    }

    const webStream = req.method === 'HEAD' ? null : Readable.toWeb(
        fs.createReadStream(absPath, { highWaterMark: 256 * 1024, signal: req.signal }),
    ) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
        headers: {
            ...headers,
            'Content-Length': fileSize.toString(),
        },
    });
}
