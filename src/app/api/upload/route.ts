import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getSession } from '@/lib/auth';
import { invalidateFolderSizeCache } from '@/lib/files';

const filesRoot = path.join(process.cwd(), 'files');
const tempRoot = path.join(filesRoot, '.temp-uploads');

// Ensure tempRoot exists
if (!fs.existsSync(tempRoot)) {
    fs.mkdirSync(tempRoot, { recursive: true });
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const targetPathQuery = new URL(req.url).searchParams.get('path') || 'public';

        // Chunk metadata
        const chunkIndex = parseInt(formData.get('chunkIndex') as string);
        const totalChunks = parseInt(formData.get('totalChunks') as string);
        const identifier = formData.get('identifier') as string;
        const rawFileName = formData.get('fileName') as string || file?.name || 'file';
        const fileName = path.basename(String(rawFileName)) || 'file';
        if (fileName === '.' || fileName === '..' || fileName.includes('..')) return NextResponse.json({ message: "Invalid file name" }, { status: 400 });

        if (!file && isNaN(chunkIndex)) return NextResponse.json({ message: "No file" }, { status: 400 });

        if (targetPathQuery.includes('..')) return NextResponse.json({ message: "Invalid path" }, { status: 403 });

        const targetDir = path.resolve(filesRoot, targetPathQuery);
        const resolvedRoot = path.resolve(filesRoot);
        if (targetDir !== resolvedRoot && !targetDir.startsWith(resolvedRoot + path.sep)) {
            return NextResponse.json({ message: "Access denied" }, { status: 403 });
        }

        if (!fs.existsSync(targetDir)) {
            return NextResponse.json({ message: "Target directory not found" }, { status: 404 });
        }

        const filePath = path.join(targetDir, fileName);

        // Handle chunked upload
        if (!isNaN(chunkIndex) && !isNaN(totalChunks) && identifier) {
            const chunkDir = path.join(tempRoot, identifier);
            await fsp.mkdir(chunkDir, { recursive: true });

            const chunkPath = path.join(chunkDir, chunkIndex.toString());
            const buffer = Buffer.from(await file.arrayBuffer());
            await fsp.writeFile(chunkPath, buffer);

            // If it's the last chunk, merge them
            if (chunkIndex === totalChunks - 1) {
                if (fs.existsSync(filePath)) {
                    await fsp.unlink(filePath);
                }

                const writeStream = fs.createWriteStream(filePath, { flags: 'a' });
                for (let i = 0; i < totalChunks; i++) {
                    const p = path.join(chunkDir, i.toString());
                    try {
                        await fsp.access(p);
                    } catch {
                        writeStream.close();
                        return NextResponse.json({ message: `Chunk ${i} missing` }, { status: 400 });
                    }
                    const data = await fsp.readFile(p);
                    await new Promise<void>((resolve, reject) => {
                        writeStream.write(data, (err) => (err ? reject(err) : resolve()));
                    });
                    await fsp.unlink(p);
                }
                await new Promise<void>((resolve, reject) => {
                    writeStream.close((err) => (err ? reject(err) : resolve()));
                });
                await fsp.rmdir(chunkDir);
                invalidateFolderSizeCache(targetPathQuery);
                return NextResponse.json({ message: "Uploaded and merged" });
            }

            return NextResponse.json({ message: `Chunk ${chunkIndex} received` });
        }

        // Handle standard upload (fallback)
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        invalidateFolderSizeCache(targetPathQuery);
        return NextResponse.json({ message: "Uploaded" });
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
