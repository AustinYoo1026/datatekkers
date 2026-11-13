// What the server refuses to believe: unit checks of server/validate.js, then a real server with misbehaving clients.
//   node test-integrity.js
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.resolve(__dirname, '..');
const V = require('./validate');
const ISO = globalThis.ISO;
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.error('  FAIL', what); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
const done = () => { for (const s of servers) s.kill(); console.log(failed ? 'FAILED: ' + failed : 'OK'); process.exit(failed ? 1 : 0); };
setTimeout(() => { console.error('FAIL timeout'); for (const s of servers) s.kill(); process.exit(1); }, 90000);

// ---------------------------------------------------------------- unit
{
  const r = V.validatePick({ id: 'messi', prime: true, skin: 'nope', attr: { pac: 999 }, ovr: 999, stats: { pac: 999 } });
  check(r.ok && Object.keys(r.pick).sort().join() === 'celeb,id,prime,skin', 'pick keeps only id, prime, skin, celeb');
  check(r.ok && r.pick.prime === true && r.pick.skin === 'home', 'bad skin falls back to home');
  check(!V.validatePick({ id: 'you0_1' }).ok && V.validatePick({ id: 'you0_1' }).msg === 'That player cannot be used online.', 'career id rejected');
  check(!V.validatePick({ id: 'no_such_player' }).ok, 'unknown id rejected');
  check(!V.validatePick({ id: { x: 1 } }).ok, 'object id rejected');
  check(V.validatePick({ id: 'messi', prime: 'yes' }).pick.prime === false, "prime:'yes' is false");
  check(V.validatePick({}).ok && V.validatePick(null).ok && V.validatePick(undefined).ok, 'missing pick or id gets the default player');
  // Phase 2: traits, role and the movement table come from the catalogue only. A client cannot inject them through a pick.
  {
    const inj = V.validatePick({ id: 'messi', prime: true, skin: 'gold', traits: ['reflex', 'header'], role: 'defender', m: { top: 9 }, weak: 5 });
    check(inj.ok && Object.keys(inj.pick).sort().join() === 'celeb,id,prime,skin', 'injected traits / role / m are stripped from a pick');
    const defOf = (p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin);      // server.js defOf
    const got = ISO.styleOf(defOf(inj.pick)), want = ISO.styleOf(ISO.outfit(ISO.playerById('messi'), true, 'gold')), cat = ISO.styleOf(ISO.playerById('messi'));
    check(JSON.stringify(got) === JSON.stringify(want), 'styleOf(defOf(pick)) equals the catalogue style');
    check(got.traits.join() === cat.traits.join() && got.role === cat.role && got.role === 'playmaker' && !got.traits.includes('reflex'), 'prime and skin keep the catalogue traits and role');
    check(Object.values(got.m).every((v) => typeof v === 'number' && Number.isFinite(v)) && got.m.top <= 1.03, 'resolved table is finite and capped');
  }
  // Phase 3.4: keeper personalities are offline only. A room's game (built the way server.js builds it) has a keeper def with no style, and a pick cannot inject one.
  {
    const G = ISO.Game.create({ roster: [ISO.PLAYERS[0], ISO.PLAYERS[1]], kickoff: 0, replay: true, turf: 'grass' });
    check(G.keeper.def.gk === undefined && ISO.keeperStyleOf(G.keeper.def).id === 'neutral', "the room's keeper def has no gk (neutral style)");
    check(!('gk' in V.validatePick({ id: 'messi', gk: 'aggressive' }).pick), 'an injected gk is stripped from a pick');
  }
  // Phase 2.5: a celebration is cosmetic and server-validated like a skin; it is never part of the sim
  {
    check(V.validatePick({ id: 'messi', celeb: 'spin' }).pick.celeb === 'spin', 'a known celebration is accepted');
    check(V.validatePick({ id: 'messi', celeb: 'nope' }).pick.celeb === 'signature' && V.validatePick({ id: 'messi', celeb: 5 }).pick.celeb === 'signature' && V.validatePick({ id: 'messi' }).pick.celeb === 'signature', 'unknown or missing celebration -> signature');
    check(V.validatePick({ id: 'messi', celeb: { toString: 1 } }).pick.celeb === 'signature' && V.validatePick({ id: 'messi', celeb: '__proto__' }).pick.celeb === 'signature', 'object / prototype celebration ids -> signature');
    const base = ISO.playerById('messi'), cel = ISO.outfit(base, false, 'home', 'spin');
    check(cel !== base && cel.celeb === 'spin' && base.celeb === undefined, 'outfit with a celebration clones and never mutates the catalogue def');
    check(ISO.celebOf(cel) === 'spin' && ISO.celebOf(base) === 'point', 'celebOf: the bought one, else the signature');
    const a = ISO.Game.create({ roster: [base, ISO.playerById('ronaldo')], seed: 5 }), b = ISO.Game.create({ roster: [cel, ISO.playerById('ronaldo')], seed: 5 });
    const inp = [{ ...ISO.Game.ZERO, my: 1 }, { ...ISO.Game.ZERO }];
    for (let i = 0; i < 600; i++) { ISO.Game.step(a, inp); ISO.Game.step(b, inp); }
    check(JSON.stringify(ISO.Net.snapshot ? ISO.Net.snapshot(a) : a.players.map((p) => [p.x, p.y, p.vx, p.vy])) === JSON.stringify(ISO.Net.snapshot ? ISO.Net.snapshot(b) : b.players.map((p) => [p.x, p.y, p.vx, p.vy])), 'a celebration does not change the simulation (600 steps, same state)');
  }
  {
    const src = require('fs').readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    check(!/rules/.test(src) && (src.match(/Game\.create\(\{[^}]*\}\)/g) || []).every((c) => !/rules|walls|limit|win\b/.test(c)), 'server.js never passes rules, walls, limit or win to Game.create');
    check(!('rules' in V.validatePick({ id: 'messi', rules: 'street' }).pick) && !('rules' in ISO.Net.sanitizeInput({ mx: 1, rules: 'street', limit: 1 })), 'a pick and an input cannot carry rules');
    const g = ISO.Game.create({ roster: [ISO.playerById('messi'), ISO.playerById('ronaldo')], seed: 3, turf: 'grass', replay: true });
    check(!('rules' in g) && !('limit' in g) && !('sudden' in g) && !g.walls, 'the server-shaped Game.create has no rule fields');
    check(!/sand|drillDef|drillspec|\bcustom\b/i.test(src) && (src.match(/Game\.create\(\{[^}]*\}\)/g) || []).every((c) => !/sand|drillDef|drill\b/.test(c)), 'server.js never passes sand or drillDef (Phase 4.3 / 4.4) to Game.create');
    check(!('sand' in V.validatePick({ id: 'messi', sand: { defenders: 3 }, drillDef: {} }).pick) && !('sand' in ISO.Net.sanitizeInput({ mx: 1, sand: { infStam: true }, drillDef: {} })) && !('drillDef' in ISO.Net.sanitizeInput({ mx: 1, drillDef: {} })), 'a pick and an input cannot carry sand or a drill');
    check(!('sand' in g) && !('cust' in g) && !('sandT' in g), 'the server-shaped Game.create has no sand or custom-drill fields');
  }
  const mv = V.sanitizeMoves(['nope', 7, null]);
  check(mv instanceof Set && [...V.FREE_MOVES()].every((m) => mv.has(m)) && !mv.has('nope'), 'sanitizeMoves drops junk, keeps the free moves');
  check(V.sanitizeMoves('x').size === V.FREE_MOVES().length, 'non-array moves -> free moves only');
  check(V.cleanName('<b>Al</b>   ') === 'bAlb' && V.cleanName('') === 'Player' && V.cleanName('x'.repeat(40)).length === 14, 'cleanName');
  const si = ISO.Net.sanitizeInput({ mx: 5, my: NaN, ax: 1e308, ay: -1e308 });
  check(si.mx === 1 && si.my === 0 && si.ax === 1e6 && si.ay === -1e6, 'sanitizeInput clamps mx/my and ax/ay');
}

