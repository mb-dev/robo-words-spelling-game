/** Makeblock mTiny robot, driven through the HTTP API of robot-mtiny-control (https://github.com/mb-dev/robot-mtiny-control).
 *  Acts out words, turns to face the player, celebrates. The only file that talks to it.
 *  Every routine ends where it started, facing the same way. Table mode only turns on the spot; floor mode drives at most 100 mm out and back.
 *  Plain GET fetches with no options or headers (anything else needs a preflight the robot cannot answer). All failures are swallowed. */
import type { Act } from '../content/reactions.js';
import { track } from '../telemetry.js';
import { robotSettings } from './settings.js';
import type { Robot, RobotStatus, Side } from './types.js';

export type Step =
  | { kind: 'forward' | 'backward'; mm: number; speed?: number }
  | { kind: 'left' | 'right'; deg: number; speed?: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'eyes'; a: number }
  | { kind: 'sound'; path: string }
  | { kind: 'tune'; notes: string; beat: number };
export type TinyMode = 'table' | 'floor';

// ---------- Sounds: word -> [library path, label, seconds]. Untested by ear, so gated behind the `sounds` setting. ----------
const A = 'system/game/farm/', P = 'system/game/park/', C = 'system/common/audio/';
export const WORD_SOUNDS: Record<string, [path: string, label: string, seconds: number]> = {
  dog: [P + 'dog.mp3', 'Dog', 2.7],
  cat: [P + 'cat.mp3', 'Cat', 2.8],
  cow: [A + 'cow.mp3', 'Cow', 3.1],
  sheep: [A + 'sheep.mp3', 'Sheep', 2.3],
  horse: [A + 'horse.mp3', 'Horse', 3.3],
  bee: [A + 'bee.mp3', 'Bee', 3.0],
  bird: [C + 'bird.mp3', 'Bird', 4.4],
  chick: [A + 'chick.mp3', 'Chick', 2.5],
  apple: [A + 'apple.mp3', 'Apple', 2.3],
  milk: [A + 'milk.mp3', 'Milk', 2.9],
  car: ['system/game/family/car.mp3', 'Car', 4.0],
  ring: [C + 'ring.mp3', 'Ring', 2.8],
  bell: [C + 'ring.mp3', 'Ring', 2.8],
};
// "sea"/"ocean": the only ocean clip is 8.9 s, too long. "sleep": the only snoring clip is 8.1 s, too long.

// ---------- Step builders ----------
const L = (deg: number, speed?: number): Step => ({ kind: 'left', deg, speed });
const R = (deg: number, speed?: number): Step => ({ kind: 'right', deg, speed });
const F = (mm: number, speed?: number): Step => ({ kind: 'forward', mm, speed });
const B = (mm: number, speed?: number): Step => ({ kind: 'backward', mm, speed });
const E = (a: number): Step => ({ kind: 'eyes', a });
const W = (ms: number): Step => ({ kind: 'wait', ms });
const S = (path: string): Step => ({ kind: 'sound', path });
/** A few quick notes; unlike a sound clip, Tiny finishes the tune before the next step. */
const T = (notes: string, beat = 200): Step => ({ kind: 'tune', notes, beat });
// Cheer clips (the happy_dance show in robot-mtiny-control uses yeah and victory). Clips play over the moves that follow them.
const YEAH = 'system/common/audio/yeah.mp3', WOW = 'system/common/audio/wow.mp3', VICTORY = 'system/common/audio/victory.mp3';
const IDLE = 2, HAPPY = 4, CRY = 5, DIZZY = 6, TIRED = 7, EXCITED = 8, SCARED = 9;
/** Left, double right, left: net zero turn. */
const wiggle = (deg = 15, speed?: number): Step[] => [L(deg, speed), R(deg * 2, speed), L(deg, speed)];

/** Rough run time in seconds, used to keep routines short and to know when Tiny is free again. */
export function duration(steps: Step[]): number {
  let s = 0;
  for (const st of steps) {
    if (st.kind === 'forward' || st.kind === 'backward' || st.kind === 'left' || st.kind === 'right') {
      // Mirrors the robot server's planner: 120 ms of ramps per step, and short moves are slowed so a step lasts about 300 ms.
      const mm = st.kind === 'forward' || st.kind === 'backward', amount = (mm ? (st as { mm: number }).mm / 1.07 : (st as { deg: number }).deg) * 1000;
      const speed = Math.max(5, Math.min(Math.floor((st.speed ?? (mm ? 100 : 180)) / 5) * 5, Math.floor(amount / 180 / 5) * 5));
      s += (amount / speed + 120) / 1000;
    }
    else if (st.kind === 'wait') s += st.ms / 1000;
    else if (st.kind === 'sound') s += Object.values(WORD_SOUNDS).find(v => v[0] === st.path)?.[2] ?? 0; // cheer clips play over the moves
    else if (st.kind === 'tune') s += st.notes.split(' ').length * st.beat / 1000;
  }
  return s;
}
/** Always finish on idle eyes, but keep the face up for at least two seconds so it is seen. */
const finish = (steps: Step[]): Step[] => {
  if (!steps.length) return steps;
  const last = steps[steps.length - 1], body = last.kind === 'eyes' && last.a === IDLE ? steps.slice(0, -1) : steps;
  const pad = Math.round((2 - duration(body)) * 100) * 10;
  return [...body, ...(pad >= 100 ? [W(pad)] : []), E(IDLE)];
};

