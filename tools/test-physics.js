// Phase 1.3 / 1.4 physics tests: node tools/test-physics.js   (non-zero exit on failure)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'ai', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO, C = ISO.C, PH = ISO.Phys, PP = C.PHYS, P = ISO.PLAYERS, Z = ISO.Game.ZERO;
const { FW, GY0, GY1, BR } = C, FR = PP.FRAME, BN = PP.BOUNCE, GCY = (GY0 + GY1) / 2;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; if (fails < 40) console.log('FAIL', m); } };
const keys = ['k1', 'k0', 'e', 'keep', 'bite', 'zip', 'grip', 'brake', 'slide', 'slip'];
const rows = [];
for (const t of Object.keys(PP.SURF)) for (const w of ['dry', 'wet']) rows.push([t, w, PP.SURF[t][w]]);
const mkBall = (o) => Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tsp: 0 }, o);
const fly = (s, S, steps, f) => { for (let i = 0; i < steps; i++) { PH.ballMotion(s, 1 / 120, 1, S); if (f && f(s, i) === false) break; } return s; };

// ---- config
for (const [t, w, S] of rows) {
  ok(keys.every((k) => Number.isFinite(S[k])), 'row complete ' + t + w);
  ok(S.e > 0 && S.e < 1 && S.keep > 0 && S.keep < 1, 'e/keep range ' + t + w);
  ok(w === 'wet' ? S.slip > 0 && S.skip && S.skip.v > 0 : S.slip === 0 && S.skip === null, 'wet/dry columns ' + t + w);
}
ok(PP.SURF.grass.dry.k0 / PP.SURF.grass.dry.k1 === 40, 'grass dry k0/k1 is exactly 40');
ok(PH.surf({ turf: 'nope', ball: { wet: false } }) === PP.SURF.grass.dry, 'unknown turf falls back to grass');
ok(PH.surf({ ball: { wet: true } }) === PP.SURF.grass.wet, 'missing turf is grass');
ok(ISO.Game.turfs.join() === Object.keys(PP.SURF).join(), 'ISO.Game.turfs');
ok(ISO.Game.create({ roster: [P[0], P[1]], turf: 'astro' }).turf === 'astro', 'turf option');
ok(ISO.Game.create({ roster: [P[0], P[1]], turf: 'zzz' }).turf === 'grass', 'bad turf option');
ok(ISO.Game.create({ roster: [P[0], P[1]], turf: 'astro', solo: true }).turf === 'grass', 'solo forces grass');
ok(ISO.Game.create({ roster: [P[0], P[1]], turf: 'lush', drill: 'penalty' }).turf === 'grass', 'drill forces grass');

// ---- roll distance, ordering, pass speed
const rest = {};
for (const [t, w, S] of rows) {
  for (const v0 of [200, 600, 1000]) {
    const s = mkBall({ vx: v0 });
    fly(s, S, 120 * 2);
    const want = PH.rollDist(v0, 2, S);
    ok(Math.abs(s.x - want) <= 0.01 * want + 0.5, 'rollDist ' + t + w + ' v0 ' + v0 + ': ' + s.x.toFixed(1) + ' vs ' + want.toFixed(1));
  }
  rest[t + w] = PH.rollDist(700, 99, S);
  for (let d = 60; d <= 600; d += 20) {
    const v = PH.passSpeed(d, S), s = mkBall({ vx: v });
    fly(s, S, 120 * 10, (b) => b.x < d);
    const arr = Math.hypot(s.vx, s.vy);
    ok(v === PP.PASS.vMin || v >= PP.PASS.vMax - 1e-9 || (arr >= 150 && arr <= 215), 'passSpeed arrival ' + t + w + ' d ' + d + ' arr ' + arr.toFixed(0));
  }
}
ok(rest.lushdry < rest.grassdry && rest.grassdry < rest.astrodry && rest.astrodry <= rest.firmdry, 'dry roll order lush < grass < astro <= firm: ' + JSON.stringify(rest));
for (const t of Object.keys(PP.SURF)) ok(rest[t + 'wet'] > rest[t + 'dry'], 'wet rolls further ' + t);

