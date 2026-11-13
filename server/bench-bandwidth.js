// Bandwidth benchmark for the online snapshot stream.
//   node bench-bandwidth.js                  offline, seeded and reproducible: bytes per snapshot body, full JSON vs delta
//   node bench-bandwidth.js --live [--proto=1|2]    spawns the server and plays 1v1 and 2v2 with node clients (20 s each); env WS_DEFLATE=1 turns permessage-deflate on (default off)
// Prints a table and one final JSON line.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'ai', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C;
const args = process.argv.slice(2), flag = (n) => args.find((a) => a.startsWith('--' + n + '='));
const LIVE = args.includes('--live'), PROTO = +(flag('proto') || '--x=1').split('=')[1] || 1;
const SEND_EVERY = Math.max(1, +process.env.SEND_EVERY || 2), KEY_EVERY = +process.env.KEY_EVERY || 144, HZ = 120 * C.SPEED / SEND_EVERY;
const STEPS = 4320;
const stats = (a) => { const s = a.slice().sort((x, y) => x - y); return { mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length), p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }; };
const kbs = (b) => +(b * HZ / 1000).toFixed(1);

// ------------------------------------------------------------------ offline
function offline(four) {
  const roster = (four ? [0, 1, 2, 3] : [0, 1]).map((i) => ISO.PLAYERS[(i * 5 + 1) % ISO.PLAYERS.length]);
  const G = ISO.Game.create({ roster, seed: 4242, kickoff: 0, replay: true, moves: roster.map(() => new Set(Object.keys(ISO.Game.SKILLS))) });
  const ai = roster.map((_, i) => ISO.AI.create(['hard', 'normal', 'easy'][i % 3]));
  const full = [], delta = []; let base = null, flushes = 0, events = [];
  for (let s = 1; s <= STEPS && G.phase !== 'end'; s++) {
    const inp = G.players.map((p, i) => ISO.Net.sanitizeInput(ISO.Net.packInput(ISO.AI.update(G, p, ai[i], C.STEP))));
    ISO.Game.step(G, inp);
    for (const e of G.events) events.push(e); G.events.length = 0;
    if (s % SEND_EVERY) continue;
    const snap = ISO.Net.snapshot(G, events); events = [];
    full.push(JSON.stringify(snap).length);
    if (ISO.Net.diff) {
      const ev = snap.ev; delete snap.ev;
      const key = !base || flushes % KEY_EVERY === 0;
      delta.push(key ? JSON.stringify(Object.assign({}, snap, { ev })).length : JSON.stringify({ d: ISO.Net.diff(base, snap, PROTO >= 3), ev }).length);
      base = snap; flushes++;
    }
  }
  const r = { snapshots: full.length, full: Object.assign(stats(full), { kbs: kbs(stats(full).mean) }) };
  if (delta.length) r.delta = Object.assign(stats(delta), { kbs: kbs(stats(delta).mean) });
  return r;
}

