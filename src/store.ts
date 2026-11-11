/** Progress lives on the laptop so both devices and the grown-ups page see the same thing; the browser keeps a copy. */
import type { Profile } from './engine.js';
import { track } from './telemetry.js';

const KEY = 'robo2.profiles';

function local(): Profile[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Profile[]; } catch { return []; }
}
function keepLocal(profiles: Profile[]) {
  try { localStorage.setItem(KEY, JSON.stringify(profiles)); } catch { /* private mode */ }
}
export async function loadProfiles(): Promise<{ profiles: Profile[]; online: boolean }> {
  let saved: Profile[] = [], online = false;
  try {
    const res = await fetch('/api/profiles');
    if (res.ok) { saved = ((await res.json()) as { profiles: Profile[] }).profiles; online = true; }
  } catch { /* offline: use the browser copy */ }
  if (!online) saved = local();
  keepLocal(saved); // no profiles yet is normal on a first run: the app shows the create-a-profile page
  return { profiles: saved, online };
}
const pending: Record<string, { timer: ReturnType<typeof setTimeout>; send: (keepalive?: boolean) => void }> = {};
export function saveProfile(profile: Profile, all: Profile[], onStatus?: (ok: boolean) => void) {
  keepLocal(all);
  clearTimeout(pending[profile.id]?.timer);
  const send = async (keepalive = false) => {
    delete pending[profile.id];
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile), keepalive });
      if (!res.ok) track('save', { id: profile.id, status: res.status });
      onStatus?.(res.ok);
    } catch (e) { track('save', { id: profile.id, error: String((e as Error)?.message ?? e) }); onStatus?.(false); }
  };
  pending[profile.id] = { timer: setTimeout(send, 400), send };
}
/** Remove a child's profile for good, here and on the laptop. */
export async function deleteProfile(id: string, remaining: Profile[], onStatus?: (ok: boolean) => void) {
  clearTimeout(pending[id]?.timer); delete pending[id];
  keepLocal(remaining);
  try {
    const res = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) track('save', { id, status: res.status, deleted: true });
    onStatus?.(res.ok);
  } catch (e) { track('save', { id, error: String((e as Error)?.message ?? e), deleted: true }); onStatus?.(false); }
}
/** A reload or closing the tab must not drop a save that is still waiting. */
if (typeof addEventListener === 'function') addEventListener('pagehide', () => {
  for (const job of Object.values(pending)) { clearTimeout(job.timer); job.send(true); }
});

// ---------- Where this device was, so a reload carries on in the same place ----------
const WHERE = 'robo2.where', SNAP = 'robo2.snap', FRESH = 3 * 60 * 60 * 1000;
function readFresh<T>(key: string): T | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as (T & { time?: number }) | null;
    return v && Date.now() - (v.time ?? 0) < FRESH ? v : undefined;
  } catch { return undefined; }
}
function put(key: string, v: object | null) {
  try { if (v) localStorage.setItem(key, JSON.stringify({ ...v, time: Date.now() })); else localStorage.removeItem(key); } catch { /* private mode */ }
}
/** Which player and, when in a game, which kind of game. */
export interface Where { who: string; session?: unknown }
export const loadWhere = () => readFresh<Where>(WHERE);
export const saveWhere = (w: Where | null) => put(WHERE, w);
/** The game in progress: saved at the start of every word, cleared when the game ends. */
export const loadSnap = <T>() => readFresh<T>(SNAP);
export const saveSnap = (s: object | null) => put(SNAP, s);