// ---------------------------------------------------------------- server
const freePort = () => new Promise((res, rej) => { const l = require('net').createServer(); l.on('error', rej); l.listen(0, '127.0.0.1', () => { const p = l.address().port; l.close(() => res(p)); }); });
async function server(env) {
  const port = await freePort();
  const srv = spawn('node', [path.join(__dirname, 'server.js')], { env: { ...process.env, ADMIN_CODE: '', PORT: port, HOST: '127.0.0.1', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  servers.push(srv);
  await new Promise((r) => srv.stdout.once('data', r));
  return port;
}
function client(port) {
  const c = { msgs: [], snaps: [], closed: null, waiters: [] };
  c.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  c.ws.on('message', (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.t === 's') c.snaps.push(m); c.waiters = c.waiters.filter((w) => !w(m)); });
  c.ws.on('close', (code) => { c.closed = code; });
  c.ws.on('error', () => {});
  c.send = (m) => c.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.open = new Promise((r) => c.ws.on('open', r));
  c.wait = (f, ms = 5000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); c.waiters.push((m) => { if (f(m)) { clearTimeout(t); res(m); return true; } return false; }); });
  return c;
}
const rooms = async (port) => (await (await fetch('http://127.0.0.1:' + port + '/healthz')).json()).rooms;
const ask = async (c, msg) => { const p = c.wait((m) => m.t === 'admin'); c.send({ t: 'admin', code: msg }); return (await p).ok; };

