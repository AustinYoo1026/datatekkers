/* ISO FOOTBALL 3D — animator for the rigid-segment character of player3d.js.

   ISO.R3D.Anim.create(actor) -> { update(pv, dt, ballWorld?), reset(), pose }
     pv         PlayerView or KeeperView (spec section 3; metres / radians / seconds). Plain data, read only.
     dt         real seconds since the last frame (0 = paused: the pose is re-applied, nothing advances)
     ballWorld  optional { x, y, z } in world metres (vf.ball: y = height of the ball's lowest point). Used for the
                striking-foot IK (contact point latched at the kick), keeper hand IK on catches / dives, and head look-at.
                Without it the clips still play, only IK and look-at are skipped.
   update() also places the actor: group.position = (pv.x, 0, pv.z), group.rotation.y = eased pv.yaw, group.visible = !pv.hidden.

   Pose = Float32Array(40) of named channels. The target pose is composed every frame in layers
     L0 locomotion (phase = pv.runPh, so planted feet track the ground)   L1 stances (weights eased at 10/s)
     L2 actions (override, priority as render.js playerPose)             L3 procedural additive (lean, bank, turn, look-at, breath)
   and the drawn pose eases toward it with pose += (target - pose) * (1 - exp(-rate dt)), rate per state as render.js.
   Action clocks come from the sim (pv.u, pv.kickT, pv.skill.u, pv.charge.f, pv.fakeU). The only local timers are the
   cosmetic turn-pivot, breathing and the keeper throw (KeeperView has no throw clock; it is started by save.kind
   'throw' or by holding -> not holding). No allocation per frame. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
  const fin = (v, d) => (typeof v === 'number' && v === v ? v : d);

  // ---------------------------------------------------------------- channels
  // lateral body channels are "positive = toward the character's right"; limb channels are per side:
  // arm +0 swing fwd, +1 abduct out, +2 twist out, +3 elbow flex, +4 wrist;  leg +0 swing fwd, +1 abduct out, +2 toe out, +3 knee flex, +4 ankle (toe down)
  const N = 40;
  const RX = 0, LIFT = 1, RZ = 2, RYAW = 3, PITCH = 4, ROLL = 5, PX = 6, PY = 7, PZ = 8, SX = 9, SY = 10, SZ = 11, CX = 12, CY = 13, CZ = 14,
    NX = 15, HX = 16, HY = 17, HZ = 18, ARM_L = 19, ARM_R = 24, LEG_L = 29, LEG_R = 34, GROUND = 39;
  const CH = { RX, LIFT, RZ, RYAW, PITCH, ROLL, PX, PY, PZ, SX, SY, SZ, CX, CY, CZ, NX, HX, HY, HZ, ARM_L, ARM_R, LEG_L, LEG_R, GROUND };
  const arm = (s) => (s > 0 ? ARM_R : ARM_L), leg = (s) => (s > 0 ? LEG_R : LEG_L);
  const REST = new Float32Array(N);
  REST[ARM_L + 1] = REST[ARM_R + 1] = 0.1; REST[ARM_L + 3] = REST[ARM_R + 3] = 0.25;
  REST[LEG_L + 1] = REST[LEG_R + 1] = 0.04; REST[LEG_L + 3] = REST[LEG_R + 3] = 0.06; REST[GROUND] = 1;

  function setLeg(T, s, sw, kn, ab, an, tw) { const b = leg(s); T[b] = sw; T[b + 3] = kn; if (ab !== undefined) T[b + 1] = ab; if (an !== undefined) T[b + 4] = an; if (tw !== undefined) T[b + 2] = tw; }
  function setArm(T, s, sw, el, ab, tw) { const b = arm(s); T[b] = sw; T[b + 3] = el; if (ab !== undefined) T[b + 1] = ab; if (tw !== undefined) T[b + 2] = tw; }
  function arms(T, sw, el, ab) { setArm(T, 1, sw, el, ab); setArm(T, -1, sw, el, ab); }
  // bend both knees keeping the feet under the hips and flat
  function crouch(T, q) { for (let i = 0; i < 2; i++) { const b = i ? LEG_R : LEG_L; T[b] += q; T[b + 3] += 2 * q; T[b + 4] -= q; } T[SX] += 0.45 * q; }
  function easeW(W, i, v, k) { W[i] += (v - W[i]) * k; }
  function lerpInto(T, src, w, from, to) { for (let i = from; i < to; i++) T[i] += (src[i] - T[i]) * w; }

  const STRIDE_M = ((ISO.C && ISO.C.STRIDE) || 44) * ((R3D.K && R3D.K.S) || 0.05);    // metres per full stride at a jog

  // ---------------------------------------------------------------- L0 locomotion
  // One leg's cycle: stance for a duty fraction D centred on phase PI, swing for the rest (left leg ph, right ph + PI).
  // Stance is solved so the ankle moves exactly linearly relative to the hip (hip-ankle angle = asin(z / Leff(knee)) plus
  // the knee's own offset), with the foot kept flat: the planted foot does not slide while runPh advances with distance.
  // STANCE[0/1] = is the left / right foot planted (read by the ground lock; both 0 = flight).
  const STANCE = new Float32Array(2);
  function legCycle(T, s, p, d, D, dirF, dirR, mv, kneeAmp, drive, stanceFlex, th, sh) {
    const b = leg(s);
    let q = p % TAU; if (q < 0) q += TAU;
    const s0 = PI - PI * D, s1 = PI + PI * D;
    let th0, kn, an = 0, extra = 0;
    if (q >= s0 && q <= s1) {             // stance: ankle from +d to -d
      const t = (q - s0) / (s1 - s0);
      kn = 0.1 + stanceFlex * Math.sin(PI * t);
      const Le = Math.sqrt(th * th + sh * sh + 2 * th * sh * Math.cos(kn));
      th0 = Math.asin(clamp((d * (1 - 2 * t)) / Le, -0.95, 0.95));
      STANCE[s > 0 ? 1 : 0] = 1;
    } else {                              // swing: toe-off -> heel strike, the knee folds to clear the turf
      const t = q > s1 ? (q - s1) / (TAU - (s1 - s0)) : (q + TAU - s1) / (TAU - (s1 - s0));
      const Le0 = Math.sqrt(th * th + sh * sh + 2 * th * sh * Math.cos(0.1)), A = Math.asin(clamp(d / Le0, 0, 0.95));
      kn = 0.1 + kneeAmp * Math.pow(Math.sin(PI * t), 0.8);
      th0 = lerp(-A, A, sm(t)); extra = drive * Math.sin(PI * t); an = 0.3 * Math.sin(PI * t);
      STANCE[s > 0 ? 1 : 0] = 0;
    }
    const beta = Math.atan2(sh * Math.sin(kn), th + sh * Math.cos(kn));      // a bent knee puts the ankle behind the thigh line
    const swF = (th0 + extra) * dirF + beta;
    T[b] += swF * mv;
    T[b + 1] += clamp(th0 * dirR * s, -0.2, 0.7) * mv;
    T[b + 3] += (kn - 0.06) * mv;
    T[b + 4] += (swF - kn + an) * mv;                                         // flat foot (absolute pitch = -swing + knee + ankle)
  }
  // gait: 0 walk .. 1 jog;  k: sprint 0..1;  mv: moving weight; R: actor.rig
  function locomotion(T, ph, strideLen, R, dirF, dirR, mv, gait, k, armK) {
    STANCE[0] = STANCE[1] = 1;
    if (mv < 1e-3) return;
    const D = lerp(lerp(0.5, 0.4, gait), 0.34, k);
    const d = (D * strideLen) / 2;
    const kneeAmp = lerp(lerp(0.55, 1.15, gait), 1.6, k), drive = lerp(0.0, 0.1, gait) + 0.2 * k, flex = lerp(0.1, 0.3, gait);
    const th = R.thigh || 0.44, sh = R.shin || 0.42;
    legCycle(T, -1, ph, d, D, dirF, dirR, mv, kneeAmp, drive, flex, th, sh);
    legCycle(T, 1, ph + PI, d, D, dirF, dirR, mv, kneeAmp, drive, flex, th, sh);
    const sl = Math.sin(ph), aF = Math.abs(dirF);
    const armAmp = lerp(lerp(0.32, 0.72, gait), 1.05, k) * mv * armK * (0.35 + 0.65 * aF);
    const el = lerp(lerp(0.35, 1.15, gait), 1.5, k) * mv;
    // arms counter-swing: the left arm goes forward with the right leg
    T[ARM_L] += armAmp * -sl * Math.sign(dirF || 1); T[ARM_R] += armAmp * sl * Math.sign(dirF || 1);
    T[ARM_L + 3] += el; T[ARM_R + 3] += el; T[ARM_L + 1] += 0.06 * k * mv + 0.12 * Math.abs(dirR) * mv; T[ARM_R + 1] += 0.06 * k * mv + 0.12 * Math.abs(dirR) * mv;
    const fwd = Math.max(0, dirF), back = Math.max(0, -dirF);
    T[SX] += (0.04 + 0.07 * gait + 0.16 * k) * mv * fwd + 0.06 * back * mv;
    T[CX] += 0.03 * k * mv * fwd;
    T[PY] += 0.11 * sl * mv * dirF; T[CY] -= 0.14 * sl * mv * dirF;
    T[HX] -= 0.04 * k * mv;
  }

  // ---------------------------------------------------------------- L2 action clips (pure functions of the sim clocks)
  // the striking leg: back-swing -> through the ball (first 20% of kickT) -> follow-through
  const KICK = {    //   back  peak  end  kneeBack kneeHit kneeEnd
    normal: [-0.95, 1.35, 0.45, 1.3, 0.1, 0.35], power: [-1.2, 1.65, 0.95, 1.5, 0.05, 0.3], finesse: [-0.7, 0.95, 0.55, 1.1, 0.3, 0.35],
    chip: [-0.7, 0.75, 0.3, 1.1, 0.6, 0.5], cross: [-1.0, 1.2, 0.7, 1.2, 0.2, 0.35], pass: [-0.35, 0.62, 0.35, 0.6, 0.28, 0.25],
    volley: [-0.6, 1.5, 0.9, 1.1, 0.15, 0.3],
  };
  function kickVariant(kk) {
    if (!kk) return 'normal';
    const t = kk.type;
    if (t == null) return 'pass';
    if (kk.cross) return 'cross';
    if (kk.high) return 'header';
    if ((kk.z || 0) >= 8 && t !== 'chip') return 'volley';
    if (t === 'first-time') return 'normal';
    return KICK[t] ? t : 'normal';
  }
  function clipKick(T, pv, st) {
    const kk = pv.kick, v = kickVariant(kk);
    const m = kk && kk.foot ? (kk.foot > 0 ? 1 : -1) : st.foot;
    const dur = kk && kk.type == null ? 0.25 : 0.3;
    const k = clamp(1 - pv.kickT / dur, 0, 1), a = clamp(k / 0.2, 0, 1), f = clamp((k - 0.2) / 0.8, 0, 1), hit = k < 0.2;
    st.ikSide = m; st.kickK = k;
    const kb = leg(m), pb = leg(-m);
    // plant leg and counter-balancing arms (shared)
    setLeg(T, -m, -0.12, 0.38, 0.08, -0.1, 0.1);
    setArm(T, m, -0.75, 0.45, 0.5); setArm(T, -m, 0.75, 0.45, 0.65);
    T[PY] = -m * (hit ? lerp(-0.15, 0.3, sm(a)) : lerp(0.3, 0.1, f));
    T[CY] = m * (hit ? 0.15 : 0.1);
    if (v === 'header') {
      setLeg(T, m, 0.25, 0.6, 0.06, 0.2); setLeg(T, -m, 0.15, 0.5, 0.06, 0.2);
      arms(T, 0.35, 0.6, 0.85);
      T[SX] = hit ? lerp(-0.35, 0.45, sm(a)) : lerp(0.45, 0.15, f); T[HX] = hit ? lerp(-0.35, 0.5, sm(a)) : lerp(0.5, 0.1, f);
      T[LIFT] = 0.22 * Math.sin(PI * k); T[GROUND] = 0; T[PY] = 0; T[CY] = 0;
      st.ikSide = 0;
      return;
    }
    const c = KICK[v];
    T[kb] = hit ? lerp(c[0], c[1], sm(a)) : lerp(c[1], c[2], sm(f));
    T[kb + 3] = hit ? lerp(c[3], c[4], a) : lerp(c[4], c[5], f);
    T[kb + 1] = 0.08; T[kb + 2] = 0; T[kb + 4] = 0.45;
    T[SX] = hit ? 0.12 : lerp(0.12, -0.1, f);
    if (v === 'power') {
      T[SX] = hit ? 0.28 : lerp(0.28, 0.05, f);
      if (!hit) { T[GROUND] = 1 - Math.sin(PI * f); T[LIFT] = 0.12 * Math.sin(PI * f); T[pb] = lerp(-0.12, -0.35, Math.sin(PI * f)); T[pb + 3] = lerp(0.38, 0.8, Math.sin(PI * f)); }
    } else if (v === 'finesse') {
      T[kb + 2] = 0.61; T[kb + 4] = 0.1; if (!hit) T[kb + 1] = lerp(0.08, -0.3, sm(f));
      T[ROLL] = -m * 0.18; T[SZ] = -m * 0.08;
    } else if (v === 'chip') {
      T[kb + 4] = -0.25; T[SX] = hit ? lerp(0.05, -0.22, a) : -0.22; T[PITCH] = -0.05;
    } else if (v === 'cross') {
      T[kb + 2] = -0.2; if (!hit) T[kb + 1] = lerp(0.08, -0.35, sm(f));
      T[SX] = -0.2; T[ROLL] = -m * 0.12;
    } else if (v === 'pass') {
      T[kb + 2] = 0.8; T[kb + 4] = 0.05; T[SX] = 0.05; T[PY] *= 0.4;
      setArm(T, m, -0.3, 0.4, 0.3); setArm(T, -m, 0.3, 0.4, 0.35);
    } else if (v === 'volley') {
      T[kb + 1] = 0.5; T[kb + 4] = 0.35; T[ROLL] = -m * 0.35; T[SX] = -0.25;
      setArm(T, m, -0.3, 0.3, 1.0); setArm(T, -m, 0.3, 0.3, 1.1);
    }
  }
  function clipTackle(T, pv, st, k) {
    const m = st.foot;
    setLeg(T, m, 1.15 * k, 0.08 + 0.3 * (1 - k), 0.06, -0.2);
    setLeg(T, -m, -0.45 * k, 0.95 * k + 0.2, 0.08, 0.1);
    T[SX] = 0.32 * k; T[CX] = 0.05;
    setArm(T, m, -0.6 * k, 0.5, 0.4); setArm(T, -m, 0.8 * k, 0.5, 0.5);
  }
  function clipSlide(T, pv, st, up) {
    const m = st.foot;
    if (up) {            // getting up: kneel, lean over the front foot, push off
      setLeg(T, m, 1.0, 1.5, 0.1); setLeg(T, -m, 0.25, 1.35, 0.12, 0.4);
      T[SX] = 0.45; arms(T, 0.6, 0.6, 0.3); return;
    }
    // lying back on one hip: lead leg along the turf, the other bent knee-up, torso ~60 deg back
    T[PX] = -0.5; T[SX] = -0.45; T[CX] = -0.15; T[HX] = 0.5; T[ROLL] = -m * 0.3; T[RX] = m * 0.26;
    setLeg(T, m, 1.0, 0.05, 0.05, -0.15); setLeg(T, -m, 1.3, 1.3, 0.12, 0.2, 1.0);
    setArm(T, m, -0.45, 0.25, 0.65); setArm(T, -m, 1.2, 0.5, 0.5);
  }
  function clipStumble(T, pv) {
    const w = Math.sin((pv.stT || 0) * 26);
    T[SX] = -0.3 + 0.1 * w; T[CX] = -0.05;
    setLeg(T, 1, 0.55, 0.3, 0.1); setLeg(T, -1, -0.4, 0.7, 0.1);
    setArm(T, 1, 1.2 + 0.3 * w, 0.3, 1.0); setArm(T, -1, -1.2 - 0.3 * w, 0.3, 1.0);
  }
  function clipAnkle(T, pv) {
    const u = pv.u || 0;
    if (u < 0.2) {          // stagger back, arms windmilling
      const w = Math.sin((pv.stT || 0) * 22);
      T[SX] = -0.42; T[PITCH] = -0.12 * (u / 0.2);
      setLeg(T, 1, 0.75, 0.25, 0.12); setLeg(T, -1, -0.65, 0.9, 0.1);
      setArm(T, 1, -1.3 + 0.3 * w, 0.3, 1.2); setArm(T, -1, 1.5 - 0.3 * w, 0.3, 1.2);
    } else if (u < 0.8) {   // sat on the ground, propped up on the hands
      T[SX] = -0.35; T[CX] = -0.1; T[HX] = 0.15;
      setLeg(T, 1, 1.5, 0.15, 0.2); setLeg(T, -1, 2.1, 2.0, 0.22);
      setArm(T, 1, -0.75, 0.15, 0.35); setArm(T, -1, -0.75, 0.15, 0.35);
    } else {                // scramble up: kneel, lean over, push
      T[SX] = 0.5;
      setLeg(T, 1, 1.2, 1.8, 0.15); setLeg(T, -1, 0.3, 1.5, 0.15, 0.4);
      arms(T, 0.9, 0.5, 0.3);
    }
  }
  function clipCelebrate(T, pv) {
    const t = (pv.stT || 0) * 6.5, s2 = Math.sin(t * 2);
    T[LIFT] = Math.abs(Math.sin(t)) * 0.33; T[GROUND] = 0;
    setArm(T, 1, 2.75 + 0.2 * s2, 0.25, 0.4); setArm(T, -1, 2.75 - 0.2 * s2, 0.25, 0.4);
    setLeg(T, 1, 0.2 + 0.25 * s2, 0.5, 0.08, 0.3); setLeg(T, -1, 0.2 - 0.25 * s2, 0.5, 0.08, 0.3);
    T[SX] = -0.08; T[HX] = -0.25;
  }
  function clipShoulder(T, pv, st) {
    const m = st.barge;
    T[SX] = 0.28; T[ROLL] = m * 0.16; T[PY] = m * 0.35; T[CY] = m * 0.15;
    setLeg(T, m, 0.5, 0.5, 0.2); setLeg(T, -m, -0.4, 0.5, 0.2);
    setArm(T, m, 0.2, 1.4, 0.05); setArm(T, -m, -0.2, 0.4, 0.8);
  }
  function clipFake(T, pv, st) {
    const u = sm(pv.fakeU), dr = -Math.cos(st.yaw) * (pv.fakeSide || 1) >= 0 ? 1 : -1, fs = -dr;    // ball dragged toward dr; the foot starts on the other side
    const b = leg(fs);
    T[b] = pv.fakeU < 0.35 ? lerp(0.35, -0.55, Math.sin(PI * pv.fakeU / 0.35)) : 0.3;
    T[b + 1] = lerp(0.35, -0.38, u); T[b + 3] = 0.25 + 0.45 * Math.sin(u * PI) + (pv.fakeU < 0.35 ? 0.5 * Math.sin(PI * pv.fakeU / 0.35) : 0); T[b + 4] = -0.2;
    setLeg(T, -fs, 0.05, 0.35, 0.1, -0.1);
    T[ROLL] = dr * 0.1 * Math.sin(u * PI); T[SX] = 0.08;
    setArm(T, fs, -0.3, 0.4, 0.35); setArm(T, -fs, 0.3, 0.4, 0.4);
  }
  // the 11 skill moves (render.js:263-280 ported to 3D). s = move side (+1 right), m = strong foot
  function clipSkill(T, pv, st) {
    const sk = pv.skill, u = clamp(fin(sk.u, 0), 0, 0.999), id = sk.id, s = (sk.sd || 1) > 0 ? 1 : -1, m = st.foot, lean = fin(sk.lean, 0);
    st.rate = 32;
    if (id === 'stepover') {
      const w = Math.sin(u * PI * 4), oR = Math.max(0, w), oL = Math.max(0, -w);
      setLeg(T, 1, 0.15 + 0.55 * oR, 0.2 + 0.6 * oR, 0.06 + 0.42 * oR, 0.1, -0.3 * oR);
      setLeg(T, -1, 0.15 + 0.55 * oL, 0.2 + 0.6 * oL, 0.06 + 0.42 * oL, 0.1, -0.3 * oL);
      crouch(T, 0.12); T[ROLL] = 0.12 * w; T[PY] = -0.2 * w; arms(T, 0, 0.5, 0.42); T[ARM_R] = 0.3 * w; T[ARM_L] = -0.3 * w;
    } else if (id === 'feint') {
      const d = u < 0.45 ? -1 : 1;
      setLeg(T, 1, 0.1, 0.3, 0.22); setLeg(T, -1, 0.1, 0.3, 0.22); crouch(T, 0.22); T[leg(d * s) + 3] += 0.3;
      T[ROLL] = d * s * 0.22; T[RX] = d * s * 0.08; T[CY] = d * s * 0.15; arms(T, 0.1, 0.5, 0.5);
    } else if (id === 'knock') {
      T[SX] += 0.26; T[leg(m)] += 0.4 * Math.sin(PI * seg(u, 0, 0.3));
    } else if (id === 'roll') {
      const sp = Math.sin(u * PI);
      setLeg(T, s, 0.35, 0.5, 0.15 + 0.4 * sp, -0.35, 0.1); setLeg(T, -s, -0.1, 0.3, 0.08); crouch(T, 0.1);
      T[ROLL] = s * 0.1; arms(T, 0, 0.5, 0.38);
    } else if (id === 'croqueta') {
      const sp = Math.sin(u * PI), first = u < 0.5;
      setLeg(T, -s, 0.25, 0.45, 0.35 * sp * (first ? 1 : 0.5), -0.1, first ? 0.4 : 0); setLeg(T, s, 0.25, 0.45, 0.35 * sp * (first ? 0.5 : 1), -0.1, first ? 0 : 0.4);
      crouch(T, 0.12); T[ROLL] = s * 0.18; T[RX] = s * 0.1 * sm(u); arms(T, 0, 0.5, 0.4);
    } else if (id === 'roulette') {
      setLeg(T, m, 0.55, 0.45, 0.1, -0.3); setLeg(T, -m, -0.25, 0.6, 0.12);
      arms(T, 0.1, 0.2, 0.95); T[SX] = 0.06; T[PY] = s * 0.35 * Math.sin(u * PI); T[HY] = s * 0.4 * Math.sin(u * PI);
    } else if (id === 'elastico') {
      const d = u < 0.45 ? -1 : 1, fe = -s;
      setLeg(T, fe, 0.4, 0.35, u < 0.45 ? 0.45 * sm(u / 0.45) : lerp(0.45, -0.35, sm(seg(u, 0.45, 0.75))), 0.1, u < 0.45 ? -0.2 : 0.3);
      setLeg(T, -fe, -0.05, 0.4, 0.15); crouch(T, 0.1); T[ROLL] = d * s * 0.2; arms(T, 0, 0.5, 0.4);
    } else if (id === 'heel') {
      if (u < 0.35) { setLeg(T, m, -0.6, 1.25, -0.2, 0.3); setLeg(T, -m, 0.3, 0.25, 0.08); }
      else { setLeg(T, -m, 0.6, 0.3, 0.05); setLeg(T, m, 0.1, 0.4, 0.06); }
      T[SX] = 0.2; arms(T, 0, 0.5, 0.4);
    } else if (id === 'rainbow') {
      if (u < 0.28) { setLeg(T, m, 0.4, 0.95, 0.04); setLeg(T, -m, 0.4, 0.95, 0.04); crouch(T, 0.1); T[SX] = 0.15; }
      else {
        const w = (u - 0.28) / 0.72;
        T[LIFT] = Math.sin(PI * w) * 0.35; T[GROUND] = w > 0.9 ? 1 : 0;
        setLeg(T, m, -0.55, 1.5, 0.06, 0.6); setLeg(T, -m, -0.35, 1.4, 0.06, 0.4);
        T[SX] = 0.3; arms(T, -0.8, 0.4, 0.4);
      }
    } else if (id === 'dragback') {
      const v = sm(u / 0.6);
      setLeg(T, m, lerp(0.95, -0.1, v), 0.15, 0.06, -0.35); setLeg(T, -m, -0.1, 0.35, 0.08);
      T[SX] = -0.14; arms(T, 0, 0.5, 0.4);
    } else if (id === 'nutmeg') {
      if (u < 0.35) { setLeg(T, m, 1.0, 0.1, 0.06, 0, 0.6); setLeg(T, -m, -0.35, 0.5, 0.08); T[SX] = 0.1; }
      else st.rate = 34;
    }
    T[RX] += s * lean * 0.12; T[ROLL] += s * lean * 0.08;
  }

  // ---------------------------------------------------------------- goalkeeper clips
  function clipGkSet(T, pv) {
    crouch(T, 0.32);
    T[LEG_L + 1] += 0.16; T[LEG_R + 1] += 0.16;
    arms(T, 0.38, 0.6, 0.62); T[SX] += 0.06;
  }
  function clipGkDive(T, pv, st, u, air) {
    const ds = st.diveSide, high = !!pv.high, r = (high ? 1.1 : 1.48) * sm(u / 0.5);
    T[ROLL] = ds * r; T[RX] = -ds * 0.45 * Math.sin(r);
    T[LIFT] = air ? Math.sin(u * PI) * (high ? 0.95 : 0.45) : 0; T[GROUND] = air ? 0 : 1;
    setLeg(T, ds, 0.45, 0.3, 0.12); setLeg(T, -ds, -0.3, 0.25, 0.35);
    // arms stretched over the head toward the dive (the body is rolled, so "up" points along the dive)
    setArm(T, ds, high ? 2.95 : 2.65, 0.1, 0.25); setArm(T, -ds, high ? 2.9 : 2.95, 0.15, high ? 0.2 : -0.05);
    T[SZ] = ds * 0.15; T[CY] = 0; T[HZ] = -ds * 0.2;
  }
  function clipGkGround(T, pv, st) {
    const u = pv.u || 0;
    if (u < 0.55) { clipGkDive(T, pv, st, 1, false); arms(T, 2.2, 0.6, 0.2); return; }
    const g = sm((u - 0.55) / 0.45), ds = st.diveSide;
    T[ROLL] = ds * lerp(1.1, 0, g); T[GROUND] = 1;
    setLeg(T, ds, lerp(0.8, 0.4, g), lerp(1.6, 0.7, g), 0.15); setLeg(T, -ds, lerp(0.2, 0.3, g), lerp(1.4, 0.7, g), 0.15, 0.3);
    T[SX] = lerp(0.6, 0.2, g); arms(T, lerp(0.8, 0.3, g), 0.5, 0.4);
  }
  function clipGkHold(T) {
    arms(T, 0.95, 1.35, -0.12); T[SX] = 0.08;
    setLeg(T, 1, 0.05, 0.12, 0.08); setLeg(T, -1, -0.05, 0.12, 0.08);
  }
  function clipGkChip(T) {
    arms(T, 2.95, 0.1, 0.22); T[SX] = -0.05; T[HX] = -0.3;
    setLeg(T, 1, 0, 0.05, 0.06, 0.55); setLeg(T, -1, 0, 0.05, 0.06, 0.55);
  }
  function clipGkThrow(T, u) {
    const a = sm(u);
    setArm(T, 1, lerp(3.4, 1.0, a), lerp(1.3, 0.15, a), 0.2); setArm(T, -1, lerp(1.2, -0.3, a), 0.4, 0.5);
    setLeg(T, -1, lerp(0.1, 0.5, a), 0.3, 0.08); setLeg(T, 1, lerp(0, -0.35, a), 0.3, 0.08);
    T[SX] = lerp(-0.2, 0.35, a); T[CY] = lerp(0.4, -0.3, a); T[PY] = lerp(0.2, -0.15, a);
  }

  // ---------------------------------------------------------------- IK helpers (results written into out[0..3])
  // 2-bone chain from a joint at the origin of the vector d (in the limb's parent frame), segment lengths a, b.
  // bend > 0: knee (lower segment folds back, so the upper one leans forward); bend < 0: elbow.
  const IK = new Float32Array(4);
  function ik2(dx, dy, dz, a, b, bend) {
    let L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxL = (a + b) * 0.995, minL = Math.abs(a - b) + 0.02;
    if (L < 1e-5) { dx = 0; dy = -minL; dz = 0; L = minL; }
    const sc = clamp(L, minL, maxL) / L; dx *= sc; dy *= sc; dz *= sc; L *= sc;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const flex = Math.acos(clamp((L * L - a * a - b * b) / (2 * a * b), -1, 1));
    const alpha = Math.acos(clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1));
    IK[0] = Math.atan2(uz, -uy) + (bend > 0 ? alpha : -alpha);   // swing forward
    IK[1] = Math.asin(clamp(ux, -1, 1));                          // rotation.z (sign per side applied by caller)
    IK[2] = flex;
  }

  // ---------------------------------------------------------------- create
  function create(actor) {
    const THREE = actor.THREE || globalThis.THREE;
    const bn = actor.bones, g = actor.group;
    const pose = new Float32Array(N), T = new Float32Array(N), F = new Float32Array(N), TMP = new Float32Array(N);
    const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
    const st = {
      init: false, yaw: 0, lastX: 0, lastZ: 0, pvx: 0, pvz: 0, ax: 0, az: 0, yawRate: 0, clock: 0, foot: actor.foot || 1, barge: 1,
      w: new Float32Array(8), chargeF: 0, rate: 24, ikSide: 0, kickK: 1, prevKickT: 0, cx: 0, cy: 0, cz: 0, contact: false,
      leanP: 0, leanR: 0, lockT: 0, lockW: 0, lastD: 0, bank: 0, lookY: 0, lookX: 0, lookW: 0, turnT: 0, turnSide: 0, diveSide: 1, held: false, throwT: 0, saveFlick: 0,
    };
    const W_DRIB = 0, W_JOCK = 1, W_FOCUS = 2, W_CHG = 3, W_EXH = 4, W_WALL = 5, W_LOCO = 6;

    function reset() { st.init = false; st.turnT = 0; st.throwT = 0; st.held = false; st.lookW = 0; st.w.fill(0); }

    // ground points: [bone, x, y, z, radius] (offsets scaled by look.h at use)
    const GP = [
      [bn.footL, 0, -0.08, -0.06, 0], [bn.footL, 0, -0.08, 0.19, 0], [bn.footR, 0, -0.08, -0.06, 0], [bn.footR, 0, -0.08, 0.19, 0],
      [bn.shinL, 0, 0, 0, 0.065], [bn.shinR, 0, 0, 0, 0.065], [bn.pelvis, 0, -0.04, 0, 0.15], [bn.chest, 0, 0.05, 0, 0.15], [bn.neck, 0, 0, 0, 0.15],
      [bn.head, 0, 0.12, 0, 0.13], [bn.handL, 0, -0.05, 0, 0.045], [bn.handR, 0, -0.05, 0, 0.045], [bn.foreArmL, 0, 0, 0, 0.05], [bn.foreArmR, 0, 0, 0, 0.05],
    ];

    function applyPose(P) {
      bn.root.position.set(-P[RX], P[LIFT], P[RZ]);
      bn.root.rotation.set(P[PITCH], -P[RYAW], P[ROLL]);
      bn.pelvis.rotation.set(P[PX], -P[PY], P[PZ]);
      bn.spine.rotation.set(P[SX], -P[SY], P[SZ]);
      bn.chest.rotation.set(P[CX], -P[CY], P[CZ]);
      bn.neck.rotation.set(P[NX], 0, 0);
      bn.head.rotation.set(P[HX], -P[HY], P[HZ]);
      bn.upperArmL.rotation.set(-P[ARM_L], P[ARM_L + 2], P[ARM_L + 1]); bn.foreArmL.rotation.set(-P[ARM_L + 3], 0, 0); bn.handL.rotation.set(P[ARM_L + 4], 0, 0);
      bn.upperArmR.rotation.set(-P[ARM_R], -P[ARM_R + 2], -P[ARM_R + 1]); bn.foreArmR.rotation.set(-P[ARM_R + 3], 0, 0); bn.handR.rotation.set(P[ARM_R + 4], 0, 0);
      bn.thighL.rotation.set(-P[LEG_L], P[LEG_L + 2], P[LEG_L + 1]); bn.shinL.rotation.set(P[LEG_L + 3], 0, 0); bn.footL.rotation.set(P[LEG_L + 4], 0, 0);
      bn.thighR.rotation.set(-P[LEG_R], -P[LEG_R + 2], -P[LEG_R + 1]); bn.shinR.rotation.set(P[LEG_R + 3], 0, 0); bn.footR.rotation.set(P[LEG_R + 4], 0, 0);
    }

    // ---- the per-frame target
    function target(pv, dt, keeper, ball) {
      const R = actor.rig, h = R.h || 1;
      T.set(REST); STANCE[0] = STANCE[1] = 1;
      st.rate = 24; st.ikSide = 0; st.lockT = 0;
      const sp = fin(pv.speed, 0), yaw = st.yaw;
      // local travel direction (right-positive / forward) from the world velocity and the drawn facing
      const vx = fin(pv.vx, 0), vz = fin(pv.vz, 0), vl = Math.hypot(vx, vz);
      let dirF = 1, dirR = 0;
      if (vl > 1e-4) { const lx = (vx * Math.cos(yaw) - vz * Math.sin(yaw)) / vl; dirF = (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / vl; dirR = -lx; }
      const state = pv.state;
      if (keeper) return targetKeeper(pv, dt, sp, dirF, dirR, h, ball);
      const jog = Math.max(0.5, fin(pv.jog, 5)), top = Math.max(jog + 0.1, fin(pv.top, 7.5));
      const r = sp / jog;
      let k = clamp((sp - jog) / (top - jog), 0, 1);
      if (pv.sprint && r > 0.9) k = Math.max(k, 0.45);
      const mv = sm(r / 0.12), gait = sm((r - 0.35) / 0.65);
      const strideLen = STRIDE_M * (1 + 0.3 * clamp(sp / top, 0, 1));
      // ---- L1 weights (eased at 10/s)
      const kw = st.init ? damp(10, dt) : 1, W = st.w, free = state === 'free' || state === 'skill';
      easeW(W, W_DRIB, pv.owner && state === 'free' && !pv.shield ? 1 : 0, kw);
      easeW(W, W_JOCK, (pv.jock || pv.shield) && !pv.focus ? 1 : 0, kw);
      easeW(W, W_FOCUS, pv.focus ? 1 : 0, kw);
      const ch = pv.charge && !pv.charge.ft;
      if (ch) st.chargeF = clamp(fin(pv.charge.f, 0), 0, 1);
      easeW(W, W_CHG, ch && !(pv.kickT > 0) ? 1 : 0, kw);
      easeW(W, W_EXH, pv.exhausted ? 1 : 0, kw);
      easeW(W, W_WALL, pv.wall ? 1 : 0, kw);
      // ---- L0
      const drib = W[W_DRIB], jock = W[W_JOCK], focus = W[W_FOCUS];
      // the pose filter lags a moving target by v/rate: lead the phase by the same amount so planted feet stay put
      const lead = (((sp / strideLen) * TAU) / 34) * (1 - st.lockW);
      locomotion(T, fin(pv.runPh, 0) + lead, strideLen, R, dirF, dirR, mv, gait, k * (1 - jock) * (1 - focus), 1 - 0.3 * drib - 0.6 * jock);
      if (mv < 1) {                 // idle
        const br = Math.sin(st.clock * 2.4), wi = 1 - mv;
        T[SX] += 0.02 * wi; T[ARM_L + 3] += 0.05 * br * wi; T[ARM_R + 3] += 0.05 * br * wi;
        T[LEG_L + 1] += 0.04 * wi; T[LEG_R + 1] += 0.04 * wi;
      }
      st.rate = mv > 0.5 ? 34 : 18;
      // ---- L1 stances
      if (drib > 0.001) {
        const ph = fin(pv.runPh, 0), touch = Math.max(0, Math.sin(ph)), touch2 = Math.max(0, -Math.sin(ph));
        T[ARM_L + 1] += 0.15 * drib; T[ARM_R + 1] += 0.15 * drib; T[ARM_L] *= 1 - 0.3 * drib; T[ARM_R] *= 1 - 0.3 * drib;
        T[HX] += 0.21 * drib; T[SX] += 0.05 * drib;
        T[LEG_L + 4] += 0.2 * touch * touch * drib * mv; T[LEG_R + 4] += 0.2 * touch2 * touch2 * drib * mv;
        T[LEG_L + 3] *= 1 - 0.2 * drib; T[LEG_R + 3] *= 1 - 0.2 * drib;
      }
      if (jock > 0.001) {
        crouch(T, 0.3 * jock); T[LEG_L + 1] += 0.14 * jock; T[LEG_R + 1] += 0.14 * jock; T[SX] += 0.14 * jock;
        T[ARM_L + 1] += 0.3 * jock; T[ARM_R + 1] += 0.3 * jock; T[ARM_L + 3] += 0.2 * jock; T[ARM_R + 3] += 0.2 * jock;
      }
      if (focus > 0.001) {
        crouch(T, 0.42 * focus); T[LEG_L + 1] += 0.2 * focus; T[LEG_R + 1] += 0.2 * focus; T[SX] += 0.12 * focus;
        T[PY] += 0.52 * focus * st.foot; T[CY] -= 0.1 * focus * st.foot; T[HY] -= 0.35 * focus * st.foot;
        T[ARM_L + 1] += 0.45 * focus; T[ARM_R + 1] += 0.45 * focus; T[ARM_L + 3] += 0.4 * focus; T[ARM_R + 3] += 0.4 * focus;
        st.rate = 28;
      }
      const cw = W[W_CHG] * (1 - 0.5 * clamp(r, 0, 1));
      if (cw > 0.001) {             // wind-up: the kicking leg goes back with the charge
        const f = st.chargeF, m = st.foot, b = leg(m);
        TMP.set(T);
        TMP[b] = lerp(-0.25, -0.7, f); TMP[b + 3] = lerp(0.5, 1.25, f); TMP[b + 4] = 0.4;
        const ab = arm(-m), aa = arm(m);
        TMP[ab] = 0.5; TMP[ab + 1] = 0.25 + 0.35 * f; TMP[aa] = -0.55; TMP[aa + 1] = 0.3 + 0.2 * f;
        TMP[SX] = T[SX] + 0.05; TMP[PY] = T[PY] + m * 0.2 * f;
        lerpInto(T, TMP, cw, 0, GROUND);
        st.rate = 30;
      }
      const ew = W[W_EXH] * (1 - mv);
      if (ew > 0.001) { T[SX] += 0.45 * ew; crouch(T, 0.12 * ew); T[ARM_L] += 0.5 * ew; T[ARM_R] += 0.5 * ew; T[ARM_L + 3] += 0.1 * ew; T[ARM_R + 3] += 0.1 * ew; T[ARM_L + 1] -= 0.05 * ew; T[ARM_R + 1] -= 0.05 * ew; }
      const ww = W[W_WALL];
      if (ww > 0.001) { T[ARM_L] += 0.38 * ww; T[ARM_R] += 0.38 * ww; T[ARM_L + 1] -= 0.42 * ww; T[ARM_R + 1] -= 0.42 * ww; T[ARM_L + 3] += 0.35 * ww; T[ARM_R + 3] += 0.35 * ww; T[HX] -= 0.05 * ww; }
      // ---- L2 actions (priority order of render.js playerPose)
      W[W_LOCO] = free && !(pv.kickT > 0) && !(pv.fakeU > 0) ? 1 : 0.3;
      if (state === 'celebrate') { T.set(REST); clipCelebrate(T, pv); st.rate = 24; W[W_LOCO] = 0; }
      else if (state === 'ankle') { T.set(REST); clipAnkle(T, pv); st.rate = 15; W[W_LOCO] = 0; }
      else if (state === 'slide' || state === 'down') {
        const up = state === 'down' && fin(pv.stDur, 0) - fin(pv.stT, 0) < 0.13;
        T.set(REST); clipSlide(T, pv, st, up); st.rate = up ? 20 : 30; W[W_LOCO] = 0;
      } else if (state === 'stumble') { T.set(REST); clipStumble(T, pv); st.rate = 30; W[W_LOCO] = 0; }
      else if (state === 'tackle' || (state === 'recover' && fin(pv.u, 1) < 0.5)) {
        clipTackle(T, pv, st, state === 'tackle' ? 1 : 0.45); st.rate = state === 'tackle' ? 42 : 20; W[W_LOCO] = 0;
      } else if (state === 'skill' && pv.skill) clipSkill(T, pv, st);
      else if (pv.fakeU > 0 && pv.fakeU < 1) { clipFake(T, pv, st); st.rate = 40; }
      else if (pv.kickT > 0) { clipKick(T, pv, st); st.rate = 60; }
      else if (state === 'shoulder') { clipShoulder(T, pv, st); st.rate = 40; }
      if (state === 'free' && !(pv.kickT > 0) && !(pv.fakeU > 0)) st.lockT = mv * (1 - cw) * (1 - 0.5 * ww);
    }

    function targetKeeper(pv, dt, sp, dirF, dirR, h, ball) {
      const state = pv.state;
      // dive side in the keeper's frame (+1 = his right): the dive runs along world x by diveDir
      const dw = (pv.diveDir || 1) * -Math.cos(st.yaw);
      if (state === 'dive') st.diveSide = dw >= 0 ? 1 : -1;
      // throw: KeeperView has no clock for it, so it is latched here (0.3 s) on holding -> released or save.kind 'throw'
      if ((st.held && !pv.holding && state === 'set') || (pv.save && pv.save.kind === 'throw' && st.throwT <= 0 && st.held)) st.throwT = 0.3;
      st.held = !!pv.holding;
      if (st.throwT > 0) st.throwT = Math.max(0, st.throwT - dt);
      st.rate = 24; st.w[6] = state === 'dive' || state === 'ground' || state === 'slide' ? 0 : 1;
      W_set: {
        if (state === 'slide' || (state === 'ground' && pv.slid)) { clipSlide(T, pv, st, false); st.rate = 30; break W_set; }
        if (state === 'dive') { clipGkDive(T, pv, st, clamp(fin(pv.u, 0), 0, 1), true); st.rate = 34; break W_set; }
        if (state === 'ground') { clipGkGround(T, pv, st); st.rate = 24; break W_set; }
        if (pv.holding || state === 'hold') { clipGkHold(T); break W_set; }
        if (st.throwT > 0) { clipGkThrow(T, 1 - st.throwT / 0.3); st.rate = 40; break W_set; }
        // set / shuffle / rush
        const r = sp / 4.5, mv = sm(r / 0.12), run = sm((sp - 2.5) / 2);
        const ph = fin(pv.animDist, 0) * 0.16;
        locomotion(T, ph, 1.96, actor.rig, dirF, dirR, mv, sm(r), 0, 0.4 + 0.6 * run);
        TMP.set(T); clipGkSet(TMP, pv);
        lerpInto(T, TMP, 1 - 0.7 * run, 0, GROUND);
        st.lockT = mv * run;
        if (pv.chip) { clipGkChip(T); st.rate = 30; st.lockT = 0; }
        T[CX] += 0.015 * Math.sin(st.clock * 3);
      }
      // parry: a quick flick of the near arm toward the ball
      if (pv.save && (pv.save.kind === 'parry' || pv.save.kind === 'weak') && pv.save.age < 0.2) {
        const w = Math.sin(PI * clamp(pv.save.age / 0.2, 0, 1)), a = arm(st.diveSide);
        T[a] += 0.5 * w; T[a + 3] *= 1 - w; T[a + 1] += 0.3 * w;
      }
    }

    // ---- per frame
    function update(pv, dt, ball) {
      if (!pv) return;
      if (pv.hidden) { g.visible = false; st.init = false; return; }
      g.visible = true;
      dt = clamp(fin(dt, 0), 0, 0.1);
      st.clock += dt;
      st.foot = actor.foot || 1;
      const keeper = !!actor.keeper || pv.runPh === undefined;
      const px = fin(pv.x, 0), pz = fin(pv.z, 0);
      if (st.init && Math.hypot(px - st.lastX, pz - st.lastZ) > 2.4) st.init = false;     // teleport: snap, never sweep
      st.lastX = px; st.lastZ = pz;
      // ---- yaw
      let yawT = fin(pv.yaw, 0);
      if (pv.state === 'celebrate') yawT = 0;                                   // face the camera
      else if (pv.state === 'ankle' && pv.fallYaw !== undefined) yawT = fin(pv.fallYaw, 0) + PI;   // facing the man who did it
      const prevYaw = st.yaw;
      if (!st.init) st.yaw = yawT;
      else {
        const err = wrap(yawT - st.yaw), fast = pv.state === 'skill' && pv.skill && pv.skill.id === 'roulette';
        const cap = (fast ? 30 : 14) * dt;
        st.yaw += clamp(err * damp(fast ? 40 : 20, dt), -cap, cap);
        // turn clip: plant and pivot when the facing has to swing a long way at speed
        if (!keeper && Math.abs(err) > 1.2 && fin(pv.speed, 0) > 0.5 * fin(pv.jog, 5) && st.turnT <= 0 && pv.state === 'free') { st.turnT = 0.18; st.turnSide = err > 0 ? -1 : 1; }
      }
      st.yaw = wrap(st.yaw);
      st.yawRate = dt > 0 ? lerp(st.yawRate, wrap(st.yaw - prevYaw) / dt, damp(10, dt)) : st.yawRate;
      g.position.set(px, 0, pz);
      g.rotation.y = st.yaw;
      // ---- acceleration (filtered) for the lean
      const vx = fin(pv.vx, 0), vz = fin(pv.vz, 0);
      if (st.init && dt > 0) { const ka = damp(8, dt); st.ax += ((vx - st.pvx) / dt - st.ax) * ka; st.az += ((vz - st.pvz) / dt - st.az) * ka; }
      else { st.ax = 0; st.az = 0; }
      st.pvx = vx; st.pvz = vz;
      // ---- target + ease
      target(pv, dt, keeper, ball);
      const kk = st.init ? damp(st.rate, dt) : 1;
      // in steady locomotion the legs follow the phase exactly (the target is already smooth); every blend into or out of
      // it still eases, because lockW itself eases
      const kLeg = kk + (1 - kk) * st.lockW * st.lockW;
      for (let i = 0; i < N; i++) pose[i] += (T[i] - pose[i]) * (i >= LEG_L && i < GROUND ? kLeg : kk);
      // ---- L3 additive
      F.set(pose);
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const aF = st.ax * sy + st.az * cy, aR = -(st.ax * cy - st.az * sy), lw = st.w[6];
      const jog = Math.max(0.5, fin(pv.jog, 5));
      const bankT = clamp(-st.yawRate * 0.08 * clamp(fin(pv.speed, 0) / jog, 0, 1), -0.21, 0.21);
      const kl = st.init ? damp(6, dt) : 1;
      st.leanP += (clamp(aF * 0.01, -0.12, 0.22) * lw - st.leanP) * kl;
      st.leanR += (clamp(aR * 0.012, -0.2, 0.2) * lw - st.leanR) * kl;
      st.bank += (bankT * lw - st.bank) * kl;
      F[PITCH] += st.leanP; F[ROLL] += st.leanR + st.bank;
      if (st.turnT > 0) {
        const w = Math.sin(PI * (1 - st.turnT / 0.18)), s = st.turnSide, b = leg(-s);
        F[PY] += s * 0.44 * w; F[CY] -= s * 0.2 * w; F[b + 1] += 0.25 * w; F[b + 3] += 0.3 * w;
        st.turnT = Math.max(0, st.turnT - dt);
      }
      const ex = pv.exhausted ? 1 : 0;
      F[CX] += (0.02 + 0.03 * ex) * Math.sin(st.clock * TAU * (ex ? 0.7 : 0.4));
      // head look-at
      const st2 = pv.state;
      let lookOn = ball && !(st2 === 'celebrate' || st2 === 'ankle' || st2 === 'slide' || st2 === 'down' || st2 === 'dive' || st2 === 'ground');
      let lyT = 0, lxT = 0;
      if (lookOn) {
        const dx = fin(ball.x, px) - px, dz = fin(ball.z, pz) - pz, by = fin(ball.y, 0) + 0.2;
        const fwd = dx * sy + dz * cy, right = -(dx * cy - dz * sy), hd = Math.hypot(dx, dz);
        const ang = Math.atan2(right, fwd);
        if (hd > 0.3 && Math.abs(ang) < 2.3) {
          lyT = clamp(ang - (F[PY] + F[SY] + F[CY] + F[RYAW]), -1.05, 1.05);
          lxT = clamp(Math.atan2((actor.rig.eye || 1.65) - by, hd) - (F[SX] + F[CX] + F[PX]) * 0.6, -0.44, 0.44);
        } else lookOn = false;
      }
      const kh = st.init ? damp(8, dt) : 1;
      st.lookW += ((lookOn ? 1 : 0) - st.lookW) * kh;
      st.lookY += (lyT - st.lookY) * kh; st.lookX += (lxT - st.lookX) * kh;
      F[HY] += st.lookY * st.lookW * 0.75; F[CY] += st.lookY * st.lookW * 0.15; F[HX] += st.lookX * st.lookW * 0.7;
      // ---- apply, ground contact, IK
      applyPose(F);
      const h = actor.rig.h || 1;
      g.updateMatrixWorld(true);
      let minY = 1e9, mL = 1e9, mR = 1e9;
      for (let i = 0; i < GP.length; i++) {
        const p = GP[i];
        v3.set(p[1] * h, p[2] * h, p[3] * h); p[0].localToWorld(v3);
        const y = v3.y - p[4] * h;
        if (y < minY) minY = y;
        if (i < 2) { if (y < mL) mL = y; } else if (i < 4) { if (y < mR) mR = y; }
      }
      // locomotion: the planted foot (by phase) carries the body; in the flight phase the last support height is held.
      // everything else: the lowest point touches the turf, weighted by the GROUND channel
      st.lockW += (st.lockT - st.lockW) * (st.init ? damp(12, dt) : 1);
      let dl = st.lastD;
      if (STANCE[0] || STANCE[1]) { dl = -(STANCE[0] && STANCE[1] ? Math.min(mL, mR) : STANCE[0] ? mL : mR); st.lastD = dl; }
      let delta = lerp(F[GROUND] * -minY, dl, st.lockW);
      if (minY + delta < 0) delta = -minY;          // nothing ever goes through the turf
      bn.root.position.y += delta;
      // striking-foot IK: contact point latched at the start of the kick, weight 0 -> 0.8 -> 0 over the first 20% of kickT
      const kt = fin(pv.kickT, 0);
      if (kt > st.prevKickT + 1e-4 && ball) {        // back-extrapolate to the moment of contact (the sim releases the ball at the kick)
        const el = Math.max(0, (pv.kick && pv.kick.type == null ? 0.25 : 0.3) - kt);
        st.cx = fin(ball.x, px) - fin(ball.vx, 0) * el; st.cy = Math.max(0, fin(ball.y, 0) - fin(ball.vy, 0) * el); st.cz = fin(ball.z, pz) - fin(ball.vz, 0) * el; st.contact = true;
      }
      if (kt <= 0) st.contact = false;
      st.prevKickT = kt;
      if (!keeper && st.ikSide && st.contact && st.kickK < 0.2 && pv.kickT > 0) {
        const w = 0.8 * Math.sin(PI * st.kickK / 0.2);
        if (w > 0.01) {
          const s = st.ikSide, th = s > 0 ? bn.thighR : bn.thighL, R = actor.rig;
          // ankle target: behind the ball centre, at about its equator
          const bx = st.cx - px, bz = st.cz - pz, bl = Math.hypot(bx, bz) || 1;
          v3.set(st.cx - (bx / bl) * 0.24, st.cy + 0.13 - delta, st.cz - (bz / bl) * 0.24);
          limbIK(th, bn.pelvis, v3, R.thigh, R.shin + R.ankle * 0.4, s, 1, w, s > 0 ? bn.shinR : bn.shinL);
        }
      }
      // keeper hands to the ball: catches, smothers, dives within reach
      if (keeper && ball) {
        const sv = pv.save, catching = sv && (sv.kind === 'catch' || sv.kind === 'claim' || sv.kind === 'smother') && sv.age < 0.35;
        const diving = pv.state === 'dive';
        if (catching || diving) {
          const bx = fin(ball.x, px), byy = fin(ball.y, 0) + 0.2, bz = fin(ball.z, pz);
          v4.set(0, 0, 0); bn.chest.localToWorld(v4);
          const d = Math.hypot(bx - v4.x, byy - delta - v4.y, bz - v4.z), reach = (actor.rig.armLen || 0.55) + 0.55;
          const w = (catching ? 0.85 : 0.6) * clamp(1 - (d - reach) / 0.6, 0, 1);
          if (w > 0.01) for (let s = -1; s <= 1; s += 2) {
            v3.set(bx + (s > 0 ? -0.1 : 0.1) * Math.cos(st.yaw), byy - delta, bz + (s > 0 ? 0.1 : -0.1) * Math.sin(st.yaw));
            limbIK(s > 0 ? bn.upperArmR : bn.upperArmL, bn.chest, v3, actor.rig.uarm, actor.rig.farm + 0.05, s, -1, w, s > 0 ? bn.foreArmR : bn.foreArmL);
          }
        }
      }
      st.init = true;
    }

    // solve a 2-bone limb toward a world target and blend the bone rotations by w (bend +1 knee, -1 elbow)
    function limbIK(upper, parent, tgtW, a, b, side, bend, w, lower) {
      v4.copy(tgtW); parent.worldToLocal(v4);
      v4.sub(upper.position);
      ik2(v4.x, v4.y, v4.z, a, b, bend);
      const rx = -IK[0], rz = IK[1], flex = IK[2];
      upper.rotation.x += (rx - upper.rotation.x) * w;
      upper.rotation.z += (rz - upper.rotation.z) * w;
      upper.rotation.y += (0 - upper.rotation.y) * w * 0.5;
      const lr = bend > 0 ? flex : -flex;
      lower.rotation.x += (lr - lower.rotation.x) * w;
    }

    const api = { update, reset, pose, target: T, state: st };
    actor.anim = api;
    return api;
  }

  // ---------------------------------------------------------------- clip catalogue + synthetic views (lab page / tests)
  const SKILLS = ['stepover', 'feint', 'knock', 'roll', 'croqueta', 'roulette', 'elastico', 'heel', 'rainbow', 'dragback', 'nutmeg'];
  const CLIPS = ['idle', 'walk', 'jog', 'sprint', 'backpedal', 'strafeL', 'strafeR', 'turn', 'dribble', 'jockey', 'shield', 'focus', 'charge', 'exhausted', 'wall',
    'shoot', 'first-time', 'power', 'finesse', 'chip', 'cross', 'pass', 'volley', 'header', 'fake', 'tackle', 'recover', 'slide', 'down', 'shoulder', 'stumble', 'ankle', 'celebrate']
    .concat(SKILLS.map((s) => 'skill:' + s));
  const GK_CLIPS = ['gk:set', 'gk:shuffle', 'gk:rush', 'gk:diveLow', 'gk:diveHigh', 'gk:ground', 'gk:slide', 'gk:catch', 'gk:hold', 'gk:parry', 'gk:chip', 'gk:throw'];
  const SKFN_LEAN = { stepover: (u) => Math.sin(u * PI * 4), feint: (u) => (u < 0.45 ? -1 : 1), elastico: (u) => (u < 0.45 ? -1 : 1) };
  const SK_DUR = { stepover: 0.33, feint: 0.25, knock: 0.22, roll: 0.27, croqueta: 0.22, roulette: 0.42, elastico: 0.3, heel: 0.22, rainbow: 0.56, dragback: 0.3, nutmeg: 0.36 };
  function blankPV() {
    return { idx: 0, team: 0, hidden: false, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, jog: 5.5, top: 7.9, runPh: 0, state: 'free', u: 0, stT: 0, stDur: 0,
      kickT: 0, kick: null, charge: null, skill: null, fakeU: 0, fakeSide: 1, fallYaw: 0, owner: false, sprint: false, jock: false, shield: false, focus: false,
      exhausted: false, wall: false, ballSide: 0 };
  }
  function blankKV() { return { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, state: 'set', u: 0, diveDir: 1, high: false, slid: false, chip: false, holding: false, human: false, save: null, animDist: 0 }; }
  // fill pv for clip `name` at progress u (0..1), t = seconds of play (drives the locomotion phase), opts {sd, foot}
  function samplePV(name, u, t, pv, opts) {
    opts = opts || {};
    const isGk = name.indexOf('gk:') === 0;
    if (!pv) pv = isGk ? blankKV() : blankPV();
    const base = isGk ? blankKV() : blankPV();
    for (const k in base) pv[k] = base[k];
    const sd = opts.sd || 1;
    const run = (speed, dirYaw) => { pv.speed = speed; pv.vx = Math.sin(dirYaw) * speed; pv.vz = Math.cos(dirYaw) * speed; pv.runPh = (t * speed / (STRIDE_M * (1 + 0.3 * Math.min(1, speed / pv.top)))) * TAU; };
    if (isGk) {
      const c = name.slice(3);
      if (c === 'shuffle') { pv.speed = 2; pv.vx = 2 * Math.sin(t * 2) ; pv.animDist = t * 40; }
      else if (c === 'rush') { pv.speed = 5; pv.vz = 5; pv.animDist = t * 100; }
      else if (c === 'diveLow' || c === 'diveHigh') { pv.state = 'dive'; pv.u = u; pv.diveDir = sd; pv.high = c === 'diveHigh'; pv.vx = sd * 4; pv.speed = 4; }
      else if (c === 'ground') { pv.state = 'ground'; pv.u = u; pv.diveDir = sd; }
      else if (c === 'slide') { pv.state = 'slide'; pv.u = u; pv.slid = true; }
      else if (c === 'catch') { pv.save = { kind: 'catch', age: u * 0.35 }; }
      else if (c === 'hold') { pv.state = 'hold'; pv.holding = true; }
      else if (c === 'parry') { pv.state = 'dive'; pv.u = 0.6; pv.diveDir = sd; pv.save = { kind: 'parry', age: u * 0.2 }; }
      else if (c === 'chip') pv.chip = true;
      else if (c === 'throw') { pv.holding = u < 0.02; pv.state = u < 0.02 ? 'hold' : 'set'; }
      return pv;
    }
    const jog = pv.jog, top = pv.top;
    switch (name) {
      case 'idle': break;
      case 'walk': run(jog * 0.35, 0); break;
      case 'jog': run(jog, 0); break;
      case 'sprint': run(top, 0); pv.sprint = true; break;
      case 'backpedal': run(jog * 0.6, PI); break;
      case 'strafeL': run(jog * 0.6, PI / 2); break;
      case 'strafeR': run(jog * 0.6, -PI / 2); break;
      case 'turn': run(jog, u < 0.5 ? 0 : PI); pv.yaw = u < 0.5 ? 0 : PI; break;
      case 'dribble': run(jog, 0); pv.owner = true; break;
      case 'jockey': run(jog * 0.4, -PI / 2); pv.jock = true; break;
      case 'shield': pv.shield = true; pv.owner = true; break;
      case 'focus': run(jog * 0.3, PI / 2); pv.focus = true; break;
      case 'charge': pv.owner = true; pv.charge = { type: 'normal', f: u, ft: false }; break;
      case 'exhausted': pv.exhausted = true; break;
      case 'wall': pv.wall = true; break;
      case 'shoot': case 'first-time': case 'power': case 'finesse': case 'chip': case 'cross': case 'volley': case 'header': case 'pass': {
        const type = name === 'shoot' ? 'normal' : name === 'cross' ? 'chip' : name === 'volley' || name === 'header' ? 'first-time' : name === 'pass' ? null : name;
        const dur = type == null ? 0.25 : 0.3;
        pv.kickT = Math.max(0.0005, (1 - u) * dur);
        pv.kick = { type, foot: opts.foot || 1, high: name === 'header', z: name === 'volley' ? 12 : name === 'header' ? 30 : 0, cross: name === 'cross' };
        break;
      }
      case 'fake': pv.fakeU = Math.min(0.999, Math.max(0.001, u)); pv.fakeSide = sd; pv.owner = true; break;
      case 'tackle': pv.state = 'tackle'; pv.stDur = 0.2; pv.stT = u * 0.2; pv.u = u; run(jog * 0.8, 0); break;
      case 'recover': pv.state = 'recover'; pv.stDur = 0.14; pv.stT = u * 0.14; pv.u = u; break;
      case 'slide': pv.state = 'slide'; pv.stDur = 0.44; pv.stT = u * 0.44; pv.u = u; run(top, 0); break;
      case 'down': pv.state = 'down'; pv.stDur = 0.22; pv.stT = u * 0.22; pv.u = u; break;
      case 'shoulder': pv.state = 'shoulder'; pv.stDur = 0.34; pv.stT = u * 0.34; pv.u = u; break;
      case 'stumble': pv.state = 'stumble'; pv.stDur = 0.16; pv.stT = u * 0.16 + t; pv.u = u; break;
      case 'ankle': pv.state = 'ankle'; pv.stDur = 0.92; pv.stT = u * 0.92; pv.u = u; pv.fallYaw = PI; break;
      case 'celebrate': pv.state = 'celebrate'; pv.stT = u * 2 + t; break;
      default:
        if (name.indexOf('skill:') === 0) {
          const id = name.slice(6), dur = SK_DUR[id] || 0.3;
          pv.state = 'skill'; pv.stDur = dur; pv.stT = u * dur; pv.u = u; pv.owner = true;
          pv.skill = { id, u, sd, lean: SKFN_LEAN[id] ? SKFN_LEAN[id](u) : 0 };
          run(jog * 0.6, 0);
          if (id === 'roulette') pv.yaw = -sd * u * TAU;
          if (id === 'dragback') pv.yaw = PI * sm(seg(u, 0.3, 1));
        }
    }
    return pv;
  }

  R3D.Anim = { create, CH, N, REST, STANCE, CLIPS, GK_CLIPS, SKILLS, samplePV, blankPV, blankKV };
})();
