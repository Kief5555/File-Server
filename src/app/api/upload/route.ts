import { NextResponse } from 'next/server';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getSession } from '@/lib/auth';
import { getSafeExistingAbsPath, invalidateFolderSizeCache } from '@/lib/files';
import { prepareUpload, writeChunk, mergeUpload } from '@/lib/upload-store';
import db from '@/lib/db';

const tempRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), 'files', '.temp-uploads');
const MAX_CHUNK = Number(process.env.MAX_UPLOAD_CHUNK_BYTES || 16 * 1024 * 1024);
const MAX_FILE = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024 * 1024);
const jsonError = (message: string, status: number) => NextResponse.json({ message }, { status });
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id);

async function uploadUser() {
    const session = await getSession();
    if (!session) return null;
    const user = db.prepare('SELECT id, can_upload, can_access_private, is_admin FROM users WHERE id = ?').get(session.id) as {
        id: number; can_upload: number; can_access_private: number; is_admin: number;
    } | undefined;
    return user;
}

export async function POST(req: Request) {
    const user = await uploadUser();
    if (!user) return jsonError('Unauthorized', 401);
    if (!user.is_admin && !user.can_upload) return jsonError('Forbidden', 403);
    const length = Number(req.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 1) return jsonError('Content-Length is required for uploads.', 411);
    if (length > MAX_CHUNK + 1024 * 1024) return jsonError('Upload request is too large.', 413);

    try {
        const data = await req.formData();
        const target = (new URL(req.url).searchParams.get('path') || 'public').replace(/^\/+|\/+$/g, '');
        if (!/^(public|private)(\/|$)/.test(target) || target.split('/').some(p => p === '..' || p.includes('\\'))) {
            return jsonError('Invalid target directory', 400);
        }
        if (target.startsWith('private') && !user.is_admin && !user.can_access_private) return jsonError('Forbidden', 403);
        const directory = await getSafeExistingAbsPath(target);
        if (!directory || !(await fsp.stat(directory)).isDirectory()) return jsonError('Target directory not found', 404);
        const file = data.get('file');
        const name = data.get('fileName') || (file instanceof File ? file.name : '');
        if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/\x00]/.test(name)) return jsonError('Invalid file name', 400);
        const destination = path.join(directory, name);
        // Refuse symlink destinations so writes cannot escape the managed directory.
        const existing = await fsp.lstat(destination).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        if (existing && !existing.isFile()) return jsonError('Destination is not a regular file', 409);

        const identifier = data.get('identifier');
        if (!identifier) {
            if (!(file instanceof File)) return jsonError('No file', 400);
            if (file.size > Math.min(MAX_CHUNK, MAX_FILE)) return jsonError('Upload is too large', 413);
            const staging = path.join(tempRoot, `${user.id}-${crypto.randomUUID()}`);
            await fsp.mkdir(staging, { recursive: true });
            try {
                await writeChunk(staging, 0, file);
                await fsp.rename(path.join(staging, '0'), destination);
            } finally {
                await fsp.rm(staging, { recursive: true, force: true });
            }
            invalidateFolderSizeCache(target);
            return NextResponse.json({ message: 'Uploaded', complete: true });
        }
        if (!validId(identifier)) return jsonError('Invalid upload identifier', 400);
        const integer = (key: string) => {
            const value = data.get(key);
            return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
        };
        const fileSize = integer('fileSize'), chunkSize = integer('chunkSize'), totalChunks = integer('totalChunks');
        if (![fileSize, chunkSize, totalChunks].every(Number.isSafeInteger) || fileSize < 0 || fileSize > MAX_FILE ||
            chunkSize < 1 || chunkSize > MAX_CHUNK || totalChunks !== Math.max(1, Math.ceil(fileSize / chunkSize))) {
            return jsonError('Invalid chunk metadata or file size', 400);
        }
        const metadata = { target, fileName: name, fileSize, chunkSize, totalChunks };
        const staging = path.join(tempRoot, `${user.id}-${identifier}`);
        await prepareUpload(staging, metadata);
        // Receipt makes a retried finalize request safe after a lost response.
        const receipt = path.join(staging, 'complete');
        if (await fsp.readFile(receipt, 'utf8').catch(() => '') === '1') return NextResponse.json({ complete: true });
        if (data.get('finalize') !== 'true') {
            const index = integer('chunkIndex');
            if (!Number.isSafeInteger(index) || index < 0 || index >= totalChunks || !(file instanceof File) ||
                file.size !== Math.min(chunkSize, fileSize - index * chunkSize)) return jsonError('Invalid upload chunk', 400);
            await writeChunk(staging, index, file);
            // New clients finalize explicitly after all workers finish; no per-chunk scans.
            if (data.get('deferMerge') === 'true') return NextResponse.json({ complete: false });
            const names = new Set(await fsp.readdir(staging));
            for (let i = 0; i < totalChunks; i++) if (!names.has(String(i))) return NextResponse.json({ complete: false });
        }
        await mergeUpload(staging, destination, metadata);
        await fsp.writeFile(receipt, '1');
        for (let offset = 0; offset < totalChunks; offset += 32) {
            await Promise.all(Array.from({ length: Math.min(32, totalChunks - offset) }, (_, i) =>
                fsp.rm(path.join(staging, String(offset + i)), { force: true })));
        }
        invalidateFolderSizeCache(target);
        return NextResponse.json({ message: 'Uploaded', complete: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return jsonError('Upload is being finalized; retry shortly', 409);
        if ((error as Error).message === 'Upload metadata changed') return jsonError('Upload metadata changed', 409);
        if ((error as Error).message === 'Incomplete upload' || (error as NodeJS.ErrnoException).code === 'ENOENT') return jsonError('Upload is incomplete; retry missing chunks', 400);
        console.error('Upload error:', error);
        return jsonError('Upload failed', 500);
    }
}

export async function DELETE(req: Request) {
    const user = await uploadUser();
    if (!user) return jsonError('Unauthorized', 401);
    if (!user.is_admin && !user.can_upload) return jsonError('Forbidden', 403);
    const identifier = new URL(req.url).searchParams.get('identifier');
    if (!validId(identifier)) return jsonError('Invalid upload identifier', 400);
    await fsp.rm(path.join(tempRoot, `${user.id}-${identifier}`), { recursive: true, force: true });
    return NextResponse.json({ message: 'Upload staging removed' });
}
