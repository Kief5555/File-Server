const CHUNK_SIZE = 5 * 1024 * 1024;

class UploadError extends Error {
    constructor(message: string, public status = 0) { super(message); }
}

function sendChunk(url: string, data: FormData, signal: AbortSignal, onProgress: (bytes: number) => void) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const cleanup = () => signal.removeEventListener('abort', abort);
        xhr.open('POST', url);
        xhr.timeout = 120_000;
        xhr.upload.onprogress = (event) => onProgress(event.loaded);
        xhr.onload = () => {
            cleanup();
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else {
                let message = 'Upload failed';
                try { message = JSON.parse(xhr.responseText).message || message; } catch { /* use fallback */ }
                reject(new UploadError(message, xhr.status));
            }
        };
        xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(new UploadError('Connection interrupted')); };
        xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
        if (signal.aborted) { reject(new DOMException('Upload cancelled', 'AbortError')); return; }
        signal.addEventListener('abort', abort, { once: true });
        xhr.send(data);
    });
}

export async function uploadFile(file: File, target: string, signal: AbortSignal, onProgress: (bytes: number) => void) {
    const identifier = crypto.randomUUID();
    const count = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const url = `/api/upload?path=${encodeURIComponent(target)}`;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) controller.abort();
    const metadata = () => {
        const data = new FormData();
        Object.entries({ identifier, fileName: file.name, fileSize: file.size, chunkSize: CHUNK_SIZE, totalChunks: count })
            .forEach(([key, value]) => data.append(key, String(value)));
        return data;
    };
    let next = 0;
    const progress = new Map<number, number>();
    let totalBytes = 0;
    const report = (index: number, bytes: number) => {
        const nextBytes = Math.min(bytes, Math.min(CHUNK_SIZE, file.size - index * CHUNK_SIZE));
        totalBytes += nextBytes - (progress.get(index) || 0);
        progress.set(index, nextBytes);
        onProgress(totalBytes);
    };
    const workers = Array.from({ length: Math.min(3, count) }, async () => {
        while (next < count) {
            controller.signal.throwIfAborted();
            const index = next++;
            const chunk = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
            const data = metadata();
            data.append('chunkIndex', String(index));
            data.append('deferMerge', 'true');
            data.append('file', chunk);
            for (let attempt = 0; ; attempt++) {
                try {
                    await sendChunk(url, data, controller.signal, bytes => report(index, bytes));
                    report(index, chunk.size);
                    break;
                } catch (error) {
                    report(index, 0);
                    if (controller.signal.aborted || attempt >= 2 || (error instanceof UploadError && error.status > 0 && error.status < 500)) throw error;
                    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
                }
            }
        }
    });
    try {
        await Promise.all(workers);
        controller.signal.throwIfAborted();
        const data = metadata();
        data.append('finalize', 'true');
        // A lost finalize response can be retried using the server's completion receipt.
        for (let attempt = 0; ; attempt++) {
            try {
                const response = await fetch(url, { method: 'POST', body: data, signal: controller.signal });
                const result = await response.json();
                if (!response.ok) throw new UploadError(result.message || 'Could not finish upload', response.status);
                break;
            } catch (error) {
                if (controller.signal.aborted || attempt >= 2 || (error instanceof UploadError && error.status < 500 && error.status !== 409)) throw error;
                await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
            }
        }
    } catch (error) {
        controller.abort();
        await Promise.allSettled(workers);
        throw error;
    } finally {
        signal.removeEventListener('abort', cancel);
        // Clear staged chunks after success, cancellation, or failure.
        await fetch(`/api/upload?identifier=${identifier}`, { method: 'DELETE' }).catch(() => {});
    }
}
