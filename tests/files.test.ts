import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readDirectory } from '../src/lib/directory';
import { prepareUpload, writeChunk, mergeUpload, type UploadMetadata } from '../src/lib/upload-store';
import { serveFileWithRangeSupport } from '../src/lib/fileResponses';

async function fixture(run: (root: string) => Promise<void>) {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'file-server-test-'));
    try { await run(root); } finally { await fsp.rm(root, { recursive: true, force: true }); }
}

test('listing inspects immediate children only, bounds concurrency, and skips vanished/escaped entries', async () => fixture(async root => {
    await fsp.mkdir(path.join(root, 'nested', 'deeper'), { recursive: true });
    await fsp.writeFile(path.join(root, 'nested', 'deeper', 'hidden.txt'), 'nested');
    await Promise.all(Array.from({ length: 130 }, (_, i) => fsp.writeFile(path.join(root, `${i}.txt`), 'data')));
    await fsp.writeFile(path.join(root, 'escaped'), 'not allowed');
    await fsp.writeFile(path.join(root, 'vanished'), 'removed');
    let active = 0, max = 0, calls = 0;
    const files = await readDirectory(root, async name => {
        calls++;
        max = Math.max(max, ++active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active--;
        if (name === 'escaped') return null;
        if (name === 'vanished') return path.join(root, 'missing');
        return path.join(root, name);
    });
    assert.equal(calls, 133);
    assert.ok(max <= 32);
    assert.equal(files.length, 131);
    assert.equal(files.find(f => f.name === 'nested')?.size, null);
    assert.equal(files.find(f => f.name === '1.txt')?.mimetype, 'text/plain');
    assert.equal(files.find(f => f.name === '1.txt')?.size, 4);
}));

test('parallel chunk staging has immutable metadata and merges in order', async () => fixture(async root => {
    const directory = path.join(root, 'upload');
    const metadata: UploadMetadata = { target: 'public', fileName: 'file.txt', fileSize: 9, chunkSize: 3, totalChunks: 3 };
    await Promise.all(Array.from({ length: 3 }, () => prepareUpload(directory, metadata)));
    await assert.rejects(prepareUpload(directory, { ...metadata, target: 'private' }), /metadata changed/);
    await Promise.all(['abc', 'def', 'ghi'].map((value, i) => writeChunk(directory, i, new File([value], 'chunk'))));
    await mergeUpload(directory, path.join(root, 'file.txt'), metadata);
    assert.equal(await fsp.readFile(path.join(root, 'file.txt'), 'utf8'), 'abcdefghi');
}));

test('empty files merge and incomplete uploads preserve the previous destination', async () => fixture(async root => {
    const directory = path.join(root, 'upload');
    const destination = path.join(root, 'file.txt');
    const metadata = { target: 'public', fileName: 'file.txt', fileSize: 0, chunkSize: 5, totalChunks: 1 };
    await prepareUpload(directory, metadata);
    await writeChunk(directory, 0, new File([], 'empty'));
    await mergeUpload(directory, destination, metadata);
    assert.equal((await fsp.stat(destination)).size, 0);
    await fsp.writeFile(destination, 'original');
    await assert.rejects(mergeUpload(directory, destination, { ...metadata, fileSize: 3 }), /Incomplete/);
    assert.equal(await fsp.readFile(destination, 'utf8'), 'original');
    await fsp.writeFile(path.join(directory, '0'), 'abc');
    await mergeUpload(directory, destination, { ...metadata, fileSize: 3 });
    assert.equal(await fsp.readFile(destination, 'utf8'), 'abc');
}));

test('streamed responses handle ranges, validators, HEAD, unsafe types and Unicode names', async () => fixture(async root => {
    const file = path.join(root, 'résumé.txt');
    await fsp.writeFile(file, '0123456789');
    const request = (headers = {}, method = 'GET') => new Request('http://localhost/file', { headers, method });
    const full = await serveFileWithRangeSupport(request(), file);
    assert.equal(await full.text(), '0123456789');
    assert.match(full.headers.get('content-disposition')!, /filename\*=UTF-8''/);
    const etag = full.headers.get('etag')!;
    assert.equal((await serveFileWithRangeSupport(request({ 'if-none-match': `W/${etag}` }), file)).status, 304);
    assert.equal((await serveFileWithRangeSupport(request({ 'if-modified-since': full.headers.get('last-modified')! }), file)).status, 304);
    for (const [range, body] of [['bytes=2-4', '234'], ['bytes=-3', '789'], ['bytes=8-', '89']]) {
        const response = await serveFileWithRangeSupport(request({ range }), file);
        assert.equal(response.status, 206);
        assert.equal(await response.text(), body);
    }
    assert.equal((await serveFileWithRangeSupport(request({ range: 'bytes=99-' }), file)).status, 416);
    const stale = await serveFileWithRangeSupport(request({ range: 'bytes=2-4', 'if-range': '"stale"' }), file);
    assert.equal(stale.status, 200);
    assert.equal(await stale.text(), '0123456789');
    const head = await serveFileWithRangeSupport(request({}, 'HEAD'), file);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(head.body, null);
    const html = path.join(root, 'page.html');
    await fsp.writeFile(html, '<script>alert(1)</script>');
    const unsafe = await serveFileWithRangeSupport(request(), html);
    assert.match(unsafe.headers.get('content-disposition')!, /^attachment/);
    await unsafe.body?.cancel();
}));
