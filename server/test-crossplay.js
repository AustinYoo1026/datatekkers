// Crossplay check: one match, some players on the Classic 2D view and some on the 3D view.
//   node test-crossplay.js [delayMs=25] [jitterMs=6]
//
// The two views differ in exactly one thing the simulation can see: the inputs they produce. A 2D player sends 0 / +-1
// movement and a cursor on the flat pitch; a 3D player sends movement rotated into the camera's frame (fractions) and a
// cursor unprojected through a perspective camera. This runs the real 3D input code (js/3d/camera3d.js mapInput /
// unproject, fed by js/3d/adapter.js: Three.js maths works without WebGL) and checks:
//
//   A  input form (no server)   every 3D input is already in the wire form, at full pace, and falls on the same side of
//                               the sim's shooting thresholds as the 2D input for the same keys; the key frame is latched;
//                               the cursor aims where the 2D cinematic view would aim it; a wing shot goes the same way
//   B  1v1 through the server   seat 0 on 2D, seat 1 on 3D, both predicting with ISO.Net.Predictor
//   C  2v2 through the server   seats 0 / 2 on 2D, seats 1 / 3 on 3D
//
// In B and C: what a client simulated with is what the server stepped with (bit for bit); the server's match re-simulates
// exactly from its snapshots and the reported inputs (so the outcome depends on nothing but those inputs); while inputs
// are steady every client's predicted state equals the server's state for that step exactly; and every client hears the
// same events.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
{ const w = console.warn; console.warn = () => {}; globalThis.THREE = require(path.join(ROOT, 'js', 'vendor', 'three.min.js')); console.warn = w; }
for (const f of ['coords', 'adapter', 'camera3d']) require(path.join(ROOT, 'js', '3d', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C, Net = ISO.Net, Game = ISO.Game, R3D = ISO.R3D, K = R3D.K, THREE = globalThis.THREE;
const DELAY = process.argv[2] != null ? +process.argv[2] : 25, JITTER = process.argv[3] != null ? +process.argv[3] : 6;
const GCY = (C.GY0 + C.GY1) / 2, VW = 1280, VH = 720;
// The Classic view's layout (Z, OX, OY): the two lines of js/render.js that compute it are evaluated here, so this cannot drift from the client.
const { Z: Z2, OX, OY } = (() => {
  const src = require('fs').readFileSync(path.join(ROOT, 'js', 'render.js'), 'utf8'), l1 = src.match(/^\s*(const BACK = [^\n]*)$/m), l2 = src.match(/^\s*(const Z = [^\n]*)$/m);
  if (!l1 || !l2) throw new Error('js/render.js layout lines not found');
  return new Function('C', 'FW', 'FH', 'GD', l1[1] + '\n' + l2[1] + '\nreturn { Z, OX, OY };')(C, C.FW, C.FH, C.GD);
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
let failed = 0;
let stage = 'start';                 // where the run is, for the failure message of a stall
const killAll = () => { for (const s of servers) { try { s.kill('SIGKILL'); } catch (e) { /* already gone */ } } };
const stop = (code) => { killAll(); process.exit(code); };
const fail = (m) => { console.error('FAIL', m, '[stage: ' + stage + ']'); stop(1); };
const check = (ok, m) => { if (!ok) { failed++; console.error('  FAIL', m); } return ok; };
process.on('exit', killAll);         // whatever ends the run, no spawned server outlives it
process.on('SIGINT', () => stop(130)); process.on('SIGTERM', () => stop(143));
process.on('uncaughtException', (e) => fail('uncaught ' + (e && e.stack || e)));
process.on('unhandledRejection', (e) => fail('unhandled rejection ' + (e && e.stack || e)));
setTimeout(() => fail('overall timeout (150 s)'), 150000);
// a promise that fails the run with a clear message when it has not settled in time
const within = (p, ms, what) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timed out after ' + ms + ' ms waiting for ' + what)), ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

// exact comparison of two plain values (NaN equals NaN, +0 does not equal -0), whatever the key order
function same(a, b) {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && same(a[k], b[k]));
  }
  return Object.is(a, b);
}
function firstDiff(a, b, p) {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) { const d = firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
    return null;
  }
  return Object.is(a, b) ? null : p + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b);
}
const wireJSON = (x) => JSON.parse(JSON.stringify(x));
const state = (G) => { const s = wireJSON(Net.snapshot(G, [])); delete s.ev; return s; };
// what the server steps with for a received input (server.js Room.input), and what the Predictor steps with (net.js)
const serverForm = (wire) => Net.sanitizeInput(Net.packInput(Net.sanitizeInput(wireJSON(wire))));
const clientForm = (raw) => Net.sanitizeInput(Net.packInput(raw));

