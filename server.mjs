// Serves the built game and keeps each child's progress in SQLite on this computer.
//   node server.mjs --port 8000 [--db path]
import { createServer } from 'node:http';
import { createReadStream, mkdirSync } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', '8000'));
const dbPath = resolve(arg('db', join(here, 'data', 'robo2.sqlite3')));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
// Event log (telemetry): what the game recorded about play, Tiny, audio and errors. Kept 90 days.
db.exec(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, t INTEGER NOT NULL, device TEXT, who TEXT, session TEXT, type TEXT NOT NULL, data TEXT);
  CREATE INDEX IF NOT EXISTS events_t ON events (t); CREATE INDEX IF NOT EXISTS events_who_t ON events (who, t)`);
const pruneEvents = () => { try { db.prepare('DELETE FROM events WHERE t < ?').run(Date.now() - 90 * 864e5); } catch (error) { console.error(error); } };
pruneEvents(); setInterval(pruneEvents, 864e5).unref();
const EVENTS_MAX_BYTES = 256 * 1024, EVENTS_MAX_COUNT = 500;
const dist = join(here, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readBody(req, max = 2_000_000) {
  const chunks = []; let total = 0;
  // Keep reading (and discarding) an oversize body so the client gets the 413 instead of a reset connection.
  for await (const chunk of req) { total += chunk.length; if (total > 16 * max) req.destroy(); else if (total <= max) chunks.push(chunk); }
  if (total > max) throw Object.assign(new Error('Too large'), { status: 413 });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
const text = (v, max) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);
/** One event from the game: {t, who?, session?, type, data?}. Returns the row to store, or undefined if it is malformed. */
function eventRow(e, device) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || !Number.isFinite(e.t) || e.t < 0 || typeof e.type !== 'string' || !e.type || e.type.length > 40 || !text(e.who, 40) || !text(e.session, 40)) return;
  let data = null;
  if (e.data !== undefined && e.data !== null) {
    if (typeof e.data !== 'object') return;
    data = JSON.stringify(e.data);
    if (data.length > 8000) return;
  }
  return [Math.round(e.t), device, e.who ?? null, e.session ?? null, e.type, data];
}
function storeEvents(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.events) || !text(body.device, 60)) return { status: 400, error: 'Expected {device, events: [...]}' };
  if (body.events.length > EVENTS_MAX_COUNT) return { status: 400, error: `At most ${EVENTS_MAX_COUNT} events per post` };
  const rows = body.events.map(e => eventRow(e, body.device ?? null));
  if (rows.includes(undefined)) return { status: 400, error: 'Malformed event' };
  const insert = db.prepare('INSERT INTO events (t, device, who, session, type, data) VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try { for (const row of rows) insert.run(...row); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { status: 200, n: rows.length };
}
function listEvents(q) {
  const where = [], args = [];
  for (const k of ['who', 'type', 'device']) if (q.has(k)) { where.push(`${k} = ?`); args.push(q.get(k)); }
  if (q.has('since')) { const since = Number(q.get('since')); if (!Number.isFinite(since)) return; where.push('t >= ?'); args.push(since); }
  const asked = q.has('limit') ? Number(q.get('limit')) : 200;
  if (!Number.isFinite(asked)) return;
  args.push(Math.min(5000, Math.max(1, Math.floor(asked))));
  const rows = db.prepare(`SELECT id, t, device, who, session, type, data FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t DESC, id DESC LIMIT ?`).all(...args);
  return rows.map(r => { let data = null; try { data = r.data ? JSON.parse(r.data) : null; } catch { /* keep null */ } return { ...r, data }; });
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost'), path = decodeURIComponent(url.pathname);
    if (path === '/api/profiles' && req.method === 'GET')
      return json(res, 200, { profiles: db.prepare('SELECT data FROM profiles').all().map(row => JSON.parse(row.data)) });
    const put = /^\/api\/profiles\/([a-z0-9_-]{1,40})$/.exec(path);
    if (put && req.method === 'PUT') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin writes are not allowed' });
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.id !== put[1]) return json(res, 400, { error: 'Profile id does not match' });
      if (typeof body.name !== 'string' || body.name.length > 40) return json(res, 400, { error: 'A profile needs a name (up to 40 characters)' });
      db.prepare('INSERT INTO profiles (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .run(put[1], JSON.stringify(body), new Date().toISOString());
      return json(res, 200, { ok: true });
    }
    if (put && req.method === 'DELETE') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin writes are not allowed' });
      const out = db.prepare('DELETE FROM profiles WHERE id = ?').run(put[1]);
      return out.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such profile' });
    }
    if (path === '/api/events' && req.method === 'GET') {
      const events = listEvents(url.searchParams);
      return events ? json(res, 200, { events }) : json(res, 400, { error: 'since and limit must be numbers' });
    }
    if (path === '/api/events' && req.method === 'POST') { // text/plain too: navigator.sendBeacon sends a string that way
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin writes are not allowed' });
      const out = storeEvents(await readBody(req, EVENTS_MAX_BYTES));
      return out.error ? json(res, out.status, { error: out.error }) : json(res, 200, { ok: true, n: out.n });
    }
    if (path.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    const base = await realpath(dist);
    let file;
    try { file = await realpath(resolve(base, '.' + (path === '/' ? '/index.html' : path))); } catch { return json(res, 404, { error: 'Not found' }); }
    if (file !== base && !file.startsWith(base + sep)) return json(res, 403, { error: 'Forbidden' });
    const info = await stat(file);
    if (!info.isFile()) return json(res, 404, { error: 'Not found' });
    const type = mime[extname(file)] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.startsWith('/audio/') || path.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache' };
    // Safari asks for audio in byte ranges and will not play it without a 206 answer.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res);
  } catch (error) {
    if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : 'Server error' });
    if (!error.status) console.error(error);
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Robo Words on http://localhost:${port} (progress in ${dbPath})`));
