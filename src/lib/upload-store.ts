import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { randomUUID } from 'node:crypto';

export interface UploadMetadata {
    target: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
}

export async function prepareUpload(directory: string, metadata: UploadMetadata) {
    await fsp.mkdir(directory, { recursive: true });
    // Publish metadata atomically; parallel first chunks see a complete manifest.
    const temporary = path.join(directory, `${randomUUID()}.manifest`);
    await fsp.writeFile(temporary, JSON.stringify(metadata));
    const manifest = path.join(directory, 'manifest.json');
    try {
        await fsp.link(temporary, manifest);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
        await fsp.rm(temporary, { force: true });
    }
    const saved = JSON.parse(await fsp.readFile(manifest, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(metadata)) throw new Error('Upload metadata changed');
}

export async function writeChunk(directory: string, index: number, file: File) {
    const temporary = path.join(directory, `${index}.${randomUUID()}.part`);
    try {
        await pipeline(
            Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
            fs.createWriteStream(temporary, { flags: 'wx' }),
        );
        await fsp.rename(temporary, path.join(directory, String(index)));
    } finally {
        await fsp.rm(temporary, { force: true });
    }
}

export async function mergeUpload(directory: string, destination: string, metadata: UploadMetadata) {
    const lock = await fsp.open(path.join(directory, '.merge.lock'), 'wx');
    const temporary = path.join(directory, 'merged.part');
    try {
        const output = fs.createWriteStream(temporary);
        try {
            for (let index = 0; index < metadata.totalChunks; index++) {
                const chunk = path.join(directory, String(index));
                const expected = Math.min(metadata.chunkSize, metadata.fileSize - index * metadata.chunkSize);
                if ((await fsp.stat(chunk)).size !== expected) throw new Error('Incomplete upload');
                await pipeline(fs.createReadStream(chunk), output, { end: false });
            }
            await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()));
        } catch (error) {
            output.destroy();
            throw error;
        }
        // Keep the previous file intact until every chunk is verified and merged.
        await fsp.rename(temporary, destination);
    } finally {
        await lock.close();
        await fsp.rm(path.join(directory, '.merge.lock'), { force: true });
        await fsp.rm(temporary, { force: true });
    }
}
