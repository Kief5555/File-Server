import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { readDirectory } from './directory';
export type { FileItem } from './directory';
import db, { getSetting, invalidateFolderSizeCache } from './db';

export { invalidateFolderSizeCache };

const filesRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), 'files');
const resolvedFilesRoot = path.resolve(filesRoot);

// Ensure filesRoot includes public/private before computing realpath.
if (!fs.existsSync(resolvedFilesRoot)) {
    fs.mkdirSync(resolvedFilesRoot, { recursive: true });
}

['public', 'private'].forEach(dir => {
    if (!fs.existsSync(path.join(/*turbopackIgnore: true*/ filesRoot, dir))) {
        fs.mkdirSync(path.join(/*turbopackIgnore: true*/ filesRoot, dir), { recursive: true });
    }
});

const realFilesRoot = fs.realpathSync(resolvedFilesRoot);
// Public/private may be operator-configured symlinks to separate storage volumes.
// Trust their startup targets, then keep every descendant inside its own root.
const managedRealRoots = new Map(['public', 'private'].map(name => [
    name, fs.realpathSync(path.join(/*turbopackIgnore: true*/ filesRoot, name)),
]));

function isResolvedPathInsideRoot(absPath: string, root: string): boolean {
    const relative = path.relative(root, absPath);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeRelativePath(relativePath: string): string | null {
    if (typeof relativePath !== 'string') return null;
    const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (normalized.split('/').some((segment) => segment === '..')) return null;
    return normalized;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error;
}

/** Returns true if relativePath has no path traversal and resolves under filesRoot. */
export function isPathUnderRoot(relativePath: string): boolean {
    return getResolvedAbsPath(relativePath) !== null;
}

/** Resolved absolute path under filesRoot, or null if invalid (path traversal). */
export function getResolvedAbsPath(relativePath: string): string | null {
    const normalized = normalizeRelativePath(relativePath);
    if (normalized === null) return null;

    const resolved = path.resolve(filesRoot, normalized);
    if (!isResolvedPathInsideRoot(resolved, resolvedFilesRoot)) return null;
    const rootName = path.relative(resolvedFilesRoot, resolved).split(path.sep)[0];
    // Internal upload staging and other service storage are never downloadable.
    if (rootName && rootName !== 'public' && rootName !== 'private') return null;

    return resolved;
}

async function getExistingAbsPathOrThrow(relativePath: string): Promise<string> {
    const absPath = getResolvedAbsPath(relativePath);
    if (!absPath) throw new Error("Access denied");

    try {
        const realPath = await fsp.realpath(/*turbopackIgnore: true*/ absPath);
        const rootName = path.relative(resolvedFilesRoot, absPath).split(path.sep)[0];
        const allowedRoot = managedRealRoots.get(rootName) ?? realFilesRoot;
        if (!isResolvedPathInsideRoot(realPath, allowedRoot)) {
            throw new Error("Access denied");
        }
        return realPath;
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            throw new Error("Not found");
        }
        throw error;
    }
}

/** Existing real path under filesRoot, or null for missing/invalid/escaped paths. */
export async function getSafeExistingAbsPath(relativePath: string): Promise<string | null> {
    try {
        return await getExistingAbsPathOrThrow(relativePath);
    } catch {
        return null;
    }
}

type SessionLike = { id: number };

export async function listFiles(pathSegments: string[], session: SessionLike | null, password?: string | null) {
    const requestedPath = pathSegments.join('/');

    // Basic Traversal Check
    if (!isPathUnderRoot(requestedPath)) {
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

    const absPath = await getExistingAbsPathOrThrow(requestedPath);

    let stat: fs.Stats;
    try {
        stat = await fsp.stat(/*turbopackIgnore: true*/ absPath);
    } catch {
        throw new Error("Not found");
    }

    if (stat.isDirectory()) {
        const files = await readDirectory(absPath, (name) =>
            getSafeExistingAbsPath(requestedPath ? `${requestedPath}/${name}` : name)
        );
        return { path: requestedPath, files };
    } else {
        throw new Error("Not a directory");
    }
}

export function getAbsPath(pathSegments: string[]) {
    return getResolvedAbsPath(pathSegments.join('/'));
}
