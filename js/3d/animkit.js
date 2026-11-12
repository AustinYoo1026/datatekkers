/* ISO FOOTBALL 3D — animation kit: the pose channel layout and the small helpers shared by the animator (anim3d.js) and the
   clip files (clips-*.js). Loaded before all of them.

   A pose is a Float32Array(N). Lateral body channels are "positive = toward the character's right"; limb channels are per side:
     arm +0 swing fwd, +1 abduct out, +2 twist out, +3 elbow flex, +4 wrist
     leg +0 swing fwd, +1 abduct out, +2 toe out, +3 knee flex, +4 ankle (toe down) */
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

  R3D.AnimKit = { PI, TAU, clamp, lerp, sm, seg, damp, wrap, fin, N, CH, REST, arm, leg, setLeg, setArm, arms, crouch, easeW, lerpInto };
  R3D.Clips = R3D.Clips || {};
})();
