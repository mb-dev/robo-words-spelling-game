// A pretend Tiny for testing the game without the robot: node tools/fake-tiny.mjs [port]
// Then on the grown-ups page choose the robot "Fake mTiny" (its address, http://localhost:8766, is filled in)
// Logs every request with its decoded steps. Add ?busy=1 to /api/moves to see the 409 path; set BUSY_MS to simulate a move that takes time.
import http from 'node:http';

const port = Number(process.argv[2] ?? 8766), BUSY_MS = Number(process.env.BUSY_MS ?? 0);
let busyUntil = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const t = new Date().toLocaleTimeString();
  if (url.pathname === '/api/status') { console.log(t, 'status'); return send(200, { ok: true, result: { ready: true, busy: Date.now() < busyUntil } }); }
  if (url.pathname === '/api/moves') {
    let steps; try { steps = JSON.parse(url.searchParams.get('steps') ?? '[]'); } catch { return send(400, { ok: false, error: 'ValueError: bad steps' }); }
    if (Date.now() < busyUntil || url.searchParams.has('busy')) { console.log(t, '409 busy, refused', JSON.stringify(steps)); return send(409, { ok: false, error: 'Busy' }); }
    console.log(t, 'moves\n' + steps.map(s => '   ' + JSON.stringify(s)).join('\n'));
    busyUntil = Date.now() + BUSY_MS;
    return setTimeout(() => send(200, { ok: true, result: null }), BUSY_MS);
  }
  console.log(t, '404', req.url); send(404, { ok: false, error: 'unknown command' });
}).listen(port, () => console.log(`fake Tiny on http://localhost:${port}`));
