import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';

const filesRoot = path.join(process.cwd(), 'files');

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const { oldPath, newName } = await req.json();
        if (!oldPath || !newName || oldPath.includes('..') || newName.includes('/') || newName.includes('..')) {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }

        const fullOldPath = path.join(filesRoot, oldPath);
        if (!fullOldPath.startsWith(filesRoot)) return NextResponse.json({ message: "Access denied" }, { status: 403 });

        if (!fs.existsSync(fullOldPath)) return NextResponse.json({ message: "Not found" }, { status: 404 });

        const dir = path.dirname(fullOldPath);
        const fullNewPath = path.join(dir, newName);

        if (!fullNewPath.startsWith(filesRoot)) return NextResponse.json({ message: "Access denied" }, { status: 403 });

        if (fs.existsSync(fullNewPath)) return NextResponse.json({ message: "Already exists" }, { status: 409 });

        fs.renameSync(fullOldPath, fullNewPath);
        return NextResponse.json({ message: "Renamed" });
    } catch (e) {
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
