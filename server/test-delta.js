// Protocol 2 delta codec: for seeded 1v1 and 2v2 matches (goals and replays included), patching the previous snapshot with the JSON
// round trip of diff(prev, cur) must give exactly the full snapshot, and a game fed those patched snapshots must re-simulate bit-exactly.
//   node test-delta.js [matches] [K]
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'ai', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C, P = ISO.PLAYERS, Net = ISO.Net;
const X = process.env.PROTO === '3';      // PROTO=3: the compact floats and the tick lists
const N = +process.argv[2] || 6, K = +process.argv[3] || 2, M = 30;
const fields = (G) => {
  const o = { rs: G.rs, phase: G.phase, t: G.t, score: G.score.join('-') };
  G.players.forEach((p, i) => { o['p' + i + '.x'] = p.x; o['p' + i + '.y'] = p.y; o['p' + i + '.vx'] = p.vx; o['p' + i + '.vy'] = p.vy; o['p' + i + '.face'] = p.face; o['p' + i + '.state'] = p.state; o['p' + i + '.stam'] = p.stam; });
  const k = G.keeper, b = G.ball;
  Object.assign(o, { 'k.x': k.x, 'k.y': k.y, 'k.state': k.state, 'b.x': b.x, 'b.y': b.y, 'b.z': b.z, 'b.vx': b.vx, 'b.vy': b.vy, 'b.vz': b.vz });
  return o;
};
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
let checks = 0, bad = 0, first = null, goals = 0, dBytes = 0, fBytes = 0, resim = 0;
const fail = (what, info) => { bad++; first = first || { what, info }; };

