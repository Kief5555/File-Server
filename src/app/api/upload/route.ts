import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/auth';

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
        const fileName = formData.get('fileName') as string || file?.name;

        if (!file && isNaN(chunkIndex)) return NextResponse.json({ message: "No file" }, { status: 400 });

        if (targetPathQuery.includes('..')) return NextResponse.json({ message: "Invalid path" }, { status: 403 });

        const targetDir = path.join(filesRoot, targetPathQuery);
        if (!targetDir.startsWith(filesRoot)) return NextResponse.json({ message: "Access denied" }, { status: 403 });

        if (!fs.existsSync(targetDir)) {
            return NextResponse.json({ message: "Target directory not found" }, { status: 404 });
        }

        const filePath = path.join(targetDir, fileName);

        // Handle chunked upload
        if (!isNaN(chunkIndex) && !isNaN(totalChunks) && identifier) {
            const chunkDir = path.join(tempRoot, identifier);
            if (!fs.existsSync(chunkDir)) {
                fs.mkdirSync(chunkDir, { recursive: true });
            }

            const chunkPath = path.join(chunkDir, chunkIndex.toString());
            const buffer = Buffer.from(await file.arrayBuffer());
            fs.writeFileSync(chunkPath, buffer);

            // If it's the last chunk, merge them
            if (chunkIndex === totalChunks - 1) {
                // Ensure file is empty/fresh if it already exists from a previous partial attempt
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                for (let i = 0; i < totalChunks; i++) {
                    const p = path.join(chunkDir, i.toString());
                    if (!fs.existsSync(p)) {
                        return NextResponse.json({ message: `Chunk ${i} missing` }, { status: 400 });
                    }
                    const data = fs.readFileSync(p);
                    fs.appendFileSync(filePath, data);
                    fs.unlinkSync(p);
                }
                // Clean up temp dir
                fs.rmdirSync(chunkDir);
                return NextResponse.json({ message: "Uploaded and merged" });
            }

            return NextResponse.json({ message: `Chunk ${chunkIndex} received` });
        }

        // Handle standard upload (fallback)
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({ message: "Uploaded" });
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
