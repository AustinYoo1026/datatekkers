// Phase 4.4 custom drills: node tools/drill-test.js [specs]
// validate() fuzz, 200 random valid drills soaked headless (NaN / stuck / unfinished), cone and wall collisions, share-code round trip, corrupt localStorage.
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js'); require('../js/drillspec.js');
const ISO = globalThis.ISO, C = ISO.C, DS = ISO.DrillSpec, N = +process.argv[2] || 200;
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL:', m); };
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);      // local LCG: the test never uses Math.random
const R = (a, b) => a + rnd() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), pick = (a) => a[Math.floor(rnd() * a.length)];

// ------------------------------------------------------------ validate fuzz
const junk = () => pick([NaN, Infinity, -Infinity, null, undefined, '', 'x', '1e999', [], {}, [[]], true, -1e308, 1e308, 0, -0, 7, '__proto__', { __proto__: { x: 1 } }, () => 1, Symbol('s').description]);
function junkSpec() {
  const o = DS.blank('fz' + RI(0, 99));
  const walk = (x, depth) => { if (depth > 4 || !x || typeof x !== 'object') return; for (const k of Object.keys(x)) { const r = rnd(); if (r < 0.01) x[k] = junk(); else if (r < 0.03) delete x[k]; else if (typeof x[k] === 'number' && r < 0.1) x[k] = pick([R(-2000, 2000), x[k] * 1e6, NaN]); else walk(x[k], depth + 1); } };
  o.cones = Array.from({ length: RI(0, 30) }, () => ({ x: R(-100, 500), y: R(-100, 900), r: R(-5, 40) })).filter((c) => Math.hypot(c.x - 200, c.y - 360) > 70);
  o.walls = Array.from({ length: RI(0, 12) }, () => ({ x0: R(-100, 500), y0: R(-100, 900), x1: R(-100, 500), y1: R(-100, 900), h: R(-9, 300) })).filter((w) => Math.hypot(w.x0 - 200, w.y0 - 360) > 120 && Math.hypot(w.x1 - 200, w.y1 - 360) > 120);
  o.defenders = Array.from({ length: RI(0, 9) }, () => ({ x: R(-100, 500), y: R(-100, 900), mode: pick(['static', 'cpu', 5]), face: R(-50, 50) })).filter((c) => Math.hypot(c.x - 200, c.y - 360) > 70);
  o.targets = Array.from({ length: RI(0, 9) }, () => R(-3, 9));
  o.score.types = { normal: R(-3, 9), power: R(-3, 9), chip: junk(), zzz: 1 };
  walk(o, 0);
  return o;
}
function inBounds(d) {
  const F = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
  if (d.v !== 1 || !/^[a-z0-9_-]{1,24}$/.test(d.id) || !d.name || d.name.length > 24 || !F(d.total, 1, 20) || !F(d.time, 3, 30)) return false;
  const s = d.start, k = d.keeper;
  if (!F(s.x, 40, 270) || !F(s.y, 60, 660) || !F(s.jx, 0, 80) || !F(s.jy, 0, 200)) return false;
  if (!['live', 'dummy', 'none'].includes(k.mode) || !F(k.x, 150, 332) || !F(k.y, 120, 600) || !F(k.nerf, -10, 30)) return false;
  if (d.defenders.length > 4 || d.cones.length > 12 || d.walls.length > 6 || d.targets.length > 4) return false;
  if (d.defenders.some((e) => !F(e.x, 20, 310) || !F(e.y, 20, 700) || e.mode !== 'static' || !F(e.face, -3.2, 3.2))) return false;
  if (d.cones.some((e) => !F(e.x, 20, 320) || !F(e.y, 20, 700) || !F(e.r, 4, 14))) return false;
  if (d.walls.some((e) => !F(e.x0, 20, 320) || !F(e.y0, 20, 700) || !F(e.x1, 20, 320) || !F(e.y1, 20, 700) || !F(e.h, 10, 80))) return false;
  if (d.targets.some((t) => !Number.isInteger(t) || t < 0 || t > 3) || new Set(d.targets).size !== d.targets.length) return false;
  if (!F(d.score.goal, 1, 5) || !F(d.score.bull, 1, 5) || Object.keys(d.score.types).some((t) => !DS.TYPES.includes(t) || !F(d.score.types[t], 0, 5))) return false;
  // nothing on the start
  for (const c of d.cones) if (Math.hypot(c.x - s.x, c.y - s.y) < DS.CLEAR + c.r) return false;
  for (const e of d.defenders) if (Math.hypot(e.x - s.x, e.y - s.y) < DS.CLEAR) return false;
  return true;
}
{
  let ok = 0, nul = 0;
  const hostile = [null, undefined, NaN, 0, 1, 'str', [], [1], {}, { v: 1 }, { v: 1, id: 'a' }, { v: 2, id: 'a' }, { v: 1, id: '../x' }, { v: 1, id: 'a'.repeat(30) }, JSON.parse('{"__proto__":{"polluted":1},"v":1,"id":"p"}'), { v: 1, id: 'a', total: NaN }, { v: 1, id: 'a', total: '5' }, { v: 1, id: 'a', cones: 'x' }, { v: 1, id: 'a', start: { x: NaN } }, { v: 1, id: 'a', cones: [null] }];
  for (const h of hostile) { try { const v = DS.validate(h); if (v && !inBounds(v)) fail('hostile input produced an out of bounds drill'); } catch (e) { fail('validate threw on hostile input: ' + e.message); } }
  if ({}.polluted !== undefined) fail('prototype polluted');
  for (let i = 0; i < 3000; i++) {
    const o = junkSpec();
    let v; try { v = DS.validate(o); } catch (e) { fail('validate threw: ' + e.message); break; }
    if (v === null) { nul++; continue; }
    ok++;
    if (!inBounds(v)) { fail('out of bounds output: ' + JSON.stringify(v).slice(0, 200)); break; }
    if (JSON.stringify(DS.validate(v)) !== JSON.stringify(v)) { fail('validate is not idempotent: ' + JSON.stringify(v) + ' => ' + JSON.stringify(DS.validate(v))); break; }
    if (v === o) fail('validate returned its input');
  }
  console.log('validate fuzz: ' + ok + ' accepted, ' + nul + ' rejected');
  if (!ok || !nul) fail('the fuzz should both accept and reject');
  // a NaN anywhere is a rejection, an overlap with the start is a rejection
  const b = DS.blank('nn'); b.cones = [{ x: NaN, y: 100, r: 8 }]; if (DS.validate(b)) fail('NaN cone accepted');
  const o2 = DS.blank('ov'); o2.cones = [{ x: o2.start.x + 5, y: o2.start.y, r: 8 }]; if (DS.validate(o2)) fail('a cone on the start was accepted');
  const o3 = DS.blank('ov'); o3.defenders = [{ x: o3.start.x + 10, y: o3.start.y, mode: 'static', face: 0 }]; if (DS.validate(o3)) fail('a defender on the start was accepted');
  const o4 = DS.blank('ov'); o4.walls = [{ x0: o4.start.x - 50, y0: o4.start.y + 5, x1: o4.start.x + 50, y1: o4.start.y + 5, h: 40 }]; if (DS.validate(o4)) fail('a wall through the start was accepted');
}