// ---- bounce
for (const [t, w, S] of rows) {
  const s = mkBall({ z: 100 }); let apex = 0, bounced = false;
  fly(s, S, 120 * 5, (b) => { if (b.bounced) bounced = true; if (bounced) apex = Math.max(apex, b.z); });
  ok(Math.abs(apex / 100 - S.e * S.e) < 0.05, 'rebound ~ e^2 ' + t + w + ' ' + (apex / 100).toFixed(3) + ' vs ' + (S.e * S.e).toFixed(3));
  const r = mkBall({ z: 100, vx: 200 }); fly(r, S, 120 * 5);
  ok(Math.hypot(r.vx, r.vy) === 0 && r.z === 0 && r.vz === 0, 'ball comes to rest within 5 s ' + t + w);
  const ret = {};
  for (const [tag, ts] of [['top', 1], ['none', 0], ['back', -1]]) {
    const b = mkBall({ z: 80, vx: 400, tsp: ts }); let v1 = 0, v2 = 0;
    for (let i = 0; i < 240; i++) { const pre = Math.hypot(b.vx, b.vy); b.bounced = false; PH.ballMotion(b, 1 / 120, 1, S); if (b.bounced) { v1 = pre; v2 = Math.hypot(b.vx, b.vy); break; } }
    ret[tag] = v2 / v1;
  }
  ok(ret.top > ret.none && ret.none > ret.back, 'topspin > none > backspin retention ' + t + w + ' ' + JSON.stringify(ret));
}
{
  const S = PP.SURF.astro.wet; let worst = 0, maxTurn = 0;
  for (let sp = -1; sp <= 1.001; sp += 0.25) for (let ts = -1; ts <= 1.001; ts += 0.5) {
    const b = mkBall({ z: 60, vx: 500, vy: 40, spin: sp, tsp: ts });
    for (let i = 0; i < 600; i++) {
      const hv = Math.hypot(b.vx, b.vy), ang = Math.atan2(b.vy, b.vx); b.bounced = false;
      PH.ballMotion(b, 1 / 120, 1, S);
      if (b.bounced) {
        worst = Math.max(worst, Math.hypot(b.vx, b.vy) / hv);
        const d = Math.atan2(b.vy, b.vx) - ang; maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
      }
    }
  }
  ok(worst <= 1 + 1e-9, 'bounce never adds horizontal speed ' + worst);
  ok(maxTurn <= BN.side * 1.25 + 0.02, 'sidespin deflection bounded ' + maxTurn);
  for (const sp of [0.8, -0.8]) {
    const a = mkBall({ z: 60, vx: 400, spin: sp }); let h0 = 0, h1 = 0;
    for (let i = 0; i < 600; i++) { const hd = Math.atan2(a.vy, a.vx); a.bounced = false; PH.ballMotion(a, 1 / 120, 1, PP.SURF.grass.dry); if (a.bounced) { h0 = hd; h1 = Math.atan2(a.vy, a.vx); break; } }
    ok(Math.sign(h1 - h0) === Math.sign(sp), 'sidespin kick follows the Magnus direction ' + sp);
  }
}
// zero-spin path equals the plain (pre-1.3) formula
{
  const S = PP.SURF.grass.dry, ref = (s, dt) => {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.z > 0 || s.vz > 0) { s.vz -= C.GRAV * dt; s.z += s.vz * dt; if (s.z <= 0) { s.z = 0; if (s.vz < -90) { s.vz = -s.vz * 0.48; s.vx *= 0.84; s.vy *= 0.84; } else s.vz = 0; } }
    const air = s.z > 1, k1 = air ? 0.2 : 0.7, k0 = air ? 0 : 28, sp = Math.hypot(s.vx, s.vy);
    if (sp > 0) { const ns = Math.max(0, sp - (k1 * sp + k0) * dt); s.vx *= ns / sp; s.vy *= ns / sp; }
  };
  const a = mkBall({ z: 50, vx: 420, vy: -130, vz: 200 }), b = mkBall({ z: 50, vx: 420, vy: -130, vz: 200 });
  let same = true;
  for (let i = 0; i < 800; i++) { PH.ballMotion(a, 1 / 120, 1, S); ref(b, 1 / 120); for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) if (!Object.is(a[k], b[k])) same = false; }
  ok(same, 'zero-spin ballMotion equals the plain formula bit for bit');
}
// Magnus mirror symmetry, air vs ground drag
{
  const S = PP.SURF.grass.dry, a = mkBall({ z: 40, vx: 450, vy: 30, vz: 150, spin: 0.7 }), b = mkBall({ z: 40, vx: 450, vy: -30, vz: 150, spin: -0.7 });
  let sym = true;
  for (let i = 0; i < 300; i++) { PH.ballMotion(a, 1 / 120, 1, S); PH.ballMotion(b, 1 / 120, 1, S); if (Math.abs(a.y + b.y) > 1e-9 || Math.abs(a.x - b.x) > 1e-9) sym = false; }
  ok(sym, 'Magnus mirror symmetry');
  const air = mkBall({ z: 200, vx: 500 }), gnd = mkBall({ vx: 500 });
  fly(air, S, 30); fly(gnd, S, 30);
  ok(air.vx > gnd.vx, 'less drag in the air than on the ground');
}

