/** Event log: what the children do and how the game and the robot behave, sent to the laptop (POST /api/events) so problems can be found later.
 *  Never throws, never waits: track() only queues; sending is fire-and-forget. Failed posts are kept (and mirrored to localStorage) and retried. */
export interface Ev { t: number; who?: string; session?: string; type: string; data?: object }

const URL_ = '/api/events', UNSENT = 'robo2.unsent', DEVICE = 'robo2.device';
export const MAX_BACKLOG = 1000, FLUSH_AT = 40, FLUSH_EVERY = 5000, PER_POST = 500, RETRY_AFTER = 15000, BEACON_CHUNK = 100;

/** Short device kind from the user agent; iPadOS 13+ pretends to be a Mac, so touch points give it away. */
export function deviceLabel(ua: string, touchPoints = 0): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/Macintosh/.test(ua)) return 'mac';
  return 'other';
}
/** Keep the newest `max` items. */
export const capBacklog = <T>(list: T[], max = MAX_BACKLOG): T[] => (list.length > max ? list.slice(list.length - max) : list);
export const newId = (n = 6) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

let queue: Ev[] = [], ctx: { who?: string; session?: string } = {}, device = '', timer: ReturnType<typeof setTimeout> | undefined;
let started = false, sending = false, retryAt = 0, mirrored = false;
/** The events waiting to be sent (for tests). */
export const pending = () => queue.slice();
/** Forget the retry back-off (for tests). */
export const resetRetry = () => { retryAt = 0; };

/** Who is playing and which game session this is; attached to every event until changed. Pass undefined to clear. */
export function setContext(c: { who?: string; session?: string }) { try { Object.assign(ctx, c); } catch { /* ignore */ } }

function deviceId(): string {
  if (device) return device;
  const saved = store.get(DEVICE);
  if (saved && /^[a-z]+-[0-9a-f]{6}$/.test(saved)) return (device = saved);
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  device = `${deviceLabel(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0)}-${newId()}`;
  store.set(DEVICE, device);
  return device;
}
function persist() {
  if (queue.length) store.set(UNSENT, JSON.stringify(queue)); else store.del(UNSENT);
  mirrored = queue.length > 0;
}
function arm() {
  if (timer || !queue.length) return;
  timer = setTimeout(() => { timer = undefined; flush(); arm(); }, FLUSH_EVERY);
  (timer as { unref?: () => void }).unref?.();
}
/** Send what is queued. `leaving`: the page is going away, so use sendBeacon (or a keepalive fetch if that refuses). */
export function flush(leaving = false) {
  try {
    if (!queue.length) return;
    if (leaving) {
      while (queue.length) {
        const batch = queue.slice(0, BEACON_CHUNK), body = JSON.stringify({ device: deviceId(), events: batch });
        let ok = false;
        try { ok = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(URL_, body); } catch { ok = false; }
        if (!ok) { try { void fetch(URL_, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {}); ok = true; } catch { ok = false; } }
        if (!ok) break;
        queue = queue.slice(batch.length);
      }
      if (queue.length || mirrored) persist();
      return;
    }
    if (sending || Date.now() < retryAt) return;
    sending = true;
    const batch = queue.slice(0, PER_POST);
    const done = (ok: boolean, drop: boolean) => {
      sending = false;
      if (ok || drop) { const gone = new Set(batch); queue = queue.filter(e => !gone.has(e)); retryAt = 0; if (mirrored) persist(); }
      else { retryAt = Date.now() + RETRY_AFTER; queue = capBacklog(queue); persist(); }
      if (queue.length >= FLUSH_AT && !retryAt) flush(); else arm();
    };
    fetch(URL_, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: deviceId(), events: batch }) })
      // A refusal (bad request, too large) will never succeed, so drop those events; a server error or no network keeps them.
      .then(res => done(res.ok, !res.ok && res.status < 500), () => done(false, false));
  } catch { sending = false; }
}

function start() {
  started = true;
  try {
    const old = JSON.parse(store.get(UNSENT) ?? '[]') as Ev[];
    if (Array.isArray(old) && old.length) { queue = capBacklog([...old.filter(e => e && typeof e.type === 'string' && typeof e.t === 'number'), ...queue]); mirrored = true; }
  } catch { /* unreadable backlog: ignore */ }
  if (typeof addEventListener !== 'function') return;
  addEventListener('pagehide', () => flush(true));
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('error', e => { try { track('error', { message: String(e.message), source: `${(e.filename ?? '').split('/').pop()}:${e.lineno ?? 0}`, stack: String(e.error?.stack ?? '').slice(0, 500) }); } catch { /* ignore */ } });
  addEventListener('unhandledrejection', e => {
    try { const r = e.reason; track('error', { message: String(r?.message ?? r), source: 'promise', stack: String(r?.stack ?? '').slice(0, 500) }); } catch { /* ignore */ }
  });
}

/** Record something. Safe to call anywhere; returns immediately. */
export function track(type: string, data?: object) {
  try {
    if (!started) start();
    queue.push({ t: Date.now(), ...(ctx.who ? { who: ctx.who } : {}), ...(ctx.session ? { session: ctx.session } : {}), type, ...(data ? { data } : {}) });
    if (queue.length > MAX_BACKLOG) queue = capBacklog(queue);
    if (queue.length >= FLUSH_AT) flush(); else arm();
  } catch { /* telemetry must never break the game */ }
}

// ---------- Time inside a word ----------
let wordAt = 0;
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
/** Call when a word begins; wordMs() then gives milliseconds since. */
export function markWord() { wordAt = now(); }
export const wordMs = () => Math.round(now() - wordAt);
/** An event inside a word: adds `ms` since the word started. */
export const trackWord = (type: string, data: object = {}) => track(type, { ...data, ms: wordMs() });

/** Facts about this page load for the app_load event. */
export function pageInfo() {
  try {
    const script = [...document.scripts].map(s => s.src).find(s => /\/assets\/[^/]+\.js/.test(s));
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
      ua: nav.userAgent, w: innerWidth, h: innerHeight, standalone: Boolean(nav.standalone) || matchMedia('(display-mode: standalone)').matches,
      onLine: nav.onLine, build: script ? script.split('/').pop() : 'dev',
    };
  } catch { return {}; }
}
