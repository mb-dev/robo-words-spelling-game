/** Lists every clip the game needs: npm run audio */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLadder, LINES } from '../src/content/defs.js';
import { JOKES } from '../src/content/reactions.js';

const here = dirname(fileURLToPath(import.meta.url));
const content = join(here, '../src/content');
export function loadLadder() {
  const files = readdirSync(content).filter(f => /^words-.*\.txt$/.test(f)).sort();
  return buildLadder(files.map(f => readFileSync(join(content, f), 'utf8')));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ladder = loadLadder();
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const items = [
    ...Object.values(ladder.words).flatMap(word => [
      { path: `w/${word.w}`, text: `${cap(word.w)}.`, speed: 0.9 },
      { path: `s/${word.w}`, text: word.sentence },
    ]),
    ...ladder.rungs.map(r => ({ path: `l/${r.id}`, text: r.lesson })),
    ...Object.entries(LINES).map(([id, text]) => ({ path: `r/${id}`, text })),
    ...JOKES.flatMap(([q, a], i) => [{ path: `j/q${i}`, text: q }, { path: `j/a${i}`, text: a }]),
  ];
  writeFileSync(join(here, 'manifest.json'), JSON.stringify(items, null, 1));
  console.log(`${items.length} clips, ${Object.keys(ladder.words).length} words, ${ladder.rungs.map(r => r.words.length).join(' ')}`);
}
