import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import db, { getSetting } from './db';

const filesRoot = path.join(process.cwd(), 'files');

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

    const absPath = path.join(filesRoot, requestedPath);

    if (!absPath.startsWith(filesRoot)) {
        throw new Error("Access denied");
    }

    if (!fs.existsSync(absPath)) {
        throw new Error("Not found");
    }

    const stat = fs.statSync(absPath);

    if (stat.isDirectory()) {
        const files = fs.readdirSync(absPath).map(file => {
            const filePath = path.join(absPath, file);
            const fileStat = fs.statSync(filePath);
            return {
                name: file,
                isDirectory: fileStat.isDirectory(),
                size: fileStat.size,
                mimetype: mime.lookup(file) || 'application/octet-stream',
                modified: fileStat.mtime.toISOString(),
            };
        });
        return { path: requestedPath, files };
    } else {
        throw new Error("Not a directory");
    }
}

export function getAbsPath(pathSegments: string[]) {
    const requestedPath = pathSegments.join('/');
    const absPath = path.join(filesRoot, requestedPath);
    if (!absPath.startsWith(filesRoot) || requestedPath.includes('..')) {
        return null;
    }
    return absPath;
}
