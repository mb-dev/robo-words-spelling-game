/** Game rules with no browser code: finding a child's level, planning missions, scoring, moving up and down. */
import type { Ladder, Rung } from './content/defs.js';

export type Rng = () => number;
export interface WordStat { seen: number; clean: number; miss: number; last: number; lastClean: boolean }
export interface RungState {
  intro?: boolean;
  done?: boolean;
  /** Different words spelled first try with no help since the last failed boss round. */
  clean: string[];
  /** Last ten first-try results on this rung (1 = clean). */
  recent: number[];
  bossSeen: string[];
  struggles: number;
  /** A perfect mission lets a child try the boss early. */
  fast?: boolean;
}
export interface LogEntry { t: number; word: string; rung: string; stars: number; answer?: string; kind: 'practice' | 'review' | 'boss' | 'warmup' }
export interface Profile {
  id: string; name: string; placed: boolean; rung: number; keyboard: boolean;
  /** Check each letter as it is placed on a new level (tray only). Off means the whole word is checked at once. Default on. */
  letterCheck?: boolean;
  /** Where the warm-up starts looking: a level index (0 just starting, 5 short words, 12 chapter books). */
  warmupStart?: number;
  stars: number; missions: number; gear: string | null; finished?: boolean;
  words: Record<string, WordStat>; rungs: Record<string, RungState>; log: LogEntry[];
  /** Daily surprise: the last day a mission was finished, the last day the present was opened, and what it has given. */
  missionDay?: string; giftDay?: string; gifts?: number; colors?: string[]; color?: string | null;
}
export interface Item { word: string; rung: number; review: boolean; /** In together mode: whose turn this word is. */ who?: number }
export interface Plan { kind: 'mission' | 'boss'; rung: number; items: Item[] }
export interface Outcome { tries: number; hints: number; shown: boolean; answer?: string }
export interface Mode { input: 'tray' | 'keys'; feedback: 'letter' | 'word'; hints: boolean; picture: boolean }

export const GEAR = [
  { id: 'bowtie', name: 'Bow tie', stars: 15, icon: '🎀' },
  { id: 'cap', name: 'Party hat', stars: 45, icon: '🥳' },
  { id: 'shades', name: 'Sunglasses', stars: 90, icon: '😎' },
  { id: 'crown', name: 'Crown', stars: 160, icon: '👑' },
  { id: 'cape', name: 'Hero cape', stars: 250, icon: '🦸' },
  { id: 'rocket', name: 'Rocket boots', stars: 360, icon: '🚀' },
];
export const BOSS_SIZE = 5, BOSS_PASS = 4, CLEAN_FOR_BOSS = 8;

/** Today in local time, as YYYY-MM-DD. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export type ProfileOptions = Partial<Pick<Profile, 'keyboard' | 'letterCheck' | 'warmupStart'>>;
export function newProfile(id: string, name: string, options: ProfileOptions = {}): Profile {
  return { id, name, placed: false, rung: 0, keyboard: false, letterCheck: true, warmupStart: 0, stars: 0, missions: 0, gear: null, words: {}, rungs: {}, log: [], ...options };
}
/** A short, URL-safe id for a new profile: the name's letters plus a random suffix, so two children named alike do not clash. */
export function newProfileId(name: string, taken: string[] = [], rng: Rng = Math.random): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'child';
  let id = base;
  while (taken.includes(id)) id = `${base}-${Math.floor(rng() * 36 ** 3).toString(36).padStart(3, '0')}`;
  return id;
}
/** The most children one device lists; keeps the "who is playing" screen readable. */
export const MAX_PROFILES = 8;
export function rungState(p: Profile, id: string): RungState {
  return (p.rungs[id] ??= { clean: [], recent: [], bossSeen: [], struggles: 0 });
}
function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Every fourth word is held back so the boss round uses words the child has not practised. */
export function bossWords(rung: Rung): string[] { return rung.words.filter((_, i) => i % 4 === 3); }
export function practiceWords(rung: Rung): string[] { return rung.words.filter((_, i) => i % 4 !== 3); }

