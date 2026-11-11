// Reads the game's event log straight from the database (read-only).
//   node tools/events.mjs [--db path] [--who id] [--device id] [--since 2h|1d] [--type t] [--tail n]   recent events, one per line
//   node tools/events.mjs --summary [--who id] [--since 7d]                                           per-child digest
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = resolve(opt('db') ?? join(here, '..', 'data', 'robo2.sqlite3'));
const span = /^(\d+(?:\.\d+)?)([smhd])$/.exec(opt('since') ?? '');
if (opt('since') && !span) { console.error('--since looks like 90s, 30m, 2h or 1d'); process.exit(2); }
const since = span ? Date.now() - Number(span[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[span[2]] : 0;
const tailArg = opt('tail'), tail = tailArg === undefined ? 100 : Number(tailArg);

let db;
try { db = new DatabaseSync(dbPath, { readOnly: true }); } catch (e) { console.error(`Cannot open ${dbPath}: ${e.message}`); process.exit(1); }
const where = ['t >= ?'], params = [since];
for (const k of ['who', 'type', 'device']) if (opt(k)) { where.push(`${k} = ?`); params.push(opt(k)); }
let rows;
try {
  const limit = flag('summary') || tail <= 0 ? '' : ` LIMIT ${Math.floor(tail)}`;
  rows = db.prepare(`SELECT t, device, who, session, type, data FROM events WHERE ${where.join(' AND ')} ORDER BY t DESC, id DESC${limit}`).all(...params).reverse();
} catch (e) { console.error(/no such table/.test(e.message) ? 'No event log in this database yet (the server creates it when it is restarted with the new code).' : e.message); process.exit(1); }
rows = rows.map(r => ({ ...r, d: r.data ? JSON.parse(r.data) : {} }));

const pad = n => String(n).padStart(2, '0');
const stamp = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const compact = d => Object.entries(d).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ');
const secs = ms => `${(ms / 1000).toFixed(1)}s`;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const count = (list, key) => list.reduce((o, x) => { const k = key(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const counts = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';

if (!flag('summary')) {
  for (const r of rows) console.log(`${stamp(r.t)} ${r.device ?? '-'} ${r.who ?? '-'} ${r.type} ${compact(r.d)}`.trimEnd());
  if (!rows.length) console.error('No events.');
  process.exit(0);
}

if (!rows.length) { console.log('No events.'); process.exit(0); }
console.log(`Events ${stamp(rows[0].t)} to ${stamp(rows.at(-1).t)}: ${rows.length}\n`);
const holds = rows.filter(r => r.type === 'hold');
if (holds.length) {
  console.log('Press-and-hold button, by device:');
  for (const [dev, list] of Object.entries(Object.groupBy(holds, r => r.device ?? '-')))
    console.log(`  ${dev}: ${counts(count(list, r => r.d.outcome))}; pointercancel seen ${list.filter(r => r.d.cancel).length}; pointer ${counts(count(list, r => r.d.pointerType))}`);
  console.log('');
}
const loads = rows.filter(r => r.type === 'app_load');
if (loads.length) console.log(`Page loads: ${loads.length} (${counts(count(loads, r => r.device ?? '-'))}); builds ${counts(count(loads, r => r.d.build))}\n`);

for (const [who, list] of Object.entries(Object.groupBy(rows, r => r.who ?? '(no child)'))) {
  const of = t => list.filter(r => r.type === t);
  const ends = of('word_end'), starts = of('session_start'), sEnds = of('session_end');
  console.log(`== ${who} ==`);
  console.log(`Sessions: ${starts.length} started (${counts(count(starts, r => r.d.kind))}), ${sEnds.length} finished (${counts(count(sEnds, r => r.d.outcome))}), ${of('session_exit').length} left early`);
  const times = ends.map(r => r.d.ms).filter(Number.isFinite);
  console.log(`Words: ${ends.length}, ${ends.filter(r => r.d.correct).length} right; median ${secs(median(times))}, slowest ${secs(Math.max(0, ...times))}`);
  const slow = [...ends].filter(r => Number.isFinite(r.d.ms)).sort((a, b) => b.d.ms - a.d.ms).slice(0, 10);
  if (slow.length) console.log('Slowest words:\n' + slow.map(r => `  ${secs(r.d.ms).padStart(7)}  ${r.d.word}${r.d.correct ? '' : ' (missed)'}${r.d.hints ? ` hints ${r.d.hints}` : ''}  ${stamp(r.t)}`).join('\n'));
  const hints = ends.reduce((n, r) => n + (r.d.hints ?? 0), 0), shown = ends.filter(r => r.d.shown).length;
  console.log(`Hints: ${hints} (${(ends.length ? hints / ends.length : 0).toFixed(2)} per word); words where the answer was shown: ${shown}; hear taps ${of('hear').length}; Robo pokes ${of('robo_poke').length}`);
  const byWord = Object.groupBy(ends, r => r.d.word), hinted = Object.entries(byWord).map(([w, l]) => [w, l.reduce((n, r) => n + (r.d.hints ?? 0), 0)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (hinted.length) console.log('Most hints: ' + hinted.map(([w, n]) => `${w} ${n}`).join(', '));
  const missed = Object.entries(byWord).map(([w, l]) => [w, l, l.filter(r => !r.d.correct).length + l.reduce((n, r) => n + (r.d.wrong?.length ?? 0), 0)]).filter(x => x[2]).sort((a, b) => b[2] - a[2]).slice(0, 10);
  if (missed.length) console.log('Most missed words (wrong tries; what was written):\n' + missed.map(([w, l, n]) => `  ${w.padEnd(12)} ${String(n).padStart(2)}  ${[...new Set(l.flatMap(r => r.d.wrong ?? []))].slice(0, 6).join(', ')}`).join('\n'));
  const robot = of('robot_cmd');
  console.log(`Robot commands: ${robot.length ? counts(count(robot, r => r.d.out)) : 'none'}${of('robot_status').length ? `; status checks ${counts(count(of('robot_status'), r => r.d.status))}` : ''}`);
  const audio = of('audio');
  console.log(`Errors: ${of('error').length}; audio problems: ${audio.length}${audio.length ? ` (${counts(count(audio, r => `${r.d.path} [${r.d.reason}]`))})` : ''}\n`);
}
