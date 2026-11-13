/* ISO FOOTBALL 3D — camera rig (roadmap 6.1): the presets and the pure maths behind them. No THREE, no sim, no allocation in the
   per-frame functions (results go into the out parameters). js/3d/camera3d.js owns the state and applies these.
   Presets: chase (PLAYER CHASE, the original numbers), close, dynamic, broadcast (side rig), low (low sideline), tactical (fixed end-on).
   World: goal line at z = 0, play at z > 0, x across; the camera's yaw is atan2(lx - px, -(lz - pz)) (0 = looking at the goal). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {}), R3D = (ISO.R3D = ISO.R3D || {});
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  const CHASE = { id: 'chase', name: 'PLAYER CHASE', fam: 'chase', D: 8, H: 3.4, fov: 50, sprintD: 0.8, sprintFov: 4, maxYaw: 0.33, high: true, base: 0, free: 0.26, wideGain: 1, dyn: false };
  const PRESETS = {
    chase: CHASE,
    close: Object.assign({}, CHASE, { id: 'close', name: 'CLOSE ACTION', D: 5.4, H: 2.3, fov: 47, wideGain: 1.3 }),
    dynamic: Object.assign({}, CHASE, { id: 'dynamic', name: 'DYNAMIC', dyn: true }),
    broadcast: { id: 'broadcast', name: 'BROADCAST', fam: 'side', H: 8, fov: 38, fovMax: 50, anchorBall: 0.7, base: -PI / 2, free: 0, low: false },
    low: { id: 'low', name: 'LOW SIDELINE', fam: 'side', H: 1.5, fov: 52, fovMax: 62, anchorBall: 0.7, base: -PI / 2, free: 0, low: true },
    tactical: { id: 'tactical', name: 'TACTICAL', fam: 'fixed', H: 11, fov: 44, fovMax: 56, anchorBall: 0.7, base: 0, free: 0 },
  };
  const ORDER = ['chase', 'close', 'dynamic', 'broadcast', 'low', 'tactical'];
  // situational framing
  const SIT = { kickoff: { dD: 3, dH: 1.6, dFov: 4 }, freekick: { D: 9.5, H: 2.9, fov: 48 }, goal: { D: 6.5, H: 2.6, yaw: 0.35 }, final: { D: 6, H: 2.2, drift: 0.25 } };

  // The yaw the keys are read in: the picture's yaw, kept within `free` of the preset's base (a chase camera turns less far than the
  // picture; a side rig turns exactly a quarter, so a single key still gives the exact 0 / +-1 the sim's aim tests expect).
  function inputPsi(yaw, preset) { const b = preset.base || 0; return b + clamp(wrap(yaw - b), -preset.free, preset.free); }

  // Side rig and fixed end-on rig: the pose for an anchor. ctx: { ax, az (anchor), lim:{sideX,backZ,topY}, walls, zoom }
  function sideFrame(P, ctx, out) {
    const lim = ctx.lim, z = ctx.zoom || 1;
    out.px = P.low ? (ctx.walls ? ctx.half - 0.5 : ctx.half + 1.6) : lim.sideX;
    out.py = Math.max(1.2, Math.min(P.H * z, lim.topY));
    out.pz = ctx.az;
    out.lx = ctx.ax; out.ly = 0.9; out.lz = ctx.az;
    out.fov = P.fov * z;
    return out;
  }
  function fixedFrame(P, ctx, out) {
    const lim = ctx.lim, z = ctx.zoom || 1;
    out.pz = Math.min(ctx.depthAll + 5, lim.backZ);
    out.py = Math.max(1.2, Math.min(P.H * z, lim.topY));
    out.px = clamp(0.3 * ctx.ax, -5, 5);
    out.lx = ctx.ax * 0.8; out.ly = 0; out.lz = ctx.az;
    out.fov = P.fov * z;
    return out;
  }

  // Normalised device coordinates of a world point for a camera (pos, look, vertical fov in degrees, aspect): out { x, y, z = depth }
  function ndc(pos, look, fovDeg, aspect, pt, out) {
    let fx = look.x - pos.x, fy = look.y - pos.y, fz = look.z - pos.z; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    // right = f x up(0,1,0) = (-fz, 0, fx)
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;      // up = right x f
    const dx = pt.x - pos.x, dy = pt.y - pos.y, dz = pt.z - pos.z, zc = dx * fx + dy * fy + dz * fz, t = Math.tan(fovDeg * PI / 360);
    out.z = zc; const zz = zc > 1e-6 ? zc : 1e-6;
    out.x = (dx * rx + dz * rz) / (zz * t * aspect); out.y = (dx * ux + dy * uy + dz * uz) / (zz * t);
    return out;
  }
  const _p = { x: 0, y: 0, z: 0 }, _l = { x: 0, y: 0, z: 0 }, _n = { x: 0, y: 0, z: 0, ok: true };
  const LIM_X = 0.8, LIM_YB = -0.84, LIM_YT = 0.76;      // a margin inside the (0.86, -0.9, 0.82) the tests and the screen edges use
  function excess(frame, pts, n, aspect) {
    _p.x = frame.px; _p.y = frame.py; _p.z = frame.pz; _l.x = frame.lx; _l.y = frame.ly; _l.z = frame.lz;
    let w = 0;
    for (let i = 0; i < n; i++) {
      ndc(_p, _l, frame.fov, aspect, pts[i], _n);
      if (_n.z <= 0.05) return 9;
      const e = Math.max(Math.abs(_n.x) / LIM_X, _n.y > 0 ? _n.y / LIM_YT : -_n.y / -LIM_YB);
      if (e > w) w = e;
    }
    return w;
  }
  const EMERG = 1.25;      // the guard may exceed a preset's fovMax by this factor when a point would otherwise leave the frame
  // Keep every point (subject, ball) inside the frame: at most 4 rounds of pulling the look-at toward the middle of the points and
  // widening the fov (never beyond fovMax). Returns true when all points end up inside.
  function guard(frame, pts, aspect, fovMax) {
    const n = pts.length;
    let mx = 0, my = 0, mz = 0; for (let i = 0; i < n; i++) { mx += pts[i].x; my += pts[i].y; mz += pts[i].z; } mx /= n; my /= n; mz /= n;
    for (let it = 0; it < 4; it++) {
      const w = excess(frame, pts, n, aspect);
      if (w <= 1) return true;
      frame.lx += (mx - frame.lx) * 0.5; frame.ly += (my - frame.ly) * 0.5; frame.lz += (mz - frame.lz) * 0.5;
      const w2 = excess(frame, pts, n, aspect);
      if (w2 > 1) { const t = Math.tan(frame.fov * PI / 360) * Math.min(w2, 1.35); frame.fov = Math.min(fovMax * EMERG, 2 * Math.atan(t) * 180 / PI); }
    }
    return excess(frame, pts, n, aspect) <= 1;
  }

  // Where a camera may stand: from the stadium's colliders (null = the defaults of a stand-side pitch)
  function limits(col, kind, K) {
    const hall = kind === 'hall';
    return { sideX: col && col.standX ? col.standX - 0.6 : K.half + 4.4, backZ: hall ? 38 : 34, topY: hall ? 11.3 : 30 };
  }
  // Camera shake amplitude (metres) of a sim event; capped at 0.14
  function shakeOf(e) {
    const p = e.power == null ? 0.5 : e.power; let s = 0;
    switch (e.type) {
      case 'post': s = 0.12 * p; break;
      case 'save': s = 0.04; break;
      case 'goal': s = 0.12; break;
      case 'tackle': case 'bump': s = 0.03; break;
      case 'ankles': s = 0.04; break;
      case 'board': s = 0.02 * p; break;
      case 'kick': s = e.power != null && e.power > 0.85 ? 0.02 * e.power : 0; break;      // (was 0.05: an 11 Hz buzz of 5 cm that read as a jolt on every hard strike)
    }
    return Math.min(0.14, s);
  }
  // smoothstep blend of two poses {px,py,pz,lx,ly,lz,fov}: out = a + (b - a) * smooth(t)
  function blend(a, b, t, out) {
    const k = smooth(t);
    out.px = a.px + (b.px - a.px) * k; out.py = a.py + (b.py - a.py) * k; out.pz = a.pz + (b.pz - a.pz) * k;
    out.lx = a.lx + (b.lx - a.lx) * k; out.ly = a.ly + (b.ly - a.ly) * k; out.lz = a.lz + (b.lz - a.lz) * k;
    out.fov = a.fov + (b.fov - a.fov) * k; return out;
  }

  // ------------------------------------------------------------------ goal replay (3D)
  // Timeline of the goal pause in real seconds since the ball went in (as the 2D view's): the live celebration -> a quick fade to black ->
  // the replay (build-up at full speed, then the finish in slow motion) -> fade to black -> the match. All pure.
  const RT = { celeb: 1.25, pre: 0.25, fadeIn: 0.3, fadeOut: 0.35, slowFrom: 0.9, tail: 0.85, slow: 0.52, endGap: 0.1 };
  // e: real seconds since the goal, total: the pause's length, goalAt / tMin: tape time of the goal and of the oldest frame,
  // slow: slow motion allowed. null outside the replay window; else { t (tape time), rate (tape seconds per real second), black (0..1), u, slowmo }
  function replayState(e, total, goalAt, tMin, slow) {
    const end = total - RT.endGap;
    if (!(goalAt >= 0) || e < RT.celeb || e > end) return null;
    const u = e - RT.celeb, r = slow ? RT.slow : 1, W = end - RT.celeb, S = RT.slowFrom + RT.tail;
    const tSlow = goalAt - RT.slowFrom, t0 = Math.max(tMin, tSlow - Math.max(0, W - S / r)), full = Math.max(0, tSlow - t0);
    const fin = goalAt + RT.tail;
    let t, rate;
    if (u < full) { t = t0 + u; rate = 1; } else { t = Math.min(tSlow + (u - full) * r, fin); rate = t < fin ? r : 0; }
    const black = Math.max(1 - smooth(u / RT.fadeIn), smooth((e - (end - RT.fadeOut)) / RT.fadeOut));
    return { t, rate, black, u, slowmo: slow && u >= full };
  }
  // black over the live celebration just before the cut (0 outside)
  const replayPre = (e) => (e > RT.celeb - RT.pre && e < RT.celeb ? smooth((e - (RT.celeb - RT.pre)) / RT.pre) : 0);

  // The replay camera: low, side-on, across the pitch from the ball, following it through critically damped springs (no overshoot, frame-rate
  // independent), so position and look point are continuous in velocity; a slow push-in (lower, tighter) as the finish goes into slow motion.
  // No THREE, no allocation. update(ball {x,y,z,vx,vz}, dt, o {slow, rm, half, walls, depthAll, sideX}, out pose) -> out
  function replayCam() {
    const st = { init: false, side: 1, fx: 0, fz: 0, fvx: 0, fvz: 0, cz: 0, cvz: 0, zoom: 0, zv: 0 };
    const W_LOOK = 6, W_POS = 1.2, W_ZOOM = 2.2;      // the look point chases the ball closely (a pan); the stand point drifts after it slowly (a tripod that is walked along), so a fast shot never needs a fast camera
    function sd(x, v, target, w, dt) {      // one critically damped step; returns the new position in st._x and the velocity in st._v
      const o = w * dt, e = 1 / (1 + o + 0.48 * o * o + 0.235 * o * o * o), ch = x - target, tmp = (v + w * ch) * dt;
      st._v = (v - w * tmp) * e; st._x = target + (ch + tmp) * e;
    }
    function reset() { st.init = false; st.zoom = 0; st.zv = 0; }
    function update(b, dt, o, out) {
      const lead = 0.12, tx = b.x + (b.vx || 0) * lead, tz = Math.max(0, Math.min(o.depthAll || 20, b.z + (b.vz || 0) * lead));
      if (!st.init) { st.init = true; st.side = b.x >= 0 ? -1 : 1; st.fx = tx; st.fz = tz; st.cz = tz; st.fvx = st.fvz = st.cvz = 0; st.zoom = 0; st.zv = 0; }
      else if (dt > 0) {
        sd(st.fx, st.fvx, tx, W_LOOK, dt); st.fx = st._x; st.fvx = st._v;
        sd(st.fz, st.fvz, tz, W_LOOK, dt); st.fz = st._x; st.fvz = st._v;
        sd(st.cz, st.cvz, st.fz, W_POS, dt); st.cz = st._x; st.cvz = st._v;
        sd(st.zoom, st.zv, o.slow && !o.rm ? 1 : 0, W_ZOOM, dt); st.zoom = st._x; st.zv = st._v;
      }
      const z = st.zoom, wall = o.walls ? o.half - 0.5 : o.half + 1.6, sx = Math.min(wall, o.sideX || wall);
      out.px = st.side * sx; out.py = 2.3 + (1.45 - 2.3) * z; const m = st.cz - 1.5 * z - 1.5; out.pz = 1.5 + (m + Math.sqrt(m * m + 1.2)) / 2;      // a smooth maximum: never nearer than ~1.5 m to the goal line, with no kink where it bites
      out.lx = st.fx * 0.85; out.ly = 0.9; out.lz = st.fz - 1.2 * z;
      out.fov = 50 + (40 - 50) * z;
      return out;
    }
    return { st, reset, update };
  }
  R3D.CamRig = { replayState, replayPre, replayCam, RT, PRESETS, ORDER, SIT, inputPsi, sideFrame, fixedFrame, ndc, guard, limits, shakeOf, blend, smooth, wrap };
})();
