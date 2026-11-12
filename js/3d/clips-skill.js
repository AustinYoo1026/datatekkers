/* ISO FOOTBALL 3D — skill-move clips (the 11 tricks) and the fake shot.
   Pure pose clips for the animator (js/3d/anim3d.js): each writes the target pose T (Float32Array of AnimKit.N channels) from the
   sim clocks in pv. See js/3d/animkit.js for the channel layout and helpers, and anim3d.js for how clips are layered and eased.

   How a trick is built
     - The move is authored into a scratch pose P as a continuous function of its clock u (0..1): body channels as keyframed
       curves, the feet as positions in the body frame (right, forward, height above the turf) that place() turns into leg
       channels with an analytic two-bone solve. Nothing switches on a threshold of u.
     - The ball's place in the body frame comes from the same formulas the sim drives it with (game.js SKFN, replicated in
       skBall) pushed through ball3d's owned-ball mapping (R3D.Ball.reach), so the working foot is authored ON the ball at
       the moments the sim moves it; st.touchSide / touchW / touchSole then ask the animator's IK for the last centimetres.
       An optional 4th argument (the ball as drawn, r3d.js `bv`) replaces the model with the real thing when it is passed.
     - The move is authored from u = 0 to u = 1 as it stands: the animator cross-fades from the pose before it (and its feet are
       planted where the move leaves them), so there is no entry / exit envelope. The moves end in a stride
       of their own; finish() keeps the gait fit of the animator at the live phase (pv.runPh) for a foot nobody authored.
     - A planted foot stays put on the turf (the animator holds it there), so a move that carries the body metres is authored as real strides:
       autoStride() runs a gait over the body's path (bodyPath, from the sim's own velocities) for both feet: a foot lands, stays planted until it is
       about to over-reach, lifts and lands ahead; the two take turns; a foot that works the ball has a reserved window (it is lifted at its start and
       lands after its end). Each move then places the working foot by hand inside its window (foot / planBall) and hands it over to the plan
       (mixPlan, ballWalk), and the other foot simply follows the plan (walk). stepFoot() turns a plan into a body-frame foot with a swing arc.
     - Every foot is kept out of the ball (clear()) unless it is the one touching it; the touching foot is authored where the
       animator's foot-on-ball solve would put it (ipt()), and the request only nudges it.
     - Foot pitch is solved against the actual bone chain (footX): the thigh's abduction tilts the knee hinge, so the sum of the
       x angles is not a flat foot. Reach ends in a soft limit, never a straight leg.
     - The body's yaw is the animator's (pv.yaw, eased): the roulette's spin and the drag back's turn are not in the pose. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const A = R3D.AnimKit, Clips = (R3D.Clips = R3D.Clips || {});
  const { PI, TAU, clamp, lerp, sm, seg, fin, wrap, setArm, arm, leg } = A;
  const { RX, LIFT, RZ, RYAW, PITCH, ROLL, PX, PY, PZ, SX, CX, CY, CZ, HX, HY, ARM_L, ARM_R, LEG_L, GROUND } = A.CH;

  // ---------------------------------------------------------------- shared state of one clip call (no allocation per frame)
  const P = new Float32Array(A.N);
  // rig proportions of player3d.js (a 1.8 m player; scaled per actor by gH / gW)
  const GRD = 0;   // the body's ground contact (anim3d) is off in the moves: the feet are authored on the turf and the hops are authored too
  const THIGH = 0.44, SHIN = 0.42, HIPX = 0.10, HIPY = -0.02, PELY = 0.96, SOLE = 0.08;
  const BR = (R3D.K && R3D.K.ballR) || 0.11, PX_M = (R3D.K && R3D.K.S) || 0.05;
  let gH = 1, gW = 1, gLP = 0, gLR = 0;          // actor scale; the animator's additive lean (pitch, roll) on top of the pose
  let bR = 0, bF = 0.42, bH = BR;                // the ball in the body frame: right, forward, height of its centre (m)
  let mR = 0, mF = 0, mH = 0;                    // scratch of the ball model
  let turn = 0;                                  // how far the sim has turned the body to its right since the move began (rad)
  let vx = 0, vy = 0, vz = 0;                    // scratch vector
  const FT = new Float32Array(14);               // authored feet, 7 per leg (left, right): right, forward, height, toe-out, toe-down, crossing allowance, set
  const CROSS = new Float32Array(2);             // per leg: 1 = place() reached its target without crossing the other leg or overstretching
  let tSide = 0, tW = 0, tSole = false;          // the foot-on-ball request of this call
  let gEnt = false, gU = 0, gE = null;                      // finish(): keep the feet the run had down planted at the start of a move; the move's clock
  const entSw = new Uint8Array(2), EP = new Float32Array(4), FR = new Float32Array(2), FF = new Float32Array(2), FH = new Float32Array(2);

  const hump = (u, a, b) => { const s = Math.sin(PI * seg(u, a, b)); return s * s; };              // 0 at a and b, 1 midway, C1
  const win = (u, a, b, c, d) => sm(seg(u, a, b)) * (1 - sm(seg(u, c, d)));                         // 0 -> 1 over a..b, 1 -> 0 over c..d
  // ankle height of a foot going from the turf (lo) onto the top of the ball (hi) by k: it rises first, so it comes down on the ball
  const onto = (lo, hi, k) => lerp(lo, hi, k) + 0.09 * Math.sin(PI * k);
  // the owned-ball mapping of ball3d.js (sim offset length -> drawn length, metres); the copy is only for when it is not loaded
  function reach(d) {
    const f = R3D.Ball && R3D.Ball.reach;
    if (f) return f(d);
    if (!(d > 0)) return 0;
    const D = (d * d) / (0.8 + d), q = D / 0.75, q2 = q * q;
    return d - D / Math.sqrt(Math.sqrt(1 + q2 * q2));
  }

  function begin(pv, st) {
    P.set(A.REST);
    const rg = st.rig, lk = pv.sim && pv.sim.def && pv.sim.def.look;
    gH = fin(rg ? rg.h : lk ? lk.h : 1, 1); gW = fin(rg ? rg.w : lk ? lk.w : 1, 1);
    gLP = 0.5 * fin(st.leanP, 0); gLR = fin(st.leanR, 0) + fin(st.bank, 0);
    FT.fill(0); CROSS[0] = CROSS[1] = 1; tSide = 0; tW = 0; tSole = false;
  }
  // undo an Euler XYZ rotation (a, b, c) on the scratch vector
  function unrot(a, b, c) {
    let s = Math.sin(a), k = Math.cos(a);
    const y1 = vy * k + vz * s, z1 = -vy * s + vz * k;
    s = Math.sin(b); k = Math.cos(b);
    const x2 = vx * k - z1 * s, z2 = vx * s + z1 * k;
    s = Math.sin(c); k = Math.cos(c);
    vx = x2 * k + y1 * s; vy = -x2 * s + y1 * k; vz = z2;
  }
  // three.js Euler XYZ rotation matrices (row-major 3x3), for the foot pitch below
  const M0 = new Float64Array(9), M1 = new Float64Array(9), M2 = new Float64Array(9), M3 = new Float64Array(9);
  function eul(o, x, y, z) {
    const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z), ae = a * e, af = a * f, be = b * e, bf = b * f;
    o[0] = c * e; o[1] = -c * f; o[2] = d; o[3] = af + be * d; o[4] = ae - bf * d; o[5] = -b * c; o[6] = bf - ae * d; o[7] = be + af * d; o[8] = a * c;
  }
  function mul(o, A, B) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; }
  // Foot channel that makes the sole pitch `toe` (down positive) in the world, given the leg already solved. The thigh's abduction and
  // twist tilt the knee's hinge, so the sum of the x angles (sw - kn) is not a flat foot; this follows the actual bone chain.
  function footX(sd, sw, ab, tw, kn, toe) {
    eul(M0, P[PITCH] + gLP, -P[RYAW], P[ROLL] + gLR); eul(M1, P[PX], -P[PY], P[PZ]); mul(M2, M0, M1);
    eul(M0, -sw, -sd * tw, -sd * ab); mul(M1, M2, M0); eul(M0, kn, 0, 0); mul(M3, M1, M0);
    const a = -M3[4], b = M3[5], R = Math.hypot(a, b), al = Math.atan2(b, a), nom = sw - kn;
    if (R < 1e-3) return toe + nom;
    const t = Math.asin(clamp(-Math.sin(toe) / R, -1, 1)), x1 = wrap(t - al), x2 = wrap(PI - t - al);
    return Math.abs(wrap(x1 - nom)) < Math.abs(wrap(x2 - nom)) ? x1 : x2;
  }
  // Put the ankle of leg sd at (r right, f forward, h up) in the body frame, given the root / pelvis channels already in P.
  // tw = toe-out twist, toe = toe-down pitch of the foot (0 = flat). `in` = how far the foot may cross the centre line (m).
  function place(sd, r, f, h, tw, toe, inn) {
    const lim = -inn, out = r * sd, ci = sd > 0 ? 1 : 0;
    if (out < lim) { CROSS[ci] = 1 - sm((lim - out) / 0.18); r = lim * sd; }
    vx = P[RX] - r; vy = h - P[LIFT]; vz = f - P[RZ];
    unrot(P[PITCH] + gLP, -P[RYAW], P[ROLL] + gLR);
    vy -= PELY * gH;
    unrot(P[PX], -P[PY], P[PZ]);
    const o = sd > 0 ? -1 : 1, th = THIGH * gH, sh = SHIN * gH;
    let dx = (vx - o * HIPX * gW) * o, dy = vy - HIPY * gH, dz = vz;
    // reach: a soft limit (the knee angle is a square root of the slack, so a hard stop at a straight leg makes the knee jump)
    const L = Math.hypot(dx, dy, dz) || 1, Lm = (th + sh) * 0.985, L0 = 0.9 * Lm, Lc = Math.max(0.36 * gH, L < L0 ? L : L0 + (Lm - L0) * (1 - Math.exp(-(L - L0) / (Lm - L0)))), k = Lc / L;
    if (k < 1) CROSS[ci] = Math.min(CROSS[ci], 1 - sm((L - Lc) / 0.2));
    dx *= k; dy *= k; dz *= k;
    const kn = Math.acos(clamp((Lc * Lc - th * th - sh * sh) / (2 * th * sh), -1, 1));
    const L1 = th + sh * Math.cos(kn), q = sh * Math.sin(kn), st = Math.sin(tw), ct = Math.cos(tw);
    const ab = Math.asin(clamp((dx + q * st) / (L1 * ct), -0.92, 0.92));
    const sw = Math.atan2(dz, -dy) - Math.atan2(-L1 * Math.sin(ab) * st - q * ct, L1 * Math.cos(ab));
    const b = leg(sd);
    P[b] = sw; P[b + 1] = ab; P[b + 2] = tw; P[b + 3] = kn; P[b + 4] = footX(sd, sw, ab, tw, kn, toe);
  }
  function bothArms(sw, el, ab) { setArm(P, 1, sw, el, ab); setArm(P, -1, sw, el, ab); }
  // author a foot: ankle at (r right, f forward, h up) in the body frame; inn = how far it may cross the centre line (m)
  function foot(sd, r, f, h, tw, toe, inn) {
    const o = sd > 0 ? 7 : 0;
    FT[o] = r; FT[o + 1] = f; FT[o + 2] = h; FT[o + 3] = tw; FT[o + 4] = toe; FT[o + 5] = inn === undefined ? 0.1 : inn; FT[o + 6] = 1;
  }
  // Where the animator's foot-on-ball solve (anim3d.js touchPoint) puts the ankle of foot sd: the instep / inside against the side
  // of the ball that faces that hip, or the sole on top. Authoring the foot there makes the request seamless.
  // w: the weight the touch request will have; below it the foot is held 7 cm further off so a ball that is still arriving meets it.
  let tR = 0, tF = 0, tH = 0;
  function ipt(sd, sole, w) {
    const e = 0.07 * gH * (1 - clamp(w === undefined ? 1 : w, 0, 1));
    if (sole) { tR = bR; tF = bF - 0.1 * gH - e; tH = bH + BR + 0.075 * gH + 0.5 * e; return; }
    let ux = sd * HIPX * gW - bR, uz = -bF;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    tR = bR + ux * (BR + 0.05 * gH + e); tH = bH - BR + 0.12 * gH; tF = bF + uz * (BR + lerp(0.06, 0.17, sm(0.5 - 2 * uz)) * gH + e) - 0.06 * gH * Math.abs(ux);
  }
  // keep the boot out of the ball: when the heel-toe line of an ankle at (r, f, h) comes closer to the ball's centre than the boot
  // and the ball allow, the ankle is pushed straight away (up when the boot is above the centre, else along the turf). out: vx = right, vy = forward, vz = height.
  // k scales the push (the foot that is meant to touch the ball gets less of it).
  function clear(r, f, h, k) {
    vx = r; vy = f; vz = h;
    if (k <= 0) return;
    const g = gH, z0 = f - 0.06 * g, ln = 0.25 * g, y = h - 0.04 * g, t = clamp((bF - z0) / ln, 0, 1);
    const dx = r - bR, dy = y - bH, dz = z0 + ln * t - bF, d = Math.hypot(dx, dy, dz), c = BR + 0.075 * g;
    if (d >= c) return;
    // the direction is biased upward so it stays defined (and continuous) when the ball is on the boot
    const nx = dx, ny = dy + 0.6 * c, nz = dz, m = Math.hypot(nx, ny, nz), p = (c - d) * k / m;
    vx = r + nx * p; vy = f + nz * p; vz = Math.max(h + ny * p, SOLE * g);
  }
  // The feet are authored on the ball already, so the request only nudges the last centimetres.
  function touch(side, w, sole) { tSide = side; tW = w; tSole = !!sole; }
  // Write the pose: w = 1 the authored move, w = 0 the stride the run shows just before and after: a fit of the locomotion
  // layer's dribbling stride (anim3d.js) at the live phase, k = 0 jog .. 1 sprint.
  function finish(T, pv, st, w, k, wf) {
    const q = fin(pv.runPh, 0), sl = Math.sin(q), R = A.REST;
    for (let i = 0; i < LEG_L; i++) {
      let r = R[i];
      if (i === ARM_L) r = -0.08 + (0.43 + 0.23 * k) * sl; else if (i === ARM_R) r = -0.08 - (0.43 + 0.23 * k) * sl; else if (i === ARM_L + 3 || i === ARM_R + 3) r = 1.2 + 0.3 * k;
      else if (i === ARM_L + 1 || i === ARM_R + 1) r = 0.29 + 0.05 * k; else if (i === SX) r = 0.16 + 0.12 * k; else if (i === PY) r = -(0.13 + 0.05 * k) * sl; else if (i === CY) r = (0.21 + 0.08 * k) * sl; else if (i === HX) r = 0.13 - 0.06 * k;
      P[i] = r + (P[i] - r) * w;
    }
    P[GROUND] = 1 + (P[GROUND] - 1) * w;
    let lowest = 1e3;
    for (let n = 0; n < 2; n++) {
      const sd = n ? 1 : -1, o = n * 7, ph = n ? q + PI : q, x = ((ph - 0.4) % TAU + TAU) % TAU, up = x < 4.9 ? Math.sin(PI * x / 4.9) : 0, a = FT[o + 6] * (wf === undefined ? w : wf);
      let fr = lerp(sd * 0.11 * gW, FT[o], a), ff = lerp(-0.38 * Math.sin(ph) * gH, FT[o + 1], a), fh = lerp((0.08 + (0.27 + 0.08 * k) * up) * gH, FT[o + 2], a);
      if (gEnt && a > 0.99 && !entSw[n]) {
        // a foot that was down in the run stays where it came down (world-fixed), rises first and only then travels to the authored place
        plant(EP, 0, gU0, 2, gE[n * 3] / gW, gE[n * 3 + 1] / gH); stepFoot(EP, 1, 1, gU);
        const kt = sm(seg(gU - gU0, 0, 0.07)), kh = sm(seg(gU - gU0, 0.035, 0.13));
        fr = lerp(sR, fr, kh); ff = lerp(sF, ff, kh); fh = lerp(SOLE * gH, fh, kt);
      }
      if (gEnt) fh += 0.045 * gH * sm(seg(gU, 0.93, 1));      // the animator freezes a planted boot in the body frame for a frame at the cut: a boot that is lifting slides on nothing
      FR[n] = fr; FF[n] = ff; FH[n] = fh;
    }
    for (let n = 0; n < 2; n++) {
      const sd = n ? 1 : -1, o = n * 7, ph = n ? q + PI : q, x = ((ph - 0.4) % TAU + TAU) % TAU, up = x < 4.9 ? Math.sin(PI * x / 4.9) : 0, a = FT[o + 6] * (wf === undefined ? w : wf);
      lowest = Math.min(lowest, FH[n]);
      clear(FR[n], FF[n], FH[n], tSide === sd ? 1 - tW : 1);
      place(sd, vx, vy, vz, FT[o + 3] * a, lerp(0.3 * up, FT[o + 4], a), lerp(0.1, FT[o + 5], a));
    }
    // both boots off the turf: the body is in flight, so the animator's ground contact must not pull it down to the lower one
    P[GROUND] = Math.min(P[GROUND], GRD);
    T.set(P);
    if (tSide) { st.touchSide = tSide; st.touchW = clamp(tW * CROSS[tSide > 0 ? 1 : 0], 0, 1); st.touchSole = tSole; }
  }
  // 0 jog .. 1 sprint, as the locomotion layer grades a speed
  function gaitK(pv, sp) { const jog = Math.max(0.5, fin(pv.jog, 5)), top = Math.max(jog + 0.1, fin(pv.top, 7.5)); return clamp((sp - jog) / (top - jog), 0, 1); }

  // ---------------------------------------------------------------- where the sim puts the ball (game.js SKFN, sim px, move frame)
  // The sim also keeps an owned ball 8 px off its owner's centre: a move that drives the ball straight through the body
  // (heel, rainbow, drag back) holds it on that circle and hops it to the other side as the drive crosses the middle.
  // `fast`: the owner outruns the ball's catch-up speed, so once behind him it stays pinned there (the heel at a run).
  function skBall(id, u, s, fast) {
    let F = 16, R = 0, Z = 0;
    if (id === 'stepover') { F = 17; R = 3.5 * Math.sin(u * PI * 4); }
    else if (id === 'feint') R = u < 0.45 ? -5 * seg(u, 0, 0.45) : lerp(-5, 7, seg(u, 0.45, 1));
    else if (id === 'knock') F = lerp(15, 34, sm(u));
    else if (id === 'roll') { F = 12; R = 5 + 8 * Math.sin(u * PI); }
    else if (id === 'croqueta') { F = 14; R = lerp(-9, 10, sm(u)); }
    else if (id === 'roulette') { F = 13 * Math.cos(u * TAU); R = 13 * Math.sin(u * TAU); }
    else if (id === 'elastico') R = u < 0.45 ? -17 * sm(seg(u, 0, 0.45)) : lerp(-17, 20, sm(seg(u, 0.45, 0.75)));
    else if (id === 'heel') F = u < 0.35 ? lerp(15, -7, seg(u, 0, 0.35)) : fast ? -7 : lerp(-7, 44, sm(seg(u, 0.35, 1)));
    else if (id === 'rainbow') {
      const w = seg(u, 0.28, 1);
      F = u < 0.28 ? lerp(15, -11, seg(u, 0, 0.28)) : lerp(-11, 62, w);
      Z = u < 0.28 ? 10 * seg(u, 0.1, 0.28) : 10 + 58 * Math.sin(PI * w) - 10 * w;
    } else if (id === 'dragback') F = lerp(16, -13, sm(seg(u, 0, 0.7)));
    if (R === 0) { const a = Math.abs(F); F = (F < 0 ? -1 : 1) * Math.max(a, 8 * sm(a / 2)); }
    mF = F; mR = R * s; mH = Z;
  }
  // sim offset (px, in a frame turned by dl from the drawn body) -> the drawn ball in the body frame (m), into mR / mF / mH
  function toBody(dl) {
    const c = Math.cos(dl), s = Math.sin(dl), f = (mF * c + mR * s) * PX_M, r = (-mF * s + mR * c) * PX_M, z = mH * PX_M, d = Math.hypot(f, r);
    let k = 1;
    if (d > 1e-4) { const g = reach(d) / d; k = g + (1 - g) * sm(clamp((z - 0.2) / 0.8, 0, 1)); }      // a lifted ball fades back to the raw offset (ball3d)
    mF = f * k; mR = r * k; mH = z + BR;
  }
  // where the model puts the ball at clock uq (body frame, m; the sim's offset through ball3d's mapping): mR, mF, mH
  function ballAt(id, uq) { skBall(id, uq, gS, gFast); toBody(gDl); }
  // the ball as drawn, in the body frame, when the animator hands it over and this player has it
  function drawnBall(pv, st, bv) {
    if (!bv || !(bv.owner === pv.idx || bv.owner === undefined) || bv.held) return false;
    const dx = fin(bv.x, 0) - fin(pv.x, 0), dz = fin(bv.z, 0) - fin(pv.z, 0), c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    bF = dx * s + dz * c; bR = -dx * c + dz * s; bH = fin(bv.y, 0) + BR;
    return Math.hypot(bF, bR) < 2.5;
  }
  // fills bR / bF / bH for skill id at clock u
  function skillBall(pv, st, id, u, s, bv) {
    const sk = pv.sim && pv.sim.skill;
    // yaw of the move's frame: the sim's a0 when it is there, else rebuilt from how the move turns the body
    const y0 = sk && typeof sk.a0 === 'number' && sk.id === id ? PI - sk.a0
      : fin(pv.yaw, 0) + (id === 'roulette' ? s * u * TAU : id === 'dragback' ? -PI * sm(seg(u, 0.3, 1)) : 0);
    const dl = wrap(y0 - st.yaw), fast = !(sk && sk.v0 + 90 < 235);
    turn = wrap(y0 - fin(pv.yaw, 0));
    skBall(id, u, s, fast); toBody(dl);
    gDl = dl; gFast = fast; gS = s;
    const lR = mR, lF = mF, lH = mH;
    if (drawnBall(pv, st, bv)) { skBall(id, u, s, fast); toBody(dl); bR += lR - mR; bF += lF - mF; bH += lH - mH; }
    else { bR = lR; bF = lF; bH = lH; }
  }


  // ---------------------------------------------------------------- footfalls: where the body goes, and feet that stay put on the turf
  // The sim carries the body along its move velocity (game.js SKFN: vf forward, vs sideways, px/s). A foot that is planted must
  // therefore slide back through the body frame at that speed, and a move that travels metres needs real steps. BT is the
  // body's travel (m, right / forward, in the move's frame) at 32 knots of u; a plant is a foot that lands at (r, f) in the body
  // frame at u = a, stays at that world point until b, and swings (sine arc) to the next plant.
  const BT = new Float32Array(66), PLA = new Float32Array(40), PLB = new Float32Array(40);
  let gRot = false, gDl = 0, gSg = 1, gFast = false, gS = 1;     // roulette: the plans are in the move's frame, the body is drawn turned by gDl from it
  let swK = 0;     // 0..1: the swing's lift arc, a sine (0) or a plateau that stays up until close to the landing (1)
  let swE = 0;     // 0..1: how much a swing's progress is linear instead of smoothstep (a fast move needs a flatter foot speed)
  let sR = 0, sF = 0, sK = 0, sL = 0, sX = 0, sQ = -1, bTr = 0, bTf = 0;     // stepFoot out: body-frame right / forward, swing arc 0..1, swing length (m); bodyAt out
  function bodyVel(id, u, v0) {                                // px/s: vx = forward, vy = toward the move's side
    switch (id) {
      case 'feint': vx = v0; vy = u < 0.45 ? -105 : 265; break;
      case 'roll': vx = v0 * 0.6; vy = 205; break;
      case 'croqueta': vx = v0 * 0.45 + 70; vy = 310; break;
      case 'elastico': vx = v0 * 0.6; vy = u < 0.45 ? -65 : 285; break;
      case 'knock': vx = v0 + 170 * sm(u); vy = 0; break;
      case 'stepover': vx = v0 * 0.85; vy = 0; break;
      case 'rainbow': vx = Math.max(v0, 130); vy = 0; break;
      case 'heel': vx = v0 + 90; vy = 0; break;
      case 'roulette': vx = Math.max(v0, 120); vy = 45 * Math.sin(u * PI); break;
      case 'dragback': vx = lerp(v0 * 0.5, -100, sm(seg(u, 0, 0.6))); vy = 0; break;
      case 'nutmeg': vx = v0 + 80; vy = u < 0.55 ? 200 : -150; break;
      default: vx = v0; vy = 0;
    }
  }
  function bodyPath(pv, id, s) {
    const sim = pv.sim && pv.sim.skill, def = sim && sim.def, jog = fin(pv.jog, 9.76) / PX_M;
    const v0 = sim && sim.v0 > 0 ? sim.v0 : jog, dur = fin(sim && sim.dur, fin(def && def.dur, 0.3));
    gDur = dur; let r = 0, f = 0; BT[0] = BT[1] = 0;
    for (let j = 0; j < 32; j++) { bodyVel(id, (j + 0.5) / 32, v0); f += vx * PX_M * dur / 32; r += s * vy * PX_M * dur / 32; BT[j * 2 + 2] = r; BT[j * 2 + 3] = f; }
  }
  function bodyAt(u) {
    const x = clamp(u, 0, 1) * 32, j = Math.min(31, x | 0), k = x - j;
    bTr = lerp(BT[j * 2], BT[j * 2 + 2], k); bTf = lerp(BT[j * 2 + 1], BT[j * 2 + 3], k);
  }
  function plant(A, i, a, b, r, f) { A[i * 4] = a; A[i * 4 + 1] = b; A[i * 4 + 2] = r; A[i * 4 + 3] = f; }
  // the foot of plan A (n plants, r in metres toward the move's side times sg) at u: sR / sF in the body frame, sK the swing arc
  function stepFoot(A, n, sg, u) {
    let i = 0;
    while (i < n - 1 && u >= A[(i + 1) * 4]) i++;
    bodyAt(A[i * 4]); const wr = bTr + A[i * 4 + 2] * sg * gW, wf = bTf + A[i * 4 + 3] * gH;
    let r = wr, f = wf; sK = 0; sL = 0; sQ = -1; sX = i > 0 ? 1 : 0;       // sX: how far the swing out of plant 0 has gone (1 once the first plant is behind it): where a head start in height dies away
    if (i < n - 1 && u > A[i * 4 + 1]) {
      const j = i + 1; bodyAt(A[j * 4]); const nr = bTr + A[j * 4 + 2] * sg * gW, nf = bTf + A[j * 4 + 3] * gH;
      const x = (u - A[i * 4 + 1]) / Math.max(1e-3, A[j * 4] - A[i * 4 + 1]), e = lerp(sm(x), x, swE);
      r = lerp(wr, nr, e); f = lerp(wf, nf, e); sQ = clamp(x, 0, 1); sX = i > 0 ? 1 : sQ; sK = lerp(Math.sin(PI * clamp(x, 0, 1)), win(x, 0, 0.3, 0.7, 1) * (0.85 + 0.15 * Math.sin(PI * clamp(x, 0, 1))), swK); sL = Math.hypot(nr - wr, nf - wf);
    }
    bodyAt(u); sR = r - bTr; sF = f - bTf;
    if (gRot) { const c = Math.cos(gDl), q = gSg * Math.sin(gDl), rr = sR * c - sF * q; sF = sF * c + sR * q; sR = rr; }      // a move that turns the body: the move's frame to the drawn body's
  }
  // The run the move grows out of: the animator hands its drawn legs over at the clip's first frame, so a foot that is down in the run must
  // stay where the run put it (entryRun() reads the run's feet from the pose the locomotion layer left in T) or it slides over the turf as the
  // offset dies away. autoStride() starts both feet from there; finish() keeps a foot that stood in the run planted until it has risen.
  const STRIDE_M = ((globalThis.ISO && ISO.C && ISO.C.STRIDE) || 44) * PX_M;
  let ePh = 0, eK = 0, gU0 = 0;
  // inverse of place(): the ankle of leg sd (right, forward, height) in the body frame from the leg and pelvis channels of pose Q -> vx, vy, vz
  function rot(a, b, c) {
    let s = Math.sin(c), k = Math.cos(c);
    const x2 = vx * k - vy * s, y1 = vx * s + vy * k;
    s = Math.sin(b); k = Math.cos(b);
    const x1 = x2 * k + vz * s, z1 = -x2 * s + vz * k;
    s = Math.sin(a); k = Math.cos(a);
    vx = x1; vy = y1 * k - z1 * s; vz = y1 * s + z1 * k;
  }
  function fk(Q, sd) {
    const b = leg(sd), sw = Q[b], ab = Q[b + 1], tw = Q[b + 2], kn = Q[b + 3], th = THIGH * gH, sh = SHIN * gH, o = sd > 0 ? -1 : 1;
    const L1 = th + sh * Math.cos(kn), q = sh * Math.sin(kn), st = Math.sin(tw), ct = Math.cos(tw), dx = L1 * Math.sin(ab) * ct - q * st;
    const ga = sw + Math.atan2(-L1 * Math.sin(ab) * st - q * ct, L1 * Math.cos(ab)), rr = Math.sqrt(Math.max(0, th * th + sh * sh + 2 * th * sh * Math.cos(kn) - dx * dx));
    vx = dx * o + o * HIPX * gW; vy = -rr * Math.cos(ga) + HIPY * gH; vz = rr * Math.sin(ga);
    rot(Q[PX], -Q[PY], Q[PZ]); vy += PELY * gH; rot(Q[PITCH] + gLP, -Q[RYAW], Q[ROLL] + gLR);
    vx = Q[RX] - vx; vy += Q[LIFT]; vz += Q[RZ];
  }
  // The run's feet at the first frame of the move (the pose the locomotion layer left in T): where each is, and whether it is down. Kept in st.skE.
  function entryRun(pv, st, id, u, k, Q) {
    const q = fin(pv.runPh, 0), E = st.skE || (st.skE = new Float32Array(6));
    if (st.skId !== id || !(u >= st.skU - 1e-6)) {
      st.skPh = q;
      // a foot the run had planted was drawn one frame ago where the body's last step puts it (the cut freezes the drawn foot in the body frame)
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), df = fin(st.mdx, 0) * sy + fin(st.mdz, 0) * cy, dr = -(fin(st.mdx, 0) * cy - fin(st.mdz, 0) * sy);
      for (let n = 0; n < 2; n++) { fk(Q, n ? 1 : -1); const dn = 0; E[n * 3] = vx + dr * dn; E[n * 3 + 1] = vz + df * dn; E[n * 3 + 2] = vy; }
      st.skU0 = u;
    }
    st.skId = id; st.skU = u; ePh = st.skPh; eK = k; gU0 = 0;
    for (let n = 0; n < 2; n++) entSw[n] = E[n * 3 + 2] > (SOLE + 0.035) * gH ? 1 : 0;
  }
  // The stride the body's path asks of two feet. The sim carries the body metres along its path while a trick is played, so a foot that is
  // planted must be lifted and put down ahead again before it over-reaches, and the two feet take turns (one is down while the other
  // swings). autoStride() runs that gait over the path and writes plans (PLA: left foot, PLB: right foot) for stepFoot(). A foot that has a
  // reserved window [ta, tb] (it works the ball there) is lifted at ta and comes down after tb. Plans are in the move's frame.
  const AWA = [PLA, PLB], AWN = new Uint8Array(2), AWS = new Uint8Array(2), AWT = new Float32Array(2), AWR = new Float32Array(2), AWF = new Float32Array(2), AWL = new Float32Array(2), AWLR = new Float32Array(2), AWLF = new Float32Array(2);
  let gDur = 0.3;
  function awTarget(n, L) {          // where foot n comes down at clock L, in the body frame at L: home plus a stride's lead along the body's way
    bodyAt(L - 0.01); const r0 = bTr, f0 = bTf; bodyAt(L + 0.01);
    const dr = bTr - r0, df = bTf - f0, d = Math.hypot(dr, df);
    const sd = n ? 1 : -1, rl = sd * 0.11 * gW + (d > 1e-4 ? dr / d : 0) * 0.3 * gH;
    AWL[n] = L; AWLR[n] = rl * sd > 0.05 * gW ? rl : sd * 0.05 * gW; AWLF[n] = (d > 1e-4 ? df / d : 1) * 0.3 * gH;      // a foot stays on its own side of the body
  }
  function awPush(n, a, b, r, f) { plant(AWA[n], AWN[n]++, a, b, r / gW, f / gH); }
  // E: the run's feet (st.skE) at clock ua; tsw: swing time (real s); res: [taL, tbL, taR, tbR] (ta < 0: none). Returns nothing, fills PLA / PLB / AWN.
  function autoStride(E, ua, tsw, res) {
    const du = Math.max(0.05, tsw * 0.6 / Math.max(0.1, gDur)), dl = Math.min(du, 0.14 * 0.6 / Math.max(0.1, gDur)), TRIG = 0.5 * gH, HARD = 0.62 * gH;
    for (let n = 0; n < 2; n++) {
      AWN[n] = 0; AWS[n] = 1; AWT[n] = ua; AWR[n] = E[n * 3]; AWF[n] = E[n * 3 + 1];
      if (entSw[n]) {
        const ph = n ? ePh + PI : ePh, x = (((ph - 0.4) % TAU) + TAU) % TAU, dist = Math.max(0.1, (4.9 - x) / TAU * STRIDE_M * (1 + 0.3 * eK));
        bodyAt(ua); const f0 = bTf; let ul = 1;
        for (let m = 1; m <= 64; m++) { const uu = ua + m / 64 * (1 - ua); bodyAt(uu); if (bTf - f0 >= dist) { ul = uu; break; } }
        ul = Math.min(Math.max(ul, ua + 0.04), ua + dl); awPush(n, ua, ua, AWR[n], AWF[n]); AWS[n] = 2; awTarget(n, ul);
      }
    }
    for (let k = 0; k <= 250; k++) {
      const u = ua + (1 - ua) * k / 250;
      for (let n = 0; n < 2; n++) {
        const o = 1 - n, ta = res[n * 2], tb = res[n * 2 + 1], inW = ta >= 0 && u >= ta - 1e-6 && u < tb + 0.04;
        if (AWS[n] === 2) {
          if (inW && AWL[n] < tb + 0.04 + dl) awTarget(n, tb + 0.04 + dl);
          else if (u >= AWL[n] - 1e-6) { AWS[n] = 1; AWT[n] = AWL[n]; AWR[n] = AWLR[n]; AWF[n] = AWLF[n]; }
          continue;
        }
        bodyAt(AWT[n]); const br = bTr, bf = bTf; bodyAt(u);
        const r = AWR[n] - (bTr - br), f = AWF[n] - (bTf - bf), d = Math.hypot(r - (n ? 1 : -1) * 0.11 * gW, f);
        const oW = res[o * 2] >= 0 && u >= res[o * 2] - 1e-6 && u < res[o * 2 + 1] + 0.04, down = AWS[o] === 1 && !oW;      // the other foot is on the turf
        if (inW || (d > TRIG && (down || u >= AWL[o] - 0.03) && !oW && u < 1 - 0.8 * dl) || d > HARD) {
          awPush(n, AWT[n], u, AWR[n], AWF[n]);
          AWS[n] = 2; awTarget(n, inW ? tb + 0.04 + dl : u + (down ? du : Math.min(du, dl)));
        }
      }
    }
    for (let n = 0; n < 2; n++) {
      if (AWS[n] === 2) awPush(n, AWL[n], 1, AWLR[n], AWLF[n]);
      else awPush(n, AWT[n], 1, AWR[n], AWF[n]);
    }
  }
  const RES = new Float32Array(4), TMPF = new Float32Array(7);
  let gUc = 0, gSt = null;       // the clip clock and the animator state of this call
  // reserved windows for autoStride(): foot sd1 works the ball over [a1, b1], foot sd2 over [a2, b2] (a < 0: none)
  function resv(sd1, a1, b1, sd2, a2, b2) {
    RES.fill(-1);
    if (a1 >= 0) { const i = sd1 > 0 ? 2 : 0; RES[i] = a1; RES[i + 1] = b1; }
    if (a2 >= 0) { const i = sd2 > 0 ? 2 : 0; RES[i] = a2; RES[i + 1] = b2; }
    return RES;
  }
  const hh = (i) => (entSw[i] ? Math.max(0, gSt.skE[i * 3 + 2] / gH - SOLE) : 0);      // a foot that is in flight at the first frame starts at its height
  // a foot on the stride plan
  function walk(sd, toeOut, t0) { const i = sd > 0 ? 1 : 0; planned(sd, AWA[i], AWN[i], 1, gUc, toeOut, hh(i), t0); }
  // a foot on the stride plan that goes to the ball by kt
  function ballWalk(sd, kt, r, f, h, tw, toe) { const i = sd > 0 ? 1 : 0; planBall(sd, AWA[i], AWN[i], 1, gUc, kt, r, f, h, tw, toe, hh(i)); }
  // the foot authored by foot() just before, handed over to the stride plan by k
  function mixPlan(sd, k, toeOut, t0) {
    const o = sd > 0 ? 7 : 0; for (let i = 0; i < 7; i++) TMPF[i] = FT[o + i];
    walk(sd, toeOut, t0);
    for (let i = 0; i < 6; i++) FT[o + i] = lerp(TMPF[i], FT[o + i], k);
  }
  // toe pitch of the swinging foot: down in the air, heel first onto the turf (a toe that lands first drags)
  function sToe() { return 0.35 * sK - (sQ > 0 ? 0.4 * hump(sQ, 0.55, 1) : 0); }
  // a planned foot blended toward a foot on the ball (r, f, h, toe-out, toe-down) by kt
  function planBall(sd, A, n, sg, u, kt, r, f, h, tw, toe, h0) {
    stepFoot(A, n, sg, u);
    const kx = kt * kt;      // the boot rises before it travels
    foot(sd, lerp(sR, r, kx), lerp(sF, f, kx), lerp((SOLE + sK * Math.min(0.3, 0.07 + 0.09 * sL) + (h0 || 0) * (1 - sm(sX))) * gH, h, kt), lerp(0.1, tw, kt), lerp(sToe(), toe, kt), 0.3);
  }
  // a planned foot as a body-frame foot (flat on the turf in a plant, lifted and toe-down in a swing)
  function planned(sd, A, n, sg, u, toeOut, h0, t0) {
    stepFoot(A, n, sg, u);
    foot(sd, sR, sF, (SOLE + sK * Math.min(0.3, 0.07 + 0.09 * sL) + (h0 || 0) * (1 - sm(sX))) * gH, toeOut === undefined ? 0.1 : toeOut, sToe() + (t0 || 0) * (1 - sm(sX)), 0.3);
  }

  // ---------------------------------------------------------------- the fake shot
  // A shooting wind-up (kicking leg back, opposite arm out, hips open) that comes down beside the ball instead of through it
  // and drags it across the body with the inside of the foot. The sim slides the ball along world x by fakeSide; the ball
  // follows its target on a spring, so it only really moves once the wind-up is over.
  function clipFake(T, pv, st, bv) {
    const u = clamp(fin(pv.fakeU, 0), 0, 1), fsd = (pv.fakeSide || 1) > 0 ? 1 : -1;
    const er = -Math.cos(st.yaw) * fsd, ef = Math.sin(st.yaw) * fsd;         // the drag direction in the body frame (right, forward)
    const dr = er >= 0 ? 1 : -1, fs = -dr;                                    // the foot on the side the ball starts on does it
    begin(pv, st);
    if (!drawnBall(pv, st, bv)) {
      const k = reach(19 * PX_M) * lerp(-1, 1, sm(seg(u, 0.22, 1.25)));
      bR = er * k; bF = ef * k + 0.1; bH = BR;
    }
    const wind = win(u, 0, 0.22, 0.26, 0.42), drag = sm(seg(u, 0.26, 0.42)), go = sm(seg(u, 0.4, 0.95));
    P[LIFT] = -0.05 - 0.05 * drag;
    P[RX] = dr * (-0.04 * wind + 0.07 * go);
    P[ROLL] = dr * (-0.05 * wind + 0.1 * hump(u, 0.3, 1));
    P[PY] = fs * 0.28 * wind - fs * 0.12 * hump(u, 0.35, 1); P[CY] = -fs * 0.22 * wind + fs * 0.1 * hump(u, 0.35, 1);
    P[SX] = 0.1 + 0.08 * drag - 0.06 * wind; P[CX] = 0.04;
    setArm(P, dr, 0.55 * wind - 0.2 * go, 0.5, 0.35 + 0.35 * wind + 0.2 * go);
    setArm(P, fs, -0.5 * wind + 0.25 * go, 0.55, 0.3 + 0.1 * wind + 0.25 * go);
    // standing leg under the body; kicking leg: back and up, then down to the near side of the ball and across with it
    // the body runs on at its own speed while the kick is sold: the standing foot takes the stride, the kicking foot is up from the start
    const ftm = fin(ISO.C && ISO.C.FAKE_T, 0.35), spd = fin(pv.speed, 0);
    for (let j = 0; j <= 32; j++) { BT[j * 2] = 0; BT[j * 2 + 1] = spd * ftm * j / 32; }
    gDur = ftm; gUc = u; gSt = st; entryRun(pv, st, 'fake', u, gaitK(pv, spd), T);
    autoStride(st.skE, 0, 0.18, resv(fs, 0, 0.9, 0, -1, 0)); swE = 0.4; swK = 0;
    walk(dr, 0.1);
    const b0 = sm(seg(u, 0, 0.22)), kw = win(u, 0.32, 0.44, 0.62, 0.78);
    ipt(fs, false, kw);
    foot(fs, lerp(fs * 0.13, tR, drag), lerp(-0.42 * b0, tF, drag), lerp(SOLE + 0.34 * b0, 0, drag) * gH + drag * (tH + 0.04 * gH), 0.15 + 0.4 * drag, 0.5 * wind, 0.3);
    mixPlan(fs, sm(seg(u, 0.86, 0.98)), 0.1);
    swE = 0;
    touch(fs, kw, false);
    gEnt = true; gU = u; gU0 = 0; gE = st.skE;
    finish(T, pv, st, win(u, 0, 0.14, 0.84, 1), gaitK(pv, spd));
    gEnt = false;
  }

  // ---------------------------------------------------------------- the 11 skill moves. s = move side (+1 = the player's right), m = strong foot
  function clipSkill(T, pv, st, bv) {
    const sk = pv.skill, u = clamp(fin(sk.u, 0), 0, 1), id = sk.id, s = (sk.sd || 1) > 0 ? 1 : -1, m = st.foot > 0 ? 1 : -1;
    const fl = SOLE * gH;
    begin(pv, st);
    skillBall(pv, st, id, u, s, bv);
    bodyPath(pv, id, s);
    gUc = u; gSt = st;
    { const sim0 = pv.sim && pv.sim.skill, jg = fin(pv.jog, 5); entryRun(pv, st, id, u, gaitK(pv, sim0 && sim0.v0 > 0 ? sim0.v0 * PX_M : jg), T); }

    if (id === 'stepover') {
      // double stepover: the s foot circles round the FRONT of the ball from the inside to the outside and lands wide, then the other foot
      // circles it the same way; the body sways and the shoulders dip toward each one. The ball is not touched. The body runs ~2.7 m,
      // so the foot that is not circling takes real steps: plant, short flight, plant.
      const p1 = seg(u, 0.03, 0.44), p2 = seg(u, 0.44, 0.8), h1 = Math.sin(PI * p1), h2 = Math.sin(PI * p2), w1 = h1 * h1, w2 = h2 * h2;
      P[LIFT] = -0.12 - 0.04 * hump(u, 0.36, 0.7) + 0.02 * hump(u, 0.24, 0.3) + 0.02 * hump(u, 0.7, 0.76); P[SX] = 0.2; P[CX] = 0.05;
      P[RX] = s * 0.07 * (w1 - w2); P[ROLL] = s * 0.1 * (w1 - w2); P[CZ] = s * 0.08 * (w1 - w2);
      P[PY] = -s * 0.2 * (w1 - w2); P[CY] = s * 0.3 * (w1 - w2);
      setArm(P, s, -0.35 * w1 + 0.3 * w2, 0.6, 0.45 + 0.2 * w1); setArm(P, -s, 0.3 * w1 - 0.35 * w2, 0.6, 0.45 + 0.2 * w2);
      const rho = 0.3 * gH, a1 = (-110 + 180 * sm(p1)) * PI / 180, a2 = (-110 + 155 * sm(p2)) * PI / 180;
      // the s foot circles over the ball until 0.44, then the stride takes it; the other foot takes the stride, then circles (0.44 .. 0.8)
      autoStride(st.skE, gU0, 0.18, resv(s, 0.03, 0.44, -s, 0.44, 0.8)); swE = 0.4; swK = 0;
      foot(s, bR + s * rho * Math.sin(a1) * gW, bF + rho * Math.cos(a1) * 0.8 - 0.03, fl + (0.05 + 0.11 * h1) * gH, lerp(-0.2, 0.3, sm(p1)), 0.1 * h1, 0.05);
      mixPlan(s, sm(seg(u, 0.4, 0.5)), 0.3);
      ballWalk(-s, sm(seg(u, 0.44, 0.54)) * (1 - sm(seg(u, 0.78, 0.96))), bR + s * rho * Math.sin(a2) * gW, bF + rho * Math.cos(a2) * 0.8 - 0.03, fl + (0.05 + 0.11 * h2) * gH, lerp(-0.2, 0.3, sm(p2)), 0.1 * h2);
      swE = 0; swK = 0;
    } else if (id === 'feint') {
      // drop the shoulder and lunge out onto the far foot, then drive off it and take the ball away with the outside of the s foot.
      // The body travels ~3.5 m: the far foot plants twice (a skip), the s foot swings round to the ball and lands to push off.
      const sell = 0.75 * win(u, 0, 0.3, 0.42, 0.8), go = sm(seg(u, 0.44, 0.84)), g2 = 0.8 * hump(u, 0.44, 1.05);
      P[LIFT] = -0.06 - 0.1 * sell - 0.03 * go + 0.03 * hump(u, 0.26, 0.36); P[SX] = 0.16; P[CX] = 0.04;
      P[RX] = -s * 0.1 * sell + s * 0.06 * g2; P[ROLL] = -s * 0.16 * sell + s * 0.15 * g2;
      P[CZ] = -s * 0.12 * sell; P[CY] = -s * 0.22 * sell + s * 0.15 * g2; P[HY] = -s * 0.2 * sell;
      setArm(P, -s, 0.1, 0.5, 0.5 + 0.3 * sell); setArm(P, s, -0.1 + 0.3 * go, 0.5, 0.45 + 0.3 * go);
      // the body travels ~2.4 m forward and 2 m across: both feet take real strides; the s foot is on the ball at 0.46 .. 0.54 and comes down after
      const kw = win(u, 0.46, 0.54, 0.58, 0.62), ks = win(u, 0.28, 0.46, 0.6, 0.8);
      autoStride(st.skE, gU0, 0.18, resv(s, 0.3, 0.8, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(-s, 0.25);
      ipt(s, false, kw);
      ballWalk(s, ks, tR, tF, tH + 0.1 * gH * (1 - kw * kw), -0.3 * ks, 0.2 * kw); swE = 0; swK = 0;
      touch(s, kw, false);
    } else if (id === 'knock') {
      // a shot-like swing: the strong leg goes back, the laces drive through the ball and the leg follows through, then the body is
      // already in the sprint: the torso pitches onto it and the arms pump. The body speeds up from jog to sprint (3 m), so the
      // other foot runs: plant, flight, plant.
      const bk = sm(seg(u, 0, 0.1)), sw = sm(seg(u, 0.05, 0.28)), fo = sm(seg(u, 0.26, 0.4)), rel = 0.46, kw = win(u, 0.19, 0.25, 0.28, 0.34);
      const dive = sm(seg(u, 0.12, 0.6));
      P[LIFT] = -0.07 - 0.03 * dive; P[SX] = 0.12 + 0.28 * dive; P[CX] = 0.05 + 0.08 * dive; P[PITCH] = 0.1 * dive; P[HX] = 0.13 - 0.25 * dive;
      P[PY] = -m * 0.2 * win(u, 0.04, 0.2, 0.26, 0.5); P[CY] = m * 0.25 * win(u, 0.04, 0.2, 0.26, 0.5);
      const pump = Math.sin(PI * seg(u, 0.4, 1));
      setArm(P, -m, lerp(-0.3 * bk, 0.7, sw) - 0.3 * seg(u, 0.5, 1) + 0.5 * pump, lerp(1.0, 1.25, dive), 0.25); setArm(P, m, lerp(0.3 * bk, -0.6, sw) + 0.3 * seg(u, 0.5, 1) - 0.5 * pump, lerp(1.0, 1.25, dive), 0.25);
      ipt(m, false, 1);
      const cf = Math.min(bF - 0.29, 0.42), tr = m * 0.12;
      autoStride(st.skE, gU0, 0.18, resv(m, 0, 0.42, 0, -1, 0)); swE = 0.4; swK = 0;
      // back, through the ball (laces, toe down), follow-through up and forward; then the stride takes the boot
      const r0 = lerp(lerp(m * 0.1, tr, bk), bR, sw), f0 = lerp(lerp(-0.15, -0.32, bk), cf, sw), h0 = lerp(lerp(SOLE, 0.34, bk), 0.17, sw) * gH, t0 = lerp(lerp(0, 0.6, bk), 0.5, sw);
      foot(m, lerp(r0, m * 0.1, fo), lerp(f0, Math.min(bF - 0.2, 0.5), fo), lerp(h0, 0.5 * gH, sm(seg(u, 0.27, 0.35))), 0, lerp(t0, 0.35, fo), 0.3);
      mixPlan(m, sm(seg(u, 0.4, 0.5)), 0, 0.35);
      walk(-m, 0.15);
      swE = 0; swK = 0;
      touch(m, kw, false);
    } else if (id === 'roll') {
      // the sole of the s foot sits on the ball and drags it out across the body while the standing leg hops sideways with the
      // sim's lateral travel (3 m in the move): plant, flight, plant, flight. The sole's own motion is the ball's, which swings out and back.
      const on = win(u, 0.06, 0.18, 0.66, 0.84), hop = hump(u, 0.14, 0.3) + hump(u, 0.46, 0.62) + hump(u, 0.78, 1);
      P[LIFT] = -0.09 + 0.045 * hop;
      P[SX] = 0.14; P[CX] = 0.05; P[RX] = -s * 0.06 * on; P[ROLL] = s * 0.07 * on; P[PY] = s * 0.18 * on; P[CY] = -s * 0.12 * on;
      setArm(P, -s, 0.1, 0.5, 0.5 + 0.25 * on + 0.15 * hop); setArm(P, s, -0.15, 0.45, 0.5 + 0.15 * hop);
      autoStride(st.skE, gU0, 0.18, resv(s, 0.04, 0.84, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(-s, 0.1);
      ipt(s, true, on);
      // the sole drags over the ball: out across it and back, heel to toe, so the foot is never still
      const dg = Math.sin(TAU * seg(u, 0.1, 0.9));
      ballWalk(s, on, tR + s * 0.12 * dg * gW, tF + 0.07 * gH * Math.sin(TAU * seg(u, 0.1, 0.9) + 1.2), onto(fl, tH + 0.025 * gH, on), 0.3, 0.1 + 0.15 * dg);
      swE = 0; swK = 0;
      touch(s, on * 0.0, true);
    } else if (id === 'croqueta') {
      // the body goes 3.4 m sideways in 0.22 s (22 display frames at game speed), faster than a foot can take two real steps: one push-off
      // by the s foot, a bound in which the far foot's inside knocks the ball across and then the s foot's inside takes it on, and a
      // single landing on the s foot while the far foot trails and lands last. Both taps are in the air, each a swing of 3+ frames.
      const k1 = Math.pow(hump(u, 0.1, 0.5), 2), k2 = Math.pow(hump(u, 0.4, 0.8), 2), su = sm(u), fly = hump(u, 0.1, 0.84);
      P[LIFT] = -0.1 + 0.06 * fly + 0.02 * hump(u, 0.84, 1.04);
      P[SX] = 0.16; P[CX] = 0.04; P[RX] = s * lerp(-0.07, 0.07, su); P[ROLL] = s * 0.14 * Math.sin(PI * su);
      P[PY] = s * lerp(0.15, -0.12, su); P[CY] = s * lerp(-0.1, 0.1, su);
      setArm(P, -s, -0.1, 0.45, 0.55 + 0.3 * fly); setArm(P, s, 0.1, 0.45, 0.55 + 0.3 * fly);
      autoStride(st.skE, gU0, 0.18, resv(-s, 0.05, 0.5, s, 0.4, 0.82)); swE = 0.4; swK = 0;
      // far foot: in the air from the start, ball tap at ~0.3, then the stride
      ipt(-s, false, k1);
      const fq = lerp(-0.2, 0.28, sm(u)), ff = lerp(-0.12, 0.4, sm(u)), fh = (SOLE + 0.16 * Math.sin(PI * Math.pow(u, 0.8))) * gH;
      foot(-s, lerp(s * fq * gW, tR, k1), lerp(ff, tF, k1), lerp(Math.max(fh, 0.07 * gH), tH, k1), lerp(0.2, 0.5, k1), 0.2, 0.3);
      mixPlan(-s, sm(seg(u, 0.46, 0.58)), 0.1);
      ipt(s, false, k2);
      ballWalk(s, k2, tR, tF, tH, 0.5, 0);
      swE = 0; swK = 0;
      if (u < 0.37) touch(-s, k1, false); else touch(s, k2, false);
    } else if (id === 'roulette') {
      // the s foot's sole stops the ball and drags it round as the body spins over it, then the other sole takes it through
      // the second half of the turn. Arms wide, shoulders and head leading the spin. (The spin itself is pv.yaw.)
      const kA = win(u, 0.03, 0.14, 0.38, 0.5), kB = win(u, 0.5, 0.62, 0.86, 0.97), lead = hump(u, 0, 0.95);
      P[LIFT] = -0.08 + 0.05 * hump(u, 0.26, 0.54) + 0.04 * hump(u, 0.76, 1.02); P[SX] = 0.2 - 0.1 * hump(u, 0.3, 0.85); P[CX] = 0.05;
      P[RX] = s * 0.05 * (kB - kA); P[ROLL] = s * 0.07 * lead; P[PY] = s * 0.15 * lead; P[CY] = s * 0.32 * lead; P[HY] = s * 0.3 * lead;
      bothArms(0.1, 0.25, 0.4 + 0.5 * win(u, 0, 0.15, 0.8, 1));
      // the body goes ~4 m while it turns, so the feet take real steps (in the move's frame, turned into the body's by gDl): the far foot
      // pivots first while the s foot's sole drags the ball, the s foot lands as the sole leaves the ball, and the far foot's sole takes
      // the ball through the second half and lands to run on
      gRot = true; swE = 0.4; swK = 0;
      autoStride(st.skE, gU0, 0.18, resv(s, 0.03, 0.5, -s, 0.5, 0.97));
      ipt(s, true, kA);
      ballWalk(s, kA, tR, tF, onto(fl, tH, kA), 0.1, 0.05 * kA);
      ipt(-s, true, kB);
      ballWalk(-s, kB, tR, tF, onto(fl, tH, kB), 0.1, 0.05 * kB);
      gRot = false; swE = 0; swK = 0;
      if (u < 0.51) touch(s, kA, true); else touch(-s, kB, true);
    } else if (id === 'elastico') {
      // one foot: its outside pushes the ball out the wrong way, it hops over the ball and its inside pulls it back across with the
      // body bursting after it: the working foot stays with the ball (outer side, then inner) while the s foot plants, pushes off and lands wide
      const fe = -s, on = win(u, 0.04, 0.12, 0.78, 0.9), flip = sm(seg(u, 0.3, 0.5)), arc = hump(u, 0.28, 0.52);
      const sell = 0.7 * win(u, 0, 0.25, 0.4, 0.66), go = 0.7 * hump(u, 0.42, 1.04);
      P[LIFT] = -0.1 + 0.025 * hump(u, 0.4, 0.66); P[SX] = 0.15; P[CX] = 0.04;
      P[RX] = -s * 0.08 * sell + s * 0.07 * go; P[ROLL] = -s * 0.15 * sell + s * 0.15 * go;
      P[CY] = -s * 0.2 * sell + s * 0.2 * go; P[PY] = s * 0.1 * sell - s * 0.1 * go; P[HY] = -s * 0.15 * sell;
      setArm(P, fe, 0, 0.5, 0.5 + 0.3 * sell); setArm(P, s, 0, 0.5, 0.5 + 0.3 * go);
      autoStride(st.skE, gU0, 0.18, resv(fe, 0.03, 0.9, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(s, 0.15);
      // the ball-side offset of the contact flips from the hip side to the far side as the foot goes round the front of the ball
      ipt(fe, false, on);
      ballWalk(fe, on, lerp(tR, 2 * bR - tR, flip), tF + 0.1 * gH * arc, tH + 0.1 * gH * arc, lerp(-0.25, 0.5, flip), 0.2);
      swE = 0; swK = 0;
      touch(fe, win(u, 0.04, 0.12, 0.28, 0.36), false);
    } else if (id === 'heel') {
      // the body runs on over the ball and the standing foot plants past it; the trailing strong foot hooks in behind the
      // ball, toe down, and carries it along under the body before the stride takes over. (At a run the sim keeps the
      // ball pinned just behind the player for the rest of the move; slower, it is flicked on ahead and the foot follows.)
      const pass = sm(seg(u, 0, 0.22)), hit = sm(seg(u, 0.3, 0.44)), hb = sm(clamp(-bF / 0.25, 0, 1));
      P[LIFT] = -0.07 - 0.03 * hit; P[SX] = 0.2 + 0.06 * hit; P[CX] = 0.05;
      P[PY] = m * 0.2 * hit; P[CY] = -m * 0.22 * hit; P[RX] = -m * 0.04 * hit;
      setArm(P, m, 0.5 * hit, 0.9, 0.3); setArm(P, -m, -0.45 * hit, 0.9, 0.3 + 0.15 * hit);
      // the body runs ~3 m: the standing foot is planted for the first third, swings through and lands as the stride resumes; the strong
      // foot is in the air through the hook (authored in the body's frame) and lands to carry the stride on
      autoStride(st.skE, gU0, 0.18, resv(m, 0, 0.5, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(-m, 0.05);
      // the strong foot lifts clear while the ball runs under the body, then comes down ahead of the ball with its heel to it
      // (a ball still ahead is met from behind as in any touch)
      ipt(m, false, 1);
      const hR = bR + m * 0.04, hF = bF + BR + 0.11 * gH, hH = bH + 0.04 * gH, hr = lerp(tR, hR, hb), hf = lerp(tF, hF, hb), hh = lerp(tH, hH, hb);
      foot(m, lerp(m * 0.1, hr, hit), lerp(-0.25 * pass, hf, hit), lerp(fl + 0.32 * gH * pass, hh, hit), 0, lerp(0.1 * pass, -0.4 * hb, hit), 0.3);
      mixPlan(m, sm(seg(u, 0.46, 0.56)), 0, -0.4 * hb);
      swE = 0; swK = 0;
    } else if (id === 'rainbow') {
      // the player runs on over the ball; the strong foot hooks in behind it, pins it against the back of the standing leg and rolls it
      // up, then the heel flicks it up and over the head with a small hop; the standing leg and, after the flick, both legs keep
      // the run's stride (the stride fit of finish(), so nothing stands still while the body travels 5 m).
      const pin = win(u, 0.04, 0.14, 0.3, 0.38), flick = sm(seg(u, 0.28, 0.4)), back = sm(seg(u, 0.38, 0.62)), wk = win(u, 0.04, 0.12, 0.5, 0.64);
      const crouch = hump(u, 0.02, 0.34), hop = hump(u, 0.3, 0.52);
      P[LIFT] = -0.03 - 0.07 * hump(u, 0, 0.55) + 0.02 * hop; P[GROUND] = 1;
      P[SX] = 0.15 + 0.08 * crouch - 0.12 * hump(u, 0.3, 0.6); P[CX] = 0.05 + 0.05 * flick * (1 - back); P[HX] = -0.25 * win(u, 0.3, 0.45, 0.62, 0.8);
      P[PY] = m * 0.14 * crouch; P[CY] = -m * 0.12 * crouch;
      const sw = lerp(-0.5 * sm(seg(u, 0.05, 0.28)), 0.5, flick) * (1 - back);
      bothArms(sw, 0.45, 0.35 + 0.3 * flick * (1 - back));
      // on the ground the ball is met from behind like any touch; once it climbs it rests on the strong foot's instep, which then
      // curls up behind the body (shin up, heel high) as it flicks the ball away
      const kw = win(u, 0.08, 0.18, 0.27, 0.34), ch = sm(clamp((bH - 0.22) / 0.25, 0, 1));
      ipt(m, false, kw);
      const fr = lerp(lerp(tR, clamp(bR, m * 0.12 - 0.25, m * 0.12 + 0.25), ch), m * 0.12 * gW, flick), ff = lerp(lerp(tF, Math.min(bF - 0.065 * gH, 0.4 * gH), ch), -0.3 * gH, flick);
      const fh = lerp(lerp(tH, Math.min(Math.max(bH - BR - 0.005, fl), 0.45 * gH), ch), 0.78 * gH, flick);
      autoStride(st.skE, gU0, 0.18, resv(m, 0, 0.6, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(-m, 0.05);
      foot(m, lerp(fr, m * 0.1, back), lerp(ff, -0.1, back), lerp(fh, 0.3 * gH, back), 0, lerp(lerp(0, -0.25 * ch, 1) + 0.9 * flick, 0.3, back), 0.3);
      mixPlan(m, sm(seg(u, 0.56, 0.68)), 0, 0.3);
      swE = 0; swK = 0;
      touch(m, kw * (1 - ch), false);
    } else if (id === 'dragback') {
      // the strong foot's sole pulls the ball back under the body, which sits back on the standing leg; the ball comes out
      // behind and the body turns round it with a sole still on it: the same foot when the turn is to its side, else the other
      const sm0 = pv.sim && pv.sim.skill, tx = sm0 && typeof sm0.exit === 'number' && typeof sm0.a0 === 'number' ? wrap(sm0.exit - sm0.a0) : turn;
      const t = Math.abs(tx) > 1e-3 ? (tx > 0 ? 1 : -1) : m, same = t === m;
      const kA = win(u, 0.03, 0.13, same ? 0.66 : 0.3, same ? 0.97 : 0.42), kB = same ? 0 : win(u, 0.4, 0.52, 0.66, 0.97), back = win(u, 0.04, 0.25, 0.4, 0.7);
      P[LIFT] = -0.09 - 0.09 * hump(u, 0.02, 0.9); P[SX] = 0.12 - 0.14 * back; P[CX] = 0.06; P[RX] = m * 0.06 * (kB - kA); P[ROLL] = -m * 0.05 * kA;
      P[PY] = m * 0.12 * (kA - kB); P[CY] = -m * 0.1 * (kA - kB); P[HY] = t * 0.25 * hump(u, 0.3, 1);
      bothArms(0.05 + 0.15 * back, 0.45, 0.5 + 0.25 * back);
      // the body turns round and drifts ~0.5 m: the foot that is not on the ball stays where the run put it (the plans are in the move's frame,
      // turned into the body's by gDl), the foot on the ball is lifted onto it and lands in the stride the move leaves with
      gRot = true; gSg = -1; swE = 0.4; swK = 0;
      autoStride(st.skE, gU0, 0.18, resv(m, 0.03, same ? 0.97 : 0.42, -m, same ? -1 : 0.4, 0.97));
      ipt(m, true, kA);
      ballWalk(m, kA, tR, tF, onto(fl, tH, kA), 0.1, 0.05 * kA);
      ipt(-m, true, kB);
      ballWalk(-m, kB, tR, tF, onto(fl, tH, kB), 0.1, 0.05 * kB);
      gRot = false; gSg = 1; swE = 0; swK = 0;
      if (same || u < 0.41) touch(m, kA, true); else touch(-m, kB, true);
    } else if (id === 'nutmeg') {
      // a toe poke through the legs at the very start, then the run goes round the defender: out to s and back in. The body covers ~5 m
      // (0.6 s at game speed): the strong foot pokes, then the feet take real strides, each planted for about a metre of travel.
      const pk = win(u, 0, 0.1, 0.16, 0.36), fw = sm(seg(u, 0.02, 0.14));
      P[LIFT] = -0.06 + 0.03 * hump(u, 0.2, 0.5) + 0.03 * hump(u, 0.62, 0.9); P[SX] = 0.14; P[CX] = 0.04; P[PY] = -m * 0.2 * pk; P[CY] = m * 0.22 * pk;
      setArm(P, -m, 0.6 * pk + 0.5 * Math.sin(TAU * seg(u, 0.1, 0.7)), 0.8, 0.3); setArm(P, m, -0.5 * pk - 0.5 * Math.sin(TAU * seg(u, 0.1, 0.7)), 0.8, 0.3);
      autoStride(st.skE, gU0, 0.18, resv(m, 0, 0.16, 0, -1, 0)); swE = 0.4; swK = 0;
      walk(-m, 0.05);
      ipt(m, false, 1);
      foot(m, lerp(tR, m * 0.07, fw), tF + 0.22 * fw, tH + 0.04 * fw * gH, 0, 0.35 * fw);
      mixPlan(m, sm(seg(u, 0.12, 0.2)), 0, 0.35);
      swE = 0; swK = 0;
    }
    // the stride to grow out of (the entry speed) and to land in (the sim leaves a move at jog x the move's exit factor)
    const sim = pv.sim && pv.sim.skill, S = PX_M, jog = fin(pv.jog, 5);
    const kIn = gaitK(pv, sim && sim.v0 > 0 ? sim.v0 * S : jog), kOut = gaitK(pv, Math.min(jog * fin(sim && sim.def && sim.def.exit, 1.2), fin(pv.top, 7.5) * 1.05));
    gEnt = true; gU = u; gE = st.skE; gRot = id === 'roulette' || id === 'dragback'; gSg = id === 'dragback' ? -1 : 1;
    finish(T, pv, st, 1, lerp(kIn, kOut, sm(u)));
    gEnt = false; gRot = false; gSg = 1;
    if (id === 'nutmeg') { const ln = s * (0.13 * win(u, 0.08, 0.3, 0.46, 0.7) - 0.1 * hump(u, 0.55, 1)); T[ROLL] += ln; T[CY] += ln; }
  }

  Object.assign(Clips, { fake: clipFake, skill: clipSkill });
})();