// ---- goal frame
{
  const G = ISO.Game.create({ roster: [P[0], P[1]], seed: 1 });
  const inCap = (b) => {
    let worst = 1e9;
    for (const [ax, ay, az, bx, by, bz] of [[FW, GY0, 0, FW, GY0, FR.barZ], [FW, GY1, 0, FW, GY1, FR.barZ], [FW, GY0, FR.barZ, FW, GY1, FR.barZ]]) {
      const ex = bx - ax, ey = by - ay, ez = bz - az, l2 = ex * ex + ey * ey + ez * ez, t = Math.max(0, Math.min(1, ((b.x - ax) * ex + (b.y - ay) * ey + (b.z - az) * ez) / l2));
      worst = Math.min(worst, Math.hypot(b.x - (ax + ex * t), b.y - (ay + ey * t), b.z - (az + ez * t)));
    }
    return worst;
  };
  const shoot = (y, z, v, vz) => mkBall({ x: FW - 90, y: GCY, z: z - (vz || 0) * (90 / v), vx: v, vy: (y - GCY) / (90 / v), vz: vz || 0 });      // straight line (no gravity) crossing x = FW at (y, z)
  let nan = 0, inside = 0, gain = 0, maxPost = 0, scored = 0, total = 0, under = 0, top = 0, centre = 0, lowIn = 0, lowN = 0, hiOut = 0, hiN = 0;
  const run = (b) => {
    let posts = 0, res = 'back';
    for (let i = 0; i < 360; i++) {
      const sp0 = Math.hypot(b.vx, b.vy, b.vz);
      b.x += b.vx / 120; b.y += b.vy / 120; b.z += b.vz / 120;
      G.events.length = 0;
      if (b.z < 0) { b.z = 0; b.vz = Math.abs(b.vz); }
      if (b.z < FR.barZ + BR + FR.r) { PH.hitSeg(G, b, FW, GY0, 0, FW, GY0, FR.barZ); PH.hitSeg(G, b, FW, GY1, 0, FW, GY1, FR.barZ); PH.hitSeg(G, b, FW, GY0, FR.barZ, FW, GY1, FR.barZ); }
      for (const e of G.events) if (e.type === 'post') posts++;
      const sp1 = Math.hypot(b.vx, b.vy, b.vz);
      if (!Number.isFinite(sp1) || !Number.isFinite(b.x + b.y + b.z)) { nan++; break; }
      if (sp1 > sp0 + 1e-6) gain++;
      if (inCap(b) < BR + FR.r - 1.5) inside++;
      if (b.x > FW + BR) { res = b.y > GY0 && b.y < GY1 ? (b.z >= FR.barZ ? 'out' : 'in') : 'wide'; break; }
      if (b.x < FW - 200) break;
    }
    maxPost = Math.max(maxPost, posts);
    return res;
  };
  for (const v of [200, 400, 700, 1000, 1300]) for (let y = GY0 - 20; y <= GY1 + 20; y += 5) for (let z = 0; z <= 100; z += 2) {
    const r = run(shoot(y, z, v)); total++; if (r === 'in') scored++;
    const edge = Math.min(Math.abs(y - GY0), Math.abs(y - GY1));
    if (z === FR.barZ - 1 && edge > 20 && r === 'in') centre++;
    if (z <= FR.barZ - 11 && edge > 12 && y > GY0 && y < GY1) { lowN++; if (r === 'in') lowIn++; }
    if (z >= FR.barZ + 11 && edge > 12 && y > GY0 && y < GY1) { hiN++; if (r === 'out') hiOut++; }
  }
  for (let v = 300; v <= 1000; v += 100) for (let z0 = 40; z0 <= 66; z0 += 2) {
    const b = shoot(GCY, z0, v, 240); if (run(b) === 'in') under++;
    const c = shoot(GCY, z0 + 25, v, -240); if (run(c) === 'in') top++;
  }
  for (let v = 300; v <= 1000; v += 100) if (run(shoot(GCY, FR.barZ, v, 0)) === 'in') centre++;
  ok(nan === 0, 'frame: no NaN');
  ok(inside === 0, 'frame: ball never left inside a capsule (' + inside + ')');
  ok(gain === 0, 'frame: contact never adds speed (' + gain + ')');
  ok(centre === 0, 'frame: a ball aimed at the bar centre never scores (' + centre + ')');
  ok(lowN > 0 && lowIn === lowN, 'frame: z <= barZ-11 always scores (' + lowIn + '/' + lowN + ')');
  ok(hiN > 0 && hiOut === hiN, 'frame: z >= barZ+11 is always out (' + hiOut + '/' + hiN + ')');
  ok(under >= 1, 'frame: an underside hit can go in (' + under + ')');
  ok(top === 0, 'frame: a top-of-bar hit never goes in (' + top + ')');
  ok(maxPost <= 3, 'frame: at most 3 post events per shot, a corner can rattle (' + maxPost + ')');
  console.log('frame grid:', total, 'shots,', scored, 'scored; underside goals', under, 'top goals', top, 'max post events', maxPost);
}