// ------------------------------------------------------------------ the two views' input paths (js/main.js humanInput / mouseSim)
// keys: what ISO.Input.get returns (mx = right - left, my = down - up, buttons); cursor: canvas px, or null (mouse aim off)
function view2d() {
  return {
    kind: '2d', frame() {}, event() {},
    input(k, cur) {
      const o = { ...k, mx: -k.my, my: k.mx };
      if (cur) { o.ax = Math.round(C.FW - (cur.y - OY) / Z2) + 0; o.ay = Math.round((cur.x - OX) / Z2) + 0; }
      return o;
    },
  };
}
function view3d(me) {
  const cam = R3D.Camera.create(THREE);
  let t = 0;
  return {
    kind: '3d', cam,
    frame(G, dt) { t += dt; cam.update(R3D.Adapter.snapshot(G, { me }), dt, t); },
    event(G, e) { cam.onEvent(e, R3D.Adapter.vf); },
    input(k, cur) {
      const o = cam.mapInput(k), aim = cur && cam.unproject(cur.x, cur.y);
      if (aim) { o.ax = Math.round(aim.x) + 0; o.ay = Math.round(aim.y) + 0; }
      return o;
    },
  };
}
const KEYS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];      // [mx, my] as the keyboard gives them
const BTN = ['shoot', 'finesse', 'chip', 'lob', 'j', 'k', 'l', 'pass', 'tackle', 'slide', 'shoulder', 'focus', 'jockey'];
// a player: a new key combination every 0.25 - 0.8 s, buttons tapped and held, the cursor wandering (and sometimes off)
function bot(seed) {
  let r = seed | 0, until = 0, keys = KEYS[0], sprint = false, aimOn = false, held = null, heldTo = 0;
  const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) | 0) >>> 8) / 16777216, cur = { x: 640, y: 200 };
  return (n) => {
    if (n >= until) { until = n + 18 + ((rnd() * 40) | 0); keys = KEYS[(rnd() * KEYS.length) | 0]; sprint = rnd() < 0.5; aimOn = rnd() < 0.6; }
    if (held && n >= heldTo) held = null;
    if (!held && rnd() < 0.04) { held = BTN[(rnd() * BTN.length) | 0]; heldTo = n + 1 + ((rnd() * rnd() * 50) | 0); }
    cur.x = Math.max(0, Math.min(VW, cur.x + (rnd() - 0.5) * 60)); cur.y = Math.max(0, Math.min(VH, cur.y + (rnd() - 0.5) * 40));
    const k = { mx: keys[0], my: keys[1], sprint };
    if (held) { k[held] = true; if (held === 'j' || held === 'k' || held === 'l') k.skill = true; }
    return { k, cur: aimOn ? cur : null };
  };
}
const hold = (mx, my) => () => ({ k: { mx, my }, cur: null });
const idle = () => null;