// ------------------------------------------------------------ share code and slots
function randomSpec(i) {
  for (let t = 0; t < 200; t++) {
    const d = {
      v: 1, id: 'r' + i, name: 'DRILL ' + i, total: RI(1, 20), time: RI(3, 30),
      start: { x: RI(60, 250), y: RI(120, 600), jx: RI(0, 40), jy: RI(0, 80) },
      keeper: { mode: pick(['live', 'dummy', 'none']), x: RI(160, 330), y: RI(130, 590), nerf: RI(-5, 20) },
      defenders: Array.from({ length: RI(0, 4) }, () => ({ x: RI(40, 300), y: RI(40, 680), mode: 'static', face: R(-3, 3) })),
      cones: Array.from({ length: RI(0, 12) }, () => ({ x: RI(30, 320), y: RI(30, 690), r: RI(4, 14) })),
      walls: Array.from({ length: RI(0, 6) }, () => { const x0 = RI(30, 320), y0 = RI(30, 690); return { x0, y0, x1: Math.min(320, Math.max(30, x0 + RI(-120, 120))), y1: Math.min(700, Math.max(30, y0 + RI(-120, 120))), h: RI(10, 80) }; }),
      targets: [0, 1, 2, 3].filter(() => rnd() < 0.3), score: { goal: RI(1, 5), bull: RI(1, 5), types: rnd() < 0.5 ? { [pick(DS.TYPES)]: RI(0, 5) } : {} },
    };
    const v = DS.validate(d); if (v) return v;
  }
  return DS.blank('r' + i);
}
{
  const specs = Array.from({ length: 200 }, (_, i) => randomSpec(i));
  for (const s of specs) { const back = DS.fromCode(DS.toCode(s)); if (!back || JSON.stringify(back) !== JSON.stringify(s)) { fail('share code round trip failed for ' + s.id); break; } }
  const code = DS.toCode(specs[0]);
  for (const bad of ['', 'ISOD1:', 'ISOD1:!!!', 'ISOD2:' + code.slice(6), code.slice(0, code.length - 9), code + 'AAAA', 'x'.repeat(9000), 123, null, 'ISOD1:' + Buffer.from('{"v":1,"id":"a","total":"x"}').toString('base64'), 'ISOD1:' + Buffer.from('not json').toString('base64')]) {
    let r; try { r = DS.fromCode(bad); } catch (e) { fail('fromCode threw'); continue; }
    if (r && !inBounds(r)) fail('fromCode returned an out of bounds drill');
  }
  // a hand-edited code with an out of range number is clamped, with a NaN rejected
  const wild = Object.assign({}, specs[0], { total: 999, time: -4 }), vw = DS.fromCode('ISOD1:' + Buffer.from(JSON.stringify(wild)).toString('base64'));
  if (!vw || vw.total !== 20 || vw.time !== 3) fail('an out of range share code was not clamped');
  console.log('share codes: 200 round trips');

  // storage: corrupt, missing, throwing, full
  const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
  const cases = [null, '', 'not json', '{}', '[1,2,3]', '[null]', '{"a":1}', JSON.stringify([{ v: 1, id: 'ok', total: 'x' }]), '[' + '{"v":1},'.repeat(50) + ']', 'x'.repeat(500000), JSON.stringify(Array(50).fill(specs[0]))];
  for (const c of cases) { const s = mem(); if (c !== null) s.m[DS.KEY] = c; let r; try { r = DS.loadSlots(s); } catch (e) { fail('loadSlots threw'); continue; } if (!Array.isArray(r) || r.length > DS.LIM.slots || r.some((d) => !inBounds(d))) fail('loadSlots returned junk for ' + String(c).slice(0, 30)); }
  if (DS.loadSlots(() => { throw new Error('denied'); }).length !== 0) fail('a throwing localStorage');
  if (DS.putSlot(() => { throw new Error('denied'); }, specs[0]).ok) fail('putSlot ok with a throwing storage');
  if (DS.putSlot({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, specs[0]).ok) fail('putSlot ok on a full storage');
  if (DS.KEY !== 'isofootball.drills.v1') fail('slot key');
  const s = mem(); s.m['isofootball.save'] = 'keep';
  for (let i = 0; i < 25; i++) { const r = DS.putSlot(s, specs[i]); if (i < 20 && !r.ok) fail('slot ' + i + ' rejected'); if (i >= 20 && (r.ok || r.reason !== 'full')) fail('the 21st slot was accepted'); }
  if (DS.loadSlots(s).length !== 20) fail('20 slots expected');
  if (DS.putSlot(s, Object.assign({}, specs[3], { total: 2 })).slots.find((d) => d.id === specs[3].id).total !== 2) fail('overwriting a slot');
  if (DS.delSlot(s, specs[3].id).length !== 19) fail('delete');
  if (s.m['isofootball.save'] !== 'keep') fail('the save-slot code touched another key');
  console.log('slots: corrupt / throwing / full / 20 cap handled');
  global.__specs = specs;
}

// ------------------------------------------------------------ headless soak
function mkGame(spec, seedN) {
  const P = ISO.PLAYERS, h = P[seedN % P.length], roster = [h, P[(seedN + 3) % P.length]];
  for (let i = 0; i < spec.defenders.length - 1; i++) roster.push(P[(seedN + 5 + i) % P.length]);
  return ISO.Game.create({ home: h, away: roster[1], roster, seed: 900 + seedN, solo: true, drill: 'custom', drillDef: spec });
}
function bot(G, t) {      // walks at the goal, strikes in bursts at a random aim in the goal mouth
  const p = G.players[0], b = G.ball, ph = t % 160, inp = Object.assign({}, ISO.Game.ZERO);
  const tx = b.owner === p ? C.FW : b.x, ty = b.owner === p ? 360 : b.y, d = Math.hypot(tx - p.x, ty - p.y) || 1;
  inp.mx = (tx - p.x) / d; inp.my = (ty - p.y) / d; inp.sprint = true;
  inp.ax = C.FW; inp.ay = C.GY0 + ((t / 160 | 0) * 37 % 150);
  inp.shoot = ph > 40 && ph < 70; inp.finesse = !inp.shoot && ph > 100 && ph < 120; inp.chip = ph > 130 && ph < 140;
  return inp;
}
{
  const specs = global.__specs.slice(0, N);
  let nan = 0, stuck = 0, unfinished = 0, goals = 0, reps = 0, shots = 0;
  const t0 = Date.now();
  specs.forEach((spec, i) => {
    const G = mkGame(spec, i);
    if (!G.drill || !G.cust || G.drill.kind !== 'custom' || G.drill.total !== spec.total) { fail('custom drill not built for ' + spec.id); return; }
    let t = 0, playT = 0, lastN = 0;
    const cap = Math.ceil((spec.total * (spec.time + 4) + 30) / C.STEP);
    while (G.phase !== 'end' && t < cap) {
      const inp = [bot(G, t)]; for (let k = 1; k < G.players.length; k++) inp.push(ISO.Game.ZERO);
      ISO.Game.step(G, inp); t++;
      for (const o of [G.ball, ...G.players, ...G.keepers]) if (!(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.vx) && Number.isFinite(o.vy))) nan++;
      if (!(Number.isFinite(G.ball.z) && Number.isFinite(G.ball.vz))) nan++;
      if (G.phase === 'play') { playT += C.STEP; if (playT > spec.time + 1.5) { stuck++; playT = 0; } } else playT = 0;
      if (G.drill.n !== lastN) { lastN = G.drill.n; reps++; }
      G.events.length = 0;
    }
    if (G.phase !== 'end') unfinished++;
    goals += G.drill.goals; shots += G.stats.shots[0];
    if (G.drill.points > G.drill.max) fail('points above max in ' + spec.id);
    if (G.drill.n !== spec.total) fail('rep count ' + G.drill.n + ' != ' + spec.total + ' for ' + spec.id);
  });
  console.log('soak: ' + specs.length + ' drills, ' + reps + ' reps, ' + shots + ' shots, ' + goals + ' goals, NaN ' + nan + ', stuck ' + stuck + ', unfinished ' + unfinished + ', ' + (Date.now() - t0) + ' ms');
  if (nan || stuck || unfinished) fail('soak: NaN ' + nan + ' stuck ' + stuck + ' unfinished ' + unfinished);
}

