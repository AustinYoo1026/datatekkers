// Determinism check for the online prediction: a snapshot, sent as JSON and applied onto another Game object, must
// re-simulate exactly like the game it was taken from.   node test-determinism.js [matches] [K] [M]
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'ai', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C, P = ISO.PLAYERS;
const N = +process.argv[2] || 12, K = +process.argv[3] || 7, M = +process.argv[4] || 30;

const fields = (G) => {
  const o = { rs: G.rs, phase: G.phase, t: G.t, score: G.score.join('-') };
  G.players.forEach((p, i) => { o['p' + i + '.x'] = p.x; o['p' + i + '.y'] = p.y; o['p' + i + '.vx'] = p.vx; o['p' + i + '.vy'] = p.vy; o['p' + i + '.face'] = p.face; o['p' + i + '.state'] = p.state; o['p' + i + '.stam'] = p.stam; });
  const k = G.keeper, b = G.ball;
  Object.assign(o, { 'k.x': k.x, 'k.y': k.y, 'k.state': k.state, 'b.x': b.x, 'b.y': b.y, 'b.z': b.z, 'b.vx': b.vx, 'b.vy': b.vy, 'b.vz': b.vz });
  return o;
};
let checks = 0, bad = 0, bytes = 0, firstBad = null, stepNs = 0n, stepN = 0, events = 0;
const evTypes = {};
for (let m = 0; m < N; m++) {
  const four = m % 3 === 2;
  const roster = (four ? [0, 1, 2, 3] : [0, 1]).map((i) => P[(m * 7 + i * 3) % P.length]);
  const moves = roster.map((_, i) => (i % 2 ? null : new Set(Object.keys(ISO.Game.SKILLS))));
  const G = ISO.Game.create({ roster, seed: 4000 + m, kickoff: m % 2, replay: true, moves });
  const H = ISO.Game.create({ roster, seed: 1, kickoff: 1 - (m % 2), moves });          // the "client": same roster, different everything else
  const ai = roster.map((_, i) => ISO.AI.create(['hard', 'normal', 'easy'][(m + i) % 3]));
  let steps = 0;
  const input = () => G.players.map((p, i) => ISO.Net.sanitizeInput(ISO.Net.packInput(ISO.AI.update(G, p, ai[i], C.STEP))));
  while (G.phase !== 'end' && G.time < 240) {
    if (steps % K === 0) {
      const wire = JSON.stringify(ISO.Net.snapshot(G, []));
      bytes += wire.length;
      ISO.Net.apply(H, JSON.parse(wire));
      for (let j = 0; j < M && G.phase !== 'end'; j++) {
        const r0 = G.rs, inp = input();
        if (H.rs !== r0) { bad++; firstBad = firstBad || { match: m, step: steps, after: j, diff: { rs: [r0, H.rs] } }; }
        H.rs = G.rs;                    // ISO.AI rolls its dice on G.rand: that is input generation, outside the simulation
        const t0 = process.hrtime.bigint();
        ISO.Game.step(G, inp);
        stepNs += process.hrtime.bigint() - t0; stepN++;
        ISO.Game.step(H, inp.map((i) => ({ ...i })));
        for (const e of G.events) evTypes[e.type] = (evTypes[e.type] || 0) + 1;
        if (G.events.length !== H.events.length || G.events.some((e, x) => e.type !== H.events[x].type)) { bad++; firstBad = firstBad || { match: m, step: steps, after: j + 1, diff: { events: [G.events.map((e) => e.type), H.events.map((e) => e.type)] } }; }
        events += G.events.length; G.events.length = 0; H.events.length = 0;
        steps++;
      }
      checks++;
      const a = fields(G), b = fields(H), diff = {};
      for (const k in a) if (!Object.is(a[k], b[k])) diff[k] = [a[k], b[k]];
      // and the complete state, as the codec sees it
      const sa = JSON.stringify(ISO.Net.snapshot(G, [])), sb = JSON.stringify(ISO.Net.snapshot(H, []));
      if (sa !== sb && !Object.keys(diff).length) {
        const A = JSON.parse(sa), B = JSON.parse(sb);
        const walk = (x, y, p) => { if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set(Object.keys(x).concat(Object.keys(y)))) walk(x[k], y[k], p + '.' + k); } else if (x !== y) diff[p] = [x, y]; };
        walk(A, B, 'G');
        if (!Object.keys(diff).length) diff.order = 'key order only';
      }
      if (Object.keys(diff).length && diff.order !== 'key order only') { bad++; firstBad = firstBad || { match: m, step: steps, after: M, diff }; }
    } else { ISO.Game.step(G, input()); G.events.length = 0; steps++; }
  }
}
console.log('determinism: matches', N, 'checks', checks, '(every', K, 'steps, re-simulated', M, 'steps each)', 'mismatches', bad,
  '| avg snapshot', Math.round(bytes / checks), 'bytes | step', (Number(stepNs) / stepN / 1000).toFixed(1), 'us | events compared', events);
console.log(evTypes);
if (bad) { console.error('FAIL first mismatch', JSON.stringify(firstBad, null, 1)); process.exit(1); }
console.log('OK');
