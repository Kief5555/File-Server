import fsp from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';

export interface FileItem {
    name: string;
    isDirectory: boolean;
    /** null means a folder's recursive size has not been calculated. */
    size: number | null;
    mimetype: string;
    modified: string;
}

/** Only inspect immediate children. Bound I/O even for very large directories. */
export async function readDirectory(
    absPath: string,
    resolveEntry: (name: string) => Promise<string | null>,
): Promise<FileItem[]> {
    const names = await fsp.readdir(absPath);
    const results: (FileItem | null)[] = new Array(names.length).fill(null);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(32, names.length) }, async () => {
        while (next < names.length) {
            const index = next++;
            const name = names[index];
            try {
                const resolved = await resolveEntry(name);
                if (!resolved) continue;
                const stat = await fsp.stat(resolved);
                if (!stat.isDirectory() && !stat.isFile()) continue;
                results[index] = {
                    name,
                    isDirectory: stat.isDirectory(),
                    size: stat.isDirectory() ? null : stat.size,
                    mimetype: mime.lookup(path.extname(name)) || 'application/octet-stream',
                    modified: stat.mtime.toISOString(),
                };
            } catch (error) {
                // A removed or unreadable entry must not break the entire folder.
                const code = (error as NodeJS.ErrnoException).code;
                if (!['ENOENT', 'EACCES', 'EPERM'].includes(code || '')) throw error;
            }
        }
    }));
    return results.filter((file): file is FileItem => file !== null);
}
