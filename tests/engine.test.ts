import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLadder } from '../tools/manifest.js';
import {
  applyPlacement, bossReady, bossWords, finishMission, modeFor, newProfile, placementAnswer, placementStart, placementWord,
  planMission, practiceWords, recordResult, rungState, trayFor, wrongPositions, type Outcome,
} from '../src/engine.js';

const ladder = loadLadder();
function rng(seed = 1) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
const CLEAN: Outcome = { tries: 1, hints: 0, shown: false }, MISS: Outcome = { tries: 3, hints: 1, shown: true };

test('every rung has words, and every sentence contains its word', () => {
  assert.equal(ladder.rungs.length, 32);
  for (const rung of ladder.rungs) {
    assert.ok(rung.words.length >= 20, `${rung.id} has ${rung.words.length} words`);
    assert.ok(bossWords(rung).length >= 5, rung.id);
    for (const w of rung.words) {
      const word = ladder.words[w];
      assert.match(w, /^[a-z]+$/);
      assert.match(word.sentence, new RegExp(`\\b${w}\\b`, 'i'), `${w}: ${word.sentence}`);
    }
  }
});

test('the warm-up lands on the first rung a child cannot yet spell', () => {
  for (const start of [0, 5, 12]) for (let knows = 0; knows <= 32; knows++) {
    let s = placementStart(start, ladder);
    while (s.result === undefined) { placementWord(s, ladder, rng(knows + 1)); s = placementAnswer(s, s.probe < knows, ladder); }
    assert.equal(s.result, Math.min(31, knows), `start ${start}, knows ${knows}`);
    assert.ok(s.asked <= 18, `asked ${s.asked}`);
  }
});

test('placement marks lower rungs done and gives older spellers the keyboard', () => {
  const p = newProfile('t', 'T');
  applyPlacement(p, 14, ladder);
  assert.equal(p.rung, 14); assert.equal(p.keyboard, true);
  assert.equal(rungState(p, ladder.rungs[3].id).done, true);
  assert.equal(rungState(p, ladder.rungs[14].id).done, false);
  const q = newProfile('q', 'Q'); applyPlacement(q, 9, ladder);
  assert.equal(q.keyboard, false);
});

test('a mission mixes current words with review and never uses boss words', () => {
  const p = newProfile('t', 'T'); applyPlacement(p, 9, ladder);
  const plan = planMission(p, ladder, rng());
  assert.equal(plan.kind, 'mission'); assert.equal(plan.items.length, 7);
  assert.equal(plan.items.filter(i => i.review).length, 2);
  const boss = bossWords(ladder.rungs[9]);
  for (const item of plan.items.filter(i => !i.review)) assert.ok(!boss.includes(item.word));
  assert.equal(new Set(plan.items.map(i => i.word)).size, 7);
  const first = newProfile('f', 'F'); applyPlacement(first, 0, ladder);
  assert.equal(planMission(first, ladder, rng()).items.length, 6);
});

test('clean practice unlocks the boss, passing it opens the next rung', () => {
  const p = newProfile('t', 'T'); applyPlacement(p, 9, ladder);
  const rung = ladder.rungs[9];
  for (const word of practiceWords(rung).slice(0, 8)) recordResult(p, ladder, { word, rung: 9, review: false }, 'practice', CLEAN, 1);
  assert.ok(bossReady(p, rung));
  const boss = planMission(p, ladder, rng());
  assert.equal(boss.kind, 'boss'); assert.equal(boss.items.length, 5);
  assert.equal(modeFor(p, ladder, boss.items[0], 'boss').hints, false);
  const before = p.stars = 0;
  boss.items.forEach(item => recordResult(p, ladder, item, 'boss', CLEAN, 2));
  const end = finishMission(p, ladder, boss, boss.items.map(() => CLEAN), before);
  assert.equal(end.bossPassed, true); assert.equal(p.rung, 10); assert.equal(end.stars, 15);
  assert.equal(end.newGear, 'bowtie');
});

test('a failed boss asks for more practice; two hard missions step down', () => {
  const p = newProfile('t', 'T'); applyPlacement(p, 9, ladder);
  const rung = ladder.rungs[9];
  for (const word of practiceWords(rung).slice(0, 8)) recordResult(p, ladder, { word, rung: 9, review: false }, 'practice', CLEAN, 1);
  const boss = planMission(p, ladder, rng());
  const end = finishMission(p, ladder, boss, boss.items.map(() => MISS), p.stars);
  assert.equal(end.bossFailed, true); assert.equal(p.rung, 9); assert.equal(bossReady(p, rung), false);
  for (let i = 0; i < 2; i++) {
    const plan = planMission(p, ladder, rng(i + 3));
    assert.equal(plan.kind, 'mission');
    const last = finishMission(p, ladder, plan, plan.items.map(() => MISS), p.stars);
    assert.equal(Boolean(last.levelDown), i === 1);
  }
  assert.equal(p.rung, 8);
});

test('a perfect mission offers the boss early', () => {
  const p = newProfile('t', 'T'); applyPlacement(p, 4, ladder);
  const plan = planMission(p, ladder, rng());
  plan.items.forEach(item => recordResult(p, ladder, item, item.review ? 'review' : 'practice', CLEAN, 1));
  finishMission(p, ladder, plan, plan.items.map(() => CLEAN), 0);
  assert.equal(planMission(p, ladder, rng()).kind, 'boss');
});

test('trays hold every letter of the word plus wrong choices', () => {
  for (const rung of ladder.rungs) for (const w of rung.words.slice(0, 6)) {
    const tray = trayFor(w, rung, rng(w.length));
    const left = [...tray];
    for (const letter of w) { const i = left.indexOf(letter); assert.ok(i >= 0, `${w} missing ${letter}`); left.splice(i, 1); }
    assert.ok(left.length >= 2, `${w} needs wrong choices`); assert.ok(tray.length <= 14);
  }
});

test('wrong positions count missing and extra letters', () => {
  assert.deepEqual(wrongPositions('cape', 'cape'), []);
  assert.deepEqual(wrongPositions('cap', 'cape'), [3]);
  assert.deepEqual(wrongPositions('hopeing', 'hoping'), [3, 4, 5, 6]);
});