(async () => {
  const port = await server({ ADMIN_CODE: 'sekret' });
  // a career player id is refused, and nothing is created
  {
    const c = client(port); await c.open;
    const p = c.wait((m) => m.t === 'error');
    c.send({ t: 'create', name: 'X', pick: { id: 'you0_1' } });
    check((await p).msg === 'That player cannot be used online.', 'career id: error message');
    check((await rooms(port)) === 0, 'career id: no room was created');
    for (const t of ['join', 'quick']) { const q = c.wait((m) => m.t === 'error'); c.send({ t, code: 'ABCD', pick: { id: 'zzz' } }); await q; }
    check((await rooms(port)) === 0, 'bad join/quick: still no room');
    c.ws.close();
  }
  // `in` before a match exists is ignored; the server stays up
  {
    const c = client(port); await c.open;
    c.send({ t: 'in', n: 1, i: { mx: 1 } });
    const p = c.wait((m) => m.t === 'pong'); c.send({ t: 'ping', c: 1 }); await p;
    c.send({ t: 'create', name: 'Solo', pick: { id: 'messi' } }); await c.wait((m) => m.t === 'room');
    c.send({ t: 'in', n: 1, i: { mx: 1 } });
    const q = c.wait((m) => m.t === 'pong'); c.send({ t: 'ping', c: 2 }); await q;
    check(!c.snaps.length, 'in before the match: no snapshots, no crash');
    c.ws.close();
  }
  // a match of two: seat 0 cannot move seat 1's ack, and absurd aim values leave the state finite
  {
    const a = client(port), b = client(port); await a.open; await b.open;
    const code = await new Promise((r) => { a.wait((m) => m.t === 'room').then((m) => r(m.code)); a.send({ t: 'create', name: 'A', pick: { id: 'messi', turf: 'astro', rules: 'street' }, turf: 'astro', rain: true, rules: 'street', win: 1, limit: 2, walls: true }); });      // a client cannot pick the pitch: the server builds its own
    b.send({ t: 'join', code, name: 'B', pick: { id: 'ronaldo' } });
    await a.wait((m) => m.t === 'start');
    for (let n = 1; n <= 150; n++) a.send({ t: 'in', n, i: { mx: 1, my: 0, shoot: n % 20 === 0, ax: 1e308, ay: -1e308 } });
    a.send({ t: 'in', n: 9007199254740990, i: { mx: 1 } });                         // a huge sequence number
    await sleep(1500);
    const last = a.snaps[a.snaps.length - 1];
    check(last && last.ack[0] > 0, 'seat 0 inputs consumed');
    check(a.snaps.every((m) => m.ack[1] === 0) && b.snaps.every((m) => m.ack[1] === 0), "seat 0 never moves seat 1's ack");
    const bad = (m) => /"\$n":"(NaN|-?Infinity)"/.test(JSON.stringify(m));
    check(a.snaps.length > 20 && !a.snaps.some(bad) && !b.snaps.some(bad), 'ax/ay 1e308 leave no NaN or Infinity in the snapshots');
    check(a.snaps.length > 0 && a.snaps.every((m) => !m.n || (m.n.turf === undefined || m.n.turf === 'grass')) && !JSON.stringify(a.snaps).includes('astro'), 'client-sent turf and rain ignored: the pitch stays grass');
    // Phase 4.1: rule sets are offline only. A client cannot set them (not in a pick, not in the create message, not in an input), the server never passes one, and nothing of it reaches the clients.
    check(!JSON.stringify(a.snaps).includes('street') && !JSON.stringify(b.msgs).includes('street') && !a.msgs.some((m) => m.t === 'start' && /rules|limit|street/.test(JSON.stringify(m))), 'client-sent rules / win / limit / walls ignored: no rule set in any server message');
    check(a.snaps.every((m) => !m.n || !m.n.score || (m.n.score[0] < 2 && m.n.score[1] < 2)) && a.snaps.length > 0, 'a client-sent win=1 / limit=2 did not end or alter the match');
    const ps = a.snaps[a.snaps.length - 1].n.players;
    check(ps.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'player positions finite');
    a.ws.close(); b.ws.close();
  }
  // oversize payload: the socket is closed
  {
    const c = client(port); await c.open;
    c.send(JSON.stringify({ t: 'ping', pad: 'x'.repeat(5000) }));
    await sleep(500);
    check(c.closed === 1009, 'oversize payload closes the socket (code ' + c.closed + ')');
  }
  // flood: throttled, the abuser is dropped after sustained abuse, the server survives
  {
    const c = client(port); await c.open;
    for (let i = 0; i < 3000; i++) c.send({ t: 'ping', c: i });
    await sleep(800);
    check(c.msgs.filter((m) => m.t === 'pong').length < 1500, 'flood is throttled (' + c.msgs.filter((m) => m.t === 'pong').length + ' of 3000 answered)');
    check(c.closed === 1008, 'sustained flood closes the socket with 1008 (code ' + c.closed + ')');
    const d = client(port); await d.open; const p = d.wait((m) => m.t === 'pong'); d.send({ t: 'ping', c: 1 }); await p;
    check(true, 'server still answers after the flood'); d.ws.close();
  }
  // admin
  {
    const c = client(port); await c.open;
    check((await ask(c, 'wrong')) === false, 'admin: wrong code');
    check((await ask(c, 'sekret')) === true, 'admin: correct code');
    check((await ask(c, 12345)) === false, 'admin: non-string code');
    c.ws.close();
    const d = client(port); await d.open;
    for (let i = 0; i < 5; i++) await ask(d, 'nope' + i);
    check((await ask(d, 'sekret')) === false, 'admin: locked after 5 attempts, even for the right code');
    d.ws.close();
    const p2 = await server({});            // ADMIN_CODE unset
    const e = client(p2); await e.open;
    check((await ask(e, '')) === false && (await ask(e, 'sekret')) === false && (await ask(e, 'undefined')) === false, 'admin: unset env always fails');
  }
  done();
})().catch((e) => { console.error('FAIL', e); for (const s of servers) s.kill(); process.exit(1); });
