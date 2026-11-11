import { useEffect, useReducer, useRef, useState } from 'react';
import { audioAvailable, say, sfx, stop, unlock } from './audio.js';
import { LADDER, line } from './content/index.js';
import { ZONES } from './content/defs.js';
import { COLORS, JOKES, type Act } from './content/reactions.js';
import { applyPlacement, bossReady, GEAR, localDay, MAX_PROFILES, newProfile, newProfileId, practiceWords, rungState, type Profile } from './engine.js';
import { Play, type Session, type Snap } from './Play.js';
import { Robot } from './Robot.js';
import { deleteProfile, loadProfiles, loadSnap, loadWhere, saveProfile, saveSnap, saveWhere } from './store.js';
import { pageInfo, setContext, track } from './telemetry.js';
import { robot, robotSettings, robotType, ROBOT_TYPES, setRobotSettings, type RobotStatus } from './robots/index.js';

type Screen = { name: 'who' } | { name: 'home' } | { name: 'play'; session: Session; key: number } | { name: 'grownups' };

export function App() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const boot = useRef(loadWhere()); // where this device was before a reload
  const [who, setWho] = useState<string>(boot.current?.who ?? '');
  const [screen, setScreen] = useState<Screen>(() => {
    if (location.hash === '#grownups') return { name: 'grownups' }; // direct link for adults
    const w = boot.current;
    return w?.session ? { name: 'play', session: w.session as Session, key: 0 } : w?.who ? { name: 'home' } : { name: 'who' };
  });
  useEffect(() => {
    if (screen.name === 'grownups') return;
    const playing = screen.name === 'play';
    saveWhere(screen.name === 'who' || !who ? null : { who, session: playing ? screen.session : undefined });
    if (!playing) saveSnap(null);
  }, [who, screen]);
  useEffect(() => { setContext({ who: screen.name === 'who' ? undefined : who || undefined }); }, [who, screen.name]);
  useEffect(() => { track('screen', { name: screen.name }); }, [screen.name]);
  const [online, setOnline] = useState(true);
  const [teamNote, setTeamNote] = useState('');
  const [pair, setPair] = useState<string[] | null>(null); // together mode: the children picked so far
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const playKey = useRef(0);
  useEffect(() => { void loadProfiles().then(r => { setProfiles(r.profiles); setOnline(r.online); track('app_load', { ...pageInfo(), online: r.online, resumed: Boolean(boot.current?.session) }); }); }, []);
  if (!profiles) return <div className="loading">Waking up Robo…</div>;
  const profile = profiles.find(p => p.id === who);
  const save = (p: Profile) => { saveProfile(p, profiles, setOnline); redraw(); };
  const create = (p: Profile) => { const all = [...profiles, p]; setProfiles(all); saveProfile(p, all, setOnline); track('profile_create', { who: p.id }); };
  const remove = (p: Profile) => {
    const rest = profiles.filter(x => x.id !== p.id);
    setProfiles(rest); void deleteProfile(p.id, rest, setOnline); track('profile_delete', { who: p.id });
    if (who === p.id) setWho('');
  };
  const play = (session: Session) => setScreen({ name: 'play', session, key: ++playKey.current });

  if (screen.name === 'grownups') return <Grownups profiles={profiles} online={online} onSave={save} onCreate={create} onDelete={remove} onBack={() => setScreen({ name: 'who' })} />;
  if (profiles.length === 0) return <CreateProfile first existing={profiles} onCreate={p => { create(p); setWho(p.id); setScreen({ name: 'home' }); }} />;
  const together = screen.name === 'play' && screen.session.kind === 'together' ? screen.session : undefined;
  const partner = together && profiles.find(p => p.id === together.partner);
  if (screen.name === 'who' || !profile || (together && !partner)) return (
    <main className="who">
      <Robot mood="cheer" size={210} onPoke={() => { track('robo_poke', { where: 'who' }); unlock(); sfx('boop'); void say([line('tickle')]); }} />
      <h1>{pair ? 'Who is playing together?' : 'Who is playing?'}</h1>
      <div className="who-buttons">{profiles.map((p, i) => (
        <button key={p.id} className="who-btn" data-n={i % 2} data-picked={pair?.includes(p.id)} aria-pressed={pair ? pair.includes(p.id) : undefined}
          onClick={() => {
            unlock(); sfx('good');
            if (pair) return setPair(pair.includes(p.id) ? pair.filter(x => x !== p.id) : [...pair, p.id].slice(-2));
            track('profile_pick', { who: p.id }); setWho(p.id); setScreen({ name: 'home' });
          }}>
          <span className="who-stars">⭐ {p.stars}</span>{p.name}
        </button>))}</div>
      {profiles.length >= 2 && (pair
        ? <div className="start-buttons">
          <button className="btn team-btn" disabled={pair.length < 2} onClick={() => {
            unlock();
            const two = pair.map(id => profiles.find(p => p.id === id)!), waiting = two.filter(p => !p.placed).map(p => p.name);
            if (waiting.length) return setTeamNote(`${waiting.join(' and ')} ${waiting.length > 1 ? 'need' : 'needs'} to do the warm-up first.`);
            sfx('good'); setWho(two[0].id); setPair(null); setTeamNote(''); play({ kind: 'together', partner: two[1].id });
          }}>🚀 Start</button>
          <button className="btn soft" onClick={() => { setPair(null); setTeamNote(''); }}>Cancel</button>
        </div>
        : <button className="btn team-btn" onClick={() => { unlock(); setPair([]); }}>🚀 Play together</button>)}
      {teamNote && <p className="offline">{teamNote}</p>}
      <HoldButton onHold={() => setScreen({ name: 'grownups' })} />
      {!online && <p className="offline">Not connected to the laptop. Progress is kept on this device for now.</p>}
    </main>
  );
  if (screen.name === 'play') return (
    <Play key={screen.key} resume={screen.key === 0 ? loadSnap<Snap>() : undefined} profile={profile} partner={partner} session={screen.session}
      onSave={() => { save(profile); if (partner) save(partner); }}
      onExit={() => setScreen(partner ? { name: 'who' } : { name: 'home' })}
      onAgain={() => play(partner ? { kind: 'together', partner: partner.id } : { kind: 'mission' })} />
  );
  return <Home profile={profile} onPlay={() => { unlock(); play(profile.placed ? { kind: 'mission' } : { kind: 'warmup', start: profile.warmupStart ?? 0 }); }}
    onBack={() => setScreen({ name: 'who' })} onSave={() => save(profile)} />;
}

