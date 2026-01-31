import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import db, { getSetting, getCachedFolderSize, setCachedFolderSize, invalidateFolderSizeCache } from './db';

export { invalidateFolderSizeCache };

const filesRoot = path.join(process.cwd(), 'files');
const resolvedFilesRoot = path.resolve(filesRoot);

/** Returns true if relativePath has no path traversal and resolves under filesRoot. */
export function isPathUnderRoot(relativePath: string): boolean {
    if (typeof relativePath !== 'string' || relativePath.includes('..')) return false;
    const resolved = path.resolve(filesRoot, relativePath);
    return resolved === resolvedFilesRoot || resolved.startsWith(resolvedFilesRoot + path.sep);
}

/** Resolved absolute path under filesRoot, or null if invalid (path traversal). */
export function getResolvedAbsPath(relativePath: string): string | null {
    if (!isPathUnderRoot(relativePath)) return null;
    return path.resolve(filesRoot, relativePath);
}

// Ensure filesRoot includes public/private
['public', 'private'].forEach(dir => {
    if (!fs.existsSync(path.join(filesRoot, dir))) {
        fs.mkdirSync(path.join(filesRoot, dir), { recursive: true });
    }
});

export interface FileItem {
    name: string;
    isDirectory: boolean;
    size: number;
    mimetype: string;
    modified: string;
}

/** Recursively compute total size of a directory (files only). */
async function getDirectorySizeRecursive(absPath: string): Promise<number> {
    const names = await fsp.readdir(absPath);
    let total = 0;
    for (const name of names) {
        const entryPath = path.join(absPath, name);
        const stat = await fsp.stat(entryPath);
        if (stat.isDirectory()) {
            total += await getDirectorySizeRecursive(entryPath);
        } else {
            total += stat.size;
        }
    }
    return total;
}

/** Get folder size from cache or compute and cache it. Relative path is under files root. */
async function getFolderSizeCached(relativePath: string): Promise<number> {
    const cached = getCachedFolderSize(relativePath);
    if (cached !== null) return cached;
    const absPath = path.resolve(filesRoot, relativePath);
    const size = await getDirectorySizeRecursive(absPath);
    setCachedFolderSize(relativePath, size);
    return size;
}

export async function listFiles(pathSegments: string[], session: any, password?: string | null) {
    const requestedPath = pathSegments.join('/');

    // Basic Traversal Check
    if (requestedPath.includes('..')) {
        throw new Error("Access denied");
    }

    // Access Control
    if (requestedPath.startsWith('private')) {
        const privatePassword = getSetting('private_password');
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
        if (privatePassword && password === privatePassword) {
            hasAccess = true;
        }
        
        if (!hasAccess) {
            // If logged in but no permissions, throw a different error
            if (session) {
                throw new Error("No permissions");
            } else {
                throw new Error("Unauthorized");
            }
        }
    } else if (!requestedPath.startsWith('public') && requestedPath !== "") {
        if (!session && requestedPath !== "") throw new Error("Unauthorized");
    }

    const absPath = path.resolve(filesRoot, requestedPath);
    if (absPath !== resolvedFilesRoot && !absPath.startsWith(resolvedFilesRoot + path.sep)) {
        throw new Error("Access denied");
    }

    let stat: fs.Stats;
    try {
        stat = await fsp.stat(absPath);
    } catch {
        throw new Error("Not found");
    }

    if (stat.isDirectory()) {
        const names = await fsp.readdir(absPath);
        const files = await Promise.all(
            names.map(async (file) => {
                const filePath = path.join(absPath, file);
                const fileStat = await fsp.stat(filePath);
                const relPath = requestedPath ? `${requestedPath}/${file}` : file;
                const size = fileStat.isDirectory()
                    ? await getFolderSizeCached(relPath)
                    : fileStat.size;
                return {
                    name: file,
                    isDirectory: fileStat.isDirectory(),
                    size,
                    mimetype: mime.lookup(file) || 'application/octet-stream',
                    modified: fileStat.mtime.toISOString(),
                };
            })
        );
        return { path: requestedPath, files };
    } else {
        throw new Error("Not a directory");
    }
}

export function getAbsPath(pathSegments: string[]) {
    const requestedPath = pathSegments.join('/');
    if (requestedPath.includes('..')) return null;
    const absPath = path.resolve(filesRoot, requestedPath);
    if (absPath !== resolvedFilesRoot && !absPath.startsWith(resolvedFilesRoot + path.sep)) {
        return null;
    }
    return absPath;
}
