import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

// Requires `npm run build`. Every write uses an isolated temporary database/files root.
test('production API works with isolated files and permissions', async t => {
    const project = process.cwd();
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'file-server-api-'));
    const secret = 'disposable-integration-fixture-secret';
    // Match production: files itself and both managed roots can be symlinks.
    await fsp.mkdir(path.join(root, 'storage/file-server'), { recursive: true });
    await fsp.mkdir(path.join(root, 'storage/nas/public'), { recursive: true });
    await fsp.mkdir(path.join(root, 'storage/nas/private'), { recursive: true });
    await fsp.symlink(path.join(root, 'storage/file-server'), path.join(root, 'files'));
    await fsp.symlink('../nas/public', path.join(root, 'files/public'));
    await fsp.symlink('../nas/private', path.join(root, 'files/private'));
    await fsp.mkdir(path.join(root, 'database'));
    for (const name of ['.next', 'node_modules']) await fsp.symlink(path.join(project, name), path.join(root, name));
    for (const name of ['package.json', 'next.config.ts']) await fsp.copyFile(path.join(project, name), path.join(root, name));
    const db = new Database(path.join(root, 'database/users.sqlite'));
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        can_upload INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0, can_access_private INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO users (id, username, password, is_admin) VALUES (1, 'admin', 'unused', 1);
        INSERT INTO users (id, username, password) VALUES (2, 'reader', 'unused');`);
    db.close();
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, [path.join(project, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
        cwd: root, env: { ...process.env, JWT_SECRET: secret, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    server.stdout.on('data', data => { output += data; });
    server.stderr.on('data', data => { output += data; });
    const admin = jwt.sign({ id: 1, username: 'admin' }, secret);
    const reader = jwt.sign({ id: 2, username: 'reader' }, secret);
    const request = (url: string, options: RequestInit = {}, token: string | null = admin) => fetch(origin + url, {
        ...options, redirect: 'manual', headers: { ...options.headers, ...(token ? { cookie: `token=${token}` } : {}) },
    });
    const json = (url: string, body: unknown, token = admin) => request(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, token);
    try {
        let ready = false;
        for (let i = 0; i < 200; i++) {
            if (server.exitCode !== null) throw new Error(output);
            try { if ((await request('/api/files/public')).ok) { ready = true; break; } } catch { /* starting */ }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.ok(ready, output);
        await t.test('folder creation validates permissions, collisions and traversal', async () => {
            assert.equal((await request('/api/files/private', {}, null)).status, 401);
            assert.equal((await request('/api/files/private', {}, reader)).status, 403);
            assert.equal((await json('/api/folders', { path: 'public', name: 'forbidden' }, reader)).status, 403);
            assert.equal((await json('/api/folders', { path: 'public', name: 'new-folder' })).status, 201);
            assert.equal((await json('/api/folders', { path: 'public', name: 'new-folder' })).status, 409);
            assert.equal((await json('/api/folders', { path: 'public', name: '../escape' })).status, 400);
        });
        await t.test('concurrent chunks finalize once and survive a retried finalize', async () => {
            const id = crypto.randomUUID();
            const form = (index: number, finalize = false) => {
                const data = new FormData();
                Object.entries({ identifier: id, fileName: 'multipart.txt', fileSize: 9, chunkSize: 3, totalChunks: 3 })
                    .forEach(([key, value]) => data.append(key, String(value)));
                if (finalize) data.append('finalize', 'true');
                else { data.append('chunkIndex', String(index)); data.append('deferMerge', 'true'); data.append('file', new Blob([['abc', 'def', 'ghi'][index]])); }
                return data;
            };
            const responses = await Promise.all([2, 0, 1].map(index => request('/api/upload?path=public', { method: 'POST', body: form(index) })));
            assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
            for (let i = 0; i < 2; i++) assert.equal((await request('/api/upload?path=public', { method: 'POST', body: form(0, true) })).status, 200);
            assert.equal(await fsp.readFile(path.join(root, 'files/public/multipart.txt'), 'utf8'), 'abcdefghi');
            assert.equal((await request(`/api/upload?identifier=${id}`, { method: 'DELETE' })).status, 200);
            const bad = form(0); bad.set('file', new Blob(['x']));
            assert.equal((await request('/api/upload?path=public', { method: 'POST', body: bad })).status, 400);
            assert.equal((await request('/api/upload?path=private', { method: 'POST', body: form(0) }, reader)).status, 403);
        });
        await t.test('empty files, media ranges and cache validators work over HTTP', async () => {
            const empty = new FormData(); empty.append('file', new Blob([]), 'empty.txt');
            assert.equal((await request('/api/upload?path=public', { method: 'POST', body: empty })).status, 200);
            assert.equal((await fsp.stat(path.join(root, 'files/public/empty.txt'))).size, 0);
            const response = await request('/api/files/public/multipart.txt', { headers: { range: 'bytes=3-5' } });
            assert.equal(response.status, 206); assert.equal(await response.text(), 'def');
            assert.equal((await request('/api/files/public/multipart.txt', { headers: { 'if-none-match': response.headers.get('etag')! } })).status, 304);
            const listing = await request('/api/files/public');
            assert.equal(listing.headers.get('cache-control'), 'private, no-store');
        });
        await t.test('internal staging cannot be downloaded through file routes', async () => {
            const internal = path.join(root, 'files/.temp-uploads/probe');
            await fsp.mkdir(internal, { recursive: true });
            await fsp.writeFile(path.join(internal, 'chunk.txt'), 'private staging fixture');
            assert.equal((await request('/api/files/.temp-uploads/probe/chunk.txt', {}, null)).status, 403);
            assert.equal((await request('/files/.temp-uploads/probe/chunk.txt', {}, null)).status, 400);
        });
        await t.test('rename/delete work and escaped symlinks are refused', async () => {
            assert.equal((await json('/api/rename', { oldPath: 'public/multipart.txt', newName: 'renamed.txt' })).status, 200);
            assert.equal((await json('/api/delete', { path: 'public/renamed.txt' })).status, 200);
            await fsp.writeFile(path.join(root, 'files/private/secret.txt'), 'private fixture');
            await fsp.symlink(path.join(root, 'files/private/secret.txt'), path.join(root, 'files/public/cross-root.txt'));
            assert.equal((await request('/api/files/public/cross-root.txt', {}, null)).status, 403);
            await fsp.symlink(os.tmpdir(), path.join(root, 'files/public/outside'));
            assert.equal((await json('/api/folders', { path: 'public/outside', name: 'must-not-exist' })).status, 404);
            assert.equal((await json('/api/delete', { path: 'public/outside/must-not-exist' })).status, 400);
        });
    } finally {
        if (server.exitCode === null) {
            const closed = once(server, 'exit');
            server.kill('SIGTERM');
            await closed;
        }
        await fsp.rm(root, { recursive: true, force: true });
    }
});