// ================================================================== A: input form
function partA() {
  console.log('A. input form');
  const v = view3d(0), cam = v.cam, st = cam.st;
  const cls = (i) => {         // the sim's reading of a movement input when a shot is struck (game.js updatePlayer / shoot)
    let mx = i.mx || 0, my = i.my || 0; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const facing = mx > -0.3;
    return [ml > 0.15, facing, facing ? (my < -0.35 ? -1 : my > 0.35 ? 1 : 0) : 0].join();
  };
  let n = 0, notWire = 0, slow = 0, negZero = 0, off = 0, offAt = null, worst = 0;
  for (let yaw = -0.8; yaw <= 0.8001; yaw += 0.005) {
    for (const [mx, my] of KEYS) {
      st.yaw = yaw; cam.mapInput({ mx: 0, my: 0 });
      const o = cam.mapInput({ mx, my, sprint: true }), d2 = { mx: -my, my: mx }; n++;
      if (!same(Net.packInput(o), Net.packInput(clientForm(o))) || o.mx !== Net.packInput(o).mx || o.my !== Net.packInput(o).my || !same(clientForm(o), serverForm(Net.packInput(o)))) notWire++;
      if (Object.is(o.mx, -0) || Object.is(o.my, -0)) negZero++;
      if ((mx || my) && Math.hypot(o.mx, o.my) < 1) slow++;
      if (cls(o) !== cls(d2)) { off++; offAt = offAt || { yaw: +yaw.toFixed(3), keys: [mx, my], out: [o.mx, o.my] }; }
      if (mx || my) { let d = Math.atan2(o.my, o.mx) - Math.atan2(d2.my, d2.mx) - Math.max(-0.26, Math.min(0.26, yaw)); d = Math.atan2(Math.sin(d), Math.cos(d)); worst = Math.max(worst, Math.abs(d)); }
      if (!o.sprint) notWire++;
    }
  }
  console.log('  mapInput:', n, 'key / yaw cases | not in wire form', notWire, '| under full pace', slow, '| -0', negZero, '| other side of a shooting threshold than 2D', off, '| direction error after rounding', worst.toFixed(4), 'rad');
  check(!notWire, 'a 3D input is not in the wire form'); check(!slow, 'a full 3D key press is under full pace'); check(!negZero, 'mapInput produced -0');
  check(!off, 'a 3D input reads differently from the 2D one for the same keys: ' + JSON.stringify(offAt)); check(worst < 0.012, 'direction error ' + worst);

  // the key frame: latched while the keys are held, re-read when they change and on a camera cut
  st.yaw = 0.2; cam.mapInput({ mx: 0, my: 0 });
  const a0 = cam.mapInput({ mx: 0, my: -1 }); st.yaw = -0.25; const a1 = cam.mapInput({ mx: 0, my: -1 }), a2 = cam.mapInput({ mx: 1, my: -1 }), a3 = cam.mapInput({ mx: 0, my: -1 });
  check(a0.mx === a1.mx && a0.my === a1.my && a0.my > 0.15, 'a held key turned with the camera'); check(a3.my < -0.15 && a2.my !== a0.my, 'a new key combination did not re-read the camera');
  const G = Game.create({ roster: [ISO.playerById('messi'), ISO.playerById('ronaldo')], seed: 3 });
  cam.reset(); for (let i = 0; i < 90; i++) v.frame(G, 1 / 60);
  cam.mapInput({ mx: 0, my: 0 }); st.yaw = 0.3; const c0 = cam.mapInput({ mx: 0, my: -1 });
  cam.reset(); v.frame(G, 1 / 60); const c1 = cam.mapInput({ mx: 0, my: -1 });
  check(c0.my > 0.2 && Math.abs(c1.my) < 0.02, 'a camera cut left the held key in the old frame: ' + JSON.stringify([c0.my, c1.my]));

  // the cursor: on the turf it is the point under it; on the goal it is that spot on the goal line; never NaN, always sendable
  for (let i = 0; i < 90; i++) v.frame(G, 1 / 60);
  const pp = {}, w = {};
  let turf = 0, turfBad = 0, goal = 0, goalBad = 0, sky = 0, skyBad = 0, send = 0, sendBad = 0;
  for (let x = 30; x <= 330; x += 20) for (let y = 60; y <= 660; y += 30) {
    K.toWorld(x, y, 0, w); cam.project(w.x, 0, w.z, pp);
    if (!pp.visible || pp.x < 0 || pp.x > VW || pp.y < 0 || pp.y > VH) continue;
    const u = cam.unproject(pp.x, pp.y); turf++;
    if (!u || Math.hypot(u.x - x, u.y - y) > 1.5) turfBad++;
  }
  for (let y = C.GY0 + 5; y < C.GY1; y += 10) for (let z = 2; z < C.BAR; z += 8) {
    K.toWorld(C.FW, y, z, w); cam.project(w.x, w.y, w.z, pp);
    const u = cam.unproject(pp.x, pp.y); goal++;
    if (!u || u.x !== C.FW || Math.abs(u.y - y) > 1.5) goalBad++;
  }
  for (let sx = 0; sx <= VW; sx += 40) for (let sy = 0; sy <= VH; sy += 24) {
    const u = cam.unproject(sx, sy); send++;
    if (!u) { sendBad++; continue; }
    const p = Net.packInput({ mx: 0, my: 0, ax: Math.round(u.x) + 0, ay: Math.round(u.y) + 0 }), back = wireJSON(p);
    if (!Number.isInteger(p.ax) || !Number.isInteger(p.ay) || !same(Net.sanitizeInput(p), Net.sanitizeInput(back)) || Net.sanitizeInput(back).ax == null) sendBad++;
    K.toWorld(C.FW, GCY, 0, w); cam.project(w.x, 5, w.z, pp);
    if (sy < pp.y - 30) { sky++; if (u.x !== C.FW) skyBad++; }           // above the camera's own height over the goal: the stands, the sky
  }
  check(cam.unproject(NaN, 5) === null, 'a NaN cursor gave an aim');
  console.log('  unproject: turf points', turf, 'off by > 1.5 px', turfBad, '| goal-mouth points', goal, 'wrong', goalBad, '| above the goal', sky, 'not on the goal line', skyBad, '| screen points', send, 'without a sendable aim', sendBad);
  check(turf > 100 && !turfBad, 'turf aim'); check(goal > 50 && !goalBad, 'goal aim'); check(sky > 20 && !skyBad, 'aim above the horizon'); check(!sendBad, 'an aim that cannot be sent');

  // a shot from the wing with one key held: the 3D player's ball goes where the 2D player's does
  const shot = (keys, y, threeD) => {
    const g = Game.create({ roster: [ISO.playerById('messi'), ISO.playerById('ronaldo')], seed: 11, kickoff: 0 });
    while (g.phase !== 'play') Game.step(g, [Game.ZERO, Game.ZERO]);
    const p = g.players[0], d = g.players[1];
    p.x = 215; p.y = y; p.vx = p.vy = 0; g.ball.x = p.x + 12; g.ball.y = y; d.x = 30; d.y = y > GCY ? 80 : 640; g.events.length = 0;
    let inp, yaw = 0;
    if (threeD) { const vv = view3d(0); for (let i = 0; i < 240; i++) vv.frame(g, 1 / 60); yaw = vv.cam.st.yaw; inp = vv.input({ mx: keys[0], my: keys[1] }, null); }
    else inp = view2d().input({ mx: keys[0], my: keys[1] }, null);
    inp = clientForm(inp);
    for (let i = 0; i < 200; i++) {
      Game.step(g, [{ ...inp, shoot: i < 30 }, Game.ZERO]);
      const kick = g.events.find((e) => e.type === 'kick' && e.shot);
      if (kick) { const b = g.ball; return { ang: Math.atan2(b.vy, b.vx), atY: b.vx > 1 ? b.y + (b.vy / b.vx) * (C.FW - b.x) : null, yaw }; }
      g.events.length = 0;
    }
    return null;
  };
  let shots = 0, apart = 0, maxYaw = 0; const rows = [];
  for (const y of [70, 150, 570, 650]) for (const keys of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
    const s2 = shot(keys, y, false), s3 = shot(keys, y, true); shots++;
    maxYaw = Math.max(maxYaw, Math.abs(s3 ? s3.yaw : 0));
    const ok = s2 && s3 && Math.abs(s2.ang - s3.ang) < 0.12 && (s2.atY == null) === (s3.atY == null);
    if (!ok) { apart++; rows.push({ y, keys, twoD: s2 && +s2.ang.toFixed(2), threeD: s3 && +s3.ang.toFixed(2) }); }
  }
  console.log('  wing shots:', shots, '2D / 3D pairs (camera yaw up to', maxYaw.toFixed(2), 'rad) | struck in a different direction', apart, rows.length ? JSON.stringify(rows) : '');
  check(maxYaw > 0.3, 'the wing shots did not reach the camera yaw cap'); check(!apart, 'a 3D wing shot goes somewhere else than the 2D one');
}

