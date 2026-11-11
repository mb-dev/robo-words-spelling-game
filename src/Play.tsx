import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { letterSound, say, sfx, stop, unlock } from './audio.js';
import { blanked, LADDER, lessonClip, line, sentenceClip, wordClip } from './content/index.js';
import { ZONES, type Rung } from './content/defs.js';
import { reactionFor, type Act } from './content/reactions.js';
import {
  applyPlacement, finishMission, localDay, modeFor, placementAnswer, placementStart, placementWord, planMission, recordResult, rungState, trayFor,
  type Item, type LogEntry, type MissionEnd, type Mode, type Outcome, type Placement, type Plan, type Profile,
} from './engine.js';
import { Robot, type Mood } from './Robot.js';
import { saveSnap } from './store.js';
import { markWord, newId, setContext, track, trackWord, wordMs } from './telemetry.js';
import { robot } from './robots/index.js';

export type Session = { kind: 'warmup'; start: number } | { kind: 'mission' } | { kind: 'together'; partner: string };
/** Together mode: four words each, and this many stars between them launches the rocket. */
const TEAM_WORDS = 4, TEAM_FUEL = 16;
interface Tile { id: number; l: string; used: boolean }
interface Round {
  item: Item; player: Profile; kind: LogEntry['kind']; mode: Mode; word: string; rung: Rung;
  slots: string[]; from: number[]; locked: boolean[]; tray: Tile[];
  fails: number; misses: number; hints: number; shown: boolean; firstWrong?: string;
  taps: number; removes: number; checks: number; firstTap: number; wrongs: string[]; // for the event log
  shake: number[]; badTile: number; status: 'play' | 'right' | 'reveal'; stars: number;
}
interface Result { word: string; stars: number; who: number }
/** A game in progress, kept on the device so a reload carries on at the same word. */
export interface Snap { kind: Session['kind']; ids: string[]; item: Item; plan: Plan | null; placement: Placement | null; idx: number; outcomes: Outcome[]; results: Result[]; starsBefore: number[] }
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Renders "c[a]p" with the bracketed letters highlighted, and "cap>cap[e]" as a change. */
export function Example({ text }: { text: string }) {
  const mark = (s: string, key: string) => <span key={key} className="ex-word">{s.split(/(\[[^\]]+\])/).map((part, i) =>
    part.startsWith('[') ? <b key={i}>{part.slice(1, -1)}</b> : part)}</span>;
  const [from, to] = text.split('>');
  return <span className="example">{to ? <>{mark(from, 'a')}<i>→</i>{mark(to, 'b')}</> : mark(from, 'a')}</span>;
}

