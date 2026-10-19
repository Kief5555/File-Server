import { NextResponse } from 'next/server';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getSession } from '@/lib/auth';
import { getSafeExistingAbsPath } from '@/lib/files';
import db from '@/lib/db';

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const user = db.prepare('SELECT can_upload, can_access_private, is_admin FROM users WHERE id = ?').get(session.id) as {
        can_upload: number; can_access_private: number; is_admin: number;
    } | undefined;
    if (!user || (!user.is_admin && !user.can_upload)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    try {
        const { path: parent, name } = await req.json();
        if (typeof parent !== 'string' || !/^(public|private)(\/|$)/.test(parent) ||
            typeof name !== 'string' || !name.trim() || name === '.' || name === '..' || /[\\/\x00]/.test(name)) {
            return NextResponse.json({ message: 'Invalid folder name or path' }, { status: 400 });
        }
        if (parent.startsWith('private') && !user.is_admin && !user.can_access_private) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        const directory = await getSafeExistingAbsPath(parent);
        if (!directory) return NextResponse.json({ message: 'Folder not found' }, { status: 404 });
        await fsp.mkdir(path.join(directory, name));
        return NextResponse.json({ message: 'Folder created' }, { status: 201 });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return NextResponse.json({ message: 'A file or folder with that name already exists' }, { status: 409 });
        return NextResponse.json({ message: 'Could not create folder' }, { status: 400 });
    }
}
