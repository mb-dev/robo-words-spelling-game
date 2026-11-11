import test from 'node:test';
import assert from 'node:assert/strict';
import { createMTiny } from '../src/robots/mtiny.js';
import { noRobot } from '../src/robots/none.js';
import { robot, robotAddress, robotType, ROBOT_TYPES } from '../src/robots/index.js';

function stubFetch() {
  const calls: string[] = [], real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ ok: true, result: { ready: true } }), { status: 200 }); }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('the default is no robot, with no address', async () => {
  assert.equal(robotType().id, 'none');
  assert.equal(robotAddress(), '');
  assert.equal(await robot.status(), 'unconfigured');
  assert.equal(await noRobot.status(), 'unconfigured');
});
test('the registry has unique ids and no hard-coded real addresses', () => {
  assert.equal(new Set(ROBOT_TYPES.map(t => t.id)).size, ROBOT_TYPES.length);
  assert.ok(ROBOT_TYPES.some(t => t.id === 'none') && ROBOT_TYPES.some(t => t.id === 'mtiny'));
  for (const t of ROBOT_TYPES) assert.ok(t.defaultAddress === '' || /^http:\/\/localhost[:/]/.test(t.defaultAddress), t.id);
  assert.equal(robotType('nonsense').id, 'none');
});
test('the no-robot default does nothing and never touches the network', () => {
  const f = stubFetch();
  try { noRobot.react('hop', 'hop', 3); noRobot.puzzled(); noRobot.faceTurn('left'); noRobot.celebrate('boss'); } finally { f.restore(); }
  assert.deepEqual(f.calls, []);
});
test('mTiny with no address stays quiet', async () => {
  const f = stubFetch(), tiny = createMTiny(() => '');
  try { tiny.react('hop', 'hop', 3); tiny.puzzled(); tiny.faceTurn('right'); tiny.celebrate('mission'); assert.equal(await tiny.status(), 'unconfigured'); } finally { f.restore(); }
  assert.deepEqual(f.calls, []);
});
test('mTiny with an address calls the robot server API', async () => {
  const f = stubFetch(), tiny = createMTiny(() => 'http://robot.example.ts.net/');
  try {
    assert.equal(await tiny.status(), 'ready');
    tiny.react('hop', 'hop', 3);
    await new Promise(r => setTimeout(r, 20));
  } finally { f.restore(); }
  assert.equal(f.calls[0], 'http://robot.example.ts.net/api/status');
  assert.match(f.calls[1], /^http:\/\/robot\.example\.ts\.net\/api\/moves\?steps=%5B/);
});
