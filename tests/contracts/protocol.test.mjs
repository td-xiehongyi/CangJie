import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const clientFile = resolve(root, 'apps/host/dist/core/client.js');
const envelope = (kind = 'start', payload = {}) => ({ schemaVersion: 1, messageId: crypto.randomUUID(), runId: '运行 甲', kind, payload });
async function makeClient(t, options = {}) {
  assert.ok(existsSync(clientFile), 'T0 compiled CoreClient must exist');
  const { CoreClient } = await import(pathToFileURL(clientFile).href);
  const { coreCommand } = await import('../../scripts/toolchain.mjs');
  const client = new CoreClient({ ...coreCommand(), timeoutMs: 2000, ...options });
  t.after(() => client.close());
  return client;
}

test('protocol_utf8_roundtrip: real core preserves Chinese, spaces and nested JSON', async t => {
  const client = await makeClient(t);
  const payload = { operation: 'echo', path: 'C:\\测试 目录\\项目', text: '换行\n引号"与😀', values: [null, false, 42, { title: '工单' }] };
  const request = envelope('start', payload);
  const events = await client.send(request);
  assert.equal(events.length, 1);
  assert.equal(events[0].messageId, request.messageId);
  assert.equal(events[0].runId, '运行 甲');
  assert.equal(events[0].kind, 'event');
  assert.equal(events[0].payload.status, 'completed');
  assert.deepEqual(events[0].payload.data, payload);
});

test('reject_version: core rejects unknown version and remains usable', async t => {
  const client = await makeClient(t);
  const result = await client.send({ ...envelope(), schemaVersion: 99 });
  assert.equal(result[0].payload.code, 'UNSUPPORTED_VERSION');
  assert.equal(result[0].payload.status, 'error');
  assert.equal((await client.send(envelope()))[0].payload.status, 'completed');
});

test('cancel_and_exit: pending run cancels with terminal events', async t => {
  const client = await makeClient(t);
  const start = envelope('start', { operation: 'wait' });
  const pending = client.send(start);
  const cancelled = await client.send(envelope('cancel'));
  assert.equal((await pending).at(-1).payload.status, 'cancelled');
  assert.equal(cancelled.at(-1).payload.status, 'cancelled');
  await client.close();
  await assert.rejects(client.send(envelope()), /closed/i);
});

test('core exit rejects pending request without hanging', async t => {
  const client = await makeClient(t);
  const pending = client.send(envelope('start', { operation: 'wait' }));
  const rejection = assert.rejects(pending, /closed|exit/i);
  await client.close();
  await rejection;
});

test('timeout terminates unresponsive core and settles pending request', async t => {
  const client = await makeClient(t, { timeoutMs: 300 });
  await assert.rejects(client.send(envelope('start', { operation: 'wait' })), /timeout/i);
});

test('stdout logs are protocol errors, stderr logs are separate', async t => {
  const client = await makeClient(t, { executable: process.execPath, args: ['-e', 'process.stdin.once("data",()=>console.log("not JSON"))'] });
  await assert.rejects(client.send(envelope()), /protocol/i);
  const normal = await makeClient(t);
  await normal.send(envelope());
  assert.match(normal.diagnostics, /protocol ready/);
});

test('executable and cwd with Chinese and spaces work without shell quoting', async t => {
  const directory = resolve(root, '.local-tools/通信 测试');
  await mkdir(directory, { recursive: true });
  const executable = resolve(directory, '验证 核心.exe');
  await copyFile(resolve(root, 'apps/core/target/verification-core.exe'), executable);
  const client = await makeClient(t, { executable, cwd: directory });
  assert.equal((await client.send(envelope()))[0].payload.status, 'completed');
});

test('unexpected process exit and missing executable settle promises', async t => {
  const crashed = await makeClient(t, { executable: process.execPath, args: ['-e', 'process.stdin.once("data",()=>process.exit(7))'] });
  await assert.rejects(crashed.send(envelope()), /exit/i);
  const missing = await makeClient(t, { executable: resolve(root, '.local-tools/missing-core.exe') });
  await assert.rejects(missing.send(envelope()), /ENOENT/i);
});

test('unknown kind and operation do not execute', async t => {
  const client = await makeClient(t);
  assert.equal((await client.send(envelope('execute-shell')))[0].payload.code, 'UNKNOWN_KIND');
  assert.equal((await client.send(envelope('start', { operation: 'shell' })))[0].payload.code, 'UNKNOWN_OPERATION');
});

test('JSONL chunking preserves correlation and rejects wrong run identity', async t => {
  const peer = 'process.stdin.once("data",s=>{const m=JSON.parse(s);m.kind="event";m.payload={status:"completed"};const s2=JSON.stringify(m)+"\\n";process.stdout.write(s2.slice(0,17));setTimeout(()=>process.stdout.write(s2.slice(17)),20)})';
  const chunked = await makeClient(t, { executable: process.execPath, args: ['-e', peer] });
  assert.equal((await chunked.send(envelope()))[0].payload.status, 'completed');
  const invalid = await makeClient(t, { executable: process.execPath, args: ['-e', peer.replace('m.kind="event";', 'm.kind="event";m.runId="wrong";')] });
  await assert.rejects(invalid.send(envelope()), /protocol/i);
});

test('near-limit real echo survives response envelope and JSON escaping overhead', async t => {
  const client = await makeClient(t, { timeoutMs: 5000 });
  const request = envelope('start', { operation: 'echo', text: '<'.repeat(1024 * 1024 - 155) });
  assert.ok(Buffer.byteLength(JSON.stringify(request) + '\n') < 1024 * 1024);
  const result = await client.send(request);
  assert.equal(result[0].payload.data.text, request.payload.text);
  assert.equal((await client.send(envelope()))[0].payload.status, 'completed');
});

test('oversized input is rejected without closing the usable core', async t => {
  const client = await makeClient(t);
  await assert.rejects(client.send(envelope('start', { text: 'x'.repeat(1024 * 1024) })), /exceeds 1 MiB/);
  assert.equal((await client.send(envelope()))[0].payload.status, 'completed');
});

test('oversized output terminates the peer and settles pending requests', async t => {
  const client = await makeClient(t, { executable: process.execPath, args: ['-e', 'process.stdin.once("data",()=>process.stdout.write("x".repeat(8*1024*1024+1)))'] });
  await assert.rejects(client.send(envelope()), /exceeds 8 MiB/);
});

test('multiple large valid event frames are processed independently', async t => {
  const peer = 'process.stdin.once("data",s=>{const m=JSON.parse(s);m.kind="event";m.payload={status:"running",data:"x".repeat(5*1024*1024)};const first=JSON.stringify(m);m.payload.status="completed";process.stdout.write(first+"\\n"+JSON.stringify(m)+"\\n")})';
  const client = await makeClient(t, { executable: process.execPath, args: ['-e', peer], timeoutMs: 5000 });
  const events = await client.send(envelope());
  assert.deepEqual(events.map(event => event.payload.status), ['running', 'completed']);
});