// ------------------------------------------------------------ cones and walls
{
  const spec = DS.validate({ v: 1, id: 'col', name: 'COL', total: 20, time: 30, start: { x: 60, y: 120 }, keeper: { mode: 'none' }, defenders: [], cones: [{ x: 170, y: 360, r: 10 }, { x: 250, y: 200, r: 6 }, { x: 120, y: 500, r: 14 }], walls: [{ x0: 200, y0: 440, x1: 200, y1: 600, h: 40 }, { x0: 80, y0: 250, x1: 160, y1: 330, h: 70 }], targets: [], score: {} });
  if (!spec) fail('collision spec invalid');
  else {
    let inside = 0, nan = 0, hits = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const G = mkGame(spec, i);
      G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false;
      const b = G.ball; b.owner = null; b.holder = null; b.shot = null;
      const tgt = i % 2 ? pick(spec.cones) : { x: 200 + R(-30, 30), y: R(440, 600) };
      const ang = R(0, 6.283), dist = R(40, 110), sp = R(150, 900);
      b.x = tgt.x + Math.cos(ang) * dist; b.y = tgt.y + Math.sin(ang) * dist; b.z = i % 5 === 0 ? R(25, 60) : R(0, 12);
      const dx = tgt.x - b.x, dy = tgt.y - b.y, dd = Math.hypot(dx, dy);
      b.vx = dx / dd * sp; b.vy = dy / dd * sp; b.vz = i % 5 === 0 ? 0 : R(0, 120); b.lastTouch = 0;
      G.players[0].x = 30; G.players[0].y = 30;
      for (let s = 0; s < 240; s++) {
        G.drill.shot = true; G.drill.t = 0; G.drill.still = 0;
        ISO.Game.step(G, [ISO.Game.ZERO, ISO.Game.ZERO]); n++;
        if (G.phase !== 'play') break;
        if (!(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z))) nan++;
        if (b.z < 20 + 4) for (const c of spec.cones) if (Math.hypot(b.x - c.x, b.y - c.y) < c.r + C.BR - 1.5 && b.z < 20) inside++;
        for (const w of spec.walls) {
          const ex = w.x1 - w.x0, ey = w.y1 - w.y0, t = Math.max(0, Math.min(1, ((b.x - w.x0) * ex + (b.y - w.y0) * ey) / (ex * ex + ey * ey)));
          if (b.z < w.h && Math.hypot(b.x - (w.x0 + ex * t), b.y - (w.y0 + ey * t)) < 3 + C.BR - 1.5) inside++;
        }
        G.events.length = 0;
      }
    }
    // the player cannot stand in a cone or a wall either
    const G = mkGame(spec, 1); G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; let pin = 0;
    for (let s = 0; s < 900; s++) {
      const p = G.players[0], c = spec.cones[0], inp = Object.assign({}, ISO.Game.ZERO, { mx: (c.x - p.x) / (Math.hypot(c.x - p.x, c.y - p.y) || 1), my: (c.y - p.y) / (Math.hypot(c.x - p.x, c.y - p.y) || 1), sprint: true });
      G.drill.t = 0; ISO.Game.step(G, [inp, ISO.Game.ZERO]);
      if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + C.PR - 0.5) pin++;
      if (G.phase !== 'play') { G.phase = 'play'; G.phaseT = 0; }
    }
    console.log('collisions: ' + n + ' ball steps, inside ' + inside + ', NaN ' + nan + ', player inside a cone ' + pin);
    if (inside || nan || pin) fail('ball inside a cone or wall (' + inside + '), NaN ' + nan + ', player in cone ' + pin);
    // a wall actually reflects: a ball rolled into the wall at z 0 comes back
    const W = mkGame(spec, 2); W.phase = 'play'; W.phaseT = 0; W.msg = null; W.beat = false;
    const bw = W.ball; bw.owner = null; bw.x = 150; bw.y = 520; bw.z = 0; bw.vx = 400; bw.vy = 0; bw.vz = 0; bw.lastTouch = 0; W.players[0].x = 20; W.players[0].y = 20;
    for (let s = 0; s < 100; s++) { W.drill.shot = true; W.drill.t = 0; ISO.Game.step(W, [ISO.Game.ZERO, ISO.Game.ZERO]); W.events.length = 0; }
    if (!(bw.vx < 0)) fail('a ball into a wall did not rebound (vx ' + bw.vx + ')');
    // and a high ball clears a low wall: h 40 wall, ball at z 60
    const H = mkGame(spec, 2); H.phase = 'play'; H.phaseT = 0; H.msg = null; H.beat = false;
    const bh = H.ball; bh.owner = null; bh.x = 150; bh.y = 520; bh.z = 70; bh.vx = 400; bh.vy = 0; bh.vz = 0; bh.lastTouch = 0; H.players[0].x = 20; H.players[0].y = 20;
    for (let s = 0; s < 40; s++) { H.drill.shot = true; H.drill.t = 0; ISO.Game.step(H, [ISO.Game.ZERO, ISO.Game.ZERO]); H.events.length = 0; }
    if (!(bh.vx > 0 && bh.x > 200)) fail('a high ball did not clear the wall (x ' + bh.x + ')');
  }
}

