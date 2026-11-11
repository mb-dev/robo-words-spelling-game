import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLadder } from '../tools/manifest.js';
import { applyPlacement, MAX_PROFILES, modeFor, newProfile, newProfileId, rungState } from '../src/engine.js';

const ladder = loadLadder();

test('a new profile has the defaults the create-profile page implies', () => {
  const p = newProfile('sam', 'Sam');
  assert.deepEqual([p.name, p.placed, p.keyboard, p.letterCheck, p.warmupStart], ['Sam', false, false, true, 0]);
  const q = newProfile('alex', 'Alex', { letterCheck: false, warmupStart: 12 });
  assert.deepEqual([q.letterCheck, q.warmupStart], [false, 12]);
});

test('profile ids are URL-safe, never empty and never clash', () => {
  assert.equal(newProfileId('Sam'), 'sam');
  assert.equal(newProfileId('  Mary Ann!  '), 'mary-ann');
  assert.equal(newProfileId('日本'), 'child');
  const taken = ['sam'], again = newProfileId('Sam', taken);
  assert.notEqual(again, 'sam'); assert.match(again, /^sam-[a-z0-9]{3}$/);
  for (const id of [newProfileId('A'.repeat(80)), again]) assert.match(id, /^[a-z0-9_-]{1,40}$/);
  assert.ok(MAX_PROFILES >= 2);
});

test('"check each letter" applies to new levels on the tray, and can be switched off', () => {
  const item = { word: ladder.rungs[0].words[0], rung: 0, review: false };
  const on = newProfile('a', 'A'), off = newProfile('b', 'B', { letterCheck: false });
  assert.equal(modeFor(on, ladder, item, 'mission').feedback, 'letter');
  assert.equal(modeFor(off, ladder, item, 'mission').feedback, 'word');
  assert.equal(modeFor(off, ladder, item, 'mission').input, 'tray');
  // Profiles saved before the option existed have no value: they keep checking each letter.
  const old = newProfile('c', 'C'); delete old.letterCheck;
  assert.equal(modeFor(old, ladder, item, 'mission').feedback, 'letter');
  // Once four words are clean on the level, the whole word is checked at once.
  for (const w of ladder.rungs[0].words.slice(0, 4)) rungState(on, ladder.rungs[0].id).clean.push(w);
  assert.equal(modeFor(on, ladder, item, 'mission').feedback, 'word');
});

test('placement still decides the keyboard, whatever else the profile says', () => {
  const p = newProfile('a', 'A', { letterCheck: false }); applyPlacement(p, 14, ladder);
  assert.equal(p.keyboard, true); assert.equal(p.letterCheck, false);
});

test('together mode works for any two profiles: a mission plan can be built for each', async () => {
  const { planMission } = await import('../src/engine.js');
  const a = newProfile('a', 'A'), b = newProfile('b', 'B'); applyPlacement(a, 2, ladder); applyPlacement(b, 20, ladder);
  for (const p of [a, b]) assert.ok(planMission(p, ladder, Math.random, true).items.length >= 4);
});

let proc: ChildProcess, base = '', dir = '';
const freePort = () => new Promise<number>(res => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const json = (r: Response) => r.json() as Promise<{ profiles?: { id: string; name: string }[]; error?: string }>;
const put = (p: { id: string; name?: unknown }, headers: Record<string, string> = {}) => fetch(`${base}/api/profiles/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(p) });
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'robo-profiles-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [join(import.meta.dirname, '..', 'server.mjs'), '--port', String(port), '--db', join(dir, 'test.sqlite3')], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((ok, no) => { proc.stdout!.on('data', d => { if (String(d).includes('Robo Words on')) ok(); }); proc.on('exit', () => no(new Error('server exited'))); });
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('server: a fresh database has no profiles', async () => {
  assert.deepEqual((await json(await fetch(`${base}/api/profiles`))).profiles, []);
});
test('server: create, rename, list and delete a profile', async () => {
  const sam = newProfile('sam', 'Sam');
  assert.equal((await put(sam)).status, 200);
  assert.equal((await put(newProfile('alex', 'Alex'))).status, 200);
  assert.deepEqual((await json(await fetch(`${base}/api/profiles`))).profiles!.map(p => p.name).sort(), ['Alex', 'Sam']);
  assert.equal((await put({ ...sam, name: 'Samantha' })).status, 200);
  assert.ok((await json(await fetch(`${base}/api/profiles`))).profiles!.some(p => p.name === 'Samantha'));
  assert.equal((await fetch(`${base}/api/profiles/sam`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await json(await fetch(`${base}/api/profiles`))).profiles!.map(p => p.id), ['alex']);
  assert.equal((await fetch(`${base}/api/profiles/sam`, { method: 'DELETE' })).status, 404);
});
test('server: bad profiles and cross-origin writes are refused', async () => {
  assert.equal((await fetch(`${base}/api/profiles/x`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'y', name: 'X' }) })).status, 400);
  assert.equal((await put({ id: 'x', name: 5 })).status, 400);
  assert.equal((await put({ id: 'x', name: 'N'.repeat(41) })).status, 400);
  assert.equal((await put(newProfile('z', 'Z'), { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await fetch(`${base}/api/profiles/alex`, { method: 'DELETE', headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/profiles/Bad%20Id`, { method: 'DELETE' })).status, 404);
  assert.ok((await json(await fetch(`${base}/api/profiles`))).profiles!.some(p => p.id === 'alex'));
});
