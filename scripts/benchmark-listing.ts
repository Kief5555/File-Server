import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readDirectory } from '../src/lib/directory';

// Compare the previous uncached recursive-size path with immediate-child listing.
async function recursiveSize(directory: string): Promise<number> {
    let size = 0;
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        size += entry.isDirectory() ? await recursiveSize(child) : (await fsp.stat(child)).size;
    }
    return size;
}
async function main() {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'listing-benchmark-'));
    try {
        for (let i = 0; i < 12; i++) {
            const directory = path.join(root, `folder-${i}`);
            await fsp.mkdir(directory);
            await Promise.all(Array.from({ length: 200 }, (_, j) => fsp.writeFile(path.join(directory, `${j}.txt`), 'fixture')));
        }
        const measure = async (run: () => Promise<unknown>) => {
            const times = [];
            for (let i = 0; i < 5; i++) { const start = performance.now(); await run(); times.push(performance.now() - start); }
            return times.sort((a, b) => a - b)[2];
        };
        const before = await measure(async () => Promise.all((await fsp.readdir(root)).map(name => recursiveSize(path.join(root, name)))));
        const after = await measure(() => readDirectory(root, name => fsp.realpath(path.join(root, name))));
        console.log(JSON.stringify({ fixture: '12 folders, 2400 nested files; uncached folder sizes; median of 5 runs', beforeMs: +before.toFixed(2), afterMs: +after.toFixed(2), speedup: +(before / after).toFixed(1) }, null, 2));
    } finally { await fsp.rm(root, { recursive: true, force: true }); }
}
void main();
