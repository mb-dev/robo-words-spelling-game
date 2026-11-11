import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let proc: ChildProcess, base = '', dir = '';
const DAY = 864e5;
const freePort = () => new Promise<number>(res => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const post = (body: string, type = 'application/json') => fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': type }, body });
const ev = (type: string, extra: object = {}) => ({ t: Date.now(), type, ...extra });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'robo-events-'));
  const db = join(dir, 'test.sqlite3');
  // An old event and a recent one are already there: startup must delete only the old one.
  const pre = new DatabaseSync(db);
  pre.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, t INTEGER NOT NULL, device TEXT, who TEXT, session TEXT, type TEXT NOT NULL, data TEXT)');
  pre.prepare('INSERT INTO events (t, type) VALUES (?, ?), (?, ?)').run(Date.now() - 100 * DAY, 'ancient', Date.now() - 80 * DAY, 'recent');
  pre.close();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [join(import.meta.dirname, '..', 'server.mjs'), '--port', String(port), '--db', db], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((ok, no) => { proc.stdout!.on('data', d => { if (String(d).includes('Robo Words on')) ok(); }); proc.on('exit', () => no(new Error('server exited'))); });
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('startup deletes events older than 90 days', async () => {
  const { events } = await (await fetch(`${base}/api/events?limit=10`)).json() as { events: { type: string }[] };
  assert.deepEqual(events.map(e => e.type), ['recent']);
});

test('post and read back, newest first, data parsed, filters work', async () => {
  const t = Date.now();
  const res = await post(JSON.stringify({ device: 'ipad-3f9a2c', events: [
    { t: t - 3000, who: 'younger', session: 's1', type: 'word_start', data: { word: 'cat' } },
    { t: t - 2000, who: 'older', type: 'hint', data: { n: 1 } },
    { t: t - 1000, who: 'younger', type: 'word_end', data: { word: 'cat', ms: 4200, correct: true } },
  ] }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, n: 3 });
  const all = (await (await fetch(`${base}/api/events?type=word_end`)).json() as { events: { device: string; who: string; data: { ms: number } }[] }).events;
  assert.equal(all.length, 1); assert.equal(all[0].device, 'ipad-3f9a2c'); assert.equal(all[0].data.ms, 4200);
  const mine = (await (await fetch(`${base}/api/events?who=younger&device=ipad-3f9a2c&since=${t - 5000}`)).json() as { events: { type: string }[] }).events;
  assert.deepEqual(mine.map(e => e.type), ['word_end', 'word_start']);
  const one = (await (await fetch(`${base}/api/events?who=younger&limit=1`)).json() as { events: unknown[] }).events;
  assert.equal(one.length, 1);
  assert.equal((await fetch(`${base}/api/events?limit=abc`)).status, 400);
});

test('text/plain bodies are accepted (sendBeacon)', async () => {
  const res = await post(JSON.stringify({ device: 'mac-aaaaaa', events: [ev('beacon_test')] }), 'text/plain;charset=UTF-8');
  assert.equal(res.status, 200);
  const { events } = await (await fetch(`${base}/api/events?type=beacon_test`)).json() as { events: unknown[] };
  assert.equal(events.length, 1);
});

test('malformed and oversize posts are rejected and store nothing', async () => {
  const count = async () => ((await (await fetch(`${base}/api/events?limit=5000`)).json()) as { events: unknown[] }).events.length;
  const before = await count();
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post(JSON.stringify({ device: 'x', events: 'no' }))).status, 400);
  assert.equal((await post(JSON.stringify({ device: 'x', events: [ev('ok'), { t: 'soon', type: 'bad' }] }))).status, 400); // one bad event rejects the post
  assert.equal((await post(JSON.stringify({ device: 'x', events: [{ t: 1 }] }))).status, 400);
  assert.equal((await post(JSON.stringify({ device: 'x', events: [ev('big', { data: { s: 'x'.repeat(9000) } })] }))).status, 400);
  assert.equal((await post(JSON.stringify({ device: 'x', events: Array.from({ length: 501 }, () => ev('many')) }))).status, 400);
  assert.equal((await post(JSON.stringify({ device: 'x', events: [ev('pad', { data: { s: 'x'.repeat(7000) } })].concat(Array.from({ length: 40 }, () => ev('pad', { data: { s: 'x'.repeat(7000) } }))) }))).status, 413);
  assert.equal(await count(), before);
  const full = await post(JSON.stringify({ device: 'x', events: Array.from({ length: 500 }, () => ev('limit')) }));
  assert.equal(full.status, 200); assert.equal((await full.json() as { n: number }).n, 500);
});

test('cross-origin posts are refused', async () => {
  const res = await fetch(`${base}/api/events`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'text/plain' }, body: JSON.stringify({ events: [] }) });
  assert.equal(res.status, 403);
});
