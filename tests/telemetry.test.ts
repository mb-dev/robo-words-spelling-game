import test from 'node:test';
import assert from 'node:assert/strict';
import { capBacklog, deviceLabel, flush, FLUSH_AT, MAX_BACKLOG, pending, resetRetry, setContext, track, wordMs, markWord } from '../src/telemetry.js';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
} });
const real = globalThis.fetch;
const tick = () => new Promise(r => setTimeout(r, 5));

test('device labels', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'ipad');
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', 5), 'ipad'); // iPadOS posing as a Mac
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', 0), 'mac');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'iphone');
  assert.equal(deviceLabel('Mozilla/5.0 (X11; Linux x86_64)'), 'other');
  assert.equal(deviceLabel(''), 'other');
});

test('backlog keeps the newest events', () => {
  assert.deepEqual(capBacklog([1, 2, 3, 4, 5], 3), [3, 4, 5]);
  assert.deepEqual(capBacklog([1, 2], 3), [1, 2]);
  assert.equal(capBacklog(Array.from({ length: 1500 }, (_, i) => i)).length, MAX_BACKLOG);
});

test('a failing server keeps events, caps the backlog at 1000 and mirrors it to localStorage; a later success clears both', async () => {
  let posts = 0;
  globalThis.fetch = (async () => { posts++; throw new TypeError('offline'); }) as typeof fetch;
  setContext({ who: 'younger', session: 's1' });
  for (let i = 0; i < 1200; i++) track('tap', { i });
  await tick();
  const kept = pending();
  assert.equal(kept.length, MAX_BACKLOG);
  assert.equal((kept[0].data as { i: number }).i, 200); // oldest dropped
  assert.equal(kept[0].who, 'younger'); assert.equal(kept[0].session, 's1');
  assert.equal(posts, 1); // one try, then it backs off instead of posting per event
  assert.equal(JSON.parse(mem.get('robo2.unsent')!).length, MAX_BACKLOG);
  assert.match(mem.get('robo2.device')!, /^other-[0-9a-f]{6}$/);

  const bodies: { device: string; events: unknown[] }[] = [];
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response('{"ok":true}'); }) as typeof fetch;
  // Still inside the retry back-off, so a plain flush waits; leaving the page forces a send path (no sendBeacon in Node: keepalive fetch).
  flush(true); await tick();
  assert.equal(pending().length, 0);
  assert.equal(mem.has('robo2.unsent'), false);
  assert.equal(bodies.reduce((n, b) => n + b.events.length, 0), MAX_BACKLOG);
  assert.ok(bodies.every(b => b.events.length <= 100 && b.device === mem.get('robo2.device')));
});

test('reaching the batch size flushes; a refused post is dropped, not retried', async () => {
  const sizes: number[] = [];
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { sizes.push(JSON.parse(init.body as string).events.length); return new Response('{}', { status: 400 }); }) as typeof fetch;
  resetRetry(); // as if the earlier back-off had lapsed
  for (let i = 0; i < FLUSH_AT; i++) track('x', { i });
  await tick();
  assert.deepEqual(sizes, [FLUSH_AT]);
  assert.equal(pending().length, 0);
});

test('word clock', () => { markWord(); assert.ok(wordMs() >= 0 && wordMs() < 1000); globalThis.fetch = real; });