for (let m = 0; m < N; m++) {
  const four = m % 2 === 1;
  const roster = (four ? [0, 1, 2, 3] : [0, 1]).map((i) => P[(m * 5 + i * 3) % P.length]);
  const moves = roster.map(() => new Set(Object.keys(ISO.Game.SKILLS)));
  const G = ISO.Game.create({ roster, seed: 900 + m, kickoff: m % 2, replay: true, moves });
  const H = ISO.Game.create({ roster, seed: 1, kickoff: 1 - (m % 2), moves });
  const ai = roster.map((_, i) => ISO.AI.create(['hard', 'normal', 'easy'][(m + i) % 3]));
  const follow = Net.follower();
  let prev = null, steps = 0;
  const input = (g) => g.players.map((p, i) => Net.sanitizeInput(Net.packInput(ISO.AI.update(g, p, ai[i], C.STEP))));
  while (G.phase !== 'end' && G.time < 200) {
    ISO.Game.step(G, input(G)); steps++;
    for (const e of G.events) if (e.type === 'goal') goals++;
    const evs = G.events.slice(); G.events.length = 0;
    if (steps % K) continue;
    const snap = Net.snapshot(G, evs), ev = snap.ev; delete snap.ev;
    const full = JSON.parse(JSON.stringify(snap));
    if (prev) {
      const d = Net.diff(prev, snap, X), wire = JSON.stringify(d === undefined ? {} : d);
      dBytes += wire.length; fBytes += JSON.stringify(snap).length;
      const rt = JSON.parse(wire), base = JSON.parse(JSON.stringify(prev));
      Net.patch(base, rt);
      checks++;
      if (!same(base, full)) fail('patched != full', { match: m, step: steps });
    }
    // through the follower, the way a client sees it
    const msg = prev ? { k: steps, b: steps - K, ev, ...(Net.diff(prev, snap, X) !== undefined ? { d: JSON.parse(JSON.stringify(Net.diff(prev, snap, X))) } : {}) } : { k: steps, n: JSON.parse(JSON.stringify({ ...snap, ev })) };
    if (!follow(msg)) fail('follower refused', { match: m, step: steps });
    else if (!same({ ...msg.n, ev: 0 }, { ...full, ev: 0 })) fail('follower state != full', { match: m, step: steps });
    prev = snap;
    if (steps % (K * 20) === 0 && msg.n) {          // re-simulate from the reconstructed snapshot
      Net.apply(H, JSON.parse(JSON.stringify(msg.n)));
      for (let j = 0; j < M && G.phase !== 'end'; j++) {
        const inp = input(G); H.rs = G.rs;
        ISO.Game.step(G, inp); ISO.Game.step(H, inp.map((i) => ({ ...i })));
        G.events.length = 0; H.events.length = 0; steps++;
      }
      const a = fields(G), b = fields(H);
      for (const k in a) if (!Object.is(a[k], b[k])) fail('resim ' + k, { match: m, step: steps, a: a[k], b: b[k] });
      resim++; prev = null;          // the game moved on without snapshots: restart with a keyframe
    }
  }
}
// fuzz: a delta with the wrong base is refused once and a keyframe repairs it
{
  const G = ISO.Game.create({ roster: [P[0], P[1]], seed: 5 }), H = ISO.Game.create({ roster: [P[0], P[1]], seed: 6 });
  const snap = () => { const s = Net.snapshot(G, []); return s; };
  const resyncs = []; const pred = Net.Predictor({ me: 0, send() {}, resync: () => resyncs.push(1) });
  let s0 = snap(); const first = { t: 's', k: 10, ack: [0, 0], q: [1, 1], inp: [null, null], n: JSON.parse(JSON.stringify(s0)) };
  pred.onSnapshot(first);
  ISO.Game.step(G, [ISO.Game.ZERO, ISO.Game.ZERO]); G.events.length = 0;
  const s1 = snap(); delete s0.ev; delete s1.ev;
  const d = JSON.parse(JSON.stringify(Net.diff(s0, s1)));
  pred.onSnapshot({ t: 's', k: 12, b: 999, ack: [0, 0], q: [1, 1], d, ev: [] });         // wrong base
  pred.onSnapshot({ t: 's', k: 14, b: 12, ack: [0, 0], q: [1, 1], d, ev: [] });          // still no base: only one resync
  if (pred.stats.resyncs !== 1 || resyncs.length !== 1) fail('resync not requested exactly once', pred.stats.resyncs);
  pred.frame(H, 0, () => null);                                                           // must not throw with events-only entries
  pred.onSnapshot({ t: 's', k: 16, ack: [0, 0], q: [1, 1], inp: [null, null], n: JSON.parse(JSON.stringify({ ...s1, ev: [] })) });
  pred.frame(H, 0, () => null);
  if (Math.abs(H.players[0].x - G.players[0].x) > 1e-9) fail('keyframe did not repair', [H.players[0].x, G.players[0].x]);
  // a corrupt patch must not throw out of onSnapshot
  const p2 = Net.Predictor({ me: 0, send() {}, resync() {} });
  p2.onSnapshot(first); p2.onSnapshot({ t: 's', k: 12, b: 10, ack: [0, 0], d: { players: { $a: { 0: { $a: { 3: 1 } } } }, ball: { x: { $a: { 1: 2 } } } }, ev: [] });
  checks++;
}
{ // a value that becomes undefined must be sent as null, never treated as unchanged
  const a = { arr: [1, 2, 3], o: { x: 1, y: 2 } }, b = { arr: [1, undefined, 3], o: { x: 1, y: undefined } };
  const d = Net.diff(a, b); checks++;
  if (d === undefined) fail('undefined change treated as unchanged', null);
  else { const got = Net.patch(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(d))); if (got.arr[1] !== null || got.o.y !== null || got.arr[0] !== 1) fail('undefined not sent as null', got); }
}
console.log('delta: patches checked', checks, 'goals seen', goals, 're-simulations', resim, 'mismatches', bad, '| delta body', Math.round(dBytes / Math.max(1, checks)), 'B vs full', Math.round(fBytes / Math.max(1, checks)), 'B');
if (!goals) { console.error('FAIL no goal in the sample'); process.exit(1); }
if (bad) { console.error('FAIL first', JSON.stringify(first)); process.exit(1); }
console.log('OK');