// ---- fuzz
{
  let s0 = 12345; const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 4294967296);
  const G = ISO.Game.create({ roster: [P[0], P[1]], seed: 2 }); let bad = 0;
  const turfs = Object.keys(PP.SURF);
  for (let k = 0; k < 2000; k++) {
    const S = PP.SURF[turfs[k % 4]][k & 4 ? 'wet' : 'dry'];
    const b = mkBall({ x: FW - rnd() * 300, y: GY0 - 100 + rnd() * 400, z: rnd() * 120, vx: (rnd() - 0.3) * 1500, vy: (rnd() - 0.5) * 1200, vz: (rnd() - 0.3) * 600, spin: rnd() * 2 - 1, tsp: rnd() * 2 - 1 });
    for (let i = 0; i < 600; i++) {
      PH.ballMotion(b, 1 / 120, 1, S);
      if (b.z < FR.barZ + BR + FR.r) { PH.hitSeg(G, b, FW, GY0, 0, FW, GY0, FR.barZ); PH.hitSeg(G, b, FW, GY1, 0, FW, GY1, FR.barZ); PH.hitSeg(G, b, FW, GY0, FR.barZ, FW, GY1, FR.barZ); }
      G.events.length = 0;
      if (!(Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz) && b.z >= 0 && Math.abs(b.spin) <= 1 && Math.abs(b.tsp) <= 1)) { bad++; break; }
      if (b.x > FW + 60 || b.x < -200) break;
    }
  }
  ok(bad === 0, 'fuzz: finite, z >= 0, |spin|,|tsp| <= 1 (' + bad + ' bad of 2000)');
}

