#!/usr/bin/env node
/* Headless tests for the 3D camera rig (roadmap 6.1). node tools/cam-test.js [--update]
   Loads three.min.js, data.js, game.js, coords.js, camrig.js (when present), ball3d.js and camera3d.js (vm, document stub as in
   tools/anim-check.js) and drives R3D.Camera with synthetic ViewFrames at fixed time steps. No sim, no renderer.
   T1 golden chase   scripted sequence, camera position / fov / state fields against tools/cam-baseline.json (1e-6)
   T2 visibility     every preset x 300 seeded situations settled for 3 s: no NaN, inside limits, subject and ball in frame
   T3 continuity     random preset switches, goal and final entries: per-frame position step and view-direction change
   T4 input          every preset x 8 key directions: exact mapInput
   T5 time step      30 / 144 Hz settle like 60 Hz; dt = 0 changes nothing
   T6 shake          offset within 0.14 x camShake, exactly 0 at camShake 0
   --update writes the baseline (T1 trace and the chase-family T2 pass rate) from the code as it is now. Exit 1 on a failure. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), BASE = path.join(__dirname, 'cam-baseline.json');
const UPDATE = process.argv.includes('--update');
const noop = () => {};
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => new Proxy({}, { get: () => noop }), addEventListener: noop });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(), getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
const warn = console.warn; console.warn = noop;
for (const f of ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/3d/coords.js', 'js/3d/camrig.js', 'js/3d/ball3d.js', 'js/3d/camera3d.js']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); } catch (e) { console.log('LOAD FAIL', f, String(e.stack).split('\n').slice(0, 3).join(' | ')); process.exit(2); }
}
console.warn = warn;
const THREE = globalThis.THREE, ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, CR = R3D.CamRig || null;
const PI = Math.PI, DT = 1 / 60;
const fails = []; const fail = (t, m) => { if (fails.length < 60) fails.push(t + ' ' + m); else if (fails.length === 60) fails.push('...'); };
const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- synthetic ViewFrame
const mkP = () => ({ idx: 0, team: 0, hidden: false, x: 0, z: 10, yaw: 0, vx: 0, vz: 0, speed: 0, sprint: false });
function mkVf() {
  return { t: 0, phase: 'play', me: 0, walls: false, pen: null, celebCam: null, goalBy: -1, winner: -1, drill: null, players: [mkP(), mkP()],
    ball: { x: 0, y: 0, z: 9, vx: 0, vy: 0, vz: 0, owner: 0, held: false, shot: null } };
}
const place = (vf, x, z, vx, vz, sprint) => { const p = vf.players[0]; p.x = x; p.z = z; p.vx = vx; p.vz = vz; p.speed = Math.hypot(vx, vz); p.sprint = !!sprint; };
function mk() { const c = R3D.Camera.create(THREE); return c; }
const opt = (c, o) => { if (c.setOptions) c.setOptions(o); };
const stOf = (st) => [st.ax, st.az, st.yaw, st.D, st.H, st.fov, st.tilt, st.pull, st.squeeze, st.lookBlend];
const r9 = (v) => +v.toFixed(9);

// ---------------------------------------------------------------- T1 golden chase
function golden() {
  const c = mk(), vf = mkVf(), tr = [], b = vf.ball; let time = 0, frame = 0;
  opt(c, { goalMode: 'celeb' });
  const rec = () => { const p = c.cam.position; if (frame % 3 === 0) tr.push([p.x, p.y, p.z, c.cam.fov].concat(stOf(c.st)).map(r9)); frame++; };
  const step = (n, f) => { for (let i = 0; i < n; i++) { f(i); time += DT; c.update(vf, DT, time, null); rec(); const k = c.mapInput({ mx: 0, my: -1, a: 0 }); tr.push([k.mx, k.my]); } };
  const carry = () => { const p = vf.players[0]; b.owner = 0; b.x = p.x; b.z = p.z - 0.6; b.y = 0; b.vx = b.vz = b.vy = 0; };
  c.update(vf, DT, 0, null);
  step(120, (i) => { place(vf, 0, 12 - i * DT * 4, 0, -4, false); carry(); });                  // jog
  step(120, (i) => { place(vf, 0.5 * Math.sin(i / 30), 10 - i * DT * 6.5, 0, -6.5, true); carry(); }); // sprint
  step(120, (i) => { place(vf, 0, 6, 0, 0, false); b.owner = -1; b.x = 8; b.z = 12; b.y = 0; b.vx = b.vz = b.vy = 0; }); // loose ball 10 m away
  step(150, (i) => { place(vf, 0, 6, 0, 0, false); const t = i * DT; b.owner = -1; b.x = 2 + t * 2; b.z = 8 - t * 3; b.vx = 2; b.vz = -3; b.vy = 11.2 - 2 * 9.8 * 0.5 * 0 - 9.8 * t; b.y = Math.max(0, 11.2 * t - 4.9 * t * t); }); // 7 m chip (apex 6.4 m)
  step(150, (i) => { place(vf, 3 + i * 0.01, 15 + i * 0.02, 0.5, 1.2, false); carry(); });      // back edge
  vf.pen = 'shoot'; step(90, (i) => { place(vf, 0, 10, 0, 0, false); b.owner = -1; b.x = 0; b.z = 10.2; b.y = 0; }); vf.pen = null;
  place(vf, 2, 5, 0, -3, false); carry();
  c.onEvent({ type: 'kick', shot: 'normal', p: 0 }, vf); step(60, (i) => { place(vf, 2, 5 - i * 0.05, 0, -3, false); b.owner = -1; b.x = 2; b.z = 4 - i * 0.12; b.y = 0.5; });
  c.onEvent({ type: 'goal' }, vf); vf.phase = 'goal'; vf.celebCam = { D: 4.6, H: 2, yaw: 0.45 }; vf.goalBy = 0;
  step(150, (i) => { place(vf, 2, 4, 0, 0, false); b.owner = -1; b.x = 1; b.z = -0.5; b.y = 0; });
  vf.phase = 'ready'; vf.celebCam = null; step(90, (i) => { place(vf, 0, 10.25, 0, 0, false); carry(); });  // kick-off teleport
  vf.phase = 'play'; step(60, (i) => { place(vf, 0, 10.25 - i * 0.04, 0, -2.4, false); carry(); });
  return tr;
}

// ---------------------------------------------------------------- situations
const LIM = () => (CR ? CR.limits(null, 'crowd', K) : { sideX: K.half + 1.8, backZ: (K.depthAll || K.depth) + 2.4, topY: 30 });
function situations(n, seed) {
  const R = rng(seed), out = [], Z = K.depthAll || K.depth;
  for (let i = 0; i < n; i++) {
    const corner = R() < 0.2, sx = corner ? (R() < 0.5 ? -1 : 1) * (K.half - 0.5 * R()) : (R() * 2 - 1) * K.half, sz = corner ? (R() < 0.5 ? 0.5 + R() * 2 : Z - 0.5 - R() * 2) : 0.5 + R() * (Z - 1);
    const own = R() < 0.5, bh = R() < 0.3 ? R() * 8 : 0;
    const bx = own ? sx : Math.max(-K.half, Math.min(K.half, sx + (R() * 2 - 1) * 12)), bz = own ? sz : Math.max(0.3, Math.min(Z - 0.3, sz + (R() * 2 - 1) * 9));
    const sp = R() * 6.5, a = R() * 2 * PI;
    out.push({ sx, sz, own, bx, bz, bh, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, sprint: sp > 5 });
  }
  return out;
}
function settle(c, s, secs, dt, vf) {
  vf = vf || mkVf(); const p = vf.players[0], b = vf.ball;
  p.x = s.sx; p.z = s.sz; p.vx = 0; p.vz = 0; p.speed = 0; p.sprint = false;
  b.owner = s.own ? 0 : -1; b.x = s.bx; b.z = s.bz; b.y = s.bh; b.vx = b.vz = b.vy = 0;
  let time = 0;
  c.update(vf, dt, time, null); c.cam.updateMatrixWorld();
  for (let t = 0; t < secs; t += dt || 1) { time += dt; c.update(vf, dt, time, null); if (!dt) break; }
  return vf;
}
const _v = new THREE.Vector3();
function inNdc(c, x, y, z, lim) { c.cam.updateMatrixWorld(); _v.set(x, y, z).project(c.cam); return _v.z < 1 && Math.abs(_v.x) <= 0.86 && _v.y >= -0.9 && _v.y <= (lim || 0.82); }
function ndcOf(c, x, y, z) { c.cam.updateMatrixWorld(); _v.set(x, y, z).project(c.cam); return [+_v.x.toFixed(2), +_v.y.toFixed(2)]; }
function visibility(preset) {
  const c = mk(); if (preset && c.setPreset) c.setPreset(preset);
  if (c.setLimits && CR) c.setLimits(LIM());
  let pass = 0, nan = 0, out = 0; const S = situations(300, 7), L = LIM();
  for (const s of S) {
    c.reset(); if (c.setPreset) c.setPreset(preset); const vf = settle(c, s, 3, DT);
    const p = c.cam.position;
    if (!(isFinite(p.x) && isFinite(p.y) && isFinite(p.z) && isFinite(c.cam.fov))) { nan++; continue; }
    if (Math.abs(p.x) > L.sideX + 1e-3 || p.z > L.backZ + 1e-3 || p.y > L.topY + 1e-3 || p.y < 1.2 - 1e-3) out++;
    const ok = inNdc(c, s.sx, 0.9, s.sz) && inNdc(c, vf.ball.x, vf.ball.y + 0.11, vf.ball.z);
    if (ok) pass++; else if (process.env.DBG && preset === process.env.DBG) console.log(preset, JSON.stringify(s), 'subj', ndcOf(c, s.sx, 0.9, s.sz), 'ball', ndcOf(c, vf.ball.x, vf.ball.y + 0.11, vf.ball.z), 'cam', c.cam.position.toArray().map((v) => +v.toFixed(1)), c.cam.fov);
  }
  return { pass: pass / S.length, nan, out };
}

// ---------------------------------------------------------------- run
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
const gold = golden();
const chaseVis = visibility('chase');
if (UPDATE) { fs.writeFileSync(BASE, JSON.stringify({ golden: gold, chasePass: chaseVis.pass }) + '\n'); console.log('baseline written: golden', gold.length, 'rows, chase pass rate', chaseVis.pass.toFixed(3)); process.exit(0); }
if (!base) { console.log('FAIL no tools/cam-baseline.json (run --update)'); process.exit(1); }
// T1
{
  let worst = 0, w = -1;
  if (gold.length !== base.golden.length) fail('T1', 'row count ' + gold.length + ' != ' + base.golden.length);
  else for (let i = 0; i < gold.length; i++) for (let j = 0; j < gold[i].length; j++) { const d = Math.abs(gold[i][j] - base.golden[i][j]); if (!(d <= worst)) { worst = d; w = i; } }
  if (process.env.DBG) { let n = 0; for (let i = 0; i < gold.length && n < 4; i++) { const d = gold[i].map((v, j) => Math.abs(v - base.golden[i][j])); if (Math.max(...d) > 1e-6) { console.log(i, JSON.stringify(gold[i]), JSON.stringify(base.golden[i])); n++; } } }
  if (!(worst <= 1e-6)) fail('T1', 'golden chase off by ' + worst + ' at row ' + w);
  console.log('T1 golden chase: max deviation', worst.toExponential(2));
}
const PRESETS = CR ? CR.ORDER : ['chase'];
// T2
{
  const line = [];
  for (const id of PRESETS) {
    const r = id === 'chase' ? chaseVis : visibility(id);
    line.push(id + ' ' + (r.pass * 100).toFixed(1) + '%');
    if (r.nan) fail('T2', id + ' NaN in ' + r.nan); if (r.out) fail('T2', id + ' outside limits in ' + r.out);
    if (id === 'broadcast' || id === 'low' || id === 'tactical') { if (r.pass < (id === 'low' ? 0.97 : 0.99)) fail('T2', id + ' pass ' + r.pass); }
    else if (r.pass < base.chasePass - 1e-9 && (id === 'chase')) fail('T2', 'chase pass ' + r.pass + ' < baseline ' + base.chasePass);
    else if (r.pass < (id === 'close' ? 0.6 : base.chasePass - 0.03)) fail('T2', id + ' pass ' + r.pass + ' below ' + (id === 'close' ? 0.6 : base.chasePass));
  }
  console.log('T2 visibility:', line.join(', '), '(chase baseline ' + (base.chasePass * 100).toFixed(1) + '%)');
}
if (CR) {
  // T3 continuity
  {
    const R = rng(11), c = mk(); c.setLimits(LIM()); const vf = mkVf(); let time = 0, worstP = 0, worstA = 0, cuts = 0, n = 0;
    const prevP = new THREE.Vector3(), prevD = new THREE.Vector3(), d = new THREE.Vector3(); let have = false, cutFlag = 0;
    const b = vf.ball, p = vf.players[0]; p.x = 0; p.z = 10; b.owner = 0; b.x = 0; b.z = 9.4;
    for (let f = 0; f < 60 * 120; f++) {
      const t = f / 60;
      if (f % 180 === 90) { c.setPreset(PRESETS[(R() * PRESETS.length) | 0]); }
      if (f % 900 === 400) { vf.phase = 'goal'; vf.goalBy = 0; vf.celebCam = { D: 4.6, H: 2, yaw: 0.45 }; c.onEvent({ type: 'goal' }, vf); }
      if (f % 900 === 700) { vf.phase = 'play'; vf.celebCam = null; }
      if (f % 3600 === 3000) { vf.phase = 'end'; vf.winner = 0; } if (f % 3600 === 3300) { vf.phase = 'play'; vf.winner = -1; }
      const tele = f % 1200 === 1100;      // a kick-off style teleport is a flagged cut
      if (tele) { p.x = (R() * 2 - 1) * 10; p.z = 5 + R() * 20; cutFlag = 3; }
      else { p.vx = Math.sin(t * 0.7) * 5; p.vz = Math.cos(t * 0.45) * 5; p.speed = Math.hypot(p.vx, p.vz); p.sprint = p.speed > 4.5; p.x = Math.max(-17, Math.min(17, p.x + p.vx * DT)); p.z = Math.max(1, Math.min(Math.min(K.depthAll || 20, 20) - 0.5, p.z + p.vz * DT)); }
      b.x = p.x + 0.3; b.z = p.z - 0.6; b.y = 0;
      time += DT; c.update(vf, DT, time, null);
      const q = c.cam.position; c.cam.getWorldDirection(d);
      if (have && cutFlag <= 0 && c.st.goalT !== -1) { const dp = q.distanceTo(prevP), da = Math.acos(Math.max(-1, Math.min(1, d.dot(prevD)))) * 180 / PI; worstP = Math.max(worstP, dp); worstA = Math.max(worstA, da); n++; if (dp > 1.2 || da > 6) fail('T3', 'frame ' + f + ' step ' + dp.toFixed(2) + ' m, turn ' + da.toFixed(1) + ' deg'); }
      if (cutFlag > 0) cutFlag--; prevP.copy(q); prevD.copy(d); have = true;
    }
    console.log('T3 continuity: worst step', worstP.toFixed(3), 'm, worst turn', worstA.toFixed(2), 'deg over', n, 'frames');
  }
  // T4 input
  {
    const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    for (const id of PRESETS) {
      const c = mk(); c.setLimits(LIM()); c.setPreset(id); const vf = mkVf(); settle(c, { sx: 0, sz: 8, own: true, bx: 0, bz: 7, bh: 0 }, 2, DT, vf);
      const side = id === 'broadcast' || id === 'low';
      for (const [mx, my] of dirs) {
        c.update(vf, DT, 9, null); c.mapInput({ mx: 5, my: 5 });
        const k = c.mapInput({ mx, my }), sc = 1 / Math.max(Math.abs(mx), Math.abs(my)), fw = -my, rg = mx; let ex;
        if (side) ex = [rg, -fw];          // exact quarter turn: right = (1,0) in sim axes (x = toward goal)
        else ex = null;
        if (ex) { const t = Math.max(Math.abs(ex[0]), Math.abs(ex[1])), want = [ex[0] / t, ex[1] / t].map((v) => +v.toFixed(2) || 0); if (Math.abs(k.mx - want[0]) > 1e-9 || Math.abs(k.my - want[1]) > 1e-9) fail('T4', id + ' key (' + mx + ',' + my + ') -> ' + k.mx + ',' + k.my + ' want ' + want); }
        else { const t = Math.max(Math.abs(fw), Math.abs(rg)); if (Math.abs(k.mx) > 1 || Math.abs(k.my) > 1 || (t > 0 && Math.hypot(k.mx, k.my) < 0.99)) fail('T4', id + ' key (' + mx + ',' + my + ') not unit ' + k.mx + ',' + k.my); if (mx === 0 && my === -1 && Math.abs(k.my) > 0.26) fail('T4', id + ' forward leaks sideways ' + k.my); }
      }
    }
    console.log('T4 input: ' + PRESETS.length + ' presets x 8 directions checked');
  }
  // T5 time step
  {
    for (const id of PRESETS) {
      const s = { sx: 4, sz: 9, own: false, bx: -3, bz: 5, bh: 1 }, res = [];
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) { const c = mk(); c.setLimits(LIM()); c.setPreset(id); settle(c, s, 4, dt); res.push(c.cam.position.clone()); }
      const d = Math.max(res[0].distanceTo(res[1]), res[2].distanceTo(res[1]));
      if (d > 0.02) fail('T5', id + ' settles ' + d.toFixed(3) + ' m apart across rates');
      const c = mk(); c.setLimits(LIM()); c.setPreset(id); const vf = settle(c, s, 2, DT), before = [c.cam.position.x, c.cam.position.y, c.cam.position.z, c.cam.fov, ...stOf(c.st)];
      c.update(vf, 0, 99, null); const after = [c.cam.position.x, c.cam.position.y, c.cam.position.z, c.cam.fov, ...stOf(c.st)];
      if (before.some((v, i) => Math.abs(v - after[i]) > 1e-9)) fail('T5', id + ' dt=0 changed the camera');
    }
    console.log('T5 time step: 30/60/144 Hz and dt = 0 checked');
  }
  // T6 shake
  {
    for (const k of [0, 0.5, 1]) {
      const c = mk(); c.setLimits(LIM()); c.setOptions({ shakeK: k, goalMode: 'off' }); const vf = mkVf(), ref = mk(); ref.setLimits(LIM()); ref.setOptions({ shakeK: 0, goalMode: 'off' }); const vr = mkVf();
      let worst = 0, time = 0; c.update(vf, DT, 0, null); ref.update(vr, DT, 0, null);
      c.onEvent({ type: 'post', power: 1 }, vf); c.onEvent({ type: 'goal' }, vf); vf.phase = 'play';
      for (let i = 0; i < 90; i++) { time += DT; c.update(vf, DT, time, null); ref.update(vr, DT, time, null); worst = Math.max(worst, c.cam.position.distanceTo(ref.cam.position)); }
      if (k === 0 && worst > 1e-9) fail('T6', 'camShake 0 moved the camera ' + worst);
      if (worst > 0.14 * k + 0.3 * 0 + 1e-6 + (k ? 0.0 : 0)) fail('T6', 'camShake ' + k + ' offset ' + worst.toFixed(3));
    }
    console.log('T6 shake: bounded and zero at 0');
  }
} else console.log('(camrig.js absent: T3-T6 skipped)');
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('cam-test OK');
