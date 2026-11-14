/* ISO FOOTBALL 3D — outfield action clips: kicks, tackle, slide, stumble, ankle-break, celebration, shoulder barge.
   Pure pose clips for the animator (js/3d/anim3d.js): each writes the target pose T (Float32Array of AnimKit.N channels) from the
   sim clocks in pv. See js/3d/animkit.js for the channel layout and helpers, and anim3d.js for how clips are layered and eased.

   Every clip is a keyframed curve: a list of key poses at clock values, interpolated per channel with a Catmull-Rom spline, so
   the target is a smooth function of the sim clock (no pose switches on a threshold). Key poses are authored once, at load,
   for a right-sided lead (kicking / tackling / leading limb = right) and mirrored at play time for the left. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const A = R3D.AnimKit, Clips = (R3D.Clips = R3D.Clips || {});
  const TAU = Math.PI * 2;
  const { clamp, lerp, sm, seg, fin, N, REST, setLeg, setArm } = A;
  const { RX, LIFT, RZ, RYAW, PITCH, ROLL, PX, PY, PZ, SX, SY, SZ, CY, CZ, HY, HZ, ARM_L, ARM_R, LEG_L, LEG_R, GROUND } = A.CH;
  const SIM_S = (R3D.K && R3D.K.S) || 0.05;

  // ---------------------------------------------------------------- key poses and the spline player
  // mirror map: limb blocks swap sides, lateral body channels change sign
  const MIR = new Uint8Array(N), SGN = new Float32Array(N);
  for (let i = 0; i < N; i++) { MIR[i] = i; SGN[i] = 1; }
  for (let j = 0; j < 5; j++) { MIR[ARM_L + j] = ARM_R + j; MIR[ARM_R + j] = ARM_L + j; MIR[LEG_L + j] = LEG_R + j; MIR[LEG_R + j] = LEG_L + j; }
  [RX, RYAW, ROLL, PY, PZ, SY, SZ, CY, CZ, HY, HZ].forEach((c) => { SGN[c] = -1; });

  // P(spec, from): a key pose. spec keys are channel names (SX, PY, LIFT, ...) plus
  //   E        how far ahead of the root the reaching part (lead toe or shoulder) is at h = 1, m; play() keeps it the same for
  //            a smaller or taller body by moving the root (see play)
  //   K / S    lead / support leg  [swing, knee, abduct, ankle, toeOut]   (ankle F = sole parallel to the turf)
  //   AK / AS  arm on the lead / support side  [swing, elbow, abduct, twist]
  // Anything left out keeps the value of `from` (default: the rest pose).
  const F = 'flat';
  function P(o, from) {
    const p = new Float32Array(N + 1);
    p.set(from || REST);
    for (const k in o) if (k !== 'K' && k !== 'S' && k !== 'AK' && k !== 'AS' && k !== 'E') p[A.CH[k]] = o[k];
    if (o.E !== undefined) p[N] = o.E;
    if (o.AK) setArm(p, 1, o.AK[0], o.AK[1], o.AK[2], o.AK[3]);
    if (o.AS) setArm(p, -1, o.AS[0], o.AS[1], o.AS[2], o.AS[3]);
    for (let s = 1; s >= -1; s -= 2) {
      const l = s > 0 ? o.K : o.S;
      if (l) setLeg(p, s, l[0], l[1], l[2], l[3] === F ? l[0] - l[1] - p[PITCH] - p[PX] : l[3], l[4]);
    }
    return p;
  }
  // clip(times, poses, opts): opts.v0 = already moving at the first key (one-sided tangent), opts.loop = periodic over 0..1
  function clip(t, p, o) { return { t: Float32Array.from(t), p, n: t.length, v0: !!(o && o.v0), loop: !!(o && o.loop) }; }
  function play(T, c, u, m, h) {
    const t = c.t, p = c.p, n = c.n;
    u = clamp(u, t[0], t[n - 1]);
    let i = 0; while (i < n - 2 && u >= t[i + 1]) i++;
    const a = p[i], b = p[i + 1], d = t[i + 1] - t[i], s = (u - t[i]) / d, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = (s3 - 2 * s2 + s) * d, h01 = 3 * s2 - 2 * s3, h11 = (s3 - s2) * d;
    // neighbours for the tangents (finite differences across the key); zero tangent at an open end unless v0
    let pa = a, ia = 0, pb = b, ib = 0;
    if (i > 0) { pa = p[i - 1]; ia = 1 / (t[i + 1] - t[i - 1]); } else if (c.loop) { pa = p[n - 2]; ia = 1 / (t[1] + t[n - 1] - t[n - 2]); } else if (c.v0) ia = 1 / d;
    if (i < n - 2) { pb = p[i + 2]; ib = 1 / (t[i + 2] - t[i]); } else if (c.loop) { pb = p[1]; ib = 1 / (t[n - 1] - t[i] + t[1] - t[0]); }
    for (let j = 0; j < N; j++) {
      const v = h00 * a[j] + h10 * (b[j] - pa[j]) * ia + h01 * b[j] + h11 * (pb[j] - a[j]) * ib;
      if (m > 0) T[j] = v; else T[MIR[j]] = v * SGN[j];
    }
    const ext = h00 * a[N] + h10 * (b[N] - pa[N]) * ia + h01 * b[N] + h11 * (pb[N] - a[N]) * ib;
    // the spline may overshoot a key: knees never bend backwards, GROUND stays a weight
    if (T[LEG_L + 3] < 0.02) T[LEG_L + 3] = 0.02; if (T[LEG_R + 3] < 0.02) T[LEG_R + 3] = 0.02;
    T[GROUND] = clamp(T[GROUND], 0, 1);
    // the keys are authored for a body of scale 1: root offsets are metres, so they follow the actor's size; and a limb that
    // reaches a fixed sim distance (E) gets there on a short or a tall body alike, the root making up the difference
    if (h && h !== 1) { T[RX] *= h; T[LIFT] *= h; T[RZ] = T[RZ] * h + ext * (1 - h); }
  }
  function mixPose(a, b, f) { const p = new Float32Array(a.length); for (let i = 0; i < p.length; i++) p[i] = a[i] + (b[i] - a[i]) * f; return p; }
  const hOf = (st) => fin(st && st.h, 1);

  // the short stride the kicks return to (lead foot planted in front, arms as in a run): close to any phase of the run cycle
  const RUN = P({ K: [0.2, 0.25, 0.04, F], S: [-0.2, 0.45, 0.04, 0.15], AK: [-0.25, 0.9, 0.12], AS: [0.25, 0.9, 0.12], SX: 0.1 });

  // ---------------------------------------------------------------- kicks
  // Two timings. A kick of a ball he owned (normal, power, finesse, chip, cross, pass): the sim releases the ball at the kick event
  // (k = 0) but the drawn ball waits at the foot for K.kickHold, so the clip opens in the back-swing (the animator cross-fades
  // from whatever the stride left), the boot comes down through the ball at elapsed = kickHold, the standing foot has just landed
  // beside it, and the rest is follow-through and the step back into the run. A ball he did not own (first-time, volley, header)
  // is struck at the event itself: the first-time keys carry contact at k = 0.035 (10 ms sim, about one frame), volley and header a little later.
  const SUP = [0.5, 0.5, 0];
  const KH = fin(R3D.K && R3D.K.kickHold, 0.06);
  let FIRST_K, FIRST_C, VOL_K, VOL_C, HEAD_K, HEAD_C;      // cocked / contact poses of the strikes kickReady leads into
  const KICK = {}, OWNED = { normal: 1, power: 1, finesse: 1, chip: 1, cross: 1, pass: 1 };
  {
    const T6 = [0, 0.075, 0.12, 0.3, 0.6, 1];
    // the foot stays with the ball for a moment: the same pose carried a little further through
    const thru = (c, d) => { const p = new Float32Array(c); p[LEG_R] += d; p[LEG_R + 3] = Math.max(0.05, p[LEG_R + 3] - 0.4 * d); p[PY] -= 0.5 * d; return p; };
    const kick = (t, p, d) => { p.splice(2, 0, thru(p[1], d)); return clip(t, p, { v0: true }); };
    const mix = (a, b, f) => { const p = new Float32Array(a.length); for (let i = 0; i < p.length; i++) p[i] = a[i] + (b[i] - a[i]) * f; return p; };
    // owned-ball kick: poses = [back-swing, contact, ...follow-through], after[i] = seconds after contact of follow-through pose i
    // (the last one sits at `dur`); a key between the two puts the knee ahead of the shin (the whip) while the standing foot lands
    function own(dur, poses, after, d, mid) {
      const TT = 0.05, MT = 0.5, MF = 0.6, F0 = 0.3;
      // the standing foot lands beside the ball: leg reaching forward under a flexed knee, trunk over it
      const c = poses[1]; c[LEG_L] = SUP[0]; c[LEG_L + 3] = SUP[1]; c[LEG_L + 4] = SUP[0] - SUP[1] - c[PITCH] - c[PX]; c[LIFT] = SUP[2];
      // the knee is still bent when the boot meets the ball (a reach with a straight leg is a toe-poke)
      if (c[LEG_R + 3] < 0.42) { c[LEG_R] += 0.12; c[LEG_R + 4] += c[LEG_R + 3] - 0.42; c[LEG_R + 3] = 0.42; }
      const ts = [0, KH * MT, KH, KH + TT], ps = [mix(poses[0], poses[1], F0), mix(poses[0], poses[1], MF), poses[1], thru(poses[1], d)];
      for (let i = 2; i < poses.length; i++) { ts.push(i === poses.length - 1 ? dur : KH + after[i - 2]); ps.push(poses[i]); }
      return clip(ts.map((x) => x / dur), ps, { v0: true });
    }
    // laces drive: hips open then snap through, the opposite arm sweeps from wide to across the chest
    const nb = P({ K: [-0.5, 1.1, 0.08, 0.2, 0.1], S: [0.2, 0.3, 0.06, F], PY: 0.3, SY: -0.15, CY: -0.25, SX: 0.12, CX: 0.05, ROLL: -0.06, HX: 0.25, AS: [-0.15, 0.3, 1.15], AK: [-0.5, 0.6, 0.35] });
    const nc = P({ K: [0.48, 0.2, 0.06, 0.15, 0.12], S: [0.02, 0.35, 0.06, F], PY: 0, CY: -0.05, SX: 0.2, CX: 0.05, ROLL: -0.08, HX: 0.3, AS: [0.25, 0.35, 0.95], AK: [-0.65, 0.4, 0.4] });
    const nf = P({ K: [1.25, 0.12, 0, 0.4, 0.05], S: [-0.28, 0.15, 0.06, 0.25], PY: -0.35, SY: 0.1, CY: 0.3, SX: 0, ROLL: -0.04, HX: 0.1, AS: [0.75, 0.6, 0.35], AK: [-0.75, 0.3, 0.55] });
    const nd = P({ K: [0.8, 0.55, 0.04, 0.2], S: [-0.4, 0.4, 0.05, 0.25], PY: -0.15, CY: 0.15, SX: 0.08, AS: [0.5, 0.8, 0.2], AK: [-0.5, 0.7, 0.3] });
    KICK.normal = own(0.3, [nb, nc, nf, nd, RUN], [0.1, 0.18], 0.4);
    // first-time: no wind-up to continue from, the sim strikes at the event. The clip starts at the contact (k = 0); the swing into it is drawn
    // beforehand by kickReady (FIRST_K the cocked pose, nc the contact), so there is no jump at the event
    FIRST_K = P({ K: [-0.5, 1.0, 0.06, 0.2, 0.1], AS: [0.1, 0.5, 0.8], PY: 0.2, SY: -0.1, CY: -0.15 }, nb);
    FIRST_C = nc;
    KICK.first = clip([0, 0.035, 0.265, 0.565, 1], [nc, thru(nc, 0.3),
      P({ K: [1.0, 0.15, 0, 0.4, 0.05], PY: -0.25, CY: 0.2, AS: [0.6, 0.7, 0.35] }, nf),
      P({ K: [0.65, 0.5, 0.04, 0.2] }, nd), RUN], { v0: true });
    // power: a longer lever, the whole body follows the leg off the ground and lands on the kicking foot
    KICK.power = own(0.3, [
      P({ K: [-0.7, 1.3, 0.1, 0.2, 0.1], S: [0.25, 0.35, 0.06, F], PY: 0.4, SY: -0.2, CY: -0.3, SX: 0.18, CX: 0.06, ROLL: -0.08, HX: 0.3, AS: [-0.2, 0.3, 1.1], AK: [-0.4, 0.7, 0.4] }),
      P({ K: [0.5, 0.15, 0.05, 0.15, 0.08], S: [0, 0.4, 0.06, F], PY: -0.05, SX: 0.3, CX: 0.1, ROLL: -0.08, HX: 0.3, AS: [0.3, 0.3, 1.0], AK: [-0.8, 0.35, 0.45] }),
      P({ K: [1.5, 0.08, 0, 0.45], S: [-0.35, 0.2, 0.05, 0.45], PY: -0.45, SY: 0.1, CY: 0.35, SX: 0.1, HX: 0.05, AS: [0.9, 0.7, 0.3], AK: [-0.9, 0.3, 0.6], LIFT: 0.05, GROUND: 0.5, RZ: 0.04 }),
      P({ K: [0.55, 0.15, 0.02, 0.2], S: [-0.5, 0.8, 0.05, 0.4], PY: -0.2, CY: 0.15, SX: 0.15, AS: [0.5, 0.8, 0.3], AK: [-0.5, 0.7, 0.4], LIFT: 0.07, GROUND: 0, RZ: 0.08 }),
      P({ K: [0.32, 0.5, 0.04, F], S: [-0.4, 0.95, 0.05, 0.3], PY: -0.05, SX: 0.25, AS: [0.4, 0.9, 0.25], AK: [-0.4, 0.9, 0.3], RZ: 0.06 }),
      P({ K: [0.0, 0.25, 0.04, F], S: [0.3, 0.85, 0.04, 0.15], SX: 0.14, AS: [-0.3, 0.9, 0.12], AK: [0.3, 0.9, 0.12] })], [0.12, 0.17, 0.21], 0.5);
    // finesse: inside of the foot, the leg wraps across the body while the body leans away from the ball
    KICK.finesse = own(0.3, [
      P({ K: [-0.6, 1.1, 0.25, 0.1, 0.6], S: [0.18, 0.3, 0.06, F], PY: 0.35, SY: -0.1, CY: -0.2, SX: 0.02, ROLL: -0.14, HX: 0.25, AS: [0, 0.3, 1.2], AK: [-0.4, 0.5, 0.4] }),
      P({ K: [0.45, 0.3, 0.1, 0, 0.45], S: [0, 0.35, 0.06, F], PY: 0.05, SX: -0.03, ROLL: -0.2, SZ: -0.08, HX: 0.3, AS: [0.15, 0.35, 1.25], AK: [-0.5, 0.4, 0.45] }),
      P({ K: [0.95, 0.25, -0.35, 0, 0.75], S: [-0.2, 0.2, 0.06, 0.15], PY: -0.4, CY: 0.25, SX: -0.08, ROLL: -0.2, SZ: -0.1, HX: 0.1, AS: [0.2, 0.4, 1.1], AK: [-0.3, 0.5, 0.6] }),
      P({ K: [0.6, 0.5, -0.15, 0.1, 0.25], S: [-0.3, 0.35, 0.05, 0.2], PY: -0.2, CY: 0.1, ROLL: -0.08, SX: 0.04, AS: [0.3, 0.7, 0.5], AK: [-0.4, 0.7, 0.35] }),
      RUN], [0.1, 0.19], 0.4);
    // chip: a stab under the ball with the toe up, the leg stops dead instead of following through
    KICK.chip = own(0.3, [
      P({ K: [-0.65, 1.25, 0.06, 0.2, 0.1], S: [0.2, 0.35, 0.06, F], PY: 0.2, SX: 0, HX: 0.3, AS: [0.1, 0.4, 0.9], AK: [-0.4, 0.6, 0.35] }),
      P({ K: [0.42, 0.33, 0.05, -0.25, 0.1], S: [0, 0.4, 0.06, F], PY: 0.05, SX: -0.12, PITCH: -0.04, HX: 0.35, AS: [0.25, 0.4, 0.9], AK: [-0.5, 0.5, 0.4] }),
      P({ K: [0.55, 0.55, 0.05, -0.3, 0.1], S: [-0.05, 0.38, 0.06, F], PY: -0.05, SX: -0.18, PITCH: -0.05, HX: 0.2, AS: [0.3, 0.45, 0.85], AK: [-0.45, 0.5, 0.45] }),
      P({ K: [0.42, 0.6, 0.05, -0.1], S: [-0.12, 0.35, 0.06, F], SX: -0.1, AS: [0.25, 0.6, 0.5], AK: [-0.3, 0.6, 0.35] }),
      P({ K: [0.25, 0.3, 0.04, F], S: [-0.25, 0.5, 0.04, 0.2] }, RUN)], [0.07, 0.15], 0.06);
    // cross: leaning back and away, the leg sweeps round the ball and across
    KICK.cross = own(0.3, [
      P({ K: [-0.85, 1.3, 0.35, 0.2, 0.3], S: [0.22, 0.3, 0.06, F], PY: 0.45, SY: -0.15, CY: -0.3, SX: -0.05, ROLL: -0.14, HX: 0.25, AS: [-0.2, 0.3, 1.3], AK: [-0.4, 0.6, 0.4] }),
      P({ K: [0.5, 0.2, 0.15, 0.15, 0.35], S: [0, 0.35, 0.06, F], PY: 0.05, SX: -0.15, ROLL: -0.18, HX: 0.3, AS: [0.2, 0.3, 1.2], AK: [-0.6, 0.4, 0.5] }),
      P({ K: [1.25, 0.15, -0.4, 0.35, 0.2], S: [-0.25, 0.2, 0.06, 0.2], PY: -0.55, CY: 0.3, SX: -0.2, ROLL: -0.16, AS: [0.5, 0.5, 0.9], AK: [-0.6, 0.4, 0.7] }),
      P({ K: [0.7, 0.55, -0.2, 0.2], S: [-0.35, 0.4, 0.05, 0.2], PY: -0.25, CY: 0.1, SX: -0.05, ROLL: -0.06, AS: [0.4, 0.8, 0.4], AK: [-0.4, 0.7, 0.35] }),
      RUN], [0.1, 0.19], 0.4);
    // pass: side-foot, foot turned square, a short push with a low follow-through
    KICK.pass = own(0.25, [
      P({ K: [-0.4, 0.65, 0.12, 0, 0.7], S: [0.15, 0.28, 0.06, F], PY: 0.15, SX: 0.08, HX: 0.2, AS: [0.2, 0.7, 0.3], AK: [-0.3, 0.7, 0.3] }),
      P({ K: [0.36, 0.45, 0.1, -0.05, 0.5], S: [0, 0.3, 0.06, F], PY: 0, SX: 0.08, HX: 0.25, AS: [0.3, 0.7, 0.35], AK: [-0.35, 0.7, 0.3] }),
      P({ K: [0.62, 0.2, 0, -0.05, 1.1], S: [-0.15, 0.2, 0.06, F], PY: -0.15, SX: 0.04, HX: 0.1, AS: [0.4, 0.7, 0.3], AK: [-0.4, 0.7, 0.35] }),
      P({ K: [0.45, 0.4, 0.04, 0, 0.4], S: [-0.25, 0.35, 0.05, 0.1], PY: -0.08, SX: 0.07, AS: [0.38, 0.8, 0.2], AK: [-0.38, 0.8, 0.2] }),
      RUN], [0.07, 0.13], 0.1);
    // volley: the hips tilt and the trunk falls away to the standing side, the leg comes round at hip height and swivels through
    VOL_K = P({ K: [-0.3, 1.4, 0.85, 0.3, 0.5], S: [0.1, 0.3, 0.06, F], PY: 0.6, SY: -0.15, CY: -0.2, ROLL: -0.08, PZ: -0.2, SZ: -0.12, SX: -0.05, HX: 0.15, AS: [0.2, 0.4, 1.1], AK: [-0.3, 0.5, 0.9] });
    VOL_C = P({ K: [1.45, 0.45, 0.4, 0, 0.2], S: [0, 0.3, 0.06, F], PY: 0, ROLL: -0.1, PZ: -0.28, SZ: -0.18, CZ: -0.1, SX: -0.1, HX: 0.2, AS: [0.3, 0.4, 1.0], AK: [-0.5, 0.4, 1.0] });
    KICK.volley = clip([0, 0.045, 0.225, 0.525, 1], [VOL_C, thru(VOL_C, 0.1),
      P({ K: [1.45, 0.2, -0.15, 0, 0.1], S: [-0.15, 0.2, 0.06, 0.2], PY: -0.7, CY: 0.3, ROLL: -0.1, PZ: -0.22, SZ: -0.15, CZ: -0.08, SX: -0.12, AS: [0.5, 0.5, 0.8], AK: [-0.6, 0.4, 0.9] }),
      P({ K: [0.75, 0.6, 0, 0.2], S: [-0.3, 0.35, 0.05, 0.2], PY: -0.3, CY: 0.1, ROLL: -0.04, PZ: -0.06, SX: 0, AS: [0.4, 0.8, 0.4], AK: [-0.4, 0.7, 0.4] }),
      RUN], { v0: true });
    // header: the contact is the neck snapping through the ball at the top of the jump (HEAD_C); kickReady draws the leap into it, via the
    // arched-back pose (HEAD_K). Then the landing is absorbed.
    HEAD_K = P({ K: [0.1, 0.25, 0.05, 0.5], S: [-0.15, 0.3, 0.05, 0.5], SX: -0.1, CX: -0.05, NX: -0.02, HX: -0.1, AK: [-0.3, 0.9, 0.5], AS: [-0.3, 0.9, 0.5], LIFT: 0.25, GROUND: 0.35 });
    HEAD_C = P({ K: [-0.15, 0.7, 0.05, 0.4], S: [-0.3, 0.9, 0.05, 0.4], SX: 0.25, CX: 0.15, NX: 0.15, HX: 0.35, AK: [-0.7, 0.7, 0.55], AS: [-0.7, 0.7, 0.55], LIFT: 0.8, GROUND: 0 });
    KICK.header = clip([0, 0.22, 0.55, 0.78, 1], [HEAD_C,
      P({ K: [0.1, 0.45, 0.05, 0.35], S: [-0.1, 0.55, 0.05, 0.35], SX: 0.3, CX: 0.1, HX: 0.2, AK: [-0.4, 0.8, 0.5], AS: [-0.4, 0.8, 0.5], LIFT: 1, GROUND: 0 }),
      P({ K: [0.28, 0.7, 0.06, F], S: [-0.05, 0.75, 0.06, 0.25], SX: 0.3, AK: [0.1, 0.9, 0.35], AS: [0.1, 0.9, 0.35], LIFT: 0, GROUND: 1 }),
      P({ K: [0.3, 0.5, 0.05, F], S: [-0.2, 0.55, 0.05, 0.2], SX: 0.2, AK: [-0.2, 0.9, 0.2], AS: [0.25, 0.9, 0.2] }),
      RUN], { v0: true });
  }
  function kickVariant(kk) {
    if (!kk) return 'normal';
    const t = kk.type;
    if (t == null) return 'pass';
    if (kk.cross) return 'cross';
    const kd = kk.kind;
    if (kd === 'header' || kd === 'diveheader') return 'header';
    if (kd === 'volley' || kd === 'halfvolley') return 'volley';      // a half-volley is the volley clip struck low (kk.z)
    if (kd === 'outside') return 'finesse';
    if (kd === 'driven') return 'power';
    if (!kd && kk.high) return 'header';
    if (!kd && (kk.z || 0) >= 8 && t !== 'chip') return 'volley';
    if (t === 'first-time') return 'first';
    return KICK[t] ? t : 'normal';
  }
  // The sim lets a man strike a ball up to ~1.4 m away, further out than a planted leg or a standing head reaches. For the
  // moment of the strike the body is carried toward the contact point, by at most 0.7 m (scaled by h), so the boot or the forehead
  // gets there; `near` = how far out (in body scales) it reaches without help. rel = the contact point relative to the man as he is
  // now: the point the animator latched at the event (st.cx / st.cz, world) or, before that frame, the one kickReady was leading to.
  const rel = [0, 0];
  let relOk = false;
  function contactRel(pv, st, ready) {
    relOk = true;
    if (st.contact) { rel[0] = fin(st.cx, 0) - fin(pv.x, 0); rel[1] = fin(st.cz, 0) - fin(pv.z, 0); }
    else if (ready && st.rdTX !== undefined && st.rdN === st.kcN) { rel[0] = st.rdTX - fin(pv.x, 0); rel[1] = st.rdTZ - fin(pv.z, 0); }
    else relOk = false;
    return relOk;
  }
  // the carry is measured while the contact is being made (k < LATCH_K, or when kickReady draws it) and frozen after: the man moves on, the ball does not
  const LATCH_K = 0.02;
  const frozen = (st, k) => k >= LATCH_K && st.lchN === st.kcN;
  function reach(T, st, k, near, w) {
    if (!relOk && !frozen(st, k)) return;
    const h = hOf(st), e = w ? 1 - sm(seg(k, w[0], w[1])) : sm(seg(k, 0, 0.1)) * (1 - sm(seg(k, 0.18, 0.6)));
    if (!frozen(st, k)) {
      const dx = rel[0], dz = rel[1], d = Math.hypot(dx, dz), y = fin(st.yaw, 0), s = d < 1e-3 ? 0 : clamp(d - near * h, w ? -0.4 * h : 0, (w ? 0.9 : 0.7) * h);
      st.lcZ = d < 1e-3 ? 0 : ((dx * Math.sin(y) + dz * Math.cos(y)) / d) * s; st.lcX = d < 1e-3 ? 0 : -((dx * Math.cos(y) - dz * Math.sin(y)) / d) * s; st.lchN = st.kcN;
    }
    if (e <= 0) return;
    T[RZ] += st.lcZ * e; T[RX] += st.lcX * e;
  }
  // owned-ball strike: ball3d draws the ball at a strike spot beside and ahead of the kicking foot while the kick is held, so the
  // boot is carried onto the latched point (st.cx / st.cz) with no IK: the root is shifted by what is missing between where the
  // authored contact pose puts the instep (BOOT: body scales out to the kicking side / ahead of the root, measured on the posed
  // rig at k = KH / dur, mirrored for the left foot) and where the ball is. A smaller or taller man covers the difference with his
  // body, not a longer leg. Held from the event to the contact, released over the follow-through.
  const BOOT = { normal: [0.2, 0.44], power: [0.19, 0.42], finesse: [0.30, 0.44], chip: [0.17, 0.34], cross: [0.16, 0.37], pass: [0.11, 0.2] };
  function reachOwn(T, pv, st, k, v, m, dur, held, el) {
    if (!st.contact) return;
    const h = hOf(st), b = BOOT[v];
    // the shift is measured at the start of the kick and, while the ball is held, as it settles at the strike spot; after that it is frozen (the man moves on, the ball does not)
    if (st.kcDone !== st.kcN || (held && k < KH / dur)) {
      contactRel(pv, st);
      const y = fin(st.yaw, 0), sy = Math.sin(y), cy = Math.cos(y);
      const left = rel[0] * cy - rel[1] * sy, fwd = rel[0] * sy + rel[1] * cy;      // the point in the man's own frame (left +, ahead +)
      st.kcL = clamp(left + m * b[0] * h, -0.5 * h, 0.5 * h); st.kcF = clamp(fwd - b[1] * h, -0.4 * h, 0.7 * h); st.kcDone = st.kcN;
    }
    const e = (held ? sm(seg(k, 0, KH / dur)) : sm(seg(el, 0, 0.05))) * (1 - sm(seg(k, (KH + 0.04) / dur, (KH + 0.2) / dur)));
    if (e <= 0) return;
    T[RZ] += st.kcF * e; T[RX] -= st.kcL * e;
  }
  // a header: turn toward the ball (the sim lets a man head one beside or behind him) and carry the root so that the forehead,
  // `fwd` body scales ahead of the root along the new facing once the body has pitched over, ends up at the ball
  function reachHead(T, st, k, fwd) {
    if (!relOk && !frozen(st, k)) return;
    const h = hOf(st), e = 1 - sm(seg(k, 0.1, 0.5));
    if (!frozen(st, k)) {
      const dx = rel[0], dz = rel[1];
      // the bearing of the ball from the drawn facing, unwrapped against the previous frame of this kick so that it cannot flip
      // sides while the drawn body, which the sim has already turned toward his target, eases round past the ball
      const y = fin(st.yaw, 0);
      let ang = A.wrap(Math.atan2(dx, dz) - y);
      if (st.hdK === undefined || k < st.hdK) st.hdA = ang; else ang += TAU * Math.round((st.hdA - ang) / TAU);
      st.hdK = k; st.hdA = ang;
      const turn = clamp(ang, -HEAD_TURN, HEAD_TURN), ye = y + turn;
      let sx = dx - Math.sin(ye) * fwd * h, sz = dz - Math.cos(ye) * fwd * h;
      const l = Math.hypot(sx, sz), c = l > LUNGE * h ? (LUNGE * h) / l : 1;
      sx *= c; sz *= c;
      // into the actor's own (un-turned) frame: the root offset is applied before the root turns
      st.lcT = turn; st.lcZ = sx * Math.sin(y) + sz * Math.cos(y); st.lcX = -(sx * Math.cos(y) - sz * Math.sin(y)); st.lchN = st.kcN;
    }
    if (e <= 0) return;
    T[RYAW] -= st.lcT * (1 - sm(seg(k, 0.15, 0.95))); T[RZ] += st.lcZ * e; T[RX] += st.lcX * e;
  }
  // header: widest turn (rad), root lunge (body scales), and the forehead as the body pitches forward in steps of HEAD_STEP rad
  // (measured on the posed rig at the moment of contact): its height and its distance ahead of the root, in body scales
  const HEAD_TURN = 1.6, LUNGE = 0.7, HEAD_STEP = 0.3, HEAD_Y = [1.62, 1.46, 1.18, 0.79], HEAD_F = [0.3, 0.76, 1.14, 1.42];
  // volley: the kicking leg swings up by VOL_G rad per body scale of ball height above VOL_Z
  const VOL_G = 1.4, VOL_Z = 0.5;
  const FIRST_W = [0.15, 0.5];      // a first-time strike carries the body to the ball (kickReady has already moved it there) and releases it over the follow-through
  // How long the drawn ball waits at the strike spot for this kick (sim s): only the controlled player's own-ball kicks have a hold
  // (ball3d: bv.hold, > 0 once decided, -1 while it runs, 0 = none), latched at the first frame of the kick so the clip's clock cannot jump
  const HOLD_LAG = 1.3, HOLD_MIN = 0.03;      // a hard shot's hold ends at ~1.3 / speed s; the strike is never planned earlier than HOLD_MIN (the boot cannot cover a metre in less)
  function holdOf(pv, st, ball, v) {
    const vf = R3D.Adapter && R3D.Adapter.vf, kk = pv.kick, kt = fin(pv.kickT, 0);
    if (st.kcT === undefined || kt > st.kcT + 1e-4) {
      let h = 0;
      if (OWNED[v] && kk && kk.owned && vf && pv.idx === vf.me) {
        // ball3d ends the hold early once the sim ball is more than ~1.4 m from the strike spot (a hard shot)
        const hl = ball ? fin(ball.hold, -1) : -1, sv = ball ? Math.hypot(fin(ball.vx, 0), fin(ball.vy, 0), fin(ball.vz, 0)) : 0;
        h = hl > 0 ? Math.min(hl, KH) : hl === 0 ? 0 : clamp(HOLD_LAG / Math.max(sv, 1), HOLD_MIN, KH);
      }
      st.kcH = h; st.kcN = (st.kcN | 0) + 1;
    }
    st.kcT = kt;
    return st.kcH;
  }
  // a strike the sim makes at the event (first-time, volley, header) at clip time k, for the point in rel[] (relOk): the clip's own
  // key poses plus the root carry; zc = height of the ball's centre (m). kickReady draws the same pose at k = 0.
  function strike(T, st, v, m, k, zc) {
    const h = hOf(st);
    play(T, KICK[v], k, m, v === 'header' ? 1 : h);
    if (v === 'header') {
      // the keys carry LIFT as a fraction of the jump: as high as it takes to put the forehead on a ball above head height; a
      // ball below it is met by pitching the whole body forward over the feet (the head swings down along an arc of the
      // standing height), and the root is carried out or back so the forehead ends up at the ball
      const w = 1 - sm(seg(k, 0.1, 0.5));
      // pitch (a) that brings the forehead down to the ball (HEAD_Y, in body heights), or further if the ball is out of the lunge's
      // reach (HEAD_F = how far ahead of the root the forehead then is); a jump makes up the height the pitch gave away
      const y = zc / h, need = (relOk ? Math.hypot(rel[0], rel[1]) : 0) / h - LUNGE;
      let a = 0, j = 0;
      while (j < HEAD_Y.length - 2 && y < HEAD_Y[j + 1]) j++;
      a = (j + clamp((HEAD_Y[j] - y) / (HEAD_Y[j] - HEAD_Y[j + 1]), 0, 1)) * HEAD_STEP;
      j = 0; while (j < HEAD_F.length - 2 && need > HEAD_F[j + 1]) j++;
      a = Math.max(a, (j + clamp((need - HEAD_F[j]) / (HEAD_F[j + 1] - HEAD_F[j]), 0, 1)) * HEAD_STEP);
      j = Math.min(HEAD_Y.length - 2, a / HEAD_STEP | 0);
      const q = a / HEAD_STEP - j, fwd = lerp(HEAD_F[j], HEAD_F[j + 1], q), yh = lerp(HEAD_Y[j], HEAD_Y[j + 1], q) * h - 0.08;
      T[LIFT] *= clamp(zc - yh, 0.08, 0.5) / 0.8;
      T[PITCH] += a * w;
      reachHead(T, st, k, fwd);
    } else {
      reach(T, st, k, v === 'volley' ? 0.45 : 0.4, FIRST_W);
      if (v === 'volley') {   // the leg is raised (swing) or lowered to the height of the ball
        const w = 1 - sm(seg(k, 0.1, 0.3)), b = m > 0 ? LEG_R : LEG_L;
        T[b] += VOL_G * (zc / h - VOL_Z) * w;
      }
    }
  }
  function clipKick(T, pv, st, ball) {
    const kk = pv.kick, v = kickVariant(kk);
    const m = kk && kk.foot ? (kk.foot > 0 ? 1 : -1) : st.foot;
    const dur = kk && kk.type == null ? 0.25 : 0.3;
    const e = clamp(dur - pv.kickT, 0, dur);      // sim s since the event
    const hold = holdOf(pv, st, ball, v);
    st.ikSide = v === 'header' || (OWNED[v] && hold > 0) ? 0 : m; st.kickK = clamp(1 - pv.kickT / dur, 0, 1);
    contactRel(pv, st, !OWNED[v]);
    if (OWNED[v]) {
      // an owned kick plays its back-swing and the down-swing into the contact over the hold; without a hold the ball is gone at the event,
      // so the clip starts at the contact and shows the rest as follow-through
      const te = hold > 0 ? (e < hold ? (e * KH) / hold : KH + e - hold) : KH + e, k = clamp(te / dur, 0, 1);
      play(T, KICK[v], k, m, hOf(st));
      reachOwn(T, pv, st, k, v, m, dur, hold > 0, e);
    } else {
      // the strike is made at the event; if the approach was still on its way (the press came a few frames before) it carries on into the
      // contact pose first, so the limbs are not thrown there in a frame: the contact is drawn READY_T x (the share of the approach missing) late
      const zc = v === 'header' ? fin(kk.z, 30) * SIM_S + 0.11 : fin(kk && kk.z, 12) * SIM_S + 0.11;
      if (st.kdN !== st.kcN) { st.kdN = st.kcN; st.kdD = relOk && st.rdWe < 1 ? (1 - st.rdWe) * READY_T : 0; st.kdW = fin(st.rdWe, 1); }
      if (e < st.kdD) { approach(T, st, st.kdW + (1 - st.kdW) * sm(e / st.kdD), m, hOf(st), v === 'first' ? 1 : 0, v === 'volley' ? 1 : 0, v === 'header' ? 1 : 0, zc); return; }
      strike(T, st, v, m, clamp((e - st.kdD) / dur, 0, 1), zc);
    }
  }

  // Approach to a strike the sim makes at the event (pv.charge.ft: first-time, volley, header): the drawn pose cannot get from a stride to the
  // contact in the 1-2 frames before the ball is gone, so the animator blends this in beforehand, w 0 -> 1 as the strike nears: first the
  // cocked pose (the leg drawn back, or the arched leap), then the swing into the contact pose, which is exactly the clip's pose at k = 0 with
  // the body carried to the strike point (tx, tz, world, optional) as far as a lunge reaches. foot: +1 right / -1 left (default: the man's own).
  const READY_T = 0.07;
  const RDY = new Float32Array(N + 1), RDK = new Float32Array(N + 1), RDA = new Float32Array(N + 1), RDB = new Float32Array(N + 1), ONE = {};
  const VARS = ['first', 'volley', 'header'];
  function ready(v) { return ONE[v] || (ONE[v] = clip([0, 1], v === 'header' ? [HEAD_K, HEAD_K] : v === 'volley' ? [VOL_K, VOL_K] : [FIRST_K, FIRST_K])); }
  function kickReady(T, pv, st, w, foot, tx, tz) {
    // the strike can follow the press by a few frames (a falling ball is only pressed for when it is close): the approach takes at least
    // READY_T sim s from the press (the charge clock, which the adapter gives as a share of the normal charge) however fast the ball comes
    w = Math.min(w, sm(fin(pv.charge && pv.charge.f, 1) * 0.33 / READY_T));
    if (!(w > 0)) return;
    const h = hOf(st), m = foot ? (foot > 0 ? 1 : -1) : st.foot;
    // which strike: by the height the ball will have when it arrives (the sim: a header from 1 m, a volley from 0.4 m), a smoothed estimate
    // that mixes the three poses rather than switching between them
    const vf = R3D.Adapter && R3D.Adapter.vf, b = vf && vf.ball;
    if (st.rdH === undefined || w < 0.05) st.rdH = 0.11;
    if (b && w > 0.02) {
      const dx = fin(b.x, 0) - fin(pv.x, 0), dz = fin(b.z, 0) - fin(pv.z, 0), d = Math.hypot(dx, dz) || 1e-3;
      const closing = Math.max(1, -(dx * (fin(b.vx, 0) - fin(pv.vx, 0)) + dz * (fin(b.vz, 0) - fin(pv.vz, 0))) / d), tt = Math.max(0, (d - 1.3) / closing);
      st.rdH += (Math.max(0.11, fin(b.y, 0) + fin(b.vy, 0) * tt - 22.5 * tt * tt) - st.rdH) * 0.3;
    }
    const ST = ISO.C && ISO.C.SHOT && ISO.C.SHOT.T, ks = ST ? SIM_S : 0.05, vz0 = ST ? ST.volley.zMin * ks : 0.4, hz0 = ST ? ST.head.zMin * ks : 1;      // the sim's own strike heights (C.SHOT.T), as resolveStrike uses them
    const zc = st.rdH, wv = sm(seg(zc, vz0 - 0.15, vz0 + 0.1)), wh = sm(seg(zc, hz0 - 0.15, hz0 + 0.1));
    relOk = false;
    if (tx !== undefined && tz !== undefined) { rel[0] = tx - fin(pv.x, 0); rel[1] = tz - fin(pv.z, 0); relOk = true; st.rdTX = tx; st.rdTZ = tz; st.rdN = (st.kcN | 0) + 1; }
    st.rdWe = w;
    approach(T, st, w, m, h, (1 - wv) * (1 - wh), wv * (1 - wh), wh, zc);
  }
  // the approach pose at w (0 cocked .. 1 at the contact) for a mix of the three strikes (weights wf, wv, wh); rel[] holds the strike point
  function approach(T, st, w, m, h, wf, wv, wh, zc) {
    const wt = [wf, wv, wh];
    RDY.fill(0); RDK.fill(0);
    for (let q = 0; q < 3; q++) {
      if (wt[q] < 0.001) continue;
      strike(RDA, st, VARS[q], m, 0, q ? zc : 0.11);
      play(RDB, ready(VARS[q]), 0, m, q === 2 ? 1 : h);
      for (let i = 0; i < N; i++) { RDY[i] += wt[q] * RDA[i]; RDK[i] += wt[q] * RDB[i]; }
    }
    const wa = sm(seg(w, 0, 0.55)), sb = Math.pow(seg(w, 0.55, 1), 1.5);
    for (let i = 0; i < N; i++) { const r = RDK[i] + (RDY[i] - RDK[i]) * sb; T[i] += (r - T[i]) * wa; }
  }

  // A foot that is planted while the body travels over it: its hip-to-ankle distance along the facing shrinks by the ground the body covers
  // (measured from the frame the foot was planted, id = that instance), so the boot stays where it was set down. The knee is the clip's;
  // the thigh swing is solved for it. w blends from the clip's own swing (0) to the planted one (1).
  function plantLeg(T, pv, st, m, id, w) {
    if (!(w > 0)) return;
    const R = st.rig, h = hOf(st), a = fin(R && R.thigh, 0.46 * h), b = fin(R && R.shin, 0.46 * h), base = m > 0 ? LEG_R : LEG_L, th = T[base], kn = T[base + 3];
    if (st.plId !== id) { st.plId = id; st.plX = fin(pv.x, 0); st.plZ = fin(pv.z, 0); st.plR = T[RZ]; st.plF = a * Math.sin(th) + b * Math.sin(th - kn); }
    // the root's own forward offset (RZ) moves the hip too
    const y = fin(st.yaw, 0), D = (fin(pv.x, 0) - st.plX) * Math.sin(y) + (fin(pv.z, 0) - st.plZ) * Math.cos(y) + T[RZ] - st.plR;
    const A = a + b * Math.cos(kn), B = -b * Math.sin(kn), RR = Math.hypot(A, B), ph = Math.atan2(B, A), q = (st.plF - D) / RR;
    // a boot the body has carried out of reach lets go (the clip's own swing) instead of the leg being thrown to full stretch
    const wr = w * (1 - sm(seg(Math.abs(q), 0.8, 0.95)));
    T[base] += (Math.asin(clamp(q, -1, 1)) - ph - th) * wr;
  }

  // ---------------------------------------------------------------- defending
  // standing tackle: a step-lunge. The sim can bite from stT 0.015 to 0.17 of 0.2 at a point 0.9 m in front while the body is thrown
  // 1.4 m forward (fast at first, 14 m/s, then braking), so the lead boot flies, never dragged along the turf: knee up out of the
  // stride, the shin kicking out toward the ball (toe at ball height at u ~ 0.3), and it lands at the ball at u ~ 0.42, flat, ~1 m
  // ahead of the root. The body then passes over that planted foot (its reach back to 0.3 m by the end: the root travels with it),
  // so the foot stays where it landed for `recover` to bring the weight over it. The standing foot pushes off (u ~ 0.15) and trails
  // behind with the knee folded and the heel up, never in contact while the body is still travelling.
  const TK_END = P({ K: [0.5, 0.8, 0.05, F, 0.3], S: [0.2, 1.7, 0.08, 0.1], PY: -0.2, CY: 0.15, SX: 0.38, HX: 0.1, RZ: 0.05, E: 0.4, AK: [-0.5, 0.6, 0.5], AS: [0.5, 0.8, 0.45] });
  const TACKLE = clip([0, 0.05, 0.14, 0.3, 0.46, 0.7, 1], [
    P({ K: [0.5, 0.7, 0.06, 0], S: [-0.2, 0.5, 0.06, F], SX: 0.25, E: 0.11, AK: [-0.4, 0.9, 0.3], AS: [0.4, 0.9, 0.3] }),
    P({ K: [0.62, 0.75, 0.05, -0.05, 0.4], S: [-0.26, 0.65, 0.08, 0.3], PY: -0.1, CY: 0.08, SX: 0.28, HX: 0.1, RZ: 0.05, E: 0.25, AK: [-0.5, 0.8, 0.4], AS: [0.45, 0.85, 0.4] }),
    P({ K: [0.8, 0.8, 0.05, -0.1, 0.4], S: [-0.35, 0.85, 0.08, 0.3], PY: -0.2, CY: 0.15, SX: 0.3, HX: 0.15, RZ: 0.1, E: 0.4, AK: [-0.55, 0.7, 0.45], AS: [0.5, 0.8, 0.45] }),
    P({ K: [0.95, 0.25, 0.05, -0.3, 0.5], S: [-0.1, 1.9, 0.08, 0.3], LIFT: -0.12, GROUND: 0, PY: -0.3, CY: 0.2, SX: 0.34, HX: 0.2, RZ: 0.16, E: 0.96, AK: [-0.7, 0.4, 0.6], AS: [0.6, 0.7, 0.55] }),
    P({ K: [0.92, 0.1, 0.05, F, 0.5], S: [0.0, 1.8, 0.08, 0.2], LIFT: -0.06, PY: -0.32, CY: 0.22, SX: 0.4, HX: 0.2, RZ: 0.18, E: 1.01, AK: [-0.75, 0.4, 0.62], AS: [0.65, 0.7, 0.55] }),
    P({ K: [0.7, 0.45, 0.05, F, 0.5], S: [0.15, 1.8, 0.08, 0.2], PY: -0.32, CY: 0.22, SX: 0.4, HX: 0.2, RZ: 0.1, E: 0.7, AK: [-0.75, 0.4, 0.62], AS: [0.65, 0.7, 0.55] }),
    TK_END], { v0: true });
  const RECOVER = clip([0, 0.5, 1], [TK_END,
    P({ K: [0.55, 0.6, 0.05, F, 0.1], S: [0.05, 1.3, 0.06, 0.2], PY: -0.08, SX: 0.28, RZ: 0.05, E: 0.45, AK: [-0.3, 0.9, 0.25], AS: [0.3, 0.9, 0.25] }),
    P({ K: [0.2, 0.3, 0.04, F], S: [0.15, 0.9, 0.04, 0.1], SX: 0.15, E: 0.25, AK: [0.2, 0.9, 0.12], AS: [-0.2, 0.9, 0.12] })]);
  function clipTackle(T, pv, st) {
    if (pv.state === 'recover') play(T, RECOVER, fin(pv.u, 0), st.foot, hOf(st));
    else play(T, TACKLE, fin(pv.u, 1), st.foot, hOf(st));
  }

  // slide tackle: drop onto the hip of the trailing leg (folded flat under the lead thigh), lead leg along the turf at full
  // reach from u ~ 0.3 until the sim stops biting (0.84), the trailing hand brushing the ground; `down` tucks and stands up
  const SLT = 0.1, SLA = 0.3;      // the folded trailing leg lies clear of the lead shin
  const SLZ = -0.1;      // the lead leg stops where the dribbler's ball is (the sim has it within the leg's reach): a longer reach sweeps the shin through it
  const SL_END = P({ K: [0.6, 0.3, 0.05, -0.2], S: [0.7, 1.7, 0.4 + SLA, 0.3, 1.1], PX: -0.7, SX: 0.42, CX: 0.1, HX: 0.3, PZ: -0.24, PY: -0.2, RZ: SLZ, E: 1.14, AS: [-0.5, 0.6, 0.6], AK: [0.6, 0.7, 0.8] });
  const SLIDE = clip([0, SLT, SLT * 2, 0.34, 0.7, 1], [
    P({ K: [0.6, 0.5, 0.05, -0.1], S: [-0.3, 0.8, 0.1, 0.2], PX: -0.1, SX: 0.1, E: 0.14, AS: [0.3, 0.8, 0.4], AK: [-0.4, 0.6, 0.5] }),
    P({ K: [0.5, 0.3, 0.05, -0.2], S: [0.2, 1.5, 0.2 + SLA, 0.2, 0.4], PX: -0.45, SX: 0.12, HX: 0.1, PZ: -0.08, PY: -0.05, RZ: 0.06, E: 0.7, AS: [-0.2, 0.6, 0.5], AK: [0.2, 0.7, 0.7] }),
    P({ K: [0.3, 0.1, 0.05, -0.25], S: [0.5, 1.9, 0.3 + SLA, 0.2, 0.6], PX: -0.75, SX: 0.15, HX: 0.2, PZ: -0.22, PY: -0.1, RZ: 0.12, E: 1.03, AS: [-0.4, 0.4, 0.6], AK: [0.5, 0.7, 0.9] }),
    P({ K: [0.25, 0.04, 0.05, -0.35], S: [0.7, 1.6, 0.4 + SLA, 0.3, 1.2], PX: -0.8, SX: 0.3, CX: 0.1, HX: 0.35, PZ: -0.3, PY: -0.25, RZ: SLZ + 0.04, E: 1.14, AS: [-0.45, 0.9, 0.6], AK: [0.6, 0.6, 1.0] }),
    P({ K: [0.27, 0.03, 0.05, -0.3], S: [0.75, 1.65, 0.4 + SLA, 0.3, 1.2], PX: -0.85, SX: 0.32, CX: 0.1, HX: 0.35, PZ: -0.32, PY: -0.25, RZ: SLZ + 0.05, E: 1.16, AS: [-0.5, 0.85, 0.6], AK: [0.7, 0.5, 1.05] }),
    SL_END], { v0: true });
  // getting up: the body is still sliding at ~3.6 m/s as `down` starts, so the pose stays on the slide's end pose a moment (a key
  // 8% of the way to the first stand-up pose) and the legs gather only after that: no limb is thrown across the body in one frame
  const DOWN_MID = P({ K: [1.3, 1.6, 0.15, F], S: [0.9, 2.0, 0.3, 0.3, 0.5], PX: -0.4, SX: 0.55, PZ: -0.1, RZ: 0.1, E: 0.7, AS: [-0.3, 0.5, 0.5], AK: [0.5, 0.8, 0.5] });
  const DOWN = clip([0, 0.14, 0.55, 1], [SL_END, mixPose(SL_END, DOWN_MID, 0.1), DOWN_MID,
    P({ K: [0.9, 1.3, 0.08, F], S: [0.5, 1.2, 0.1, F], SX: 0.45, E: 0.4, AS: [-0.2, 0.9, 0.3], AK: [0.3, 0.9, 0.3] })]);
  function clipSlide(T, pv, st) {
    const m = st.foot, s = pv.state;
    if (pv.runPh === undefined) {     // the keeper's slide: 0.5 s on a clock of his own, then lying where he stopped
      const kt = pv.sim && s === 'slide' ? fin(pv.sim.stT, 0.25) / 0.5 : 0.6;
      play(T, SLIDE, s === 'slide' ? Math.min(kt, 0.7) : 0.7, m, hOf(st));
    } else if (s === 'down') play(T, DOWN, fin(pv.u, 0), m, hOf(st));
    else play(T, SLIDE, fin(pv.u, 0.5), m, hOf(st));
  }

  // shoulder barge: turn side-on, drop the lead shoulder and drive the weight through it over a wide base; the sim connects
  // between stT 0.03 and 0.24 of 0.34 with the bodies up to 1.5 m apart, so the lean is held from u ~ 0.25 to 0.65. The body
  // travels ~2 m, so it is two steps: the lead foot lands wide (u 0.22) and the body drives over it while the other foot,
  // lifted behind, comes through and plants ahead (u 0.62); the lead foot then trails off the turf and swings forward.
  const SHOULDER = clip([0, 0.22, 0.4, 0.62, 1], [
    P({ K: [0.4, 0.6, 0.15, F], S: [-0.2, 0.5, 0.15, F], RYAW: -0.3, SX: 0.2, E: 0.06, AK: [0.1, 1.3, 0.15], AS: [-0.2, 0.7, 0.5] }),
    P({ K: [0.55, 0.35, 0.45, F], S: [-0.3, 1.3, 0.35, 0.1], RYAW: -0.7, PITCH: 0.25, RZ: 0.25, E: 0.62, SX: 0.1, CX: 0.1, SZ: 0.1, HY: 0.5, HX: 0.05, AK: [0.15, 1.6, -0.05, -0.3], AS: [-0.4, 0.5, 0.9] }),
    P({ K: [0.1, 0.4, 0.45, F], S: [0.2, 1.2, 0.35, 0.1], RYAW: -0.85, PITCH: 0.32, RZ: 0.32, E: 0.82, SX: 0.1, CX: 0.1, SZ: 0.12, HY: 0.6, HX: 0.05, AK: [0.15, 1.7, -0.05, -0.3], AS: [-0.4, 0.5, 0.9] }),
    P({ K: [-0.3, 0.55, 0.45, 0.2], S: [0.5, 0.45, 0.35, F], RYAW: -0.9, PITCH: 0.36, RZ: 0.36, E: 0.92, SX: 0.12, CX: 0.1, SZ: 0.14, HY: 0.6, HX: 0.05, AK: [0.15, 1.75, -0.05, -0.3], AS: [-0.5, 0.45, 1.0] }),
    P({ K: [0.3, 0.9, 0.08, F], S: [-0.3, 0.55, 0.06, 0.2], RYAW: -0.15, PITCH: 0.06, RZ: 0.04, E: 0.2, SX: 0.1, HY: 0.1, AK: [-0.3, 0.9, 0.15], AS: [0.3, 0.9, 0.15] })], { v0: true });
  function clipShoulder(T, pv, st) {
    const u = fin(pv.u, 0.4), m = st.barge || 1;
    if (st.shT === undefined || fin(pv.stT, 0) < st.shT - 0.02) st.shN = (st.shN | 0) + 1;
    st.shT = fin(pv.stT, 0);
    play(T, SHOULDER, u, m, hOf(st));
    // each foot stays where it lands while the body drives over it: the lead foot from the wide step (u 0.22), the other from the step ahead (0.62)
    plantLeg(T, pv, st, m, st.shN * 2, sm(seg(u, 0.2, 0.28)) * (1 - sm(seg(u, 0.45, 0.6))));
    plantLeg(T, pv, st, -m, st.shN * 2 + 1, sm(seg(u, 0.6, 0.68)));
  }

  // ---------------------------------------------------------------- reactions
  // which way a reaction leans: the actor's own foot (st.foot, a fixed trait), else the squad number's parity
  const footOf = (pv, st) => (st && st.foot ? (st.foot > 0 ? 1 : -1) : fin(pv.idx, 0) & 1 ? -1 : 1);
  // stumble: clipped in the stride, the body pitches over the trailing leg, the arms fly out, and a long step catches it
  const STUMBLE = clip([0, 0.45, 1], [
    P({ K: [-0.5, 0.9, 0.05, 0.3], S: [0.3, 0.4, 0.1, F], SX: 0.3, PITCH: 0.08, HX: -0.1, AK: [0.8, 0.5, 0.8], AS: [-0.5, 0.4, 1.0] }),
    P({ K: [-0.2, 1.2, 0.05, 0.3], S: [-0.15, 0.55, 0.1, F], SX: 0.5, PITCH: 0.14, ROLL: 0.1, HX: -0.2, AK: [1.2, 0.3, 1.0], AS: [0.3, 0.3, 1.2] }),
    P({ K: [0.65, 1.25, 0.08, F], S: [-0.3, 1.1, 0.06, 0.2], SX: 0.3, PITCH: 0.12, AK: [-0.2, 0.8, 0.5], AS: [0.4, 0.8, 0.5] })], { v0: true });
  function clipStumble(T, pv, st) { play(T, STUMBLE, fin(pv.u, 0.5), footOf(pv, st), hOf(st)); }

  // ankle-break (0.92 s): wrong-footed one way, twisted back the other, the legs go, he sits down hard on his hands, rocks
  // forward over his feet and scrambles up. The animator turns him to face the man who did it, so backwards (RZ < 0) is the
  // direction of the fall.
  const ANKLE = clip([0, 0.1, 0.22, 0.34, 0.45, 0.6, 0.78, 0.92, 1], [
    P({ K: [0.3, 0.35, 0.45, F], S: [-0.1, 0.5, 0.25, F], PY: 0.35, CY: -0.3, SX: -0.1, ROLL: 0.15, AK: [-0.3, 0.6, 0.9], AS: [0.6, 0.5, 0.9] }),
    P({ K: [0.55, 0.2, 0.1, -0.2], S: [-0.25, 0.8, -0.05, 0.2], PY: -0.4, CY: 0.3, SX: -0.3, PITCH: -0.15, ROLL: -0.12, HX: 0.1, RZ: -0.08, AK: [1.2, 0.5, 1.0], AS: [-0.9, 0.4, 1.1] }),
    P({ K: [0.85, 0.5, 0.15, -0.2], S: [0.6, 1.2, 0.2, 0], PX: -0.45, SX: -0.15, HX: 0.3, RZ: -0.25, AK: [-0.2, 0.5, 0.9], AS: [-0.9, 0.3, 0.6] }),
    P({ K: [1.0, 0.25, 0.2, -0.2], S: [1.45, 1.45, 0.25, F], PX: -0.6, SX: -0.25, CX: 0.1, HX: 0.4, RZ: -0.4, AK: [-1.0, 0.15, 0.4], AS: [-1.0, 0.15, 0.4] }),
    P({ K: [1.2, 0.3, 0.2, -0.3], S: [1.55, 1.5, 0.25, 0.5], PX: -0.7, SX: -0.2, CX: 0.1, HX: 0.45, RZ: -0.42, AK: [-0.95, 0.25, 0.45], AS: [-0.95, 0.25, 0.45] }),
    P({ K: [1.3, 1.3, 0.2, F], S: [1.4, 1.75, 0.25, F], PX: -0.45, SX: 0.1, CX: 0.1, HX: 0.2, RZ: -0.38, AK: [-0.6, 0.4, 0.4], AS: [-0.6, 0.4, 0.4] }),
    P({ K: [1.3, 2.0, 0.2, F], S: [0.7, 2.1, 0.2, 0.4], PX: -0.1, SX: 0.55, RZ: -0.2, AK: [-0.2, 0.8, 0.4], AS: [0.5, 0.3, 0.3] }),
    P({ K: [1.0, 1.4, 0.1, F], S: [0.4, 1.3, 0.1, F], SX: 0.5, RZ: -0.06, AK: [-0.2, 0.9, 0.3], AS: [0.3, 0.8, 0.3] }),
    P({ K: [0.6, 0.9, 0.06, F], S: [0.2, 0.7, 0.06, F], SX: 0.35, AK: [-0.15, 0.9, 0.2], AS: [0.2, 0.9, 0.2] })], { v0: true });
  function clipAnkle(T, pv, st) { play(T, ANKLE, fin(pv.u, 0), footOf(pv, st), hOf(st)); }

  // celebration, a 1.6 s loop on the state clock: load, leap with a fist punched overhead, land through bent knees and pull the
  // fist down, then pump the fists in turn from a bouncing, knee-bent stance, swaying, and load again
  const CELEBRATE = (() => {
    const load = P({ K: [0.5, 1.0, 0.1, F], S: [0.5, 1.0, 0.1, F], SX: 0.3, HX: 0.1, AK: [-0.5, 1.3, 0.3], AS: [-0.5, 1.3, 0.3] });
    return clip([0, 0.1, 0.21, 0.32, 0.41, 0.56, 0.72, 0.88, 1], [load,
      P({ K: [0.1, 0.25, 0.05, 0.5], S: [0.1, 0.25, 0.05, 0.5], SX: -0.05, AK: [1.6, 1.2, 0.2], AS: [0.4, 1.4, 0.3] }),
      P({ K: [0.3, 1.1, 0.08, 0.4], S: [-0.25, 1.0, 0.08, 0.4], PY: -0.25, SX: -0.12, CX: -0.1, HX: -0.3, AK: [2.9, 0.6, 0.15], AS: [0.5, 1.7, 0.4] }),
      P({ K: [0.35, 0.75, 0.1, 0.25], S: [0.35, 0.75, 0.1, 0.25], SX: 0.1, HX: -0.05, AK: [2.3, 1.2, 0.2], AS: [0.3, 1.8, 0.4] }),
      P({ K: [0.55, 1.1, 0.12, F], S: [0.55, 1.1, 0.12, F], SX: 0.25, HX: 0.1, AK: [1.2, 2.0, 0.25], AS: [0.4, 1.9, 0.4] }),
      P({ K: [0.35, 0.7, 0.14, F], S: [0.35, 0.7, 0.14, F], SX: 0.1, CX: -0.05, HX: -0.1, PY: 0.2, ROLL: 0.05, AK: [0.9, 1.7, 0.45], AS: [0.3, 1.7, 0.5] }),
      P({ K: [0.3, 0.55, 0.14, F], S: [0.3, 0.55, 0.14, F], SX: 0.05, CX: -0.08, HX: -0.2, PY: 0.25, ROLL: 0.06, AK: [1.6, 1.8, 0.35], AS: [0.2, 1.6, 0.5] }),
      P({ K: [0.4, 0.8, 0.14, F], S: [0.4, 0.8, 0.14, F], SX: 0.15, CX: -0.05, HX: -0.2, PY: -0.25, ROLL: -0.06, AK: [0.4, 1.7, 0.5], AS: [1.5, 1.8, 0.35] }),
      load], { loop: true });
  })();
  // Celebrations (roadmap 2.5). Presentation only: the sim state `celebrate` and its timing do not change; each clip runs on the same
  // state clock (pv.stT) as the original one. All of them are in place (no root travel, feet on the turf except in the two leaps).
  // CELEB_CLIPS[id] = { clip, post? }; the loop length is ISO.CELEBS[id].dur. `st.celeb` is set from the actor (actor.celeb).
  const LEGS = (sw, kn, ab) => ({ K: [sw, kn, ab === undefined ? 0.1 : ab, F], S: [sw, kn, ab === undefined ? 0.1 : ab, F] });
  const loopC = (t, poses) => clip(t, poses, { loop: true });
  const atSec = (dur, secs, poses) => loopC(secs.map((s) => s / dur), poses);      // keys written in seconds on the state clock of a loop of dur seconds
  const ARMSW = loopC([0, 0.25, 0.5, 0.75, 1], [
    P({ ...LEGS(0.15, 0.3, 0.14), SX: -0.04, HX: -0.25, PY: 0.1, ROLL: 0.03, AK: [0.1, 0.15, 1.45], AS: [0.1, 0.15, 1.45] }),
    P({ ...LEGS(0.2, 0.42, 0.14), SX: -0.08, HX: -0.32, PY: 0, ROLL: 0.0, AK: [0.15, 0.1, 1.7], AS: [0.15, 0.1, 1.7] }),
    P({ ...LEGS(0.15, 0.3, 0.14), SX: -0.04, HX: -0.25, PY: -0.1, ROLL: -0.03, AK: [0.1, 0.15, 1.45], AS: [0.1, 0.15, 1.45] }),
    P({ ...LEGS(0.2, 0.42, 0.14), SX: -0.08, HX: -0.32, PY: 0, ROLL: 0.0, AK: [0.15, 0.1, 1.7], AS: [0.15, 0.1, 1.7] }),
    P({ ...LEGS(0.15, 0.3, 0.14), SX: -0.04, HX: -0.25, PY: 0.1, ROLL: 0.03, AK: [0.1, 0.15, 1.45], AS: [0.1, 0.15, 1.45] })]);
  const POINTU = loopC([0, 0.2, 0.4, 0.6, 0.8, 1], [
    P({ ...LEGS(0.35, 0.7, 0.1), SX: 0.2, HX: 0.1, AK: [0.6, 1.4, 0.3], AS: [0.6, 1.4, 0.3] }),
    P({ ...LEGS(0.15, 0.3, 0.1), SX: -0.05, HX: -0.3, AK: [3.0, 0.15, 0.3], AS: [3.0, 0.15, 0.15] }),
    P({ ...LEGS(0.25, 0.5, 0.1), SX: 0.0, HX: -0.3, PY: 0.08, AK: [3.05, 0.1, 0.25], AS: [2.95, 0.1, 0.2] }),
    P({ ...LEGS(0.15, 0.3, 0.1), SX: -0.05, HX: -0.3, PY: -0.08, AK: [2.95, 0.1, 0.2], AS: [3.05, 0.1, 0.25] }),
    P({ ...LEGS(0.25, 0.5, 0.1), SX: 0.0, HX: -0.3, AK: [3.0, 0.15, 0.3], AS: [3.0, 0.15, 0.15] }),
    P({ ...LEGS(0.35, 0.7, 0.1), SX: 0.2, HX: 0.1, AK: [0.6, 1.4, 0.3], AS: [0.6, 1.4, 0.3] })]);
  const SALUTE = loopC([0, 0.2, 0.5, 0.8, 1], [
    P({ ...LEGS(0.08, 0.15, 0.04), SX: 0.02, AK: [0.1, 0.3, 0.12], AS: [0.1, 0.3, 0.12] }),
    P({ ...LEGS(0.08, 0.15, 0.04), SX: 0.0, HX: -0.05, AK: [1.5, 2.3, 0.85], AS: [0.1, 0.3, 0.12] }),
    P({ ...LEGS(0.1, 0.22, 0.04), SX: 0.0, HX: -0.08, PY: 0.06, AK: [1.55, 2.35, 0.9], AS: [0.1, 0.3, 0.12] }),
    P({ ...LEGS(0.08, 0.15, 0.04), SX: 0.0, HX: -0.05, AK: [1.5, 2.3, 0.85], AS: [0.1, 0.3, 0.12] }),
    P({ ...LEGS(0.08, 0.15, 0.04), SX: 0.02, AK: [0.1, 0.3, 0.12], AS: [0.1, 0.3, 0.12] })]);
  // stiff arm poses held, then snapped: the keys come in close pairs
  const ROBOT = (() => {
    const base = { ...LEGS(0.1, 0.2, 0.08), SX: 0.02 };
    const a = P({ ...base, HY: 0.5, AK: [1.4, 1.3, 0.1], AS: [0.2, 1.3, 0.4] }), b = P({ ...base, HY: -0.5, AK: [0.2, 1.3, 0.4], AS: [1.4, 1.3, 0.1] });
    const c = P({ ...base, HY: 0.5, CY: 0.15, AK: [0.2, 1.3, 1.3], AS: [0.2, 1.3, 1.3] }), d = P({ ...base, HY: -0.5, CY: -0.15, AK: [3.0, 0.5, 0.2], AS: [0.2, 1.3, 1.3] });
    return loopC([0, 0.17, 0.25, 0.42, 0.5, 0.67, 0.75, 0.92, 1], [a, a, b, b, c, c, d, d, a]);
  })();
  const SITD = loopC([0, 0.15, 0.25, 0.8, 1], [
    P({ ...LEGS(0.15, 0.3, 0.1), SX: 0.05, AK: [0.1, 0.3, 0.12], AS: [0.1, 0.3, 0.12] }),
    P({ ...LEGS(0.9, 1.7, 0.18), SX: 0.5, HX: -0.4, AK: [0.7, 2.3, -0.1], AS: [0.7, 2.3, -0.1] }),
    P({ ...LEGS(1.2, 2.3, 0.2), SX: 0.6, HX: -0.5, AK: [0.8, 2.4, -0.15], AS: [0.8, 2.4, -0.15] }),
    P({ ...LEGS(1.2, 2.3, 0.2), SX: 0.6, HX: -0.5, HY: 0.1, AK: [0.8, 2.4, -0.15], AS: [0.8, 2.4, -0.15] }),
    P({ ...LEGS(0.15, 0.3, 0.1), SX: 0.05, AK: [0.1, 0.3, 0.12], AS: [0.1, 0.3, 0.12] })]);
  const KNEED = loopC([0, 0.2, 0.4, 0.6, 0.8, 1], [
    P({ ...LEGS(0.3, 0.6, 0.1), SX: 0.2, AK: [0.4, 1.0, 0.3], AS: [0.4, 1.0, 0.3] }),
    P({ K: [0.7, 1.5, 0.12, F], S: [0.4, 2.3, 0.12, F], SX: -0.3, CX: -0.15, HX: -0.5, AK: [0.3, 0.1, 1.3], AS: [0.3, 0.1, 1.3] }),
    P({ K: [0.8, 1.7, 0.12, F], S: [0.5, 2.5, 0.12, F], SX: -0.4, CX: -0.2, HX: -0.55, AK: [0.4, 0.1, 1.4], AS: [0.4, 0.1, 1.4] }),
    P({ K: [0.8, 1.7, 0.12, F], S: [0.5, 2.5, 0.12, F], SX: -0.35, CX: -0.2, HX: -0.55, AK: [2.6, 0.4, 0.3], AS: [2.6, 0.4, 0.3] }),
    P({ K: [0.7, 1.5, 0.12, F], S: [0.4, 2.3, 0.12, F], SX: -0.3, CX: -0.15, HX: -0.5, AK: [0.3, 0.1, 1.3], AS: [0.3, 0.1, 1.3] }),
    P({ ...LEGS(0.3, 0.6, 0.1), SX: 0.2, AK: [0.4, 1.0, 0.3], AS: [0.4, 1.0, 0.3] })]);
  // the leap with a full turn: the fist-pump keys, stretched so the flight lasts 0.6 s (the turn is about 10 rad/s)
  const SPINC = loopC([0, 0.04, 0.17, 0.29, 0.4, 0.55, 0.72, 0.9, 1], CELEBRATE.p);
  const flight = (c, a, b, T, h, lift) => { const f = seg(c, a, b); T[LIFT] = lift * h * 4 * f * (1 - f); T[GROUND] = 1 - sm(seg(c, a, a + 0.05)) * (1 - sm(seg(c, b - 0.05, b))); return f; };
  // ---- the sixteen celebrations of the second set (the replicas of famous goal celebrations, and the dances). Same rules: in place, on the
  // state clock, authored for a right-sided lead (the left-footed player gets the mirror), ground fit by GROUND. Poses written for one side
  // and played on the other go through flip(). The sim shows the first 1.7 s of a goal and a replayed goal cuts away after 0.75 s, so every identifying pose is reached by about 0.5 s.
  const flip = (p) => { const q = new Float32Array(p.length); for (let i = 0; i < N; i++) q[MIR[i]] = p[i] * SGN[i]; q[N] = p[N]; return q; };
  const wrist = (p, k, s) => { p[ARM_R + 4] = k; p[ARM_L + 4] = s === undefined ? k : s; return p; };
  const STAND = P({ ...LEGS(0.12, 0.25, 0.08), SX: 0.04, AK: [0.25, 0.7, 0.12], AS: [0.25, 0.7, 0.12] });
  // n equally spaced keys of a periodic motion: f(u) gives the key spec at u (0 <= u < 1); the loop closes on the first key
  const wave = (n, f) => { const t = [], p = []; for (let i = 0; i <= n; i++) { t.push(i / n); { const o = f(i === n ? 0 : i / n); p.push(o instanceof Float32Array ? o : P(o)); } } return loopC(t, p); };
  const SN = (u, f, ph) => Math.sin(TAU * (u * f + (ph || 0)));
  const LG = (swK, knK, swS, knS, ab) => ({ K: [swK, knK, ab === undefined ? 0.1 : ab, F], S: [swS, knS, ab === undefined ? 0.1 : ab, F] });

  // corner flag slide (2.4 s): on one hip and one knee, torso back, the right fist punched up by 0.45 s; hold, pump, rise
  const CF_D = P({ K: [0.8, 0.45, 0.15, F], S: [0.35, 1.5, 0.2, 0.5], SX: -0.1, ROLL: -0.08, AK: [1.9, 0.6, 0.35], AS: [0.5, 0.7, 0.9] });
  const CF_S = P({ K: [1.2, 0.12, 0.14, -0.3], S: [0.35, 2.4, 0.24, 1.0], SX: -0.4, CX: -0.12, HX: -0.2, ROLL: -0.2, AK: [2.9, 0.25, 0.4], AS: [0.5, 0.5, 1.05] });
  const CF_P = P({ SX: -0.45, HX: -0.3, ROLL: -0.23, AK: [3.05, 0.15, 0.45] }, CF_S);
  const CORNERFLAG = atSec(2.4, [0, 0.2, 0.45, 0.7, 0.95, 1.2, 2.0, 2.4], [STAND, CF_D, CF_S, CF_P, CF_S, CF_P, CF_D, STAND]);
  // arm over the eyes (2.0 s): the right forearm across the eyes, the left fist clenched at the hip, a small head shake, the weight shifting
  const BL = P({ ...LG(0.1, 0.2, 0.1, 0.2), SX: -0.02, HX: 0.12, AK: [0.88, 1.93, 1.39, -1.13], AS: [0.2, 1.3, 0.3] });
  const BLIND = loopC([0, 0.14, 0.3, 0.44, 0.58, 0.72, 0.86, 1], [STAND, BL,
    P({ HY: 0.22, PY: 0.07, ROLL: 0.03, RX: 0.02 }, BL), P({ HY: -0.22, PY: -0.07, ROLL: -0.03, RX: -0.02 }, BL),
    P({ HY: 0.22, PY: 0.07, ROLL: 0.03, RX: 0.02 }, BL), P({ HY: -0.22, PY: -0.07, ROLL: -0.03, RX: -0.02 }, BL), BL, STAND]);
  // heart hands (2.0 s): the hands meet in front of the chest, pushed out toward the crowd by 0.5 s, pull back, push again, a small bounce
  const HT_G = wrist(P({ ...LG(0.18, 0.36, 0.18, 0.36), SX: 0.05, HX: 0.1, AK: [0.04, 1.94, -0.02, -0.55], AS: [0.04, 1.94, -0.02, -0.55] }), 0.5);
  const HT_P = wrist(P({ SX: 0.1, HX: 0.05, AK: [0.81, 0.66, -0.54, 0.41], AS: [0.81, 0.66, -0.54, 0.41] }, HT_G), 0.4);
  const HT_B = P({ ...LG(0.3, 0.6, 0.3, 0.6) }, HT_G);
  const HEART = atSec(2.0, [0, 0.24, 0.5, 1.0, 1.5, 1.72, 1.88, 2.0], [STAND, HT_G, HT_P, HT_G, HT_P, HT_B, HT_G, STAND]);
  // knockout (2.6 s): guard, a jab at 0.17 s and a cross at 0.39 s with the trunk turning into each punch, stagger, down flat on the back by 0.9 s, arms out, lie, sit up
  const KO_G = P({ RYAW: 0.6, K: [0.3, 0.5, 0.14, F], S: [-0.3, 0.5, 0.14, F], SX: 0.25, CX: 0.05, HX: -0.05, AK: [1.0, 2.2, 0.15], AS: [1.0, 2.2, 0.15] });
  const KO_J = P({ CY: -0.25, SY: -0.1, AK: [1.5, 0.15, 0.1], AS: [1.0, 2.3, 0.1] }, KO_G);
  const KO_C = P({ CY: 0.4, SY: 0.15, PY: 0.15, AK: [1.0, 2.3, 0.15], AS: [1.5, 0.15, 0.1] }, KO_G);
  const KO_S = P({ ...LG(0.1, 0.2, 0.1, 0.2), SX: -0.1, CX: -0.1, HX: -0.4, AK: [0.3, 0.5, 0.9], AS: [0.3, 0.5, 0.9] });
  const KO_F = P({ ...LG(0.02, 0.08, 0.02, 0.08, 0.2), PITCH: -1.45, RZ: 0.6, HX: 0.1, AK: [0.1, 0.15, 1.5], AS: [0.1, 0.15, 1.5] });
  KO_F[LEG_L + 4] = KO_F[LEG_R + 4] = 0.15;
  const KO_U = P({ K: [0.7, 1.2, 0.1, F], S: [0.5, 1.0, 0.1, F], PITCH: -0.9, RZ: 0.4, SX: 0.7, AK: [0.9, 0.8, 0.5], AS: [0.9, 0.8, 0.5] });
  const KO_U2 = P({ K: [0.5, 1.0, 0.1, F], S: [0.5, 1.0, 0.1, F], PITCH: -0.25, RZ: 0.1, SX: 0.5, AK: [0.8, 1.2, 0.3], AS: [0.8, 1.2, 0.3] });
  const KNOCKOUT = atSec(2.6, [0, 0.05, 0.17, 0.27, 0.39, 0.52, 0.7, 0.9, 1.4, 1.9, 2.15, 2.35, 2.6], [KO_G, KO_G, KO_J, KO_G, KO_C, KO_S,
    P({ PITCH: -0.7, RZ: 0.3, SX: -0.3 }, KO_F), KO_F, KO_F, KO_F, KO_U, KO_U2, KO_G]);
  // tree pose (2.4 s): settled by 0.5 s, on the left leg, the right foot against the inner thigh with the knee out, palms pressed at the chest, a slight sway
  const TR_R = P({ S: [0.0, 0.05, 0.04, F], K: [1.96, 2.38, 1.58, 0.5, 0.95], HX: 0.05, AK: [0.03, 2.19, -0.03, -0.61], AS: [0.03, 2.19, -0.03, -0.61] });
  wrist(TR_R, 0.3);
  const TR_A = P({ ROLL: 0.05, RX: 0.03, HZ: 0.04 }, TR_R), TR_B = P({ ROLL: -0.05, RX: -0.03, HZ: -0.04 }, TR_R);
  const TREE = atSec(2.4, [0, 0.24, 0.5, 0.96, 1.44, 1.92, 2.4], [STAND, P({ K: [0.5, 1.5, 0.5, 0.3], S: [0.0, 0.1, 0.04, F], AK: [0.6, 2.0, 0.1], AS: [0.6, 2.0, 0.1] }, STAND), TR_R, TR_A, TR_B, TR_R, STAND]);
  // the dab (1.8 s): head tucked into the bent left elbow, the right arm thrown up diagonally by 0.17 s; held to 0.7 s, then the other side
  const DB_R = P({ ...LG(0.15, 0.3, 0.15, 0.3, 0.12), SX: 0.18, CX: 0.05, CY: 0.2, HX: 0.55, HY: -0.4, AK: [2.5, 0.15, 0.75], AS: [1.25, 2.4, -0.05] });
  const DB_L = flip(DB_R), DB_0 = P({ ...LG(0.3, 0.6, 0.3, 0.6), SX: 0.15, AK: [0.9, 1.6, 0.2], AS: [0.9, 1.6, 0.2] });
  const DAB = atSec(1.8, [0, 0.08, 0.17, 0.4, 0.68, 0.9, 0.98, 1.07, 1.3, 1.58, 1.8], [DB_0, P({ SX: 0.12, AK: [1.9, 0.5, 0.5], AS: [1.1, 2.0, 0.1], HX: 0.3 }, DB_R), DB_R, P({ AK: [2.6, 0.15, 0.8] }, DB_R), DB_R, DB_0,
    P({ SX: 0.12, AK: [1.1, 2.0, 0.1], AS: [1.9, 0.5, 0.5], HX: 0.3 }, DB_L), DB_L, P({ AS: [2.6, 0.15, 0.8] }, DB_L), DB_L, DB_0]);
  // knee slide (2.2 s): on both knees and leaning back by 0.4 s, torso leaned back, head back, fists at the sides; rock back and forth, rise
  const KS_D = P({ ...LG(0.4, 1.2, 0.4, 1.2), SX: 0.1, AK: [0.3, 1.0, 0.4], AS: [0.3, 1.0, 0.4] });
  const KS_S = P({ K: [0.05, 2.4, 0.12, 1.3], S: [0.05, 2.4, 0.12, 1.3], SX: -0.4, CX: -0.15, HX: -0.6, AK: [-0.1, 0.45, 0.4], AS: [-0.1, 0.45, 0.4] });
  const KS_R = P({ SX: -0.5, CX: -0.2, HX: -0.7, AK: [0.0, 0.5, 0.7], AS: [0.0, 0.5, 0.7] }, KS_S);
  const KNEESLIDE = atSec(2.2, [0, 0.18, 0.4, 0.8, 1.2, 1.55, 1.9, 2.2], [STAND, KS_D, KS_S, KS_R, KS_S, KS_R, KS_D, STAND]);
  // cold (2.0 s): arms crossed, the hands rubbing the upper arms, shoulders hunched, a fast small shiver
  const COLD = wave(80, (u) => { const s = SN(u, 10), r = 0.5 + 0.5 * SN(u, 3);
    return wrist(P({ ...LG(0.12 + 0.02 * s, 0.3 + 0.05 * s, 0.12 - 0.02 * s, 0.3 - 0.05 * s, 0.08), SX: 0.18 + 0.02 * s, CX: 0.1, NX: 0.1, HX: 0.22, HZ: 0.03 * s, ROLL: 0.015 * s, PY: 0.02 * s,
      AK: [0.26 + 0.35 * r, 1.55 + 0.1 * r, -1.07 - 0.2 * r, -0.76], AS: [0.58 - 0.3 * r, 1.51, -1, -0.61] }), 0.3); });
  // griddy (1.6 s): goggles at the eyes from the first beat, heel taps from side to side (0.4 s per tap), then from 0.8 s the arms swinging
  const GR_A = wrist(P({ K: [0.5, 0.05, 0.14, -0.5], S: [0.3, 1.0, 0.14, F], SX: 0.1, PY: 0.15, ROLL: 0.05, AK: [0.79, 2.13, 1.38, -0.67], AS: [0.79, 2.13, 1.38, -0.67] }), 0.4);
  const GR_B = flip(GR_A), GR_M = P({ ...LG(0.25, 0.6, 0.25, 0.6), SX: 0.1, PY: 0, ROLL: 0 }, GR_A);
  const GR_C = P({ AK: [0.9, 0.5, 0.35], AS: [-0.5, 0.5, 0.25] }, GR_A), GR_D = flip(GR_C);
  const GR_0 = mixPose(GR_M, STAND, 0.5);      // the loop opens halfway between the stride before it and the goggles
  const GRIDDY = atSec(1.6, [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6], [GR_0, GR_A, GR_M, GR_B, GR_M, GR_C, GR_M, GR_D, GR_0]);
  // jump and turn (2.4 s): the step, a leap (0.2 - 0.65 s) with a half turn, a wide landing with both arms thrown down and back, chest out; the turn
  // goes out through the flight and back over the end of the loop (post), so it never accumulates
  const JT_L = P({ ...LG(0.55, 1.1, 0.4, 0.9), SX: 0.3, HX: 0.1, AK: [-0.6, 0.6, 0.25], AS: [-0.6, 0.6, 0.25] });
  const JT_A = P({ K: [0.5, 0.9, 0.14, 0.3], S: [-0.3, 1.2, 0.14, 0.3], SX: 0.05, AK: [1.2, 1.2, 0.8], AS: [1.2, 1.2, 0.8] });
  const JT_W = P({ K: [0.1, 0.55, 0.45, F], S: [0.1, 0.55, 0.45, F], SX: -0.18, CX: -0.15, HX: -0.25, AK: [-0.7, 0.1, 0.6], AS: [-0.7, 0.1, 0.6] });
  const JT_H = P({ SX: -0.22, CX: -0.18, HX: -0.3, AK: [-0.8, 0.1, 0.7], AS: [-0.8, 0.1, 0.7] }, JT_W);
  const JUMPTURN = atSec(2.4, [0, 0.1, 0.25, 0.5, 0.68, 0.85, 1.6, 2.0, 2.4], [STAND, JT_L, JT_A, JT_A, JT_W, JT_H, JT_H, P({ ...LG(0.2, 0.4, 0.2, 0.4) }, STAND), STAND]);
  // backflip (2.0 s): crouch (0.07 s), launch at 0.10 s, land at 0.62 s (a replayed goal cuts away after 0.75 s: the landing is on screen), with the arms swung back, launch, a full backward somersault (PITCH, post), tuck, open, land through bent knees, arms out
  const BF_C = P({ ...LG(0.7, 1.4, 0.7, 1.4), SX: 0.45, HX: 0.1, AK: [-0.4, 0.3, 0.2], AS: [-0.4, 0.3, 0.2] });
  const BF_L = P({ ...LG(0.1, 0.15, 0.1, 0.15), SX: 0.0, HX: -0.15, AK: [2.0, 0.2, 0.3], AS: [2.0, 0.2, 0.3] });
  const BF_T = P({ ...LG(1.8, 2.4, 1.8, 2.4), SX: 0.5, CX: 0.2, HX: -0.1, AK: [1.2, 1.7, 0.2], AS: [1.2, 1.7, 0.2] });
  const BF_O = P({ ...LG(0.4, 0.8, 0.4, 0.8), SX: 0.0, HX: -0.1, AK: [0.4, 0.3, 1.2], AS: [0.4, 0.3, 1.2] });
  const BF_D = P({ ...LG(0.55, 1.1, 0.55, 1.1), SX: 0.25, AK: [0.3, 0.3, 1.4], AS: [0.3, 0.3, 1.4] });
  const BACKFLIP = atSec(2.0, [0, 0.07, 0.16, 0.28, 0.4, 0.54, 0.68, 0.95, 2.0], [STAND, BF_C, BF_L, BF_T, BF_T, BF_O, BF_D, BF_D, STAND]);
  // samba (1.6 s): quick side steps, the hips swaying against the shoulders, the arms rolling at the sides
  const SAMBA = wave(32, (u) => { const s = SN(u, 4), c = SN(u, 4, 0.25), a = Math.max(0, s), b = Math.max(0, -s);
    return P({ K: [0.15 + 0.1 * a, 0.35 + 0.2 * b, 0.05 + 0.4 * a, F], S: [0.15 + 0.1 * b, 0.35 + 0.2 * a, 0.05 + 0.4 * b, F], PZ: 0.14 * s, SZ: -0.2 * s, CZ: -0.08 * s, PY: 0.3 * s, CY: -0.3 * s, ROLL: 0.05 * s, SX: 0.1, HZ: 0.06 * s,
      AK: [0.6 + 0.5 * c, 1.4, 0.7 + 0.4 * s], AS: [0.6 - 0.5 * c, 1.4, 0.7 - 0.4 * s] }); });
  // floss (1.6 s): straight arms swing together to one side, one in front of the hips and one behind, the hips going the other way
  const FL_L = P({ ...LG(0.15, 0.4, 0.15, 0.4, 0.12), SX: 0.12, PZ: -0.1, ROLL: 0.0, RX: 0.08, SZ: 0.1, CY: 0.0, HX: 0.0, AK: [0.55, 0.05, -0.6], AS: [-0.45, 0.05, 0.9] });
  const FL_R = flip(FL_L);
  const FLOSS = loopC([0, 0.25, 0.5, 0.75, 1], [FL_L, FL_R, FL_L, FL_R, FL_L]);
  // shoulder shimmy (1.6 s): the shoulders roll alternately forward and back, a slight squat, the head nodding, the arms low
  const SHIMMY = wave(48, (u) => { const s = SN(u, 4), d = SN(u, 4, 0.25);
    return P({ ...LG(0.35, 0.75, 0.35, 0.75, 0.14), SX: 0.15, CY: 0.55 * s, CZ: 0.18 * d, SY: 0.15 * s, HY: -0.45 * s, HX: 0.12 * SN(u, 2, 0.25), PY: -0.05 * s,
      AK: [0.3 + 0.2 * s, 1.3, 0.55], AS: [0.3 - 0.2 * s, 1.3, 0.55] }); });
  // running man (1.6 s): in place, a knee lifting and the other foot sliding back on the toes, the arms pumping
  const RM_A = P({ K: [1.05, 1.7, 0.06, F], S: [0.15, 0.45, 0.06, F], SX: 0.12, HX: -0.05, AK: [-0.45, 1.7, 0.1], AS: [0.9, 1.7, 0.1] });
  const RM_M = P({ K: [0.5, 0.6, 0.06, F], S: [-0.25, 0.4, 0.06, 0.5], SX: 0.12, AK: [0.2, 1.7, 0.1], AS: [0.2, 1.7, 0.1] });
  const RM_B = flip(RM_A), RM_N = flip(RM_M);
  const RUNMAN = loopC([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], [RM_A, RM_M, RM_B, RM_N, RM_A, RM_M, RM_B, RM_N, RM_A]);
  // moonwalk (2.4 s): the right foot on its toes with the heel up, the left flat and gliding back, then the other way; relaxed arms, a hat tip at 0.3 s
  const MW_A = P({ K: [-0.25, 0.4, 0.06, 1.0], S: [0.25, 0.08, 0.06, F], SX: -0.06, HX: -0.1, AK: [0.15, 0.5, 0.12], AS: [0.2, 0.5, 0.12] });
  const MW_B = flip(MW_A);
  const MW_T = P({ AK: [1.42, 2.0, -0.62, -0.17], HX: 0.15 }, MW_A);      // the hat tip, on the first beat
  const MW_M = mixPose(MW_A, MW_B, 0.5);      // the loop opens with the feet level, as they pass
  const MOONWALK = atSec(2.4, [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4], [MW_M, MW_T, MW_M, MW_B, MW_M, MW_A, MW_M, MW_B, MW_M]);
  const FL_PIVOT = 1.05;      // m: where the backflip turns about, above the turf (the waist: a smaller head radius keeps the head's speed in the gate while the flip is short)
  const CELEB_CLIPS = {
    fist: { clip: CELEBRATE, post(T, c, pv, st, n, h) { const f = seg(c, 0.1, 0.32); T[LIFT] = 0.36 * h * 4 * f * (1 - f); T[GROUND] = 1 - sm(seg(c, 0.1, 0.15)) * (1 - sm(seg(c, 0.27, 0.32))); } },
    arms: { clip: ARMSW }, point: { clip: POINTU }, salute: { clip: SALUTE }, robot: { clip: ROBOT }, sit: { clip: SITD }, knee: { clip: KNEED },
    spin: { clip: SPINC, post(T, c, pv, st, n, h) { const f = flight(c, 0.042, 0.292, T, h, 0.4); T[RYAW] = TAU * (n + f * f * (3 - 2 * f)); } },
    cornerflag: { clip: CORNERFLAG }, blind: { clip: BLIND }, heart: { clip: HEART }, knockout: { clip: KNOCKOUT }, tree: { clip: TREE }, dab: { clip: DAB },
    kneeslide: { clip: KNEESLIDE }, cold: { clip: COLD }, griddy: { clip: GRIDDY }, samba: { clip: SAMBA }, floss: { clip: FLOSS }, shimmy: { clip: SHIMMY },
    runman: { clip: RUNMAN }, moonwalk: { clip: MOONWALK },
    jumpturn: { clip: JUMPTURN, post(T, c, pv, st, n, h, m) { flight(c, 0.083, 0.271, T, h, 0.45); T[RYAW] = m * Math.PI * (sm(seg(c, 0.085, 0.27)) - sm(seg(c, 0.8, 1))); } },
    // the somersault turns about the hips: PITCH runs on through whole turns like the spin's yaw (a loop never unwinds), and the root makes up the
    // offset between the feet and the turning point
    backflip: { clip: BACKFLIP, post(T, c, pv, st, n, h) {
      const f = flight(c, 0.05, 0.335, T, h, 0.5), th = -TAU * (n + 0.55 * f + 0.45 * f * f * (3 - 2 * f)), a = FL_PIVOT * h;
      T[PITCH] = th; T[RZ] += -a * Math.sin(th); T[LIFT] += a * (1 - Math.cos(th));
    } },
  };
  // the loop length of each clip as authored (s on the state clock); ISO.CELEBS[id].dur is the one in use, this is the fallback for an id the data does not list
  const CELEB_DUR = { cornerflag: 2.4, blind: 2.0, heart: 2.0, knockout: 2.6, tree: 2.4, dab: 1.8, kneeslide: 2.2, cold: 2.0, griddy: 1.6, jumpturn: 2.4, backflip: 2.0, samba: 1.6, floss: 1.6, shimmy: 1.6, runman: 1.6, moonwalk: 2.4 };
  const celebDur = (id) => { const c = ISO.celebById ? ISO.celebById(id) : null; return fin(c && c.id === id ? c.dur : CELEB_DUR[id], fin(c && c.dur, 1.6)); };
  function clipCelebrate(T, pv, st) {
    const id = CELEB_CLIPS[st && st.celeb] ? st.celeb : 'fist', CD = CELEB_CLIPS[id], dur = celebDur(id), h = hOf(st), m = footOf(pv, st);
    const x = fin(pv.stT, 0) / dur, n = Math.floor(x), c = x - n;
    play(T, CD.clip, c, m, h);
    if (CD.post) CD.post(T, c, pv, st, n, h, m);      // the leaps: the flight is a parabola, the feet are released from the turf only while it lasts
  }

  Object.assign(Clips, { kick: clipKick, kickReady, tackle: clipTackle, slide: clipSlide, stumble: clipStumble, ankle: clipAnkle, celebrate: clipCelebrate, celebDur, celebClips: CELEB_CLIPS, shoulder: clipShoulder, kickVariant });
})();