function HoldButton({ onHold }: { onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [holding, setHolding] = useState(false);
  const log = useRef({ at: 0, type: '', cancelAt: -1 }); // for the event log only
  const note = (outcome: 'opened' | 'released') => track('hold', { outcome, ms: Math.round(performance.now() - log.current.at), pointerType: log.current.type, cancel: log.current.cancelAt >= 0, ...(log.current.cancelAt >= 0 ? { cancelAt: log.current.cancelAt } : {}) });
  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    log.current = { at: performance.now(), type: e.pointerType, cancelAt: -1 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine without it */ } // a finger that drifts still counts; only lifting the finger cancels (iPads can 'cancel' a long press on their own)
    clearTimeout(timer.current); setHolding(true); timer.current = setTimeout(() => { timer.current = undefined; note('opened'); onHold(); }, 1000);
  };
  const cancel = () => { if (timer.current) note('released'); setHolding(false); clearTimeout(timer.current); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return <button className="hold" data-holding={holding} onPointerDown={start} onPointerUp={cancel} onPointerCancel={() => { log.current.cancelAt = Math.round(performance.now() - log.current.at); }} onContextMenu={e => e.preventDefault()}
    onKeyDown={e => { if (e.key === 'Enter') { log.current = { at: performance.now(), type: 'key', cancelAt: -1 }; note('opened'); onHold(); } }}>Grown-ups: press and hold</button>;
}

function Home({ profile, onPlay, onBack, onSave }: { profile: Profile; onPlay: () => void; onBack: () => void; onSave: () => void }) {
  const current = LADDER.rungs[profile.rung];
  const boss = profile.placed && bossReady(profile, current);
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { nowRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [profile.rung]);
  const nextGear = GEAR.find(g => g.stars > profile.stars);
  const [gift, setGift] = useState<{ joke: number; color?: string } | null>(null);
  const today = localDay(), opened = profile.giftDay === today, ready = !opened && profile.missionDay === today;
  function openGift() {
    unlock();
    const n = profile.gifts ?? 0, owned = profile.colors ?? [];
    const color = COLORS.find(c => !owned.includes(c.id));
    profile.gifts = n + 1; profile.giftDay = today; track('gift_open', { joke: n % JOKES.length, color: color?.id });
    if (color) { profile.colors = [...owned, color.id]; profile.color = color.id; }
    onSave(); setGift({ joke: n % JOKES.length, color: color?.id });
  }
  return (
    <main className="home">
      {gift && <Gift joke={gift.joke} color={gift.color} profile={profile} onClose={() => setGift(null)} />}
      <header className="home-top">
        <button className="round-btn" onClick={onBack} aria-label="Change player">👋</button>
        <h1>{profile.name}</h1>
        <div className="star-count">⭐ {profile.stars}</div>
      </header>
      <section className="home-main">
        <Robot mood="cheer" gear={profile.gear} color={profile.color} size={230} onPoke={() => { track('robo_poke', { where: 'home' }); unlock(); sfx('boop'); void say([line('tickle')]); }} />
        <div className="home-cta">
          {profile.placed
            ? <p className="level-line">{ZONES[current.zone].icon} {ZONES[current.zone].name}<br /><b>{current.icon} {current.kid}</b></p>
            : <p className="level-line">Let’s find your level!</p>}
          <button className="btn play-btn" data-boss={boss} onClick={onPlay}>{!profile.placed ? 'Warm up ▶' : boss ? '👾 Boss round!' : 'Play ▶'}</button>
          {profile.placed && (ready
            ? <button className="btn gift-btn" onClick={openGift}>🎁 Open today’s surprise!</button>
            : <p className="gift-note">{opened ? '🎁 Come back tomorrow for a new surprise' : '🎁 Finish a mission to open today’s surprise'}</p>)}
        </div>
      </section>
      <section className="closet" aria-label="Robo’s closet">
        {GEAR.map(g => {
          const have = profile.stars >= g.stars;
          return <button key={g.id} className="gear" data-have={have} data-on={profile.gear === g.id} disabled={!have}
            onClick={() => { profile.gear = profile.gear === g.id ? null : g.id; track('gear', { id: profile.gear }); sfx('place'); onSave(); }} aria-label={have ? `Wear ${g.name}` : `${g.name}, needs ${g.stars} stars`}>
            <span>{have ? g.icon : '🔒'}</span><small>{have ? g.name : `⭐ ${g.stars}`}</small></button>;
        })}
        {(profile.colors?.length ?? 0) > 0 && <div className="colors" aria-label="Robo’s colors">
          {[{ id: '', name: 'Blue', fill: '#7295f3' }, ...COLORS.filter(c => profile.colors!.includes(c.id))].map(c => (
            <button key={c.id} className="color-dot" style={{ background: c.fill }} data-on={(profile.color ?? '') === c.id} aria-label={`Make Robo ${c.name}`}
              onClick={() => { profile.color = c.id || null; track('color', { id: profile.color }); sfx('place'); onSave(); }} />))}
        </div>}
        {nextGear && <p className="closet-note">{nextGear.stars - profile.stars} more ⭐ for a new surprise</p>}
      </section>
      <section className="map" aria-label="World map">
        {ZONES.map((zone, z) => (
          <div key={zone.name} className="zone" style={{ ['--zone' as string]: zone.color }}>
            <h2>{zone.icon} {zone.name}</h2>
            <div className="stones">{LADDER.rungs.filter(r => r.zone === z).map(r => {
              const done = profile.placed && (rungState(profile, r.id).done || r.index < profile.rung);
              const now = profile.placed && r.index === profile.rung && !profile.finished;
              return <div key={r.id} ref={now ? nowRef : undefined} className="stone" data-state={done ? 'done' : now ? 'now' : 'locked'} title={r.title}>
                <span className="stone-icon">{done || now ? r.icon : '🔒'}</span><small>{r.kid}</small>{done && <i>⭐</i>}</div>;
            })}</div>
          </div>))}
      </section>
    </main>
  );
}

/** Today's present: Robo tells a joke, and hands over a new color while there are still some to collect. */
function Gift({ joke, color, profile, onClose }: { joke: number; color?: string; profile: Profile; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [act, setAct] = useState<Act | undefined>('hop');
  const [q, a] = JOKES[joke];
  useEffect(() => {
    let alive = true;
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    void (async () => {
      sfx('win');
      await say([line('gift'), { path: `j/q${joke}`, text: q }]); if (!alive) return;
      await wait(900); if (!alive) return;
      setStep(1); setAct('shake'); sfx('good');
      await say([{ path: `j/a${joke}`, text: a }]); if (!alive) return;
      await wait(500); if (!alive) return;
      setStep(2);
      if (color) { setAct('spin'); await say([line('gift_color')]); }
    })();
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal" role="dialog" aria-label="Today’s surprise">
      <div className="card gift-card">
        <Robot mood="cheer" gear={profile.gear} color={profile.color} act={act} size={190} />
        <p className="joke-q">{q}</p>
        <p className="joke-a" data-show={step >= 1}>{a} {step >= 1 && '😂'}</p>
        {step >= 2 && color && <p className="big-line">🎨 New Robo color: {COLORS.find(c => c.id === color)?.name}!</p>}
        <button className="btn go" onClick={onClose}>{step >= 2 ? 'Yay!' : 'Close'}</button>
      </div>
    </div>
  );
}

const STARTS = [
  { start: 0, icon: '🌱', title: 'Just starting', note: 'knows letter sounds' },
  { start: 5, icon: '📗', title: 'Spells short words', note: 'like “frog” and “ship”' },
  { start: 12, icon: '📚', title: 'Reads chapter books', note: 'ready for trickier spelling' },
];
/** Make a child profile: a name, where the warm-up starts looking, and whether each letter is checked as it is placed.
 *  Robo moves a child to the full keyboard on its own when the warm-up places them at "ai / ay" or above; the grown-ups page can change it. */
function CreateProfile({ existing, first, onCreate, onCancel }: { existing: Profile[]; first?: boolean; onCreate: (p: Profile) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState(0);
  const [letterCheck, setLetterCheck] = useState(true);
  const clean = name.trim();
  const full = existing.length >= MAX_PROFILES;
  return (
    <main className="start card create">
      {first && <Robot mood="cheer" size={110} />}
      <p className="eyebrow">For a grown-up</p>
      <h1>{first ? 'Welcome to Robo Words! Create a child profile' : 'Add a child'}</h1>
      <p>{first ? 'Robo keeps each child’s progress on this computer. You can add more children, rename them or delete them later on the grown-ups page.' : 'Progress is saved separately for each child.'}</p>
      <label className="field">Name <input value={name} maxLength={20} placeholder="Child’s name" onChange={e => setName(e.target.value)} /></label>
      <p className="field-label">Where should Robo start looking? A three-minute warm-up then finds the right level.</p>
      <div className="start-buttons">{STARTS.map(o => (
        <button key={o.start} type="button" className="btn pick" data-picked={start === o.start} aria-pressed={start === o.start} onClick={() => setStart(o.start)}>{o.icon}<b>{o.title}</b><span>{o.note}</span></button>))}
      </div>
      <label className="check"><input type="checkbox" checked={letterCheck} onChange={e => setLetterCheck(e.target.checked)} /> Check each letter as it is placed (on new levels, with the letter tray)</label>
      <div className="start-buttons">
        <button className="btn go" disabled={!clean || full} onClick={() => { unlock(); onCreate(newProfile(newProfileId(clean, existing.map(p => p.id)), clean, { letterCheck, warmupStart: start })); }}>Create profile</button>
        {onCancel && <button className="btn soft" onClick={onCancel}>Cancel</button>}
      </div>
      {full && <p className="offline">At most {MAX_PROFILES} children.</p>}
    </main>
  );
}

function Grownups({ profiles, online, onSave, onCreate, onDelete, onBack }: { profiles: Profile[]; online: boolean; onSave: (p: Profile) => void; onCreate: (p: Profile) => void; onDelete: (p: Profile) => void; onBack: () => void }) {
  const [adding, setAdding] = useState(false);
  const credits = useAudioCredits();
  return (
    <main className="grownups">
      <header className="home-top"><button className="round-btn" onClick={onBack} aria-label="Back">←</button><h1>For grown-ups</h1><div /></header>
      <p className="note">{online ? 'Progress is saved on this computer.' : 'The computer running the game is not reachable, so changes stay on this device.'}</p>
      <RobotSection />
      {profiles.map(p => {
        const current = LADDER.rungs[p.rung], st = rungState(p, current.id);
        const misses = p.log.filter(l => l.stars < 3).slice(-12).reverse();
        const tried = Object.keys(p.words).length;
        return (
          <section key={p.id} className="card gu-card">
            <div className="gu-row">
              <label>Name <input value={p.name} maxLength={20} onChange={e => { p.name = e.target.value; onSave(p); }} /></label>
              <label>Level <select value={p.placed ? p.rung : -1} onChange={e => { applyPlacement(p, Number(e.target.value), LADDER); onSave(p); }}>
                {!p.placed && <option value={-1}>Not set — warm-up will find it</option>}
                {LADDER.rungs.map(r => <option key={r.id} value={r.index}>{r.index + 1}. {r.title}</option>)}
              </select></label>
              <label className="check"><input type="checkbox" checked={p.keyboard} onChange={e => { p.keyboard = e.target.checked; onSave(p); }} /> Full keyboard (no letter tray)</label>
              <label className="check"><input type="checkbox" checked={p.letterCheck !== false} onChange={e => { p.letterCheck = e.target.checked; onSave(p); }} /> Check each letter as it is placed</label>
            </div>
            <p>{p.placed
              ? <>Working on <b>{current.title}</b>. {st.clean.length} of {Math.min(8, practiceWords(current).length)} words spelled first try with no help; the boss round opens at 8 with 80% recent accuracy.</>
              : <>Has not done the warm-up yet.</>} {p.missions} missions · {p.stars} stars · {tried} different words tried.</p>
            {misses.length > 0 && <p className="misses"><b>Recent tricky words:</b> {misses.map((m, i) => <span key={i}>{m.word}{m.answer ? ` (wrote “${m.answer}”)` : ''}</span>)}</p>}
            <div className="gu-row">
              <label>Warm-up starts at <select value={p.warmupStart ?? 0} onChange={e => { p.warmupStart = Number(e.target.value); onSave(p); }}>
                {STARTS.map(o => <option key={o.start} value={o.start}>{o.title}</option>)}
              </select></label>
              <button className="btn soft" onClick={() => { p.placed = false; onSave(p); }}>Redo the warm-up</button>
              <button className="btn soft danger" onClick={() => {
                if (!window.confirm(`Erase all of ${p.name}’s progress? This cannot be undone.`)) return;
                Object.assign(p, newProfile(p.id, p.name, { letterCheck: p.letterCheck, warmupStart: p.warmupStart })); onSave(p);
              }}>Erase progress</button>
              <button className="btn soft danger" onClick={() => {
                if (!window.confirm(`Delete ${p.name}’s profile and all of their progress? This cannot be undone.`)) return;
                onDelete(p);
              }}>Delete profile</button>
            </div>
          </section>
        );
      })}
      {adding
        ? <CreateProfile existing={profiles} onCreate={p => { onCreate(p); setAdding(false); }} onCancel={() => setAdding(false)} />
        : <button className="btn soft" onClick={() => setAdding(true)}>+ Add a child</button>}
      <section className="card gu-card">
        <h2>How it works</h2>
        <ul>
          <li><b>One ladder, 32 levels, {Object.keys(LADDER.words).length} words.</b> Every child climbs the same ladder from wherever the warm-up places them.</li>
          <li><b>Missions</b> are about seven words: mostly the current level, plus two review words from earlier levels.</li>
          <li><b>Help fades.</b> New patterns start with a small letter tray; later the whole word is checked at once, then (for older spellers) typed on a full keyboard.</li>
          <li><b>Boss rounds</b> use five words that were held back from practice, with no hints. Four right opens the next level.</li>
          <li><b>It adjusts.</b> A perfect mission offers the boss early. Two hard missions in a row step down a level.</li>
        </ul>
        {(credits.voice || credits.letters) && <p className="note">
          {credits.letters && <>Letter sounds: <a href="https://phonicademy.com/audio-license" target="_blank" rel="noopener">Phonicademy</a>. </>}
          {credits.voice && <>Robo’s voice: recorded locally with Kokoro (af_heart).</>}</p>}
      </section>
    </main>
  );
}

/** Credits are shown only when the recordings they belong to are actually installed. */
function useAudioCredits() {
  const [found, setFound] = useState({ voice: false, letters: false });
  useEffect(() => { void audioAvailable().then(setFound); }, []);
  return found;
}

const ROBOT_STATUS: Record<RobotStatus, string> = {
  ready: 'The robot is ready.', asleep: 'The robot is asleep or out of range.', unreachable: 'Can’t reach the robot from this device.', unconfigured: 'Enter the robot’s address.',
};
/** Pick the optional robot and its address. These choices stay on this device only. */
function RobotSection() {
  const [s, setS] = useState(robotSettings);
  const [status, setStatus] = useState<RobotStatus | 'checking'>('checking');
  const type = robotType(s.type), address = s.address || type.defaultAddress;
  const change = (p: Partial<typeof s>) => { setRobotSettings(p); setS(robotSettings()); };
  useEffect(() => {
    if (type.id === 'none') return;
    let alive = true;
    setStatus('checking');
    void robot.status().then(r => { if (alive) setStatus(r); });
    return () => { alive = false; };
  }, [type.id, address]);
  return (
    <section className="card gu-card">
      <h2>Robot</h2>
      <p className="note">Optional. A robot can act out words and turn to face whoever’s turn it is. These choices stay on this device.</p>
      <div className="gu-row">
        <label>Robot <select value={type.id} onChange={e => change({ type: e.target.value })}>
          {ROBOT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select></label>
        {type.id !== 'none' && <label>Address <input value={s.address} placeholder={type.defaultAddress || 'http://robot.example.ts.net'} spellCheck={false} autoCapitalize="off" onChange={e => change({ address: e.target.value })} /></label>}
      </div>
      <p className="note">{type.blurb}</p>
      {type.id !== 'none' && <p aria-live="polite">{status === 'checking' ? 'Looking for the robot…' : ROBOT_STATUS[status]}</p>}
      {type.mtinyOptions && <>
        <div className="gu-row">
          <label className="check"><input type="radio" name="robot-mode" checked={s.mode === 'table'} onChange={() => change({ mode: 'table' })} /> Table</label>
          <label className="check"><input type="radio" name="robot-mode" checked={s.mode === 'floor'} onChange={() => change({ mode: 'floor' })} /> Floor</label>
        </div>
        <p className="note">Table: the robot only turns on the spot. Floor: it may drive a hand’s width and come back.</p>
        <div className="gu-row">
          <label className="check"><input type="checkbox" checked={s.sounds} onChange={e => change({ sounds: e.target.checked })} /> The robot’s own sounds (untested)</label>
        </div>
        <p className="note">Animal and object sounds from the robot’s built-in library. Nobody has listened to them yet, so they may not match.</p>
      </>}
    </section>
  );
}
