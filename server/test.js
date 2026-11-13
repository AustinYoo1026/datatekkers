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
setTimeout(() => fail('timeout'), 60000);

function client(name, pick) {
  const c = { name, snaps: [], msgs: [], G: null };
  c.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw); c.msgs.push(m.t);
    if (m.t === 'start') {
      c.start = m;
      const defs = m.picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin, p.celeb));
      c.G = ISO.Game.create({ roster: defs });
    }
    if (m.t === 's' && m.n) { c.last = m; c.snaps.push(m.n); ISO.Net.apply(c.G, m.n); c.lastEv = ISO.Net.events(c.G, m.n); c.evCount = (c.evCount || 0) + c.lastEv.length; }
    if (c.on) c.on(m);
  });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  return c;
}
srv.stdout.once('data', async () => {
  const a = client('A', { id: 'messi' }), b = client('B', { id: 'ronaldo', prime: true });
  await new Promise((r) => a.ws.on('open', r)); await new Promise((r) => b.ws.on('open', r));
  const code = await new Promise((r) => { a.on = (m) => m.t === 'room' && r(m.code); a.send({ t: 'create', name: 'Ann', pick: { id: 'messi' } }); });
  b.send({ t: 'join', code: code.toLowerCase(), name: 'Bob', pick: { id: 'ronaldo', prime: true, skin: 'nope', celeb: 'spin' } });
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
  // what the clients' prediction needs: step count, per-seat ack / applied input / queue length, and the full sim state
  const L = a.last;
  if (!(L.k > 100) || [L.ack, L.inp, L.q].some((x) => !Array.isArray(x) || x.length !== 2)) fail('snapshot envelope: ' + JSON.stringify([L.k, L.ack, L.inp, L.q]));
  if (!(L.ack[0] > 100) || L.inp[0].mx !== 1 || !L.inp[0].sprint) fail('inputs not consumed in order: ' + JSON.stringify([L.ack, L.inp]));
  if (typeof L.n.rs !== 'number' || !L.n.pairs || !L.n.players[0].prev) fail('snapshot is missing simulation state');
  if (!a.start.moves || a.start.moves.length !== 2) fail('start has no moves');
  // the sim revision handshake (a mismatching client warns): `start` carries the server's ISO.SIM_REV; picks carry a validated celebration
  if (a.start.rev !== ISO.SIM_REV || typeof a.start.rev !== 'string') fail('start.rev is not the sim revision: ' + a.start.rev);
  if (a.start.picks[0].celeb !== 'signature' || a.start.picks[1].celeb !== 'spin') fail('celebration: default signature, a known one kept: ' + JSON.stringify(a.start.picks));
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
  // 2v2: four quick-match clients get one room, seats 0/2 v 1/3, and a pass is possible
  const four = ['messi', 'ronaldo', 'neymar', 'mbappe'].map((id, i) => client('Q' + i, {}));
  await Promise.all(four.map((q) => new Promise((r) => q.ws.on('open', r))));
  const starts = four.map((q) => new Promise((r) => { q.on = (m) => { if (m.t === 'start') r(m); }; }));
  const rooms = four.map((q, i) => new Promise((r) => { const prev = q.on; q.on = (m) => { prev(m); if (m.t === 'room') r(m); }; }));
  four.forEach((q) => { q.qHave = []; const prev = q.on; q.on = (m) => { prev(m); if (m.t === 'queued') q.qHave.push(m.have); }; });
  for (let i = 0; i < 3; i++) {
    four[i].send({ t: 'quick', mode: '2v2', name: 'Q' + i, pick: { id: ['messi', 'ronaldo', 'neymar', 'mbappe'][i] } });
    await new Promise((r) => setTimeout(r, 20));
  }
  if (JSON.stringify(four[0].qHave) !== '[1,2,3]' || JSON.stringify(four[1].qHave) !== '[2,3]' || JSON.stringify(four[2].qHave) !== '[3]') fail('queue count not synced: ' + JSON.stringify(four.map((q) => q.qHave)));
  four[2].send({ t: 'leave' });
  await new Promise((r) => setTimeout(r, 20));
  if (four[0].qHave[four[0].qHave.length - 1] !== 2 || four[1].qHave[four[1].qHave.length - 1] !== 2) fail('queue leave not synced: ' + JSON.stringify(four.map((q) => q.qHave)));
  four[2].send({ t: 'quick', mode: '2v2', name: 'Q2', pick: { id: 'neymar' } });
  four[3].send({ t: 'quick', mode: '2v2', name: 'Q3', pick: { id: 'mbappe' } });
  const st = await Promise.all(starts);
  if (st[0].size !== 4 || st[0].picks.length !== 4) fail('2v2 start: ' + JSON.stringify(st[0]));
  four[0].G && 0;
  const roomInfo = await Promise.all(rooms);
  if (new Set(roomInfo.map((r) => r.code)).size !== 1 || roomInfo.some((r) => r.size !== 4)) fail('2v2 rooms differ');
  const G4 = four[0].G; if (!G4 || G4.players.length !== 4) fail('client has no 4-player game');
  const iv2 = setInterval(() => four.forEach((q, i) => q.send({ t: 'in', i: { mx: 1, my: 0, pass: Math.random() < 0.05 } })), 16);
  await new Promise((r) => setTimeout(r, 4000)); clearInterval(iv2);
  if (four[0].snaps.length < 60) fail('2v2 too few snapshots');
  if (!(G4.players.every((p) => p.x === p.x)) || G4.players[3].def.id !== 'mbappe') fail('2v2 state ' + JSON.stringify(G4.players.map((p) => [p.x, p.def.id])));
  // somebody leaves mid-match: everyone else is told
  const told = Promise.all([1, 2, 3].map((i) => new Promise((r) => { const prev = four[i].on; four[i].on = (m) => { prev && prev(m); if (m.t === 'left') r(m); }; })));
  four[0].ws.close(); const lm = await told; if (!lm.every((m) => m.forfeit)) fail('2v2 forfeit');
  // protocol 1 and 2 clients in one room hold identical state at the same step; the v2 one gets deltas and at least one keyframe
  {
    const mk = (v) => {
      const c = client('V' + v, {}); c.v = v; c.byK = new Map(); c.kinds = { full: 0, delta: 0 }; c.follow = ISO.Net.follower();
      const on = c.on;
      c.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.t !== 's') return;
        c.kinds[m.n ? 'full' : 'delta']++;
        if (!c.follow(m)) fail('v' + v + ': delta without base');
        const o = JSON.parse(JSON.stringify(m.n)); delete o.ev; c.byK.set(m.k, JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v)));
      });
      return c;
    };
    const p1 = mk(1), p2 = mk(2);
    await Promise.all([p1, p2].map((q) => new Promise((r) => q.ws.on('open', r))));
    const rc = await new Promise((r) => { p1.on = (m) => m.t === 'room' && r(m.code); p1.send({ t: 'create', v: 1, name: 'P1', pick: { id: 'messi' } }); });
    p2.send({ t: 'join', v: 2, code: rc, name: 'P2', pick: { id: 'ronaldo' } });
    const iv3 = setInterval(() => { p1.send({ t: 'in', i: { mx: 1, my: 0 } }); p2.send({ t: 'in', i: { mx: -1, my: 0.3 } }); }, 16);
    await new Promise((r) => setTimeout(r, 5000)); clearInterval(iv3);
    let common = 0, diff = 0;
    for (const [k, v] of p1.byK) if (p2.byK.has(k)) { common++; if (p2.byK.get(k) !== v) diff++; }
    console.log('v1/v2 same room: common steps', common, 'different', diff, '| v2 full', p2.kinds.full, 'delta', p2.kinds.delta, '| v1 full', p1.kinds.full, 'delta', p1.kinds.delta);
    if (common < 100 || diff) fail('v1 and v2 clients disagree');
    if (p1.kinds.delta || p2.kinds.delta < 100 || p2.kinds.full < 1) fail('v2 should get deltas and a keyframe; v1 only full snapshots');
    p1.ws.close(); p2.ws.close();
  }
  // protocol 2 and 3 clients (exercises the per-version delta cache) in one room hold identical state at the same step; the v2 one gets deltas and at least one keyframe
  {
    const mk = (v) => {
      const c = client('V' + v, {}); c.v = v; c.byK = new Map(); c.kinds = { full: 0, delta: 0 }; c.follow = ISO.Net.follower();
      const on = c.on;
      c.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.t !== 's') return;
        c.kinds[m.n ? 'full' : 'delta']++;
        if (!c.follow(m)) fail('v' + v + ': delta without base');
        const o = JSON.parse(JSON.stringify(m.n)); delete o.ev; c.byK.set(m.k, JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v)));
      });
      return c;
    };
    const p1 = mk(2), p2 = mk(3);
    await Promise.all([p1, p2].map((q) => new Promise((r) => q.ws.on('open', r))));
    const rc = await new Promise((r) => { p1.on = (m) => m.t === 'room' && r(m.code); p1.send({ t: 'create', v: 2, name: 'P1', pick: { id: 'messi' } }); });
    p2.send({ t: 'join', v: 3, code: rc, name: 'P2', pick: { id: 'ronaldo' } });
    const iv3 = setInterval(() => { p1.send({ t: 'in', i: { mx: 1, my: 0 } }); p2.send({ t: 'in', i: { mx: -1, my: 0.3 } }); }, 16);
    await new Promise((r) => setTimeout(r, 3000)); clearInterval(iv3);
    let common = 0, diff = 0;
    for (const [k, v] of p1.byK) if (p2.byK.has(k)) { common++; if (p2.byK.get(k) !== v) diff++; }
    console.log('v2/v3 same room: common steps', common, 'different', diff, '| v3 full', p2.kinds.full, 'delta', p2.kinds.delta, '| v2 full', p1.kinds.full, 'delta', p1.kinds.delta);
    if (common < 100 || diff) fail('v2 and v3 clients disagree');
    if (p1.kinds.delta < 100 || p2.kinds.delta < 100 || p1.kinds.full < 1 || p2.kinds.full < 1) fail('v2 and v3 should both get deltas and a keyframe');
    p1.ws.close(); p2.ws.close();
  }
  console.log('OK'); srv.kill(); process.exit(0);
});
