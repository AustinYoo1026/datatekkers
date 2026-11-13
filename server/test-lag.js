// Online prediction under artificial latency. Starts the server and connects node clients that run the very same
// prediction core as the browser (ISO.Net.Predictor), with every message delayed each way.
//   node test-lag.js [delayMs=50] [jitterMs=10]        (one-way delay; the round trip is twice that)
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C;
const DELAY = process.argv[2] != null ? +process.argv[2] : 50, JITTER = process.argv[3] != null ? +process.argv[3] : 10;
const STEP_MS = (C.STEP / C.SPEED) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
const fail = (m) => { console.error('FAIL', m); for (const s of servers) s.kill(); process.exit(1); };
setTimeout(() => fail('timeout'), 90000);

// PROTO=2 makes this client speak protocol 2 (deltas). expand() rebuilds the full snapshot into m.n (a private copy) and fills a missing
// m.inp from the previous one, so the checks below are the same as for protocol 1; the Predictor gets the untouched delta message.
const PROTO = +process.env.PROTO >= 2 ? +process.env.PROTO : 1;
function expand(c, m) {
  if (PROTO < 2) return m;
  const raw = JSON.parse(JSON.stringify(m));
  if (!c.follow) c.follow = ISO.Net.follower();
  if (!c.follow(m)) fail('a delta arrived without its base');
  m.n = JSON.parse(JSON.stringify(m.n));
  if (m.inp) c.lastInp = m.inp; else m.inp = c.lastInp;
  return raw;
}

function server(env) {
  const port = 18600 + ((Math.random() * 800) | 0);
  const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: port, HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  servers.push(srv);
  return new Promise((r) => srv.stdout.once('data', () => r(port)));
}

// a link that delays every message by DELAY +- JITTER ms and keeps them in order, like TCP does
function delayed(deliver) {
  const fifo = [];
  let last = 0;
  const drain = () => { while (fifo.length && fifo[0].at <= performance.now() + 0.5) deliver(fifo.shift().x); };
  return (x) => {
    const at = Math.max(last, performance.now() + DELAY + (Math.random() * 2 - 1) * JITTER);
    last = at; fifo.push({ at, x });
    setTimeout(drain, Math.max(0, at - performance.now()) + 1);
  };
}

function client(port, name, pick) {
  const c = { name, G: null, P: null, me: 0, sample: () => null, step: 0, onSnap: null, events: [], on: null };
  c.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const up = delayed((s) => { if (c.ws.readyState === 1) c.ws.send(s); });
  c.send = (m) => up(JSON.stringify(m));
  const down = delayed((m) => {
    if (m.t === 'room') c.me = m.you;
    if (m.t === 'start') {
      c.G = ISO.Game.create({ roster: m.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin, p.celeb)) });
      c.G.players.forEach((p, i) => { p.moves = m.moves[i] ? new Set(m.moves[i]) : null; });
      c.P = ISO.Net.Predictor({ me: c.me, send: c.send, resync: () => c.send({ t: 'key' }) });
    }
    if (m.t === 's' && c.P) { const raw = expand(c, m); if (c.onSnap) c.onSnap(m); c.P.onSnapshot(raw); }
    if (c.on) c.on(m);
  });
  c.ws.on('message', (raw) => down(JSON.parse(raw)));
  let last = performance.now();
  c.timer = setInterval(() => {                       // the "display": ~60 frames a second
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!c.P) return;
    c.P.frame(c.G, dt, () => c.sample(++c.step));
    for (const e of c.G.events) c.events.push(e.p === c.G.players[c.me] ? 'own:' + e.type : e.type);
    c.G.events.length = 0;
  }, 16);
  c.open = new Promise((r) => c.ws.on('open', r));
  c.join = (m) => c.send({ name, pick, ...(PROTO >= 2 ? { v: PROTO } : {}), ...m });
  c.close = () => { clearInterval(c.timer); c.ws.close(); };
  return c;
}
const zero = (P) => { for (const k in P.stats) P.stats[k] = 0; };
const report = (label, P) => {
  const s = P.stats, secs = s.steps * STEP_MS / 1000;
  console.log(label.padEnd(26), 'own err mean', (s.errSum / s.errN).toFixed(3), 'max', s.errMax.toFixed(2), 'px, nonzero', s.errBig + '/' + s.errN,
    '| others mean', (s.othSum / s.errN).toFixed(2), 'max', s.othMax.toFixed(1), 'px',
    '| predicted', (s.lag / s.snaps).toFixed(1), 'steps =', (s.lag / s.snaps * STEP_MS).toFixed(0), 'ms',
    '| server queue mean', (s.qSum / Math.max(1, s.qN)).toFixed(2), 'steps, dry', s.starved + '/' + s.snaps, 'snaps (' + (s.starved / secs).toFixed(1) + '/s)',
    '| stalls', s.stalls, '| resyncs', s.resyncs || 0, '| rate', P.rate.toFixed(3));
};
// a human-ish pattern: a new direction every 0.3 - 0.8 s, sometimes sprinting, sometimes standing
function wander(seed, buttons, pr) {
  let r = seed, until = 0, cur = { mx: 0, my: 0 };
  const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) | 0) >>> 8) / 16777216;
  return (n) => {
    if (n >= until) {
      until = n + 20 + ((rnd() * 40) | 0);
      const a = rnd() * Math.PI * 2, still = rnd() < 0.15;
      cur = { mx: still ? 0 : Math.cos(a), my: still ? 0 : Math.sin(a), sprint: rnd() < 0.5 };
    }
    const o = { ...cur };
    if (buttons && rnd() < (pr || 0.02)) o[['shoot', 'pass', 'j', 'k', 'finesse'][(rnd() * 5) | 0]] = true;
    return o;
  };
}
async function pair(port) {
  const a = client(port, 'Ann', { id: 'messi' }), b = client(port, 'Bob', { id: 'ronaldo', prime: true });
  await a.open; await b.open;
  const code = await new Promise((r) => { a.on = (m) => m.t === 'room' && r(m.code); a.join({ t: 'create' }); });
  b.join({ t: 'join', code });
  const t0 = Date.now();
  while (!(a.G && b.G && a.G.phase === 'play' && b.G.phase === 'play')) { await sleep(50); if (Date.now() - t0 > 15000) fail('match did not start'); }
  return [a, b];
}

