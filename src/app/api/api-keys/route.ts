import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateApiKey, hashApiKey } from '@/lib/auth';

function isSqliteUniqueError(error: unknown): error is { code: string } {
    return typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

// Get all API keys for the current user
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const apiKeys = db.prepare(`
        SELECT id, name, last_used_at, created_at 
        FROM api_keys 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `).all(session.id);

    return NextResponse.json(apiKeys);
}

// Create a new API key
export async function POST(req: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name } = await req.json();
        
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);

        db.prepare(`
            INSERT INTO api_keys (user_id, key_hash, name) 
            VALUES (?, ?, ?)
        `).run(session.id, keyHash, name || null);

        // Return the API key only once (it won't be shown again)
        return NextResponse.json({ 
            apiKey,
            message: "API key created. Save this key now - it won't be shown again." 
        });
    } catch (error: unknown) {
        if (isSqliteUniqueError(error)) {
            return NextResponse.json({ message: "API key already exists" }, { status: 409 });
        }
        return NextResponse.json({ message: "Error creating API key" }, { status: 500 });
    }
}

// Delete an API key
export async function DELETE(req: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await req.json();
        
        // Verify the API key belongs to the user
        const apiKey = db.prepare('SELECT user_id FROM api_keys WHERE id = ?').get(id) as { user_id: number } | undefined;
        if (!apiKey) {
            return NextResponse.json({ message: "API key not found" }, { status: 404 });
        }
        
        if (apiKey.user_id !== session.id) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
        }
        
        db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
        
        return NextResponse.json({ message: "API key deleted" });
    } catch {
        return NextResponse.json({ message: "Error deleting API key" }, { status: 500 });
    }
}
