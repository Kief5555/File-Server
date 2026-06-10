import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';
import db from './db';
import crypto from 'crypto';

const DEV_SECRET_KEY = crypto.randomBytes(32).toString('base64url');

function getJwtSecret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production.');
    }
    return DEV_SECRET_KEY;
}

export function signToken(payload: object) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string) {
    try {
        return jwt.verify(token, getJwtSecret());
    } catch {
        return null;
    }
}

// Hash API key for storage
export function hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Generate a new API key
export function generateApiKey(): string {
    return `fs_${crypto.randomBytes(32).toString('base64url')}`;
}

// Get session from either JWT cookie or API key
export async function getSession() {
    // First try API key from Authorization header
    try {
        const headersList = await headers();
        const authHeader = headersList.get('authorization');
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const apiKey = authHeader.substring(7);
            const keyHash = hashApiKey(apiKey);
            
            const apiKeyRecord = db.prepare(`
                SELECT user_id, u.id, u.username 
                FROM api_keys ak
                JOIN users u ON ak.user_id = u.id
                WHERE ak.key_hash = ?
            `).get(keyHash) as { user_id: number; id: number; username: string } | undefined;
            
            if (apiKeyRecord) {
                // Update last_used_at
                db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?').run(keyHash);
                return { id: apiKeyRecord.id, username: apiKeyRecord.username };
            }
        }
    } catch {
        // Headers might not be available in all contexts, continue to cookie auth
    }
    
    // Fall back to JWT cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) return null;

    const session = verifyToken(token);
    return session as { id: number; username: string } | null;
}
