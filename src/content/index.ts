import a from './words-a.txt?raw';
import b from './words-b.txt?raw';
import c from './words-c.txt?raw';
import d from './words-d.txt?raw';
import { buildLadder, LINES, lineIds } from './defs.js';
import type { Clip } from '../audio.js';

export const LADDER = buildLadder([a, b, c, d]);
export const wordClip = (w: string): Clip => ({ path: `w/${w}`, text: w });
export const sentenceClip = (w: string): Clip => ({ path: `s/${w}`, text: LADDER.words[w].sentence });
export const lessonClip = (rungId: string): Clip => ({ path: `l/${rungId}`, text: LADDER.rungs.find(r => r.id === rungId)!.lesson });
/** A random line from a family such as "praise". */
export function line(prefix: string): Clip & { id: string } {
  const ids = lineIds(prefix), id = ids[Math.floor(Math.random() * ids.length)];
  return { id, path: `r/${id}`, text: LINES[id] };
}
/** The sentence with the answer hidden, so the bubble never shows the spelling. */
export function blanked(w: string): string {
  return LADDER.words[w].sentence.replace(new RegExp(`\\b${w}\\b`, 'gi'), '＿＿＿');
}
