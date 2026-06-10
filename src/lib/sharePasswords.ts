import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$'];

export function isHashedSharePassword(password: string): boolean {
    return BCRYPT_PREFIXES.some((prefix) => password.startsWith(prefix));
}

export async function hashSharePassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

function timingSafeStringEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function verifySharePassword(storedPassword: string | null | undefined, providedPassword: unknown): Promise<boolean> {
    if (!storedPassword) return true;
    if (typeof providedPassword !== 'string') return false;

    if (isHashedSharePassword(storedPassword)) {
        return bcrypt.compare(providedPassword, storedPassword);
    }

    return timingSafeStringEqual(storedPassword, providedPassword);
}