// ================================================================== B / C: through the server
const freePort = () => new Promise((res, rej) => { const l = require('net').createServer(); l.on('error', rej); l.listen(0, '127.0.0.1', () => { const p = l.address().port; l.close(() => res(p)); }); });
// starts a server on a free port; a server that dies at start (the port was taken in between) is retried on another one
async function server(env) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const port = await freePort();
    const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: port, HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    servers.push(srv);
    try {
      await within(new Promise((res, rej) => {
        srv.stdout.once('data', () => res());
        srv.once('error', rej);
        srv.once('exit', (code, sig) => rej(new Error('server exited at start (code ' + code + ', signal ' + sig + ')')));
      }), 10000, 'the server on port ' + port + ' to start');
      srv.on('exit', (code, sig) => { if (!srv.killed) fail('the server on port ' + port + ' died during the run (code ' + code + ', signal ' + sig + ')'); });
      return port;
    } catch (e) { lastErr = e; try { srv.kill('SIGKILL'); } catch (e2) { /* gone */ } }
  }
  throw lastErr;
}
function delayed(deliver) {          // a link that delays every message by DELAY +- JITTER ms and keeps them in order
  const fifo = [];
  let last = 0;
  const drain = () => { while (fifo.length && fifo[0].at <= performance.now() + 0.5) deliver(fifo.shift().x); };
  return (x) => {
    const at = Math.max(last, performance.now() + DELAY + (Math.random() * 2 - 1) * JITTER);
    last = at; fifo.push({ at, x });
    setTimeout(drain, Math.max(0, at - performance.now()) + 1);
  };
}
const OWN = { kick: 1, skill: 1, lunge: 1, fake: 1 };
// The reference: every snapshot the server sent (it sends one per step here), by step. Filled by the first client.
function reference() { return { top: 0, shadow: null, shadowN: 0, shadowBad: 0, shadowDiff: null, evN: 0, changes: 0 }; }
const tally = (o, k) => { o[k] = (o[k] || 0) + 1; };