(async () => {
  console.log('one-way delay', DELAY, '+-', JITTER, 'ms (round trip ~' + 2 * DELAY + ' ms =', (2 * DELAY / STEP_MS).toFixed(1), 'steps); one step =', STEP_MS.toFixed(1), 'ms');
  // ---- 1 + 2: prediction error and queue delay, at the normal snapshot rate
  {
    const [a, b] = await pair(await server({}));
    await sleep(1500);                                   // let the clocks settle
    // (1) the opponent stands still: everything this client predicts is exact
    a.sample = wander(7, true); b.sample = () => null;
    await sleep(500); zero(a.P); zero(b.P);
    await sleep(8000);
    report('A moves, B stands still:', a.P);
    const s1 = { ...a.P.stats };
    // (2) both move and press buttons: the others are guessed from their last known input
    b.sample = wander(99, true); a.sample = wander(21, true, 0.05);
    await sleep(500); zero(a.P); zero(b.P);
    const OWN = { kick: 1, skill: 1, lunge: 1, fake: 1, stop: 1, burst: 1 }, srvOwn = {}, h0 = a.events.length;
    a.onSnap = (m) => { for (const e of m.n.ev) if (OWN[e.type] && e.p && e.p.$p === a.me) srvOwn[e.type] = (srvOwn[e.type] || 0) + 1; };
    await sleep(8000);
    report('both move: A', a.P); report('both move: B', b.P);
    const d = Math.hypot(a.G.ball.x - b.G.ball.x, a.G.ball.y - b.G.ball.y);
    await sleep(400);
    const heard = a.events.slice(h0).filter((t) => OWN[t.slice(4)]).reduce((o, t) => (o[t.slice(4)] = (o[t.slice(4)] || 0) + 1, o), {});
    console.log("A's own kick/skill/lunge/fake events: server sent", JSON.stringify(srvOwn), 'A played', JSON.stringify(heard));
    for (const t in OWN) if (Math.abs((srvOwn[t] || 0) - (heard[t] || 0)) > 1) fail('own events do not match the server: ' + t);
    if (a.G.phase === b.G.phase && a.G.phase === 'play' && d > 150) fail('clients disagree about the ball by ' + d.toFixed(0));
    if (s1.errSum / s1.errN > 0.25) fail('own-player prediction error too large: ' + (s1.errSum / s1.errN));
    if (s1.stalls) fail('prediction stalled');
    if (s1.qSum / s1.qN > 4) fail('server queue too long');
    a.close(); b.close();
  }
  // ---- 3: a tap that lasts a single client step always reaches the simulation (server sends every step here, so every applied input is visible)
  {
    const [a, b] = await pair(await server({ SEND_EVERY: 1 }));
    const taps = new Map(); let seen = 0, lost = 0, burst = 0;
    const move = wander(3, false);
    let tapping = true;
    a.sample = (n) => { const o = move(n); if (tapping && n % 9 === 0) { o.lob = true; taps.set(a.P.seq + 1, false); } return o; };
    a.onSnap = (m) => {
      const ack = m.ack[a.me], on = !!(m.inp[a.me] && m.inp[a.me].lob);
      for (const [n] of taps) if (n <= ack) { taps.delete(n); if (on) seen++; else lost++; }       // the first step at or past the tap must carry it
    };
    await sleep(5000);
    // bursts: ten steps arrive at once (a hitch), the server has to skip some, the tap in the first of them must survive
    for (let i = 0; i < 12; i++) { a.P.frame(a.G, 10 * C.STEP / C.SPEED, () => a.sample(++a.step)); a.G.events.length = 0; burst++; await sleep(300); }
    tapping = false; await sleep(800);
    console.log('single-step taps: applied', seen, 'lost', lost, 'unresolved', taps.size, '(incl.', burst, 'bursts of 10 steps)');
    if (lost || taps.size || seen < 40) fail('taps lost');
    a.close(); b.close();
  }
  console.log('OK');
  for (const s of servers) s.kill();
  process.exit(0);
})();
