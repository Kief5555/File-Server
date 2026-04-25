import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { getSession } from '@/lib/auth';
import { invalidateFolderSizeCache } from '@/lib/files';
import db from '@/lib/db';

const filesRoot = path.join(process.cwd(), 'files');
const tempRoot = path.join(filesRoot, '.temp-uploads');
const MAX_UPLOAD_CHUNK_BYTES = Number(process.env.MAX_UPLOAD_CHUNK_BYTES || 16 * 1024 * 1024);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024 * 1024);

if (!fs.existsSync(tempRoot)) {
    fs.mkdirSync(tempRoot, { recursive: true });
}

function jsonError(message: string, status: number) {
    return NextResponse.json({ message }, { status });
}

function parseOptionalInteger(value: FormDataEntryValue | null): number | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getSafeUploadId(identifier: string | null) {
    if (!identifier || !/^[a-zA-Z0-9._-]{1,160}$/.test(identifier)) return null;
    if (identifier === '.' || identifier === '..') return null;
    return identifier;
}

function getSafeTargetPath(rawPath: string) {
    if (rawPath.includes('..')) return null;
    const targetDir = path.resolve(filesRoot, rawPath);
    const resolvedRoot = path.resolve(filesRoot);
    if (targetDir !== resolvedRoot && !targetDir.startsWith(resolvedRoot + path.sep)) return null;
    return targetDir;
}

async function writeUploadedFile(file: File, destination: string) {
    const nodeStream = Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>);
    await pipeline(nodeStream, fs.createWriteStream(destination, { flags: 'w' }));
}

async function mergeChunks(chunkDir: string, filePath: string, totalChunks: number) {
    const lockPath = path.join(chunkDir, '.merge.lock');
    let lock: fsp.FileHandle | null = null;

    try {
        lock = await fsp.open(lockPath, 'wx');
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return false;
        throw error;
    }

    try {
        const partialPath = `${filePath}.uploading`;
        await fsp.rm(partialPath, { force: true });

        const writeStream = fs.createWriteStream(partialPath, { flags: 'w' });
        try {
            for (let i = 0; i < totalChunks; i++) {
                await pipeline(fs.createReadStream(path.join(chunkDir, i.toString())), writeStream, { end: false });
            }
        } finally {
            await new Promise<void>((resolve, reject) => {
                writeStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
            });
        }

        await fsp.rename(partialPath, filePath);
        await fsp.rm(chunkDir, { recursive: true, force: true });
        return true;
    } finally {
        await lock.close().catch(() => {});
    }
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return jsonError("Unauthorized", 401);

    const user = db.prepare('SELECT can_upload, is_admin FROM users WHERE id = ?').get(session.id) as { can_upload: number; is_admin: number } | undefined;
    if (!user || (user.is_admin !== 1 && user.can_upload !== 1)) {
        return jsonError("Forbidden", 403);
    }

    const contentLengthHeader = req.headers.get('content-length');
    const contentLength = Number(contentLengthHeader || 0);
    if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength < 1) {
        return jsonError("Content-Length is required for uploads.", 411);
    }
    if (contentLength > MAX_UPLOAD_CHUNK_BYTES + 1024 * 1024) {
        return jsonError("Upload request is too large. Use chunked uploads.", 413);
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const targetPathQuery = new URL(req.url).searchParams.get('path') || 'public';

        const chunkIndex = parseOptionalInteger(formData.get('chunkIndex'));
        const totalChunks = parseOptionalInteger(formData.get('totalChunks'));
        const fileSize = parseOptionalInteger(formData.get('fileSize'));
        const chunkSize = parseOptionalInteger(formData.get('chunkSize'));
        const identifier = getSafeUploadId(formData.get('identifier') as string | null);
        const rawFileName = (formData.get('fileName') as string | null) || file?.name || 'file';
        const fileName = path.basename(String(rawFileName)) || 'file';

        if (fileName === '.' || fileName === '..' || fileName.includes('..')) return jsonError("Invalid file name", 400);
        if (!file) return jsonError("No file", 400);
        if (file.size > MAX_UPLOAD_CHUNK_BYTES) return jsonError("Upload chunk is too large", 413);

        const targetDir = getSafeTargetPath(targetPathQuery);
        if (!targetDir) return jsonError("Access denied", 403);
        if (!fs.existsSync(targetDir)) return jsonError("Target directory not found", 404);

        const filePath = path.join(targetDir, fileName);
        const hasChunkMetadata = chunkIndex !== null || totalChunks !== null || formData.has('identifier') || fileSize !== null || chunkSize !== null;

        if (hasChunkMetadata) {
            if (chunkIndex === null || totalChunks === null || !identifier || fileSize === null || chunkSize === null) {
                return jsonError("Invalid chunk metadata", 400);
            }
            if (totalChunks < 1 || chunkIndex >= totalChunks) {
                return jsonError("Invalid chunk index", 400);
            }
            if (chunkSize < 1 || chunkSize > MAX_UPLOAD_CHUNK_BYTES || totalChunks !== Math.ceil(fileSize / chunkSize)) {
                return jsonError("Invalid chunk size", 400);
            }
            if (fileSize > MAX_UPLOAD_BYTES) {
                return jsonError("Upload exceeds server size limit", 413);
            }

            const chunkDir = path.join(tempRoot, identifier);
            await fsp.mkdir(chunkDir, { recursive: true });
            await writeUploadedFile(file, path.join(chunkDir, chunkIndex.toString()));

            let allChunksPresent = true;
            for (let i = 0; i < totalChunks; i++) {
                try {
                    await fsp.access(path.join(chunkDir, i.toString()));
                } catch {
                    allChunksPresent = false;
                    break;
                }
            }

            if (allChunksPresent) {
                const merged = await mergeChunks(chunkDir, filePath, totalChunks);
                invalidateFolderSizeCache(targetPathQuery);
                return NextResponse.json({ message: merged ? "Uploaded and merged" : "Chunk received; merge in progress" });
            }

            return NextResponse.json({ message: `Chunk ${chunkIndex} received` });
        }

        if (file.size > MAX_UPLOAD_CHUNK_BYTES) {
            return jsonError("Single-request uploads are too large. Use the chunked uploader.", 413);
        }

        await writeUploadedFile(file, filePath);
        invalidateFolderSizeCache(targetPathQuery);
        return NextResponse.json({ message: "Uploaded" });
    } catch (e) {
        console.error("Upload error:", e);
        return jsonError("Error", 500);
    }
}