function client(port, name, pick, mkView, ref) {
  const c = { name, msgs: {}, G: null, P: null, me: 0, view: null, drive: idle, step: 0, lastK: -1, on: null,
    heard: {}, got: {}, ownHeard: {}, ownGot: {}, evBad: 0, evLog: [],      // events: played / received; this seat's own predicted ones apart
    sent: new Map(), inBad: 0, inDiff: null, inN: 0, echoN: 0, echoBad: 0, echoDiff: null, lastAck: 0, pred: new Map(), predN: 0, predBad: 0, predDiff: null, frac: 0 };
  c.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  c.ws.on('error', (e) => fail(name + ': websocket error ' + (e && e.message)));
  const up = delayed((s) => { if (c.ws.readyState === 1) c.ws.send(s); });
  c.send = (m) => {
    if (m.t === 'in') {          // m.i is the wire form the Predictor just stepped with (as sanitizeInput(m.i))
      c.inN++;
      const mine = Net.sanitizeInput(m.i), theirs = serverForm(m.i);
      if (!same(mine, theirs)) { c.inBad++; c.inDiff = c.inDiff || firstDiff(mine, theirs, 'input'); }
      if (m.i.mx % 1 || m.i.my % 1) c.frac++;
      c.sent.set(m.n, wireJSON(m.i));
    }
    up(JSON.stringify(m));
  };
  const down = delayed((m) => {
    c.msgs[m.t] = (c.msgs[m.t] || 0) + 1;
    if (m.t === 'error') fail(name + ': the server sent an error: ' + m.msg);
    if (m.t === 'room') c.me = m.you;
    if (m.t === 'start') {
      c.G = Game.create({ roster: m.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin)) });
      c.G.players.forEach((p, i) => { p.moves = m.moves[i] ? new Set(m.moves[i]) : null; });
      c.P = Net.Predictor({ me: c.me, send: c.send });
      c.view = mkView(c.me); c.picks = m.picks; c.moves = m.moves;
    }
    if (m.t === 's' && c.P) {
      if (ref && !ref.owner) ref.owner = c;
      if (ref && ref.owner === c && m.k > ref.top) record(ref, c, m);
      // the input the server applied for this seat is the one this client sent under that number
      const ack = m.ack[c.me];
      if (ack > c.lastAck && c.sent.has(ack)) {
        c.echoN++;
        if (!same(m.inp[c.me], c.sent.get(ack))) { c.echoBad++; c.echoDiff = c.echoDiff || 'seq ' + ack + ' ' + firstDiff(m.inp[c.me], c.sent.get(ack), 'inp'); }
        for (const n of c.sent.keys()) { if (n > ack) break; c.sent.delete(n); }
      }
      c.lastAck = ack; c.lastK = m.k;
      for (const e of m.n.ev) { if (OWN[e.type] && e.p && e.p.$p === c.me) tally(c.ownGot, e.type); else tally(c.got, e.type); c.evLog.push(m.k + ':' + e.type); }
      // what this client predicted for step k, against what the server made of step k
      const mine = c.pred.get(m.k);
      if (mine) {
        const theirs = wireJSON(m.n); delete theirs.ev;
        c.predN++;
        if (!same(mine, theirs)) { c.predBad++; c.predDiff = firstDiff(mine, theirs, 'G'); }
      }
      for (const k of c.pred.keys()) { if (k > m.k) break; c.pred.delete(k); }
      c.P.onSnapshot(m);
    }
    if (c.on) c.on(m);
  });
  c.ws.on('message', (raw) => down(JSON.parse(raw)));
  let last = performance.now();
  c.timer = setInterval(() => {                       // the "display": ~60 frames a second
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!c.P) return;
    const n = c.P.frame(c.G, dt, () => { const d = c.drive(++c.step); return d ? c.view.input(d.k, d.cur) : null; });
    for (const e of c.G.events) { c.view.event(c.G, e); tally(OWN[e.type] && e.p === c.G.players[c.me] ? c.ownHeard : c.heard, e.type); }
    c.G.events.length = 0;
    if (!same(c.heard, c.got)) c.evBad++;            // every frame: all the events of the snapshots taken in have been played, and nothing else
    c.view.frame(c.G, dt);
    if (n && c.P.synced && c.G.phase !== 'end') c.pred.set(c.lastK + c.P.pending, state(c.G));
  }, 16);
  c.open = new Promise((r) => c.ws.on('open', r));
  c.join = (m) => c.send({ name, pick, ...m });
  c.close = () => { clearInterval(c.timer); c.ws.close(); };
  c.zero = () => { c.predN = c.predBad = 0; c.predDiff = null; for (const k in c.P.stats) c.P.stats[k] = 0; };
  return c;
}
// every server step, re-simulated from the snapshot before it and the inputs the server says it applied
function record(ref, c, m) {
  const prev = ref.last;
  ref.top = m.k; ref.last = m;
  ref.evN += m.n.ev.length;
  if (!prev || m.k !== prev.k + 1) return;
  if (!same(prev.inp, m.inp)) ref.changes++;
  if (!ref.shadow) { ref.shadow = Game.create({ roster: c.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin)) }); ref.shadow.players.forEach((p, i) => { p.moves = c.moves[i] ? new Set(c.moves[i]) : null; }); }
  const H = ref.shadow;
  Net.apply(H, wireJSON(prev.n)); H.events.length = 0;
  Game.step(H, m.inp.map((i) => (i ? Net.sanitizeInput(i) : Game.ZERO)));
  const a = state(H), b = wireJSON(m.n); delete b.ev;
  ref.shadowN++;
  if (!same(a, b) || H.events.length !== m.n.ev.length || H.events.some((e, i) => e.type !== m.n.ev[i].type)) { ref.shadowBad++; ref.shadowDiff = ref.shadowDiff || 'step ' + m.k + ' ' + (firstDiff(a, b, 'G') || 'events'); }
}
const line = (label, c) => {
  const s = c.P.stats;
  console.log('  ' + label.padEnd(30), 'predicted steps checked', String(c.predN).padStart(4), 'not exact', String(c.predBad).padStart(3),
    '| own error mean', (s.errSum / Math.max(1, s.errN)).toFixed(3), 'max', s.errMax.toFixed(2), 'px | others max', s.othMax.toFixed(1), 'px | dry', s.starved + '/' + s.snaps, '| stalls', s.stalls);
};
async function room(port, size, picks, views, ref) {
  const cs = picks.map((p, i) => client(port, 'P' + i, { id: p }, views[i], i === 0 ? ref : null));
  stage = 'connecting ' + cs.length + ' clients';
  await within(Promise.all(cs.map((c) => c.open)), 10000, 'the websockets to open');
  stage = 'creating a room';
  const code = await within(new Promise((r) => { cs[0].on = (m) => { if (m.t === 'error') fail('the server refused the room: ' + m.msg); else if (m.t === 'room') r(m.code); }; cs[0].join({ t: 'create', mode: size === 4 ? '2v2' : '1v1' }); }), 10000, 'the room code');
  stage = 'joining the room ' + code;
  for (let i = 1; i < cs.length; i++) { cs[i].join({ t: 'join', code, mode: size === 4 ? '2v2' : '1v1' }); await sleep(120); }
  stage = 'waiting for the match to start';
  const t0 = Date.now();
  while (!cs.every((c) => c.G && c.G.phase === 'play')) { await sleep(50); if (Date.now() - t0 > 20000) fail('match did not start; clients: ' + cs.map((c) => c.name + ' ' + (c.G ? 'phase ' + c.G.phase + ' k ' + c.lastK : 'no start message') + ' got ' + JSON.stringify(c.msgs)).join(' | ')); }
  cs.sort((a, b) => a.me - b.me);
  stage = 'playing the ' + size + '-seat match';
  return cs;
}
// the last second and a half of a phase in which nobody changes their input: every prediction must be exact
// (a held 3D key is re-read on a camera cut, a kick-off say: that is one changed input, and the others cannot have known)
async function steady(cs, label, ref) {
  await sleep(1300); for (const c of cs) c.zero();
  const ch0 = ref.changes;
  await sleep(1600);
  const changes = ref.changes - ch0;
  for (const c of cs) {
    const over = c.G.phase === 'end';
    check(over || c.predN > 30, label + ': ' + c.name + ' (' + c.view.kind + ') made no checkable predictions');
    check(c.predBad <= changes * 30, label + ': ' + c.name + ' (' + c.view.kind + ') predicted ' + c.predBad + ' of ' + c.predN + ' steps differently from the server: ' + c.predDiff);
  }
  return cs.map((c) => c.predBad + '/' + c.predN).join('  ') + (changes ? '  (inputs changed on ' + changes + ' steps)' : '');
}
function wrapUp(label, cs, ref) {
  const inN = cs.reduce((n, c) => n + c.inN, 0), frac = cs.map((c) => c.view.kind + ' ' + Math.round((100 * c.frac) / Math.max(1, c.inN)) + '%').join(', ');
  console.log('  inputs sent', inN, '(fractional movement: ' + frac + ') | simulated != server form', cs.reduce((n, c) => n + c.inBad, 0),
    '| server applied something else', cs.reduce((n, c) => n + c.echoBad, 0), 'of', cs.reduce((n, c) => n + c.echoN, 0));
  // the same events on every client: compared up to the last step all of them have received
  const upto = Math.min(...cs.map((c) => c.lastK)), logs = cs.map((c) => c.evLog.filter((x) => parseInt(x, 10) <= upto).join(' '));
  console.log('  server steps re-simulated from snapshot + reported inputs', ref.shadowN, '| not exact', ref.shadowBad, '| events sent', ref.evN, '| played', JSON.stringify(cs[cs.length - 1].heard));
  check(logs.every((l) => l === logs[0]) && logs[0].length > 0, label + ': the clients did not receive the same events');
  for (const c of cs) {
    check(!c.inBad, label + ': ' + c.name + ' (' + c.view.kind + ') simulated with an input the server would read differently: ' + c.inDiff);
    check(!c.echoBad, label + ': the server applied a different input than ' + c.name + ' (' + c.view.kind + ') sent: ' + c.echoDiff);
    check(c.echoN > 200, label + ': ' + c.name + ' saw too few of its inputs applied');
    check(!c.evBad, label + ': ' + c.name + ' (' + c.view.kind + ') played other events than the server sent on ' + c.evBad + ' frames: ' + JSON.stringify(c.heard) + ' vs ' + JSON.stringify(c.got));
    for (const t in OWN) check(Math.abs((c.ownHeard[t] || 0) - (c.ownGot[t] || 0)) <= 2, label + ': ' + c.name + "'s own " + t + ' events: played ' + c.ownHeard[t] + ', server sent ' + c.ownGot[t]);
  }
  check(cs.filter((c) => c.view.kind === '3d').every((c) => c.frac > 50), label + ': the 3D seats sent no fractional movement (the test is not testing the 3D path)');
  check(ref.shadowN > 500 && !ref.shadowBad, label + ': the server match does not re-simulate from its inputs: ' + ref.shadowDiff);
}

