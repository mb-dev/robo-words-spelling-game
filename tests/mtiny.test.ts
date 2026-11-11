import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLadder } from '../tools/manifest.js';
import { reactionFor, type Act } from '../src/content/reactions.js';
import { celebrationFor, cheerSteps, duration, MAX_SECONDS, puzzledSteps, stepsFor, WORD_SOUNDS, type Step, type TinyMode } from '../src/robots/mtiny.js';

const ACTS: Act[] = ['hop', 'spin', 'flip', 'shake', 'sleep', 'zoom', 'fly', 'grow', 'shrink', 'hide', 'wave', 'slow', 'glow', 'kick'];
const MODES: TinyMode[] = ['table', 'floor'];
/** Words with a face-only extra, plus plain words, so both paths are covered. */
const WORDS = ['hop', 'cry', 'smile', 'dizzy', 'stop', 'stay', 'wait', 'dog', 'apple', 'bird', 'sea', 'plane', 'xyz'];

function lists(): [string, Step[], TinyMode][] {
  const out: [string, Step[], TinyMode][] = [];
  for (const mode of MODES) for (const sounds of [false, true]) {
    for (const act of ACTS) for (const w of WORDS) out.push([`${w}/${act}/${mode}/${sounds}`, stepsFor(w, act, mode, sounds), mode]);
    for (const w of [...WORDS, ...Object.keys(WORD_SOUNDS)]) out.push([`${w}/-/${mode}/${sounds}`, stepsFor(w, undefined, mode, sounds), mode]);
  }
  for (const k of ['mission', 'boss', 'rocket'] as const) for (const mode of MODES) out.push([`celebrate ${k}`, celebrationFor(k), mode]);
  out.push(['cheer', cheerSteps(), 'table'], ['puzzled', puzzledSteps(), 'table']);
  return out;
}
const net = (steps: Step[]) => {
  let mm = 0, deg = 0, far = 0;
  for (const s of steps) {
    if (s.kind === 'forward') mm += s.mm; else if (s.kind === 'backward') mm -= s.mm;
    else if (s.kind === 'left') deg -= s.deg; else if (s.kind === 'right') deg += s.deg;
    far = Math.max(far, Math.abs(mm));
  }
  return { mm, deg, far };
};

test('every routine ends where it started and facing the same way', () => {
  for (const [name, steps] of lists()) {
    const { mm, deg } = net(steps);
    assert.equal(mm, 0, `${name}: distance`);
    assert.equal(((deg % 360) + 360) % 360, 0, `${name}: rotation ${deg}`);
  }
});
test('table mode never drives; floor mode stays within 100 mm', () => {
  for (const [name, steps, mode] of lists()) {
    const { far } = net(steps);
    if (mode === 'table') assert.ok(!steps.some(s => s.kind === 'forward' || s.kind === 'backward'), `${name}: drives on a table`);
    assert.ok(far <= 100, `${name}: ${far} mm out`);
  }
});
test('word routines are short', () => {
  for (const [name, steps] of lists().filter(([n]) => !n.startsWith('celebrate'))) assert.ok(duration(steps) <= MAX_SECONDS, `${name}: ${duration(steps)} s`);
});
test('Tiny\'s untested word sounds appear only when the flag is on (the cheer clips always may)', () => {
  const own = new Set(Object.values(WORD_SOUNDS).map(v => v[0]));
  const wordSound = (s: Step) => s.kind === 'sound' && own.has(s.path);
  for (const mode of MODES) {
    for (const w of Object.keys(WORD_SOUNDS)) {
      assert.ok(!stepsFor(w, undefined, mode, false).some(wordSound), w);
      assert.ok(stepsFor(w, undefined, mode, true).some(wordSound), w);
    }
    for (const act of ACTS) assert.ok(!stepsFor('dog', act, mode, false).some(wordSound));
  }
  for (const [name, steps] of lists().filter(([n]) => n.endsWith('/false'))) assert.ok(!steps.some(wordSound), name);
  for (const [w, [, , secs]] of Object.entries(WORD_SOUNDS)) assert.ok(secs <= 5, w);
});
test('anything with eyes ends on idle eyes, and plain words stay still', () => {
  for (const [name, steps] of lists()) if (steps.length) {
    const last = steps[steps.length - 1];
    assert.ok(last.kind === 'eyes' && last.a === 2, `${name}: ends ${JSON.stringify(last)}`);
  }
  assert.deepEqual(stepsFor('xyz', undefined, 'floor', true), []);
  assert.deepEqual(stepsFor('cat', 'grow', 'table', false).filter(s => s.kind !== 'eyes' && s.kind !== 'wait' && s.kind !== 'sound'), []);
});
test('face extras beat the act, and floor differs from table', () => {
  assert.deepEqual(stepsFor('cry', 'hop', 'floor', false)[0], { kind: 'eyes', a: 5 });
  assert.ok(stepsFor('hop', 'hop', 'floor', false).some(s => s.kind === 'forward'));
  assert.ok(!stepsFor('hop', 'hop', 'table', false).some(s => s.kind === 'forward'));
});
test('every ladder word with a reaction produces a legal routine', () => {
  const ladder = loadLadder();
  for (const w of Object.keys(ladder.words)) for (const mode of MODES) {
    const steps = stepsFor(w, reactionFor(w).act, mode, true);
    assert.ok(net(steps).far <= 100 && duration(steps) <= MAX_SECONDS, w);
  }
});