// ---------- Finding a level ----------
export interface Placement { lo: number; hi: number; probe: number; step: 0 | 1; asked: number; used: string[]; result?: number }
export function placementStart(start: number, ladder: Ladder): Placement {
  return { lo: -1, hi: ladder.rungs.length, probe: Math.min(start, ladder.rungs.length - 1), step: 0, asked: 0, used: [] };
}
export function placementWord(s: Placement, ladder: Ladder, rng: Rng): string {
  const pool = practiceWords(ladder.rungs[s.probe]).slice(1, 12).filter(w => !s.used.includes(w));
  const word = pool[Math.floor(rng() * pool.length)] ?? ladder.rungs[s.probe].words[0];
  s.used.push(word);
  return word;
}
/** Two right in a row passes a rung; one wrong fails it. Jump up by six until a miss, then close in. */
export function placementAnswer(s: Placement, correct: boolean, ladder: Ladder): Placement {
  const n = ladder.rungs.length, next = { ...s, asked: s.asked + 1 };
  if (correct && s.step === 0) return { ...next, step: 1 };
  if (correct) next.lo = s.probe; else next.hi = s.probe;
  next.step = 0;
  if (next.hi - next.lo <= 1 || next.lo >= n - 1 || next.asked >= 20) return { ...next, result: Math.min(n - 1, next.lo + 1) };
  next.probe = next.hi === n ? Math.min(n - 1, s.probe + 6) : Math.floor((next.lo + next.hi) / 2);
  return next;
}
export function applyPlacement(p: Profile, rung: number, ladder: Ladder) {
  p.placed = true; p.rung = rung; p.finished = false;
  p.keyboard = rung >= ladder.rungs.findIndex(r => r.id === 'ai-ay');
  ladder.rungs.forEach((r, i) => { const st = rungState(p, r.id); st.done = i < rung; if (i >= rung) { st.clean = []; st.recent = []; st.fast = false; } });
}

