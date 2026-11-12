/* ISO FOOTBALL 3D — animator for the rigid-segment character of player3d.js.

   ISO.R3D.Anim.create(actor) -> { update(pv, dt, ball?), reset(), pose, target, state }
     pv    PlayerView or KeeperView (adapter.js; metres / radians / sim seconds). Plain data, read only.
     dt    real seconds since the last frame (0 = paused: the pose is re-applied, nothing advances)
     ball  optional: the ball as drawn, { x, z, y = height of its lowest point, vx, vy, vz, r } (world metres). Used for the
           feet (dribble touches, the st.touch* request of a clip, the striking foot), the keeper's hands and the head.
   update() also places the actor: group.position = (pv.x, 0, pv.z), group.rotation.y = eased pv.yaw, group.visible = !pv.hidden.

   Pose = Float32Array(N) of named channels (animkit.js). Root translation channels (RX, LIFT, RZ) are metres. Per frame:
     gait      a phase clock and two feet. A foot is either planted (its ankle is kept at a point of the turf, carried back
               under the body by the distance actually travelled) or swinging to the next footfall. Step length follows the
               speed, cadence has a floor, so one model covers standing, walking, running, backpedal and the side shuffle
               without a switch; stopping finishes the step and brings the feet home. At a run the clock locks onto the
               sim's pv.runPh (+PI), so footfalls stay in step with the sim's dribble touches.
     target    T = REST + gait (pelvis, trunk, arms, legs solved from the feet) + stances + the clip of the current state.
     filter    pose = T + offset. The offset is zero while a clip plays (no lag); when the state changes it takes up the
               difference between the pose on screen and the new target and springs to zero (a cross-fade), and it absorbs
               any step of the target faster than a limb can move.
     contact   lean, look-at; lowest point on the turf for clips; in locomotion the legs are solved again on the bones so the
               ankles are exactly on their gait targets, with the pelvis lowered when a planted leg would over-stretch.
     IK        foot on the ball (dribble touch, st.touchSide / touchW / touchSole of a clip), striking foot at the contact
               point (st.ikSide / kickK), keeper hands. All offsets come from the ball radius (ball.r / K.ballR).
   No allocation per frame. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const A = R3D.AnimKit, Clips = R3D.Clips;
  const { PI, TAU, clamp, lerp, sm, seg, damp, wrap, fin, N, CH, REST, arm, leg, easeW } = A;
  const { RX, LIFT, RZ, RYAW, PITCH, ROLL, PX, PY, PZ, SX, SY, SZ, CX, CY, CZ, NX, HX, HY, HZ, ARM_L, ARM_R, LEG_L, LEG_R, GROUND } = CH;

  const KS = (R3D.K && R3D.K.S) || 0.05, BALL_R = (R3D.K && R3D.K.ballR) || 0.11;
  const STRIDE_M = ((ISO.C && ISO.C.STRIDE) || 44) * KS;    // metres per full stride (two steps) of the sim's runPh at a standstill
  const STANCE = new Float32Array(2);                       // left / right foot planted, of the actor updated last
  const SID = { free: 0, skill: 1, tackle: 2, recover: 3, slide: 4, down: 5, stumble: 6, ankle: 7, celebrate: 8, shoulder: 9, away: 10, set: 11, dive: 12, ground: 13, hold: 14 };
  let SEED = 0;
  const JOCK_STEP = 0.4;      // how much shorter the steps of a jockeying / focused defender are
  const SIDE_Z = 0.45;
  const SIDE_L = 1.3;      // metres per cycle of the sideways gait (x body height): short enough that the feet pass without crossing
  const R_LIFT = 0.56, R_MAX = 0.62, R_STR = 0.97, MIS = 0.12;      // a planted foot this far from its hip (x body height) is lifted; the hard reach
  const REACH_LOW = 0.0;      // how far the pelvis may sink (x body height) for a planted trailing leg before that foot lifts
  const LOW_UP = 24, LOW_DN = 9;      // spring rates (1/s) of the pelvis lowering that keeps a planted leg from over-stretching
  const SLEW = new Float32Array(N);      // fastest a pose channel may move per second (0 = no limit besides the filter's)
  SLEW[RX] = SLEW[LIFT] = SLEW[RZ] = 8; SLEW[RYAW] = SLEW[PITCH] = SLEW[ROLL] = 10;
  const LOCK_OFF = { slide: 1, down: 1, ankle: 1, celebrate: 1, stumble: 1 };      // clips that are meant to slide: no foot lock
  const FT_REACH = 1.3, FT_LEAD = 0.25;      // first-time shots: the sim strikes when the ball is within this many metres; the approach pose is blended in over the last FT_LEAD sim s
  const KICK_NEAR = 0.6, KICK_FADE = 0.6;      // the kick IK only cleans up: full within KICK_NEAR (m) of where the clip's swing has the boot, gone KICK_FADE further out
  const OWN_T = 0.2;      // s (real): longest a foot's own swing (a far foot, a foot in the air after a clip) takes
  const LK_STEP_V = 6;      // m/s (real): how fast a released foot travels to the clip's foot
  const LK_LET = 0.95;      // the planted foot is let go at this share of the leg's reach, before the knee is straight
  const LK_SPD = 2.5;      // m/s (real): fastest the clip may move a foot over the body for it to count as standing
  const CLEAR = 0.058;      // metres (x body height) of air between the boot and the ball's surface that the dribbling feet keep
  const DRIB_REACH = 0.6;      // how far (fraction) the footfall on the ball's side moves toward the ball's line
  const RUN_LOW = 0.085;      // pelvis drop (x body height) of a run: the knee of the stance leg is ~0.6 rad at mid-stance
  const WALK_LOW = 0.012;      // pelvis drop (x body height) of a steady walk: nearly upright, the knee only softens (0.04 while accelerating)
  const CUT_YR = 3, CUT_WIDE = 0.05, CUT_AHEAD = 0.16, CUT_OUT = 0.05, CUT_DROP = 0.04, CUT_BACK = 0.12, CUT_ARMS = 0.3;      // braking turn: onset turn rate (rad/s), wider base, outside foot ahead / out, pelvis drop (x h), trunk back, arms out
  const W_SHLD = 7;      // stance weight slot: shielding the ball
  const KEEP_STEP = 0.1;      // the keeper set stance and its shuffle: the fastest a target step is taken, as a share of the usual limit
  const OFF_LINE = 0.35;      // x body height: a planted foot this far to the side of its line of travel is lifted (the body turned over it)
  const NAR_T0 = 0.15, NAR_T1 = 0.35;      // s after a clip ends: when the narrow stance of the sideways gait starts to come in and how long it takes
  const LIFT_GUARD = 0.75;      // a foot does not leave the turf while the other has done less than this share of its swing (both feet are never off it at the start of a step)
  const KEEP_RATE = 50;      // 1/s: how fast a boot gives way to the ball
  const HELD_V = 8;      // m/s (real): fastest a ball may move over its kicker and still count as held at his foot
  const ELB = 0.35;      // how far the elbow opens and closes with the arm's swing (x swing amplitude)
  const TOUCH_GAIN = 1.4;      // clips ask for an instep touch at about 0.7: the boot surface meets the ball surface at 1

  // ---------------------------------------------------------------- leg geometry
  // The leg bones turn as thigh = Rx(rx) Ry(ry) Rz(rz), shin = Rx(knee) (player3d.js / applyPose), so the ankle sits at
  // Rx(rx) Ry(ry) Rz(rz) (0, -(a + b cos k), -b sin k) from the hip. solveLeg inverts that exactly for a given twist ry.
  const SOL = new Float32Array(3);      // rx, rz, knee
  function solveLeg(dx, dy, dz, ry, a, b) {
    let L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxL = (a + b) * 0.998, minL = Math.abs(a - b) + 0.12 * (a + b);
    if (L < 1e-5) { dx = 0; dy = -minL; dz = 0; L = minL; }
    const sc = clamp(L, minL, maxL) / L; dx *= sc; dy *= sc; dz *= sc; L *= sc;
    const kn = Math.acos(clamp((L * L - a * a - b * b) / (2 * a * b), -1, 1));
    const py = -(a + b * Math.cos(kn)), pz = -b * Math.sin(kn), sy = Math.sin(ry), cy = Math.cos(ry);
    const sz = clamp((pz * sy - dx) / (py * cy), -0.95, 0.95), rz = Math.asin(sz);
    const qy = py * Math.cos(rz), qz = py * sz * sy + pz * cy;
    SOL[0] = wrap(Math.atan2(dz, dy) - Math.atan2(qz, qy)); SOL[1] = rz; SOL[2] = kn;
  }
  // the same chain forwards, from pose channels (leg i: 0 left, 1 right): ankle relative to the hip, pelvis frame
  const FKO = new Float32Array(3);
  function fkLeg(P, i, a, b) {
    const o = i ? LEG_R : LEG_L, rx = -P[o], ry = i ? -P[o + 2] : P[o + 2], rz = i ? -P[o + 1] : P[o + 1], kn = P[o + 3];
    const py = -(a + b * Math.cos(kn)), pz = -b * Math.sin(kn);
    const qx = -py * Math.sin(rz) * Math.cos(ry) + pz * Math.sin(ry), qy = py * Math.cos(rz), qz = py * Math.sin(rz) * Math.sin(ry) + pz * Math.cos(ry);
    FKO[0] = qx; FKO[1] = qy * Math.cos(rx) - qz * Math.sin(rx); FKO[2] = qy * Math.sin(rx) + qz * Math.cos(rx);
  }
  // boot sole: heel 0.06 behind and toe 0.19 ahead of the ankle, 0.08 below it. For a foot pitched p (toe down +):
  // ankle height that puts the lower of the two on the turf, and how far the ankle has moved forward over that pivot
  const ankleY = (p, h) => (0.08 * Math.cos(p) + (p > 0 ? 0.19 : -0.06) * Math.sin(p)) * h;
  const pivot = (p, h) => ((p > 0 ? 0.19 : -0.06) * (1 - Math.cos(p)) + 0.08 * Math.sin(p)) * h;

  // 2-bone arm IK (results in IK[0..2]): joint at the origin of d in the parent frame, the elbow folds forward
  const IK = new Float32Array(3);
  function ik2(dx, dy, dz, a, b) {
    let L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxL = (a + b) * 0.995, minL = Math.abs(a - b) + 0.02;
    if (L < 1e-5) { dx = 0; dy = -minL; dz = 0; L = minL; }
    const sc = clamp(L, minL, maxL) / L; dx *= sc; dy *= sc; dz *= sc; L *= sc;
    IK[2] = Math.acos(clamp((L * L - a * a - b * b) / (2 * a * b), -1, 1));
    IK[0] = Math.atan2(dz / L, -dy / L) - Math.acos(clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1));
    IK[1] = Math.asin(clamp(dx / L, -1, 1));
  }

  // ---------------------------------------------------------------- create
  function create(actor) {
    const THREE = actor.THREE || globalThis.THREE;
    const bn = actor.bones, g = actor.group;
    const pose = new Float32Array(N), T = new Float32Array(N), F = new Float32Array(N), S = new Float32Array(N);
    const off = new Float32Array(N), ov = new Float32Array(N), TP = new Float32Array(N), PP = new Float32Array(N);       // filter: offset, its velocity, last target
    const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), mPI = new THREE.Matrix4();
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
    // feet (i: 0 left, 1 right; block of 16 each): 0 x 1 z 2 y 3 pitch 4 heading (group-local; planted: the ankle's flat-foot
    // point on the turf) | at lift-off: 5 x 6 z 7 y 8 pitch 9 heading 10 swing progress | ankle target: 11 x 12 y 13 z | 14 reach weight | 15 swing arch taken away (a foot that starts its swing already in the air) | 15 swing arch taken away (a foot that starts its swing already in the air)
    const lkOn = new Uint8Array(2), lkW = new Float32Array(2), lkS = new Float32Array(2), lkP = new Float32Array(8), lkR = new Float32Array(4), lkQ = new Float32Array([1, 1]), lkDur = new Float32Array(2), lkH = new Float32Array(2), lkD = new Float32Array(4), fs = new Uint8Array(2), own = new Uint8Array(2), sOwn = new Float32Array(2), FT = new Float32Array(32), TPt = new Float32Array(3), WT = new Float32Array(6);
    const st = {
      init: false, yaw: 0, lastX: 0, lastZ: 0, pvx: 0, pvz: 0, ax: 0, az: 0, aL: 0, aF: 0, yawRate: 0, clock: 0, foot: actor.foot || 1, barge: 1, sbOn: false,
      sw: new Float32Array(8), chargeF: 0, rate: 24, ikSide: 0, kickK: 1, prevKickT: 0, cx: 0, cy: 0, cz: 0, contact: false,
      rdW: 0, rdSide: 1, rdX: 0, rdY: 0, rdZ: 0, touchSide: 0, touchW: 0, touchSole: false, leanP: 0, leanR: 0, bank: 0, lockT: 0, lockW: 0, lookY: 0, lookX: 0, lookW: 0, turn: 0,
      diveSide: 1, held: false, throwT: 0, h: 1, rig: actor.rig, seed: (SEED++ * 2.399) % TAU,
      vL: 0, vF: 0, tL: 0, tF: 1, vr: 0, md: 0, mdx: 0, mdz: 0, y0: 0, gph: 0, dq: 0, cb: 0, kox: 0, koz: 0, koy: 0, acc: 0, kp: new Float32Array(4), shL: 0, shF: 1, shW: 0, gkV: 0, gkW: 1, gkHW: 0, settled: true, kf: 0, nar: 1, locoT: 0, spr: 0, prevPh: 0, prevAD: 0,
      key: -1, prevStT: 0, lowF: 0, lowV: 0, Ds: 0.4, mva: 0, loco: false, legT: new Float32Array(2), legW: new Float32Array(2), legG: new Float32Array(2), bL: 0, bF: 0, bY: 0, bR: BALL_R, bOk: false,
    };
    const W_DRIB = 0, W_JOCK = 1, W_FOCUS = 2, W_CHG = 3, W_EXH = 4, W_WALL = 5, W_LOCO = 6;

    function reset() { st.init = false; st.throwT = 0; st.held = false; st.lookW = 0; st.sw.fill(0); st.loco = false; }

    // ground points: [bone, x, y, z, radius] (offsets scaled by rig.h at use)
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

    // ---------------------------------------------------------------- gait
    // plant both feet where they are drawn now (matrices of the last frame): locomotion resumes from the pose a clip left
    function seedFeet() {
      const h = st.h;
      let air = -1;
      for (let i = 0; i < 2; i++) {
        if (st.legW[i] > 0.5) continue;
        own[i] = 0;
        const o = i * 16, ft = i ? bn.footR : bn.footL, th = i ? bn.thighR : bn.thighL, sh = i ? bn.shinR : bn.shinL;
        v3.set(0, 0, 0); ft.localToWorld(v3); g.worldToLocal(v3);
        const p = clamp(bn.root.rotation.x + bn.pelvis.rotation.x + th.rotation.x + sh.rotation.x + ft.rotation.x, -0.5, 0.9);
        const ay = ankleY(p, h);
        if (v3.y > ay + 0.05 * h) {
          // in the air: the foot goes on as a swinging foot from where it is (toward the next footfall), not planted in mid-air
          air = air === -1 ? i : -2;
          fs[i] = 0; FT[o] = FT[o + 5] = v3.x; FT[o + 1] = FT[o + 6] = v3.z; FT[o + 2] = FT[o + 7] = v3.y; FT[o + 3] = FT[o + 8] = p; FT[o + 4] = FT[o + 9] = 0;
          FT[o + 10] = v3.z < 0 ? 0.1 : 0.5; FT[o + 15] = clamp((v3.y - ay) / (0.25 * h), 0, 0.95);
        } else { fs[i] = 1; FT[o] = v3.x; FT[o + 1] = v3.z - pivot(p, h); FT[o + 2] = Math.max(v3.y, ay); FT[o + 3] = p; FT[o + 4] = 0; }
      }
      if (air >= 0) {      // put the gait clock where this foot is that far into its swing (the other foot is then in its stance)
        const D = st.Ds, q = PI + PI * D + FT[air * 16 + 10] * (TAU - 2 * PI * D);
        st.gph = (q - air * PI + TAU) % TAU;
      } else if (air === -2) for (let i = 0; i < 2; i++) { const o = i * 16; if (!fs[i]) { fs[i] = 1; FT[o + 1] -= pivot(FT[o + 3], h); FT[o + 2] = Math.max(FT[o + 2] - 0.0, ankleY(FT[o + 3], h)); } }
    }
    // where the ankle of foot i goes to put the boot on the ball (group-local, into TPt): sole on top, or the instep / inside
    // against the side of the ball that faces that hip
    function touchPoint(i, sole) {
      const h = st.h, r = st.bR;
      if (sole) { TPt[0] = st.bL; TPt[1] = st.bY + 2 * r + 0.075 * h; TPt[2] = st.bF - 0.1 * h; return; }
      let ux = (i ? -1 : 1) * actor.rig.hipX - st.bL, uz = -st.bF;
      const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      TPt[0] = st.bL + ux * (r + 0.05 * h);
      TPt[1] = st.bY + 0.085 * h;
      TPt[2] = st.bF + uz * (r + lerp(0.06, 0.19, sm(0.5 - 2 * uz)) * h) - 0.06 * h * Math.abs(ux);
    }
    // the boot (heel 0.06 behind to toe 0.19 ahead of the ankle, 0.04 below it) stays out of the ball while dribbling: the foot goes around it.
    // A planted foot steps aside (its plant point moves), a swinging foot is pushed off on this frame's target only
    function keepOffBall(i, o, sx, h, planted, dt) {
      if (st.bY > 0.3 * h) { st.kp[i * 2] = st.kp[i * 2 + 1] = 0; return; }
      const r = st.bR, hd = FT[o + 4], ux = Math.sin(hd), uz = Math.cos(hd), ax = FT[o + 11], az = FT[o + 13];
      const t = clamp((st.bL - ax) * ux + (st.bF - az) * uz, -0.06 * h, 0.19 * h), px = ax + ux * t, pz = az + uz * t;
      const vy = FT[o + 12] - 0.04 * h - (st.bY + r), R = r + CLEAR * h, hr = R * R > vy * vy ? Math.sqrt(R * R - vy * vy) : 0;
      let dx = px - st.bL, dz = pz - st.bF; const dl = Math.hypot(dx, dz);
      if (dl >= hr) return;
      if (dl < 1e-3) { dx = sx; dz = 0; } else { dx /= dl; dz /= dl; }
      const k = hr - dl;
      if (planted) { const e = k * (st.init && dt > 0 ? damp(KEEP_RATE, dt) : 1); FT[o] += dx * e; FT[o + 1] += dz * e; FT[o + 11] += dx * e; FT[o + 13] += dz * e; }
      else { const q = st.kp, j = i * 2, e = st.init && dt > 0 ? damp(KEEP_RATE, dt) : 1; q[j] += (dx * k - q[j]) * e; q[j + 1] += (dz * k - q[j + 1]) * e; FT[o + 11] += q[j]; FT[o + 13] += q[j + 1]; }
    }
    // advance the clock and the feet, write the pelvis / trunk / arm motion into T.
    //   jog, top  speeds (sim m/s) the gait is scaled by     kS    sprint 0..1
    //   wide      extra half-width of the base (m)           drop  extra pelvis drop (m)
    //   armK      arm swing scale                            dribW weight of the dribble touch     rph  sim stride phase or NaN
    function gait(T, dt, jog, top, kS, wide, drop, armK, dribW, rph) {
      const R = actor.rig, h = st.h;
      const v = Math.hypot(st.vL, st.vF);
      if (v > 0.05) {      // the heading of the motion, turned no faster than a foot target can follow
        const k = st.init && dt > 0 ? damp(14, dt) : 1;
        let a = st.tL + (st.vL / v - st.tL) * k, b = st.tF + (st.vF / v - st.tF) * k, l = Math.hypot(a, b);
        if (l < 0.2) { a = st.vL / v; b = st.vF / v; l = 1; }      // heading reversed: no direction in between
        st.tL = a / l; st.tF = b / l;
      }
      const tL = st.tL, tF = st.tF, wf = tF > 0 ? tF * tF : 0, wb = tF < 0 ? tF * tF : 0, ws = tL * tL;
      const r = v / jog, k = kS, mvv = sm(v / (0.3 * jog)), vr = st.vr;
      // one cycle (two steps) covers the sim's stride at a run; backwards and sideways it is shorter, and the cadence floor
      // shortens it further at low speed, down to stepping on the spot
      const jk = clamp(st.sw[W_JOCK] + st.sw[W_FOCUS], 0, 1), Ls = STRIDE_M * (1 + 0.3 * clamp(v / top, 0, 1)), Lj = Ls * (1 - JOCK_STEP * jk);      // a jockeying defender takes short, quick steps: the ankles stay ~0.7 m apart
      const LcN = wf * (rph === rph ? Lj : Lj * h) + (wb * Math.min(Ls, 1.7) + ws * lerp(0.6, SIDE_L, st.nar)) * h;
      const fmin = Math.max(lerp(0.8, 1.15, sm(vr / 1.2)), st.settled ? 0 : 1.5 * (1 - mvv));
      const stepping = v > 0.2 || !st.settled;
      if (!st.init) {
        st.gph = (rph === rph ? rph + PI : 0.5 * PI) % TAU;
        for (let i = 0; i < 2; i++) { const o = i * 16; fs[i] = 1; FT[o] = (i ? -1 : 1) * (0.13 * h + wide); FT[o + 1] = 0; FT[o + 2] = ankleY(0, h); FT[o + 3] = 0; FT[o + 4] = 0; }
      } else if (dt > 0 && stepping) {
        st.dq = TAU * Math.max(st.md / LcN, fmin * dt); st.gph += st.dq;
        if (rph === rph) { const e = Math.sin(rph + PI - st.gph); st.gph += 2.5 * wf * (1 - jk) * sm((v - 0.8 * jog) / (0.25 * jog)) * (e > 0 ? e : 0.3 * e) * dt; }
        st.gph %= TAU;
      }
      const Lc = Math.min(LcN, vr / fmin);
      const Dn = lerp(0.62, 0.34, sm((r - 0.3) / 0.55)) - 0.04 * k;
      const Sc = (wf * lerp(0.66, 0.8, sm((0.52 - Dn) / 0.16)) + wb * 0.6 + ws * 0.24) * h;
      const Dr = clamp(Lc > 1e-3 ? Math.min(Dn, Sc / Lc) : Dn, 0.2, 0.7);
      const D = (st.Ds = st.init && dt > 0 ? st.Ds + (Dr - st.Ds) * damp(10, dt) : Dr);       // duty factor: fraction of the cycle a foot is planted (eased: the sim's speed and the pushes it gives are jittery)
      const St = D * Lc, g = sm((0.56 - D) / 0.2), amp = clamp(St / (0.45 * h), 0, 1);       // g: 0 walk .. 1 run (a flight phase)
      const dF = St * lerp(0.5, 0.36, g * wf);                                  // the footfall is ahead of the hip by dF
      // feet go down behind the acceleration: back when driving forward, outside when cutting
      const aoL = clamp(-st.aL * 0.004, -0.14, 0.14) * mvv * h, aoF = clamp(-st.aF * 0.004, -0.14, 0.14) * mvv * h;
      const s0 = PI - PI * D, s1 = PI + PI * D, swSpan = TAU - 2 * PI * D;
      const pTd = (wf * (lerp(-0.25, -0.08, g) + 0.16 * k) + wb * 0.2) * amp, pOff = (wf * (lerp(0.45, 0.75, g) + 0.1 * k) + wb * 0.25 + ws * 0.15) * amp;
      const hs = ((wf * (lerp(0.045, 0.2, g) + 0.17 * k) + wb * 0.07 + ws * 0.16) * lerp(0.5, 1, amp) + 0.035) * h;
      // braking turn (a cut): the foot on the outside of the turn plants out and ahead, the base widens, the body sits back and low
      const cbT = sm((Math.abs(st.yawRate) - CUT_YR) / 5) * st.mva, cb = (st.cb = st.init && dt > 0 ? st.cb + (cbT - st.cb) * damp(6, dt) : 0), tS = st.yawRate > 0 ? 1 : -1;
      const w = (lerp(0.13, 0.085, g * wf) - 0.02 * k + (0.17 * ws * (1 - st.nar) - 0.22 * ws * ws * st.nar)) * h + wide + CUT_WIDE * h * cb;      // sideways the feet pass each other: at most ~0.7 m apart
      const hipN = bn.pelvis.position.y + bn.thighL.position.y - 0.045 * h;      // the hip's height in a run, for the reach test
      // how far behind its hip a planted foot may be before the leg has to bend more than the pelvis may be lowered for it: a foot
      // past this lifts (a start or a surge outruns the clock), or gives, instead of taking the pelvis down
      const hipY = hipN + T[LIFT] + (-lerp(0.006, lerp(lerp(WALK_LOW, 0.04, st.acc), RUN_LOW, g) + 0.015 * k, st.mva) - 0.03 * ws * st.mva - CUT_DROP * cb) * h - drop, Lq = (R.thigh + R.shin) * 0.99;
      const c0 = Math.cos(st.y0), sn0 = Math.sin(st.y0), c1 = Math.cos(st.yaw), sn1 = Math.sin(st.yaw), dyw = wrap(st.y0 - st.yaw);
      let settled = true;
      for (let i = 0; i < 2; i++) {
        const o = i * 16, sx = i ? -1 : 1, ob = sx === -tS ? cb : 0, hz = aoF + CUT_AHEAD * h * ob;
        // dribbling: the foot on the ball's side lands toward the ball's line, so the ball stays within a boot's reach
        const hx = sx * (w + CUT_OUT * h * ob) + aoL + (dribW > 0.01 && st.bOk && st.bY < 0.3 * h ? DRIB_REACH * dribW * sm((st.bL * sx + 0.1) / 0.2) * clamp(st.bL - sx * w, -0.35 * h, 0.35 * h) : 0);
        let q = (st.gph + i * PI) % TAU; if (q < 0) q += TAU;
        const inWin = q >= s0 && q <= s1, t = (q > s1 ? q - s1 : q + TAU - s1) / swSpan;
        const was = fs[i];
        if (own[i] && !fs[i] && dt > 0) sOwn[i] += Math.max(st.dq / swSpan, dt / OWN_T);      // a foot with a swing of its own lands within OWN_T whatever the cadence
        if (!was && (own[i] ? sOwn[i] >= 1 : inWin)) {          // touchdown: from here the point stays where the swing put it, pivoting about the toe or heel
          const pvt = pivot(FT[o + 3], h);
          fs[i] = 1; own[i] = 0; FT[o] += st.kp[i * 2] - Math.sin(FT[o + 4]) * pvt; FT[o + 1] += st.kp[i * 2 + 1] - Math.cos(FT[o + 4]) * pvt; st.kp[i * 2] = st.kp[i * 2 + 1] = 0;
        }
        if (fs[i]) {
          // planted: the point stays on the turf, so in the body's frame it goes back by what the body moved and turned
          const wx = FT[o] * c0 + FT[o + 1] * sn0 - st.mdx, wz = -FT[o] * sn0 + FT[o + 1] * c0 - st.mdz;
          FT[o] = wx * c1 - wz * sn1; FT[o + 1] = wx * sn1 + wz * c1; FT[o + 4] = clamp(FT[o + 4] + dyw, -0.6, 0.6);
          const ex = FT[o] - sx * R.hipX, ez = FT[o + 1], el = Math.hypot(ex, ez), vq = hipY - FT[o + 2] - REACH_LOW * h, eq = vq < Lq ? (vq > 0 ? Math.sqrt(Lq * Lq - vq * vq) : Lq) : 0, rl = fs[1 - i] ? Math.min(R_LIFT * h, eq) : R_LIFT * h, rm = Math.min(R_MAX * h, eq + 0.04 * h);
          // lift when its stance is over; a foot whose stance is about to start stays down (no hop from a standstill). A foot that
          // has trailed too far (a start, a clip's exit, a speed jump: the clock thinks it still has stance left) lets go at once
          // and swings on a progress of its own (own[i]) instead of the clock's.
          const dyl = hipN - FT[o + 2], uu = inWin ? (q - s0) / (s1 - s0) : t < 0.5 ? 1 : 0, mis = dF - uu * St - ((FT[o] - hx) * tL + (FT[o + 1] - hz) * tF);      // how far behind where the clock says it should be
          const far = el > rl || (mis > MIS * h && el * el + dyl * dyl > (R_STR * (R.thigh + R.shin)) ** 2) || mis > 2 * MIS * h || (stepping && Math.abs((FT[o] - hx) * tF - (FT[o + 1] - hz) * tL) > OFF_LINE * h);      // or the body has turned about it, leaving it far off the line of travel
          // the other foot only just left the turf (a start from a standstill): this one stays down, a step has one foot on the turf at its start
          let qo = (st.gph + (1 - i) * PI) % TAU; if (qo < 0) qo += TAU;
          const oth = fs[1 - i] ? 1 : own[1 - i] ? sOwn[1 - i] : clamp(((qo > s1 ? qo - s1 : qo + TAU - s1) / swSpan - FT[(1 - i) * 16 + 10]) / (1 - FT[(1 - i) * 16 + 10] + 1e-3), 0, 1), hold = oth < LIFT_GUARD && el < rm;
          if (was && stepping && !hold && ((!inWin && t < 0.6 && (fs[1 - i] || D < 0.5 || el > 0.4 * h)) || far)) {
            const ok = !inWin && t < 0.6;
            fs[i] = 0; own[i] = ok ? 0 : 1; sOwn[i] = 0; const pvt = pivot(FT[o + 3], h); FT[o + 5] = FT[o] + Math.sin(FT[o + 4]) * pvt; FT[o + 6] = FT[o + 1] + Math.cos(FT[o + 4]) * pvt; FT[o + 7] = FT[o + 2]; FT[o + 8] = FT[o + 3]; FT[o + 9] = FT[o + 4]; FT[o + 10] = ok ? t : 0; FT[o + 15] = 0;
          } else if (el > rm) { FT[o] = sx * R.hipX + (ex * rm) / el; FT[o + 1] = (ez * rm) / el; }      // out of reach: it has to give
        }
        if (fs[i]) {
          // heel strike -> flat -> heel rises onto the toe
          const u = inWin ? (q - s0) / (s1 - s0) : 0;
          const pS = !inWin ? 0 : u < 0.15 ? pTd * (1 - sm(u / 0.15)) : u > 0.55 ? pOff * sm((u - 0.55) / 0.45) : 0;
          if (dt > 0) FT[o + 3] += (pS - FT[o + 3]) * damp(40, dt);
          FT[o + 2] = Math.max(ankleY(FT[o + 3], h), FT[o + 2] - 3 * dt);
          const pvt = pivot(FT[o + 3], h);
          FT[o + 11] = FT[o] + Math.sin(FT[o + 4]) * pvt; FT[o + 12] = FT[o + 2]; FT[o + 13] = FT[o + 1] + Math.cos(FT[o + 4]) * pvt; FT[o + 14] = 1;
          if (Math.hypot(FT[o] - hx, FT[o + 1] - hz) > 0.09 * h) settled = false;
        } else {
          // swing: from where it left the turf to the next footfall, leaving and arriving with the ground's speed
          const rt = FT[o + 10], s = own[i] ? clamp(sOwn[i], 0, 1) : clamp((t - rt) / (1 - rt), 0, 1), s2 = s * s, s3 = s2 * s;
          const ddx = hx + tL * dF - FT[o + 5], ddz = hz + tF * dF - FT[o + 6], dist = Math.max(0.08 * h, Math.hypot(ddx, ddz));
          const gt = Lc * (1 - D) * (1 - rt), m0 = Math.min(2.4, gt / dist), m1 = Math.min(4, gt / dist);
          const e = 3 * s2 - 2 * s3 - m0 * (s3 - 2 * s2 + s) - m1 * (s3 - s2);
          FT[o] = FT[o + 5] + ddx * e; FT[o + 1] = FT[o + 6] + ddz * e;
          FT[o + 3] = lerp(FT[o + 8], pTd, sm((s - 0.2) / 0.6)); FT[o + 4] = FT[o + 9] * (1 - sm(s * 2));
          FT[o + 2] = Math.max(ankleY(FT[o + 3], h), lerp(FT[o + 7], ankleY(pTd, h), sm(s)) + hs * (1 - FT[o + 15]) * Math.sin(PI * s * (1.35 - 0.35 * s)) + (own[i] ? 0.03 * h * sm(s / 0.03) : 0.03 * h * sm(s / 0.15)) * sm((1 - s) / 0.15));
          const pz = SIDE_Z * h * st.nar * (1 + 0.3 * st.sw[W_FOCUS]) * Math.sin(PI * Math.pow(s, 0.8)) ** 2 * sm(((FT[16 - o + 11] - FT[o]) * (tL > 0 ? 1 : -1) + 0.4 * h) / (0.3 * h));      // a foot still behind the other one in the direction of travel passes it in front (a carioca step): off the line of travel, to the front
          FT[o + 11] = FT[o] - pz * tF * tL; FT[o + 12] = FT[o + 2]; FT[o + 13] = FT[o + 1] + pz * ws;
          if (i === (st.kf > 0 ? 1 : 0) && st.sw[W_CHG] > 0.01) {      // a charging runner draws the kicking foot back on the swing: the kick carries on from there
            const cw = st.sw[W_CHG] * (0.4 + 0.6 * st.chargeF) * Math.sin(PI * s);
            FT[o + 13] -= 0.3 * h * cw; FT[o + 12] += 0.14 * h * cw;
          }
          FT[o + 14] = sm((s - 0.75) / 0.25);      // a foot in swing never takes the pelvis down; it only counts as it lands
          settled = false;
          // dribbling: the foot on the ball's side reaches for it late in its swing
          if (dribW > 0.01 && st.bOk && st.bY < 0.3 * h) {
            touchPoint(i, false);
            const wt = dribW * sm((1.2 * h - Math.hypot(FT[o] - TPt[0], FT[o + 1] - TPt[2])) / (0.6 * h)) * sm(seg(s, 0.05, 0.4)) * (1 - sm(seg(s, 0.55, 0.96))) * sm((st.bL * sx + 0.25) / 0.3);
            if (wt > 0.001) { FT[o + 11] += (TPt[0] - FT[o]) * wt; FT[o + 12] += (Math.max(TPt[1], FT[o + 2] * 0.5) - FT[o + 2]) * wt; FT[o + 13] += (TPt[2] - FT[o + 1]) * wt; }
          }
        }
        if (dribW > 0.01 && st.bOk) keepOffBall(i, o, sx, h, fs[i], dt);
        STANCE[i] = fs[i];
      }
      st.settled = settled;
      // ---- pelvis, trunk, arms (left foot mid-stance at phase PI)
      st.acc = st.init && dt > 0 ? st.acc + (clamp(Math.hypot(st.aL, st.aF) / 10, 0, 1) - st.acc) * damp(clamp(Math.hypot(st.aL, st.aF) / 10, 0, 1) > st.acc ? 30 : 1.5, dt) : 0;      // how hard he is accelerating, slowly: a start or a stop keeps the lower walk
      st.mva = st.init && dt > 0 ? st.mva + (mvv - st.mva) * damp(7, dt) : mvv;      // the arms and the pelvis' height follow the sim's jittery speed more slowly than the legs do
      const ph = st.gph, sl = Math.sin(ph), cl = Math.cos(ph), c2 = Math.cos(2 * ph), wi = 1 - mvv, osc = st.mva * amp;
      // the run sits lower with the body lowest at mid-stance; the walk vaults over the planted leg
      T[LIFT] += (-lerp(0.006, lerp(lerp(WALK_LOW, 0.04, st.acc), RUN_LOW, g) + 0.015 * k, st.mva) + lerp(0.018, -0.03, g) * osc * (1 - 0.8 * ws) * c2) * h - drop - 0.03 * ws * st.mva * h - CUT_DROP * h * cb;
      T[RX] += lerp(0.03, 0.012, g) * osc * cl * h;                               // over the planted foot
      const yawA = (lerp(0.07, 0.13, g) + 0.05 * k) * osc * tF;
      T[PY] += yawA * sl; T[CY] -= 1.6 * yawA * sl; T[HY] += 0.6 * yawA * sl;     // hips with the swinging leg, shoulders against them
      T[PZ] -= 0.05 * osc * cl; T[SZ] += 0.03 * osc * cl;                         // the swing-side hip drops
      const lean = (0.03 + 0.07 * g + 0.12 * k) * mvv * wf + 0.05 * wb * mvv;
      T[SX] += lean - CUT_BACK * cb; T[ARM_L + 1] += CUT_ARMS * cb; T[ARM_R + 1] += CUT_ARMS * cb; T[CX] += 0.04 * k * mvv * wf; T[HX] -= 0.5 * lean;
      const aA = (lerp(0.28, 0.62, g) + 0.33 * k) * st.mva * amp * armK * (0.35 * clamp(tF * 4, -1, 1) + 0.65 * tF);      // swing direction follows the heading, through zero when it turns
      const el = (lerp(0.3, 1.1, g) + 0.35 * k) * st.mva * (0.5 + 0.5 * armK), ab = (0.04 + 0.05 * k + 0.12 * ws) * st.mva;
      const lo = Math.sin(st.clock * 0.37 + st.seed * 1.7), lo2 = Math.sin(st.clock * 1.9 + st.seed * 0.7);      // one arm swings a little wider than the other, and it drifts
      T[ARM_L] += -aA * (1 + 0.1 * lo) * sl - 0.08 * g * mvv; T[ARM_R] += aA * (1 - 0.1 * lo) * sl - 0.08 * g * mvv;
      T[ARM_L + 3] += el * (1 + 0.06 * lo) - ELB * aA * sl; T[ARM_R + 3] += el * (1 - 0.06 * lo) + ELB * aA * sl;     // the elbow opens on the way forward: the hand rises to the chest and drops to the hip
      T[ARM_L + 1] += 0.05 * lo2 * st.mva; T[ARM_R + 1] -= 0.05 * lo2 * st.mva;
      T[ARM_L + 1] += ab; T[ARM_R + 1] += ab;
      if (wi > 0.001) {         // standing: breathe, shift the weight from leg to leg
        const sw = Math.sin(st.clock * 0.55 + st.seed), br = Math.sin(st.clock * 1.5 + st.seed * 2);
        T[RX] += 0.022 * sw * wi * h; T[PZ] += 0.02 * sw * wi; T[SZ] -= 0.022 * sw * wi; T[PY] += 0.03 * Math.sin(st.clock * 0.31 + st.seed) * wi;
        T[SX] += 0.02 * wi; T[ARM_L + 3] += (0.2 + 0.04 * br) * wi; T[ARM_R + 3] += 0.14 * wi; T[ARM_L] += (0.03 + 0.04 * sw) * wi; T[ARM_R] += (0.06 - 0.04 * sw) * wi; T[ARM_L + 1] += 0.03 * wi; T[ARM_R + 1] += 0.05 * wi;
        T[ARM_R + 3] += 0.04 * br * wi; T[ARM_L + 1] += 0.012 * br * wi; T[ARM_R + 1] += 0.012 * br * wi;
      }
    }
    // the leg channels of T from the ankle targets, for the pelvis as T has it (yaw and translation; lean is handled on the bones)
    function legsToPose(T) {
      const R = actor.rig, th = -(T[RYAW] + T[PY]), ct = Math.cos(th), sn = Math.sin(th);
      const hy = bn.pelvis.position.y + bn.thighL.position.y + T[LIFT];
      for (let i = 0; i < 2; i++) {
        const o = i * 16, b = i ? LEG_R : LEG_L, hx0 = (i ? bn.thighR : bn.thighL).position.x;
        const dx = FT[o + 11] - (-T[RX] + hx0 * ct), dz = FT[o + 13] - (T[RZ] - hx0 * sn), ry = FT[o + 4] - th;
        solveLeg(dx * ct - dz * sn, FT[o + 12] - hy, dx * sn + dz * ct, ry, R.thigh, R.shin);
        T[b] = -SOL[0]; T[b + 1] = i ? -SOL[1] : SOL[1]; T[b + 2] = i ? -ry : ry; T[b + 3] = SOL[2]; T[b + 4] = FT[o + 3] - SOL[0] - SOL[2];
      }
    }

    // ---------------------------------------------------------------- the per-frame target
    function target(pv, dt, keeper, ball) {
      T.set(REST);
      st.rate = 24; st.ikSide = 0; st.lockT = 0; st.legT[0] = st.legT[1] = 0;
      st.rdW = 0; st.touchSide = 0; st.touchW = 0; st.touchSole = false;      // a clip may ask for a foot on the ball: side (+1 right / -1 left), weight 0..1, sole on top instead of instep against it
      if (keeper) return targetKeeper(pv, dt, ball);
      const state = pv.state, kick = pv.kickT > 0, fake = pv.fakeU > 0;
      const jog = Math.max(0.5, fin(pv.jog, 5)), top = Math.max(jog + 0.1, fin(pv.top, 7.5));
      const v = Math.hypot(st.vL, st.vF), r = v / jog, mvv = sm(v / (0.3 * jog));
      const loco = state === 'free' && !kick && !fake;
      if (loco && !st.loco && st.init) { seedFeet(); st.locoT = 0; }
      st.loco = loco;
      st.locoT += dt; st.nar = sm((st.locoT - NAR_T0) / NAR_T1);      // the narrow sideways stance comes in once the feet have settled after a clip
      // ---- stance weights (eased at 10/s)
      const kw = st.init ? damp(10, dt) : 1, W = st.sw;
      easeW(W, W_DRIB, pv.owner && state === 'free' && !pv.shield ? 1 : 0, kw);
      easeW(W, W_JOCK, (pv.jock || pv.shield) && !pv.focus ? 1 : 0, kw);
      easeW(W, W_FOCUS, pv.focus ? 1 : 0, kw);
      easeW(W, W_SHLD, pv.shield && !pv.focus ? 1 : 0, st.init ? damp(5, dt) : 1);
      // the foot that will kick: the latched kick's, the side of ball3d's strike spot, the side the ball is on, else the strong foot (kept while a charge is on screen)
      if (W[W_CHG] < 0.05 || !st.kf) {
        const sk = ball && ball.strike;
        st.kf = kick && pv.kick && pv.kick.foot ? (pv.kick.foot > 0 ? 1 : -1) : sk && sk.on > 0 && sk.foot ? (sk.foot > 0 ? 1 : -1) : ball && Math.abs(st.bL) > 0.15 ? (st.bL < 0 ? 1 : -1) : st.foot;
      }
      const ch = pv.charge && !pv.charge.ft;
      if (ch) st.chargeF = clamp(fin(pv.charge.f, 0), 0, 1);
      easeW(W, W_CHG, ch && !kick ? 1 : 0, kw);
      easeW(W, W_EXH, pv.exhausted ? 1 : 0, kw);
      easeW(W, W_WALL, pv.wall ? 1 : 0, kw);
      st.spr += ((pv.sprint && r > 0.9 ? 1 : 0) - st.spr) * (st.init ? damp(6, dt) : 1);
      const shld = W[W_SHLD], drib = W[W_DRIB], jock = W[W_JOCK], focus = W[W_FOCUS], exh = W[W_EXH], ww = W[W_WALL];
      const k = Math.max(clamp((v - jog) / (top - jog), 0, 1), 0.45 * st.spr) * (1 - jock) * (1 - focus) * (1 - 0.4 * exh);
      // ---- gait, then what the stances add above the hips (their crouch and base went into the gait)
      gait(T, dt, jog, top, k, (0.07 * jock + 0.1 * focus + 0.02 * drib + 0.05 * shld) * st.h, (0.085 * jock + 0.12 * focus + 0.015 * drib + 0.2 * exh * (1 - mvv) + 0.06 * shld) * st.h,
        1 - 0.15 * drib - 0.55 * jock - 0.3 * exh, loco ? drib : 0, fin(pv.runPh, NaN));
      if (drib > 0.001) { const dl = Math.sin(st.clock * 2.3 + st.seed) * mvv; T[ARM_L + 1] += (0.22 + 0.07 * dl) * drib; T[ARM_R + 1] += (0.22 - 0.07 * dl) * drib; T[ARM_L] += 0.05 * dl * drib; T[ARM_R] -= 0.05 * dl * drib; T[HX] += 0.18 * drib; T[SX] += 0.06 * drib; }
      if (jock > 0.001) {
        T[SX] += 0.2 * jock; T[CX] += 0.05 * jock; T[HX] -= 0.12 * jock; T[ARM_L] += 0.1 * jock; T[ARM_R] += 0.1 * jock;
        T[ARM_L + 1] += 0.35 * jock; T[ARM_R + 1] += 0.35 * jock; T[ARM_L + 3] += 0.25 * jock; T[ARM_R + 3] += 0.25 * jock;
      }
      if (shld > 0.001) shieldStance(T, shld, pv, dt);
      if (focus > 0.001) {
        T[SX] += 0.16 * focus; T[PY] += 0.52 * focus * st.foot * (1 - 0.9 * st.tL * st.tL * mvv); T[CY] -= 0.1 * focus * st.foot; T[HY] -= 0.35 * focus * st.foot;
        T[ARM_L + 1] += 0.45 * focus; T[ARM_R + 1] += 0.45 * focus; T[ARM_L + 3] += 0.4 * focus; T[ARM_R + 3] += 0.4 * focus;
      }
      if (exh > 0.001) {          // hands toward the knees when standing, a heavy head when moving
        const ew = exh * (1 - mvv), em = exh * mvv;
        T[SX] += 0.8 * ew + 0.08 * em; T[HX] += 0.2 * ew + 0.1 * em; T[ARM_L] += 0.8 * ew; T[ARM_R] += 0.8 * ew; T[ARM_L + 3] += 0.1 * ew; T[ARM_R + 3] += 0.1 * ew; T[ARM_L + 1] -= 0.05 * ew; T[ARM_R + 1] -= 0.05 * ew;
      }
      if (ww > 0.001) { T[ARM_L] += 0.38 * ww; T[ARM_R] += 0.38 * ww; T[ARM_L + 1] -= 0.42 * ww; T[ARM_R + 1] -= 0.42 * ww; T[ARM_L + 3] += 0.35 * ww; T[ARM_R + 3] += 0.35 * ww; T[HX] -= 0.05 * ww; }
      // wind-up: arms and hips with the charge; the kicking leg goes back only when (nearly) standing, a runner keeps running
      const cwU = W[W_CHG] * (1 - 0.5 * clamp(r, 0, 1)), cwL = W[W_CHG] * (1 - sm(v / 1.2)), m = st.kf;
      if (cwU > 0.001) {
        const f = st.chargeF, ab = arm(-m), aa = arm(m);
        T[ab] += (0.5 - T[ab]) * cwU; T[ab + 1] += (0.25 + 0.35 * f - T[ab + 1]) * cwU; T[aa] += (-0.55 - T[aa]) * cwU; T[aa + 1] += (0.3 + 0.2 * f - T[aa + 1]) * cwU;
        T[SX] += 0.05 * cwU; T[PY] += m * 0.2 * f * cwU;
      }
      legsToPose(T);
      if (cwL > 0.001) {
        const f = st.chargeF, b = leg(m);
        T[b] += (lerp(-0.25, -0.7, f) - T[b]) * cwL; T[b + 3] += (lerp(0.5, 1.25, f) - T[b + 3]) * cwL; T[b + 4] += (0.4 - T[b + 4]) * cwL;
      }
      if (loco) { st.legT[0] = st.legT[1] = 1; st.legT[m > 0 ? 1 : 0] = 1 - cwL; st.lockT = 1; }
      st.rate = 20;
      // ---- actions (priority order of render.js playerPose)
      W[W_LOCO] = loco || state === 'skill' ? 1 : 0.3;
      if (state === 'celebrate') { T.set(REST); Clips.celebrate(T, pv, st, ball); st.rate = 24; W[W_LOCO] = 0; }
      else if (state === 'ankle') { T.set(REST); Clips.ankle(T, pv, st, ball); st.rate = 15; W[W_LOCO] = 0; }
      else if (state === 'slide' || state === 'down') {
        const up = state === 'down' && fin(pv.stDur, 0) - fin(pv.stT, 0) < 0.13;
        T.set(REST); Clips.slide(T, pv, st, up); st.rate = up ? 20 : 30; W[W_LOCO] = 0;
      } else if (state === 'stumble') { T.set(REST); Clips.stumble(T, pv, st, ball); st.rate = 30; W[W_LOCO] = 0; }
      else if (state === 'tackle' || state === 'recover') {
        Clips.tackle(T, pv, st, state === 'tackle' ? 1 : 0.45); st.rate = state === 'tackle' ? 42 : 20; W[W_LOCO] = 0;
      } else if (state === 'skill' && pv.skill) { st.rate = 32; Clips.skill(T, pv, st, ball); }
      else if (fake && pv.fakeU < 1) { st.rate = 40; Clips.fake(T, pv, st, ball); }
      else if (kick) { st.rate = 40; Clips.kick(T, pv, st, ball); }
      else if (pv.charge && pv.charge.ft && Clips.kickReady && ball) {      // a first-time strike is coming: draw the leg back and carry the body to where the sim will strike
        const bx = fin(ball.x, pv.x) - fin(pv.x, 0), bz = fin(ball.z, pv.z) - fin(pv.z, 0), d = Math.hypot(bx, bz) || 1e-3, vbx = fin(ball.vx, 0) - fin(pv.vx, 0), vbz = fin(ball.vz, 0) - fin(pv.vz, 0);
        const closing = Math.max(1, -(bx * vbx + bz * vbz) / d), tt = Math.max(0, (d - FT_REACH) / closing);      // sim s until the ball is within the strike distance
        const w = sm(1 - tt / FT_LEAD), side = Math.abs(st.bL) > 0.05 ? (st.bL < 0 ? 1 : -1) : st.foot;
        if (w > 0.001) {
          Clips.kickReady(T, pv, st, w, side, fin(ball.x, pv.x) + fin(ball.vx, 0) * Math.min(tt, FT_LEAD), fin(ball.z, pv.z) + fin(ball.vz, 0) * Math.min(tt, FT_LEAD));
          const li = side > 0 ? 1 : 0; st.legT[li] = Math.min(st.legT[li], 1 - w);
          st.rdW = w; st.rdSide = side; st.rdX = fin(ball.x, pv.x) + fin(ball.vx, 0) * tt; st.rdY = Math.max(0, fin(ball.y, 0) + fin(ball.vy, 0) * tt - 4.9 * tt * tt * 0); st.rdZ = fin(ball.z, pv.z) + fin(ball.vz, 0) * tt;
        }
      }
      else if (state === 'shoulder') { if (!st.sbOn) bargeSide(pv); st.sbOn = true; st.rate = 40; Clips.shoulder(T, pv, st, ball); }
      if (state !== 'shoulder') st.sbOn = false;
    }
    // shielding: the opponent is on the near side, the ball on the far foot. The torso turns side-on to him, the near arm is out against him
    // (forearm up), the far arm is bent in; the weight rocks a little from foot to foot
    function shieldStance(T, w, pv, dt) {
      const vf = R3D.Adapter && R3D.Adapter.vf, ps = vf && vf.players, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      let bd = 36, oL = 0, oF = 0, found = false;      // nearest opponent within 6 m, as (left, forward) in the body's frame
      if (ps) for (let i = 0; i < ps.length; i++) {
        const o = ps[i];
        if (!o || o.hidden || o.team === pv.team) continue;
        const dx = fin(o.x, 0) - fin(pv.x, 0), dz = fin(o.z, 0) - fin(pv.z, 0), d = dx * dx + dz * dz;
        if (d < bd && d > 0.01) { bd = d; oL = dx * cy - dz * sy; oF = dx * sy + dz * cy; found = true; }
      }
      if (!found && st.bOk && Math.hypot(st.bL, st.bF) > 0.2) { oL = -st.bL; oF = -st.bF; found = true; }      // the sim puts the ball straight away from him
      if (found) { const l = Math.hypot(oL, oF) || 1, k = st.init ? damp(6, dt) : 1; st.shL += (oL / l - st.shL) * k; st.shF += (oF / l - st.shF) * k; }
      const a = Math.atan2(st.shL, st.shF), side = a >= 0 ? 1 : -1, tw = clamp(PI / 2 - Math.abs(a), 0, 1.1) * w;      // side: +1 opponent on his left
      const rock = Math.sin(st.clock * 1.7 + st.seed), rock2 = Math.sin(st.clock * 2.9 + st.seed * 2);
      T[PY] += side * 0.38 * tw + 0.04 * rock * w; T[SY] += side * 0.27 * tw; T[CY] += side * 0.3 * tw - 0.03 * rock * w;
      T[SX] += 0.08 * w; T[HX] -= 0.08 * w; T[RX] += 0.03 * st.h * rock * w; T[PZ] += 0.03 * rock * w;
      const nr = arm(-side), fr = arm(side);
      T[nr] += (0.5 + 0.06 * rock2 - T[nr]) * w; T[nr + 1] += (0.9 + 0.07 * rock - T[nr + 1]) * w; T[nr + 3] += (0.95 + 0.08 * rock2 - T[nr + 3]) * w;
      T[fr] += (0.2 - T[fr]) * w; T[fr + 1] += (0.3 - T[fr + 1]) * w; T[fr + 3] += (1.15 - T[fr + 3]) * w;
    }
    // the lead shoulder of a barge is the one toward the nearest opponent, judged once at the start (the body has not turned yet)
    function bargeSide(pv) {
      const vf = R3D.Adapter && R3D.Adapter.vf, ps = vf && vf.players;
      if (!ps) return;
      let bd = 16, bl = 0;
      for (let i = 0; i < ps.length; i++) {
        const o = ps[i];
        if (!o || o.hidden || o.team === pv.team) continue;
        const dx = fin(o.x, 0) - fin(pv.x, 0), dz = fin(o.z, 0) - fin(pv.z, 0), d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bl = dx * Math.cos(st.yaw) - dz * Math.sin(st.yaw); }
      }
      if (Math.abs(bl) > 0.05) st.barge = bl < 0 ? 1 : -1;      // local +x is the player's left
    }

    function targetKeeper(pv, dt, ball) {
      const state = pv.state, R = actor.rig;
      // dive side in the keeper's frame (+1 = his right): the dive runs along world x by diveDir
      const dw = (pv.diveDir || 1) * -Math.cos(st.yaw);
      if (state === 'dive') st.diveSide = dw >= 0 ? 1 : -1;
      // throw: KeeperView has no clock for it, so it is latched here (0.3 s) on holding -> released or save.kind 'throw'
      if ((st.held && !pv.holding && state === 'set') || (pv.save && pv.save.kind === 'throw' && st.throwT <= 0 && st.held)) st.throwT = 0.3;
      st.held = !!pv.holding;
      if (st.throwT > 0) st.throwT = Math.max(0, st.throwT - dt);
      st.rate = 24; st.sw[W_LOCO] = state === 'dive' || state === 'ground' || state === 'slide' ? 0 : 1;
      const slide = state === 'slide' || (state === 'ground' && pv.slid), hold = pv.holding || state === 'hold';
      const loco = !slide && state !== 'dive' && state !== 'ground' && !hold && !(st.throwT > 0);
      if (!loco) {
        st.loco = false;
        if (slide) { if (Clips.gkSlide) Clips.gkSlide(T, pv, st, ball); else Clips.slide(T, pv, st, false); st.rate = 30; }      // the slide and the get-up into the set stance
        else if (state === 'dive') { Clips.gkDive(T, pv, st, clamp(fin(pv.u, 0), 0, 1), true, ball); st.rate = 34; }
        else if (state === 'ground') Clips.gkGround(T, pv, st, ball);
        else if (hold) Clips.gkHold(T, pv, st, ball);
        else { Clips.gkThrow(T, 1 - st.throwT / 0.3, pv, st, ball); st.rate = 40; }
      } else {
        // set / shuffle / rush: the set clip gives the stance (how wide, how low, the arms), the gait moves the feet under it
        if (!st.loco && st.init) { seedFeet(); st.locoT = 0; }
        st.loco = true; st.locoT += dt; st.nar = sm((st.locoT - NAR_T0) / NAR_T1);
        // the sim's speed jumps from 0 to 10 m/s in one step: the stance and arms follow a smoothed speed and an eased weight
        st.gkV = st.init && dt > 0 ? st.gkV + (Math.hypot(st.vL, st.vF) - st.gkV) * damp(5, dt) : Math.hypot(st.vL, st.vF);
        const run = sm((st.gkV - 2.5) / 2), rch = Clips.gkReach ? clamp(fin(Clips.gkReach(st), 0), 0, 1) : 0;
        S.set(REST); Clips.gkSet(S, pv, st, ball);
        const wT = Math.max(1 - 0.7 * run, rch);      // the reflex reach of a shot keeps the clip's trunk
        const wS = (st.gkW = st.init && dt > 0 ? st.gkW + (wT - st.gkW) * damp(wT > st.gkW ? 14 : 7, dt) : wT);
        fkLeg(S, 0, R.thigh, R.shin); const x0 = FKO[0], y0 = FKO[1];
        fkLeg(S, 1, R.thigh, R.shin);
        const half = bn.thighL.position.x + 0.5 * (x0 - FKO[0]), low = R.thigh + R.shin + 0.5 * (y0 + FKO[1]) - S[LIFT];
        gait(T, dt, 4.5, 6.5, 0, (half - 0.13 * st.h) * wS, Math.max(0, low) * wS, 0.4 + 0.6 * run, 0, NaN);
        T[RX] += (S[RX] - REST[RX]) * wS; T[RZ] += (S[RZ] - REST[RZ]) * wS;      // LIFT is the gait's: its pelvis drop already takes the crouch
        for (let i = RYAW; i < LEG_L; i++) { T[i] += (S[i] - REST[i]) * wS; if (i >= ARM_L) T[i] += (S[i] - T[i]) * rch; }      // a reach takes the arms from the clip, not on top of the gait's swing
        legsToPose(T);
        if (pv.chip) { Clips.gkChip(T, pv, st, ball); st.rate = 30; }
        else { st.legT[0] = st.legT[1] = 1; st.lockT = 1; }
      }
      // parry: a quick flick of the near arm toward the ball
      if (pv.save && (pv.save.kind === 'parry' || pv.save.kind === 'weak') && pv.save.age < 0.2 && !(st.gk && st.gk.ik > 0.05)) {
        const w = Math.sin(PI * clamp(pv.save.age / 0.2, 0, 1)), a = arm(st.gk ? st.gk.ds : st.diveSide);
        T[a] += 0.5 * w; T[a + 3] *= 1 - w; T[a + 1] += 0.3 * w;
      }
    }
    // what is playing, as a number: a change of it is a cut that the filter cross-fades
    function stateKey(pv, keeper) {
      let k = SID[pv.state] | 0;
      if (keeper) return k + (pv.holding ? 16 : 0) + (st.throwT > 0 ? 32 : 0) + (pv.chip ? 64 : 0) + (pv.slid ? 128 : 0);
      if (pv.kickT > 0) k += 16;
      if (pv.fakeU > 0) k += 32;
      if (pv.state === 'skill' && pv.skill) k += 64 * (1 + SKILLS.indexOf(pv.skill.id));
      return k;
    }

    // ---------------------------------------------------------------- per frame
    function update(pv, dt, ball) {
      if (!pv) return;
      if (pv.hidden) { g.visible = false; st.init = false; return; }
      g.visible = true;
      dt = clamp(fin(dt, 0), 0, 0.1);
      st.clock += dt;
      st.foot = actor.foot || 1;
      const R = actor.rig, h = (st.h = R.h || 1);
      st.rig = R;
      const keeper = !!actor.keeper || pv.runPh === undefined;
      const px = fin(pv.x, 0), pz = fin(pv.z, 0);
      if (st.init && Math.hypot(px - st.lastX, pz - st.lastZ) > 2.4) st.init = false;     // teleport: snap, never sweep
      // ---- yaw
      let yawT = fin(pv.yaw, 0);
      if (pv.state === 'celebrate') yawT = 0;                                   // face the camera
      else if (pv.state === 'ankle' && pv.fallYaw !== undefined) yawT = fin(pv.fallYaw, 0) + PI;   // facing the man who did it
      const prevYaw = st.yaw;
      let err = 0;
      if (!st.init) st.yaw = yawT;
      else {
        err = wrap(yawT - st.yaw);
        const fast = pv.state === 'skill' && pv.skill && pv.skill.id === 'roulette', cap = (fast ? 30 : 14) * dt;
        st.yaw = wrap(st.yaw + clamp(err * damp(fast ? 40 : 18, dt), -cap, cap));
      }
      st.y0 = st.init ? prevYaw : st.yaw;
      st.yawRate = dt > 0 ? lerp(st.yawRate, wrap(st.yaw - prevYaw) / dt, damp(10, dt)) : st.yawRate;
      g.position.set(px, 0, pz);
      g.rotation.y = st.yaw;
      // ---- how the body moved over the turf this frame, its velocity in its own frame (left, forward), acceleration
      const vx = fin(pv.vx, 0), vz = fin(pv.vz, 0), vl = Math.hypot(vx, vz), cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      let mdx = 0, mdz = 0;
      if (st.init && dt > 0) {
        mdx = px - st.lastX; mdz = pz - st.lastZ;
        if (Math.abs(mdx) + Math.abs(mdz) < 1e-7 && vl > 1e-3) {       // running on the spot (the lab without travel): the clocks give the distance
          let ds;
          if (keeper) ds = Math.abs(fin(pv.animDist, 0) - st.prevAD) * KS;
          else ds = (Math.abs(fin(pv.runPh, 0) - st.prevPh) / TAU) * STRIDE_M * (1 + 0.3 * clamp(vl / Math.max(0.6, fin(pv.top, 7.5)), 0, 1));
          if (ds < 1) { mdx = (vx / vl) * ds; mdz = (vz / vl) * ds; }
        }
      }
      st.mdx = mdx; st.mdz = mdz; st.md = Math.hypot(mdx, mdz);
      st.prevPh = fin(pv.runPh, 0); st.prevAD = fin(pv.animDist, 0); st.lastX = px; st.lastZ = pz;
      const vL = vx * cy - vz * sy, vF = vx * sy + vz * cy;
      if (st.init && dt > 0) {
        const kv = damp(14, dt), ka = damp(8, dt);
        st.vL += (vL - st.vL) * kv; st.vF += (vF - st.vF) * kv; st.vr += (st.md / dt - st.vr) * damp(12, dt);
        st.ax += ((vx - st.pvx) / dt - st.ax) * ka; st.az += ((vz - st.pvz) / dt - st.az) * ka;
      } else if (!st.init) { st.vL = vL; st.vF = vF; st.vr = vl * ((ISO.C && ISO.C.SPEED) || 0.6); st.ax = 0; st.az = 0; st.settled = true; st.spr = 0; }
      st.pvx = vx; st.pvz = vz;
      st.aL = st.ax * cy - st.az * sy; st.aF = st.ax * sy + st.az * cy;
      // ---- the ball in the body's frame
      st.bOk = !!ball;
      if (ball) {
        const dx = fin(ball.x, px) - px, dz = fin(ball.z, pz) - pz;
        st.bL = dx * cy - dz * sy; st.bF = dx * sy + dz * cy; st.bY = fin(ball.y, 0); st.bR = fin(ball.r, BALL_R);
      }
      // ---- target, then the filter: pose = target + an offset that springs to zero
      target(pv, dt, keeper, ball);
      const key = stateKey(pv, keeper), kt = fin(pv.kickT, 0), stT = fin(pv.stT, 0);
      if (!st.init) { pose.set(T); TP.set(T); off.fill(0); ov.fill(0); st.legW[0] = st.legG[0] = st.legT[0]; st.legW[1] = st.legG[1] = st.legT[1]; }
      else if (dt > 0) {
        const cut = key !== st.key || kt > st.prevKickT + 1e-4 || stT < st.prevStT - 0.05;
        const om = st.rate * 1.5, e = Math.exp(-om * dt), kS = keeper && st.loco ? KEEP_STEP : 1;      // the keeper's set stance: the sim's one-step changes of state are eased in over a few frames, never taken in one
        for (let i = 0; i < N; i++) {
          let o = off[i], u = ov[i];
          if (cut) { o = (i >= LEG_L && i < GROUND ? legDrawn(i) : pose[i]) - T[i]; u = 0; }
          else {                // a step no limb could make in a frame goes into the offset too
            const d = T[i] - TP[i], lim = (i < 3 ? 8 * kS : i >= LEG_L ? 45 : 45 * kS) * dt;
            if (d > lim) o -= d - lim; else if (d < -lim) o -= d + lim;
          }
          const j = (u + om * o) * dt;
          off[i] = (o + j) * e; ov[i] = (u - om * j) * e;
          pose[i] = T[i] + off[i]; TP[i] = T[i];
          if (SLEW[i] && kt > 0 && pv.kick && pv.kick.high && !keeper) {      // in a header the root (the lunge, its pitch and turn) moves at a speed a body can have, whatever the clip asks
            const m = SLEW[i] * dt, d = pose[i] - PP[i];
            if (d > m) { pose[i] = PP[i] + m; off[i] = pose[i] - T[i]; } else if (d < -m) { pose[i] = PP[i] - m; off[i] = pose[i] - T[i]; }
          }
        }
        for (let i = 0; i < 2; i++) {      // a clip owns the legs from its first frame (the cross-fade offset gives the continuity); a kick lets go of the gait foot over ~30 ms
          const lt = st.legT[i], lw = st.legW[i];
          st.legW[i] = lt > lw ? lw + (lt - lw) * damp(9, dt) : kt > 0 ? lw + (lt - lw) * damp(30, dt) : lt;
          st.legG[i] += (lt - st.legG[i]) * damp(lt > st.legG[i] ? 9 : 30, dt);      // the ground fit hands over more slowly: it moves the whole body
        }
      }
      PP.set(pose); st.key = key; st.prevStT = stT;
      const lw0 = st.legW[0], lw1 = st.legW[1], lg0 = st.legG[0], lg1 = st.legG[1];
      st.lockW = 0.5 * (lg0 + lg1);
      // ---- additive: lean with the acceleration, bank into the turn, shoulders and head lead it, breath, look at the ball
      F.set(pose);
      const lw = st.sw[W_LOCO], jog = Math.max(0.5, fin(pv.jog, 5));
      const bankT = clamp(-st.yawRate * 0.08 * clamp(fin(pv.speed, 0) / jog, 0, 1), -0.21, 0.21);
      const kl = st.init ? damp(6, dt) : 1;
      st.leanP += (clamp(st.aF * 0.01, -0.12, 0.22) * lw - st.leanP) * kl;
      st.leanR += (clamp(-st.aL * 0.012, -0.2, 0.2) * lw - st.leanR) * kl;
      st.bank += (bankT * lw - st.bank) * kl;
      st.turn += (clamp(err, -1, 1) * lw - st.turn) * (st.init ? damp(12, dt) : 1);
      F[PITCH] += 0.5 * st.leanP; F[SX] += 0.6 * st.leanP; F[ROLL] += 0.5 * (st.leanR + st.bank);
      F[CY] -= 0.2 * st.turn; F[HY] -= 0.3 * st.turn;
      const ex = pv.exhausted ? 1 : 0;
      F[CX] += (0.015 + 0.03 * ex) * Math.sin(st.clock * TAU * (ex ? 0.7 : 0.3) + st.seed);
      const st2 = pv.state;
      let lookOn = ball && !(st2 === 'celebrate' || st2 === 'ankle' || st2 === 'slide' || st2 === 'down' || st2 === 'dive' || st2 === 'ground');
      let lyT = 0, lxT = 0;
      if (lookOn) {
        const by = st.bY + st.bR, hd = Math.hypot(st.bL, st.bF), ang = Math.atan2(-st.bL, st.bF);
        if (hd > 0.3 && Math.abs(ang) < 2.3) {
          lyT = clamp(ang - (F[PY] + F[SY] + F[CY] + F[RYAW]), -1.05, 1.05);
          lxT = clamp(Math.atan2((R.eye || 1.65) - by, hd) - (F[SX] + F[CX] + F[PX]) * 0.6, -0.44, 0.44);
        } else lookOn = false;
      }
      const kh = st.init ? damp(8, dt) : 1;
      st.lookW += ((lookOn ? 1 : 0) - st.lookW) * kh;
      st.lookY += (lyT - st.lookY) * kh; st.lookX += (lxT - st.lookX) * kh;
      F[HY] += st.lookY * st.lookW * 0.75; F[CY] += st.lookY * st.lookW * 0.15; F[HX] += st.lookX * st.lookW * 0.7;
      // ---- apply; clips: the lowest point rests on the turf (weighted by GROUND). Locomotion needs none of that: its feet are placed
      applyPose(F);
      g.updateMatrixWorld(true);
      let minB = 1e9, mL = 1e9, mR = 1e9;
      for (let i = 0; i < GP.length; i++) {
        const p = GP[i];
        v3.set(p[1] * h, p[2] * h, p[3] * h); p[0].localToWorld(v3);
        const y = v3.y - p[4] * h;
        if (i > 5) { if (y < minB) minB = y; } else if (i === 0 || i === 1 || i === 4) { if (y < mL) mL = y; } else if (y < mR) mR = y;
      }
      let delta = F[GROUND] * -Math.min(minB, mL, mR);
      delta *= (1 - st.lockW) * (delta < 0 && !keeper ? 1 - 0.7 * sm(st.lockW / 0.5) : 1);      // the gait's flight phase is not something to pull down onto the turf
      delta = Math.max(delta, -minB, -mL * (1 - lg0), -mR * (1 - lg1));          // nothing ever goes through the turf
      bn.root.position.y += delta;
      mPI.copy(bn.pelvis.matrixWorld).invert();       // world -> pelvis frame as posed (before delta: targets are taken down by it instead)
      // ---- locomotion legs: ankles onto their gait targets; the pelvis comes down when a planted leg would over-stretch
      if (lw0 > 0.001 || lw1 > 0.001 || lg0 > 0.001 || lg1 > 0.001) {
        const Lr = (R.thigh + R.shin) * 0.994;
        let low = 0;
        for (let i = 0; i < 2; i++) {
          const o = i * 16, wi = st.legG[i];
          v3.set(FT[o + 11], FT[o + 12], FT[o + 13]).applyMatrix4(g.matrixWorld);
          WT[i * 3] = v3.x; WT[i * 3 + 1] = v3.y; WT[i * 3 + 2] = v3.z;
          v4.copy((i ? bn.thighR : bn.thighL).position).applyMatrix4(bn.pelvis.matrixWorld);
          const hor2 = (v3.x - v4.x) * (v3.x - v4.x) + (v3.z - v4.z) * (v3.z - v4.z);
          const x = v4.y + delta - v3.y - (hor2 < Lr * Lr ? Math.sqrt(Lr * Lr - hor2) : 0);
          low = Math.max(low, 0.5 * (x + Math.sqrt(x * x + 1.5e-4)) * FT[o + 14] * wi);
        }
        low = Math.min(low, (keeper ? 0.12 : 0.07) * h);
        if (st.init && dt > 0) {      // a critically damped spring: no kink in the pelvis' speed where a stretched leg takes over
          const om = low > st.lowF ? LOW_UP : LOW_DN, o = st.lowF - low, j = (st.lowV + om * o) * dt, e = Math.exp(-om * dt);
          st.lowF = low + (o + j) * e; st.lowV = (st.lowV - om * j) * e;
          low = st.lowF = Math.max(0, st.lowF);
        } else { st.lowF = low; st.lowV = 0; }
        bn.root.position.y -= low; delta -= low;
        const py = F[RYAW] + F[PY];
        for (let i = 0; i < 2; i++) if (st.legW[i] > 0.001) {
          v3.set(WT[i * 3], WT[i * 3 + 1] - delta, WT[i * 3 + 2]);
          boneLeg(i, st.legW[i], 0, FT[i * 16 + 4] + py, false);
          flatFoot(i, st.legW[i], FT[i * 16 + 3], FT[i * 16 + 4]);
        }
      }
      if (lg0 <= 0.001 && lg1 <= 0.001) st.lowF = 0;
      // ---- foot lock: a clip places its feet relative to the body, the sim moves the body. A foot that the clip's own pose has on the
      // turf (sole within 3 cm) and moves slowly over the body stays where it came down, with leg IK, until the clip lifts it. When
      // the leg would over-stretch it lets go (the offset to the clip's foot fades out) and is not locked again before it has been lifted
      if (!keeper && !LOCK_OFF[pv.state] && !st.loco && st.init && dt > 0) {
        const Lf = (R.thigh + R.shin) * 0.99;
        for (let i = 0; i < 2; i++) {
          const ft = i ? bn.footR : bn.footL, th = i ? bn.thighR : bn.thighL;
          v3.set(0, 0, 0); ft.localToWorld(v3);
          v4.set(0, -0.08 * h, -0.06 * h); ft.localToWorld(v4); let hf = v4.y; v4.set(0, -0.08 * h, 0.19 * h); ft.localToWorld(v4); hf = Math.min(hf, v4.y) + delta;      // the lower of heel and toe
          const touching = st.touchSide === (i ? 1 : -1) && st.touchW > 0.01 || (st.ikSide === (i ? 1 : -1) && kt > 0);
          // how fast the clip moves this foot over the body: a foot sweeping along the turf (a slide, a drag) is not a standing foot
          v4.copy(v3); g.worldToLocal(v4);
          const fsp = Math.hypot(v4.x - lkR[i * 2], v4.z - lkR[i * 2 + 1]) / dt; lkR[i * 2] = v4.x; lkR[i * 2 + 1] = v4.z;
          const planted = hf < (lkOn[i] ? 0.045 : 0.03) && fsp < (lkOn[i] ? LK_SPD * 2 : LK_SPD);
          const ty = v3.y, wasOn = lkOn[i];
          if (!planted || touching) { lkOn[i] = 0; lkS[i] = 0; }
          else if (!lkOn[i] && !lkS[i]) {      // a foot that comes down while the last step is still on its way is locked where it is drawn
            lkOn[i] = 1; lkQ[i] = 1;
            if (lkW[i] > 0.02) { lkP[i * 2] = lkD[i * 2]; lkP[i * 2 + 1] = lkD[i * 2 + 1]; } else { lkP[i * 2] = v3.x; lkP[i * 2 + 1] = v3.z; }
          }
          if (lkOn[i] === 1) {
            v4.copy(th.position).applyMatrix4(bn.pelvis.matrixWorld);
            const dx = lkP[i * 2] - v4.x, dz = lkP[i * 2 + 1] - v4.z, dy = v4.y - v3.y;
            if (dx * dx + dz * dz + dy * dy > Lf * Lf * LK_LET * LK_LET) { lkOn[i] = 0; lkS[i] = 1; }      // about to over-stretch: let go until the clip lifts the foot
          }
          const tx = lkP[i * 2], tz = lkP[i * 2 + 1];
          ft.localToWorld(v4.set(0, 0, 0)); const cx = v4.x, cz = v4.z;
          if (wasOn && !lkOn[i]) {      // released: the foot does not slide to where the clip has it, it steps there (lift, arc, land)
            const d = Math.hypot(tx - cx, tz - cz);
            lkQ[i] = 0; lkDur[i] = clamp(d / LK_STEP_V, 0.09, 0.22); lkH[i] = Math.min(0.16 * h, 0.3 * d + 0.03 * h);
          }
          if (lkOn[i]) lkW[i] += (1 - lkW[i]) * damp(30, dt);
          else if (lkQ[i] < 1) { lkQ[i] = Math.min(1, lkQ[i] + dt / lkDur[i]); lkW[i] = lkQ[i] < 1 ? 1 - sm(lkQ[i]) : 0; if (lkQ[i] >= 1) lkS[i] = 0; }      // landed: the clip's foot, if it is still down, is planted again
          else lkW[i] = 0;
          if (lkW[i] > 0.01) {      // the offset from the clip's foot fades in position, not in joint angles: a foot the clip swings away does not jump
            const lift = lkOn[i] ? 0 : lkH[i] * Math.pow(Math.sin(PI * lkQ[i]), 0.6);
            v3.set(cx + (tx - cx) * lkW[i], ty + lift, cz + (tz - cz) * lkW[i]); lkD[i * 2] = v3.x; lkD[i * 2 + 1] = v3.z;
            boneLeg(i, lkOn[i] ? lkW[i] : sm(Math.min(1, lkW[i] * 3)), lkOn[i] ? 0 : -0.12 * Math.pow(Math.sin(PI * lkQ[i]), 0.6), th.rotation.y, !lkOn[i]);      // a stepping boot is held level, toe up a little: it does not drag
          }
        }
      } else { lkOn[0] = lkOn[1] = 0; lkW[0] = lkW[1] = 0; lkQ[0] = lkQ[1] = 1; }
      // ---- a clip's foot-on-ball request
      if (!keeper && ball && st.touchSide && st.touchW > 0.01) {
        const i = st.touchSide > 0 ? 1 : 0;
        touchPoint(i, st.touchSole);
        v3.set(TPt[0], TPt[1], TPt[2]).applyMatrix4(g.matrixWorld); v3.y -= delta;
        boneLeg(i, clamp(st.touchW * (st.touchSole ? 1 : TOUCH_GAIN), 0, 1), st.touchSole ? 0.2 : 0.1, (i ? bn.thighR : bn.thighL).rotation.y, true);
      }
      // ---- striking foot. A kick of a ball he owned: the drawn ball waits at his foot for K.kickHold while the leg swings through, so the
      // boot is aimed at the live drawn ball and the weight peaks at elapsed = kickHold, then lets go as the ball leaves. Any other
      // kick (first time, volley, header): the contact point is latched at the event (back-extrapolated), weight 0 -> 0.8 -> 0 over
      // the first 30% of the kick
      // ball.hold (r3d: the drawn ball's strike.hold, sim s): the hold the drawn ball really has, 0 when it leaves at the event (every kicker but the one
      // this screen controls), -1 / absent: not known, the nominal K.kickHold
      const hl = ball ? fin(ball.hold, -1) : -1, KHn = fin(R3D.K && R3D.K.kickHold, 0.06), KHs = hl > 0 ? hl : hl === 0 ? 0 : KHn;
      const own = !keeper && pv.kick && pv.kick.owned && pv.kick.type !== undefined && kt > 0 && KHs > 0;
      const kdur = pv.kick && pv.kick.type == null ? 0.25 : 0.3, el = kdur - kt;
      if (kt > st.prevKickT + 1e-4 && ball) {
        const e0 = own ? 0 : Math.max(0, kdur - kt);
        st.cx = fin(ball.x, px) - fin(ball.vx, 0) * e0; st.cy = Math.max(0, fin(ball.y, 0) - fin(ball.vy, 0) * e0); st.cz = fin(ball.z, pz) - fin(ball.vz, 0) * e0; st.contact = true;
      }
      if (kt <= 0) st.contact = false;
      st.prevKickT = kt;
      if (own && ball && el <= KHs) {      // while the ball is held it stays with the kicker; once it has left (it moves over the kicker at speed) the point stays where it was
        const bx = fin(ball.x, px) - px, bz = fin(ball.z, pz) - pz, by = Math.max(0, fin(ball.y, 0));
        if (hl > 0 || el < 1e-4 || dt <= 0 || Math.hypot(bx - st.kox, bz - st.koz, by - st.koy) / dt < HELD_V) { st.cx = fin(ball.x, px); st.cy = by; st.cz = fin(ball.z, pz); st.kox = bx; st.koz = bz; st.koy = by; }
      }
      if (!keeper && st.ikSide && st.contact && kt > 0) {
        const w = own ? (el < KHs ? sm(el / KHs) : 1 - sm((el - KHs) / 0.05)) : st.kickK < 0.3 ? 0.8 * Math.sin((PI * st.kickK) / 0.3) : 0;
        if (w > 0.01) strikeIK(st.ikSide > 0 ? 1 : 0, w, st.cx, st.cy, st.cz, px, pz, delta);
      } else if (!keeper && st.rdW > 0.01 && kt <= 0) strikeIK(st.rdSide > 0 ? 1 : 0, 0.8 * st.rdW * st.rdW, st.rdX, st.rdY, st.rdZ, px, pz, delta, true);      // a first-time strike is coming: the boot meets the ball's predicted line
      // ---- keeper hands to the ball: catches, smothers, dives within reach
      if (keeper && ball) {
        const sv = pv.save, catching = sv && (sv.kind === 'catch' || sv.kind === 'claim' || sv.kind === 'smother') && sv.age < 0.35;
        const gkIk = st.gk ? fin(st.gk.ik, 0) : 0;
        if (catching || pv.state === 'dive' || gkIk > 0.01 || st.gkHW > 0.01) {
          const r = st.bR, bx = fin(ball.x, px), byy = fin(ball.y, 0) + r, bz = fin(ball.z, pz);
          v4.set(0, 0, 0); bn.chest.localToWorld(v4);
          const d = Math.hypot(bx - v4.x, byy - delta - v4.y, bz - v4.z), reach = (R.armLen || 0.55 * h) + 0.55 * h;
          // a dive before the ball is reached belongs to the clip's own arm solve: the hands only help
          const wt = (catching ? 0.85 : pv.state !== 'dive' ? 0.85 * gkIk : st.gk && !st.gk.hit ? 0.15 : 0.6) * clamp(1 - (d - reach) / (0.6 * h), 0, 1);
          const w = (st.gkHW += (wt - st.gkHW) * (dt > 0 ? damp(wt > st.gkHW ? 22 : 30, dt) : 0));      // eased in: the pose cross-fade does not cover the IK
          if (w > 0.01) {
            v4.set(1, 0, 0).transformDirection(bn.chest.matrixWorld);      // palms on the two sides of the ball, along the chest's x
            const ax = v4.x, ay = v4.y, az = v4.z;
            for (let s = -1; s <= 1; s += 2) {
              v3.set(bx - s * 0.8 * r * ax, byy - s * 0.8 * r * ay - delta, bz - s * 0.8 * r * az);
              limbIK(s > 0 ? bn.upperArmR : bn.upperArmL, bn.chest, v3, R.uarm, R.farm + 0.05 * h, w, s > 0 ? bn.foreArmR : bn.foreArmL, 0.2 * h);
            }
          }
        } else st.gkHW = 0;
      }
      // a knee never bends backwards, whatever the blend of two poses gave
      if (bn.shinL.rotation.x < 0) bn.shinL.rotation.x = 0;
      if (bn.shinR.rotation.x < 0) bn.shinR.rotation.x = 0;
      // ---- nothing, as finally posed (after every IK), is below the turf
      bn.root.updateMatrixWorld(true);
      let lowS = 0;
      for (let i = 0; i < GP.length; i++) { const p = GP[i]; v3.set(p[1] * h, p[2] * h, p[3] * h); p[0].localToWorld(v3); const y = v3.y - p[4] * h; if (y < lowS) lowS = y; }
      if (lowS < 0) bn.root.position.y -= lowS;
      const clothSnap = !st.init;
      st.init = true;
      if (actor.updateCloth) { try { actor.updateCloth(dt, clothSnap); } catch (e) { /* cloth never kills the pose */ } }
    }

    // the striking boot to a ball at (cx, cy, cz) (world): the ankle behind the ball on the line from the player, the instep at about its centre.
    // Never behind the hip line, never across the standing leg; and it only cleans up what the clip's swing leaves: a boot much further off than a
    // step is not dragged to the ball
    function strikeIK(i, w, cx, cy, cz, px, pz, delta, nofade) {
      const h = st.h, ft2 = i ? bn.footR : bn.footL, r = st.bR, bx = cx - px, bz = cz - pz, bl = Math.hypot(bx, bz) || 1;
      let tx = cx - (bx / bl) * (r + 0.11 * h) - px, tz = cz - (bz / bl) * (r + 0.11 * h) - pz;
      const cy2 = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      let tl = tx * cy2 - tz * sy, tf = tx * sy + tz * cy2;
      tf = Math.max(tf, 0.05 * h); tl = i ? Math.min(tl, 0.03 * h) : Math.max(tl, -0.03 * h);
      tx = tl * cy2 + tf * sy; tz = -tl * sy + tf * cy2;
      v3.set(px + tx, Math.max(0.09 * h, cy + r - 0.03 * h) - delta, pz + tz);
      ft2.localToWorld(v4.set(0, 0, 0));
      const gap = Math.hypot(v3.x - v4.x, v3.y + delta - v4.y, v3.z - v4.z);
      boneLeg(i, nofade ? w : w * (1 - sm((gap - KICK_NEAR) / KICK_FADE)), 0, (i ? bn.thighR : bn.thighL).rotation.y, false);
    }
    // a leg channel as the bones are drawn now (the foot IK and the ground fit move the bones off the pose channels): a cut starts its cross-fade from that
    function legDrawn(c) {
      const i = c >= LEG_R ? 1 : 0, k = c - (i ? LEG_R : LEG_L), th = i ? bn.thighR : bn.thighL, sg = i ? -1 : 1;
      return k === 0 ? -th.rotation.x : k === 1 ? sg * th.rotation.z : k === 2 ? sg * th.rotation.y : k === 3 ? (i ? bn.shinR : bn.shinL).rotation.x : (i ? bn.footR : bn.footL).rotation.x;
    }
    // leg i onto an ankle target (v3: world, minus the root shift made since the matrices were built), blended by w.
    // ry = thigh twist to solve with; withFoot: also pitch the boot to p (toe down +) whatever the leg does
    function boneLeg(i, w, p, ry, withFoot) {
      const th = i ? bn.thighR : bn.thighL, sh = i ? bn.shinR : bn.shinL, ft = i ? bn.footR : bn.footL, R = actor.rig;
      v3.applyMatrix4(mPI).sub(th.position);
      solveLeg(v3.x, v3.y, v3.z, ry, R.thigh, R.shin);
      th.rotation.x += wrap(SOL[0] - th.rotation.x) * w; th.rotation.y += (ry - th.rotation.y) * w; th.rotation.z += (SOL[1] - th.rotation.z) * w;
      sh.rotation.x += (SOL[2] - sh.rotation.x) * w;
      if (withFoot) ft.rotation.x += (p - bn.root.rotation.x - bn.pelvis.rotation.x - SOL[0] - SOL[2] - ft.rotation.x) * w;
    }
    // the boot of leg i to a heading (about the vertical, relative to the body) and a pitch (toe down +) whatever the leg's own twist and
    // abduction do to it, so a planted sole lies flat on the turf and does not roll its toe sideways; blended by w
    function flatFoot(i, w, p, heading) {
      const th = i ? bn.thighR : bn.thighL, sh = i ? bn.shinR : bn.shinL, ft = i ? bn.footR : bn.footL;
      th.updateMatrixWorld(true);
      sh.getWorldQuaternion(qa); g.getWorldQuaternion(qb);
      qc.setFromAxisAngle(AY, heading).multiply(qd.setFromAxisAngle(AX, p));
      qa.invert().multiply(qb.multiply(qc));
      ft.quaternion.slerp(qa, w);
    }
    // an arm toward a world target (same convention for the root shift), blended by w
    function limbIK(upper, parent, tgtW, a, b, w, lower, fzMin) {
      v4.copy(tgtW); parent.worldToLocal(v4);
      v4.sub(upper.position);
      if (fzMin !== undefined && v4.z < fzMin) v4.z = fzMin;      // in front of the shoulder plane: no flip as a target passes the joint
      ik2(v4.x, v4.y, v4.z, a, b);
      upper.rotation.x += (-IK[0] - upper.rotation.x) * w;
      upper.rotation.z += (IK[1] - upper.rotation.z) * w;
      upper.rotation.y += (0 - upper.rotation.y) * w * 0.5;
      lower.rotation.x += (-IK[2] - lower.rotation.x) * w;
    }

    st.own = own; st.lk = [lkOn, lkW, lkS];
    const api = { update, reset, pose, target: T, state: st, feet: FT };
    actor.anim = api;
    return api;
  }

  // ---------------------------------------------------------------- clip catalogue + synthetic views (lab page / tests)
  const SKILLS = ['stepover', 'feint', 'knock', 'roll', 'croqueta', 'roulette', 'elastico', 'heel', 'rainbow', 'dragback', 'nutmeg'];
  const CLIPS = ['idle', 'walk', 'jog', 'sprint', 'backpedal', 'strafeL', 'strafeR', 'turn', 'dribble', 'jockey', 'shield', 'focus', 'charge', 'exhausted', 'wall',
    'shoot', 'first-time', 'power', 'finesse', 'chip', 'cross', 'pass', 'volley', 'header', 'fake', 'tackle', 'recover', 'slide', 'down', 'shoulder', 'stumble', 'ankle', 'celebrate']
    .concat(SKILLS.map((s) => 'skill:' + s));
  const GK_CLIPS = ['gk:set', 'gk:shuffle', 'gk:rush', 'gk:diveLow', 'gk:diveHigh', 'gk:jump', 'gk:ground', 'gk:slide', 'gk:catch', 'gk:hold', 'gk:parry', 'gk:chip', 'gk:throw'];
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
      if (c === 'shuffle') { pv.vx = 2 * Math.sin(t * 2); pv.speed = Math.abs(pv.vx); pv.animDist = t * 40; }
      else if (c === 'rush') { pv.speed = 5; pv.vz = 5; pv.animDist = t * 100; }
      else if (c === 'jump') { pv.state = 'dive'; pv.u = u; pv.diveDir = sd; pv.high = true; pv.jump = true; pv.vx = sd * 2; pv.speed = 2; }
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
