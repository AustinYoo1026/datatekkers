// End-to-end check: starts the server, connects two clients, plays a few seconds, and applies snapshots onto a client-side Game.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO;
const PORT = 18080 + ((Math.random() * 500) | 0);
const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'inherit'] });
const fail = (m) => { console.error('FAIL', m); srv.kill(); process.exit(1); };
setTimeout(() => fail('timeout'), 20000);

function client(name, pick) {
  const c = { name, snaps: [], msgs: [], G: null };
  c.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw); c.msgs.push(m.t);
    if (m.t === 'start') {
      const defs = m.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin));
      c.G = ISO.Game.create({ home: defs[0], away: defs[1] });
    }
    if (m.t === 's') { c.snaps.push(m.n); ISO.Net.apply(c.G, m.n); c.lastEv = ISO.Net.events(c.G, m.n); c.evCount = (c.evCount || 0) + c.lastEv.length; }
    if (c.on) c.on(m);
  });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  return c;
}
srv.stdout.once('data', async () => {
  const a = client('A', { id: 'messi' }), b = client('B', { id: 'ronaldo', prime: true });
  await new Promise((r) => a.ws.on('open', r)); await new Promise((r) => b.ws.on('open', r));
  const code = await new Promise((r) => { a.on = (m) => m.t === 'room' && r(m.code); a.send({ t: 'create', name: 'Ann', pick: { id: 'messi' } }); });
  b.send({ t: 'join', code: code.toLowerCase(), name: 'Bob', pick: { id: 'ronaldo', prime: true, skin: 'nope' } });
  const t0 = Date.now();
  const iv = setInterval(() => { a.send({ t: 'in', i: { mx: 1, my: 0, sprint: true, shoot: Math.random() < 0.1 } }); b.send({ t: 'in', i: { mx: 1, my: 0 } }); }, 16);
  await new Promise((r) => setTimeout(r, 6000)); clearInterval(iv);
  const secs = (Date.now() - t0) / 1000;
  if (!a.G || !b.G) fail('no start');
  const n = a.snaps.length; console.log('snapshots', n, '=>', (n / secs).toFixed(0) + '/s', 'bytes/snap', JSON.stringify(a.snaps[n - 1]).length, 'events', a.evCount);
  if (n < 100) fail('too few snapshots');
  const A = a.G, B = b.G;
  if (A.phase !== B.phase || Math.abs(A.ball.x - B.ball.x) > 60) fail('clients disagree');
  if (A.players[1].def.id !== 'ronaldo' || !A.players[1].def.prime) fail('pick not applied');
  if (!(A.players[0].x === A.players[0].x) || A.players[0].a == null) fail('bad state');
  // a bad room code and a full room
  const c = client('C', {}); await new Promise((r) => c.ws.on('open', r));
  const err = await new Promise((r) => { c.on = (m) => m.t === 'error' && r(m.msg); c.send({ t: 'join', code: code }); });
  if (!/full/.test(err)) fail('expected full room: ' + err);
  // disconnect -> opponent told
  const left = new Promise((r) => { a.on = (m) => m.t === 'left' && r(m); });
  b.ws.close(); const l = await left; if (!l.forfeit) fail('forfeit not flagged');
  // a path traversal attempt must not leak server files
  const res = await fetch('http://127.0.0.1:' + PORT + '/server/server.js'); if (res.status !== 404) fail('static leak');
  const idx = await fetch('http://127.0.0.1:' + PORT + '/'); if (idx.status !== 200) fail('index missing');
  const raw = await fetch('http://127.0.0.1:' + PORT + '/js/net.js'); if (raw.status !== 200) fail('js missing');
  console.log('OK'); srv.kill(); process.exit(0);
});
