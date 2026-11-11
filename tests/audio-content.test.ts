import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLadder } from '../tools/manifest.js';
import { LINES, lineIds } from '../src/content/defs.js';
import { JOKES } from '../src/content/reactions.js';

// No recordings ship with the game. Every clip the game plays carries the text the device voice speaks instead,
// so each word, sentence, lesson, Robo line and joke must have real text.
const ladder = loadLadder();
const spoken = (t: unknown) => typeof t === 'string' && t.trim().length > 1;

test('every word, sentence and lesson has text for the device voice', () => {
  for (const [w, word] of Object.entries(ladder.words)) assert.ok(spoken(w) && spoken(word.sentence), w);
  for (const r of ladder.rungs) assert.ok(spoken(r.lesson), r.id);
});
test('every Robo line and joke has text for the device voice', () => {
  for (const [id, text] of Object.entries(LINES)) assert.ok(spoken(text), id);
  for (const [q, a] of JOKES) assert.ok(spoken(q) && spoken(a));
});
test('the lines the game asks for by name exist, and "your turn" does not depend on a name', () => {
  for (const prefix of ['start', 'praise', 'good', 'oops', 'tickle', 'gift', 'gift_color', 'boss_intro', 'team_intro', 'turn', 'warmup_intro', 'warmup_done', 'done', 'wizard', 'level_down', 'boss_win', 'boss_retry', 'new_gear', 'team_win', 'team_low', 'show', 'hint'])
    assert.ok(lineIds(prefix).length > 0, prefix);
  assert.deepEqual(lineIds('turn'), ['turn']);
  assert.ok(!/[A-Z][a-z]+, it is/.test(LINES.turn));
});
