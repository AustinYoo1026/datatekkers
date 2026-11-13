/* ISO FOOTBALL — online server.
   Serves the game (static files) and runs 1v1 and 2v2 matches: players join a room by code (or the quick-match queue),
   send their inputs over a WebSocket, and the server runs the same deterministic simulation as the single-player
   game, broadcasting snapshots. Clients predict ahead of those snapshots (ISO.Net.Predictor in js/net.js): every
   input carries a sequence number, the server consumes exactly one input per seat per simulation step, and every
   snapshot says which input it got to, so a client can replay the rest on top of it.

     cd server && npm install && npm start          # http://localhost:8080   (PORT / HOST env vars)
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C, Net = ISO.Net;
const { cleanName, validatePick, sanitizeMoves } = require('./validate');

const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '0.0.0.0';
const SEND_EVERY = Math.max(1, +process.env.SEND_EVERY || 2);      // sim steps per snapshot: the sim advances 120 x C.SPEED steps a second, so 36 snapshots per second
// A seat's input queue longer than Q_MAX is cut down to its newest Q_KEEP: the client is running ahead (after a hitch, say).
// Normal jitter must never get there (the cut costs that client a visible correction), and a client that is merely a
// little ahead slows its own clock down, so the limit is generous.
const Q_MAX = +process.env.Q_MAX || 10, Q_KEEP = +process.env.Q_KEEP || 3;
const MAX_ROOMS = +process.env.MAX_ROOMS || 200;
const KEY_EVERY = Math.max(1, +process.env.KEY_EVERY || 144);      // a full keyframe every this many snapshots (protocol 2 sends deltas in between)
const ADMIN_CODE = process.env.ADMIN_CODE || '';                   // unset: the admin check always fails
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest();
const ADMIN_HASH = ADMIN_CODE ? sha(ADMIN_CODE) : null;
const IDLE_MS = 10 * 60 * 1000;       // empty / abandoned rooms are dropped

// ------------------------------------------------------------------ static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const PUBLIC = /^\/(?:index\.html|css\/[\w.-]+|js\/(?:(?:3d|vendor)\/)?[\w.-]+|assets\/[\w./-]+)?$/;      // only the game itself; never server/, tools/ or .git

const httpServer = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss.clients.size })); return; }
  if (!PUBLIC.test(url) || url.includes('..')) { res.writeHead(404).end('Not found'); return; }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(buf);
  });
});

// ------------------------------------------------------------------ helpers
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I / O
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!rooms.has(c)) return c;
  }
}
const defOf = (p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin, p.celeb);
const BOOLS = Object.keys(ISO.Game.ZERO).filter((k) => typeof ISO.Game.ZERO[k] === 'boolean');      // every button the sim reads
const sanitizeInput = ISO.Net.sanitizeInput;        // shared with the clients, which predict with exactly the same values

// ------------------------------------------------------------------ rooms
const rooms = new Map();
const queues = { '1v1': [], '2v2': [] };     // sockets waiting for a quick match
const sizeOf = (mode) => (mode === '2v2' ? 4 : 2);

// Seat i is player i of the simulation and plays for team i % 2 (2v2: seats 0 and 2 against seats 1 and 3).
class Room {
  constructor(code, size) {
    this.code = code; this.size = size; this.seats = new Array(size).fill(null); this.G = null; this.state = 'lobby';     // lobby | match | over
    this.kickoff = 0; this.rematch = new Array(size).fill(false); this.touched = Date.now();
    this.net = []; this.events = []; this.steps = 0; this.base = null; this.baseK = 0; this.flushes = 0;
  }
  get count() { return this.seats.filter(Boolean).length; }
  get full() { return this.count === this.size; }
  info(forSeat) {
    return { t: 'room', code: this.code, you: forSeat, state: this.state, size: this.size,
      players: this.seats.map((s) => s && { name: s.name, pick: s.pick }) };
  }
  broadcast(m) { for (const s of this.seats) if (s) send(s.ws, m); }
  sync() { this.seats.forEach((s, i) => s && send(s.ws, this.info(i))); }
  // a new arrival goes to the team with fewer players, so friends who join one after another end up split 2 v 2 by default
  freeSeat() {
    const n = [0, 0];
    this.seats.forEach((s, i) => { if (s) n[i % 2]++; });
    const first = n[1] < n[0] ? 1 : 0;
    for (const t of [first, 1 - first]) for (let i = t; i < this.size; i += 2) if (!this.seats[i]) return i;
    return -1;
  }
  join(seat) {
    const i = this.freeSeat();
    if (i < 0) return false;
    this.seats[i] = seat; seat.room = this; seat.team = i;
    this.touched = Date.now();
    this.sync();
    if (this.full && this.state === 'lobby') this.start();
    return true;
  }
  // lobby only: move to the other team if it has a free seat
  switchTeam(seat) {
    if (this.state === 'match' || this.size < 4) return;
    const from = this.seats.indexOf(seat);
    for (let i = 1 - (from % 2); i < this.size; i += 2) if (!this.seats[i]) {
      this.seats[from] = null; this.seats[i] = seat; seat.team = i; this.sync(); return;
    }
  }
  start() {
    this.state = 'match'; this.rematch.fill(false);
    const defs = this.seats.map((s) => defOf(s.pick));
    this.G = ISO.Game.create({ roster: defs, kickoff: this.kickoff, moves: this.seats.map((s) => s.moves), replay: true, turf: 'grass' });      // the server picks the pitch; a client message never does      // the goal pause is long enough for the clients' replay
    // per seat: q = inputs waiting ({ n, i }), seen = newest seq received, ack = seq of the last one consumed, last = the input applied in the latest step
    this.net = this.seats.map(() => ({ q: [], seen: 0, ack: 0, last: null, dry: false }));
    this.base = null; this.baseK = 0; this.flushes = 0; this.lastInp = null;
    for (const s of this.seats) s.hasBase = false;
    this.events = []; this.steps = 0; this.acc = 0; this.last = performance.now();
    // moves: the clients re-simulate everybody, so they need to know which skill moves each seat may use
    this.broadcast({ t: 'start', size: this.size, picks: this.seats.map((s) => s.pick), names: this.seats.map((s) => s.name), kickoff: this.kickoff,
      moves: this.seats.map((s) => Array.from(s.moves)), rev: ISO.SIM_REV });      // rev: the clients warn on a sim revision mismatch
    this.sync();
  }
  // One input per client step, numbered: { t:'in', n, i }. They queue up and are consumed one per simulation step.
  // (An input without n, from an old client, simply counts as the next one.)
  input(seat, m) {
    const st = this.net[seat];
    if (!st) return;
    const n = Number.isSafeInteger(m.n) ? m.n : st.seen + 1;
    if (n <= st.seen) return;                            // a duplicate, or out of order
    st.seen = n;
    st.q.push({ n, i: sanitizeInput(ISO.Net.packInput(sanitizeInput(m.i))) });      // through the wire form, so it is exactly what `inp` will tell the other clients
    if (st.q.length > Q_MAX) {                           // the client is ahead of us: skip to its recent inputs...
      const dropped = st.q.splice(0, st.q.length - Q_KEEP), keep = st.q[0].i;
      for (const d of dropped) for (const b of BOOLS) if (d.i[b]) keep[b] = true;      // ...but a tap that was only in the skipped ones still counts
    }
  }
  // the input of this seat for the next step: the next one in its queue, or the previous one again when nothing has arrived (held keys stay held)
  frameInput(seat) {
    const st = this.net[seat], e = st.q.shift();
    if (e) { st.last = e.i; st.ack = e.n; } else st.dry = true;
    return st.last || ISO.Game.ZERO;
  }
  tick(now) {
    if (this.state !== 'match') return;
    this.acc += Math.min(0.1, (now - this.last) / 1000) * C.SPEED; this.last = now;      // same pace as the offline game: real time x C.SPEED
    const G = this.G;
    while (this.acc >= C.STEP) {
      ISO.Game.step(G, this.seats.map((_, i) => this.frameInput(i)));
      this.acc -= C.STEP;
      for (const e of G.events) this.events.push(e);
      G.events.length = 0;
      if (++this.steps % SEND_EVERY === 0 || G.phase === 'end') this.flush();
      if (G.phase === 'end') { this.state = 'over'; this.sync(); break; }
    }
  }
  // Protocol 1 seats always get the whole snapshot. Protocol 2 seats get it as a keyframe (first one, every KEY_EVERY,
  // the last one, and whenever they ask with { t:'key' }) and a lossless delta against the previous snapshot otherwise.
  flush() {
    const snap = Net.snapshot(this.G, this.events), net = this.net;
    const ev = snap.ev; delete snap.ev;
    this.events = [];
    const k = this.steps, key = this.G.phase === 'end' || this.flushes % KEY_EVERY === 0;
    // k: step count. ack: last input seq consumed per seat. inp: the input applied in the latest step per seat.
    // q: inputs still queued per seat, or -1 if the queue ran dry since the last snapshot (the clients steer their clocks by it)
    const head = { t: 's', at: Date.now(), k, ack: net.map((s) => s.ack) };
    const inp = net.map((s) => (s.last ? Net.packInput(s.last) : null)), inpS = JSON.stringify(inp), inpSame = inpS === this.lastInp;
    const q = net.map((s) => (s.dry ? -1 : s.q.length));
    let full = null; const delta = {};
    for (const seat of this.seats) {
      if (!seat) continue;
      if (seat.proto >= 2 && seat.hasBase && !key && this.base) {
        const v = seat.proto >= 3 ? 3 : 2;      // one delta per protocol version, built once for every seat of it
        if (!delta[v]) {
          const m = { ...head, q, b: this.baseK }, d = Net.diff(this.base, snap, v >= 3);
          if (!inpSame) m.inp = inp;
          if (d !== undefined) m.d = d;
          if (ev.length) m.ev = ev;
          delta[v] = JSON.stringify(m);
        }
        if (seat.ws.readyState === 1) seat.ws.send(delta[v]);
      } else {
        if (!full) full = JSON.stringify({ ...head, inp, q, n: { ...snap, ev } });
        if (seat.ws.readyState === 1) seat.ws.send(full);
        if (seat.proto >= 2) seat.hasBase = true;
      }
    }
    this.base = snap; this.baseK = k; this.lastInp = inpS; this.flushes++;
    for (const s of net) s.dry = false;
  }
  wantRematch(i) {
    if (this.state !== 'over') return;
    this.rematch[i] = true;
    this.broadcast({ t: 'rematch', who: this.rematch });
    if (this.seats.every((s, k) => s && this.rematch[k])) { this.kickoff = 1 - this.kickoff; this.start(); }
  }
  leave(seat) {
    const i = this.seats.indexOf(seat);
    if (i < 0) return;
    this.seats[i] = null; seat.room = null; this.touched = Date.now();
    if (!this.count) { rooms.delete(this.code); return; }
    // somebody walked away: the match is over, the room stays open for someone else to join
    const wasMatch = this.state === 'match';
    this.state = 'lobby'; this.G = null; this.rematch.fill(false);
    this.broadcast({ t: 'left', forfeit: wasMatch });
    this.sync();
  }
}

// ------------------------------------------------------------------ sockets
// ALLOWED_ORIGINS="https://my-game.vercel.app,https://mydomain.com" restricts which sites may connect (unset = anyone)
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const wss = new WebSocketServer({
  server: httpServer, path: '/ws', maxPayload: 4096,
  // permessage-deflate is opt-in (WS_DEFLATE=1): its CPU and memory cost per socket was not measured
  perMessageDeflate: process.env.WS_DEFLATE === '1' ? { threshold: 256, zlibDeflateOptions: { level: 3, memLevel: 7 }, serverMaxWindowBits: 13, clientMaxWindowBits: 13, concurrencyLimit: 10 } : false,
  verifyClient: ({ origin, req }) => !ORIGINS.length || !origin || ORIGINS.includes(origin) || origin === 'http://' + req.headers.host || origin === 'https://' + req.headers.host,
});

function syncQueue(mode) {
  const q = queues[mode];
  for (let k = q.length - 1; k >= 0; k--) if (q[k].ws.readyState !== 1) q.splice(k, 1);
  for (const s of q) send(s.ws, { t: 'queued', mode, have: q.length, need: sizeOf(mode) });
}
function leave(seat) {
  for (const [m, q] of Object.entries(queues)) { const k = q.indexOf(seat); if (k >= 0) { q.splice(k, 1); syncQueue(m); } }
  if (seat.room) seat.room.leave(seat);
}
const queued = (seat) => Object.values(queues).some((q) => q.includes(seat));
// -> a seat, or null after telling the client why not
function makeSeat(ws, m) {
  const v = validatePick(m.pick);
  if (!v.ok) { send(ws, { t: 'error', msg: v.msg }); return null; }
  return { name: cleanName(m.name), pick: v.pick, moves: sanitizeMoves(m.moves), proto: m.v >= 3 ? 3 : m.v >= 2 ? 2 : 1, hasBase: false };
}

wss.on('connection', (ws) => {
  let seat = { ws, name: 'Player', pick: validatePick(null).pick, moves: null, room: null, team: 0, proto: 1, hasBase: false };
  let strikes = 0, adminTries = 0;
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  let budget = 300, refill = Date.now();                  // simple per-socket rate limit (a client sends one input per sim step: ~72 a second, in bursts)

  ws.on('message', (raw) => {
    const now = Date.now();
    budget = Math.min(300, budget + ((now - refill) / 1000) * 180); refill = now;
    if (--budget < 0) { if (++strikes >= 600) ws.close(1008, 'Too many messages'); return; }
    strikes = 0;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'in') { if (seat.room && seat.room.state === 'match' && m.i && typeof m.i === 'object') seat.room.input(seat.team, m); return; }
    if (m.t === 'key') { seat.hasBase = false; return; }
    if (m.t === 'admin') {
      const ok = !!ADMIN_HASH && adminTries < 5 && typeof m.code === 'string' && m.code.length <= 200 && crypto.timingSafeEqual(sha(m.code), ADMIN_HASH);
      adminTries++; send(ws, { t: 'admin', ok }); return;
    }
    if (m.t === 'ping') { send(ws, { t: 'pong', c: m.c, at: Date.now() }); return; }
    if (m.t === 'rematch') { if (seat.room) seat.room.wantRematch(seat.team); return; }
    if (m.t === 'team') { if (seat.room) seat.room.switchTeam(seat); return; }
    if (m.t === 'leave') { leave(seat); send(ws, { t: 'out' }); return; }

    if (m.t === 'create' || m.t === 'join' || m.t === 'quick') {
      const s = makeSeat(ws, m);
      if (!s) return;
      if (seat.room || queued(seat)) leave(seat);
      Object.assign(seat, s, { room: null });
      const mode = m.mode === '2v2' ? '2v2' : '1v1';
      if (m.t === 'create') {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'error', msg: 'Server is full, try again in a minute.' }); return; }
        const r = new Room(newCode(), sizeOf(mode)); rooms.set(r.code, r); r.join(seat);
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) send(ws, { t: 'error', msg: 'No room with that code.' });
        else if (r.full) send(ws, { t: 'error', msg: 'That room is full.' });
        else r.join(seat);
      } else {
        const q = queues[mode];
        for (let k = q.length - 1; k >= 0; k--) if (q[k].ws.readyState !== 1) q.splice(k, 1);       // drop stale sockets
        q.push(seat);
        if (q.length >= sizeOf(mode)) {
          if (rooms.size >= MAX_ROOMS) { q.pop(); send(ws, { t: 'error', msg: 'Server is full, try again in a minute.' }); return; }
          const group = q.splice(0, sizeOf(mode));
          const r = new Room(newCode(), sizeOf(mode)); rooms.set(r.code, r);
          for (const g of group) r.join(g);
          if (q.length) syncQueue(mode);
        } else syncQueue(mode);
      }
      return;
    }
    if (m.t === 'pick' && seat.room && seat.room.state !== 'match') {         // change character in the lobby
      const v = validatePick(m.pick);
      if (!v.ok) { send(ws, { t: 'error', msg: v.msg }); return; }
      Object.assign(seat, { pick: v.pick, moves: sanitizeMoves(m.moves) }); seat.room.sync();
    }
  });
  ws.on('close', () => leave(seat));
  ws.on('error', () => {});
  send(ws, { t: 'hello', v: 3 });
});

// ------------------------------------------------------------------ main loop
setInterval(() => {
  const now = performance.now();
  for (const r of rooms.values()) r.tick(now);
}, 4);
setInterval(() => {                                       // drop dead sockets and abandoned rooms
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > IDLE_MS && r.state === 'lobby') { for (const s of r.seats) if (s) { send(s.ws, { t: 'out' }); s.room = null; } rooms.delete(code); }
}, 15000);

httpServer.listen(PORT, HOST, () => {
  console.log('ISO Football server on http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  const nets = require('os').networkInterfaces();
  for (const n of Object.values(nets)) for (const a of n) if (a.family === 'IPv4' && !a.internal) console.log('  on your network: http://' + a.address + ':' + PORT);
});