// ------------------------------------------------------------ the default sim carries none of it
{
  const P = ISO.PLAYERS;
  for (const G of [ISO.Game.create({ home: P[0], away: P[1], seed: 5 }), ISO.Game.create({ home: P[0], away: P[1], seed: 5, solo: true, drill: 'arena' }), ISO.Game.create({ home: P[0], away: P[1], seed: 5, drill: 'penalty' })])
    if ('sand' in G || 'cust' in G || 'sandT' in G || (G.drill && 'def' in G.drill)) fail('a default game grew sand / custom fields');
  const bad = ISO.Game.create({ home: P[0], away: P[1], seed: 5, solo: true, drill: 'custom', drillDef: { v: 1, id: 'x', total: NaN } });
  if (bad.drill || bad.cust) fail('an invalid drillDef produced a drill');
  const noDef = ISO.Game.create({ home: P[0], away: P[1], seed: 5, solo: true, drill: 'custom' });
  if (noDef.drill || noDef.cust) fail('drill custom without a def produced a drill');
  const pre = JSON.stringify(ISO.DRILLS.penalty);
  if (pre !== JSON.stringify({ name: 'PENALTY SHOOTOUT', total: 5, max: 5 })) fail('built-in drill table changed');
}
console.log(fails ? 'drill-test FAILED (' + fails + ')' : 'drill-test OK');
if (fails) process.exitCode = 1;