// ------------------------------------------------------------------ live
const freePort = () => new Promise((res, rej) => { const l = require('net').createServer(); l.on('error', rej); l.listen(0, '127.0.0.1', () => { const p = l.address().port; l.close(() => res(p)); }); });
async function server(env) {
  const port = await freePort();
  const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: port, HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r, j) => { srv.stdout.once('data', r); srv.once('exit', () => j(new Error('server died'))); });
  return { port, srv };
}
function wander(seed) {
  let r = seed, until = 0, cur = { mx: 0, my: 0 };
  const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) | 0) >>> 8) / 16777216;
  return (n) => {
    if (n >= until) { until = n + 20 + ((rnd() * 40) | 0); const a = rnd() * Math.PI * 2; cur = { mx: Math.cos(a), my: Math.sin(a), sprint: rnd() < 0.5 }; }
    const o = { ...cur };
    if (rnd() < 0.03) o[['shoot', 'pass', 'j', 'k'][(rnd() * 4) | 0]] = true;
    return o;
  };
}
function liveClient(port, name, pick, seed) {
  const WebSocket = require('ws');
  const c = { me: 0, G: null, P: null, snaps: 0, step: 0, sample: wander(seed) };
  c.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  c.send = (m) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'room') c.me = m.you;
    if (m.t === 'start') {
      c.G = ISO.Game.create({ roster: m.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin, p.celeb)) });
      c.G.players.forEach((p, i) => { p.moves = m.moves[i] ? new Set(m.moves[i]) : null; });
      c.P = ISO.Net.Predictor({ me: c.me, send: c.send, resync: () => c.send({ t: 'key' }) });
    }
    if (m.t === 's' && c.P) { c.snaps++; c.P.onSnapshot(m); }
    if (c.on) c.on(m);
  });
  let last = performance.now();
  c.timer = setInterval(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (c.P) { c.P.frame(c.G, dt, () => c.sample(++c.step)); c.G.events.length = 0; }
  }, 16);
  c.open = new Promise((r) => c.ws.on('open', r));
  c.join = (m) => c.send({ name, pick, v: PROTO, ...m });
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function live(four, secs) {
  const { port, srv } = await server({});
  try {
    const picks = ['messi', 'ronaldo', 'neymar', 'mbappe'].slice(0, four ? 4 : 2);
    const cl = picks.map((id, i) => liveClient(port, 'B' + i, { id }, 7 + i * 31));
    await Promise.all(cl.map((c) => c.open));
    const code = await new Promise((r) => { cl[0].on = (m) => m.t === 'room' && r(m.code); cl[0].join({ t: 'create', mode: four ? '2v2' : '1v1' }); });
    cl.slice(1).forEach((c) => c.join({ t: 'join', code }));
    for (let t = 0; !cl.every((c) => c.G && c.G.phase === 'play'); t++) { await sleep(50); if (t > 300) throw new Error('match did not start'); }
    await sleep(1000);
    const c = cl[0], s0 = c.ws._socket.bytesRead, w0 = c.ws._socket.bytesWritten, n0 = c.snaps, st0 = { ...c.P.stats }, t0 = Date.now();
    await sleep(secs * 1000);
    const dt = (Date.now() - t0) / 1000, st = c.P.stats, d = (k) => st[k] - st0[k];
    const out = { down_Bps: Math.round((c.ws._socket.bytesRead - s0) / dt), up_Bps: Math.round((c.ws._socket.bytesWritten - w0) / dt), snaps_per_s: +((c.snaps - n0) / dt).toFixed(1),
      own_err_mean: +(d('errSum') / Math.max(1, d('errN'))).toFixed(3), own_err_max: +st.errMax.toFixed(2), others_mean: +(d('othSum') / Math.max(1, d('errN'))).toFixed(2),
      stalls: d('stalls'), starved: d('starved'), snaps: d('snaps'), resyncs: st.resyncs || 0 };
    cl.forEach((x) => { clearInterval(x.timer); x.ws.close(); });
    return out;
  } finally { srv.kill(); }
}

(async () => {
  if (!LIVE) {
    const r = { mode: 'offline', hz: HZ, steps: STEPS, '1v1': offline(false), '2v2': offline(true) };
    for (const k of ['1v1', '2v2']) for (const f of ['full', 'delta']) if (r[k][f]) console.log(k.padEnd(4), f.padEnd(6), 'mean', r[k][f].mean, 'B  p95', r[k][f].p95, ' max', r[k][f].max, ' =', r[k][f].kbs, 'KB/s at', HZ, 'Hz');
    console.log(JSON.stringify(r)); process.exit(0);
  }
  const secs = +process.env.LIVE_SECS || 20, r = { mode: 'live', proto: PROTO, deflate: process.env.WS_DEFLATE === '1', secs };
  r['1v1'] = await live(false, secs); r['2v2'] = await live(true, secs);
  for (const k of ['1v1', '2v2']) console.log(k, JSON.stringify(r[k]));
  console.log(JSON.stringify(r)); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
