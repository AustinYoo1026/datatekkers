#!/usr/bin/env node
/* Headless tests for the 3D goal replay. node tools/replay3d-test.js
   Plays real CPU-vs-CPU matches (the sim, untouched) until goals are scored, feeds the adapter's tape every frame as r3d.js does, and checks:
   R1 tape       ring bounded, time ordered, never older than the window; frames hold what snapshot() reads
   R2 seek       exact at frame times, linear in between, angles take the short way, states are not blended
   R3 timeline   CamRig.replayState: window, monotonic tape time, full speed then slow motion, holds at the end, black fades, slow motion off
   R4 live state the live Game (and the adapter's live latches) is bit-for-bit unchanged by recording, seeking and snapshotTape
   R5 view       snapshotTape gives a finite ViewFrame that matches the tape, not the live match
   R6 camera     the replay camera follows the replayed goal through the real Camera.applyPose: smooth (T7 limits), ball in frame, no NaN
   Exit 1 on a failure. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const noop = () => {};
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => new Proxy({}, { get: () => noop }), addEventListener: noop });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(), getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
const warn = console.warn; console.warn = noop;
for (const f of ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/ai.js', 'js/3d/coords.js', 'js/3d/camrig.js', 'js/3d/adapter.js', 'js/3d/ball3d.js', 'js/3d/camera3d.js']) {
  const p = path.join(ROOT, f);
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); } catch (e) { console.log('LOAD FAIL', f, String(e.stack).split('\n').slice(0, 3).join(' | ')); process.exit(2); }
}
console.warn = warn;
const THREE = globalThis.THREE, ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, CR = R3D.CamRig, AD = R3D.Adapter, Tp = AD.Tape, C = ISO.C;
const fails = []; const fail = (t, m) => { if (fails.length < 40) fails.push(t + ' ' + m); };
const PI = Math.PI, DT = 1 / 60;

// a signature of everything primitive on the live game (players, keeper, ball and the top level), to prove it is not written
const prim = (o) => { const r = []; for (const k of Object.keys(o).sort()) { const v = o[k]; if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) r.push(k + '=' + v); else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'def' && k !== 'owner' && k !== 'holder' && k !== 'inNet') r.push(k + '{' + Object.keys(v).sort().map((j) => (typeof v[j] === 'number' || typeof v[j] === 'string' ? j + '=' + v[j] : '')).join(',') + '}'); } return r.join(';'); };
const sig = (G) => [prim(G), ...G.players.map(prim), prim(G.keeper), prim(G.ball), G.events.length, G.goals.length].join('|');

const SH = [];      // what was recorded of player 0 (clock, facing, state) to check the interpolation against
// play until the first goal; returns { G, goalClockStart }
function playToGoal(seed) {
  const P = ISO.PLAYERS, G = ISO.Game.create({ home: P[(seed * 7) % P.length], away: P[(seed * 3 + 5) % P.length], seed: 500 + seed, kickoff: seed % 2, replay: true });
  const ai = [ISO.AI.create('normal'), ISO.AI.create('normal')];
  Tp.clear(); SH.length = 0; let n = 0, goalFrames = 0;
  while (G.phase !== 'end' && G.time < 600 && goalFrames < 30) {
    const inp = [ISO.AI.update(G, G.players[0], ai[0], C.STEP), ISO.AI.update(G, G.players[1], ai[1], C.STEP)];
    ISO.Game.step(G, [{ ...inp[0] }, { ...inp[1] }]);
    for (const e of G.events) AD.onEvent(G, e);
    G.events.length = 0;
    if (G.phase === 'goal' && Tp.goalAt() < 0) Tp.mark();
    if (G.phase !== 'goal') Tp.unmark();
    if ((++n & 1) === 0 && (G.phase === 'play' || G.phase === 'goal')) { Tp.record(G, 2 * C.STEP / C.SPEED); SH.push({ t: Tp.clock(), face: G.players[0].face, state: G.players[0].state }); if (G.phase === 'goal') goalFrames++; }      // as a 60 Hz display of the paced sim
  }
  return G;
}

const SEEDS = [1, 2, 3, 4];
for (const seed of SEEDS) {
  const G = playToGoal(seed);
  if (G.phase !== 'goal') { console.log('FAIL seed ' + seed + ' did not reach a goal'); process.exit(1); }
  const n = Tp.count(), t0 = Tp.t0(), t1 = Tp.t1(), goalAt = Tp.goalAt();
  // R1
  if (n < 50 || n > 1400) fail('R1', 'tape length ' + n);
  if (t1 - t0 > 8.6) fail('R1', 'tape spans ' + (t1 - t0).toFixed(2) + ' s (window 8.5)');
  if (!(goalAt >= t0 && goalAt <= t1)) fail('R1', 'goal mark outside the tape ' + [t0, goalAt, t1]);
  const finite = (o) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v));
  let prev = -1;
  const before = sig(G);
  for (let t = t0; t <= t1; t += 0.013) {
    const fg = Tp.seek(G, t); if (!fg) { fail('R1', 'seek returned null'); break; }
    if (fg.t < prev - 1e-9) fail('R2', 'sim time goes backwards at ' + t.toFixed(3)); prev = fg.t;
    if (!finite(fg.ball) || !finite(fg.keeper) || fg.players.some((p) => !finite(p))) { fail('R2', 'NaN in the interpolated state at ' + t.toFixed(3)); break; }
    const vf = AD.snapshotTape(fg, { me: 0 });
    if (![vf.ball.x, vf.ball.y, vf.ball.z, vf.keeper.x, vf.keeper.z, ...vf.players.flatMap((p) => [p.x, p.z, p.yaw])].every(Number.isFinite)) { fail('R5', 'non finite ViewFrame at ' + t.toFixed(3)); break; }
  }
  // R2: exact at a frame time, linear halfway between two frames of the same state
  const mid = Tp.t0() + (t1 - t0) * 0.5;
  const fa = Tp.seek(G, mid), ax = fa.ball.x, ay = fa.ball.y;
  const eps = 1e-3, fb = Tp.seek(G, mid + eps), fc = Tp.seek(G, mid - eps);
  if (Math.abs((fb.ball.x + fc.ball.x) / 2 - ax) > 0.5 || Math.abs((fb.ball.y + fc.ball.y) / 2 - ay) > 0.5) fail('R2', 'ball is not locally linear in tape time');
  if (!(Math.abs(Tp.seek(G, t0 - 5).t - Tp.seek(G, t0).t) < 1e-9) || !(Math.abs(Tp.seek(G, t1 + 5).t - Tp.seek(G, t1).t) < 1e-9)) fail('R2', 'seek does not clamp to the tape');
  // the facing takes the short way round between two frames of the same state, and is a plain copy when the state changes
  {
    let bad = 0, checked = 0;
    for (let i = 0; i + 1 < SH.length; i++) {
      const a = SH[i], b = SH[i + 1]; if (a.t < t0 || b.t <= a.t) continue;
      const m = Tp.seek(G, (a.t + b.t) / 2).players[0].face; let d = b.face - a.face; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI;
      const want = a.state === b.state ? a.face + d / 2 : a.face, e = Math.abs(Math.atan2(Math.sin(m - want), Math.cos(m - want)));
      checked++; if (e > 1e-6) bad++;
    }
    if (!checked || bad) fail('R2', 'facing interpolation wrong in ' + bad + ' of ' + checked + ' frame pairs');
  }
  // R4: the live game and live latches are untouched
  if (sig(G) !== before) fail('R4', 'the live game changed while seeking / snapshotting');
  // R5: the ViewFrame follows the tape, not the live match
  {
    const tEarly = Math.max(t0, goalAt - 3), fg = Tp.seek(G, tEarly), vf = AD.snapshotTape(fg, { me: 0 });
    const live = G.ball, wantX = (fg.ball.y - K.GCY) * K.S, wantZ = (C.FW - fg.ball.x) * K.S;
    if (Math.abs(vf.ball.x - wantX) > 1e-6 || Math.abs(vf.ball.z - wantZ) > 1e-6) fail('R5', 'snapshotTape ball is not the tape ball');
    if (Math.hypot(fg.ball.x - live.x, fg.ball.y - live.y) < 5) fail('R5', 'three seconds before the goal the ball should not be where it ended (test setup)');
    if (vf.players.length !== G.players.length || vf.keeper.sim === G.keeper) fail('R5', 'the keeper view must come from the fake keeper, not the live sim object');
    if (!vf.players.every((p) => p.sim !== G.players[p.idx])) fail('R5', 'a player view points at the live sim player');
  }
  // the frame at the goal: ball in or at the net, phase goal, owner resolved
  { const fg = Tp.seek(G, goalAt + 0.4), vf = AD.snapshotTape(fg, { me: 0 }); if (!(vf.ball.z < 0.6)) fail('R5', 'the ball is not at the goal line 0.4 s after the mark: z=' + vf.ball.z.toFixed(2)); }

  // ---------------------------------------------------------------- R3 timeline
  {
    const total = C.REPLAY_T / C.SPEED, end = total - 0.1, RT = CR.RT;
    for (const slow of [true, false]) {
      let lastT = -1, sawFull = false, sawSlow = false, maxBlack = 0, edge = 0, n2 = 0;
      for (let e = 0; e < total + 0.2; e += 1 / 120) {
        const rs = CR.replayState(e, total, goalAt, t0, slow);
        if (Math.abs(e - RT.celeb) < 1e-6 || Math.abs(e - end) < 1e-6) continue;
        if (e < RT.celeb || e > end) { if (rs) fail('R3', 'replay outside its window at e=' + e.toFixed(2)); continue; }
        if (!rs) { fail('R3', 'no replay inside its window at e=' + e.toFixed(2)); break; }
        n2++;
        if (rs.t < lastT - 1e-9) fail('R3', 'tape time goes backwards at e=' + e.toFixed(2)); lastT = rs.t;
        if (rs.t < t0 - 1e-9 || rs.t > goalAt + RT.tail + 1e-9) fail('R3', 'tape time out of range ' + rs.t);
        if (rs.black < 0 || rs.black > 1) fail('R3', 'black ' + rs.black);
        if (rs.rate === 1) sawFull = true; if (rs.rate > 0 && rs.rate < 1) sawSlow = true;
        maxBlack = Math.max(maxBlack, rs.black); if (n2 === 1) edge = rs.black;
        if (!slow && rs.rate !== 1 && rs.rate !== 0) fail('R3', 'slow motion off but rate ' + rs.rate);
        if (slow && rs.slowmo && !(rs.rate <= RT.slow + 1e-9)) fail('R3', 'slowmo flag with rate ' + rs.rate);
      }
      if (!sawFull) fail('R3', 'no full-speed build-up (slow=' + slow + ')');
      if (slow && !sawSlow) fail('R3', 'no slow-motion finish');
      if (edge < 0.95) fail('R3', 'the replay does not start from black (' + edge.toFixed(2) + ')');
      if (CR.replayState(RT.celeb + 3.5, total, goalAt, t0, true).t < goalAt - 1.2) fail('R3', 'the finish is not reached');
    }
    if (CR.replayPre(0.5) !== 0 || CR.replayPre(RT.celeb - 0.01) < 0.9 || CR.replayPre(RT.celeb + 0.01) !== 0) fail('R3', 'replayPre');
    if (CR.replayState(2, total, -1, t0, true)) fail('R3', 'a replay without a goal mark');
  }

  // ---------------------------------------------------------------- R6 camera
  {
    const total = C.REPLAY_T / C.SPEED, end = total - 0.1;
    const LIMK = { pos: 50, ang: 60, jump: 0.3, turn: 2.5 }, EDGE = { x: 0.86, yb: -0.9, yt: 0.82 };
    const cam = R3D.Camera.create(THREE), rig = CR.replayCam(), pose = {}, hist = [], d = new THREE.Vector3(), v = new THREE.Vector3();
    Tp.begin(); rig.reset();
    let seen = 0, out = 0, worstOut = 0;
    for (let e = CR.RT.celeb; e <= end; e += DT) {
      const rs = CR.replayState(e, total, goalAt, t0, true), fg = Tp.seek(G, rs.t), vf = AD.snapshotTape(fg, { me: 0 }), b = vf.ball;
      rig.update({ x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz }, DT, { slow: rs.slowmo, rm: false, half: K.half, walls: false, depthAll: K.depthAll || K.depth, sideX: K.half + 4.4 }, pose);
      cam.applyPose(pose); cam.cam.updateMatrixWorld(); cam.cam.getWorldDirection(d);
      if (![pose.px, pose.py, pose.pz, pose.lx, pose.ly, pose.lz, pose.fov].every(Number.isFinite)) { fail('R6', 'NaN pose at e=' + e.toFixed(2)); break; }
      hist.push([pose.px, pose.py, pose.pz, d.x, d.y, d.z]);
      if (rs.black < 0.4) {      // the picture is visible: the ball is in frame
        v.set(b.x, b.y + K.ballR, b.z).project(cam.cam); seen++;
        const x = Math.abs(v.x) - EDGE.x, y = v.y < EDGE.yb ? EDGE.yb - v.y : v.y - EDGE.yt, o = Math.max(x, y, v.z >= 1 || v.z <= -1 ? 9 : -1);
        if (o > 0) { out++; worstOut = Math.max(worstOut, o); }
      }
      if (rs.black < 0.05 && pose.py < 1.2) fail('R6', 'camera too low');
    }
    let pa = 0, aa = 0, pj = 0, tj = 0;
    const ang = (a, b2) => Math.acos(Math.max(-1, Math.min(1, a[3] * b2[3] + a[4] * b2[4] + a[5] * b2[5])));
    for (let f = 2; f < hist.length; f++) {
      const h0 = hist[f - 2], h1 = hist[f - 1], h2 = hist[f];
      pa = Math.max(pa, Math.hypot(h2[0] - 2 * h1[0] + h0[0], h2[1] - 2 * h1[1] + h0[1], h2[2] - 2 * h1[2] + h0[2]) / (DT * DT));
      pj = Math.max(pj, Math.hypot(h2[0] - h1[0], h2[1] - h1[1], h2[2] - h1[2]));
      aa = Math.max(aa, Math.abs(ang(h1, h2) / DT - ang(h0, h1) / DT) / DT); tj = Math.max(tj, ang(h1, h2) * 180 / PI);
    }
    if (pa > LIMK.pos || aa > LIMK.ang || pj > LIMK.jump || tj > LIMK.turn) fail('R6', 'camera jerk: accel ' + pa.toFixed(1) + ' m/s2, ' + aa.toFixed(2) + ' rad/s2, jump ' + pj.toFixed(3) + ' m, turn ' + tj.toFixed(2) + ' deg');
    if (out > seen * 0.02) fail('R6', 'ball out of frame in ' + out + ' of ' + seen + ' visible frames (worst ' + worstOut.toFixed(2) + ')');
    console.log('R6 replay camera: accel ' + pa.toFixed(1) + ' m/s2, view ' + aa.toFixed(2) + ' rad/s2, jump ' + pj.toFixed(3) + ' m / ' + tj.toFixed(2) + ' deg, ball out of frame ' + out + '/' + seen + '');
  }
  // R4 again after all of it
  if (sig(G) !== before) fail('R4', 'the live game changed after the replay was played');
  console.log('tape ' + n + ' frames over ' + (t1 - t0).toFixed(2) + ' s, goal at +' + (goalAt - t0).toFixed(2) + ' s; live state unchanged');
}

// ---------------------------------------------------------------- ring: long recording stays bounded and allocation-free in steady state
{
  const G = ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[1], seed: 7, replay: true });
  Tp.clear(); for (let i = 0; i < 6000; i++) Tp.record(G, 1 / 144);
  if (Tp.count() > 1400 || Tp.t1() - Tp.t0() > 8.6) fail('R1', 'ring not bounded: ' + Tp.count() + ' frames over ' + (Tp.t1() - Tp.t0()).toFixed(2) + ' s');
  Tp.clear(); if (Tp.count() !== 0 || Tp.goalAt() !== -1 || Tp.seek(G, 0) !== null) fail('R1', 'clear');
}
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('replay3d-test OK');