// ---- determinism and snapshot carries the surface
{
  const mk = (turf, rain) => ISO.Game.create({ roster: [P[3], P[5]], seed: 77, turf, rain });
  const runG = (G, n, h) => {
    const ai = [ISO.AI.create('normal'), ISO.AI.create('normal')];
    for (let i = 0; i < n; i++) { ISO.Game.step(G, [{ ...ISO.AI.update(G, G.players[0], ai[0], C.STEP) }, { ...ISO.AI.update(G, G.players[1], ai[1], C.STEP) }]); G.events.length = 0; if (i % 50 === 0) h.push(G.ball.x, G.ball.y, G.ball.z, G.ball.tsp); }
    return h;
  };
  const a = runG(mk('astro', true), 3000, []), b = runG(mk('astro', true), 3000, []);
  ok(a.every((v, i) => Object.is(v, b[i])), 'determinism: the same script twice is identical');
  const G = mk('astro', true), H = mk('grass', false), ai = [ISO.AI.create('normal'), ISO.AI.create('normal')];
  const inp = () => G.players.map((p, i) => ISO.Net.sanitizeInput(ISO.Net.packInput(ISO.AI.update(G, p, ai[i], C.STEP))));
  for (let i = 0; i < 2400; i++) { ISO.Game.step(G, inp()); G.events.length = 0; }
  ISO.Net.apply(H, JSON.parse(JSON.stringify(ISO.Net.snapshot(G, []))));
  ok(H.turf === 'astro' && H.ball.wet === true && H.weather === 'rain', 'snapshot carries turf and the wet ball');
  let same = true;
  const vec = (g) => [g.ball.x, g.ball.y, g.ball.z, g.ball.vx, g.ball.vy, g.ball.vz, g.ball.tsp, g.ball.spin];
  for (let i = 0; i < 1500; i++) {
    const x = inp(), r = G.rs; ISO.Game.step(G, x); H.rs = r; ISO.Game.step(H, x.map((v) => ({ ...v }))); G.events.length = 0; H.events.length = 0;
    const va = vec(G), vb = vec(H);
    if (!va.every((v, j) => Object.is(v, vb[j]))) { same = false; break; }
  }
  ok(same, 'snapshot applied onto a different-turf game continues bit-identically');
}

