/** Manage child profiles on a running game server, over its HTTP API (nothing touches the database file directly).
 *    npm run profiles -- list
 *    npm run profiles -- create "Sam" [--start 0|5|12] [--no-letter-check] [--keyboard]
 *    npm run profiles -- rename <id> "New name"
 *    npm run profiles -- delete <id>
 *  Use --url http://localhost:8000 (the default) to point at another server. */
import { newProfile, newProfileId, MAX_PROFILES, type Profile } from '../src/engine.js';

const args = process.argv.slice(2);
function take(name: string): string | undefined { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; }
function has(name: string): boolean { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; }
const base = (take('url') ?? 'http://localhost:8000').replace(/\/+$/, '');
const start = take('start'), noCheck = has('no-letter-check'), keyboard = has('keyboard');
const [cmd, ...rest] = args;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init).catch(() => { throw new Error(`Cannot reach the game server at ${base}. Start it with: npm start`); });
  const body = (await res.json().catch(() => ({}))) as { error?: string; profiles?: Profile[] };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
const list = async () => (await api('/api/profiles')).profiles ?? [];
const put = (p: Profile) => api(`/api/profiles/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
const usage = () => { console.log('Usage: list | create <name> [--start 0|5|12] [--no-letter-check] [--keyboard] | rename <id> <name> | delete <id>   (--url http://localhost:8000)'); process.exitCode = 1; };

try {
  if (cmd === 'list') {
    const all = await list();
    if (!all.length) console.log('No profiles yet.');
    for (const p of all) console.log(`${p.id.padEnd(24)} ${p.name.padEnd(20)} ${p.placed ? `level ${p.rung + 1}` : 'not placed'}, ${p.stars} stars${p.keyboard ? ', keyboard' : ''}`);
  } else if (cmd === 'create' && rest[0]) {
    const all = await list();
    if (all.length >= MAX_PROFILES) throw new Error(`At most ${MAX_PROFILES} profiles`);
    const warmupStart = start === undefined ? 0 : Number(start);
    if (![0, 5, 12].includes(warmupStart)) throw new Error('--start must be 0, 5 or 12');
    const p = newProfile(newProfileId(rest[0], all.map(x => x.id)), rest[0].slice(0, 20), { letterCheck: !noCheck, warmupStart, keyboard });
    await put(p);
    console.log(`Created ${p.name} (id ${p.id}). Reload the game in the browser to see it.`);
  } else if (cmd === 'rename' && rest[0] && rest[1]) {
    const p = (await list()).find(x => x.id === rest[0]);
    if (!p) throw new Error(`No profile with id ${rest[0]}`);
    await put({ ...p, name: rest[1].slice(0, 20) });
    console.log(`Renamed ${p.id} to ${rest[1].slice(0, 20)}.`);
  } else if (cmd === 'delete' && rest[0]) {
    await api(`/api/profiles/${rest[0]}`, { method: 'DELETE' });
    console.log(`Deleted ${rest[0]}.`);
  } else usage();
} catch (error) {
  console.error((error as Error).message); process.exitCode = 1;
}
