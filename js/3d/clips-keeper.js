/* ISO FOOTBALL 3D — goalkeeper clips: set, dive (low / high / leap for a chip), on the ground, slide and get-up, hold, tracking a chip, throw.
   Pure pose clips for the animator (js/3d/anim3d.js): each writes the target pose T (Float32Array of AnimKit.N channels) from the
   sim clocks in pv. See js/3d/animkit.js for the channel layout and helpers, and anim3d.js for how clips are layered and eased.

   Every clip is a continuous function of its clock. A dive is aimed: the hands are solved (2-bone, in the trunk's frame) to
   where the ball will be when it reaches the keeper, so the animator's hand IK has little left to correct, and the body tilts
   and leaves the turf as far as that point needs. The flight uses the GROUND channel as an arc (1 = lowest point on the turf),
   so take-off and landing are exact contacts whatever the pose.

   Calls: gkSet(T, pv, st, ball)  gkDive(T, pv, st, u, air, ball)  gkGround(T, pv, st, ball)  gkHold(T, pv, st, ball)
          gkChip(T, pv, st, ball)  gkSlide(T, pv, st, ball)  gkThrow(T, u, pv, st).   ball = the ball as drawn (r3d.js bv). Everything after T (and u for
   the throw) is optional: a missing pv / ball is read from the adapter's current frame when there is one, and without any
   ball the clips play a default aim. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const A = R3D.AnimKit, Clips = (R3D.Clips = R3D.Clips || {});
  const { PI, clamp, lerp, sm, seg, fin, N, REST, setLeg, setArm, crouch, arm, leg } = A;
  const { RX, LIFT, RZ, RYAW, PITCH, ROLL, PY, SX, SZ, CX, CY, HX, HY, HZ, ARM_L, ARM_R, LEG_L, LEG_R, GROUND } = A.CH;

  const K = R3D.K || {}, SIM = ISO.C || {};
  const BR = fin(K.ballR, 0.11);                               // drawn ball radius
  const GRAV = fin(SIM.GRAV, 900) * fin(K.S, 0.05);            // m per sim s^2
  // the keeper's build in metres: player3d.js proportions x the rig scale, read from the animator's state (st.rig = actor.rig);
  // for a call without st it is the roster keeper's look x the keeper scale of player3d.js.
  const LOOK = (ISO.KEEPERS && ISO.KEEPERS[1] && ISO.KEEPERS[1].look) || {};
  let HK = 0, WK = 0, SPINE_Y, SHO_Y, SHO_X, HIP_Y, HIP_X, UARM, FARM, THIGH, SHIN, SOLE, REACH_UP, SH_LIE;
  function size(st) {
    const sc = fin(R3D.Player && R3D.Player.KEEPER_SCALE, 1);
    const rig = st && st.rig, h = fin(rig && rig.h, clamp(fin(LOOK.h, 1), 0.85, 1.16) * sc), w = fin(rig && rig.w, clamp(fin(LOOK.w, 1), 0.85, 1.18) * sc);
    if (h === HK && w === WK) return;
    HK = h; WK = w;
    SPINE_Y = 1.04 * h; SHO_Y = 0.4 * h; SHO_X = 0.215 * w; HIP_Y = 0.94 * h; HIP_X = 0.1 * w;
    UARM = 0.29 * h; FARM = 0.31 * h; THIGH = 0.44 * h; SHIN = 0.42 * h; SOLE = 0.08 * h;      // FARM reaches the palm
    REACH_UP = SPINE_Y + SHO_Y + UARM + FARM;                  // root to palm, arms straight overhead
    SH_LIE = 0.5 * h;                                          // lying: how far the feet trail the sim position
  }
  const REACH_HI = 2.7;                                        // the highest ball centre the set keeper's hands go to (the sim saves to 2.5 m)
  const LIFT0 = 0.25;                                          // root height the flight arc scales (see fly())
  const TH_LIE = 1.5;                                          // lying on the side: roll
  const FALL = 1.6;                                              // gravity of the fall after a catch in the air, x the sim's: a gathered body comes down hard and quick
  const LEAD = 0.03;                                           // sim s the animator's pose filter trails a fast target by: contacts are keyed this early

  // ---------------------------------------------------------------- per-keeper latch (aim of the current dive, hold clock)
  // kept on the animator's state when a call passes it; calls without st use the keeper seen last (one keeper is drawn at a time)
  const ALL = [];                                                // every keeper's latch, found again by the sim object (gkHugY)
  const mk = () => { const g = mkG(); ALL.push(g); return g; };
  const mkG = () => ({ sim: null, state: '', u: 0, L: 1, H: 0.5, F: 0.35, tp: 0.2, hit: false, jump: false, ds: 1, th: 0, sh: 0, lift: 0, holdAt: -1, hRoll: 0, hSh: 0, rz: 0, rW: 0, rP: 0, ik: 0, rHold: 0, rT: -1, rFresh: true, rX: 0, rY: 1, rZ: 0.4, bOn: false, bX: 0, bY: 1, bZ: 0.5, hbOn: false, hb: new Float32Array(3), hp: new Float32Array(N), armsOn: false, hop: 0, upAt: -9, sb: 0, sd: 1.2, sT: -1, sFresh: true, sp: new Float32Array(N), spOn: false, fs: new Float32Array(N), fsOn: false, setP: new Float32Array(N), setAt: -9, fromSet: false, sFrom: false, cl: 0, clv: 0, clT: -9, lp: new Float32Array(N), lpOn: false, fCl: 0, fV: 0, fromAir: false, hug: 0, hugW: 0, hugT: -9, hugX: 0, hugZ: 0 });
  let CUR = mk();
  function latch(st) { size(st); if (st) CUR = st.gk || (st.gk = mk()); return CUR; }
  const frame = () => (R3D.Adapter && R3D.Adapter.vf) || null;
  const livePV = (pv) => pv || (frame() && frame().keeper) || null;
  const liveBall = (ball) => ball || (frame() && frame().ball) || null;
  // the sim clock for easing: the adapter's frame time, else real time at the game's pace (lab)
  const clock = () => { const f = frame(); return f && f.t === f.t && f.t !== undefined ? f.t : (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.0006; };
  const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.0006;      // sim seconds at the game's pace

  const P0 = new Float32Array(N), P1 = new Float32Array(N);
  function mix(T, P, w) { if (w <= 0) return; for (let i = 0; i < GROUND; i++) T[i] += (P[i] - T[i]) * w; }
  function mixArm(T, s, sw, el, ab, w) { const b = arm(s); T[b] += (sw - T[b]) * w; T[b + 1] += (ab - T[b + 1]) * w; T[b + 2] *= 1 - w; T[b + 3] += (el - T[b + 3]) * w; }

  // ---------------------------------------------------------------- arm solve
  // Point arm `s` (+1 right) so its palm is at (ox, uy, fz) from the shoulder, in the trunk's frame: ox toward that arm's own
  // side, uy along the body toward the head, fz forward. `pitch` = the trunk's forward lean, taken out of the swing. Blended by w.
  function reachArm(T, s, ox, uy, fz, pitch, w) {
    const L = Math.sqrt(ox * ox + uy * uy + fz * fz) || 1e-4;
    const Lc = clamp(L, Math.abs(UARM - FARM) + 0.06, (UARM + FARM) * 0.995), k = Lc / L;
    ox *= k; uy *= k; fz = Math.max(fz * k, 0.2 * HK);         // hands stay in front of the shoulder plane: no branch cut, no flip as a target passes the joint
    const flex = Math.acos(clamp((Lc * Lc - UARM * UARM - FARM * FARM) / (2 * UARM * FARM), -1, 1));
    // the elbow folds in the arm's own plane, which the abduction then tips sideways
    const along = UARM + FARM * Math.cos(flex), sb = clamp(ox / along, -0.98, 0.98), ab = Math.asin(sb);
    const b = arm(s);
    T[b] += (Math.atan2(fz, -uy) - Math.atan2(FARM * Math.sin(flex), along * Math.cos(ab)) + pitch - T[b]) * w;
    T[b + 1] += (ab - T[b + 1]) * w;
    T[b + 2] *= 1 - w;
    T[b + 3] += (flex - T[b + 3]) * w;
  }
  // both hands to a point given in the keeper's frame (x toward side ds, y up, z forward), one hand on each side of the ball.
  // The trunk: root at (rx, ry), rolled th toward ds, the spine bent a further `bend`, pitched forward by `pitch`.
  function reachBoth(T, ds, x, y, z, rx, ry, th, bend, pitch, wNear, wFar) {
    const c = Math.cos(th), s = Math.sin(th), tt = th + bend, ct = Math.cos(tt), sn = Math.sin(tt), cp = Math.cos(pitch);
    const cx = rx + SPINE_Y * s + SHO_Y * sn * cp, cyy = ry + SPINE_Y * c + SHO_Y * ct * cp, cz = SHO_Y * Math.sin(pitch);
    for (let i = 1; i >= -1; i -= 2) {                         // i = +1: the arm on the dive side
      const w = i > 0 ? wNear : wFar;
      if (w <= 0) continue;
      // shoulder, and this hand's side of the ball (across the trunk)
      const dx = x + i * BR * ct - (cx + i * SHO_X * ct), dy = Math.max(0.075 * HK, y - i * BR * sn) - (cyy - i * SHO_X * sn);
      reachArm(T, i * ds, i * (dx * ct - dy * sn), dx * sn + dy * ct, z - cz, pitch, w);
    }
  }

  // ---------------------------------------------------------------- ground estimate
  // how far the lowest point of the body is below the root for a trunk rolled th toward ds (feet, hip, ribs, low shoulder);
  // negative when the legs are bent under an upright body. Reads the leg channels already written to T.
  function lowBelow(T, ds, th, bend) {
    const c = Math.cos(th), s = Math.sin(th), ct = Math.cos(th + bend), sn = Math.sin(th + bend);
    let m = 0.15 * HK - (HIP_Y - 0.02) * c;                                             // hip
    m = Math.max(m, 0.15 * HK - (SPINE_Y * c + 0.19 * HK * ct));                         // ribs
    m = Math.max(m, 0.06 * HK - (SPINE_Y * c + SHO_Y * ct) + SHO_X * sn);                // low shoulder
    for (let i = -1; i <= 1; i += 2) {
      const b = leg(i * ds), sw = T[b], ab = T[b + 1], kn = T[b + 3], ca = Math.cos(ab), sa = Math.sin(ab);
      const pit = kn + T[b + 4] - sw, toe = Math.max(0.19 * Math.sin(pit), -0.06 * Math.sin(pit)) * HK;       // toe or heel below the sole
      const y = HIP_Y - ca * (THIGH * Math.cos(sw) + (SHIN + SOLE) * Math.cos(sw - kn)) - toe * ca, x = i * (HIP_X + sa * (THIGH * Math.cos(sw) + (SHIN + SOLE) * Math.cos(sw - kn)));
      m = Math.max(m, x * s - y * c);
    }
    return m;
  }
  // flight: lowest point `clear` metres above the turf. With GROUND = g the animator lifts the root by g x (how far the body is
  // under the turf), so the lowest point ends at (1 - g) x (LIFT - below): exact contact at clear = 0. The lift is kept small
  // (no more than clear or 0.25 m above `below`) so that on take-off the animator's cross-fade of LIFT from the set stance's has
  // little to travel and the pelvis does not shoot up while the ground fit is still handing over. Returns the root height.
  let FLY = 0;                                                 // the clearance fly() was last given
  function fly(T, clear, below) {
    const lx = Math.max(clear, 0.25);
    FLY = clear;
    T[LIFT] = lx + below; T[GROUND] = 1 - clamp(clear / lx, 0, 1);
    return below + clear;
  }

  // where the chest is (centre height above the turf) in the pose T the clip has just written, for ball3d.js to hug a held ball at:
  // the root height (the lowest point rests on the turf, `fl` metres up in the air) plus the trunk's rise, turned by the roll and
  // the forward lean. 1.12 h upright, as ball3d's standing hug.
  const HUG_LIE = 1.1;                                         // chest centre height / body height lying on the hip after a slide (measured on the drawn pose)
  // g.hug is the chest height of the pose, g.hugW how much of it the held ball follows (1 in the air, lying or getting up, 0 standing,
  // where ball3d.js keeps its own hug height: 1.12 x the keeper scale); it eases so the ball never steps when he lands or is up
  function hugOf(T, g, fl, lying, pv, st) {
    if (pv) g.sim = pv.sim;
    const ry = lowBelow(T, 1, T[ROLL], 0) + fl, now = clock(), dt = clamp(now - g.hugT, 0, 0.1);
    g.hug = Math.max(BR, ry + (SPINE_Y + 0.08 * HK) * Math.cos(clamp(T[ROLL], -1.6, 1.6)) * Math.cos(clamp(T[SX] + T[PITCH], -1.4, 1.4)));
    hugXZ(T, g, pv, st);
    hugEase(g, fl > 0.03 || Math.abs(T[ROLL]) > 0.3 || lying ? 1 : 0, dt); g.hugT = now;
  }
  function hugXZ(T, g, pv, st) {
    const ky = st ? fin(st.yaw, 0) : fin(pv && pv.yaw, 0), hy = ky + T[RYAW], rf = 0.14 * fin(R3D.Player && R3D.Player.KEEPER_SCALE, 1) + BR, bl = -T[RX], bf = T[RZ];
    g.hugX = bl * Math.cos(ky) + bf * Math.sin(ky) + Math.sin(hy) * rf; g.hugZ = -bl * Math.sin(ky) + bf * Math.cos(ky) + Math.cos(hy) * rf;
  }
  function hugEase(g, w, dt) { g.hugW += (w - g.hugW) * (1 - Math.exp(-dt / 0.1)); }

  // ---------------------------------------------------------------- reading the ball
  // When and where the sim's save test (keeperBall in game.js) will first pass: the ball within `rad` of the segment from the
  // keeper to keeper + dir x reach along world x, on the ground plane; reach grows over the first 0.1 s of the dive clock t0.
  // Flight is ballistic from the view's velocities. Result in PR: t from now, ball relative to the keeper then (world x / z,
  // y = its lowest point), hit; without a hit, the closest approach inside the horizon.
  const PR = { t: 0, x: 0, y: 0, z: 0, hit: false };
  function predict(pv, ball, dir, reach, t0, rad, horizon) {
    const bx = fin(ball.x, 0) - fin(pv.x, 0), bz = fin(ball.z, 0) - fin(pv.z, 0), vx = fin(ball.vx, 0) - fin(pv.vx, 0), vz = fin(ball.vz, 0) - fin(pv.vz, 0);
    let best = 1e9, bt = 0;
    PR.hit = false;
    for (let i = 0, n = Math.ceil(clamp(horizon, 0, 0.5) * 120); i <= n; i++) {
      const tt = i / 120, x = bx + vx * tt, z = bz + vz * tt, d = Math.hypot(x - clamp(x * dir, 0, reach * Math.min(1, (t0 + tt) / 0.1)) * dir, z);
      if (d < best) { best = d; bt = tt; }
      if (d < rad) { PR.hit = true; break; }
    }
    PR.t = bt; PR.x = bx + vx * bt; PR.z = bz + vz * bt;
    PR.y = Math.max(0, fin(ball.y, 0) + fin(ball.vy, 0) * bt - 0.5 * GRAV * bt * bt);
    return best;
  }

  // where the free ball is in the keeper's frame (x right, y centre height, z forward): a catch starts from the last of these
  function seen(g, pv, st, ball) {
    if (!pv || !ball || ball.held) return;
    const yaw = st ? fin(st.yaw, 0) : fin(pv.yaw, 0), dx = fin(ball.x, 0) - fin(pv.x, 0), dz = fin(ball.z, 0) - fin(pv.z, 0);
    g.bX = -(dx * Math.cos(yaw) - dz * Math.sin(yaw)); g.bZ = dx * Math.sin(yaw) + dz * Math.cos(yaw); g.bY = fin(ball.y, 0) + BR;
    g.bOn = g.bX * g.bX + g.bZ * g.bZ < 2.6;
  }

  // ---------------------------------------------------------------- set
  const closeness = (pv, ball) => {                             // 0 = ball far up the pitch, 1 = in and around the box
    if (!pv || !ball) return 0.6;
    if (ball.held) return 0;
    return sm((12 - Math.hypot(fin(ball.x, 0) - fin(pv.x, 0), fin(ball.z, 0) - fin(pv.z, 0))) / 7);
  };
  // ready stance, added onto whatever the legs are doing (rest or the shuffle): on the toes, knees bent, hands out, a small
  // bounce. c = closeness, t = clock (sim s), an = reading a wind-up 0..1
  function stance(T, c, t, an) {
    const b = 0.5 - 0.5 * Math.cos(t * 19), sway = Math.sin(t * 3.1);          // bounce (about 1.8 Hz at game pace) and a slow weight shift
    const q = 0.2 + 0.13 * c + 0.07 * an - 0.045 * c * b;
    crouch(T, q);
    const toes = 0.1 + 0.12 * c + 0.16 * c * b;
    for (let i = 0; i < 2; i++) { const l = i ? LEG_R : LEG_L; T[l + 1] += 0.11 + 0.08 * c; T[l + 2] += 0.12; T[l + 4] += toes; }
    T[SX] += 0.04 + 0.1 * c + 0.05 * an; T[CX] += 0.03 * c; T[HX] -= 0.06 + 0.1 * c;
    T[PY] += 0.04 * (1 - c) * sway; T[SZ] += 0.02 * (1 - c) * sway;
    const sw = lerp(0.26, 0.5, c) + 0.05 * c * b, el = lerp(1.0, 0.78, c) - 0.06 * c * b, ab = lerp(0.2, 0.58, c);
    setArm(T, 1, sw, el, ab, 0.25 * c); setArm(T, -1, sw, el, ab, 0.25 * c);
    T[ARM_L + 4] = T[ARM_R + 4] = -0.25 * c;
  }
  // a ball about to reach him (or at his feet) while he is set: the hands go to meet it, the body drops or leans behind them.
  // Two weights, both eased on the sim clock so they never switch: g.rP follows a shot that will pass within his reach,
  // g.rW (what gkReach() returns) also takes in a ball simply near him (a dribbler, a loose ball). After a
  // touch the hands stay where the ball was and let go over the next 0.4 s.
  function reflex(T, g, pv, st, ball) {
    const sv = pv && pv.save, age = sv && sv.kind !== 'throw' ? fin(sv.age, 9) : 9, touched = age < 0.4;
    const now = clock(), gap = now - g.rT;
    if (g.rT < 0 || gap > 0.3 || gap < -0.05) { g.rW = g.rP = g.ik = 0; g.rFresh = true; }
    const dt = clamp(gap, 0, 0.1); g.rT = now;
    if (touched) {
      const k = 1 - sm((age - 0.12) / 0.28);
      g.rW = g.rHold * k; g.rP = Math.min(g.rP, g.rW);
    } else {
      let wt = 0, wn = 0;
      if (pv && ball && !ball.held) {
        const yaw = st ? fin(st.yaw, 0) : fin(pv.yaw, 0), cy = Math.cos(yaw), sy = Math.sin(yaw);
        // the ball 0.1 s from now, relative to him: a dribbler or a loose ball closing on him is met, not waited for
        const dx = fin(ball.x, 0) - fin(pv.x, 0) + 0.1 * (fin(ball.vx, 0) - fin(pv.vx, 0)), dz = fin(ball.z, 0) - fin(pv.z, 0) + 0.1 * (fin(ball.vz, 0) - fin(pv.vz, 0)), high = 1 - sm((fin(ball.y, 0) + BR - REACH_HI) / 0.3);
        let x = -(dx * cy - dz * sy), y = fin(ball.y, 0) + BR, z = dx * sy + dz * cy;
        wn = (1 - sm((Math.hypot(dx, dz) - 1.2) / 1.1)) * high;
        if (!(ball.owner >= 0)) {
          predict(pv, ball, 1, 0, 1, 0.9, 0.42);
          if (PR.hit) { x = -(PR.x * cy - PR.z * sy); y = PR.y + BR; z = PR.x * sy + PR.z * cy; wt = sm((0.4 - PR.t) / 0.25) * (1 - sm((y - REACH_HI) / 0.3)); }
        }
        if (Math.max(wt, wn) > 0.01) {
          z = clamp(z, 0.25, 1.3);
          const k = g.rFresh || g.rW < 0.03 ? 1 : 1 - Math.exp(-dt / 0.025);
          g.rX += (x - g.rX) * k; g.rY += (y - g.rY) * k; g.rZ += (z - g.rZ) * k;
          g.rFresh = false;
        }
      }
      const since = now - g.upAt, up = since < 0 ? 1 : sm(since / 0.25), wm = Math.max(wt, wn) * up;
      g.rW += (wm - g.rW) * (1 - Math.exp(-dt / (wm > g.rW ? 0.03 : 0.12)));
      g.rP += (wt - g.rP) * (1 - Math.exp(-dt / (wt > g.rP ? 0.03 : 0.12)));
      g.rHold = g.rW;
    }
    const w = g.rW;
    // the animator's hand IK weight (st.gk.ik): follows the reach weight a little slower so a ball that appears inside his
    // reach pulls the hands over a few frames, and lets go as the ball leaves the hands
    const ikT = touched ? w * (1 - sm(age / 0.12)) : w;
    g.ik += (ikT - g.ik) * (1 - Math.exp(-dt / (ikT > g.ik ? 0.035 : 0.03)));
    if (w <= 0.001) { g.rW = 0; g.ik = 0; g.hop = 0; return; }
    // the sim saves anything within 0.9 m of him, further than a standing arm: lunge the body at it (roll over the feet,
    // the trunk folding forward) and get down behind a low one
    const x = g.rX, y = g.rY, z = g.rZ, low = 1 - sm(y / (0.9 * HK)), hi = sm((y - 1.7 * HK) / 0.5);
    g.hop = 0.3 * HK * sm((y - 2 * HK) / 0.5) * g.rP;      // how far he would leave the turf for a ball over his reach (read through gkHop)
    const th = clamp(x * 0.28, -0.3, 0.3) * w, bend = clamp(x * 0.22, -0.25, 0.25) * w;
    crouch(T, (0.85 * low - 0.3 * hi) * w);
    T[LEG_L + 4] += 0.45 * hi * w; T[LEG_R + 4] += 0.45 * hi * w;      // a ball over his head: up on his toes, legs long
    T[RZ] += clamp(z - 0.95, 0, 0.4) * w; T[RX] += clamp(Math.abs(x) - 0.8, 0, 0.35) * Math.sign(x) * w;      // and a step's lean at one that is further than his arms
    T[ROLL] += th; T[SZ] += bend; T[SX] += (0.6 * low + clamp((z - 0.3) * 0.9, 0, 0.5)) * w; T[HX] -= 0.2 * low * w;
    reachBoth(T, 1, x, y, z, 0, lowBelow(T, 1, th, bend), th, bend, T[SX] + T[CX], w * sm((x + 0.5) / 0.45), w * sm((0.5 - x) / 0.45));
  }
  function clipGkSet(T, pv, st, ball) {
    const g = latch(st); pv = livePV(pv); ball = liveBall(ball);
    const sim = pv && pv.sim, sv = pv && pv.save;
    if (g.state === 'sground' || g.state === 'slide') g.upAt = clock();      // just back on his feet: the reflex crouch comes in over a quarter second
    g.state = 'set'; seen(g, pv, st, ball);
    stance(T, closeness(pv, ball), sim ? fin(sim.stT, 0) : wall(), sim ? clamp(fin(sim.antic, 0) / fin(SIM.K_ANTIC, 0.03), 0, 1) : 0);
    reflex(T, g, pv, st, ball);
    // a catch taken standing: hands to the ball, then into the body
    if (sv && (sv.kind === 'catch' || sv.kind === 'smother' || sv.kind === 'claim') && fin(sv.age, 1) < 0.5) {
      const w = sm(fin(sv.age, 1) / 0.06) * (1 - sm(seg(fin(sv.age, 1), 0.36, 0.5)));      // the hands come in from wherever they were, not in one frame
      P0.set(REST); gather(P0, g, fin(sv.age, 1), 0, 0, pv, ball, st);
      mix(T, P0, w);
    }
    g.setP.set(T); g.setAt = clock();                           // what the dive and the chip leap start from
  }

  // ---------------------------------------------------------------- hold
  // the gather: arms out to the ball (age 0), drawn into the chest by 0.25 s. wind = winding up the throw 0..1
  function gather(T, g, age, wind, k, pv, ball, st, fl) {
    const in1 = sm(age / 0.25), give = Math.sin(PI * clamp(age / 0.3, 0, 1));
    // the ball in the keeper's frame: as drawn when the caller passes it; else from where it was caught to where ball3d.js
    // hugs it, at ball3d's own rate (12 / s of real time)
    let bx = 0, by = 1.05, bz = 0.3;
    if (ball && ball.held && pv && ball.r !== undefined) {
      const yaw = st ? fin(st.yaw, 0) : fin(pv.yaw, 0), dx = ball.x - pv.x, dz = ball.z - pv.z;
      bx = -(dx * Math.cos(yaw) - dz * Math.sin(yaw)); bz = dx * Math.sin(yaw) + dz * Math.cos(yaw); by = fin(ball.y, 0.94) + BR;
    } else {
      const e = Math.exp(-12 * age / fin(SIM.SPEED, 0.6));
      if (g.bOn) { bx = g.bX * e; by += (g.bY - by) * e; bz += (g.bZ - bz) * e; } else { bz += 0.2 * e; by += 0.07 * e; }
    }
    bx = clamp(bx, -0.9, 0.9); bz = clamp(bz, 0.15, 0.9); by = clamp(by, BR, 2.2 * HK);
    // the drawn ball jumps from where it was caught to the hug within a frame or two: the hands start at the first one they saw
    // and settle onto the live one
    if (g.state === 'hold') {
      if (!g.hbOn) { g.hb[0] = bx; g.hb[1] = by; g.hb[2] = bz; g.hbOn = true; }
      const e = Math.exp(-age / 0.07);
      bx += (g.hb[0] - bx) * e; by += (g.hb[1] - by) * e; bz += (g.hb[2] - bz) * e;
    }
    const low = 1 - sm(by / (0.85 * HK));                       // a ball at his feet: down to it
    const q = 0.1 + 0.12 * give + 0.2 * wind + 0.35 * k + 0.4 * low, pitch = 0.07 + 0.1 * in1 + 0.12 * wind + 0.45 * low + clamp((bz - 0.4) * 0.6, 0, 0.3);
    crouch(T, q);
    T[LEG_L + 1] += 0.08 + 0.1 * low; T[LEG_R + 1] += 0.08 + 0.1 * low;
    T[SX] = 0.45 * q + pitch; T[CX] = 0.08 * in1; T[HX] = 0.12 * in1 - 0.1 * wind;
    if (g.fromAir) {                                           // caught in the air: trunk and legs leave the dive's pose as he comes down, the hands are solved from them
      const w = 1 - sm(age / 0.2);
      for (let i = 0; i < GROUND; i++) if (i < ARM_L || i >= LEG_L) T[i] += (g.lp[i] - T[i]) * w;
    }
    reachBoth(T, 1, bx, by, bz, 0, lowBelow(T, 1, 0, 0) + fin(fl, 0), 0, 0, T[SX] + T[CX], 1, 1);
  }
  function clipGkHold(T, pv, st, ball) {
    const g = latch(st); g.ik = 0; pv = livePV(pv); ball = liveBall(ball);
    const sim = pv && pv.sim, f = frame(), now = f ? fin(f.t, -1) : -1;
    if (g.state !== 'hold') {                                   // entry: start the clock, remember a dive it interrupts
      g.hRoll = g.state === 'dive' && !g.jump ? g.ds * g.th : 0; g.hSh = g.state === 'dive' && !g.jump ? g.ds * g.sh : 0;
      g.fsOn = g.state === 'slide' && g.spOn; if (g.fsOn) g.fs.set(g.sp);       // a smother out of the slide: he gets up with the ball
      // caught in the air: the flight goes on under gravity from where it was, and the pose is the dive's, gathering as it comes down
      g.fromAir = g.state === 'dive' && g.lpOn && g.cl > 0.03 && clock() - g.clT < 0.1;
      if (g.fromAir) { g.fCl = g.cl; g.fV = g.clv; }
      if (g.state !== 'dive' && g.state !== 'slide' && g.state !== 'sground') g.hugW = 0;      // the ball follows the pose only after a dive or a slide
      g.holdAt = now; g.state = 'hold'; g.hbOn = false;
    }
    const sv = pv && pv.save;
    let age = now >= 0 && g.holdAt >= 0 && now >= g.holdAt ? now - g.holdAt : 9;
    if (sv && (sv.kind === 'catch' || sv.kind === 'smother')) age = Math.min(age, fin(sv.age, 9));
    // the throw is released when holdT runs out: coil for it over the last 0.3 s
    const hT = sim ? fin(sim.holdT, 0.9) : 0.9, wind = hT < 0.9 ? sm(1 - hT / 0.3) : 0;
    const k = 1 - sm(age / 0.34);                               // caught in the air: come down out of the dive
    T.set(REST);
    let fl = 0;
    if (g.fromAir) {                                           // the flight goes on under gravity
      const te = now >= 0 && g.holdAt >= 0 && now >= g.holdAt ? now - g.holdAt : age;
      fl = Math.max(0, g.fCl + g.fV * te - 0.5 * FALL * GRAV * te * te);
      if (fl <= 0 && te > 0.05) g.fromAir = false;
    }
    gather(T, g, age, wind, k, pv, ball, st, fl);
    if (g.fromAir) fly(T, fl, lowBelow(T, 1, T[ROLL], 0));
    T[ROLL] = g.hRoll * k; T[RX] = -g.hSh * k;
    T[CY] += 0.2 * wind; T[LEG_R] -= 0.1 * wind; T[LEG_L] += 0.08 * wind;      // the coil for the sling: chest turned back, weight on the rear leg
    let gu = -1;
    if (g.fsOn) {
      const u = age / 0.45;
      if (u >= 1) g.fsOn = false;
      else { gu = u; P1.set(T); getUp(T, g.fs, u, P1, st, 0.4); const w = 1 - sm(seg(u, 0, 0.5)); T[RYAW] = g.fs[RYAW] * w; T[RX] = g.fs[RX] * w; T[RZ] = g.fs[RZ] * w; }
    }
    hugOf(T, g, fl, gu >= 0, pv, st);
    if (gu >= 0) g.hug = lerp(HUG_LIE * HK, g.hug, sm(seg(gu, 0.1, 0.85)));      // up from the turf: the chest rises with the pelvis
    g.hp.set(T); g.armsOn = true;                             // the throw starts from this whole pose
  }

  // ---------------------------------------------------------------- tracking a chip
  // layered on the set / shuffle pose: eyes up, weight back, hands ready in front and working with the steps; as the take-off
  // nears (sim.reactT) the legs load and the arms draw back for the swing into the leap
  function clipGkChip(T, pv, st, ball) {
    const g = latch(st); g.ik = 0; pv = livePV(pv);
    g.state = 'chip';
    chipLayer(T, pv);
    if (clock() - g.setAt < 0.05) chipLayer(g.setP, pv);        // the pose a leap starts from has the chip's stance too
  }
  function chipLayer(T, pv) {
    const sim = pv && pv.sim;
    const load = sim ? sm(1 - fin(sim.reactT, 1) / 0.22) : 0, ph = pv ? fin(pv.animDist, 0) * 0.16 : 0, pump = Math.sin(ph);
    crouch(T, 0.26 * load);
    T[SX] = lerp(T[SX], -0.1 + 0.3 * load, 0.85); T[CX] = lerp(T[CX], -0.06, 0.8); T[HX] = -0.34 + 0.12 * load;
    for (let i = -1; i <= 1; i += 2) {
      const sw = lerp(0.95 + 0.14 * i * pump, -0.45, load), el = lerp(1.45 - 0.1 * i * pump, 0.5, load), ab = lerp(0.42, 0.22, load);
      mixArm(T, i, sw, el, ab, 1); T[arm(i) + 4] = -0.2 * (1 - load);
    }
  }

  // ---------------------------------------------------------------- dive
  // where the hands have to be: the ball when it reaches the keeper, in his frame at that moment (L toward the dive side, H up,
  // F forward) and when (tp, on the dive clock). Latched for the dive: eased while the ball flies, frozen once it is touched.
  function aim(g, pv, st, ball, ds, u, t, dur, jump, fresh) {
    g.state = 'dive'; g.u = u; g.jump = jump; g.ds = ds;
    if (fresh) {
      g.hit = false;
      g.L = jump ? 0.15 : pv.high ? 1.0 : 1.1; g.H = jump ? 2.7 : pv.high ? 2.1 : 0.5; g.F = jump ? 0.25 : 0.35;
      g.tp = jump ? 0.26 : clamp(dur - 0.14, 0.1, 0.6 * dur);
    }
    const sv = pv.save;
    if (sv && sv.kind !== 'throw' && fin(sv.age, 9) <= t + 0.03) g.hit = true;
    if (!ball || ball.held || ball.owner >= 0 || g.hit) return;
    const d = predict(pv, ball, pv.diveDir >= 0 ? 1 : -1, 0.68 * (jump ? 1.3 : 1), t, 0.85, Math.min(0.42, dur - t + 0.12));
    if (!PR.hit && (d > 3.2 || PR.t <= 0)) { if (!fresh || d > 3.2) { g.hit = !fresh; return; } }      // out of range, or already going away: keep the aim
    const yaw = st ? fin(st.yaw, 0) : fin(pv.yaw, 0), cy = Math.cos(yaw), sy = Math.sin(yaw), k = fresh ? 1 : 0.35;
    g.L += (clamp(-(PR.x * cy - PR.z * sy) * ds, -0.5, 2.6) - g.L) * k;
    g.H += (clamp(PR.y + BR, BR, 3.8) - g.H) * k;
    g.F += (clamp(PR.x * sy + PR.z * cy, 0.2, 0.95) - g.F) * k;
    g.tp += (t + PR.t - g.tp) * k;
  }
  // lying on the side after a dive (also the first key of the recovery)
  function lie(T, ds) {
    T.set(REST);
    T[ROLL] = ds * TH_LIE; T[RX] = -ds * SH_LIE; T[SZ] = -ds * 0.16; T[SX] = 0.12; T[HZ] = -ds * 0.3; T[HX] = -0.1;
    setLeg(T, ds, 0.2, 0.45, -0.05, 0.3); setLeg(T, -ds, 0.6, 0.85, 0.12, 0.3);
    setArm(T, ds, 2.5, 0.35, -0.1); setArm(T, -ds, 1.9, 0.8, -0.12);
    T[GROUND] = 1;
  }
  // on his feet after the leap, knees giving
  function landed(T) {
    T.set(REST);
    crouch(T, 0.34);
    T[LEG_L + 1] += 0.1; T[LEG_R + 1] += 0.1; T[LEG_L + 4] += 0.12; T[LEG_R + 4] += 0.12;
    setArm(T, 1, 0.9, 1.0, 0.4); setArm(T, -1, 0.9, 1.0, 0.4);
    T[SX] = 0.25; T[HX] = -0.15; T[GROUND] = 1;
  }

  function clipGkDive(T, pv, st, u, air, ball) {
    const g = latch(st), sim = pv.sim;
    g.ik = 0;
    if (air === false) u = 1;
    u = clamp(fin(u, 0), 0, 1);
    // the side is taken once per dive: the animator's diveSide can flip mid-dive when he faces along the goal line
    const fresh = g.state !== 'dive' || u < g.u - 0.02, ds = fresh ? (st && st.diveSide) || (pv.diveDir >= 0 ? 1 : -1) : g.ds;
    const dur = Math.max(0.2, fin(sim && (sim.diveT || sim.stDur), 0) || 0.42), t = u * dur;
    const jump = !!pv.jump && !(sim && sim.human);
    ball = liveBall(ball); seen(g, pv, st, ball);
    aim(g, pv, st, ball, ds, u, t, dur, jump, fresh);
    T.set(REST);
    if (jump) { leap(T, g, ds, u, t, dur); fromSet(T, g, t, fresh); track(T, g, fresh, pv, st); return; }
    const up = clamp(Math.max(g.tp - LEAD, 0.17) / dur, 0.4, 0.72);      // the dive peaks as the ball arrives (the hands can be earlier, the body cannot)
    const x1 = clamp(u / up, 0, 1), x2 = seg(u, up, 1), rise = 0.5 * (1 - (1 - x1) * (1 - x1)) + 0.5 * sm(x1), fall = sm(x2);
    const arc = Math.pow(Math.sin(PI * (u < up ? 0.5 * x1 : 0.5 + 0.5 * x2)), 1.3);
    // body line at the save: flat for a low ball, more upright (and higher off the turf) the higher it is
    const thS = clamp(Math.atan2(g.L + 0.5 * HK, Math.max(0.1, g.H - 0.5 * HK)), 0.3, 1.4);
    const clear = clamp(g.H - REACH_UP * Math.cos(thS) - 0.15, 0.1, 1.45);
    const shS = clamp((REACH_UP - 0.1) * Math.sin(thS) - g.L - 0.05, 0, 0.8 * HK);      // the feet stay behind so the hands, not the hips, lead
    const th = thS * rise, sh = shS * rise, bend = 0.16 * rise, rz = clamp((g.F - 0.5) * 0.7, 0, 0.3) * rise;      // a ball met well in front: the dive goes out at it
    // legs: the near leg loads and drives him off the turf, the far knee comes through
    const push = sm(x1 / 0.7), drive = sm(x1 / 0.85);
    setLeg(T, ds, lerp(0.5, -0.12, push), lerp(1.0, 0.12, push), 0.08, lerp(-0.35, 0.6, push), 0.1);
    setLeg(T, -ds, lerp(0.45, 1.0, drive), lerp(0.9, 1.35, drive), lerp(0.14, 0.3, drive), 0.3, 0.1);
    T[ROLL] = ds * th; T[RX] = -ds * sh; T[RZ] = rz; T[SZ] = ds * bend; T[SX] = 0.1 + clamp((g.F - 0.3) * 0.7, 0, 0.45) * rise; T[CY] = ds * 0.12 * rise;
    T[HZ] = -ds * 0.25 * rise; T[HY] = ds * 0.3 * rise; T[HX] = -0.12 * rise;
    const below = lowBelow(T, ds, th, bend), ry = fly(T, arc * clear, below);
    // arms: out of the set position onto the ball inside the sim's own reach time
    const rw = sm(t / clamp(g.tp - LEAD, 0.07, 0.3));
    setArm(T, 1, 0.5, 0.8, 0.5); setArm(T, -1, 0.5, 0.8, 0.5);
    reachBoth(T, ds, g.L, g.H, g.F - rz, -sh, ry, th, bend, T[SX], rw, rw);
    // down onto the side
    if (fall > 0) {
      const lift = T[LIFT], gr = T[GROUND];
      lie(P0, ds); P0[RZ] = rz; mix(T, P0, fall);
      T[LIFT] = lift; T[GROUND] = gr;
    }
    g.th = lerp(th, TH_LIE, fall); g.sh = lerp(sh, SH_LIE, fall); g.lift = T[LIFT]; g.rz = rz;
    fromSet(T, g, t, fresh);
    track(T, g, fresh, pv, st);
  }
  // the flight as it stands (height of the lowest point and its speed, sim s) and the pose: a catch in the air carries on from them
  function track(T, g, fresh, pv, st) {
    const now = clock(), gap = now - g.clT;
    g.clv = !fresh && gap > 0.001 && gap < 0.1 ? (FLY - g.cl) / gap : 0;
    g.cl = FLY; g.clT = now; g.lp.set(T); g.lpOn = true; hugOf(T, g, FLY, false, pv, st);
  }
  // the first frames continue from the set pose he is in (stance, crouch, reflex reach), not from a standing one: the dive's own
  // pose takes over over DIVE_IN s of the dive clock
  const DIVE_IN = 0.1;
  function fromSet(T, g, t, fresh) {
    if (fresh) g.fromSet = clock() - g.setAt < 0.12;
    if (!g.fromSet || t >= DIVE_IN) return;
    const w = 1 - sm(t / DIVE_IN), lift = T[LIFT], gr = T[GROUND];
    mix(T, g.setP, w); T[LIFT] = lift; T[GROUND] = gr;
  }
  // the leap for a chip: straight up off both feet, the far knee lifted, one or both hands to the ball, landing on his feet
  function leap(T, g, ds, u, t, dur) {
    const up = clamp(Math.max(g.tp - LEAD, 0.16) / dur, 0.3, 0.72), x1 = clamp(u / up, 0, 1), x2 = seg(u, up, 1);
    const arc = Math.pow(Math.sin(PI * (u < up ? 0.5 * x1 : 0.5 + 0.5 * x2)), 1.3);
    const ext = sm(x1 / 0.6), land = sm(seg(x2, 0.45, 1)), knee = sm(seg(x1, 0.25, 0.9)) * (1 - sm(seg(x2, 0.15, 0.7)));
    const thS = clamp(Math.atan2(g.L, Math.max(1, g.H - 0.85 * HK)), -0.25, 0.42), th = thS * sm(x1) * (1 - sm(x2));
    const clear = clamp(g.H - REACH_UP * Math.cos(thS) - 0.08, 0.2, 1.1);
    const q = lerp(0.6, 0.03, ext), toe = 0.55 * ext * (1 - land);
    crouch(T, q);
    T[LEG_L + 4] += toe; T[LEG_R + 4] += toe; T[LEG_L + 1] += 0.06; T[LEG_R + 1] += 0.06;
    const fl = leg(-ds); T[fl] += 0.85 * knee; T[fl + 3] += 1.3 * knee;
    T[SX] = lerp(lerp(0.34, -0.14, sm(x1 / 0.8)), 0.1, sm(x2)); T[HX] = -0.32 * sm(x1) * (1 - land);
    T[ROLL] = ds * th; T[SZ] = ds * 0.1 * sm(x1) * (1 - sm(x2));
    const below = lowBelow(T, ds, th, T[SZ] * ds), ry = fly(T, arc * clear, below);
    // arms: swing up from behind the hips; the far hand joins only when the ball is close to overhead
    const rw = sm(t / clamp(g.tp - LEAD, 0.07, 0.24)), both = 1 - sm((Math.abs(g.L) - 0.3) / 0.45);
    setArm(T, ds, -0.45, 0.5, 0.22); setArm(T, -ds, lerp(-0.45, 0.7, rw), lerp(0.5, 1.0, rw), lerp(0.22, 0.75, rw));
    reachBoth(T, ds, g.L, g.H, g.F, 0, ry, th, T[SZ] * ds, T[SX], rw, rw * both);
    if (land > 0) {
      const lift = T[LIFT], gr = T[GROUND];
      landed(P0); mix(T, P0, land);
      T[LIFT] = lift; T[GROUND] = gr;
    }
    g.th = th; g.sh = 0; g.lift = T[LIFT]; g.rz = 0;
  }

  // ---------------------------------------------------------------- on the ground, and back up
  function clipGkGround(T, pv, st, ball) {
    const g = latch(st); g.ik = 0;
    const u = clamp(fin(pv.u, 0), 0, 1), sim = pv.sim;
    const ds = g.state === 'dive' || g.state === 'ground' ? g.ds : (st && st.diveSide) || 1;
    const jump = g.state === 'dive' || g.state === 'ground' ? g.jump : !!pv.jump && !(sim && sim.human);
    if (g.state !== 'dive' && g.state !== 'ground') { g.lift = LIFT0; g.rz = 0; }
    g.state = 'ground'; g.jump = jump; g.ds = ds;
    const c = closeness(pv, liveBall(ball));
    P1.set(REST); stance(P1, c, 0, 0);                         // where it ends: the set stance at the start of its bounce
    if (jump) {
      // landing from the leap: the knees take it, then he rises into the stance
      landed(T);
      const sink = Math.sin(PI * sm(seg(u, 0, 0.7)));
      crouch(T, 0.3 * sink); T[SX] += 0.08 * sink;
      T[ARM_L] -= 0.3 * sink; T[ARM_R] -= 0.3 * sink;
      mix(T, P1, sm(seg(u, 0.35, 1)));
    } else {
      // lying -> propped on the low arm with the knees drawn up -> feet under him -> stance
      lie(T, ds); T[RZ] = g.rz;
      const s1 = sm(seg(u, 0.08, 0.52)), s2 = sm(seg(u, 0.42, 0.82)), s3 = sm(seg(u, 0.7, 1));
      P0.set(REST);
      P0[ROLL] = ds * 0.85; P0[RX] = -ds * 0.34 * HK; P0[SZ] = -ds * 0.5; P0[SX] = 0.3; P0[HZ] = -ds * 0.2;
      setLeg(P0, ds, 1.15, 1.9, 0.05, 0.4); setLeg(P0, -ds, 1.3, 1.75, 0.3, 0.2);
      setArm(P0, ds, 0.35, 0.2, 0.75); setArm(P0, -ds, 0.9, 0.9, 0.3);
      mix(T, P0, s1);
      P0.set(REST); crouch(P0, 0.72); P0[LEG_L + 1] += 0.16; P0[LEG_R + 1] += 0.16; P0[SX] += 0.2; P0[RX] = -ds * 0.08 * HK;
      setArm(P0, ds, 0.7, 0.7, 0.5); setArm(P0, -ds, 0.6, 0.9, 0.4);
      mix(T, P0, s2);
      mix(T, P1, s3);
    }
    T[GROUND] = 1; T[LIFT] = fin(g.lift, 0) * (1 - sm(u / 0.4));
  }


  // ---------------------------------------------------------------- slide, and getting up (also out of a smother)
  // The keeper's slide at the dribbler's feet: the sim gives it 0.5 s (state slide, pv.sim.stT), a hit is tested from 0.04 s on a
  // ball up to 1.8 m from him in any direction, then 0.45 s of `ground` (pv.slid, pv.u 0..1). It is the outfield slide (low on one
  // hip, lead leg along the turf, clips-action.js) turned toward the ball with the body stretched out the missing distance, and
  // the outfield `down` (tuck, feet under him) into the set stance, as one motion: the pelvis rises with the clock, never in a step.
  const SLV = { runPh: undefined, state: 'slide', u: 0, sim: { stT: 0 } };      // the pv the outfield slide clip reads, for a pose at a given clock
  function slidePose(T, state, stT, st) { SLV.runPh = undefined; SLV.state = state; SLV.sim.stT = stT; Clips.slide(T, SLV, st, false); }
  // lying after the slide (key 0), tuck and stand (`down`), then the destination pose (the set stance, or the gather of a hold):
  // u 0..1. `from` is the slide's last pose; a smother that ends the slide reaches the same motion with its own clock.
  // handsW: the arms go to `dest` over this share of u (a hold: the hands stay on the ball, which is drawn at chest height)
  function getUp(T, from, u, dest, st, handsW) {
    SLV.runPh = 0; SLV.state = 'down'; SLV.u = sm(seg(u, 0.12, 0.78)); Clips.slide(T, SLV, st, false);
    mix(T, from, 1 - sm(seg(u, 0, 0.2)));
    mix(T, dest, sm(seg(u, 0.5, 1)));
    if (handsW > 0) { const w = sm(u / handsW); for (let i = ARM_L; i < LEG_L; i++) T[i] += (dest[i] - T[i]) * w; }
    T[GROUND] = 1;
  }
  // Clips.gkSlide(T, pv, st, ball): state `slide`, then `ground` with pv.slid (pv.u 0..1, the sim's clocks). ball = the drawn ball.
  function clipGkSlide(T, pv, st, ball) {
    const g = latch(st); g.ik = 0; pv = livePV(pv); ball = liveBall(ball);
    const sim = pv && pv.sim, ground = !!pv && pv.state === 'ground';
    const stT = ground ? 0.5 : clamp(fin(sim && sim.stT, 0.5 * fin(pv && pv.u, 0.5)), 0, 0.5), u = ground ? clamp(fin(pv.u, 0), 0, 1) : 0;
    if (g.state !== 'slide' && g.state !== 'sground') { g.sFresh = true; g.sT = -1; g.spOn = false; g.sFrom = clock() - g.setAt < 0.12; }
    g.state = ground ? 'sground' : 'slide';
    // the ball as the legs have to meet it: bearing (toward his right) and distance from him, eased; frozen once a save has been made
    const sv = pv && pv.save, done = !!sv && fin(sv.age, 9) < 0.5 && sv.kind !== 'throw';
    const now = clock(), gap = now - g.sT; g.sT = now;
    if (pv && ball && !ball.held && !done && !ground) {
      const yaw = st ? fin(st.yaw, 0) : fin(pv.yaw, 0), dx = fin(ball.x, 0) - fin(pv.x, 0), dz = fin(ball.z, 0) - fin(pv.z, 0);
      const bx = -(dx * Math.cos(yaw) - dz * Math.sin(yaw)), bz = dx * Math.sin(yaw) + dz * Math.cos(yaw), k = g.sFresh || gap < 0 || gap > 0.2 ? 1 : 1 - Math.exp(-clamp(gap, 0, 0.1) / 0.05);
      let bb = Math.atan2(bx, bz); if (Math.abs(bb - g.sb) > PI) bb += bb < g.sb ? 2 * PI : -2 * PI;
      g.sb += (bb - g.sb) * k; g.sd += (Math.hypot(bx, bz) - g.sd) * k; g.sFresh = false;
    }
    if (g.sFresh) { g.sb = 0; g.sd = 1.2; }
    const be = clamp(g.sb, -1.25, 1.25), ext = clamp(g.sd - 1.1, 0, 0.8);
    if (!ground || !g.spOn) {                                    // the lying pose, the ball's direction and distance in it
      const aw = ground ? 1 : sm(stT / 0.1);
      slidePose(g.sp, ground ? 'ground' : 'slide', stT, st);
      g.sp[RYAW] += be * aw; g.sp[RX] += Math.sin(be) * ext * aw; g.sp[RZ] += Math.cos(be) * ext * aw;
      g.spOn = true;
    }
    if (ground) {
      P1.set(REST); stance(P1, closeness(pv, ball), 0, 0);
      getUp(T, g.sp, u, P1, st);
      const k = 1 - sm(seg(u, 0, 0.5)); T[RYAW] = g.sp[RYAW] * k; T[RX] = g.sp[RX] * k; T[RZ] = g.sp[RZ] * k;
    } else {
      T.set(g.sp);
      if (g.sFrom && stT < 0.12) mix(T, g.setP, 1 - sm(stT / 0.12));      // the first frames continue from the stance he is in
    }
    T[GROUND] = 1; T[LIFT] = 0;
    g.sim = pv && pv.sim; g.hug = HUG_LIE * HK; g.hugW = 1; g.hugT = clock(); hugXZ(T, g, pv, st);        // a smother takes the ball here
  }

  // ---------------------------------------------------------------- throw
  // u runs over the 0.3 s after the release (animator clock). The sim lets the ball go flat and fast, from low in front of him, at
  // u = 0, and the hold's last 0.3 s is the coil for it (chest turned back, weight on the rear leg): a quick sling. The right arm
  // whips out from the hug to full reach at chest height by u 0.33 (the ball is gone by then), carries on across the body and down,
  // the trunk drives forward over the left foot stepping through, the right leg trails on its toes, then he settles toward the stance.
  function clipGkThrow(T, u, pv, st) {
    const g = latch(st); g.ik = 0;
    u = clamp(fin(u, 1), 0, 1);
    const p = sm(seg(u, 0, 0.34)), f = sm(seg(u, 0.3, 0.62)), back = sm(seg(u, 0.5, 1)), step = Math.sin(PI * sm(seg(u, 0, 0.75)));
    const ok = g.armsOn && g.state === 'hold', h = g.hp, b = (c, d) => (ok ? h[c] : d);      // where the hold left each channel
    T.set(REST);
    crouch(T, lerp(b(LEG_L + 3, 0.5) * 0.5, 0.22, back) - 0.1 * step);
    setArm(T, 1, lerp(lerp(lerp(b(ARM_R, 1.0), 1.65, p), 0.75, f), 0.5, back), lerp(lerp(lerp(b(ARM_R + 1, 0.3), 0.22, p), 0.05, f), 0.45, back), lerp(lerp(lerp(b(ARM_R + 2, 0.2), 0.08, p), 0.9, f), 0.5, back));
    setArm(T, -1, lerp(lerp(lerp(b(ARM_L, 0.9), 0.2, p), -0.3, f), 0.5, back), lerp(lerp(b(ARM_L + 3, 0.9), 0.6, p), 0.8, back), lerp(lerp(b(ARM_L + 1, 0.3), 0.55, p), 0.5, back));
    T[ARM_R + 3] = lerp(lerp(lerp(b(ARM_R + 3, 1.0), 0.15, p), 0.6, f), 0.8, back);
    T[ARM_R + 4] = lerp(b(ARM_R + 4, 0), -0.3, p) * (1 - f);       // the wrist snaps through
    // the left foot steps through, the right pushes off its toes
    T[LEG_L] += 0.5 * step; T[LEG_L + 3] += 0.12 * step; T[LEG_R] -= 0.28 * step; T[LEG_R + 3] += 0.3 * step; T[LEG_R + 4] += 0.5 * step;
    T[LEG_L + 1] += 0.1; T[LEG_R + 1] += 0.1;
    T[SX] = lerp(lerp(b(SX, 0.22), 0.55, p), 0.12, back); T[CY] = lerp(b(CY, 0.2), -0.32, p) * (1 - back); T[PY] = -0.1 * p * (1 - back); T[HX] = -0.12 * step;
    // out of the hold: the whole pose eases from the hold's last one, the hands do not start in mid-air
    const w = 1 - sm(u / 0.1);
    if (ok && w > 0) mix(T, h, w);
  }

  // 0..1 while the set keeper's hands are going to an incoming ball: the animator can hold the set pose's weight up by it
  const gkReach = (st) => (st && st.gk ? st.gk : CUR).rW;
  // metres the set keeper's pelvis would be lifted for a ball above his reach (0 when none): optional, for a hop in the animator
  // the chest height a held ball is drawn at (ball3d.js), NaN when the keeper's clips have not given one in the last 0.1 s
  const gkHugY = (sim) => {
    let g = null;
    for (let i = 0; i < ALL.length; i++) if (ALL[i].sim === sim) g = ALL[i];
    if (!g) return NaN;
    const sc = fin(R3D.Player && R3D.Player.KEEPER_SCALE, 1);
    return clock() - g.hugT < 0.1 && g.hugW > 0.005 ? lerp(1.12 * sc, g.hug, g.hugW) : NaN;
  };
  // the held ball's hug point relative to the keeper's sim position, out = [x, y, z] (world axes, metres): the chest as the pose has it
  // in the air or on the turf, easing to ball3d's standing hug (`dx`, `dz` = the standing offset) as he is back on his feet. False when
  // there is nothing to follow (then ball3d keeps its own).
  const gkHug = (sim, out, dx, dz) => {
    let g = null;
    for (let i = 0; i < ALL.length; i++) if (ALL[i].sim === sim) g = ALL[i];
    if (!g || !(clock() - g.hugT < 0.1 && g.hugW > 0.005)) return false;
    const sc = fin(R3D.Player && R3D.Player.KEEPER_SCALE, 1);
    out[0] = lerp(dx, g.hugX, g.hugW); out[1] = lerp(1.12 * sc, g.hug, g.hugW); out[2] = lerp(dz, g.hugZ, g.hugW);
    return true;
  };
  const gkHop = (st) => (st && st.gk ? st.gk : CUR).hop;
  Object.assign(Clips, { gkReach, gkHop, gkHugY, gkHug, gkSet: clipGkSet, gkDive: clipGkDive, gkGround: clipGkGround, gkHold: clipGkHold, gkChip: clipGkChip, gkThrow: clipGkThrow, gkSlide: clipGkSlide });
})();
