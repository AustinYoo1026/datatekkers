/* ISO FOOTBALL — online server.
   Serves the game (static files) and runs 1v1 and 2v2 matches: players join a room by code (or the quick-match queue),
   send their inputs over a WebSocket, and the server runs the same deterministic simulation as the single-player
   game at 120 Hz, broadcasting snapshots that the clients render.

     cd server && npm install && npm start          # http://localhost:8080   (PORT / HOST env vars)
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C;

const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '0.0.0.0';
const SEND_EVERY = 3;                 // sim steps per snapshot: 120 / 3 = 40 snapshots per second
const MAX_ROOMS = +process.env.MAX_ROOMS || 200;
const IDLE_MS = 10 * 60 * 1000;       // empty / abandoned rooms are dropped

// ------------------------------------------------------------------ static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const PUBLIC = /^\/(?:index\.html|css\/[\w.-]+|js\/[\w.-]+|assets\/[\w./-]+)?$/;      // only the game itself; never server/, tools/ or .git

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
const cleanName = (s) => String(s || 'Player').replace(/[^\w .-]/g, '').trim().slice(0, 14) || 'Player';

// A player's choice as the client sends it: { id, prime, skin }. Rebuilt here so nobody can send arbitrary stats.
function sanitizePick(p) {
  const base = ISO.PLAYERS.find((d) => d.id === (p && p.id)) || ISO.PLAYERS[0];
  const skin = ISO.skinById(p && p.skin).id;
  return { id: base.id, prime: !!(p && p.prime), skin };
}
const defOf = (p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin);
const FREE_MOVES = Object.keys(ISO.Game.SKILLS).filter((id) => !(ISO.MOVE_COST[id] > 0));
function sanitizeMoves(list) {          // a client that sends nothing valid gets only the free moves, never all of them
  if (!Array.isArray(list)) return new Set(FREE_MOVES);
  return new Set(list.filter((id) => typeof id === 'string' && ISO.Game.SKILLS[id]).concat(FREE_MOVES));
}
const BOOLS = Object.keys(ISO.Game.ZERO).filter((k) => typeof ISO.Game.ZERO[k] === 'boolean');      // every button the sim reads
function sanitizeInput(i) {
  const o = {};
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  o.mx = num(i.mx); o.my = num(i.my);
  for (const b of BOOLS) o[b] = !!i[b];
  if (typeof i.ax === 'number' && typeof i.ay === 'number' && isFinite(i.ax) && isFinite(i.ay)) { o.ax = i.ax; o.ay = i.ay; }
  return o;
}

// ------------------------------------------------------------------ rooms
const rooms = new Map();
const queues = { '1v1': [], '2v2': [] };     // sockets waiting for a quick match
const sizeOf = (mode) => (mode === '2v2' ? 4 : 2);

// Seat i is player i of the simulation and plays for team i % 2 (2v2: seats 0 and 2 against seats 1 and 3).
class Room {
  constructor(code, size) {
    this.code = code; this.size = size; this.seats = new Array(size).fill(null); this.G = null; this.state = 'lobby';     // lobby | match | over
    this.kickoff = 0; this.rematch = new Array(size).fill(false); this.touched = Date.now();
    this.inp = []; this.tap = []; this.events = []; this.steps = 0;
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
    this.G = ISO.Game.create({ roster: defs, kickoff: this.kickoff, moves: this.seats.map((s) => s.moves) });
    this.inp = this.seats.map(() => null); this.tap = this.seats.map(() => ({})); this.events = []; this.steps = 0; this.acc = 0; this.last = performance.now();
    this.broadcast({ t: 'start', size: this.size, picks: this.seats.map((s) => s.pick), names: this.seats.map((s) => s.name), kickoff: this.kickoff });
    this.sync();
  }
  input(team, raw) {
    const i = sanitizeInput(raw);
    const t = this.tap[team];
    for (const b of BOOLS) if (i[b]) t[b] = true;       // a tap between two sim steps must not be lost
    this.inp[team] = i;
  }
  frameInput(team) {
    const cur = this.inp[team];
    if (!cur) return ISO.Game.ZERO;
    const o = { ...cur }, t = this.tap[team];
    for (const b in t) o[b] = true;
    this.tap[team] = {};
    return o;
  }
  tick(now) {
    if (this.state !== 'match') return;
    this.acc += Math.min(0.1, (now - this.last) / 1000); this.last = now;
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
  flush() {
    const snap = ISO.Net.snapshot(this.G, this.events);
    this.events = [];
    this.broadcast({ t: 's', at: Date.now(), n: snap });
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
  verifyClient: ({ origin, req }) => !ORIGINS.length || !origin || ORIGINS.includes(origin) || origin === 'http://' + req.headers.host || origin === 'https://' + req.headers.host,
});

function leave(seat) {
  for (const q of Object.values(queues)) { const k = q.indexOf(seat); if (k >= 0) q.splice(k, 1); }
  if (seat.room) seat.room.leave(seat);
}
const queued = (seat) => Object.values(queues).some((q) => q.includes(seat));
function makeSeat(ws, m) {
  return { ws, name: cleanName(m.name), pick: sanitizePick(m.pick), moves: sanitizeMoves(m.moves), room: null, team: 0 };
}

wss.on('connection', (ws) => {
  let seat = { ws, name: 'Player', pick: sanitizePick(null), moves: null, room: null, team: 0 };
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  let budget = 200, refill = Date.now();                  // simple per-socket rate limit

  ws.on('message', (raw) => {
    const now = Date.now();
    budget = Math.min(200, budget + ((now - refill) / 1000) * 120); refill = now;
    if (--budget < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'in') { if (seat.room && seat.room.state === 'match' && m.i && typeof m.i === 'object') seat.room.input(seat.team, m.i); return; }
    if (m.t === 'ping') { send(ws, { t: 'pong', c: m.c, at: Date.now() }); return; }
    if (m.t === 'rematch') { if (seat.room) seat.room.wantRematch(seat.team); return; }
    if (m.t === 'team') { if (seat.room) seat.room.switchTeam(seat); return; }
    if (m.t === 'leave') { leave(seat); send(ws, { t: 'out' }); return; }

    if (m.t === 'create' || m.t === 'join' || m.t === 'quick') {
      if (seat.room || queued(seat)) leave(seat);
      const s = makeSeat(ws, m); Object.assign(seat, s, { room: null });
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
        } else send(ws, { t: 'queued', mode, have: q.length, need: sizeOf(mode) });
      }
      return;
    }
    if (m.t === 'pick' && seat.room && seat.room.state !== 'match') {         // change character in the lobby
      Object.assign(seat, { pick: sanitizePick(m.pick), moves: sanitizeMoves(m.moves) }); seat.room.sync();
    }
  });
  ws.on('close', () => leave(seat));
  ws.on('error', () => {});
  send(ws, { t: 'hello' });
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