// ---------- Missions ----------
export function bossReady(p: Profile, rung: Rung): boolean {
  const st = rungState(p, rung.id);
  if (st.done) return false;
  if (st.fast) return true;
  const recent = st.recent.slice(-10);
  const accuracy = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  return st.clean.length >= Math.min(CLEAN_FOR_BOSS, practiceWords(rung).length) && recent.length >= 5 && accuracy >= 0.8;
}
export function planMission(p: Profile, ladder: Ladder, rng: Rng, practiceOnly = false): Plan {
  const rung = ladder.rungs[p.rung];
  if (!practiceOnly && bossReady(p, rung)) {
    const st = rungState(p, rung.id), all = bossWords(rung);
    const fresh = shuffle(all.filter(w => !st.bossSeen.includes(w)), rng);
    const words = [...fresh, ...shuffle(all.filter(w => st.bossSeen.includes(w)), rng)].slice(0, BOSS_SIZE);
    return { kind: 'boss', rung: p.rung, items: words.map(word => ({ word, rung: p.rung, review: false })) };
  }
  const pool = practiceWords(rung), stat = (w: string) => p.words[w];
  const retry = pool.filter(w => stat(w) && !stat(w).lastClean).sort((a, b) => stat(a).last - stat(b).last).slice(0, 2);
  const unseen = pool.filter(w => !stat(w));
  const seen = pool.filter(w => stat(w) && !retry.includes(w)).sort((a, b) => stat(a).last - stat(b).last);
  const earlier = ladder.rungs.slice(0, p.rung);
  const reviewCount = earlier.length ? 2 : 0;
  const current = [...retry, ...unseen, ...seen].slice(0, 7 - reviewCount - (earlier.length ? 0 : 1));
  const review: Item[] = [];
  // Review leans toward the rungs just below, and toward words that were missed or not seen for longest.
  for (let i = 0; i < reviewCount; i++) {
    const back = Math.min(earlier.length - 1, Math.floor(rng() * rng() * earlier.length));
    const from = earlier[earlier.length - 1 - back];
    const options = from.words.filter(w => !review.some(r => r.word === w))
      .sort((a, b) => Number(stat(a)?.lastClean ?? true) - Number(stat(b)?.lastClean ?? true) || (stat(a)?.last ?? 0) - (stat(b)?.last ?? 0));
    const word = options[Math.floor(rng() * Math.min(4, options.length))];
    if (word) review.push({ word, rung: from.index, review: true });
  }
  const items: Item[] = shuffle(current, rng).map(word => ({ word, rung: p.rung, review: false }));
  review.forEach((r, i) => items.splice(Math.min(items.length, 2 + i * 3), 0, r));
  return { kind: 'mission', rung: p.rung, items };
}
export function modeFor(p: Profile, ladder: Ladder, item: Item, kind: Plan['kind'] | 'warmup'): Mode {
  if (kind === 'warmup') return { input: 'tray', feedback: 'word', hints: false, picture: true };
  const input = p.keyboard ? 'keys' : 'tray';
  if (kind === 'boss') return { input, feedback: 'word', hints: false, picture: false };
  const fresh = !item.review && rungState(p, ladder.rungs[item.rung].id).clean.length < 4;
  if (p.keyboard) return { input: fresh ? 'tray' : 'keys', feedback: 'word', hints: true, picture: fresh };
  return { input: 'tray', feedback: fresh && p.letterCheck !== false ? 'letter' : 'word', hints: true, picture: true };
}
/** The word's letters plus wrong choices that target this rung's pattern. */
export function trayFor(word: string, rung: Rung, rng: Rng): string[] {
  const letters = [...word];
  const size = Math.min(12, Math.max(6, word.length + 3));
  const confusable: Record<string, string> = { b: 'dp', d: 'bp', p: 'bq', m: 'n', n: 'm', c: 'ks', k: 'c', s: 'cz', g: 'j', j: 'g', f: 'v', v: 'f', t: 'd' };
  const candidates = [...shuffle([...rung.decoys], rng), ...shuffle(letters.flatMap(l => [...(confusable[l] ?? '')]), rng), ...shuffle([...'aeioulnrst'], rng)];
  if (rung.pad) letters.push(...shuffle([...new Set(word)], rng).slice(0, 2));
  for (const c of candidates) { if (letters.length >= size) break; if (!letters.includes(c) || (rung.pad && letters.filter(l => l === c).length < 2)) letters.push(c); }
  return shuffle(letters, rng);
}
/** Positions that are wrong, counting missing and extra letters. */
export function wrongPositions(answer: string, word: string): number[] {
  const wrong: number[] = [];
  for (let i = 0; i < Math.max(answer.length, word.length); i++) if (answer[i] !== word[i]) wrong.push(i);
  return wrong;
}
export function starsFor(o: Outcome): number {
  if (o.tries === 1 && !o.hints && !o.shown) return 3;
  return o.tries <= 2 && o.hints <= 1 && !o.shown ? 2 : 1;
}
export function recordResult(p: Profile, ladder: Ladder, item: Item, kind: LogEntry['kind'], o: Outcome, now: number): number {
  const stars = starsFor(o), clean = stars === 3, rung = ladder.rungs[item.rung];
  const stat = (p.words[item.word] ??= { seen: 0, clean: 0, miss: 0, last: 0, lastClean: false });
  stat.seen++; stat.last = now; stat.lastClean = clean; if (clean) stat.clean++; else stat.miss++;
  if (kind === 'practice') {
    const st = rungState(p, rung.id);
    st.recent = [...st.recent, clean ? 1 : 0].slice(-10);
    if (clean && !st.clean.includes(item.word)) st.clean.push(item.word);
  }
  if (kind !== 'warmup') p.stars += stars;
  p.log = [...p.log, { t: now, word: item.word, rung: rung.id, stars, kind, ...(clean ? {} : { answer: o.answer }) }].slice(-400);
  return stars;
}
export interface MissionEnd { bossPassed?: boolean; bossFailed?: boolean; levelDown?: boolean; newGear?: string; finished?: boolean; stars: number }
export function finishMission(p: Profile, ladder: Ladder, plan: Plan, outcomes: Outcome[], starsBefore: number): MissionEnd {
  const rung = ladder.rungs[plan.rung], st = rungState(p, rung.id), end: MissionEnd = { stars: p.stars - starsBefore };
  if (plan.kind === 'boss') {
    st.fast = false;
    st.bossSeen = [...new Set([...st.bossSeen, ...plan.items.map(i => i.word)])];
    const right = outcomes.filter(o => o.tries === 1 && !o.shown).length;
    if (right >= Math.min(BOSS_PASS, plan.items.length)) {
      st.done = true; end.bossPassed = true;
      if (p.rung >= ladder.rungs.length - 1) { p.finished = true; end.finished = true; } else p.rung++;
    } else { end.bossFailed = true; st.clean = st.clean.slice(0, 4); st.recent = []; }
  } else {
    const mine = plan.items.map((item, i) => ({ item, o: outcomes[i] })).filter(x => !x.item.review && x.o);
    const clean = mine.filter(x => starsFor(x.o) === 3).length;
    if (mine.length >= 4 && clean === mine.length) st.fast = true;
    st.struggles = mine.length && clean / mine.length < 0.4 ? st.struggles + 1 : 0;
    if (st.struggles >= 2 && p.rung > 0) {
      st.struggles = 0; p.rung--; end.levelDown = true;
      const lower = rungState(p, ladder.rungs[p.rung].id);
      lower.done = false; lower.clean = []; lower.recent = []; lower.fast = false;
    }
  }
  p.missions++;
  const gear = GEAR.filter(g => g.stars > starsBefore && g.stars <= p.stars).pop();
  if (gear) { end.newGear = gear.id; p.gear = gear.id; }
  return end;
}