const ACTS: Partial<Record<Act, (m: TinyMode) => Step[]>> = {
  spin: () => [E(HAPPY), L(360)],
  hop: m => [E(HAPPY), ...(m === 'floor' ? [F(40, 150), B(40, 150), F(40, 150), B(40, 150)] : [L(20, 200), R(20, 200), L(20, 200), R(20, 200)])],
  kick: m => ACTS.hop!(m),
  shake: () => [E(HAPPY), ...wiggle(20), ...wiggle(20)],
  wave: () => ACTS.shake!('table'),
  zoom: m => [E(EXCITED), ...(m === 'floor' ? [F(100, 200), B(100, 200)] : [L(360, 200)])],
  slow: m => [E(TIRED), ...(m === 'floor' ? [F(60, 30), B(60, 30)] : [L(60, 30), R(60, 30)])],
  hide: m => [E(SCARED), ...(m === 'floor' ? [B(60), W(800), F(60)] : [L(90), W(800), R(90)])],
  sleep: () => [E(TIRED), W(2000)],
  glow: () => [E(EXCITED), W(600), E(HAPPY), W(600)],
  grow: () => [E(HAPPY), W(800)], shrink: () => [E(HAPPY), W(800)], fly: () => [E(HAPPY), W(800)], flip: () => [E(HAPPY), W(800)],
};
/** Face-only extras keyed by word; these win over the word's act. */
const FACE: Record<string, (m: TinyMode) => Step[]> = {};
const faceWords = (words: string, f: (m: TinyMode) => Step[]) => { for (const w of words.split(' ')) FACE[w] = f; };
faceWords('cry cried', () => [E(CRY), W(1500)]);
faceWords('smile smiled glad joy happiest happiness', () => [E(HAPPY), ...wiggle(15), ...wiggle(15)]);
faceWords('dizzy round twirl turn', () => [E(DIZZY), L(360)]);
faceWords('stop stay wait', () => [E(IDLE), W(1500)]);

export const MAX_SECONDS = 4.5;
/** The steps that act out a word, or [] when Tiny should sit this one out. */
export function stepsFor(word: string, act: Act | undefined, mode: TinyMode, sounds: boolean): Step[] {
  let body = FACE[word]?.(mode) ?? (act ? ACTS[act]?.(mode) : undefined);
  const snd = sounds ? WORD_SOUNDS[word] : undefined;
  if (snd) {
    const clip: Step = { kind: 'sound', path: snd[0] };
    const base = body ?? [E(HAPPY)];
    const withClip = base[0]?.kind === 'eyes' ? [base[0], clip, ...base.slice(1)] : [clip, ...base];
    // Keep the whole routine short: drop the move, or the clip, if they will not fit together.
    body = duration(withClip) <= MAX_SECONDS ? withClip : body ?? [E(HAPPY), clip];
  }
  if (!body) return [];
  const first = body[0], cheerful = first.kind === 'eyes' && (first.a === HAPPY || first.a === EXCITED);
  if (cheerful && !body.some(st => st.kind === 'sound')) body = [first, S(YEAH), ...body.slice(1)];
  return finish(body);
}
/** Celebrations; turn-only, so the same in both modes. */
export function celebrationFor(kind: 'mission' | 'boss' | 'rocket'): Step[] {
  if (kind === 'mission') return finish([E(HAPPY), T('C4 E4 G4 C5'), E(EXCITED), S(VICTORY), ...wiggle(30), ...wiggle(30), ...wiggle(30), W(300), E(HAPPY), ...wiggle(30)]);
  if (kind === 'boss') return finish([E(HAPPY), T('C4 E4 G4 C5 G4 C5'), E(EXCITED), S(VICTORY), ...wiggle(30), ...wiggle(30), L(360), S(YEAH), ...wiggle(30), E(HAPPY), ...wiggle(30), W(300)]);
  return finish([E(HAPPY), T('C4 D4 E4 F4 G4 A4 B4 C5', 150), E(EXCITED), S(WOW), L(720, 200), S(VICTORY), ...wiggle(30), ...wiggle(30)]);
}
/** Every correct word gets a little cheer; first-try words (3 stars) get a bigger one, and the big ones take turns so it stays fresh. */
const BIG_CHEERS: Step[][] = [
  [E(EXCITED), S(WOW), ...wiggle(25), ...wiggle(25), W(900)], [E(HAPPY), S(YEAH), L(360, 200)],
  [E(EXCITED), S(VICTORY), R(40), L(80), R(40), W(1400)], [E(HAPPY), T('C4 E4 G4 C5'), R(360, 200)],
];
let cheerNo = 0;
export const cheerSteps = (stars = 2): Step[] => finish(stars >= 3 ? BIG_CHEERS[cheerNo++ % BIG_CHEERS.length] : [E(HAPPY), S(YEAH), ...wiggle(15)]);
export const puzzledSteps = (): Step[] => finish([E(SCARED), W(1000)]);

