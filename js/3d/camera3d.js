/* ISO FOOTBALL 3D — chase camera: behind and above the controlled player, goal-anchored yaw (capped at 19 deg), no roll,
   no head-bob, frame-rate independent smoothing, shot/pass tracking. Also the two things a 3D player's inputs come from:
   mapInput (keys -> sim movement, in the camera's frame) and unproject (cursor -> sim aim point). Both only ever produce
   input values; nothing here reads or writes the sim. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  const MAXYAW = 0.33;
  // The frame the keys are read in turns less far than the picture. The sim tests a held direction against fixed axes when
  // you shoot: across the pitch only (|mx| < 0.3) is still "at goal", and straight up the pitch (|my| < 0.35) picks no
  // corner. sin(0.26) = 0.257 keeps a single key on the same side of both tests as the 2D view's exact 0 / +-1.
  const INYAW = 0.26;
  const G_ACC = ISO.C && ISO.C.GRAV ? ISO.C.GRAV * K.S : 0;     // m/s^2 in the sim's own time (0 when the sim has none: no apex estimate)
  // High balls: the camera tilts up and pulls back / widens until the ball (where it will be in a moment) sits inside the frame
  // with a margin, while the player's feet stay near the bottom edge. PULLS are the candidate pull-back distances searched
  // each frame (smallest one that satisfies both), one metre of pull = PULL_UP metres of height and PULL_FOV degrees of fov.
  const PULLS = [0, 1.2, 2.4, 3.6, 5, 6.5, 8], PULL_UP = 0.35, PULL_FOV = 1.4, MAXFOV = 66;
  const BACK_OUT = 2.4, BACK_DOWN = 0.85, BACK_FOV = 11;      // back edge: how far behind the board the camera may stand (the stadium fades the back end out there), the steepest look-down to the player's feet (height per metre of distance), fov added at full squeeze
  const LOOK_W = 12;      // rad/s of the look point's spring
  const BALL_W = 9;      // rad/s of the followed ball's spring (settles in about half a second)
  const PULL_ACC = 14, TILT_ACC = 7;      // m/s^2 and rad/s^2: the most the pull-back and tilt speeds may change by
  const FEET_M = 0.7;      // how far inside the bottom edge the feet are held (fraction of the half fov; the look moves just far enough to do it)
  const MARGIN_TOP = 0.74, MARGIN_BOT = 0.9, LOOK_AHEAD = 0.45;

  function create(THREE) {
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 400);
    const st = { ax: 0, az: 8, yaw: 0, D: 8, H: 3.4, fov: 50, tx: 0, ty: 0, tz: 0, lookBlend: 0, mode: 'follow', modeT: 0, shake: 0, inputYaw: 0,
      sx: 0, sz: 0, sbx: 0, sby: 0, sbz: 0, sbvx: 0, sbvy: 0, sbvz: 0, sbOk: false, kRate: 5.5, lkx: 0, lky: 0, lkz: 0, lkvx: 0, lkvy: 0, lkvz: 0, lkOk: false, pullV: 0, tiltV: 0, cutT: 0, goalT: 0, goalYaw: 0, kickoff: 1, trackT: 0, init: false, held: false, tilt: 0, pull: 0, squeeze: 0, pen: false };
    const v3 = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const lastKeys = { fwd: NaN, rgt: NaN, mx: 0, my: 0 };
    const cp = { x: 0, y: 0, z: 0 }, ev = { u: 0, allow: 0 };      // scratch: a clamped camera position, the result of a high-ball evaluation
    const bp = { x: 0, y: 0, z: 0 };                               // the ball as it will be in a moment (drawn height)
    // The camera may not sit inside the stand. At the back edge it may stand behind the low board / cage end (the stadium fades the
    // board, glass, rail, ball-stop net and posts out while the lens is behind them), up to BACK_OUT beyond it. What the position
    // loses in distance behind the player it loses in height too, so the view down at his feet stays about 40 degrees (the look-at
    // logic in update keeps the feet in frame) and the lens widens (update), smoothly.
    let psz = 0, psx = 0;      // the player the camera is for (set each frame)
    function place(x, y, z, walls) {
      const zEnd = K.depthAll || K.depth, xm = walls ? K.half - 0.5 : K.half + 1.8;
      cp.x = clamp(x, -xm, xm); cp.z = clamp(z, 2, zEnd + BACK_OUT);
      const dh = Math.hypot(cp.x - psx, cp.z - psz);
      const lim = BACK_DOWN * dh, hh = Math.max(0, 0.3 - Math.abs(y - lim)) / 0.3;      // a smooth minimum (blended over 0.3 m): a hard min() is a kink in the camera's height, a jolt in its speed
      cp.y = Math.max(1.2, Math.min(y, lim) - hh * hh * 0.075);
      return cp;
    }
    // vertical angles (radians) for a camera pulled back by s: how far up the view must tilt to hold the ball under the top
    // margin (ev.u) and how far up it may tilt before the player's feet leave the bottom margin (ev.allow)
    function evalHigh(s, cx0, cy0, cz0, fx, fz, lx, ly, lz, fov, px, pz, walls) {
      place(cx0 - fx * s, cy0 + PULL_UP * s, cz0 - fz * s, walls);
      const hf = Math.min(MAXFOV, fov + PULL_FOV * s) * Math.PI / 360;
      const p0 = Math.atan2(ly - cp.y, Math.hypot(lx - cp.x, lz - cp.z));
      const eb = Math.atan2(bp.y - cp.y, Math.max(0.5, Math.hypot(bp.x - cp.x, bp.z - cp.z)));
      const ef = Math.atan2(0.05 - cp.y, Math.max(0.5, Math.hypot(px - cp.x, pz - cp.z)));
      ev.u = eb - (p0 + MARGIN_TOP * hf); ev.allow = ef + MARGIN_BOT * hf - p0;
    }


    // The ball the camera follows is a critically damped copy of the real one (a spring with no overshoot, frame-rate independent), not the ball
    // itself: a struck ball moves 20+ m/s the instant it leaves the foot, and a camera that aimed at it (the look-at, the anchor pulled toward it)
    // turned several degrees in a single frame. The copy starts at the ball on a cut and follows slow balls to within a few centimetres.
    const sdamp = (x, v, target, w, dt) => { const o = w * dt, e = 1 / (1 + o + 0.48 * o * o + 0.235 * o * o * o), ch = x - target, tmp = (v + w * ch) * dt; return [(v - w * tmp) * e, target + (ch + tmp) * e]; };
    function followBall(b, snap, dt) {
      if (snap || !st.sbOk) { st.sbx = b.x; st.sby = b.y; st.sbz = b.z; st.sbvx = st.sbvy = st.sbvz = 0; st.sbOk = true; return; }
      let r = sdamp(st.sbx, st.sbvx, b.x, BALL_W, dt); st.sbvx = r[0]; st.sbx = r[1];
      r = sdamp(st.sby, st.sbvy, b.y, BALL_W, dt); st.sbvy = r[0]; st.sby = r[1];
      r = sdamp(st.sbz, st.sbvz, b.z, BALL_W, dt); st.sbvz = r[0]; st.sbz = r[1];
    }
    const GOAL_CAM = { D: 6.5, H: 2.6, yaw: 0.35 };
    const CR = R3D.CamRig, SIT = CR.SIT;
    let P = CR.PRESETS.chase;                   // the preset in force (CamRig.PRESETS)
    const mkPose = () => ({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 50 });
    const from = mkPose(), fin = mkPose(), cur = mkPose(), fr = mkPose(), gr = mkPose(), ctx = { ax: 0, az: 0, lim: null, walls: false, zoom: 1, half: K.half, depthAll: K.depthAll || K.depth };
    const gpts = [{ x: 0, y: 0.9, z: 0 }, { x: 0, y: 0, z: 0 }];
    st.preset = 'chase'; st.zoom = 1; st.sens = 1; st.shakeK = 1; st.goalMode = 'celeb'; st.blendT = 1; st.blendDur = 0.6; st.punch = 0; st.guardK = 0; st.fam = ''; st.hasFin = false;
    st.finalT = 0; st.fy0 = 0; st.dyn = 1; st.boxF = 0; st.subjIdx = -2; st.lim = CR.limits(null, 'crowd', K); st.PE = P;
    function reset() { st.init = false; st.sbOk = false; st.lkOk = false; st.mode = 'follow'; st.kickoff = 1; st.lookBlend = 0; st.shake = 0; st.goalT = 0; st.cutT = 0; st.tilt = 0; st.pull = 0; st.squeeze = 0; st.fam = ''; st.blendT = 1; st.punch = 0; st.guardK = 0; st.hasFin = false; st.finalT = 0; st.dyn = 1; st.boxF = 0; st.subjIdx = -2; st.pullV = st.tiltV = 0; }
    const copyPose = (a, b) => { a.px = b.px; a.py = b.py; a.pz = b.pz; a.lx = b.lx; a.ly = b.ly; a.lz = b.lz; a.fov = b.fov; };
    function startBlend(dur) { if (!st.hasFin) return; copyPose(from, fin); st.blendT = 0; st.blendDur = dur; st.blendFresh = true; }
    // switch preset: the pose in force blends into the new one, the keys are read again in the new frame
    function setPreset(id) {
      const np = CR.PRESETS[id]; if (!np || np === P) return;
      startBlend(0.6); P = np; st.preset = id; st.PE = P; lastKeys.fwd = NaN;
    }
    function setOptions(o) {
      if (!o) return;
      if (o.zoom != null && o.zoom === o.zoom) st.zoom = clamp(+o.zoom, 0.7, 1.4);
      if (o.sens != null && o.sens === o.sens) st.sens = clamp(+o.sens, 0.4, 1.6);
      if (o.shakeK != null && o.shakeK === o.shakeK) st.shakeK = clamp(+o.shakeK, 0, 1);
      if (o.goalMode === 'celeb' || o.goalMode === 'wide' || o.goalMode === 'off') st.goalMode = o.goalMode;
    }
    function setLimits(l) { if (l) st.lim = l; }

    function onEvent(e, vf) {
      const sk = CR.shakeOf(e);
      if (e.type === 'kick' && e.shot) { st.mode = 'shot'; st.modeT = 0; st.trackT = 0; }
      else if (e.type === 'kick' && e.p) { if (st.mode === 'follow') { st.mode = 'pass'; st.modeT = 0; } }
      else if (e.type === 'goal') { st.shake = sk; if (st.goalMode === 'celeb') { st.mode = 'goal'; st.modeT = 0; } }
      else if ((e.type === 'out' || e.type === 'clear') && st.mode !== 'goal') st.modeT = Math.max(st.modeT, 99);
      if (e.type === 'post') st.shake = Math.max(st.shake, 0.06 * (e.power || 0.5) * 2);
      else if (sk > 0 && e.type !== 'goal') st.shake = Math.max(st.shake, sk);
      if (P.dyn && (e.type === 'goal' || (e.type === 'kick' && e.power > 0.85))) st.punch = 2.5;
    }

    function update(vf, dt, time, bv) {
      dt = Math.min(dt, 0.05);
      const me = vf.players[vf.me] || vf.players[0];
      const b = vf.ball;
      const pen = vf.pen || null; st.pen = !!pen;
      const sens = pen ? 1 : st.sens;
      // who the picture is about: you; the scorer during a goal celebration; the winner at the end of a match
      let who = me;
      const finalNow = !pen && vf.phase === 'end' && vf.winner >= 0;
      if (finalNow) { who = null; if (me && me.team === vf.winner && !me.hidden) who = me; else for (let i = 0; i < vf.players.length; i++) { const q = vf.players[i]; if (q.team === vf.winner && !q.hidden) { who = q; break; } } if (!who) who = me; }
      else if (st.mode === 'goal' && !pen && vf.goalBy >= 0 && vf.players[vf.goalBy] && !vf.players[vf.goalBy].hidden) who = vf.players[vf.goalBy];
      const own = vf.players[b.owner];
      const subj = who && !who.hidden ? who : own || { x: b.x, z: b.z, vx: 0, vz: 0, speed: 0, sprint: false };
      const subjIdx = who ? who.idx : -1, subjChanged = subjIdx !== st.subjIdx; st.subjIdx = subjIdx;
      if (finalNow) st.finalT += dt; else st.finalT = 0;
      // the family of the picture: chase body (also the penalty, goal celebration and final), side rig, or fixed end-on
      const chaseFam = P.fam === 'chase' || pen || st.mode === 'goal' || finalNow;
      const famId = chaseFam ? 'c' : P.fam;
      const PC = P.fam === 'chase' ? P : CR.PRESETS.chase;       // the chase body's numbers
      st.PE = chaseFam ? PC : P;
      // cut: a teleport (kick-off, new rep) snaps everything instead of sweeping across the pitch (not while the subject changes: goal / final)
      let teleported = false;
      if (!pen && !(st.mode === 'goal' && who !== me) && !finalNow && !subjChanged && st.init && Math.hypot(subj.x - st.sx, subj.z - st.sz) > 2.4) { st.init = false; teleported = true; st.blendT = 1; }
      st.sx = subj.x; st.sz = subj.z;
      if (st.fam !== famId) {
        if (st.fam !== '' && !teleported) startBlend(st.mode === 'goal' || finalNow ? 0.5 : 0.6);
        st.fam = famId; st.init = false; lastKeys.fwd = NaN;
        if (st.mode === 'goal' || finalNow) st.guardK = 0;
      }
      followBall(b, !st.init, dt);
      const bpx = bv ? bv.x : b.x, bpz = bv ? bv.z : b.z, bpy = bv ? bv.y : b.y;
      const aspect = cam.aspect;
      let cx, cy, cz, lx, ly, lz, fovT, lookSnap = true;
      st.modeT += dt;
      if (!chaseFam) {
        // ---- side rig / fixed end-on: a frame from CamRig around an anchor (ball-weighted), kept on screen by the guard
        const snapS = !st.init;
        const ab = P.anchorBall, tx = ab * st.sbx + (1 - ab) * subj.x, tz = ab * st.sbz + (1 - ab) * subj.z;
        if (snapS) { st.ax = tx; st.az = tz; st.init = true; st.cutT = 0.15; }
        const kA = damp(4.5 * sens, dt); st.ax += (tx - st.ax) * kA; st.az += (tz - st.az) * kA;
        ctx.ax = st.ax; ctx.az = st.az; ctx.lim = st.lim; ctx.walls = !!vf.walls; ctx.zoom = st.zoom * (st.goalMode === 'wide' && vf.phase === 'goal' ? 1 / 0.88 : 1);
        if (P.fam === 'side') CR.sideFrame(P, ctx, fr); else CR.fixedFrame(P, ctx, fr);
        if (vf.phase === 'countdown' || vf.phase === 'ready') st.kickoff = Math.min(1, st.kickoff + dt * 2); else st.kickoff = Math.max(0, st.kickoff - dt * 1.2);
        fr.fov = Math.min(P.fovMax, fr.fov + st.kickoff * SIT.kickoff.dFov);
        copyPose(gr, fr);
        gpts[0].x = subj.x; gpts[0].y = 0.9; gpts[0].z = subj.z; gpts[1].x = bpx; gpts[1].y = (bv ? bpy : bpy) + K.ballR; gpts[1].z = bpz;
        const needed = !CR.guard(gr, gpts, aspect, P.fovMax) || gr.fov !== fr.fov || gr.lx !== fr.lx || gr.lz !== fr.lz || gr.ly !== fr.ly;
        if (snapS) st.guardK = needed ? 1 : 0; else st.guardK += ((needed ? 1 : 0) - st.guardK) * damp(4, dt);
        CR.blend(fr, gr, st.guardK, cur);
        cx = cur.px; cy = cur.py; cz = cur.pz; lx = cur.lx; ly = cur.ly; lz = cur.lz; fovT = cur.fov;
        st.yaw = Math.atan2(lx - cx, -(lz - cz)); st.tilt = st.pull = st.squeeze = 0;
        st.cutT = Math.max(0, st.cutT - dt);
      } else {
      const fwdx = Math.sin(st.yaw), fwdz = -Math.cos(st.yaw);
      // anchor follow with a little velocity look-ahead
      const lax = clamp(subj.vx * 0.25, -1.5, 1.5), laz = clamp(subj.vz * 0.25, -1.5, 1.5);
      let tx = subj.x + lax, tz = subj.z + laz;
      let wide = 0;
      if (own !== who) {
        // without the ball (defending, a team-mate has it, or it is loose) you and the ball both stay in the picture, as they
        // always are on the 2D view: the anchor moves toward the ball, never lets it fall behind the bottom edge (the
        // camera sees the ground from about 3.7 m behind the anchor), and the camera pulls back as the gap grows
        const gx = st.sbx - subj.x, gz = st.sbz - subj.z;
        tx += clamp(gx * 0.5, -6, 6); tz += clamp(gz * 0.35, -3, 3);
        if (st.sbz - 2.5 > tz) tz = st.sbz - 2.5;
        wide = clamp((Math.hypot(gx, gz) - 6) * 0.3, 0, 4);
      }
      // goal-anchored yaw: half the bearing to the goal centre, hard-capped
      let ty = pen ? 0 : clamp(0.5 * Math.atan2(-subj.x, subj.z + 3), -PC.maxYaw, PC.maxYaw);
      const zoomE = st.zoom * (st.goalMode === 'wide' && vf.phase === 'goal' ? 1 / 0.88 : 1);
      const fk = vf.drill === 'freekick' && vf.phase !== 'play';
      let D = (fk ? SIT.freekick.D : PC.D) * zoomE + (subj.sprint ? PC.sprintD : 0) + wide, H = (fk ? SIT.freekick.H : PC.H) * zoomE + wide * 0.45 * PC.wideGain, fov = (fk ? SIT.freekick.fov : PC.fov) + (subj.sprint ? PC.sprintFov : 0);
      if (PC.wideGain !== 1) D += wide * (PC.wideGain - 1);
      if (PC.dyn) {
        // dynamic: farther back when the ball is away from you or you are fast, closer when it is at your feet; a touch tighter in the box with the ball
        const gap = Math.hypot(st.sbx - subj.x, st.sbz - subj.z), k = clamp(gap / 14, 0, 1) * 0.65 + clamp((subj.speed || 0) / 7, 0, 1) * 0.35;
        st.dyn += (0.85 + 0.4 * k - st.dyn) * damp(1.8, dt);
        D *= st.dyn; H *= 1 + (st.dyn - 1) * 0.5;
        const inBox = own === who && b.z < K.boxD && Math.abs(b.x) < K.boxHalf ? 1 : 0;
        st.boxF += (inBox - st.boxF) * damp(3, dt); fov -= 3 * st.boxF;
        if (!pen) { st.punch = Math.max(0, st.punch * Math.exp(-6 * dt)); fov -= st.punch; }
      }
      if (vf.phase === 'countdown' || vf.phase === 'ready') { st.kickoff = Math.min(1, st.kickoff + dt * 2); } else st.kickoff = Math.max(0, st.kickoff - dt * 1.2);
      D += st.kickoff * SIT.kickoff.dD; H += st.kickoff * SIT.kickoff.dH;
      let lookBlendT = 0, lookH = 0.9;
      if (pen) {
        // penalty shootout, both halves: one camera behind the spot looking at the goal (the taker in the bottom of the frame,
        // the keeper and both posts above him). It drifts only a little with the ball and pushes in after the countdown.
        tx = clamp(b.x * 0.15, -1.5, 1.5); tz = K.penD; D = 5.4 + st.kickoff * 3; H = 2.6 + st.kickoff * 1.4; fov = 50; ty = 0; wide = 0;
        if (st.mode !== 'follow') st.mode = 'follow';
      } else if (finalNow) {
        // the winners: close and low on the winner, drifting slowly round him
        if (st.finalT <= dt) st.fy0 = st.yaw;
        D = SIT.final.D; H = SIT.final.H; fov = 50; ty = clamp(st.fy0 + SIT.final.drift * st.finalT, -0.8, 0.8); lookBlendT = 0;
        if (st.mode !== 'follow') st.mode = 'follow';
      } else if (st.mode === 'shot') {
        ty = st.yaw; fov = 46; lookBlendT = 0.7;
        if (!b.shot && st.modeT > 0.4) st.mode = 'follow';
        if (st.modeT > 3) st.mode = 'follow';
      } else if (st.mode === 'pass') { lookBlendT = 0.45; if (st.modeT > 0.8) st.mode = 'follow'; }
      else if (st.mode === 'goal') {
        const cc = vf.celebCam || GOAL_CAM;      // per-celebration framing (ISO.CELEBS[].cam)
        D = cc.D; H = cc.H; ty = clamp(st.yaw + cc.yaw * Math.min(1, st.modeT / 1.2), -0.8, 0.8); lookBlendT = 0.5;
        if (vf.phase !== 'goal') st.mode = 'follow';
      } else if (st.mode === 'follow' && st.modeT > 99) st.modeT = 0;
      const snap = !st.init; lookSnap = snap;
      // (a cut also re-reads the key frame: the direction held through a kick-off belongs to the new picture)
      if (snap) { st.ax = tx; st.az = tz; st.yaw = ty; st.D = D; st.H = H; st.fov = fov; st.lookBlend = lookBlendT; st.init = true; st.cutT = 0.15; lastKeys.fwd = NaN; }
      if (pen) st.yaw = ty = 0;      // the keys are read in the picture's own frame: left / right is across the goal
      st.kRate += ((st.mode === 'shot' ? 3 : 5.5) - st.kRate) * damp(5, dt);      // the follow rate eases between its two values: a step in it kicked the anchor's speed when the shot ended
      const kA = damp(st.kRate * sens, dt);
      st.ax += (tx - st.ax) * kA; st.az += (tz - st.az) * kA;
      // yaw: smooth, speed-limited (40 deg/s) so it never whips
      const dy = clamp((ty - st.yaw) * damp(2.5 * sens, dt), -0.7 * dt, 0.7 * dt);
      st.yaw += dy;
      st.D += (D - st.D) * damp(3, dt); st.H += (H - st.H) * damp(3, dt); st.fov += (fov - st.fov) * damp(3, dt);
      st.lookBlend += (lookBlendT - st.lookBlend) * damp(3.5, dt);
      const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);
      // look target: ahead of the anchor, blended toward the ball while it matters
      lx = st.ax + fx * 2.5; lz = st.az + fz * 2.5; ly = 0.9;
      if (pen) { lx = st.ax * 0.5; lz = 2; }
      else if (st.lookBlend > 0.001) { lx += (st.sbx - lx) * st.lookBlend; lz += (st.sbz - lz) * st.lookBlend; ly += (Math.min(st.sby, 2.5) + 0.2 - ly) * st.lookBlend; }
      // camera position: behind the anchor along -forward, above
      psz = subj.z; psx = subj.x;
      const cx0 = st.ax - fx * st.D, cz0 = st.az - fz * st.D, cy0 = st.H, walls = !!vf.walls;
      // a high ball (or one about to be): tilt up, and pull back / widen if tilting alone would lose the player at the bottom
      let tiltT = 0, pullT = 0;
      if (pen || R3D.noHighTrack || !PC.high) st.pull = st.tilt = st.pullV = st.tiltV = 0;      // (R3D.noHighTrack: a switch for comparing against the plain chase camera)
      else {
        const bx = bv ? bv.x : b.x, bz = bv ? bv.z : b.z, hr = b.y, vy = b.vy || 0;
        let hf = hr;      // the raw height it reaches within the look-ahead (apex if it peaks sooner), drawn height of that
        if (vy > 0) hf = hr + Math.min(vy * LOOK_AHEAD - 0.5 * G_ACC * LOOK_AHEAD * LOOK_AHEAD, G_ACC > 0 ? vy * vy / (2 * G_ACC) : 1e9);
        hf = Math.max(hr, hf);
        const dh = R3D.Ball && R3D.Ball.drawHeight ? R3D.Ball.drawHeight(hf) : hf, dn = R3D.Ball && R3D.Ball.drawHeight ? R3D.Ball.drawHeight(hr) : hr;
        bp.x = bx + (b.vx || 0) * LOOK_AHEAD * 0.5; bp.z = bz + (b.vz || 0) * LOOK_AHEAD * 0.5; bp.y = Math.max(dh, dn) + K.ballR;
        if (bp.y > 2.2) {
          const px = subj.x, pz = subj.z;
          // an ordinary shot or lofted pass (raw peak up to ~4 m) is met by the tilt and a small pull at most; only a chip or a throw
          // (7 m and more) widens the picture far, so the picture does not breathe on every lofted ball
          const cap = hf <= 4.2 ? 2.4 : 8;
          for (let i = 0; i < PULLS.length && (i === 0 || PULLS[i] <= cap); i++) {
            evalHigh(PULLS[i], cx0, cy0, cz0, fx, fz, lx, ly, lz, st.fov, px, pz, walls);
            pullT = PULLS[i];
            if (ev.u <= ev.allow + 1e-3) break;
          }
        }
        // the speed of the pull-back and of the tilt is itself limited in how fast it can change (an acceleration limit), so a high ball starts the
        // move gently instead of with a full-speed first frame
        { const want = clamp((pullT - st.pull) * damp(2.4, dt) / (dt || 1), -2.2, 4); st.pullV += clamp(want - st.pullV, -PULL_ACC * dt, PULL_ACC * dt); st.pull += st.pullV * dt; }
        if (bp.y > 2.2 || st.tilt > 0.001) {
          // the tilt the ball needs from where the camera actually is now (the pull is still on its way)
          evalHigh(st.pull, cx0, cy0, cz0, fx, fz, lx, ly, lz, st.fov, subj.x, subj.z, walls);
          tiltT = bp.y > 2.2 ? Math.max(0, ev.u) : 0;
        }
        const up = tiltT - st.tilt;
        { const want = clamp(up * damp(up > 0 ? 7 : 2.5, dt) / (dt || 1), -0.45, 1.3); st.tiltV += clamp(want - st.tiltV, -TILT_ACC * dt, TILT_ACC * dt); st.tilt += st.tiltV * dt; }      // fast up (the ball is leaving), slow back down; never a snap
        if (snap) { st.pull = pullT; st.tilt = tiltT; st.pullV = st.tiltV = 0; }
      }
      const zEndAll = K.depthAll || K.depth, squeeze = clamp((cz0 - fz * st.pull - (zEndAll + BACK_OUT * 0.5)) / 4, 0, 1);
      st.squeeze += (squeeze - st.squeeze) * damp(3, dt); if (snap) st.squeeze = squeeze;
      const fovAdd = pen ? 0 : PULL_FOV * st.pull + BACK_FOV * st.squeeze;
      place(cx0 - fx * st.pull, cy0 + PULL_UP * st.pull, cz0 - fz * st.pull, walls);
      cx = cp.x; cy = cp.y; cz = cp.z;
      fovT = Math.min(MAXFOV, st.fov + fovAdd);
      if (!pen) {      // the player's feet stay inside the bottom of the frame: when the position was pushed in (back edge) the view moves in on him
        const hfv = fovT * Math.PI / 360, ep = Math.atan2(0.05 - cy, Math.max(0.5, Math.hypot(subj.x - cx, subj.z - cz)));
        // (the least move toward him that does it, found by bisection: a continuous function of the pose. The old loop of up to four halvings
        // turned the view by a few degrees in one frame each time the ball's height or the player's distance crossed a threshold.)
        const pitchAt = (t) => Math.atan2(ly + (0.9 - ly) * t - cy, Math.max(0.5, Math.hypot(lx + (subj.x - lx) * t - cx, lz + (subj.z - lz) * t - cz)));
        if (ep < pitchAt(0) - FEET_M * hfv) {
          let t0 = 0, t1 = 0.9375;
          if (ep < pitchAt(t1) - FEET_M * hfv) t0 = t1;
          else for (let i = 0; i < 10; i++) { const m = (t0 + t1) * 0.5; if (ep < pitchAt(m) - FEET_M * hfv) t0 = m; else t1 = m; }
          const t = t1;
          lx += (subj.x - lx) * t; lz += (subj.z - lz) * t; ly += (0.9 - ly) * t;
        }
      }
      if (!pen) {      // and he stays inside the sides: where the camera could not stand far enough behind him (back edge) the view turns toward him, smoothly
        const fxl = lx - cx, fzl = lz - cz, sxl = subj.x - cx, szl = subj.z - cz, da = Math.abs(Math.atan2(fxl * szl - fzl * sxl, fxl * sxl + fzl * szl));
        const hh = Math.atan(Math.tan(fovT * Math.PI / 360) * cam.aspect), t = CR.smooth((da - 0.6 * hh) / (0.4 * hh));      // smoothstep: a linear ramp has a kink where it starts, a jolt in the turn rate
        lx += (subj.x - lx) * t * 0.85; lz += (subj.z - lz) * t * 0.85;
      }
      if (st.tilt > 0.0005) { const hd = Math.max(0.5, Math.hypot(lx - cx, lz - cz)); ly = cy + Math.tan(Math.min(1.2, Math.atan2(ly - cy, hd) + st.tilt)) * hd; }
      st.cutT = Math.max(0, st.cutT - dt);
      // the look point is the last thing to be smoothed: whatever moved it (the ball, a mode change, the feet / side rules above), the view
      // never turns faster than a critically damped follower of it allows. Cuts, penalties and the first frame take it as it is.
      if (lookSnap || pen || !st.lkOk) { st.lkx = lx; st.lky = ly; st.lkz = lz; st.lkvx = st.lkvy = st.lkvz = 0; st.lkOk = true; }
      else {
        let q = sdamp(st.lkx, st.lkvx, lx, LOOK_W, dt); st.lkvx = q[0]; st.lkx = q[1];
        q = sdamp(st.lky, st.lkvy, ly, LOOK_W, dt); st.lkvy = q[0]; st.lky = q[1];
        q = sdamp(st.lkz, st.lkvz, lz, LOOK_W, dt); st.lkvz = q[0]; st.lkz = q[1];
        lx = st.lkx; ly = st.lky; lz = st.lkz;
      }
      }
      // ---- shared tail: blend from the previous pose (preset switch, goal / final entry), shake, look
      if (teleported) st.blendT = 1;
      cur.px = cx; cur.py = cy; cur.pz = cz; cur.lx = lx; cur.ly = ly; cur.lz = lz; cur.fov = fovT;
      if (st.blendT < 1 && st.blendFresh) {
        // a long way (or a big turn) takes longer, so a blend never moves faster than about 1 m or 5 degrees a frame
        st.blendFresh = false;
        const dd = Math.hypot(from.px - cur.px, from.py - cur.py, from.pz - cur.pz);
        const ax0 = from.lx - from.px, ay0 = from.ly - from.py, az0 = from.lz - from.pz, ax1 = cur.lx - cur.px, ay1 = cur.ly - cur.py, az1 = cur.lz - cur.pz;
        const cs = (ax0 * ax1 + ay0 * ay1 + az0 * az1) / ((Math.hypot(ax0, ay0, az0) * Math.hypot(ax1, ay1, az1)) || 1), ang = Math.acos(clamp(cs, -1, 1)) * 57.2958;
        st.blendDur = Math.max(st.blendDur, 0.032 * dd, ang / 80);
      }
      if (st.blendT < 1) { st.blendT = Math.min(1, st.blendT + dt / st.blendDur); CR.blend(from, cur, st.blendT, cur); cx = cur.px; cy = cur.py; cz = cur.pz; lx = cur.lx; ly = cur.ly; lz = cur.lz; fovT = cur.fov; }
      copyPose(fin, cur); st.hasFin = true;
      // Phase 6.4 intro sweep (R3D.introP 0..1, set by js/pres-ui.js while the match intro holds the sim): the lens starts swung round the look point and higher, and eases onto the real pose. Never set in play, so the rig is unchanged.
      if (R3D.introP != null && R3D.introP < 1) { const k = 1 - CR.smooth(clamp(R3D.introP, 0, 1)), an = 1.05 * k, c = Math.cos(an), sn = Math.sin(an), dx = cx - lx, dz = cz - lz; cx = lx + dx * c - dz * sn; cz = lz + dx * sn + dz * c; cy += 3.2 * k; }
      st.shake *= Math.exp(-8 * dt);
      const sh = st.shake * st.shakeK, n1 = Math.sin(time * 71), n2 = Math.cos(time * 53);
      cam.position.set(cx + n1 * sh, cy + n2 * sh * 0.7, cz + n2 * sh);
      cam.up.set(0, 1, 0);
      cam.lookAt(lx, ly, lz);
      if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
      return st;
    }

    // Screen px (1280x720 canvas) -> the sim point the cursor aims at, with the same rules as the 2D cinematic view
    // (render.js unprojectLive): on the goal mouth, frame or net it is that spot on the goal line; anywhere else it is the
    // point on the turf under the cursor. Above the horizon there is no turf: the aim is where the ray crosses the goal
    // line's plane, so a cursor in the stands still aims that far to the side instead of silently dropping the aim.
    const GM = 30 * K.S, aimOut = { x: 0, y: 0 };
    function unproject(sx, sy) {
      if (!(sx === sx && sy === sy)) return null;
      ndc.set((sx / 1280) * 2 - 1, -(sy / 720) * 2 + 1);
      cam.updateMatrixWorld(); ray.setFromCamera(ndc, cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      let gx = 0, gy = 0, goal = false;
      if (d.z < -1e-4) { const t = -o.z / d.z; gx = o.x + d.x * t; gy = o.y + d.y * t; goal = t > 0; }       // the goal line's plane (z = 0)
      if (st.pen) { if (!goal) return null; aimOut.x = K.FW; aimOut.y = gx / K.S + K.GCY; }      // the shootout: the cursor always picks a spot on the goal line's plane, as on the 2D view
      else if (goal && Math.abs(gx) <= K.goalW / 2 + GM && gy >= 0 && gy <= K.goalH * 1.3) { aimOut.x = K.FW; aimOut.y = gx / K.S + K.GCY; }
      else if (d.y < -1e-4) { const t = -o.y / d.y; aimOut.x = K.FW - (o.z + d.z * t) / K.S; aimOut.y = (o.x + d.x * t) / K.S + K.GCY; }
      else if (goal) { aimOut.x = K.FW; aimOut.y = gx / K.S + K.GCY; }
      else return null;
      // far beyond the pitch only the direction matters: keep the numbers small enough to travel as plain integers
      aimOut.x = clamp(aimOut.x, -4000, 4000); aimOut.y = clamp(aimOut.y, -4000, 4000);
      return aimOut.x === aimOut.x && aimOut.y === aimOut.y ? aimOut : null;
    }
    function project(wx, wy, wz, out) {
      v3.set(wx, wy, wz).project(cam);
      out = out || {}; out.x = (v3.x * 0.5 + 0.5) * 1280; out.y = (-v3.y * 0.5 + 0.5) * 720; out.visible = v3.z < 1 && v3.z > -1; return out;
    }
    // Camera-relative input: pressing up moves toward where the camera looks. The frame is latched when the held keys
    // change (and on a cut), so a held key runs a straight line while the camera turns. What comes out is already in the
    // wire form (js/net.js packInput: 2 decimals), so offline, the online prediction and the server all step with the
    // same numbers. A full press is scaled until its larger part is +-1, exactly what the keys give on the 2D view: the
    // sim reduces it to a unit vector again, so no rounding can leave a 3D player a fraction short of full pace.
    const r2 = (v) => +v.toFixed(2) || 0;
    function mapInput(k) {
      const fwd = -k.my || 0, rgt = k.mx || 0;
      if (fwd !== lastKeys.fwd || rgt !== lastKeys.rgt) {
        lastKeys.fwd = fwd; lastKeys.rgt = rgt;
        const psi = (st.inputYaw = R3D.CamRig.inputPsi(st.yaw, st.PE)), c = Math.cos(psi), s = Math.sin(psi);
        // sim forward at yaw psi = (cos psi, sin psi) in (x = depth toward goal, y = across)
        let x = fwd * c - rgt * s, y = fwd * s + rgt * c;
        const top = Math.max(Math.abs(x), Math.abs(y));
        if (Math.hypot(x, y) >= 0.999) { x /= top; y /= top; }
        lastKeys.mx = r2(x); lastKeys.my = r2(y);
      }
      return { ...k, mx: lastKeys.mx, my: lastKeys.my };
    }
    // a pose from outside the rig (the goal replay's own camera): position, look point and fov, no blend, no shake
    function applyPose(p) {
      cam.position.set(p.px, p.py, p.pz); cam.up.set(0, 1, 0); cam.lookAt(p.lx, p.ly, p.lz);
      if (Math.abs(cam.fov - p.fov) > 0.01) { cam.fov = p.fov; cam.updateProjectionMatrix(); }
    }
    return { cam, st, reset, update, applyPose, onEvent, setPreset, setOptions, setLimits, project, unproject, mapInput, get mode() { return st.mode; } };
  }
  R3D.Camera = { create };
})();
