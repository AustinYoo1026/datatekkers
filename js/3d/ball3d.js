/* ISO FOOTBALL 3D — the ball (spec section 6). Visual layer only: nothing here is ever written back to the sim.

   ISO.R3D.Ball.create(THREE, skinDef, opts) -> {
     mesh,            THREE.Group: world position + bounce squash (world-Y scale). Child `sphere` (radius K.ballR) carries the
                      rolling orientation; optional additive glow sprite. Add `mesh` to the scene.
     sphere,          the textured sphere mesh (castShadow = true)
     shadow,          contact-shadow blob (flat quad on the ground). The caller adds it to the scene.
     update(vf, dt),  vf = ViewFrame (spec section 3), dt = real seconds (0 while paused)
     onEvent(e, vf),  plain events, see EVENTS below
     reset(),         new match / replay seek: forget all history (orientation is kept)
     setSkin(skin),   ISO.BALLS entry or its id
     setArena(o),     {walls: bool (futsal), boards: [...] (override, see makeArena)} -> dead-ball colliders
     getTrailPoints(),-> TRAIL (preallocated): { points: Vector3[CAP] newest first, count, speed (real m/s), cap }
     drawn,           Vector3: the drawn centre this frame (world). r3d.js builds `bv` from it (lowest point = drawn.y - K.ballR)
     dribbleW,        0..1: how far the drawn ball has settled at the owner's feet (0 when nobody owns it)
     dispose()
   }
   ISO.R3D.Ball.reach(d) -> the owned-ball mapping below (metres -> metres).
   ISO.R3D.Ball.drawHeight(h) -> drawn height of a ball h metres above the ground: h up to 4.5, then softly compressed toward 10 m (7.2 m -> 6.3, 19.6 m -> 8.5). `drawn` and the trail use it;
   the contact shadow does not (it sits under the true ground point and fades with the true height).

   WHERE THE BALL IS DRAWN (one target per frame, a pure function of vf, plus a decaying carry-over when the mode changes):
     loose          the sim position, exactly.
     owned          owner position + (sim ball - owner) * reach(d) / d: the direction of the sim's offset is kept, so the ball is
                    on the same side of the body as in the 2D view and as the sim tests tackles against, and its length d is
                    compressed to what a 1.8 m body reaches (the 2D figures are stylised: the sim carries the ball ~0.95 m out).
                    reach(d) = d - softmin(d^2 / (0.8 + d), 0.75): identity for small d, ~0.34 m at 0.6, ~0.46 m at 0.95
                    (a normal carry), ~0.58 m at 1.2, then the slope returns to 1 so a ball knocked 1.7-2.6 m ahead still runs
                    ~1-1.85 m ahead. Monotonic and smooth; the same mapping in every owned state (free, skill, fake, shield).
                    A ball the sim lifts (rainbow flick) fades back to the raw sim offset with its height. On top, in a plain
                    dribble only, a touch rhythm of up to 7 cm along the direction of travel: the ball is nearest the body when
                    runPh = 0.6 (left foot swinging through) or PI + 0.6 (right foot), whichever foot is on the ball's side,
                    then runs ahead and is caught up. It never moves the ball across the body's centre line.
                    In that plain dribble (state free, on the ground) the mapping is tighter: reachDrib shortens mid-size offsets a further 20%,
                    then soft caps in the body's frame keep the ball within a stride (0.28 behind, 0.45 ahead, 0.32 to the side), and a ball
                    level with the body close to its centre line is pushed out to the side it is on so it is not where the boots swing. All of
                    that fades out as the sim's offset grows past 1.3-1.9 m (a heavy touch runs away exactly as in the other states) and blends
                    over ~0.1 s when the state changes. The side of the body is always the sim's; the direction can differ by up to ~30 degrees.
     held           hugged to the keeper's chest: 0.14 m * KS + K.ballR ahead of the keeper, centre 1.12 m * KS up, where
                    KS = R3D.Player.KEEPER_SCALE (1 when player3d.js is not loaded).
     dead           the local dead-ball integrator (after 'out').
     When the mode changes, the difference between where the ball was drawn and the new target is carried over and melted
     away (0.10-0.22 s): a kicked ball leaves from where it was drawn, moves with the sim's velocity from the first frame and
     joins the sim trajectory without a kink; a first touch settles to the feet; a catch travels into the chest.
     KICK OF AN OWNED BALL, by the player this screen controls (vf.me; the kicker is the event's `p`): while he charges a shot (pv.charge, not first-time)
     the ball is drawn at the STRIKE SPOT: SP_L = 0.25 m to the kicking foot's side of the centre line and SP_F = 0.35 m ahead of the hip, in the body frame
     (eased in at SP_RATE per second; the foot is pv.kick.foot once latched, else the side the sim's ball is on beyond 0.15 m, else the strong foot).
     On the 'kick' event (not 'first-time', ball on the ground and drawn at his feet the frame before) the drawn ball rides with him for the hold, easing to the
     spot over the first KR_EASE of K.kickHold (0.036 sim s), then closes on the sim ball: the gap shrinks at most (KR - 1) = 0.55 x the sim's speed (ramped in
     over KR_RAMP, soft tail KR_TAU), so it is never faster than KR = 1.55 x the sim's; the hold is stretched, not the speed. It lasts K.kickHold, at least KH_MIN
     (0.02) unless a keeper / the goal mouth (when the path meets the woodwork) / another player is about to be hit, ends early when the gap could no longer close
     before that contact (time-to-contact from the SIM ball's position and velocity, KT_M margin) or exceeds KT_LAG, and the drawn ball never moves backwards along
     the kick direction. When the contact is close the join closes as fast as needed (along the ball's path, never backwards), so at a save / block /
     claim the drawn ball is on the sim ball. A charge whose nominal shot (SP_VN along his facing) would meet a keeper / player / the woodwork within about 0.12 sim s fades
     the strike spot to 0 (the ball stays at the sim's side), and a kick with contact within KT_M + KH_MIN has no hold at all. On a save / post / bar / block / goal event, or when someone takes the ball, the join finishes at once.
     `strike` = { on 0..1 (1 during the charge's end and the hold, fading after), x, z (world, the spot, live), foot (+1 right / -1 left), t (sim s since the event, -1),
     hold (sim s the hold lasted once decided, else -1), cut (0, 1 = join forced by a contact, 2 = by an event) }. During the hold and the charge `drawn` IS the spot
     (the animator's bv points at it); the kick spin starts when the hold ends.
     Every OTHER player's kick (opponent, teammate, CPU, online remote): no hold. The drawn ball leaves from where it was drawn and joins the sim ball over at most
     0.07 s (never longer than 0.7 x the time to contact from the sim ball), moving with the sim's velocity from the first frame.
     While owned, the drawn ball moves at most 10 m/s (real) relative to its owner: the sim's own snaps (it drives the ball
     at 1200 px/s into the first frame of a skill move) become a quick touch instead of a jump.
     PLAIN DRIBBLE AT SPEED: when he moves forward faster than ~0.9 x jog the ball is drawn at least DB_F = 0.08 m ahead of the hip line (a smooth max along the
     facing only, so the side is the sim's), fading out below 0.5 x jog.

   UNITS (what update() reads from vf):
     vf.ball.x/y/z   world metres (coords.js toWorld): x across, y = height of the ball's BOTTOM (sim z * S, 0 on the grass),
                     z = distance out from the goal line. The drawn centre is y + K.ballR.
     vf.ball.vx/vy/vz  world axes, metres per SIM second (sim px/s * S, i.e. vx = b.vy*S, vy = b.vz*S, vz = -b.vx*S).
                     Only used to seed the dead-ball integrator, kick spin and the net push. Real time = sim time / opts.timeScale.
     vf.ball.spin (sim value), owner (player index or -1), held (bool), inNet (bool). shot/rot are not read.
     vf.players[owner]: x, z, yaw (model yaw, forward = (sin yaw, 0, cos yaw), right = (-cos yaw, 0, sin yaw)), vx, vz, speed, top
                     (same unit, only the ratio is used), runPh, state, fakeU, shield, hidden.
     vf.keeper: x, z, yaw (held pose).   vf.phase: dead-ball mode ends when it changes.

   EVENTS (onEvent reads only these fields; every event is applied on the next update() using that frame's vf):
     'kick'      e.shot ('normal'|'finesse'|'power'|'chip'|'first-time'|undefined = pass/throw) -> kick spin (chip = backspin)
     'bounce'    (no fields) -> squash (ignored in dead-ball mode, which makes its own)
     'out'       (no fields) -> start the local dead-ball integrator seeded from vf.ball
     'goal'      (no fields) -> push the drawn ball up to 0.3 m into the net bulge, then relax
     'post'|'bar' e.power (0..1, optional) -> kill 70% of the spin, small squash
     'save'      (no fields) -> kill 65% of the spin
     'teleport'  (no fields) -> snap everything (also auto-detected: sim ball moves > 2.4 m in one frame)

   No allocation in update/onEvent/getTrailPoints. THREE is never touched at parse time. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});

  const TW = 512, TH = 256;            // equirect skin texture
  const R = (ISO.R3D && ISO.R3D.K && ISO.R3D.K.ballR) || 0.11;   // visual radius (m), from coords.js
  const TELE2 = 2.4 * 2.4;             // teleport threshold (same as Smooth.TELEPORT = 48 px)
  const TRAIL_CAP = 16, TRAIL_DT = 1 / 60;
  const REACH_M = 0.8, REACH_CAP = 0.75;      // owned ball: compression strength, and the most a sim offset is ever shortened by (m)
  const TOUCH_A = 0.07, TOUCH_PH = 0.6;       // dribble touch rhythm: amplitude (m), stride phase of the touch after the near foot passes under the hip
  const DRIB_TIGHT = 0.2, DRIB_LAT = 0.14;    // plain dribble: most a mid-size offset is shortened further (fraction), and the push of a ball off the feet's line (m)
  const CAP_B = 0.28, CAP_F = 0.45, CAP_L = 0.32;   // plain dribble: soft caps (m) on the drawn offset behind / ahead of / beside the body, a stride's reach
  const KH = (ISO.R3D && ISO.R3D.K && ISO.R3D.K.kickHold != null ? ISO.R3D.K.kickHold : 0.06);   // kick: the nominal hold (sim s)
  const KR = 1.55, KR_RAMP = 0.02, KR_TAU = 0.04, KT_M = 0.05, KT_LAG = 1.4, KH_MIN = 0.02, KR_EASE = 0.7;   // kick join: fastest the drawn ball closes on the sim ball (x the sim's speed), its ramp-in (sim s), tail time constant (sim s), margin before a contact (sim s), longest lag (m), shortest hold (sim s), share of the hold used to reach the strike spot
  const SP_VN = 30, SP_T0 = 0.02, SP_T1 = 0.12;                    // nominal shot speed (m/s) and the times to contact (sim s, after the margin) between which the strike spot fades out
  const SP_F = 0.35, SP_L = 0.25, SP_RATE = 10;               // strike spot (body frame): ahead of the hip, beside it on the kicking foot's side (m); ease rate while a shot is charged (1/s real)
  const DB_F = 0.08, DB_V0 = 0.5, DB_V1 = 0.9;              // plain dribble at speed: the ball is drawn at least DB_F ahead of the hip line; the speed (x jog) it starts / is fully applied
  const HIT_WOOD = 0.8, HIT_KEEPER = 1.5, HIT_PLAYER = 0.9, HIT_GOAL_Z = 0.35;   // radius (m) around the keeper / any other player within which the ball counts as touched, and the depth of the goal line plane
  const TOUCH_V = 10;                         // m/s (real): the fastest the drawn ball moves relative to its owner (an elastico peaks near 8)
  const ROLL_MAX = 120;                       // rad/s: above ~13 m/s a pure roll strobes at 60 Hz, so the visible spin stops growing
  const SKIN_MAT = { goldenboot: { metal: 0.5, rough: 0.32 }, midnight: { metal: 0.1, rough: 0.35 } };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (t) => t * t * (3 - 2 * t);
  const fin = (v, d) => (v === v && v !== Infinity && v !== -Infinity && v != null ? v : d);
  // ---- goal frame: the sim's ball (radius BR) meets the woodwork at a larger distance than the drawn ball (R) meets the drawn
  // posts / bar / side net, so near the frame a loose ball is drawn displaced toward the wood by a smooth amount that is 0 away
  // from it and closes exactly that difference at the sim's contact. The mapping depends only on the sim position.
  const KK = (ISO.R3D && ISO.R3D.K) || {}, CC = ISO.C || {}, SS = KK.S || 0.05;
  const BRm = (CC.BR || 6) * SS, BAR_C = (CC.BAR || 60) * SS;
  const GW2 = (KK.goalW || 7.5) / 2, GHm = KK.goalH || BAR_C, PRm = KK.postR || 0.06, RC = R + PRm;      // RC: drawn centre-to-wood distance at touch
  const POST_D = BRm + 4 * SS, POST_PUSH = Math.max(0, POST_D - RC), POST_FADE = 1.0;      // sim post contact distance (m), its gap to the drawn one, decay length
  const POST_TOP = GHm, POST_TOP_SIM = BAR_C + 4 * SS;                                     // the drawn post ends here; the sim stops pushing here
  const BAR_LO = BAR_C - 5 * SS, BAR_HI = BAR_C + 5 * SS;                                  // ball heights (lowest point) the sim bounces off the bar (game.js: BAR-5 < z <= BAR+5); below BAR_LO it scores, above BAR_HI it is out
  const CAP_S = 0.02, BAR_CAP_H = GHm - PRm - 2 * R - CAP_S;                                   // scoring ball: from here its lowest point is eased toward at most BAR_CAP_H + CAP_S (its top stays under the bar's underside)
  const BAR_Z = -BRm + SS, BAR_ZL = 2.5, BAR_ZO = 0.8;                         // the sim bar bounce rests 1 radius (less 1 px) behind the line; approach / leave ramps
  const NET_PUSH = Math.max(0, BRm - R);                                                    // the sim stops its ball this far short of the side net
  // back board: the sim keeps its ball's surface off the board plane (z = the end of the pitch), the drawn ball is smaller, so near the board
  // it is drawn displaced toward it by the difference, 0 beyond BACK_FADE of travel.
  const BACK_Z = (KK.depth || 17) + (KK.back || 0), BACK_PUSH = KK.back > 0 ? Math.max(0, BRm - R) : 0, BACK_FADE = 0.9;
  const fshift = { x: 0, y: 0, z: 0 };
  function frameShift(x, h, z, rest, hl) {      // hl: the ball's height when it reaches the goal line (the sim decides bar / no bar there), h when it is not heading for it
    let sx = 0, sy = 0, sz = 0;
    const out = 1 - rest;
    if (out > 1e-4) {
      // posts: radial pull toward the post axis in plan, for balls below the post top
      const hw = 1 - sm(clamp((h - POST_TOP) / Math.max(1e-3, POST_TOP_SIM - POST_TOP), 0, 1));
      if (hw > 0 && Math.abs(z) < POST_D + POST_FADE) {
        for (let i = 0; i < 2; i++) {
          const dx = (i ? GW2 : -GW2) - x, d = Math.hypot(dx, z);
          if (d >= POST_D + POST_FADE) continue;
          const m = (POST_PUSH * hw * out * (1 - sm(clamp((d - POST_D) / POST_FADE, 0, 1)))) / Math.max(d, 1e-3);
          sx += dx * m; sz -= z * m;
        }
      }
      // crossbar: in the sim a plane BR behind the line over the bar band; drawn, the ball turns on a circle around the bar
      if (Math.abs(x) < GW2 && z < BAR_Z + BAR_ZL && z > BAR_Z - BAR_ZO) {
        const wh = sm(clamp((hl - BAR_LO + 0.01) / 0.01, 0, 1)) * (1 - sm(clamp((hl - BAR_HI) / 0.3, 0, 1)));      // none for a ball the sim lets under the bar
        const wy = 1 - sm(clamp((Math.abs(x) - (GW2 - 0.6)) / 0.4, 0, 1));
        const wz = z >= BAR_Z ? sm(clamp((BAR_Z + BAR_ZL - z) / BAR_ZL, 0, 1)) : sm(clamp((z - BAR_Z + BAR_ZO) / BAR_ZO, 0, 1));
        const w = wh * wy * wz * out;
        if (wh < 1) {
          // a ball that scores close under the bar: the sim's ball is smaller than the drawn bar's gap, so only the last centimetres are pulled down (never above the bar's underside)
          const dh = hl - BAR_CAP_H, hc = BAR_CAP_H + CAP_S * Math.tanh(dh / CAP_S);
          if (dh > 0) sy += (1 - wh) * wy * wz * out * (hc - hl);
        }
        if (w > 0) {
          const dy = h + R - GHm, dyt = 0.1 * Math.tanh(dy / 0.1), zt = Math.sqrt(Math.max(0, RC * RC - dyt * dyt));
          sz += w * (zt - BAR_Z); sy += w * (dyt - dy);
        }
      }
    }
    // side net: the ball settled in the net is drawn up against the side netting
    if (rest > 1e-3 && NET_PUSH > 0) {
      const dist = GW2 - Math.abs(x);
      sx += (x < 0 ? -1 : 1) * NET_PUSH * rest * (1 - sm(clamp((dist - BRm) / 0.9, 0, 1)));
    }
    if (BACK_PUSH > 0) { const g = BACK_Z - BRm - z; if (g < BACK_FADE) sz += BACK_PUSH * (g <= 0 ? 1 : 1 - sm(g / BACK_FADE)); }
    fshift.x = sx; fshift.y = sy; fshift.z = sz;
    return fshift;
  }
  // drawn height of a ball whose true height above the ground is h (m): identity up to H_LIN, then a rational roll-off that is continuous in value and
  // slope at H_LIN, strictly increasing, and approaches H_LIN + H_SPAN (10 m): a 7.2 m chip is drawn at 6.3 m (slope 0.45 at its top), a 19.6 m over-held one at 8.5 m
  const H_LIN = 4.5, H_SPAN = 5.5;
  function drawHeight(h) {
    if (!(h > H_LIN)) return h;
    const u = (h - H_LIN) / H_SPAN;
    return H_LIN + (H_SPAN * u) / (1 + u);
  }
  // sim distance owner -> ball (m) to drawn distance: see the header
  function reach(d) {
    if (!(d > 0)) return 0;
    const D = (d * d) / (REACH_M + d), q = D / REACH_CAP, q2 = q * q;
    return d - D / Math.sqrt(Math.sqrt(1 + q2 * q2));
  }
  // plain dribble: the same mapping, shorter for the mid-size offsets (identity below 0.3 m, the full mapping from 1.3 m on, so a heavy
  // touch still runs away), continuous and monotonic
  const reachDrib = (d) => reach(d) * (1 - DRIB_TIGHT * sm(clamp((d - 0.3) / 0.5, 0, 1)) * (1 - sm(clamp((d - 1.3) / 0.6, 0, 1))));
  const softCap = (x, c) => { const q = x / c; return x / Math.sqrt(Math.sqrt(1 + q * q * q * q)); };      // identity near 0, saturates at +-c
  const touchOsc = (th) => -Math.cos(th + 0.45 * (1 - Math.cos(th)));      // -1 at the touch, quick run ahead, slower catch-up
  const rgb = (h) => {
    h = String(h || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const skinOf = (s) => (typeof s === 'string' || !s ? (ISO.ballById ? ISO.ballById(s || 'classic') : { id: 'classic', base: ['#ffffff', '#e6e9ee'], panel: '#1f2433', ink: '#1f2433', slab: '#f1735f' }) : s);

  // ------------------------------------------------------------------ texture painting (plain data, cached per skin id)
  // Painted in direction space so the pattern is undistorted on the sphere and seamless: pixel (i, j) maps to the same
  // direction THREE.SphereGeometry gives that uv (x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)).
  const paintCache = {};
  let ballDirs = null;                 // 12 pentagon + 20 hexagon centres (truncated icosahedron), slightly rotated
  function dirs() {
    if (ballDirs) return ballDirs;
    const f = (1 + Math.sqrt(5)) / 2, g = 1 / f, P = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { P.push([0, a, b * f], [a, b * f, 0], [b * f, 0, a]); }
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      for (const c of [-1, 1]) P.push([a, b, c]);
      P.push([0, a * g, b * f], [a * g, b * f, 0], [b * f, 0, a * g]);
    }
    const ca = Math.cos(0.37), sa = Math.sin(0.37), cb = Math.cos(0.21), sb = Math.sin(0.21);
    ballDirs = new Float64Array(P.length * 3);
    P.forEach((p, i) => {
      const l = Math.hypot(p[0], p[1], p[2]);
      let x = p[0] / l, y = p[1] / l, z = p[2] / l;
      let t = x * ca - z * sa; z = x * sa + z * ca; x = t;        // rotate about Y then X: no vertex on a pole
      t = y * cb - z * sb; z = y * sb + z * cb; y = t;
      ballDirs[i * 3] = x; ballDirs[i * 3 + 1] = y; ballDirs[i * 3 + 2] = z;
    });
    return ballDirs;
  }
  function paintSkin(def) {
    def = skinOf(def);
    if (paintCache[def.id]) return paintCache[def.id];
    const out = new Uint8ClampedArray(TW * TH * 4), D = dirs(), ND = D.length / 3;
    const b0 = rgb(def.base && def.base[0]), b1 = rgb(def.base && (def.base[1] || def.base[0]));
    const slab = def.slab ? rgb(def.slab) : null, pan = rgb(def.panel || def.ink), ink = rgb(def.ink || def.panel);
    const bias = def.many ? 0 : 0.055, seamW = def.many ? 0.012 : 0.008, seamA = def.many ? 0.95 : 0.6;
    let stars = null;
    if (def.stars) {
      stars = new Float64Array(140 * 3); let s = 12345;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 140; i++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        stars[i * 3] = r * Math.cos(a); stars[i * 3 + 1] = u; stars[i * 3 + 2] = r * Math.sin(a);
      }
    }
    const n1 = [0.42, 0.82, 0.39], l1 = Math.hypot(n1[0], n1[1], n1[2]);
    const col = [0, 0, 0];
    const mix = (c, k) => { col[0] += (c[0] - col[0]) * k; col[1] += (c[1] - col[1]) * k; col[2] += (c[2] - col[2]) * k; };
    for (let j = 0; j < TH; j++) {
      const th = ((j + 0.5) / TH) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i < TW; i++) {
        const ph = ((i + 0.5) / TW) * Math.PI * 2;
        const dx = -Math.cos(ph) * st, dy = ct, dz = Math.sin(ph) * st;
        // base: two-tone gradient across the sphere
        const t = clamp(0.5 + 0.5 * (dx * 0.35 + dy * 0.8 + dz * 0.45), 0, 1);
        col[0] = b1[0]; col[1] = b1[1]; col[2] = b1[2]; mix(b0, t);
        // slab: a wavy band around a tilted great circle
        if (slab) {
          const s = (dx * n1[0] + dy * n1[1] + dz * n1[2]) / l1 + 0.11 * Math.sin(5 * (dx * 0.8 - dz * 0.6));
          const a = clamp((0.17 - Math.abs(s)) / 0.025, 0, 1);
          if (a > 0) mix(slab, a);
        }
        // panels: Voronoi of the 32 centres, pentagons shrunk by `bias` unless `many` (Telstar)
        let t1 = -9, t2 = -9, pent = false;
        for (let k = 0; k < ND; k++) {
          const v = dx * D[k * 3] + dy * D[k * 3 + 1] + dz * D[k * 3 + 2] - (k < 12 ? bias : 0);
          if (v > t1) { t2 = t1; t1 = v; pent = k < 12; } else if (v > t2) t2 = v;
        }
        if (pent) mix(pan, 1);
        if (t1 - t2 < seamW) mix(ink, seamA);
        if (stars) {
          for (let k = 0; k < 140; k++) {
            if (dx * stars[k * 3] + dy * stars[k * 3 + 1] + dz * stars[k * 3 + 2] > 0.9993) { col[0] = col[1] = col[2] = 255; break; }
          }
        }
        const o = (j * TW + i) * 4;
        out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
      }
    }
    return (paintCache[def.id] = out);
  }
  // radial alpha blob (contact shadow / glow), rgb fixed
  function paintBlob(n, r, g, b, pow) {
    const out = new Uint8ClampedArray(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1, d = Math.sqrt(x * x + y * y);
      const a = d >= 1 ? 0 : Math.pow(1 - d, pow), o = (j * n + i) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a * 255;
    }
    return out;
  }
  function makeTex(THREE, data, w, h, srgb) {
    let tex = null;
    const doc = globalThis.document;
    if (doc && doc.createElement) {
      const cv = doc.createElement('canvas');
      cv.width = w; cv.height = h;
      const c = cv.getContext && cv.getContext('2d');
      if (c && c.createImageData) {
        const img = c.createImageData(w, h);
        img.data.set(data); c.putImageData(img, 0, 0);
        tex = new THREE.CanvasTexture(cv);
      }
    }
    if (!tex) { tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.flipY = true; }
    if (srgb && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // ------------------------------------------------------------------ dead-ball colliders
  // A wall: ax 0 = plane x = pos, ax 2 = plane z = pos; spans lo..hi on the other axis, optional gap gLo..gHi; height h (m); restitution e.
  function makeArena(K, o) {
    o = o || {};
    if (o.boards) return o.boards.map((w) => Object.assign({ gLo: 0, gHi: 0, e: 0.4, h: 0.9 }, w));
    const H = K.half, gx = K.goalW / 2, Dp = K.depth + (K.back || 0), far = Dp + 25;   // Dp: the back board (z of the end of the playable pitch)
    const W = (ax, pos, lo, hi, h, e, gLo, gHi) => ({ ax, pos, lo, hi, h, e, gLo: gLo || 0, gHi: gHi || 0 });
    if (o.walls) return [          // futsal: 1.2 m boards on the playable boundary (goal mouth open) + hall walls
      W(0, -H, -1, Dp + 1, 1.2, 0.82), W(0, H, -1, Dp + 1, 1.2, 0.82),
      W(2, 0, -H, H, 1.2, 0.82, -gx - R, gx + R), W(2, Dp, -H, H, 1.2, 0.82),
      W(0, -H - 4, -6, Dp + 6, 12, 0.4), W(0, H + 4, -6, Dp + 6, 12, 0.4), W(2, -5, -H - 4, H + 4, 12, 0.4), W(2, Dp + 5, -H - 4, H + 4, 12, 0.4),
    ];
    return [                       // ad boards 3 m behind the goal line and outside both touchlines (0.4), stand front walls (0.3)
      W(2, -3, -H - 3, H + 3, 0.9, 0.4), W(0, -H - 3, -3, Dp + 0.12, 0.9, 0.4), W(0, H + 3, -3, Dp + 0.12, 0.9, 0.4), W(2, Dp, -H - 3, H + 3, 0.6, 0.35),
      W(2, -7, -H - 7, H + 7, 6, 0.3), W(0, -H - 7, -7, far, 6, 0.3), W(0, H + 7, -7, far, 6, 0.3),
    ];
  }

  // ------------------------------------------------------------------ instance
  function create(THREE, skinDef, opts) {
    opts = opts || {};
    const K = (ISO.R3D && ISO.R3D.K) || { S: 0.05, half: 18, depth: 17, goalW: 7.5, goalH: 3, goalD: 1.7 };
    const S = K.S, C = ISO.C || {};
    const TS = opts.timeScale != null ? opts.timeScale : C.SPEED || 1;     // sim seconds per real second
    const GRAV = (C.GRAV || 900) * S, VBOUNCE = 90 * S, K0 = 28 * S, AIRH = 1 * S;
    const NET_E = 0.15, GX = K.goalW / 2, GD = K.goalD, GH = K.goalH;
    const onNetHit = typeof opts.onNetHit === 'function' ? opts.onNetHit : null;   // (wx, wy, wz, speed) e.g. Stadium.netHit
    let arena = makeArena(K, opts);

    // meshes
    const mesh = new THREE.Group(); mesh.name = 'ball';
    const geo = new THREE.SphereGeometry(R, 32, 16);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.castShadow = opts.castShadow !== false; sphere.receiveShadow = false;
    mesh.add(sphere);
    const glowTex = makeTex(THREE, paintBlob(64, 255, 255, 255, 2), 64, 64, false);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMat); glow.scale.set(R * 4.75, R * 4.75, 1); glow.visible = false;
    mesh.add(glow);
    const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
    const shTex = makeTex(THREE, paintBlob(64, 0, 0, 0, 1.6), 64, 64, false);
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shadow = new THREE.Mesh(shGeo, shMat); shadow.name = 'ballShadow'; shadow.renderOrder = 1;
    shadow.position.y = 0.012;

    const texCache = {};
    let skin = null;
    function setSkin(s) {
      const def = skinOf(s);
      if (skin && skin.id === def.id) return;
      skin = def;
      const tex = texCache[def.id] || (texCache[def.id] = makeTex(THREE, paintSkin(def), TW, TH, true));
      if (opts.anisotropy) tex.anisotropy = opts.anisotropy;
      const m = SKIN_MAT[def.id];
      mat.map = tex; mat.roughness = m ? m.rough : 0.45; mat.metalness = m ? m.metal : 0;
      if (def.glow) { mat.emissive.set(def.glow); mat.emissiveMap = tex; mat.emissiveIntensity = 0.55; glowMat.color.set(def.glow); glow.visible = true; }
      else { mat.emissive.setRGB(0, 0, 0); mat.emissiveMap = null; mat.emissiveIntensity = 1; glow.visible = false; }
      mat.needsUpdate = true;
    }
    setSkin(skinDef);

    // scratch / state (all preallocated)
    const simP = new THREE.Vector3(), prevSim = new THREE.Vector3(), base = new THREE.Vector3();
    const drawn = new THREE.Vector3(), prevDrawn = new THREE.Vector3(), vel = new THREE.Vector3();
    const tgt = new THREE.Vector3(), ownP = new THREE.Vector3(), lastSim = new THREE.Vector3(), rel = new THREE.Vector3();
    const dp = new THREE.Vector3(), dv = new THREE.Vector3();
    const wB = new THREE.Vector3(), om = new THREE.Vector3(), netDir = new THREE.Vector3();
    const dq = new THREE.Quaternion(), hugV = new Float32Array(3);
    let hasPrev = false, hasDrawn = false, frames = 0, pTrueY = 0, trueH = 0;   // pTrueY / trueH: the drawn ball's height before the high-ball compression
    let modeKey = -1, relT = 0, relDur = 0, relEase = false, touchW = 0, restW = 0, kickHold = 0;      // kickHold: spin lock (real s). modeKey: owner index, -1 loose, -2 held, -3 dead
    let dsurf = null, dead = false, deadT = 0, deadPhase = null, dspin = 0, netInside = false;
    let sqT = 1, sqD = 0, netOn = false, netT = 0, netAmt = 0;
    let khOn = false, khT = 0, khSpin = false;               // kick hold: the drawn ball waits at khP (sim s since the kick event), then joins the sim ball
    const khP = new THREE.Vector3(), khO = new THREE.Vector3(), khD = new THREE.Vector3();
    const nomB = { vx: 0, vy: 0, vz: 0 };
    const khV = new THREE.Vector3(), khG = new THREE.Vector3();      // khV: the drawn ball during a kick (hold, then catch-up); khG: scratch (gap to the sim ball)
    let khFin = false, khWin = false, khRel = false, khH = 0, khFoot = 1, khUx = 0, khUz = 1;      // finish now (an event), in the hold / catch-up window this frame, the hold is over (it lasted khH sim s), kicking foot, kick direction (plan)
    let swWPrev = 0, khE0 = 0;
    let swW = 0, swFoot = 0, swLat = 0;                      // strike spot while a shot is charged: weight 0..1, the foot it is on (0 = not chosen yet), its smoothed lateral offset (m, + = right)
    const strike = { on: 0, x: 0, z: 0, foot: 0, t: -1, hold: -1, cut: 0 };      // exposed as `strike`
    let khI = -1, khF = 0;                                   // the owner's index and the share of his travel the held ball follows (K.kickFollow, 0 = stays in the world)
    let pendKickBy = -1, pendKick = false, pendKickType = null, pendOut = false, pendGoal = false, pendSnap = false;

    const ring = []; for (let i = 0; i < TRAIL_CAP; i++) ring.push(new THREE.Vector3());
    const TRAIL = { points: ring.slice(), count: 0, speed: 0, cap: TRAIL_CAP };
    let tHead = 0, tCount = 0, tAcc = 0;

    // time (sim s) until the sim ball, flying straight on, first gets within reach of anything it can hit: the keeper, any player but the kicker,
    // the goal mouth (posts, bar, net). 9 when nothing
    function contactTime(vf, b, oi) {
      const vx = fin(b.vx, 0), vy = fin(b.vy, 0), vz = fin(b.vz, 0), v2 = vx * vx + vz * vz;
      let tc = 9;
      if (v2 < 1e-4) return tc;
      const sp = Math.sqrt(v2), y0 = simP.y - R;
      const hit = (ox, oz, rad, top) => {
        const dx = ox - simP.x, dz = oz - simP.z, a = (dx * vx + dz * vz) / v2;
        if (a < 0) return;                                           // behind the ball: it is moving away
        const pp = dx * dx + dz * dz - a * a * v2, rr = rad * rad;
        if (pp > rr) return;
        const t = Math.max(0, a - Math.sqrt(rr - pp) / sp);
        if (y0 + vy * t > top) return;                               // flies over (gravity ignored: that only makes the join earlier)
        if (t < tc) tc = t;
      };
      const k = vf.keeper; if (k) hit(fin(k.x, 0), fin(k.z, 0), HIT_KEEPER, 2.9);
      { const ps = vf.players; if (ps) for (let i = 0; i < ps.length; i++) { const q = ps[i]; if (i !== oi && q && !q.hidden) hit(fin(q.x, 0), fin(q.z, 0), HIT_PLAYER, 1.25); } }
      if (vz < 0) {
        const t = Math.max(0, (simP.z - HIT_GOAL_Z) / -vz), gx = simP.x + vx * t, gy = y0 + vy * t;
        if (t < tc && (Math.abs(Math.abs(gx) - K.goalW / 2) < HIT_WOOD || Math.abs(gy - K.goalH) < HIT_WOOD) && Math.abs(gx) < K.goalW / 2 + 0.6 && gy < K.goalH + 0.5) tc = t;      // only a ball that can meet the woodwork needs to be joined by the line
      }
      return tc;
    }

    function snap(vf) {
      dead = false; relDur = 0; relT = 0; rel.set(0, 0, 0); touchW = 0; restW = 0; kickHold = 0; khOn = khSpin = khFin = khWin = false; swW = 0; swFoot = 0; swLat = 0; strike.on = 0; strike.t = strike.hold = -1;
      netOn = false; sqT = 1; tCount = 0; tAcc = 0; hasDrawn = false; pTrueY = 0; wB.set(0, 0, 0);
    }
    function reset() {
      snap(null); hasPrev = false;
      pendKick = pendOut = pendGoal = pendSnap = false; pendKickType = null;
    }

    function seedDead(vf) {
      const b = vf.ball;
      dead = true; deadT = 0; deadPhase = vf.phase;
      dp.copy(simP); dv.set(b.vx || 0, b.vy || 0, b.vz || 0); dspin = b.spin || 0;
      netInside = dp.x > -GX && dp.x < GX && dp.z < 0 && dp.z > -GD && dp.y - R < GH;
    }
    function endDead() { dead = false; }

    function netHit(sp) { if (onNetHit && sp > 1) onNetHit(dp.x, dp.y, dp.z, sp); }

    function collide(px, ph, pz) {
      let hb = dp.y - R;
      // goal net box, from the outside (and clamped inside if the ball is in it)
      const inside = dp.x > -GX - R && dp.x < GX + R && dp.z > -GD - R && dp.z < 0 && hb < GH;
      if (inside && !netInside) {
        const sp = dv.length();
        if (ph >= GH) { hb = GH; dv.y = Math.abs(dv.y) * NET_E; dv.x *= 0.6; dv.z *= 0.6; netHit(sp); }
        else if (px <= -GX - R) { dp.x = -GX - R; dv.x = -Math.abs(dv.x) * NET_E; dv.z *= 0.7; netHit(sp); }
        else if (px >= GX + R) { dp.x = GX + R; dv.x = Math.abs(dv.x) * NET_E; dv.z *= 0.7; netHit(sp); }
        else if (pz <= -GD - R) { dp.z = -GD - R; dv.z = -Math.abs(dv.z) * NET_E; dv.x *= 0.7; netHit(sp); }
        else netInside = true;                 // came in through the mouth (or started there)
      }
      if (netInside) {
        if (dp.z > R) netInside = false;
        else {
          if (dp.x < -GX + R) { dp.x = -GX + R; dv.x = Math.abs(dv.x) * NET_E; }
          if (dp.x > GX - R) { dp.x = GX - R; dv.x = -Math.abs(dv.x) * NET_E; }
          if (dp.z < -GD + R) { dp.z = -GD + R; dv.z = Math.abs(dv.z) * NET_E; }
          if (hb > GH - 2 * R) { hb = GH - 2 * R; dv.y = -Math.abs(dv.y) * NET_E; }
        }
      }
      // boards and stand walls (thin, two-sided, finite height)
      for (let i = 0; i < arena.length; i++) {
        const a = arena[i];
        if (hb >= a.h) continue;
        const o = a.ax === 0 ? dp.z : dp.x;
        if (o < a.lo || o > a.hi || (a.gHi > a.gLo && o > a.gLo && o < a.gHi)) continue;
        const c = a.ax === 0 ? dp.x : dp.z, pc = a.ax === 0 ? px : pz, s = pc - a.pos >= 0 ? 1 : -1;
        if (s * (c - a.pos) < R) {
          if (a.ax === 0) { dp.x = a.pos + s * R; if (s * dv.x < 0) { dv.x = -dv.x * a.e; dv.z *= 0.85; } }
          else { dp.z = a.pos + s * R; if (s * dv.z < 0) { dv.z = -dv.z * a.e; dv.x *= 0.85; } }
        }
      }
      dp.y = hb + R;
    }

    function stepDead(sdt) {
      if (sdt <= 0) return;
      const n = Math.min(12, Math.ceil(sdt / (1 / 120))), h = sdt / n;
      for (let s = 0; s < n; s++) {
        const px = dp.x, ph = dp.y - R, pz = dp.z;
        let sp = Math.hypot(dv.x, dv.z);
        if (dspin && sp > 60 * S) {                 // Magnus curve, as ballMotion
          const acc = dspin * 560 * S * (sp / (500 * S)), nx = -dv.z / sp, nz = dv.x / sp;
          dv.x += nx * acc * h; dv.z += nz * acc * h; dspin *= Math.exp(-0.9 * h);
        }
        dp.x += dv.x * h; dp.z += dv.z * h;
        let hb = dp.y - R;
        if (hb > 0 || dv.y > 0) {
          dv.y -= GRAV * h; hb += dv.y * h;
          if (hb <= 0) {
            hb = 0;
            if (dv.y < -VBOUNCE) { sqT = 0; sqD = clamp(-dv.y * 0.02, 0.05, 0.18); const be = dsurf ? dsurf.e : 0.48, bk = dsurf ? dsurf.keep : 0.84; dv.y = -dv.y * be; dv.x *= bk; dv.z *= bk; }
            else dv.y = 0;
          }
        }
        dp.y = hb + R;
        collide(px, ph, pz);
        hb = dp.y - R;
        const air = hb > AIRH, k1 = air ? 0.2 : (dsurf ? dsurf.k1 : 0.7), k0 = air ? 0 : (dsurf ? dsurf.k0 * S : K0);
        sp = Math.hypot(dv.x, dv.z);
        if (sp > 0) { const ns = Math.max(0, sp - (k1 * sp + k0) * h); dv.x *= ns / sp; dv.z *= ns / sp; }
      }
    }

    function update(vf, dt) {
      dsurf = vf.surf || null;      // the sim's pitch row (C.PHYS.SURF), resolved by the adapter each frame; the dry-grass literals below are the fallback
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      const b = vf.ball;
      simP.set(b.x || 0, (b.y || 0) + R, b.z || 0);
      if (!(simP.x === simP.x && simP.y === simP.y && simP.z === simP.z)) simP.set(0, R, 0);
      if (hasPrev && simP.distanceToSquared(prevSim) > TELE2) pendSnap = true;
      if (pendSnap) { pendSnap = false; snap(vf); }     // an 'out'/'goal' latched in the same frame still applies after the snap
      if (hasPrev) lastSim.copy(prevSim); else lastSim.copy(simP);
      prevSim.copy(simP); hasPrev = true;

      // ---- target: the sim, or the local dead-ball integrator after 'out'
      if (pendOut) { pendOut = false; if (!b.held) seedDead(vf); }
      if (dead) {
        deadT += dt;
        if (vf.phase !== deadPhase || b.owner >= 0 || b.held || deadT > 8) endDead();
        else stepDead(dt * TS);
      }
      tgt.copy(dead ? dp : simP);

      // ---- owned: the sim's offset from the owner, direction kept, length compressed into foot range (header)
      const oi = b.owner, p = oi >= 0 && vf.players ? vf.players[oi] : null, k = vf.keeper, held = !!(b.held && k);
      const own = !!p && !p.hidden && !held && !dead && !b.inNet;
      const drib = own && p.state === 'free' && !p.shield && !(p.fakeU > 0) && simP.y - R < 0.05;
      touchW += ((drib ? 1 : 0) - touchW) * (1 - Math.exp(-12 * dt));
      if (!own) touchW = 0;
      let px = 0, pz = 0;
      const chg = own && oi === (vf.me | 0) && !!p.charge && !p.charge.ft && p.state === 'free' && simP.y - R < 0.05;      // winding up a shot with the ball at his feet
      let swT = chg ? 1 : 0;
      if (chg) {
        // a shot from point-blank range leaves from the sim ball: the spot's weight fades to 0 when a keeper / player / the woodwork is within reach of a nominal shot along his facing
        // (the aim is not in the view frame and he may face away from where he shoots: every direction across the goal's span from the ball, and his facing, is tested)
        const yw0 = fin(p.yaw, 0); nomB.vx = Math.sin(yw0) * SP_VN; nomB.vz = Math.cos(yw0) * SP_VN;
        let tcN = contactTime(vf, nomB, oi);
        const gz = Math.max(0.3, simP.z), hw = K.goalW / 2 + 0.6;
        for (let i = 0; i < 7 && tcN > 0; i++) {
          const dx = -hw + 2 * hw * i / 6 - simP.x, dn = SP_VN / Math.hypot(dx, gz);
          nomB.vx = dx * dn; nomB.vz = -gz * dn;
          tcN = Math.min(tcN, contactTime(vf, nomB, oi));
        }
        swT = sm(clamp((tcN - KT_M - SP_T0) / (SP_T1 - SP_T0), 0, 1));
      }
      swWPrev = swW;
      swW += (swT - swW) * (1 - Math.exp(-SP_RATE * dt));
      if (!own) { swW = 0; swFoot = 0; if (!khOn) strike.on = 0; } else if (swW < 1e-3 && !chg) swFoot = 0;
      if (own) {
        px = fin(p.x, simP.x); pz = fin(p.z, simP.z);
        let ox = simP.x - px, oz = simP.z - pz;
        const yw = fin(p.yaw, 0), fy = Math.sin(yw), fc = Math.cos(yw), ry = -fc, rc = fy, simLat = ox * ry + oz * rc;
        if (chg || swW > 1e-3) {
          // the kicking foot: the latched one, else the side the sim's ball is on (beyond 0.15 m, as the adapter decides it), else the strong foot
          if (p.kick && p.kick.foot) swFoot = p.kick.foot > 0 ? 1 : -1;
          else {
            if (!swFoot) { const df = p.sim && p.sim.def ? p.sim.def.foot : null; swFoot = df === 'L' || df === 'left' ? -1 : 1; swLat = swFoot * SP_L; }
            if (simLat > 0.15) swFoot = 1; else if (simLat < -0.15) swFoot = -1;
          }
          swLat += (swFoot * SP_L - swLat) * (1 - Math.exp(-14 * dt));
        }
        const d = Math.hypot(ox, oz);
        let g = d;
        if (d > 1e-4) {
          g = reach(d);
          if (touchW > 1e-3) g += (reachDrib(d) - g) * touchW;
          const air = sm(clamp((simP.y - R - 0.2) / 0.8, 0, 1)), sc = g / d + (1 - g / d) * air;
          ox *= sc; oz *= sc; g = d * sc;
        }
        const sp = Math.hypot(fin(p.vx, 0), fin(p.vz, 0));
        if (touchW > 1e-3) {
          // plain dribble: keep the ball inside the stride (soft caps behind / ahead / to the side in the body's frame) unless the sim sent it far
          // away (a heavy touch: full mapping), and off the boots' line: a ball level with the body close to its centre line is pushed out to the
          // side it is on (odd in the lateral offset, so a ball crossing the line moves across smoothly)
          const yaw = fin(p.yaw, 0), sy = Math.sin(yaw), cy = Math.cos(yaw), rx = -cy, rz = sy, l1 = ox * rx + oz * rz, f1 = ox * sy + oz * cy;
          const wk = touchW * (1 - sm(clamp((d - 1.3) / 0.6, 0, 1)));
          const f2 = f1 + ((f1 < 0 ? softCap(f1, CAP_B) : softCap(f1, CAP_F)) - f1) * wk, l2 = l1 + (softCap(l1, CAP_L) - l1) * wk;
          const push = DRIB_LAT * Math.tanh(l2 / 0.1) * Math.exp(-((l2 / 0.3) * (l2 / 0.3))) * (1 - sm(clamp((Math.abs(f2) - 0.35) / 0.3, 0, 1))) * touchW;
          const l3 = l2 + push;
          ox = f2 * sy + l3 * rx; oz = f2 * cy + l3 * rz;
        }
        if (touchW > 1e-3 && sp > 1e-3 && p.top > 0) {
          const yaw = fin(p.yaw, 0), rx = -Math.cos(yaw), rz = Math.sin(yaw), lat = ox * rx + oz * rz;
          const ph = fin(p.runPh, 0) - TOUCH_PH, sideR = 0.5 + 0.5 * clamp(lat / 0.12, -1, 1);
          const osc = touchOsc(ph) * (1 - sideR) + touchOsc(ph - Math.PI) * sideR;
          const a = Math.min(TOUCH_A * sm(clamp((sp / p.top) * 1.6, 0, 1)), 0.3 * g) * touchW * osc * (1 - swW);
          let tx = (p.vx / sp) * a, tz = (p.vz / sp) * a;
          const lat1 = lat + tx * rx + tz * rz;
          if (lat * lat1 < 0) { tx -= rx * lat1; tz -= rz * lat1; }      // never across the body's centre line
          ox += tx; oz += tz;
        }
        if (touchW > 1e-3 && swW < 0.999) {
          // a plain dribble at speed: never behind the hip line (a smooth max along the facing only: the side is the sim's)
          const vfw = fin(p.vx, 0) * fy + fin(p.vz, 0) * fc, jg = fin(p.jog, 0) > 0.5 ? p.jog : 0.6 * fin(p.top, 5);
          const wd = sm(clamp((vfw - DB_V0 * jg) / ((DB_V1 - DB_V0) * jg), 0, 1)) * touchW * (1 - swW);
          if (wd > 1e-3) {
            const f0 = ox * fy + oz * fc, df = 0.5 * (f0 + DB_F + Math.sqrt((f0 - DB_F) * (f0 - DB_F) + 0.0016)) - f0;
            ox += fy * df * wd; oz += fc * df * wd;
          }
        }
        if (chg || swW > 1e-3) {
          // strike spot: beside and ahead of the kicking foot in the body frame (a wind-up is where a believable strike matters more than the sim's side)
          const spx = fy * SP_F + ry * swLat, spz = fc * SP_F + rc * swLat;
          ox += (spx - ox) * swW; oz += (spz - oz) * swW;
          strike.x = px + spx; strike.z = pz + spz; strike.foot = swFoot;
        }
        strike.on = swW; strike.t = -1; strike.hold = -1;
        tgt.x = px + ox; tgt.z = pz + oz;
      }
      // ---- held by the keeper: hugged to the chest
      if (held) {
        const ky = fin(k.yaw, 0), ks = fin(R3D.Player && R3D.Player.KEEPER_SCALE, 1), kf = 0.14 * ks + R;      // chest front + one radius, on the keeper's build
        const sx = Math.sin(ky) * kf, sz = Math.cos(ky) * kf;
        // the chest as the keeper's pose has it (in the air, lying, getting up from a slide); standing, the fixed hug
        if (R3D.Clips && R3D.Clips.gkHug && R3D.Clips.gkHug(k.sim, hugV, sx, sz)) tgt.set(fin(k.x, 0) + hugV[0], Math.max(R, Math.min(hugV[1], 2.8)), fin(k.z, 0) + hugV[2]);
        else tgt.set(fin(k.x, 0) + sx, 1.12 * ks, fin(k.z, 0) + sz);
      }

      // ---- mode change: carry the gap between the ball as drawn and the new target, and melt it away
      const key = dead ? -3 : held ? -2 : own ? oi : -1, me = vf.me | 0;
      const same = key === modeKey && own && hasDrawn && dt > 0, mx = px - ownP.x, mz = pz - ownP.z;      // the owner's move this frame
      if (same) {
        if (mx * mx + mz * mz > 1) relDur = 0;             // the owner was placed (a restart): cut
      } else if (key !== modeKey && hasDrawn && key !== -3) {
        const kicked = key === -1 && modeKey >= 0, tcK = key === -1 && modeKey >= 0 ? contactTime(vf, b, modeKey) : 9, taken = khOn && key >= 0;      // taken: someone got the held / catching-up ball
        if (kicked && pendKick && KH > 0 && pendKickType !== 'first-time' && dt > 0 && prevDrawn.y - R < 0.25 && !b.inNet && pendKickBy === modeKey && (modeKey === me || tcK < 0.04)) {
          // a kick of a ball he owned (drawn at his feet, not in the air): the drawn ball stays put for KH sim seconds while the leg swings
          // through, then joins the sim path (kickA, kickB); no carried offset, the hold is the offset
          khOn = true; khT = -dt * TS; khSpin = true; khRel = tcK <= KT_M + KH_MIN || modeKey !== me; khH = 0;      // contact (almost) at once: no hold, only the join along the path
           strike.cut = 0; khP.copy(prevDrawn); khV.copy(prevDrawn); relDur = 0;
          khE0 = swWPrev; khI = modeKey; khF = clamp(fin(K.kickFollow, 0), 0, 1); khFoot = swFoot || 1;
          const o0 = khF > 0 && vf.players ? vf.players[khI] : null; if (o0) khO.set(fin(o0.x, 0), 0, fin(o0.z, 0)); else khF = 0;
        } else {
          // a release or a first touch keeps moving with the sim through this frame; a catch / throw / restart starts from rest
          if (modeKey === -2 || modeKey === -3 || key === -2) rel.subVectors(prevDrawn, tgt);
          else rel.subVectors(prevDrawn, lastSim).add(simP).sub(tgt);
          rel.y += pTrueY - prevDrawn.y;          // the carried gap is measured on the true height: the compression is applied after the melt
          const rl = rel.length(), vr = Math.hypot(b.vx || 0, b.vy || 0, b.vz || 0) * TS;
          relT = -dt; relEase = kicked;
          relDur = rl < 1e-4 ? 0 : kicked ? Math.min(0.07, Math.max(0.02, (0.7 * tcK) / TS)) : taken ? 0.04 : modeKey === -3 ? 0.3 : 0.16;
        }
      }
      modeKey = key; ownP.set(px, 0, pz);
      let rk = 0, kq = 1;
      khWin = false;
      if (khOn) {
        if (key !== -1 || dead || b.inNet) khOn = khSpin = false;        // taken by someone, out, in the net: the generic blend above took over
        else khT += dt * TS;
      }
      if (relDur > 0) {
        relT += dt;
        const u = relT / relDur;
        if (u >= 1) relDur = 0; else rk = relEase ? 1 - sm(u) : (1 - u) * (1 - u);      // kicked: no kink at either end
      }
      if (!khOn) khFin = false;
      base.copy(tgt);
      if (rk > 0) base.addScaledVector(rel, rk);
      if (khOn) {
        // the drawn ball waits at the strike spot (beside and ahead of the kicking foot) while the leg swings through, then closes on the sim ball:
        // the gap g to it shrinks at (KR - 1) x the sim's speed at most (ramped in, a soft tail), so the drawn ball is never faster than KR x the sim's.
        // The hold lasts K.kickHold, at least KH_MIN (unless the ball is about to hit something), ends early when the gap could no longer close before
        // contact or has grown past KT_LAG, and the drawn ball never moves backwards along the kick direction.
        khWin = true;
        const o = vf.players ? vf.players[khI] : null, dS = dt * TS, t = Math.max(khT, 0);
        const sv = Math.hypot(b.vx || 0, b.vy || 0, b.vz || 0), uh = Math.hypot(b.vx || 0, b.vz || 0);
        if (uh > 0.5) { khUx = (b.vx || 0) / uh; khUz = (b.vz || 0) / uh; }
        const px0 = khV.x, pz0 = khV.z;
        if (!khRel) {
          // hold point: where the ball was drawn, riding with the kicker, easing to the spot
          if (khF > 0 && o) khG.set((fin(o.x, khO.x) - khO.x) * khF + khP.x, 0, (fin(o.z, khO.z) - khO.z) * khF + khP.z); else khG.set(khP.x, 0, khP.z);
          khV.x = khG.x; khV.z = khG.z; khV.y = khP.y;
          if (o) {
            if (o.kick && o.kick.foot) khFoot = o.kick.foot > 0 ? 1 : -1;
            const yw = fin(o.yaw, 0), fy = Math.sin(yw), fc = Math.cos(yw), e = sm(clamp(t / (KR_EASE * Math.max(KH, 1e-3)), 0, 1)), sl = khFoot * SP_L;
            const spx = fin(o.x, 0) + fy * SP_F - fc * sl, spz = fin(o.z, 0) + fc * SP_F + fy * sl;
            const e2 = e * (1 - khE0);
            khV.x += (spx - khV.x) * e2; khV.z += (spz - khV.z) * e2; khV.y += (R - khV.y) * e2;
            strike.x = spx; strike.z = spz; strike.foot = khFoot;
          }
          strike.on = 1; strike.t = t; strike.hold = -1;
          const mv = (khV.x - px0) * khUx + (khV.z - pz0) * khUz;
          if (mv < 0 && hasDrawn) { khV.x -= mv * khUx; khV.z -= mv * khUz; }
          khG.set(simP.x - khV.x, simP.y - khV.y, simP.z - khV.z);
          const gl = khG.length(), cN = (KR - 1) * sv, tc = contactTime(vf, b, khI), tcl = tc - KT_M;
          const canSkip = tc < KH_MIN + KT_M;      // (a keeper / the goal mouth is that close)                                    // something is hit within the shortest hold: no time to wait
          if (t >= KH || (t >= KH_MIN || canSkip) && (gl > KT_LAG || (cN > 1e-3 ? gl / cN + 0.5 * KR_RAMP : 9) >= tcl)) { khRel = true; khH = t; }
        }
        if (khRel) {
          strike.hold = khH; strike.t = t; strike.on = Math.max(0, 1 - (t - khH) / 0.05);
          // after the hold: ride the sim's own move, then close the gap
          if (hasDrawn) { khV.x += simP.x - lastSim.x; khV.y += simP.y - lastSim.y; khV.z += simP.z - lastSim.z; }
          khG.set(simP.x - khV.x, simP.y - khV.y, simP.z - khV.z);
          const gl = khG.length(), tc = contactTime(vf, b, khI), tcl = Math.max(tc - KT_M, 1e-3);
          const ramp = sm(clamp((t - khH) / KR_RAMP, 0, 1));
          let c = Math.min((KR - 1) * sv * ramp, gl / KR_TAU), step;
          if (gl / tcl > (KR - 1) * sv) { c = gl / tcl; strike.cut = 1; }                                           // never later than the contact (the only way past KR x the sim's speed)
          step = Math.min(c * dS, gl);
          if (gl > 1e-6) {
            let mx2 = khG.x / gl * step, my2 = khG.y / gl * step, mz2 = khG.z / gl * step;
            const mv = (simP.x - lastSim.x + mx2) * khUx + (simP.z - lastSim.z + mz2) * khUz;      // net advance along the kick direction this frame
            if (mv < 0 && hasDrawn) { mx2 -= mv * khUx; mz2 -= mv * khUz; }      // a drawn ball ahead of the sim ball waits for it: only lateral motion
            khV.x += mx2; khV.y += my2; khV.z += mz2;
          }
          {      // the drawn ball never moves more than KR x the sim ball's own step in one frame (the cut to the contact included): the rest of the gap stays for the next frames
            const cx0 = prevDrawn.x, cy0 = prevDrawn.y, cz0 = prevDrawn.z, dB = Math.hypot(khV.x - cx0, khV.y - cy0, khV.z - cz0), cap = KR * Math.hypot(simP.x - lastSim.x, simP.y - lastSim.y, simP.z - lastSim.z) + 0.004;
            if (hasDrawn && dB > cap) { const f = cap / dB; khV.x = cx0 + (khV.x - cx0) * f; khV.y = cy0 + (khV.y - cy0) * f; khV.z = cz0 + (khV.z - cz0) * f; }
          }
          khG.set(simP.x - khV.x, simP.y - khV.y, simP.z - khV.z);
          if (khFin || khG.length() < 0.01) { khV.copy(simP); khOn = false; }
        }
        if (khFin) {      // an event (the ball just hit something): onto the sim ball, but a drawn ball ahead of it waits (only lateral motion) until the sim ball has passed
          const ad = (simP.x - khV.x) * khUx + (simP.z - khV.z) * khUz;
          if (ad >= 0 || !hasDrawn) { khV.copy(simP); khOn = false; } else { khV.set(simP.x - ad * khUx, simP.y, simP.z - ad * khUz); }
          strike.cut = 2;
        }
        kq = clamp(1 - khG.length() / 0.5, 0, 1);
        base.copy(khV);
      }
      if (same && mx * mx + mz * mz <= 1) {
        // the sim snaps its ball now and then (1200 px/s into a skill move, or out of a body it landed in). Relative to its
        // owner the drawn ball never moves faster than a foot can play it: it goes there at TOUCH_V and eases in
        const sx = base.x - prevDrawn.x - mx, sz = base.z - prevDrawn.z - mz, sl = Math.hypot(sx, sz), lim = TOUCH_V * dt;
        if (sl > lim) {
          base.x = prevDrawn.x + mx + (sx * lim) / sl; base.z = prevDrawn.z + mz + (sz * lim) / sl;
          rel.subVectors(base, tgt); relT = 0; relEase = false; relDur = Math.max(0.05, (2 * rel.length()) / TOUCH_V);
        }
      }
      if (base.y < R) base.y = R;

      // ---- at rest in the net: the sim stops its (larger) ball short of the back net; let the drawn one reach it
      restW += ((b.inNet && !dead ? 1 : 0) - restW) * (1 - Math.exp(-6 * dt));
      if (restW > 1e-3) base.z -= Math.max(0, (C.BR || 6) * S - R) * restW;

      // ---- net bulge push on a goal
      if (pendGoal) {
        pendGoal = false;
        netDir.set(b.vx || 0, 0, b.vz || 0);
        const l = netDir.length();
        if (l > 1e-3) netDir.multiplyScalar(1 / l); else netDir.set(0, 0, -1);
        netAmt = clamp(l / 15, 0.3, 1); netOn = true; netT = 0;
      }
      if (netOn) {
        netT += dt;
        const a = netT < 0.08 ? netT / 0.08 : Math.exp(-5 * (netT - 0.08));
        if (netT > 1.5) netOn = false; else base.addScaledVector(netDir, 0.3 * a * netAmt);
      }

      // ---- goal frame: draw the loose ball where its surface meets the drawn wood when the sim bounces it
      if (key === -1 && !dead) { let hl = simP.y - R;
        if (simP.z > BAR_Z && fin(b.vz, 0) < -0.5) { const tl = (simP.z - BAR_Z) / -b.vz; hl = Math.max(0, hl + fin(b.vy, 0) * tl - 0.5 * GRAV * tl * tl); }
        const f = frameShift(simP.x, simP.y - R, simP.z, restW, hl); base.x += f.x * kq; base.y += f.y * kq; base.z += f.z * kq; if (base.y < R) base.y = R; }

      // ---- drawn position + velocity of the drawn ball (rolling never slides, whatever moved it)
      pTrueY = base.y; trueH = Math.max(0, base.y - R);
      if (trueH > H_LIN) base.y = R + drawHeight(trueH);       // high balls are drawn lower so they stay in frame; the shadow stays under the true ground point
      drawn.copy(base);
      if (dt > 0 && hasDrawn) {
        vel.subVectors(drawn, prevDrawn).multiplyScalar(1 / dt);
        const l = vel.length();
        if (l > 45) vel.multiplyScalar(45 / l);
      } else if (!hasDrawn) vel.set(0, 0, 0);
      prevDrawn.copy(drawn); hasDrawn = true;

      // ---- orientation
      const hgt = drawn.y - R, grounded = hgt < 0.03 && !held;
      kickHold = Math.max(0, kickHold - dt);
      if (held) wB.multiplyScalar(Math.exp(-6 * dt));
      else if (grounded && kickHold <= 0) {
        wB.set(vel.z / R, 0, -vel.x / R);                                            // (up x v) / R
        const wl = wB.length(); if (wl > ROLL_MAX) wB.multiplyScalar(ROLL_MAX / wl);
      } else wB.multiplyScalar(Math.pow(0.98, dt));
      if (pendKick && !khOn) { pendKick = false; khSpin = true; }
      if (khSpin && (!khOn || khRel)) {         // the kick spin starts when the boot meets the ball, i.e. at the end of a hold
        khSpin = false; pendKick = false;
        const vx = b.vx || 0, vz = b.vz || 0, vh = Math.hypot(vx, vz);
        if (vh > 0.1 && pendKickType) {
          const ax = vz / vh, az = -vx / vh;     // roll axis for the kick direction
          const r = pendKickType === 'chip' ? -32 : pendKickType === 'power' ? 6 : pendKickType === 'finesse' ? 9 : 14;
          wB.set(ax * r, 0, az * r); kickHold = 0.08;
        }
      }
      om.copy(wB);
      if (!grounded) om.y += (b.spin || 0) * 14;
      const wl = om.length(), ang = wl * dt;
      if (ang > 1e-7) {
        om.multiplyScalar(1 / wl);
        dq.setFromAxisAngle(om, ang);
        sphere.quaternion.premultiply(dq);
        if (++frames % 60 === 0) sphere.quaternion.normalize();
      }

      // ---- squash + placement
      sqT += dt;
      const sy = sqT < 0.09 ? 1 - sqD * (1 - sm(sqT / 0.09)) : 1, sxz = 1 / Math.sqrt(sy);
      mesh.scale.set(sxz, sy, sxz);
      mesh.position.set(drawn.x, hgt < R ? drawn.y - R * (1 - sy) : drawn.y, drawn.z);

      // ---- contact shadow
      const hh = trueH, f = 1 / (1 + hh * 0.45), rad = R * 1.35 * (0.5 + 0.5 * f), al = 0.6 * f * f;
      shadow.position.set(drawn.x, 0.012, drawn.z);
      shadow.scale.set(rad * 2, 1, rad * 2);
      shMat.opacity = al; shadow.visible = al > 0.01;

      // ---- trail ring (fixed real-time sampling)
      if (dt > 0) {
        tAcc += dt;
        if (tAcc >= TRAIL_DT || tCount === 0) {
          tAcc = tAcc >= TRAIL_DT ? Math.min(tAcc - TRAIL_DT, TRAIL_DT) : 0;
          tHead = (tHead + 1) % TRAIL_CAP; ring[tHead].copy(drawn); tCount = Math.min(TRAIL_CAP, tCount + 1);
        }
      }
      TRAIL.speed = vel.length();
    }

    function onEvent(e) {
      if (!e) return;
      switch (e.type) {
        case 'kick': pendKick = true; pendKickType = e.shot || null; pendKickBy = e.p != null ? e.p : -1; break;
        case 'bounce': if (!dead) { sqT = 0; sqD = 0.18; } break;
        case 'out': pendOut = true; break;
        case 'goal': pendGoal = true; khFin = true; break;
        case 'post': case 'bar': wB.multiplyScalar(0.3); sqT = 0; sqD = 0.05 + 0.07 * clamp(e.power != null ? e.power : 0.5, 0, 1); khFin = true; break;
        case 'save': wB.multiplyScalar(0.35); khFin = true; break;
        case 'block': khFin = true; break;
        case 'teleport': pendSnap = true; break;
      }
    }

    function getTrailPoints() {
      for (let i = 0; i < tCount; i++) TRAIL.points[i] = ring[(tHead - i + TRAIL_CAP) % TRAIL_CAP];
      TRAIL.count = tCount;
      return TRAIL;
    }

    function setArena(o) { arena = makeArena(K, o); }

    function dispose() {
      geo.dispose(); mat.dispose(); shGeo.dispose(); shMat.dispose(); shTex.dispose(); glowMat.dispose(); glowTex.dispose();
      for (const id in texCache) texCache[id].dispose();
    }

    return {
      mesh, sphere, shadow, glow, update, onEvent, reset, setSkin, setArena, getTrailPoints, dispose,
      get skin() { return skin; }, get dribbleW() { return modeKey >= 0 ? 1 - (relDur > 0 ? Math.max(0, 1 - relT / relDur) : 0) : 0; }, get dead() { return dead; }, get kickWindow() { return khWin; }, get drawn() { return drawn; }, strike,
    };
  }

  R3D.Ball = { create, paintSkin, makeArena, reach, drawHeight, RADIUS: R, TEX_W: TW, TEX_H: TH };
})();