(async () => {
  console.log('crossplay 2D + 3D | one-way delay', DELAY, '+-', JITTER, 'ms');
  stage = 'A'; partA();

  console.log('B. 1v1: seat 0 on Classic 2D, seat 1 on 3D');
  stage = 'B: starting a server';
  {
    const ref = reference(), [a, b] = await room(await server({ SEND_EVERY: 1 }), 2, ['messi', 'ronaldo'], [view2d, view3d], ref);
    await sleep(1200);
    // each view in turn plays against a steady opponent: nothing this client predicts should be wrong, whichever view it is on
    a.drive = bot(7); b.drive = hold(1, -1);
    await sleep(600); a.zero(); b.zero(); await sleep(6000);
    line('2D plays, 3D holds a key: 2D', a);
    const r2 = a.predBad / Math.max(1, a.predN), e2 = a.P.stats.errSum / Math.max(1, a.P.stats.errN), st2 = a.P.stats.stalls;
    a.drive = hold(1, -1); b.drive = bot(99);
    await sleep(600); a.zero(); b.zero(); await sleep(6000);
    line('3D plays, 2D holds a key: 3D', b);
    const r3 = b.predBad / Math.max(1, b.predN), e3 = b.P.stats.errSum / Math.max(1, b.P.stats.errN);
    check(e2 < 0.25 && e3 < 0.25, 'own-player prediction error too large: 2D ' + e2.toFixed(3) + ', 3D ' + e3.toFixed(3));
    check(r3 <= r2 + 0.08, 'the 3D client mispredicts more often than the 2D one: ' + r3.toFixed(3) + ' vs ' + r2.toFixed(3));
    check(!st2 && !b.P.stats.stalls, 'prediction stalled');
    // both play
    a.drive = bot(21); b.drive = bot(1234);
    await sleep(600); a.zero(); b.zero(); await sleep(9000);
    line('both play: 2D', a); line('both play: 3D', b);
    // both hold a direction (the 3D one a rotated, fractional one), then let go
    a.drive = hold(-1, -1); b.drive = hold(-1, 0);
    console.log('  both hold a key: not exact / checked', await steady([a, b], '1v1 held', ref));
    a.drive = idle; b.drive = idle;
    console.log('  both let go:     not exact / checked', await steady([a, b], '1v1 idle', ref));
    await sleep(300);
    wrapUp('1v1', [a, b], ref);
    a.close(); b.close();
  }

  console.log('C. 2v2: seats 0 and 2 on Classic 2D, seats 1 and 3 on 3D');
  stage = 'C: starting a server';
  {
    const ref = reference(), cs = await room(await server({ SEND_EVERY: 1 }), 4, ['messi', 'ronaldo', 'neymar', 'mbappe'], [view2d, view3d, view2d, view3d], ref);
    check(cs.every((c, i) => c.me === i), '2v2 seats: ' + cs.map((c) => c.me));
    await sleep(1200);
    cs.forEach((c, i) => { c.drive = bot(500 + i * 37); });
    await sleep(600); cs.forEach((c) => c.zero()); await sleep(9000);
    cs.forEach((c) => line('all four play: seat ' + c.me + ' ' + c.view.kind, c));
    cs.forEach((c, i) => { c.drive = hold(KEYS[1 + i][0], KEYS[1 + i][1]); });
    console.log('  all hold a key:  not exact / checked', await steady(cs, '2v2 held', ref));
    cs.forEach((c) => { c.drive = idle; });
    console.log('  all let go:      not exact / checked', await steady(cs, '2v2 idle', ref));
    await sleep(300);
    wrapUp('2v2', cs, ref);
    cs.forEach((c) => c.close());
  }
  if (failed) { console.error('FAILED:', failed, 'check(s)'); stop(1); }
  console.log('OK');
  stop(0);
})().catch((e) => fail(e && e.message || e));