export function Play({ profile, partner, session, resume, onSave, onExit, onAgain }: { profile: Profile; partner?: Profile; session: Session; resume?: Snap; onSave: () => void; onExit: () => void; onAgain: () => void }) {
  const players = session.kind === 'together' && partner ? [profile, partner] : [profile];
  const team = players.length > 1;
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const [stage, setStage] = useState<'loading' | 'lesson' | 'resume' | 'spell' | 'summary'>('loading');
  const [mood, setMood] = useState<Mood>('idle');
  const [bubble, setBubble] = useState('');
  const [burst, setBurst] = useState(0);
  const [act, setAct] = useState<Act | undefined>();
  const [shower, setShower] = useState<string | undefined>();
  const R = useRef<Round | null>(null);
  const plan = useRef<Plan | null>(null), placement = useRef<Placement | null>(null);
  const idx = useRef(0), outcomes = useRef<Outcome[]>([]), results = useRef<Result[]>([]);
  const starsBefore = useRef(players.map(p => p.stars)), end = useRef<MissionEnd & { placed?: number; team?: boolean; launched?: boolean }>({ stars: 0 });
  const alive = useRef(true);
  const sid = useRef(newId()), lessonAt = useRef(0);
  // Read through a function: handlers created on an earlier render must still see the current plan.
  const getKind = (): 'warmup' | Plan['kind'] => (session.kind === 'warmup' ? 'warmup' : plan.current?.kind ?? 'mission');
  const kind = getKind();

  async function speak(id: string) { const l = line(id); setBubble(l.text); return say([l]); }
  /** Say a short line mid-word, then put the sentence back in the bubble. */
  function aside(id: string, r: Round) {
    void speak(id).then(ok => { if (ok && alive.current && R.current === r && r.status === 'play') setBubble(blanked(r.word)); });
  }
  function prompt(word: string) { setBubble(blanked(word)); void say([wordClip(word), sentenceClip(word), wordClip(word)]); }

  function startItem(item: Item) {
    const rung = LADDER.rungs[item.rung], kind = getKind();
    const player = players[item.who ?? 0];
    const mode = modeFor(player, LADDER, item, kind);
    const n = item.word.length + (mode.feedback === 'word' ? rung.pad ?? 0 : 0);
    const r: Round = (R.current = {
      item, player, mode, word: item.word, rung, kind: kind === 'warmup' ? 'warmup' : kind === 'boss' ? 'boss' : item.review ? 'review' : 'practice',
      slots: Array(n).fill(''), from: Array(n).fill(-1), locked: Array(n).fill(false),
      tray: mode.input === 'tray' ? trayFor(item.word, rung, Math.random).map((l, id) => ({ id, l, used: false })) : [],
      fails: 0, misses: 0, hints: 0, shown: false, shake: [], badTile: -1, status: 'play', stars: 0, taps: 0, removes: 0, checks: 0, firstTap: -1, wrongs: [],
    });
    markWord(); setContext({ who: player.id });
    track('word_start', { word: item.word, rung: item.rung, kind: r.kind, input: mode.input, feedback: mode.feedback, hints: mode.hints, picture: mode.picture, who: player.id, index: idx.current });
    saveSnap({ kind: session.kind, ids: players.map(pl => pl.id), item, plan: plan.current, placement: placement.current, idx: idx.current,
      outcomes: outcomes.current, results: results.current, starsBefore: starsBefore.current } satisfies Snap);
    setMood('idle'); setAct(undefined); setStage('spell'); redraw();
    if (!team) return prompt(item.word);
    // Together mode: say whose turn it is before the word.
    setBubble(`${player.name}’s turn!`); sfx('boop'); robot.faceTurn(players.indexOf(player) === 0 ? 'left' : 'right');
    void say([line('turn')]).then(ok => { if (ok && alive.current && R.current === r) prompt(item.word); });
  }
  async function begin() {
    if (!alive.current) return;
    if (session.kind === 'warmup') {
      placement.current = placementStart(session.start, LADDER);
      setStage('spell'); await speak('warmup_intro');
      if (alive.current) startItem({ word: placementWord(placement.current, LADDER, Math.random), rung: placement.current.probe, review: false });
      return;
    }
    const p = plan.current!;
    setStage('spell');
    await speak(team ? 'team_intro' : p.kind === 'boss' ? 'boss_intro' : 'start');
    if (alive.current) startItem(p.items[0]);
  }
  useEffect(() => {
    alive.current = true; setContext({ session: sid.current });
    const back = resume && resume.kind === session.kind && resume.ids.join() === players.map(pl => pl.id).join() ? resume : undefined;
    if (back) {
      // After a reload: put everything back and wait for a tap (the iPad will not play sound until one).
      plan.current = back.plan; placement.current = back.placement; idx.current = back.idx;
      outcomes.current = back.outcomes; results.current = back.results; starsBefore.current = back.starsBefore;
      setStage('resume'); setBubble('Let’s keep going!');
      track('resume', { kind: back.kind, word: back.item.word, index: back.idx });
    } else if (session.kind === 'mission') {
      plan.current = planMission(profile, LADDER, Math.random);
      const rung = LADDER.rungs[plan.current.rung], st = rungState(profile, rung.id);
      if (plan.current.kind === 'mission' && !st.intro) {
        st.intro = true; onSave(); setStage('lesson'); setBubble(rung.lesson); void say([lessonClip(rung.id)]);
        lessonAt.current = performance.now(); track('lesson_show', { rung: rung.id });
      } else void begin();
    } else if (session.kind === 'together') {
      const plans = players.map(pl => planMission(pl, LADDER, Math.random, true).items.slice(0, TEAM_WORDS));
      const items: Item[] = [];
      for (let i = 0; i < TEAM_WORDS; i++) plans.forEach((list, who) => { if (list[i]) items.push({ ...list[i], who }); });
      plan.current = { kind: 'mission', rung: profile.rung, items };
      void begin();
    } else void begin();
    track('session_start', { kind: getKind(), rung: plan.current?.rung ?? placement.current?.probe ?? (session.kind === 'warmup' ? session.start : undefined), words: plan.current?.items.map(i => i.word) ?? [], resumed: Boolean(back), together: team });
    return () => { alive.current = false; setContext({ session: undefined }); stop(); if (team) robot.faceTurn('center'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function freeSlot(r: Round, i: number) {
    const tile = r.tray.find(t => t.id === r.from[i]); if (tile) tile.used = false;
    r.slots[i] = ''; r.from[i] = -1;
  }
  function place(letter: string, tileId: number) {
    const r = R.current; if (!r || r.status !== 'play') return;
    const i = r.slots.findIndex((s, k) => !s && !r.locked[k]); if (i < 0) return;
    const tile = r.tray.find(t => t.id === tileId), src = r.mode.input;
    r.taps++; if (r.firstTap < 0) r.firstTap = wordMs();
    if (r.mode.feedback === 'letter') {
      trackWord('tap', { letter, slot: i, src, ok: letter === r.word[i] });
      if (letter !== r.word[i]) {
        r.wrongs.push(r.slots.slice(0, i).join('') + letter); r.misses++; r.badTile = tileId; sfx('bad'); setMood('oops'); redraw();
        setTimeout(() => { if (R.current === r) { r.badTile = -1; setMood('idle'); redraw(); } }, 500);
        return;
      }
      r.slots[i] = letter; r.locked[i] = true; if (tile) tile.used = true;
      sfx('place'); if (r.rung.sounds) letterSound(letter);
      redraw();
      if (r.slots.every(Boolean)) setTimeout(() => void finish(true), r.rung.sounds ? 700 : 250);
      return;
    }
    r.slots[i] = letter; r.from[i] = tileId; if (tile) tile.used = true;
    trackWord('tap', { letter, slot: i, src });
    sfx('tap'); redraw();
    if (r.mode.input === 'tray' && !r.rung.pad && r.slots.every(Boolean)) setTimeout(() => { if (R.current === r && r.slots.every(Boolean)) check(); }, 450);
  }
  function removeAt(i: number, how: 'remove' | 'backspace' = 'remove') {
    const r = R.current; if (!r || r.status !== 'play' || r.locked[i] || !r.slots[i]) return;
    r.removes++; trackWord(how, { slot: i });
    freeSlot(r, i); sfx('tap'); redraw();
  }
  function backspace() {
    const r = R.current; if (!r) return;
    for (let i = r.slots.length - 1; i >= 0; i--) if (r.slots[i] && !r.locked[i]) return removeAt(i, 'backspace');
  }
  /** Lock in the next correct letter. */
  function reveal(r: Round) {
    r.slots.forEach((_, i) => { if (!r.locked[i]) freeSlot(r, i); });
    const i = [...r.word].findIndex((_, k) => !r.locked[k]); if (i < 0) return;
    const tile = r.tray.find(t => t.l === r.word[i] && !t.used); if (tile) tile.used = true;
    r.slots[i] = r.word[i]; r.locked[i] = true;
  }
  function hint() {
    const r = R.current; if (!r || r.status !== 'play' || !r.mode.hints) return;
    r.hints++; trackWord('hint', { word: r.word, n: r.hints }); reveal(r); sfx('boop'); redraw(); aside('hint', r);
    if ([...r.word].every((_, k) => r.locked[k])) setTimeout(() => void finish(true), 600);
  }
  function check() {
    const r = R.current; if (!r || r.status !== 'play' || r.mode.feedback !== 'word' || !r.slots.some(Boolean)) return;
    const wrong = r.slots.map((s, i) => (s !== (r.word[i] ?? '') ? i : -1)).filter(i => i >= 0);
    r.checks++; const attempt = r.slots.map(s => s || '_').join('');
    trackWord('check', { n: r.checks, attempt, correct: !wrong.length, wrong });
    if (!wrong.length) return void finish(true);
    r.wrongs.push(attempt); r.fails++; r.firstWrong ??= r.slots.join(''); sfx('bad'); setMood('oops'); robot.puzzled();
    if (!r.mode.hints) {
      // Boss and warm-up words get one go; show the right spelling, then move on.
      r.status = 'reveal'; r.shake = wrong; redraw();
      setTimeout(() => { if (R.current !== r) return; r.shake = []; r.slots = [...r.word]; r.locked = r.slots.map(() => true); redraw(); void say([wordClip(r.word)]); }, 600);
      setTimeout(() => { if (R.current === r) void finish(false); }, 2600);
      return;
    }
    r.shake = wrong.filter(i => r.slots[i]); redraw(); aside('oops', r);
    setTimeout(() => {
      if (R.current !== r) return;
      r.slots.forEach((s, i) => { if (wrong.includes(i)) freeSlot(r, i); else if (s) r.locked[i] = true; });
      r.shake = []; setMood('idle');
      if (r.fails >= 3) { r.shown = true; trackWord('reveal', { word: r.word, how: 'show' }); aside('show', r); } else if (r.fails >= 2) { reveal(r); trackWord('reveal', { word: r.word, how: 'letter' }); }
      redraw();
    }, 800);
  }
  async function finish(correct: boolean) {
    const r = R.current; if (!r || r.status === 'right') return;
    const o: Outcome = { tries: correct ? 1 + r.fails + Math.min(2, r.misses) : 9, hints: r.hints, shown: r.shown || !correct, answer: r.firstWrong };
    r.stars = recordResult(r.player, LADDER, r.item, r.kind, o, Date.now());
    trackWord('word_end', { word: r.word, correct, stars: correct ? r.stars : 0, firstTap: r.firstTap < 0 ? null : r.firstTap, taps: r.taps, removes: r.removes, checks: r.checks,
      hints: r.hints, shown: r.shown, misses: r.misses, fails: r.fails, ...(r.wrongs.length ? { wrong: r.wrongs.slice(0, 10) } : {}) });
    outcomes.current.push(o); results.current.push({ word: r.word, stars: correct ? r.stars : 0, who: r.item.who ?? 0 }); onSave();
    if (correct) {
      const reaction = reactionFor(r.word, LADDER.words[r.word].emoji);
      r.status = 'right'; setMood('cheer'); setAct(reaction.act); robot.react(r.word, reaction.act, r.stars); sfx(r.stars === 3 ? 'win' : 'good');
      if (reaction.shower || r.stars === 3) { setShower(reaction.shower); setBurst(b => b + 1); }
      redraw();
      await wait(350); if (!alive.current) return;
      await speak(r.stars === 3 ? 'praise' : 'good');
      await wait(reaction.act ? 900 : 350);
    }
    if (alive.current && R.current === r) void next(correct);
  }
  async function next(correct: boolean) {
    if (session.kind === 'warmup') {
      const s = (placement.current = placementAnswer(placement.current!, correct, LADDER));
      if (s.result === undefined) return startItem({ word: placementWord(s, LADDER, Math.random), rung: s.probe, review: false });
      applyPlacement(profile, s.result, LADDER); onSave();
      track('session_end', { kind: 'warmup', outcome: 'placed', placed: s.result, stars: 0 });
      end.current = { stars: 0, placed: s.result }; R.current = null; setMood('cheer'); setStage('summary'); saveSnap(null); sfx('win'); robot.celebrate('mission');
      return void speak('warmup_done');
    }
    const p = plan.current!;
    if (++idx.current < p.items.length) return startItem(p.items[idx.current]);
    if (team) {
      // Each child's words count toward her own level; the stars are pooled for the rocket.
      let stars = 0, newGear: string | undefined;
      players.forEach((pl, who) => {
        const mine = (item: Item) => (item.who ?? 0) === who;
        const part = finishMission(pl, LADDER, { kind: 'mission', rung: pl.rung, items: p.items.filter(mine) }, outcomes.current.filter((_, i) => mine(p.items[i])), starsBefore.current[who]);
        stars += part.stars; newGear ??= part.newGear; pl.missionDay = localDay();
      });
      const launched = stars >= TEAM_FUEL;
      track('session_end', { kind: 'together', outcome: 'done', stars, launched });
      end.current = { stars, newGear, team: true, launched }; onSave(); R.current = null; setAct(undefined); setShower(launched ? '🚀' : undefined);
      setMood(launched ? 'cheer' : 'idle'); setStage('summary'); saveSnap(null);
      if (launched) { sfx('win'); setBurst(b => b + 1); robot.celebrate('rocket', true); } else robot.faceTurn('center');
      return void speak(launched ? 'team_win' : 'team_low');
    }
    const e = (end.current = finishMission(profile, LADDER, p, outcomes.current, starsBefore.current[0]));
    track('session_end', { kind: p.kind, outcome: e.bossPassed ? 'boss_passed' : e.bossFailed ? 'boss_failed' : e.levelDown ? 'level_down' : 'done', stars: e.stars, ...(e.finished ? { finished: true } : {}) });
    profile.missionDay = localDay(); setAct(undefined); setShower(undefined);
    onSave(); R.current = null; setMood(e.bossFailed || e.levelDown ? 'idle' : 'cheer'); setStage('summary'); saveSnap(null);
    if (!e.bossFailed && !e.levelDown) { sfx('win'); setBurst(b => b + 1); robot.celebrate(e.bossPassed ? 'boss' : 'mission'); }
    await speak(e.finished ? 'wizard' : e.bossPassed ? 'boss_win' : e.bossFailed ? 'boss_retry' : e.levelDown ? 'level_down' : 'done');
    if (e.newGear && alive.current) { await wait(300); void speak('new_gear'); }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const r = R.current; if (!r || stage !== 'spell' || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (/^[a-z]$/.test(key)) {
        unlock();
        if (r.mode.input === 'keys') place(key, -1);
        else { const tile = r.tray.find(t => t.l === key && !t.used); if (tile) place(key, tile.id); }
      } else if (key === 'backspace') { event.preventDefault(); backspace(); }
      else if (key === 'enter') check();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = R.current, p = plan.current;
  const total = p?.items.length ?? 0;
  const header = (
    <header className="play-top">
      <button className="round-btn" onClick={() => { if (stage !== 'summary') track('session_exit', { kind, stage, index: idx.current, done: results.current.length, word: r?.word }); stop(); onExit(); }} aria-label="Back to home">🏠</button>
      {session.kind === 'warmup'
        ? <div className="tag">🔧 Warm-up</div>
        : <div className="dots" aria-label={`Word ${idx.current + 1} of ${total}`}>{p?.items.map((_, i) => {
            const res = results.current[i];
            return <span key={i} className="dot" data-who={team ? p.items[i].who : undefined} data-state={res ? (res.stars ? 'won' : 'missed') : i === idx.current && stage === 'spell' ? 'now' : 'todo'}>{res ? (res.stars ? '⭐' : '•') : ''}</span>;
          })}</div>}
      {team ? <div className="tag turn" data-who={r?.item.who ?? 0}>{r ? `${r.player.name}’s turn` : '🚀 Team'}</div> : kind === 'boss' ? <div className="tag boss">👾 Boss round</div> : r?.item.review ? <div className="tag">🔁 Review</div> : <div className="tag ghost-tag" />}
    </header>
  );

  let body: ReactNode = null;
  if (stage === 'lesson' && p) {
    const rung = LADDER.rungs[p.rung];
    body = (
      <section className="lesson card">
        <Robot mood="cheer" gear={profile.gear} color={profile.color} size={170} />
        <p className="eyebrow">{ZONES[rung.zone].icon} {ZONES[rung.zone].name}</p>
        <h1>{rung.icon} {rung.kid}</h1>
        <div className="examples">{rung.examples.map(e => <Example key={e} text={e} />)}</div>
        <div className="row">
          <button className="btn soft" onClick={() => { track('lesson_again'); void say([lessonClip(rung.id)]); }}>🔊 Again</button>
          <button className="btn go" onClick={() => { track('lesson_go', { ms: Math.round(performance.now() - lessonAt.current) }); unlock(); void begin(); }}>Let’s go! ▶</button>
        </div>
      </section>
    );
  } else if (stage === 'resume' && resume) {
    body = (
      <section className="lesson card">
        <Robot mood="cheer" gear={profile.gear} color={profile.color} size={170} />
        <h1>Welcome back!</h1>
        <p>Robo saved your place.</p>
        <div className="row"><button className="btn go" onClick={() => { track('resume_go', { kind: resume.kind, word: resume.item.word, index: resume.idx }); unlock(); startItem(resume.item); }}>Keep going ▶</button></div>
      </section>
    );
  } else if (stage === 'spell') {
    const emoji = r && r.mode.picture ? LADDER.words[r.word].emoji : undefined;
    const wordMode = r?.mode.feedback === 'word';
    const needsCheck = wordMode && (r!.mode.input === 'keys' || Boolean(r!.rung.pad));
    body = (
      <section className="play-grid">
        <aside className="robo-side">
          <Robot mood={mood} gear={(r?.player ?? profile).gear} color={(r?.player ?? profile).color} act={act} size={180} onPoke={() => { trackWord('robo_poke', { where: 'play' }); if (r?.status === 'play') prompt(r.word); }} />
          <div className="bubble" aria-live="polite">{bubble}</div>
        </aside>
        {r && <div className="board" data-status={r.status}>
          <div className="clue">
            {emoji && <button className="picture" onClick={() => { trackWord('hear', { button: 'picture', word: r.word }); prompt(r.word); }} aria-label="Hear the word">{emoji}</button>}
            <button className="hear" onClick={() => { trackWord('hear', { button: 'word', word: r.word }); void say([wordClip(r.word)]); }} aria-label="Hear the word">🔊</button>
            <button className="hear small" onClick={() => { trackWord('hear', { button: 'sentence', word: r.word }); void say([sentenceClip(r.word)]); }} aria-label="Hear it in a sentence">💬</button>
          </div>
          {r.shown && r.status === 'play' && <div className="ghost" aria-label="Copy this word">{r.word}</div>}
          <div className="slots" data-n={r.slots.length}>
            {r.slots.map((s, i) => (
              <button key={i} className="slot" data-filled={Boolean(s)} data-locked={r.locked[i]} data-shake={r.shake.includes(i)}
                data-extra={i >= r.word.length} disabled={r.locked[i] || !s} onClick={() => removeAt(i)} aria-label={s ? `Letter ${s}, tap to remove` : 'Empty box'}>{s}</button>
            ))}
            {r.status === 'right' && <div className="stars-pop">{'⭐'.repeat(r.stars)}</div>}
          </div>
          {r.mode.input === 'tray'
            ? <div className="tray">{r.tray.map(t => (
                <button key={t.id} className="tile" data-used={t.used} data-bad={r.badTile === t.id} disabled={t.used || r.status !== 'play'}
                  onClick={() => { unlock(); place(t.l, t.id); }}>{t.l}</button>))}</div>
            : <div className="keys">{KEY_ROWS.map(row => <div key={row} className="key-row">{[...row].map(l => (
                <button key={l} className="key" disabled={r.status !== 'play'} onClick={() => { unlock(); place(l, -1); }}>{l}</button>))}</div>)}</div>}
          <div className="actions">
            {wordMode && <button className="btn soft" onClick={backspace} disabled={r.status !== 'play'} aria-label="Remove last letter">⌫</button>}
            {r.mode.hints && <button className="btn soft" onClick={hint} disabled={r.status !== 'play'}>💡 Help</button>}
            {needsCheck && <button className="btn go" onClick={check} disabled={r.status !== 'play' || !r.slots.some(Boolean)}>Check ✓</button>}
          </div>
        </div>}
      </section>
    );
  } else if (stage === 'summary') {
    const e = end.current, placedRung = e.placed !== undefined ? LADDER.rungs[e.placed] : undefined;
    const now = LADDER.rungs[profile.rung];
    body = (
      <section className="summary card">
        <Robot mood={mood} gear={profile.gear} color={profile.color} act={e.launched ? 'fly' : undefined} size={190} />
        {placedRung ? <>
          <h1>Robo found your level!</h1>
          <p className="big-line">{ZONES[placedRung.zone].icon} {ZONES[placedRung.zone].name} · {placedRung.icon} {placedRung.kid}</p>
        </> : e.team ? <>
          <h1>{e.launched ? 'Blast off!' : 'Almost there!'}</h1>
          <p className="star-total">+{e.stars} ⭐ together</p>
          <div className="chips">{results.current.map((res, i) => <span key={i} className="chip" data-who={res.who} data-missed={!res.stars}>{res.word} {'⭐'.repeat(res.stars)}</span>)}</div>
          <p className="big-line">{e.launched ? '🚀 You filled the rocket as a team!' : `🚀 The rocket needs ${TEAM_FUEL} stars. You got ${e.stars}.`}</p>
          {e.newGear && <p className="big-line">🎁 Robo has something new to wear!</p>}
        </> : <>
          <h1>{e.finished ? 'Word Wizard!' : e.bossPassed ? 'Boss beaten!' : e.bossFailed ? 'So close!' : e.levelDown ? 'Power-up time' : 'Mission complete!'}</h1>
          <p className="star-total">+{e.stars} ⭐</p>
          <div className="chips">{results.current.map((res, i) => <span key={i} className="chip" data-missed={!res.stars}>{res.word} {'⭐'.repeat(res.stars)}</span>)}</div>
          {e.bossPassed && !e.finished && <p className="big-line">New level: {now.icon} {now.kid}</p>}
          {e.bossFailed && <p className="big-line">A little more practice, then the boss again.</p>}
          {e.levelDown && <p className="big-line">Next up: {now.icon} {now.kid}</p>}
          {e.newGear && <p className="big-line">🎁 Robo has something new to wear!</p>}
        </>}
        <div className="row">
          <button className="btn soft" onClick={() => { stop(); onExit(); }}>🏠 Home</button>
          <button className="btn go" onClick={() => { unlock(); stop(); onAgain(); }}>{placedRung ? 'First mission ▶' : 'Play again ▶'}</button>
        </div>
      </section>
    );
  }
  return (
    <div className="play" data-kind={kind}>
      {header}
      {team && stage === 'spell' && <div className="fuel" aria-label="Rocket fuel"><span style={{ width: `${Math.min(100, (results.current.reduce((a, b) => a + b.stars, 0) / TEAM_FUEL) * 100)}%` }} /><i>🚀</i></div>}
      {body}
      {burst > 0 && <div className="confetti" key={burst} aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ left: `${5 + i * 5.2}%`, animationDelay: `${(i % 6) * 0.06}s` }}>{shower ?? ['⭐', '✨', '🎉', '💫'][i % 4]}</span>)}</div>}
    </div>
  );
}