// ---- body (1.4)
{
  const BD = PP.BODY, ST = BD.STUMBLE;
  const mk = (str, h, bal, agi, extra) => ({ a: Object.assign({}, P[0].attr, { str, bal: bal == null ? 70 : bal, agi: agi == null ? 70 : agi }), def: { look: { h } }, state: 'free', shield: false, ...extra });
  ok(PH.mass(mk(90, 1)) > PH.mass(mk(50, 1)), 'mass rises with strength');
  ok(PH.mass(mk(70, 1.1)) > PH.mass(mk(70, 0.9)), 'mass rises with height');
  ok(PH.mass(mk(70, 1, 70, 70, { state: 'slide' })) > PH.mass(mk(70, 1)), 'a slide is heavier');
  ok(PH.height(mk(70, 5)) === BD.htMax && PH.height(mk(70, 0.1)) === BD.htMin && PH.height({ a: {}, def: {} }) === 1, 'height clamps and defaults');
  const mid = (40 + 99) / 2;
  for (const base of [0.1, 0.16, 0.18]) ok(Math.abs(PH.stumbleDur(mk(70, 1, mid, mid), base, 0.5) - base) < 1e-9, 'neutral stumble equals base ' + base);
  ok(PH.stumbleDur(mk(70, 1, 95, 70), 0.18, 0.5) < PH.stumbleDur(mk(70, 1, 45, 70), 0.18, 0.5), 'stumble shortens with balance');
  ok(PH.stumbleDur(mk(70, 1, 70, 95), 0.18, 0.5) < PH.stumbleDur(mk(70, 1, 70, 45), 0.18, 0.5), 'stumble shortens with agility');
  ok(PH.stumbleDur(mk(70, 1, 70, 70), 0.18, 1) > PH.stumbleDur(mk(70, 1, 70, 70), 0.18, 0), 'stumble lengthens with impact');
  for (let bal = 40; bal <= 99; bal += 9) for (let I = 0; I <= 1; I += 0.25) { const d = PH.stumbleDur(mk(70, 1, bal, 70), 0.4, I); ok(d >= ST.lo && d <= ST.hi, 'stumble within [lo, hi]'); }
  ok(PH.stumbleDur(mk(70, 1, 40, 40), 0.4, 1, 0.5) <= 0.5, 'hi override');

  const setup = (seed) => {
    const G = ISO.Game.create({ roster: [P[0], P[1]], seed, kickoff: 0 });
    G.phase = 'play'; G.phaseT = 0; G.msg = null; G.attacker = 0; G.mustClear = -1;
    const A = G.players[0], D = G.players[1], b = G.ball;
    A.x = 150; A.y = 360; A.face = 0; A.vx = A.vy = 0; D.x = 200; D.y = 360; D.face = Math.PI; D.vx = D.vy = 0; D.state = 'free'; D.noCtrl = 0; D.shCd = 0; A.noCtrl = 0;
    A.a = Object.assign({}, A.a, { str: 70, bal: 70, bct: 70, dri: 70 }); A.def = Object.assign({}, A.def, { look: { h: 1 } });
    b.owner = A; b.x = A.x + 11; b.y = A.y; b.vx = b.vy = 0; b.z = 0; b.lastTouch = 0; b.holder = null;
    return G;
  };
  const barge = (str, h, vx) => {
    let won = 0, maxSt = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const G = setup(seed), A = G.players[0], D = G.players[1];
      D.a = Object.assign({}, D.a, { str }); D.def = Object.assign({}, D.def, { look: { h } }); D.vx = vx;
      let hit = false;
      for (let s = 0; s < 70; s++) {
        ISO.Game.step(G, [Z, { ...Z, shoulder: s < 2 }]); G.events.length = 0;
        if (A.state === 'stumble') maxSt = Math.max(maxSt, A.stDur);
        if (G.ball.owner !== A) hit = true;
      }
      if (hit) won++;
    }
    return { won, maxSt };
  };
  const strong = barge(99, 1.14, 0), weak = barge(40, 0.88, 0), fast = barge(70, 1, -250), still = barge(70, 1, 0);      // D starts 50 px away: the run-up is the closing speed
  ok(strong.won > weak.won, 'strong tall barger beats weak short: ' + strong.won + ' vs ' + weak.won);
  ok(fast.won > still.won, 'faster closing barge beats standing: ' + fast.won + ' vs ' + still.won);
  ok(Math.max(strong.maxSt, weak.maxSt, fast.maxSt, still.maxSt) <= ST.hi + 1e-9, 'shoulder stumble within cap');
  console.log('shoulder wins (of 400): strong/tall', strong.won, 'weak/short', weak.won, 'closing', fast.won, 'standing', still.won);
  const clean = (ax) => {
    let w = 0, c = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const G = setup(seed), A = G.players[0], D = G.players[1];
      A.vx = ax; G.ball.vx = ax; D.x = 200;
      for (let s = 0; s < 40; s++) {
        ISO.Game.step(G, [{ ...Z }, { ...Z, tackle: s < 2 }]);
        for (const e of G.events) if (e.type === 'tackle' && e.on && !e.slide) { w++; if (D.clean) c++; }
        G.events.length = 0;
        if (G.ball.owner !== A) break;
      }
    }
    return { w, share: w ? c / w : 0 };
  };
  const slowC = clean(0), fastC = clean(250);
  ok(slowC.w > 20 && fastC.w > 20, 'tackle samples exist: ' + slowC.w + ', ' + fastC.w);
  ok(fastC.share < slowC.share, 'clean-win share falls with closing speed: ' + slowC.share.toFixed(2) + ' -> ' + fastC.share.toFixed(2));
  for (const d of [0, 10]) {
    const G = setup(5), A = G.players[0], D = G.players[1];
    G.ball.owner = null; A.a = Object.assign({}, A.a, { str: 40 }); D.a = Object.assign({}, D.a, { str: 99 }); A.x = 200; A.y = 300; D.x = 200 + d; D.y = 300;
    ISO.Game.step(G, [Z, Z]);
    const da = Math.hypot(A.x - 200, A.y - 300), dd = Math.hypot(D.x - (200 + d), D.y - 300), sep = Math.hypot(D.x - A.x, D.y - A.y);
    ok(Number.isFinite(sep) && sep >= 2 * C.PR - 4, 'bodies separate at d=' + d + ' (' + sep.toFixed(1) + ')');
    ok(da > dd, 'lighter body displaced more at d=' + d);
  }
}

console.log('physics checks:', checks, 'failures:', fails);
if (fails) process.exit(1);
console.log('OK');