// ---------- Talking to Tiny ----------
const HEADINGS = { left: -35, center: 0, right: 35 } as const;
type Outcome = 'ok' | 'busy' | 'fail';
interface Job { what: string; job: () => { steps: Step[]; undo?: () => void } }

/** `address` returns the robot's base URL right now (empty: not set up, so do nothing). */
export function createMTiny(address: () => string): Robot {
  let heading = 0, downUntil = 0, busyUntil = 0, timer: ReturnType<typeof setTimeout> | undefined;
  /** Jobs that must not be lost (turns, celebrations). They wait for Tiny to be free; word routines are skipped when it is busy. */
  const queue: Job[] = [];
  const base = () => address().replace(/\/+$/, '');

  async function run(steps: Step[], url: string, what: string): Promise<Outcome> {
    if (!steps.length) return 'ok';
    busyUntil = Date.now() + duration(steps) * 1000 + 400;
    const t0 = Date.now();
    let out: Outcome, status: number | undefined;
    try {
      const res = await fetch(`${url}/api/moves?steps=${encodeURIComponent(JSON.stringify(steps))}`);
      status = res.status;
      if (res.status === 409) { busyUntil = Date.now() + 1500; out = 'busy'; }
      else if (res.status === 503) { downUntil = Date.now() + 30000; busyUntil = 0; out = 'fail'; }
      else out = res.ok ? 'ok' : 'fail';
    } catch { downUntil = Date.now() + 30000; busyUntil = 0; out = 'fail'; } // not reachable: leave it alone for a while
    track('robot_cmd', { robot: 'mtiny', what, steps: steps.length, out, status, ms: Date.now() - t0 });
    return out;
  }
  /** A routine that was never sent because Tiny was busy or known to be down. */
  const skipped = (what: string, out: 'skipped_busy' | 'skipped_down', steps?: number) => track('robot_cmd', { robot: 'mtiny', what, steps, out });
  function pump(retried = false) {
    if (timer || !queue.length) return;
    timer = setTimeout(async () => {
      timer = undefined;
      const url = base(), job = queue.shift();
      if (!job) return;
      if (!url || Date.now() < downUntil) { if (url) for (const q of [job, ...queue]) skipped(q.what, 'skipped_down'); queue.length = 0; return; }
      const { steps, undo } = job.job(), out = await run(steps, url, job.what);
      if (out !== 'ok') undo?.();
      if (out === 'busy' && !retried) queue.unshift(job); // refused, not queued by the robot: try once more
      pump(out === 'busy' && !retried);
    }, Math.max(0, busyUntil - Date.now()));
  }
  /** Must-happen job: waits its turn. */
  function later(what: string, job: Job['job']) { if (base()) { queue.push({ what, job }); pump(); } }
  /** Nice-to-have: only if Tiny is free right now. */
  function now(what: string, steps: Step[]) {
    const url = base();
    if (!url || !steps.length) return;
    if (Date.now() < downUntil) return skipped(what, 'skipped_down', steps.length);
    if (queue.length || Date.now() < busyUntil) return skipped(what, 'skipped_busy', steps.length);
    void run(steps, url, what);
  }
  /** Together mode: turn a little toward the player whose turn it is. Heading is tracked so the turn is relative. */
  function turnSteps(side: Side): Step[] {
    const d = HEADINGS[side] - heading;
    heading = HEADINGS[side];
    return d === 0 ? [] : [d < 0 ? L(-d, 90) : R(d, 90)];
  }
  async function probe(): Promise<RobotStatus> {
    const url = base();
    if (!url) return 'unconfigured';
    try {
      const res = await Promise.race([
        fetch(`${url}/api/status`),
        new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 3000)),
      ]);
      if (res.status === 503) return 'asleep';
      if (!res.ok) return 'unreachable';
      const j = (await res.json()) as { ok?: boolean; result?: { ready?: boolean } };
      return j.ok && j.result?.ready ? 'ready' : 'asleep';
    } catch { return 'unreachable'; }
  }
  return {
    react(word, act, stars = 2) {
      const s = robotSettings(), steps = stepsFor(word, act, s.mode, s.sounds);
      now(steps.length ? `react:${word}` : 'cheer', steps.length ? steps : cheerSteps(stars));
    },
    puzzled() { now('puzzled', puzzledSteps()); },
    faceTurn(side) {
      later(`turn:${side}`, () => { const before = heading; return { steps: turnSteps(side), undo: () => { heading = before; } }; });
    },
    celebrate(kind, center = false) {
      later(`celebrate:${kind}`, () => { const before = heading; return { steps: [...(center ? turnSteps('center') : []), ...celebrationFor(kind)], undo: () => { heading = before; } }; });
    },
    async status() {
      const t0 = Date.now(), status = await probe();
      track('robot_status', { robot: 'mtiny', status, ms: Date.now() - t0 });
      return status;
    },
  };
}
