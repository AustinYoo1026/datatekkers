#!/usr/bin/env node
/* Headless quality gate for the 3D animation: what a viewer would see as wrong, as numbers.

   node tools/anim-check.js [--only A|B|C] [--clip name] [--json] [--matches n] [--secs s] [--hz n] [--all] [--top n] [--trace key]
     --only A|B|C   run one section (may be repeated / comma separated)
     --clip name    section A: only scenes whose name contains this (e.g. "skill:roulette", "gk:", "shoot")
     --json         print one JSON document (everything, per variant) instead of the tables
     --matches n    section C: CPU-vs-CPU matches (default 3)     --secs s   sim seconds per match cap (default 150)
     --hz n         section C display rate (default 60)           --all      print every row (default: the worst 20, or --top n)
     --no-skills    section C: pure CPU-vs-CPU (by default the home player also presses a skill chord about once a second)
     --root dir     check another copy of the repo (needs its js/ folder), e.g. an export of HEAD, to compare before / after
     --skip substr  do not load the modules whose path contains this (to see how the rest copes)
     --stride f     section B: the subject's stride factor (sim ms.stride, 0.9 - 1.12; default 1)
     --trace key    A: a scene name (frames around its worst value); C: a state or transition (e.g. --trace "free > tackle")
   Exit code: 0 nothing over a limit, 1 a limit exceeded, 2 a module failed to load, a section crashed or a scene could not be staged.

   Every run loads the modules fresh from disk and uses only their public API (R3D.Anim.create / samplePV / CLIPS / GK_CLIPS,
   R3D.Player.create, R3D.Ball.create / drawHeight, R3D.Adapter.snapshot / onEvent, R3D.K, ISO.Game, ISO.AI, ISO.Smooth). It is
   deterministic: the sim is seeded, the animator's per-actor phase seed (anim.state.seed, otherwise taken from the order actors are
   created in) is pinned per scene, so a scene gives the same numbers alone (--clip) as in a full run.

   WHAT IS MEASURED (all lengths metres, times real seconds as on screen; the game runs at C.SPEED = 0.6 of sim time, and the sim's
   world is ~1.6x faster than real football, so on screen motion is at about real-world pace and real-world figures apply)
     Limb motion: end effectors (mid-foot, hand, head, pelvis) relative to the ground point under the player and his drawn yaw (the
       actor's group), DIVIDED BY THE RIG HEIGHT h (player3d: outfield 0.85-1.16, keeper 1.25x): a bigger body doing the same move in
       the same time moves its limbs proportionally faster.
       spd   m/s per h                          snap  change of that velocity in one 1/60 s frame (m/s per h): acceleration / 60
       jnt   fastest turn of a body segment (thigh, shin, foot, arm, trunk...) relative to the body frame in one 1/60 s (deg). Segment
             orientation, not the local joint parameter: leg IK trades knee angle against thigh angle near full extension, which a
             viewer does not see; a segment whipping round is what shows.
       rate  peak speed at 144 Hz / at 60 Hz: a motion is a velocity (ratio ~1), a pop is a step per frame (ratio 2.4). Only over
             frames whose clocks js/smooth.js interpolates; clock: a clip clock that repeats on 144 Hz frames (it steps at the sim's 72 Hz)
       low / knee / elbow   nothing through the turf, no joint bent backwards
     Body (new): lunge  pelvis below the subject's steady sprint low, in plain locomotion (free / dribble / charge, not exhausted)
                 rear   a planted foot's horizontal distance from its hip (x h): the trailing leg of a lunge
                 skate  flat planted boot (heel and toe on the turf) moving over the turf, summed per clip use, and its peak speed
                 scrape heel or toe only on the turf while the boot moves (dragged through the turf), summed per clip use
                 air    both boots off the turf: clearance of the lower boot and how long, per airborne interval
                 legs   boots or shins passing through each other (capsules: boot 0.045 h, shin 0.05 h)
                 width  ankle separation in a sideways gait (x h)
                 ball   the drawn ball inside a boot or shin (capsules as above)
                 hand   keeper in the set stance (set / shuffle / rush): hand displacement in one 1/60 s frame (x h)
                 carried  a boot on the turf (heel or toe within 2.5 cm) carried along with the body, per skill use (the reviewer's measure)
     Owned kicks as DRAWN: at the frame the drawn ball starts to move relative to the kicker after the kick event: kicking boot surface to
       drawn ball surface, and the ball's side of the hip line; then, while ball3d's kick window is open, any drawn-ball frame step against
       the sim ball's direction or above 1.6x its step. C also counts pelvis dips below 0.62 h in plain locomotion and foot-lock releases
       (anim.state.lk) whose boot then slides over 40 cm along the turf, per real minute of play.
     Contact: kick: striking boot (head for headers) to where the ball was struck, closest within 0.15 s; catch: nearest glove to the
       drawn ball after a catch / claim / smother; parry / block: nearest part of the body to the drawn ball after a parry / weak /
       slide save or a block.
     A. scenes: every clip is staged in the real sim with scripted keys and drawn exactly as in a match (Smooth between 120 Hz sim steps,
        Adapter, ball3d's drawn ball, ball before animator), so it is entered and left the way the game does it (dribble > charge >
        kick:power > free, free > slide > down > free, set > diveLow > ground > set, ...) at the sim's own speeds. Variants: right /
        left footed subject, side of the move, on the run / standing, side of the dive. 60 Hz, plus 144 Hz for the rate test. The
        window is 0.15 s before the clip to 0.45-0.6 s (sim) after the subject is back in locomotion.
        A2: tpop, the raw target pose continuity of every lab clip (samplePV): largest channel step when only the clip clock moves
        by 0.001. A continuous function of the clock stays under ~0.03 rad.
     B. steady gaits at the subject's own sim speeds (jog, sprint, dribble, walk, jockey back-pedal / strafe, focus shuffle), synthetic
        pv: skate % of distance, scrape, flight, pelvis vertical motion, legs, width.
     C. real CPU-vs-CPU matches, drawn as js/3d/r3d.js does; every actor frame is bucketed by state (free, dribble, kick:power,
        gk:set, ...) or, for 0.12 s after a change, by the transition "A > B". Plus ball contact and drawn-vs-sim ball rows.

   LIMITS. Every limit has a physical or perceptual reason (below). Speeds and snaps are per unit rig height h. */
'use strict';
const TH = {
  // Limb speed relative to the ground point, m/s per h. foot 26: the fastest instep kicks measured reach 20-26 m/s at the foot
  //   (lab frame), sprinting swing feet ~2x body speed (16 m/s at 8 m/s). hand 20: a keeper's arms in a full-stretch dive (the
  //   reviewer-approved low dive peaks at 17.7 per h, a smooth 6-frame bell) and overarm throws (15-20 m/s). head 7: a head falling
  //   from standing height reaches 6 m/s, a dive or lunge pushes it to ~7. pelvis 5: hips falling 0.96 h reach 4.3 m/s.
  spd: { foot: 26, hand: 20, head: 7, pelvis: 5 },
  // Velocity change in one 1/60 s frame, m/s per h (x60 = m/s^2). foot 15: a kick's downswing peaks at 600-900 m/s^2 (approved
  //   sprint 8.1, the dribble touch 12.9). hand 11: the approved dive's arm 10.7, an overarm throw ~650 m/s^2. head 3.5 / pelvis 3:
  //   voluntary head / hip accelerations stay under ~200 m/s^2 (approved roulette / dragback 3.0 and 2.7); above that it is a pop.
  snap: { foot: 15, hand: 11, head: 3.5, pelvis: 3 },
  jointDeg: 40,          // deg per 1/60 s (42 rad/s): the fastest segment rotation in football, the shank in an instep kick (30-40 rad/s)
  tpop: 0.06,            // rad per 0.001 of clip clock (raw target pose)
  low: -0.02,            // m: nothing deeper than 2 cm into the turf
  knee: -0.03,           // rad: no knee bent backwards
  elbow: -0.03,          // rad: no elbow bent backwards
  rateRatio: 1.6,        // peak speed at 144 Hz / at 60 Hz (a velocity gives ~1, a per-frame step 2.4)
  yawRate: 16,           // rad/s the drawn body turns (the roulette spins at ~9)
  clockFrozen: 0.25,     // share of a clip's 144 Hz frames on which its clock does not move: interpolated clocks never repeat, a clock stepping at the sim's 72 Hz repeats on half
  // body (new)
  lungeDrop: 0.07,       // x h below the steady-sprint pelvis low (0.81 h): braking / cutting sinks the hips a few cm; the reviewer's lunge was 0.08-0.35 h, his cap 0.06-0.08 h
  rearReach: 0.65,       // x h: a 0.86 h leg with the hips at the lowest allowed height reaches 0.55 h, +0.1 h pivoting on the toe; the gaits reach 0.52-0.58
  clipSkate: 0.08,       // m per clip use: a planted boot may pivot / settle a few cm; the reviewer's sliding clips moved it 48-172 cm, the gaits 0-1 cm
  clipSkatePeak: 1.5,    // m/s: a flat boot on the turf sliding faster than a slow walk reads as ice
  clipScrape: 0.25,      // m per clip use: a toe or heel dragged along the turf (the gaits: 0.4-6 cm per stride)
  airClear: 0.22,        // m: lower boot's clearance with both feet off; the sprint's flight phase reaches 0.18 at the subject's top speed
  airTime: 0.13,         // s: longest flight; the jog / sprint flight phase lasts 0.05-0.07 s on screen, real running 0.1-0.12 s
  airHigh: 0.7,          // m: clearance in a move that is a jump by design (header, keeper dive / leap, celebration): a standing jump
  legOverlap: 0.02,      // m: boots or shins 2 cm into each other is the most that still reads as touching
  sideWidth: 0.75,       // x h: a lateral shuffle keeps the feet 0.3-0.6 m apart, a wide athletic stance ~0.75 h
  ballPen: 0.04,         // m: a struck ball compresses 2-4 cm; deeper and the boot is visibly inside the ball
  gkSetHand: 0.12,       // m per 1/60 s per h (7 m/s): a keeper's reflex hand speed in the set position
  kickContact: 0.15,     // m: A, every strike: boot (head) surface to the struck ball, closest within 0.15 s
  catchContact: 0.2,     // m: A, every catch / claim / smother: nearest glove to the drawn ball within 0.15 s
  parryContact: 0.25,    // m: A, every parry / block: nearest part of the body to the ball within 0.15 s (a glove, an arm, a shin)
  // B
  slipPct: 8,            // constant speed: skate distance as % of distance travelled
  skatePeak: 1.2,        // m/s: fastest a flat planted sole moves over the turf
  scrape: 0.12,          // m per stride: a heel or toe (not the flat foot) dragged along the turf
  pelvisVy: 1.6,         // m/s vertical pelvis speed (running: +-0.5-1 m/s)
  pelvisSnap: 0.8,       // m/s per 1/60 s vertical (x60 = m/s^2): the reviewer-approved sprint at the subject's real top speed reaches 0.68 (a 4 g bounce at touchdown); 0.8 ~ 5 g
  // C
  dribGapP95: 0.35,      // m: drawn ball surface to the owner's nearest boot while dribbling, 95th percentile
  dribPenPct: 1,         // % of dribble frames with the ball more than 6 cm inside a boot
  skillTouchP90: 0.08,   // m: closest boot-to-ball approach within a skill (per skill use), 90th percentile
  looseP99: 0.35,        // m: drawn ball vs sim ball (height through R3D.Ball.drawHeight), in play, unowned, away from the deliberate displacement zones
  looseMax: 1.2,         // m: the same, worst frame
  kickJoinMax: 1.8,      // m: inside ball3d's kick hold + catch-up window: its own bound, KT_LAG 1.0 m along the path + REACH_CAP 0.75 m owned-ball compression
  kickP90: 0.15,         // m: closest the striking boot (or head) gets to where the ball was struck, within 0.15 s
  saveP90: 0.2,          // m: closest keeper glove to the drawn ball within 0.15 s of a catch / claim / smother
  parryP90: 0.25,        // m: nearest part of the keeper's body to the ball within 0.15 s of a parry / weak / slide save
  blockP90: 0.25,        // m: nearest part of the blocker's body to the ball within 0.15 s of a block
  lowFramesPct: 0.1,     // % of actor frames with anything deeper than TH.low
  // owned-ball strikes as drawn (the reviewer: 'the ball leaves, then he kicks air'). At the frame the DRAWN ball starts to move the boot
  // is on it (a boot meets the ball; 5 cm median, 8 cm worst in a scene leaves room for the pose filter), the ball is not behind his hips
  // (a kick sends the ball forward of the hip line), it never steps backwards along its flight, and it never catches the sim ball up faster
  // than ball3d's own design (1.6x the sim's speed)
  kickDrawnP50: 0.05,    // m, C median
  kickDrawnMax: 0.08,    // m, A: every scripted strike
  kickBehind: 0,         // strikes with the drawn ball behind the hip line when it leaves
  kickWrongWay: 0,       // strikes with a drawn-ball frame step against the sim ball's direction (more than 2 cm)
  kickOverspeed: 0,      // strikes with a drawn-ball frame step above 1.6x the sim ball's (+1 cm)
  dipsPerMin: 1,         // C: pelvis local minima below 0.62 h in plain locomotion, per real minute (reviewer measured 16.5; a kneeling lunge)
  lockSlidePerMin: 1,    // C: planted feet let go by the foot lock that then slide over 40 cm along the turf, per real minute (reviewer: 30)
  carriedSlide: 0.25,    // m per skill use: a boot on the turf (heel or toe within 2.5 cm) carried along with the body (the reviewer's measure, target <= ~25 cm)
  penFramesPct: 0.5,     // % of outfield frames with the ball more than ballPen inside a boot / shin
};

const fs = require('fs'), path = require('path'), vm = require('vm');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const optv = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ONLY = argv.reduce((a, v, i) => (argv[i - 1] === '--only' ? a.concat(v.toUpperCase().split(',')) : a), []);
const want = (s) => !ONLY.length || ONLY.includes(s);
const ROOT = path.resolve(optv('root', path.join(__dirname, '..')));
const CLIP_F = optv('clip', null), JSON_OUT = flag('json'), ALL = flag('all'), TRACE = optv('trace', null), NO_SKILLS = flag('no-skills'), TOP = +optv('top', 20);
const STRIDE_F = +optv('stride', 1);      // section B: stride factor (default 1: output unchanged)
const MATCHES = +optv('matches', 3), SECS = +optv('secs', 150), HZ_C = +optv('hz', 60);

// ---------------------------------------------------------------- browser stubs + module loading
const noop = () => {};
function ctx2d() {
  const base = { createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), measureText: () => ({ width: 0 }) };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
}
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d(), addEventListener: noop, toDataURL: () => '' });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(),
  getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
const FILES = ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/ai.js', 'js/smooth.js', 'js/3d/coords.js', 'js/3d/adapter.js', 'js/3d/player3d.js',
  'js/3d/animkit.js', 'js/3d/clips-action.js', 'js/3d/clips-skill.js', 'js/3d/clips-keeper.js', 'js/3d/anim3d.js', 'js/3d/ball3d.js'];
const out = { loadErrors: {}, errors: [], fails: [], thresholds: TH };
const short = (e) => String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').split(ROOT + '/').join('');
const warn = console.warn; console.warn = noop;
const SKIP = optv('skip', null);
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (SKIP && f.indexOf(SKIP) >= 0) { out.loadErrors[f] = 'skipped (--skip)'; continue; }
  if (!fs.existsSync(p) && /animkit|clips-/.test(f)) { (out.absent = out.absent || []).push(f); continue; }      // older layout: one anim3d.js
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); } catch (e) { out.loadErrors[f] = short(e); }
}
console.warn = warn;
const THREE = globalThis.THREE, ISO = globalThis.ISO || {}, R3D = ISO.R3D || {}, K = R3D.K || { S: 0.05, ballR: 0.11 }, C = ISO.C || {};
const SPEED = C.SPEED || 0.6, STEP = C.STEP || 1 / 120, S = K.S || 0.05, BR = K.ballR || (R3D.Ball && R3D.Ball.RADIUS) || 0.11;
const PI = Math.PI, TAU = PI * 2;
const ZERO = (ISO.Game && ISO.Game.ZERO) || {};
const IN = (o) => Object.assign({}, ZERO, o);
const drawH = (h) => (R3D.Ball && R3D.Ball.drawHeight ? R3D.Ball.drawHeight(h) : h);

// ---------------------------------------------------------------- small helpers
const r2 = (v) => (v == null || v !== v ? v : Math.round(v * 100) / 100), r3 = (v) => (v == null || v !== v ? v : Math.round(v * 1000) / 1000);
const pct = (arr, p) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
const pad = (s, n) => { s = String(s == null ? '-' : s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
const padL = (s, n) => { s = String(s == null ? '-' : s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin0 = (v) => (typeof v === 'number' && v === v ? v : 0);
const lines = [];
const say = (s) => lines.push(s === undefined ? '' : s);
function table(head, rows, widths) {
  say(head.map((h, i) => (i ? padL(h, widths[i]) : pad(h, widths[i]))).join(' '));
  for (const r of rows) say(r.map((c, i) => (i && i < r.length - 1 ? padL(c, widths[i]) : i ? ' ' + c : pad(c, widths[i]))).join(' '));
}
const compact = (F) => { const g = {}, o = []; for (const f of F) { const [a, b] = f.split(':'); if (b) (g[a] = g[a] || []).push(b === 'pelvis' ? 'p' : b === 'head' ? 'hd' : b[0]); else o.push(a); } return Object.keys(g).map((k) => k + '(' + g[k].join(',') + ')').concat(o).join(' '); };
const fail = (section, what, value, limit) => out.fails.push({ section, what, value: r3(value), limit });
// closest distance between segments A[a0..a0+2]-A[a1..] and B[b0..]-B[b1..]
function segDist(A, a0, a1, B, b0, b1) {
  const d1x = A[a1] - A[a0], d1y = A[a1 + 1] - A[a0 + 1], d1z = A[a1 + 2] - A[a0 + 2], d2x = B[b1] - B[b0], d2y = B[b1 + 1] - B[b0 + 1], d2z = B[b1 + 2] - B[b0 + 2];
  const rx = A[a0] - B[b0], ry = A[a0 + 1] - B[b0 + 1], rz = A[a0 + 2] - B[b0 + 2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a < 1e-9 && e < 1e-9) return Math.hypot(rx, ry, rz);
  if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}
function pointSegDist(px, py, pz, A, a0, a1) {
  const ex = A[a1] - A[a0], ey = A[a1 + 1] - A[a0 + 1], ez = A[a1 + 2] - A[a0 + 2], l2 = ex * ex + ey * ey + ez * ez || 1;
  const t = clamp(((px - A[a0]) * ex + (py - A[a0 + 1]) * ey + (pz - A[a0 + 2]) * ez) / l2, 0, 1);
  return Math.hypot(px - A[a0] - ex * t, py - A[a0 + 1] - ey * t, pz - A[a0 + 2] - ez * t);
}

// ---------------------------------------------------------------- actor + probe
const EFF = ['footL', 'footR', 'handL', 'handR', 'head', 'pelvis'];
const EFF_KIND = ['foot', 'foot', 'hand', 'hand', 'head', 'pelvis'];
const KINDS = ['foot', 'hand', 'head', 'pelvis'];
const EFF_OFF = [[0, -0.04, 0.07], [0, -0.04, 0.07], [0, -0.05, 0], [0, -0.05, 0], [0, 0.12, 0], [0, 0, 0]];
// surfaces for ground penetration: [bone, x, y, z, radius, group]; the first four are the soles (heel, toe of L, R)
const LOW = [['footL', 0, -0.08, -0.06, 0, 'foot'], ['footL', 0, -0.08, 0.19, 0, 'foot'], ['footR', 0, -0.08, -0.06, 0, 'foot'], ['footR', 0, -0.08, 0.19, 0, 'foot'],
  ['handL', 0, -0.05, 0, 0.045, 'hand'], ['handR', 0, -0.05, 0, 0.045, 'hand'], ['pelvis', 0, -0.04, 0, 0.15, 'pelvis'], ['head', 0, 0.12, 0, 0.13, 'head']];
const BOOT_R = 0.045, SHIN_R = 0.05;      // x rig height: half a boot's width, a shin's radius
let actorN = 0;
// pin: the animator's per-actor phase seed (idle sway, arm drift; it shapes how a start from standstill begins), else it depends on how
// many actors were created before
function mkActor(keeper, foot, def, pin) {
  const d = def || (keeper ? ISO.KEEPERS[1] : ISO.PLAYERS[0]);
  const actor = R3D.Player.create(THREE, { def: d, kit: d.kit, keeper: !!keeper, slot: keeper ? 9 : actorN++ % 2 });
  if (foot) actor.foot = foot;
  const anim = R3D.Anim.create(actor);
  if (!actor.anim) actor.anim = anim;
  if (pin != null && actor.anim.state && typeof actor.anim.state.seed === 'number') actor.anim.state.seed = pin;
  actor.probe = mkProbe(actor);
  return actor;
}
function mkProbe(actor) {
  const bn = actor.bones, g = actor.group, v = new THREE.Vector3(), names = Object.keys(bn), gq = new THREE.Quaternion(), dp = new THREE.Vector3(), ds = new THREE.Vector3();
  const P = {
    rel: new Float64Array(18), wld: new Float64Array(18), prel: new Float64Array(18), vel: new Float64Array(18), pvel: new Float64Array(18),
    sole: new Float64Array(12), psole: new Float64Array(12), boot: new Float64Array(12), shin: new Float64Array(12), hip: new Float64Array(6), ank: new Float64Array(6),
    q: names.map(() => new THREE.Quaternion()), pq: names.map(() => new THREE.Quaternion()),
    low: { foot: 0, hand: 0, pelvis: 0, head: 0 }, lowest: 0, n: 0, nan: false, names, h: 1,
    jump: new Float64Array(6), spd: new Float64Array(6), snap: new Float64Array(6), ang: 0, angJoint: '', kneeL: 0, kneeR: 0, elbL: 0, elbR: 0, yaw: 0, pyaw: 0, yawRate: 0,
    gx: 0, gz: 0, pgx: 0, pgz: 0,
    reset() { P.n = 0; },
    read(dt) {      // dt = real seconds of this frame
      const h = (P.h = (actor.rig && actor.rig.h) || 1);
      g.updateMatrixWorld(true);
      P.prel.set(P.rel); P.pvel.set(P.vel); P.psole.set(P.sole); P.pyaw = P.yaw;
      let nan = false;
      for (let i = 0; i < 6; i++) {
        const o = EFF_OFF[i];
        v.set(o[0] * h, o[1] * h, o[2] * h); bn[EFF[i]].localToWorld(v);
        P.wld[i * 3] = v.x; P.wld[i * 3 + 1] = v.y; P.wld[i * 3 + 2] = v.z;
        g.worldToLocal(v);
        P.rel[i * 3] = v.x; P.rel[i * 3 + 1] = v.y; P.rel[i * 3 + 2] = v.z;
        if (!(v.x === v.x && v.y === v.y && v.z === v.z)) nan = true;
      }
      P.low.foot = P.low.hand = P.low.pelvis = P.low.head = 1e9;
      for (let i = 0; i < LOW.length; i++) {
        const p = LOW[i];
        v.set(p[1] * h, p[2] * h, p[3] * h); bn[p[0]].localToWorld(v);
        const y = v.y - p[4] * h;
        if (y < P.low[p[5]]) P.low[p[5]] = y;
        if (i < 4) { P.sole[i * 3] = v.x; P.sole[i * 3 + 1] = v.y; P.sole[i * 3 + 2] = v.z; }
      }
      for (let s = 0; s < 2; s++) {
        const ft = s ? bn.footR : bn.footL, sh = s ? bn.shinR : bn.shinL, th = s ? bn.thighR : bn.thighL, o = s * 6;
        v.set(0, -0.04 * h, -0.06 * h); ft.localToWorld(v); P.boot[o] = v.x; P.boot[o + 1] = v.y; P.boot[o + 2] = v.z;
        v.set(0, -0.04 * h, 0.19 * h); ft.localToWorld(v); P.boot[o + 3] = v.x; P.boot[o + 4] = v.y; P.boot[o + 5] = v.z;
        v.set(0, 0, 0); sh.localToWorld(v); P.shin[o] = v.x; P.shin[o + 1] = v.y; P.shin[o + 2] = v.z;
        v.set(0, 0, 0); ft.localToWorld(v); P.shin[o + 3] = v.x; P.shin[o + 4] = v.y; P.shin[o + 5] = v.z; P.ank[s * 3] = v.x; P.ank[s * 3 + 1] = v.y; P.ank[s * 3 + 2] = v.z;
        v.set(0, 0, 0); th.localToWorld(v); P.hip[s * 3] = v.x; P.hip[s * 3 + 1] = v.y; P.hip[s * 3 + 2] = v.z;
      }
      P.lowest = Math.min(P.low.foot, P.low.hand, P.low.pelvis, P.low.head);
      P.kneeL = bn.shinL.rotation.x; P.kneeR = bn.shinR.rotation.x; P.elbL = -bn.foreArmL.rotation.x; P.elbR = -bn.foreArmR.rotation.x;
      P.yaw = g.rotation.y; P.pgx = P.gx; P.pgz = P.gz; P.gx = g.position.x; P.gz = g.position.z;
      // segments: orientation relative to the body frame (the group: ground point and drawn yaw)
      g.matrixWorld.decompose(dp, gq, ds); gq.invert();
      P.ang = 0; P.angJoint = '';
      for (let i = 0; i < names.length; i++) {
        const b = bn[names[i]], q = P.q[i];
        P.pq[i].copy(q); b.matrixWorld.decompose(dp, q, ds); q.premultiply(gq);
        if (!(q.x === q.x && q.w === q.w && b.position.y === b.position.y)) nan = true;
        if (P.n > 0) { const d = Math.abs(q.dot(P.pq[i])), a = 2 * Math.acos(d > 1 ? 1 : d); if (a > P.ang) { P.ang = a; P.angJoint = names[i]; } }
      }
      P.nan = nan;
      for (let i = 0; i < 6; i++) {
        if (P.n > 0 && dt > 0) {
          const dx = P.rel[i * 3] - P.prel[i * 3], dy = P.rel[i * 3 + 1] - P.prel[i * 3 + 1], dz = P.rel[i * 3 + 2] - P.prel[i * 3 + 2];
          P.jump[i] = Math.hypot(dx, dy, dz); P.spd[i] = P.jump[i] / dt;
          P.vel[i * 3] = dx / dt; P.vel[i * 3 + 1] = dy / dt; P.vel[i * 3 + 2] = dz / dt;
          P.snap[i] = P.n > 1 ? Math.hypot(P.vel[i * 3] - P.pvel[i * 3], P.vel[i * 3 + 1] - P.pvel[i * 3 + 1], P.vel[i * 3 + 2] - P.pvel[i * 3 + 2]) / (dt * 60) : 0;
        } else { P.jump[i] = P.spd[i] = P.snap[i] = 0; P.vel[i * 3] = P.vel[i * 3 + 1] = P.vel[i * 3 + 2] = 0; }
      }
      let dy = P.yaw - P.pyaw; dy = ((dy + PI) % TAU + TAU) % TAU - PI;
      P.yawRate = P.n > 0 && dt > 0 ? Math.abs(dy) / dt : 0;
      P.n++;
    },
  };
  return P;
}
// ---------------------------------------------------------------- per-frame body geometry (world metres)
const FM = { carried: new Float64Array(2), skate: new Float64Array(2), scrape: new Float64Array(2), planted: new Uint8Array(2), clear: 0, rear: 0, sep: 0, bootOv: 0, shinOv: 0, ballPen: -1, penPart: '', pelvisY: 0, sideways: false };
function frameMetrics(P, pv, ball) {
  const h = P.h;
  for (let s = 0; s < 2; s++) {
    // flat on the turf (heel and toe within 2 cm, this frame and the last): planted. One of them only: scraping
    const hi = s * 2, ti = s * 2 + 1, yh = P.sole[hi * 3 + 1], yt = P.sole[ti * 3 + 1], ph = P.psole[hi * 3 + 1], pt = P.psole[ti * 3 + 1], i = yh <= yt ? hi : ti;
    const flat = yh < 0.02 && yt < 0.02, was = P.n > 1 && ph < 0.02 && pt < 0.02, one = P.n > 1 && Math.min(yh, yt) < 0.02 && Math.min(ph, pt) < 0.02;
    const d = Math.hypot(P.sole[i * 3] - P.psole[i * 3], P.sole[i * 3 + 2] - P.psole[i * 3 + 2]);
    FM.planted[s] = flat ? 1 : 0;
    FM.skate[s] = flat && was ? d : 0;
    FM.scrape[s] = !(flat && was) && one ? d : 0;
    // carried: the lower sole point within 2.5 cm in both frames and moving with the body (scratchpad/r2/ana.js uses())
    const lo = Math.min(yh, yt) < 0.025 && Math.min(ph, pt) < 0.025 && P.n > 1, bx = P.gx - P.pgx, bz = P.gz - P.pgz, db = Math.hypot(bx, bz);
    const wx = P.sole[i * 3] - P.psole[i * 3], wz = P.sole[i * 3 + 2] - P.psole[i * 3 + 2];
    FM.carried[s] = lo && d > 0.002 && db < 1 && Math.hypot(wx - bx, wz - bz) < 0.5 * Math.max(d, db) ? d : 0;
  }
  FM.clear = Math.min(P.sole[1], P.sole[4], P.sole[7], P.sole[10]);
  FM.rear = 0;
  for (let s = 0; s < 2; s++) if (Math.min(P.sole[s * 6 + 1], P.sole[s * 6 + 4]) < 0.02) { const d = Math.hypot(P.ank[s * 3] - P.hip[s * 3], P.ank[s * 3 + 2] - P.hip[s * 3 + 2]) / h; if (d > FM.rear) FM.rear = d; }
  FM.sep = Math.hypot(P.ank[0] - P.ank[3], P.ank[2] - P.ank[5]) / h;
  FM.bootOv = 2 * BOOT_R * h - segDist(P.boot, 0, 3, P.boot, 6, 9);
  FM.shinOv = 2 * SHIN_R * h - segDist(P.shin, 0, 3, P.shin, 6, 9);
  FM.ballPen = -1; FM.penPart = '';
  if (ball) for (let s = 0; s < 2; s++) {
    const b = BR + BOOT_R * h - pointSegDist(ball.x, ball.y, ball.z, P.boot, s * 6, s * 6 + 3), c = BR + SHIN_R * h - pointSegDist(ball.x, ball.y, ball.z, P.shin, s * 6, s * 6 + 3);
    if (b > FM.ballPen) { FM.ballPen = b; FM.penPart = (s ? 'R' : 'L') + ' boot'; }
    if (c > FM.ballPen) { FM.ballPen = c; FM.penPart = (s ? 'R' : 'L') + ' shin'; }
  }
  FM.pelvisY = P.wld[16];
  const vx = fin0(pv.vx), vz = fin0(pv.vz), vl = Math.hypot(vx, vz), cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  FM.sideways = vl > 1.5 && Math.abs(vx * cy - vz * sy) > 0.7 * vl;
  return FM;
}
// contact gaps (surface to surface, < 0 = overlap)
const _p = { x: 0, y: 0, z: 0 }, _A = new Float64Array(6);
let _V = null;
function wpt(ac, bone, x, y, z) { _V = _V || new THREE.Vector3(); const h = (ac.rig && ac.rig.h) || 1; _V.set(x * h, y * h, z * h); ac.bones[bone].localToWorld(_V); _p.x = _V.x; _p.y = _V.y; _p.z = _V.z; return _p; }
function bootGap(ac, side, bx, by, bz) {
  const h = (ac.rig && ac.rig.h) || 1, f = side > 0 ? 'footR' : 'footL';
  let p = wpt(ac, f, 0, -0.04, -0.06); _A[0] = p.x; _A[1] = p.y; _A[2] = p.z; p = wpt(ac, f, 0, -0.04, 0.19); _A[3] = p.x; _A[4] = p.y; _A[5] = p.z;
  return pointSegDist(bx, by, bz, _A, 0, 3) - BR - BOOT_R * h;
}
function pointGap(ac, bone, oy, rad, bx, by, bz) { const h = (ac.rig && ac.rig.h) || 1, p = wpt(ac, bone, 0, oy, 0); return Math.hypot(bx - p.x, by - p.y, bz - p.z) - BR - rad * h; }
const gloveGap = (ac, x, y, z) => Math.min(pointGap(ac, 'handL', -0.05, 0.06, x, y, z), pointGap(ac, 'handR', -0.05, 0.06, x, y, z));
// nearest surface of the body: hands, forearms, head, chest, pelvis, shins, boots (radii as the animator's ground points)
function bodyGap(ac, x, y, z) {
  return Math.min(gloveGap(ac, x, y, z), pointGap(ac, 'head', 0.12, 0.13, x, y, z), pointGap(ac, 'chest', 0.05, 0.15, x, y, z), pointGap(ac, 'pelvis', -0.04, 0.15, x, y, z),
    pointGap(ac, 'foreArmL', 0, 0.05, x, y, z), pointGap(ac, 'foreArmR', 0, 0.05, x, y, z), pointGap(ac, 'shinL', 0, 0.065, x, y, z), pointGap(ac, 'shinR', 0, 0.065, x, y, z), bootGap(ac, 1, x, y, z), bootGap(ac, -1, x, y, z));
}

// ---------------------------------------------------------------- owned-ball strikes as drawn
// From the kick event: the frame the drawn ball starts to move relative to the kicker (2 cm in a frame) gives the boot-surface to
// ball-surface gap (the kicking boot, that frame or the one before) and which side of the hips the ball is; until ball3d's kick window
// closes (or 0.4 s), every drawn-ball frame step is compared with the sim ball's: backwards (dot < 0, step > 2 cm) or faster than 1.6x.
function kickWatch() {
  const done = [], open = [];
  return {
    done,
    start(ac, pv, side, dc, sb, at) { open.push({ ac, side, at, n: 0, rel: null, pd: [dc.x, dc.y, dc.z], ps: [sb.x, sb.y, sb.z], pgap: 1e9, started: false, gap: null, fwd: null, wrong: 0, over: 0, overMax: 0 }); },
    frame(dc, sb, pvOf, open2, hz) {
      for (let q = open.length - 1; q >= 0; q--) {
        const w = open[q], pv = pvOf(w.ac), P = w.ac.probe;
        const rx = dc.x - fin0(pv.x), rz = dc.z - fin0(pv.z), g = bootGap(w.ac, w.side, dc.x, dc.y, dc.z);
        const bx = dc.x - w.pd[0], by = dc.y - w.pd[1], bz = dc.z - w.pd[2], sx = sb.x - w.ps[0], sy = sb.y - w.ps[1], sz = sb.z - w.ps[2], dB = Math.hypot(bx, by, bz), dS = Math.hypot(sx, sy, sz);
        if (!w.started && w.rel && Math.hypot(rx - w.rel[0], rz - w.rel[1]) > 0.02) {
          w.started = true; w.gap = Math.min(g, w.pgap);
          const yaw = w.ac.group.rotation.y; w.fwd = (dc.x - P.wld[15]) * Math.sin(yaw) + (dc.z - P.wld[17]) * Math.cos(yaw);
        } else if (w.started) {
          if (dB > 0.02 && bx * sx + by * sy + bz * sz < 0) w.wrong++;
          if (dB > 1.6 * dS + 0.01) { w.over++; w.overMax = Math.max(w.overMax, dS > 1e-3 ? dB / dS : 99); }
        }
        w.pgap = g; w.rel = [rx, rz]; w.pd = [dc.x, dc.y, dc.z]; w.ps = [sb.x, sb.y, sb.z]; w.n++;
        if ((w.started && !open2) || w.n > 0.4 * hz) { done.push(w); open.splice(q, 1); }
      }
    },
  };
}

// ---------------------------------------------------------------- state keys (the same names in A and C)
function keyOf(pv, keeper) {
  if (keeper) return 'gk:' + (pv.holding ? 'hold' : pv.state === 'dive' ? (pv.jump ? 'jump' : pv.high ? 'diveHigh' : 'diveLow') : pv.state === 'ground' && pv.slid ? 'slideDown' : pv.state) + (pv.chip && pv.state === 'set' ? '+chip' : '');
  if (pv.state === 'skill' && pv.skill) return 'skill:' + pv.skill.id;
  if (pv.state !== 'free') return pv.state;
  if (pv.kickT > 0) return 'kick' + (pv.kick && pv.kick.high ? ':header' : pv.kick && pv.kick.type ? ':' + pv.kick.type : pv.kick ? ':pass' : '');
  if (pv.fakeU > 0) return 'fake';
  if (pv.charge && !pv.charge.ft) return 'charge';
  if (pv.wall) return 'wall';
  if (pv.owner) return pv.shield ? 'shield' : 'dribble';
  if (pv.shield) return 'shield';
  if (pv.focus) return 'focus';      // the sim sets jock with focus
  if (pv.jock) return 'jockey';
  return 'free';
}
// locomotion (the gait owns the legs) vs a clip; PLAIN: locomotion without a designed crouch (the lunge check)
const LOCO = { free: 1, dribble: 1, charge: 1, shield: 1, jockey: 1, focus: 1, wall: 1, 'gk:set': 1, 'gk:set+chip': 1 };
const PLAIN = { free: 1, dribble: 1, charge: 1 };
// clips that slide over the turf by design (the animator's LOCK_OFF, keeper dives / ground): no skate / scrape check
const SLIDES = { slide: 1, down: 1, celebrate: 1, ankle: 1, 'gk:diveLow': 1, 'gk:diveHigh': 1, 'gk:jump': 1, 'gk:ground': 1, 'gk:slide': 1, 'gk:slideDown': 1 };
// airborne by design: judged against airHigh instead of the running flight
const AIR_OK = { 'gk:diveLow': 1, 'gk:diveHigh': 1, 'gk:jump': 1, 'gk:slide': 1, slide: 1, 'kick:header': 1, celebrate: 1 };
// keeper dives and leaps: the sim keeps the ball reachable up to 3.6 m (high dive) and 4.2 m (chip leap), so the clip has to lift him; judged by
// contact and limb motion, not by boot clearance
const AIR_GK = { 'gk:diveLow': 1, 'gk:diveHigh': 1, 'gk:jump': 1, 'gk:slide': 1 };
const isLoco = (k) => !!LOCO[k];
// the keeper's set stance (hand check)
const GKSET = { 'gk:set': 1, 'gk:set+chip': 1 };

// ---------------------------------------------------------------- the sim, drawn: what js/main.js + js/3d/r3d.js do each display frame
// o: { roster, solo, seed, setup(G), pre(G, k), input(G, k) -> inputs[], subjects: [player index | 'k'], pin }. AI-driven matches pass
// input() too. Order per frame as r3d.js: sim steps (Smooth.capture before each), events to the Adapter and the ball, Smooth.begin,
// snapshot, ball.update, then every animator with the drawn ball (bv), Smooth.end.
function World(o) {
  const Ad = R3D.Adapter;
  const G = ISO.Game.create({ roster: o.roster, home: o.home, away: o.away, seed: o.seed || 1, solo: !!o.solo, kickoff: o.kickoff || 0 });
  if (o.staged) { G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; }
  if (o.setup) o.setup(G);
  ISO.Smooth.reset(); if (Ad.reset) Ad.reset(G);
  const W = { G, k: 0, acc: 0, f: 0, evs: [], allEvs: [], ball: null, ballErr: null, actors: [], bv: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: BR, owner: -1, held: false }, dc: { x: 0, y: 0, z: 0 }, vf: null, V: { me: 0 }, lastBall: null };
  for (const s of o.subjects) {
    const keeper = s === 'k', def = keeper ? G.keeper.def : G.players[s].def;
    const ac = mkActor(keeper, 0, def, typeof o.pin === 'function' ? o.pin(W.actors.length) : o.pin); ac.idx = keeper ? -1 : s; ac.isKeeper = keeper; W.actors.push(ac);
  }
  if (R3D.Ball) { try { W.ball = R3D.Ball.create(THREE, ISO.ballById ? ISO.ballById('classic') : 'classic', { walls: !!G.walls }); } catch (e) { W.ballErr = short(e); } }
  W.frame = (dt, cb) => {
    W.acc += dt * SPEED;
    const evs = (W.evs = []);
    while (W.acc >= STEP) {
      if (o.pre) o.pre(G, W.k, W);
      ISO.Smooth.capture(G);
      const inp = o.input ? o.input(G, W.k, W) : [];
      ISO.Game.step(G, inp);
      W.acc -= STEP; W.k++;
      for (const e of G.events) evs.push(e);
      G.events.length = 0;
    }
    for (const e of evs) {
      W.allEvs.push({ type: e.type, f: W.f, t: G.t });
      Ad.onEvent(G, e);
      const plain = { type: e.type, power: e.power, shot: e.shot, kind: e.kind, team: e.team, catch: e.catch, weak: e.weak, smother: e.smother, slide: e.slide, p: e.p ? G.players.indexOf(e.p) : -1 };
      if (W.ball && !W.ballErr) { try { W.ball.onEvent(plain, Ad.vf); } catch (e2) { W.ballErr = short(e2); } }
    }
    ISO.Smooth.begin(G, W.acc / STEP, dt);
    try {
      const vf = (W.vf = Ad.snapshot(G, W.V)), b = vf.ball;
      if (W.lastBall && Math.abs(b.x - W.lastBall.x) + Math.abs(b.z - W.lastBall.z) > 3 && W.ball && W.ball.reset && !W.ballErr) W.ball.reset();
      W.lastBall = W.lastBall || {}; W.lastBall.x = b.x; W.lastBall.z = b.z;
      if (W.ball && !W.ballErr) { try { W.ball.update(vf, dt); } catch (e2) { W.ballErr = short(e2); } }
      const d = W.ball && !W.ballErr ? W.ball.drawn : null, bv = W.bv, dc = W.dc;
      dc.x = d ? d.x : b.x; dc.y = d ? d.y : b.y + BR; dc.z = d ? d.z : b.z;      // drawn centre
      bv.x = dc.x; bv.z = dc.z; bv.y = Math.max(0, dc.y - BR); bv.vx = b.vx; bv.vy = b.vy; bv.vz = b.vz; bv.owner = b.owner; bv.held = b.held; bv.r = BR;
      cb(W, vf, evs);
    } finally { ISO.Smooth.end(G); }
    W.f++;
  };
  return W;
}

// ================================================================ A. clips in the game: scripted scenes through the real sim
// Every clip is entered and left the way the game does it: the sim (js/game.js) runs with scripted keys, the view is drawn exactly
// as in a match (Smooth, Adapter, the drawn ball of ball3d.js), so speeds, ball offsets, kick holds and the state that follows
// (slide > down > free, dive > ground > set, ...) are the game's own. Where a state cannot be reached by keys alone the scene sets
// it with the same assignments the sim makes on that path (named in the scene). Variants: right / left footed subject, move side.
const byId = (id, i) => (ISO.PLAYERS || []).find((p) => p.id === id) || (ISO.PLAYERS || [])[i];
const SUBJ = byId('lautaro', 0), OPPD = byId('maldini', 1), MATE = byId('modric', 2);
const defFoot = (f) => Object.assign({}, SUBJ, { foot: f > 0 ? 'R' : 'L' });
const sec = (t) => Math.round(t / STEP);
const FT = [{ foot: 1 }, { foot: -1 }];
const FT_RUN = [{ foot: 1, run: 1 }, { foot: -1, run: 1 }, { foot: 1, run: 0 }, { foot: -1, run: 0 }];
const SD_FT = [{ sd: 1, foot: 1 }, { sd: -1, foot: 1 }, { sd: 1, foot: -1 }, { sd: -1, foot: -1 }];
const vtag = (v) => '(' + Object.keys(v).map((k) => k + (v[k] > 0 ? '+' : v[k] < 0 ? '-' : '0')).join(' ') + ')';
// a subject with the ball at his feet, at rest or running across the pitch (+y) far from the box
function own(G, p, x, y, face) { const b = G.ball; p.x = x; p.y = y; p.face = face; p.vx = p.vy = 0; b.owner = p; b.x = x + Math.cos(face) * 12; b.y = y + Math.sin(face) * 12; b.z = b.vx = b.vy = b.vz = 0; b.lastTouch = p.team; G.attacker = p.team; }
function away(p) { p.state = 'away'; p.x = p.y = -900; p.vx = p.vy = 0; }
// scene end: the subject has left the clip (and its chain) for `tail` sim seconds, or the hard cap
function ender(clipKeyFn, tail, cap, phase) {
  const st = { seen: false, out: -1 };
  return { st, done: (W, key) => { if (clipKeyFn(key)) { st.seen = true; st.out = -1; } else if (st.seen && st.out < 0 && isLoco(key)) st.out = W.G.t; return (st.out >= 0 && W.G.t - st.out > tail) || W.G.t > cap || (phase !== 'any' && W.G.phase !== 'play'); } };
}
// outfield scenes: the keeper stays on his line (as in the drills: no rush, no slide) and a ball about to leave the pitch is stopped
// short of the line (the phase stays 'play', the subject keeps his keys). Neither touches the subject.
function guard(G) { const k = G.keeper, b = G.ball; k.slideCd = 99; k.rushCd = 99; k.rush = 0; if (!b.owner && !b.holder && (b.x > 318 || b.x < 10 - (C.BACK || 0) || b.y < 8 || b.y > 712)) { b.x = clamp(b.x, 10 - (C.BACK || 0), 318); b.y = clamp(b.y, 8, 712); b.vx = b.vy = b.vz = 0; b.z = 0; b.shot = null; } }
const RUN_X = 5, RUN_Y = 200;      // start of a run at goal: off-centre, so a ball over the line is a goal kick, not a goal
const SKILL_KEYS = { stepover: [1], feint: [2], knock: [4], croqueta: [3], roulette: [5], elastico: [6], rainbow: [7], heel: [1, 1], dragback: [2, 1], nutmeg: [4, 1], roll: [4, 0, 1] };
const SCENES = [];
// ---- skill moves: dribbling at goal at the subject's jog (sprinting for the sprint chords), the chord held 8 steps as a player presses it
for (const id of Object.keys(SKILL_KEYS)) SCENES.push({ name: 'skill:' + id, clip: (k) => k === 'skill:' + id, variants: SD_FT, tail: 0.45, cap: 3, make: (v) => {
  const ch = SKILL_KEYS[id], kP = sec(ch[1] ? 0.45 : 0.55);
  return { roster: [defFoot(v.foot), OPPD], solo: true, seed: 11,
    setup(G) { own(G, G.players[0], RUN_X, RUN_Y, 0); away(G.players[1]); },
    // the move's side comes from where the nearest opponent is (pickSkill): he is placed on that side just before the press.
    // A botch (a random loss of the ball) is turned off: the move is what is being tested
    pre(G, k) { guard(G); const p = G.players[0], D = G.players[1]; if (k === kP - 1) { D.x = p.x + 50; D.y = p.y - 60 * v.sd; } if (p.skill && !p.skill._ac) { p.skill.botch = false; p.skill._ac = 1; } },
    input(G, k) {
      const i = IN({ mx: 1, my: 0, sprint: !!ch[1] });
      if (k >= kP && k < kP + 8) { i.j = !!(ch[0] & 1); i.k = !!(ch[0] & 2); i.l = !!(ch[0] & 4); if (ch[2]) { i.mx = 0; i.my = -v.sd; } }
      return [i, ZERO];
    } };
} });
// ---- strikes of an owned ball: on the run (dribbling at his jog) and from a standstill. The key is held for the wind-up, then released
const KICKS = [['shoot', 'shoot', 0.26, 'kick:normal'], ['power', 'chip', 0.5, 'kick:power'], ['finesse', 'finesse', 0.32, 'kick:finesse'], ['chip', 'lob', 0.24, 'kick:chip'], ['cross', 'lob', 0.24, 'kick:chip'], ['pass', 'pass', 0.02, 'kick:pass']];
for (const [name, key, hold, kk] of KICKS) SCENES.push({ name, clip: (k) => k === kk || k === 'charge', variants: FT_RUN, tail: 0.45, cap: 2.6, make: (v) => {
  const kS = sec(0.7), kE = kS + Math.max(1, sec(hold)), wing = name === 'cross';
  // aimed (as with the mouse) wide of the near post: the keeper does not come into it and nothing ends the phase
  return { roster: name === 'pass' ? [defFoot(v.foot), OPPD, MATE] : [defFoot(v.foot), OPPD], solo: true, seed: 12,
    setup(G) { own(G, G.players[0], RUN_X, wing ? 60 : RUN_Y, 0); away(G.players[1]); if (G.players[2]) { G.players[2].x = 160; G.players[2].y = 330; } },
    pre: guard,
    input(G, k) { const i = IN({ mx: v.run ? 1 : 0, ax: C.FW, ay: wing ? 300 : 90 }); if (k >= kS && k < kE) i[key] = true; return [i, ZERO]; } };
} });
// ---- first-time strikes of a ball coming at him (not owned): along the ground, at volley height, at head height
// ball launch [x speed, height, vertical speed] (sim units) found by search so that the strike is at volley height (z ~12 px = 0.6 m)
// and at head height (z 20-26 px, the sim's header band) for a subject arriving at his jog
const FTK = [['first-time', [-170, 0, 0], 'kick:first-time'], ['volley', [-170, 50, 60], 'kick:first-time'], ['header', [-120, 130, 120], 'kick:header']];
for (const [name, bl, kk] of FTK) SCENES.push({ name, clip: (k) => k === kk, variants: [{ foot: 1, off: 1 }, { foot: -1, off: -1 }], tail: 0.45, cap: 2.6, make: (v) => {
  let pressed = false;
  return { roster: [defFoot(v.foot), OPPD], solo: true, seed: 13,
    setup(G) { const p = G.players[0], b = G.ball; p.x = RUN_X; p.y = RUN_Y; p.face = 0; p.vx = p.jog; b.owner = null; b.x = RUN_X + 200; b.y = RUN_Y + 6 * v.off; b.vx = bl[0]; b.z = bl[1]; b.vz = bl[2]; b.vy = 0; b.lastTouch = 1; b.kickT = 1; G.attacker = 0; away(G.players[1]); },
    pre: guard,
    // shoot is pressed once the ball is low and near enough for a first-time strike (handleCharge: d < 95, z < 45) and held until it is struck
    input(G, k) { const p = G.players[0], b = G.ball, d = Math.hypot(b.x - p.x, b.y - p.y); const i = IN({ mx: 1, ax: C.FW, ay: 90 }); if ((d < 90 && b.z < 44 || p.charge) && !pressed) i.shoot = true; if (p.kickT > 0) pressed = true; return [i, ZERO]; } };
} });
// ---- fake shot: a tap of shoot (under 0.18 s) while dribbling or standing on the ball
SCENES.push({ name: 'fake', clip: (k) => k === 'fake' || k === 'charge', variants: FT_RUN, tail: 0.45, cap: 2.6, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: true, seed: 14,
  setup(G) { own(G, G.players[0], RUN_X, RUN_Y, 0); away(G.players[1]); },
  pre: guard,
  input(G, k) { const i = IN({ mx: v.run ? 1 : 0 }); if (k >= sec(0.7) && k < sec(0.8)) i.shoot = true; return [i, ZERO]; } }) });
// ---- defending against a dribbler coming at him (scripted, not the AI): standing tackle, slide, shoulder barge. Then recover / down / free
const DEF = [['tackle', 'tackle', 40, (k) => k === 'tackle' || k === 'recover'], ['slide', 'slide', 70, (k) => k === 'slide' || k === 'down'], ['shoulder', 'shoulder', 44, (k) => k === 'shoulder']];
for (const [name, key, at, clip] of DEF) SCENES.push({ name, clip, variants: [{ foot: 1, ang: 0 }, { foot: -1, ang: 0 }, { foot: 1, ang: 1 }, { foot: -1, ang: 1 }], tail: 0.55, cap: 3.5, make: (v) => {
  let done = false;
  return { roster: [defFoot(v.foot), OPPD], solo: false, seed: 15,
    setup(G) { const p = G.players[0], o = G.players[1]; p.x = 60; p.y = 200; p.face = PI / 2; own(G, o, 60 + 40 * v.ang, 380, -PI / 2 - 0.4 * v.ang); G.attacker = 1; },
    input(G, k) {
      const p = G.players[0], o = G.players[1], d = Math.hypot(o.x - p.x, o.y - p.y);
      const i = IN({ mx: (o.x - p.x) / (d || 1), my: (o.y - p.y) / (d || 1) });
      if (!done && d < at && p.state === 'free') { i[key] = true; done = true; }
      if (p.state !== 'free' || done) { i.mx = 0; i.my = 1; }
      return [i, IN({ mx: -0.3 * v.ang, my: -0.55 })];
    } };
} });
// ---- falls: stumble (the sim's assignments when a tackle wins the ball off him: resolveTackle / a shoulder bump), ankle broken by a dribbler's move
SCENES.push({ name: 'stumble', clip: (k) => k === 'stumble', variants: [{ foot: 1, bump: 0 }, { foot: -1, bump: 0 }, { foot: 1, bump: 1 }, { foot: -1, bump: 1 }], tail: 0.45, cap: 2.6, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: true, seed: 16,
  setup(G) { own(G, G.players[0], RUN_X, RUN_Y, 0); away(G.players[1]); },
  // resolveTackle (a standing tackle that wins the ball: stumble 0.16) / updateShoulder (a barge from his left: +130 px/s sideways, stumble 0.18)
  pre(G, k) {
    guard(G);
    if (k !== sec(0.7)) return;
    const p = G.players[0], b = G.ball;
    b.owner = null; p.noCtrl = v.bump ? 0.22 : 0.2; p.charge = null; p.skill = null; p.state = 'stumble'; p.stT = 0; p.stDur = v.bump ? 0.18 : 0.16;
    if (v.bump) p.vy += 130;
    b.vx = 60; b.vy = 240; b.z = 0;
  },
  input: () => [IN({ mx: 1 }), ZERO] }) });
SCENES.push({ name: 'ankle', clip: (k) => k === 'ankle', variants: FT, tail: 0.55, cap: 4, make: (v) => {
  let tk = false, sk = false;
  return { roster: [defFoot(v.foot), OPPD], solo: false, seed: 17,
    setup(G) { const p = G.players[0], o = G.players[1]; p.x = 60; p.y = 200; p.face = PI / 2; own(G, o, 60, 380, -PI / 2); G.attacker = 1; },
    pre(G) { const o = G.players[1]; if (o.skill && !o.skill._ac) { o.skill.botch = false; o.skill._ac = 1; } },
    input(G, k) {
      const p = G.players[0], o = G.players[1], d = Math.hypot(o.x - p.x, o.y - p.y);
      const i = IN({ mx: (o.x - p.x) / (d || 1), my: (o.y - p.y) / (d || 1) }), j = IN({ my: -0.6 });
      if (!sk && d < 80) { j.j = true; sk = o.state === 'skill'; }
      if (o.skill && !tk && o.skill.t / o.skill.dur > 0.32 && p.state === 'free') { i.tackle = true; tk = true; }
      if (p.state !== 'free') i.mx = i.my = 0;
      return [i, j];
    } };
} });
// ---- celebrating: the assignments of goal() while he runs (phase 'goal', state celebrate from stT 0). It never ends by itself (the rep resets)
SCENES.push({ name: 'celebrate', clip: (k) => k === 'celebrate', variants: FT, tail: 0, cap: 3.2, phase: 'any', make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: true, seed: 18,
  setup(G) { const p = G.players[0]; p.x = 60; p.y = 110; p.face = PI / 2; away(G.players[1]); G.ball.x = 20; G.ball.y = 700; },
  pre(G, k) { if (k === sec(1.0)) { const p = G.players[0]; G.phase = 'goal'; G.phaseT = 99; p.charge = null; p.state = 'celebrate'; p.stT = 0; p.stDur = 0; } },
  input: () => [IN({ my: 1 }), ZERO] }) });
// ---- the purchasable celebrations (roadmap 2.5): the same scene with def.celeb set. Only those that pass the strict thresholds are listed (see PHASE2_NOTES.md)
for (const id of ['arms', 'point', 'salute', 'robot', 'sit', 'knee', 'spin']) SCENES.push({ name: 'celebrate:' + id, clip: (k) => k === 'celebrate', variants: FT, tail: 0, cap: 3.2, phase: 'any', make: (v) => ({ roster: [Object.assign(defFoot(v.foot), { celeb: id }), OPPD], solo: true, seed: 18,
  setup(G) { const p = G.players[0]; p.x = 60; p.y = 110; p.face = PI / 2; away(G.players[1]); G.ball.x = 20; G.ball.y = 700; },
  pre(G, k) { if (k === sec(1.0)) { const p = G.players[0]; G.phase = 'goal'; G.phaseT = 99; p.charge = null; p.state = 'celebrate'; p.stT = 0; p.stDur = 0; } },
  input: () => [IN({ my: 1 }), ZERO] }) });
// ---- locomotion through the game's own velocity response: starts, stops, cuts, the defensive stances
const LOC = [
  ['start-stop', false, (k) => (k < sec(0.6) ? {} : k < sec(1.8) ? { my: 1 } : {})],
  ['sprint-stop', false, (k) => (k < sec(0.6) ? {} : k < sec(1.8) ? { my: 1, sprint: true } : {})],
  ['dribble-stop', true, (k) => (k < sec(0.6) ? {} : k < sec(1.8) ? { my: 1 } : {})],
  ['cut-180', false, (k) => (k < sec(1.0) ? { my: 1 } : { my: -1 })],
  ['cut-90', true, (k) => (k < sec(1.0) ? { my: 1 } : { mx: 1 })],
  ['walk', false, (k) => (k < sec(0.4) ? {} : { my: 0.35 })],
];
for (const [name, ball, fn] of LOC) SCENES.push({ name, loco: true, clip: () => true, variants: FT, tail: 0, cap: 2.6, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: true, seed: 19,
  setup(G) { const p = G.players[0]; if (ball) own(G, p, RUN_X, RUN_Y, 0); else { p.x = 60; p.y = 110; p.face = PI / 2; G.ball.x = 20; G.ball.y = 700; } away(G.players[1]); },
  pre: guard,
  input: (G, k) => { const i = fn(k), o = {}; if (ball) { o.mx = i.my || 0; o.my = i.mx || 0; o.sprint = i.sprint; } else Object.assign(o, i); return [IN(o), ZERO]; } }) });
// defensive stances: jockey (strafe both ways, back-pedal), focus, shield (the ball carrier with the jockey key and a man on him), exhaustion
SCENES.push({ name: 'jockey', loco: true, clip: () => true, variants: FT, tail: 0, cap: 3.4, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: false, seed: 20,
  setup(G) { const p = G.players[0], o = G.players[1]; p.x = 60; p.y = 250; p.face = PI / 2; own(G, o, 60, 330, -PI / 2); G.attacker = 1; },
  input: (G, k) => [IN(k < sec(0.3) ? { jockey: true } : k < sec(1.1) ? { jockey: true, mx: 1 } : k < sec(1.9) ? { jockey: true, mx: -1 } : k < sec(2.7) ? { jockey: true, my: -1 } : {}), ZERO] }) });
SCENES.push({ name: 'focus', loco: true, clip: () => true, variants: FT, tail: 0, cap: 3, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: false, seed: 21,
  setup(G) { const p = G.players[0], o = G.players[1]; p.x = 60; p.y = 250; p.face = PI / 2; own(G, o, 90, 330, PI); G.attacker = 1; },
  input: (G, k) => [IN({ focus: k > sec(0.2) }), IN(k < sec(1.2) ? { mx: -0.1, my: 0.45 } : { mx: -0.1, my: -0.45 })] }) });
SCENES.push({ name: 'shield', loco: true, clip: () => true, variants: FT, tail: 0, cap: 2.6, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: false, seed: 22,
  setup(G) { const p = G.players[0], o = G.players[1]; own(G, p, 60, 250, PI / 2); o.x = 60; o.y = 300; o.face = -PI / 2; G.attacker = 0; },
  input: (G, k) => [IN(k < sec(0.3) ? {} : k < sec(1.6) ? { jockey: true, mx: 0.5 } : { my: 1 }), IN({})] }) });
SCENES.push({ name: 'exhausted', loco: true, clip: () => true, variants: FT, tail: 0, cap: 2.6, make: (v) => ({ roster: [defFoot(v.foot), OPPD], solo: true, seed: 23,
  setup(G) { const p = G.players[0]; p.x = 60; p.y = 110; p.face = PI / 2; p.stam = 0; p.exhausted = true; away(G.players[1]); G.ball.x = 20; G.ball.y = 700; },
  input: (G, k) => [IN(k < sec(0.4) ? {} : k < sec(1.5) ? { my: 1 } : {}), ZERO] }) });

// ---- keepers: shots from just outside the box (out of his slide range), chips, a dribbler running in, a slow ball. Which save the sim
// rolls (catch / parry / goal) is random: each variant tries a short fixed list of shots and seeds in a sim-only run and keeps the first
// whose keeper states match the chain under test (deterministic: same code, same pick).
const GK = (name, clip, accept, shots, extra) => SCENES.push(Object.assign({ name, gk: true, clip, accept, variants: [{ side: -1 }, { side: 1 }], tail: 0.6, cap: 4.5,
  cands: (v) => { const o = []; for (const sh of shots(v)) for (let seed = 1; seed <= 6; seed++) o.push(Object.assign({ seed }, sh)); return o; },
  make: (v, c) => {
    let kicked = false;
    return { roster: [defFoot(1), OPPD], solo: true, seed: c.seed,
      setup(G) { const p = G.players[0]; own(G, p, c.x, c.y, Math.atan2(360 - c.y, C.FW - c.x)); away(G.players[1]); },
      pre(G) { const k = G.keeper; if (!kicked && c.noSlide) { k.slideCd = 99; k.rushCd = 99; } if (G.players[0].kickT > 0) kicked = true; },
      input(G, k) { const i = IN({ mx: c.run || 0, my: c.runY || 0, ax: c.ax || C.FW, ay: c.ay }); if (c.key && k >= sec(0.25) && k < sec(0.25 + c.hold)) i[c.key] = true; return [i, ZERO]; } };
  } }, extra || {}));
const gkClip = (k) => !LOCO[k];
const sideAy = (v, near) => (v.side < 0 ? 295 + (near || 0) : 425 - (near || 0));
GK('gk:diveLow', gkClip, /gk:diveLow > gk:ground > gk:set/, (v) => [{ x: 140, y: 360, key: 'shoot', hold: 0.22, ay: sideAy(v) }, { x: 135, y: 330, key: 'shoot', hold: 0.22, ay: sideAy(v) }, { x: 135, y: 390, key: 'finesse', hold: 0.3, ay: sideAy(v) }]);
GK('gk:diveHigh', gkClip, /gk:diveHigh > gk:ground > gk:set/, (v) => [{ x: 140, y: 360, key: 'shoot', hold: 0.33, ay: sideAy(v) }, { x: 135, y: 330, key: 'shoot', hold: 0.42, ay: sideAy(v) }, { x: 135, y: 390, key: 'shoot', hold: 0.38, ay: sideAy(v) }]);
GK('gk:jump', gkClip, /gk:set\+chip > gk:jump > (gk:ground > gk:set|gk:hold > gk:set)/, (v) => [{ x: 140, y: 360, key: 'lob', hold: 0.22, ay: sideAy(v) }, { x: 135, y: 330, key: 'lob', hold: 0.3, ay: sideAy(v) }, { x: 170, y: 360, key: 'lob', hold: 0.25, ay: sideAy(v), noSlide: true }]);
GK('gk:catch', gkClip, /gk:(dive\w+|jump) > gk:hold > gk:set|^gk:set > gk:hold > gk:set/, (v) => [{ x: 140, y: 360, key: 'shoot', hold: 0.22, ay: sideAy(v, 50) }, { x: 140, y: 360, key: 'shoot', hold: 0.3, ay: sideAy(v, 40) }, { x: 140, y: 360, key: 'lob', hold: 0.22, ay: sideAy(v, 30) }]);
GK('gk:slide', gkClip, /gk:slide > (gk:slideDown|gk:hold) > gk:set/, (v) => [{ x: 160, y: 360 + 40 * v.side, run: 1, runY: -0.3 * v.side }, { x: 165, y: 360 + 70 * v.side, run: 1, runY: -0.5 * v.side }]);
GK('gk:claim', gkClip, /^gk:set > gk:hold > gk:set/, (v) => [{ x: 230, y: 360 + 40 * v.side, key: 'pass', hold: 0.02, ay: 360 }], {
  // a ball rolling slowly at him (under 190 px/s: keeperBall claims it): the striker's touch is replaced by a slow loose ball
  make: (v, c) => ({ roster: [defFoot(1), OPPD], solo: true, seed: c.seed,
    setup(G) { const p = G.players[0], b = G.ball; p.x = 120; p.y = 200; away(G.players[1]); b.owner = null; b.x = c.x; b.y = c.y; b.vx = 150; b.vy = -40 * v.side; b.z = 0; b.lastTouch = 0; b.kickT = 1; G.attacker = 0; },
    input: () => [ZERO, ZERO] }) });


// ---------------------------------------------------------------- running a scene: the subject's frames
function chooseCand(sc, v) {
  if (!sc.cands) return null;
  const key = vtag(v);
  if (sc._pick && key in sc._pick) return sc._pick[key];
  const Ad = R3D.Adapter;
  let pick = null;
  for (const c of sc.cands(v)) {      // sim only: the keeper's state sequence for this shot and seed
    const spec = sc.make(v, c), G = ISO.Game.create({ roster: spec.roster, seed: spec.seed, solo: !!spec.solo, kickoff: 0 });
    G.phase = 'play'; G.phaseT = 0; if (spec.setup) spec.setup(G);
    if (Ad.reset) Ad.reset(G);
    const seq = []; let last = null;
    for (let k = 0; k < Math.round(sc.cap / STEP) && G.phase === 'play'; k++) {
      if (spec.pre) spec.pre(G, k, null);
      ISO.Game.step(G, spec.input(G, k, null));
      for (const e of G.events) Ad.onEvent(G, e);
      G.events.length = 0;
      const k2 = keyOf(Ad.snapshot(G, { me: 0 }).keeper, true);
      if (k2 !== last) { seq.push(k2); last = k2; }
    }
    if (sc.accept.test(seq.join(' > '))) { pick = c; break; }
  }
  (sc._pick = sc._pick || {})[key] = pick;
  return pick;
}
function runScene(sc, v, vi, hz) {
  const c = chooseCand(sc, v);
  if (sc.cands && !c) return { error: 'no scripted shot produced ' + sc.accept };
  const spec = sc.make(v, c); spec.subjects = [sc.gk ? 'k' : 0]; spec.staged = true; spec.pin = (vi * 2.399 + 0.7) % TAU;
  const W = World(spec), ac = W.actors[0], P = ac.probe, dt = 1 / hz, en = ender(sc.clip, sc.tail, sc.cap, sc.phase), recs = [], cw = [], kw = kickWatch(), sb = { x: 0, y: 0, z: 0 };
  let stop = false, err = null;
  const nMax = Math.ceil((sc.cap / SPEED) * hz) + 2;
  for (let f = 0; f < nMax && !stop && !err; f++) {
    W.frame(dt, (W, vf, evs) => {
      const pv = sc.gk ? vf.keeper : vf.players[0];
      try { ac.anim.update(pv, dt, W.bv); } catch (e) { err = short(e); return; }
      P.read(dt);
      const key = keyOf(pv, !!sc.gk), m = frameMetrics(P, pv, W.dc), h = P.h;
      const r = { key, t: W.G.t, u: pv.skill ? pv.skill.u : pv.kickT > 0 ? 1 - pv.kickT / (pv.kick && pv.kick.type == null ? 0.25 : 0.3) : fin0(pv.u),
        spd: Array.from(P.spd, (x) => x / h), snap: Array.from(P.snap, (x) => x / h), ang: P.ang, angJ: P.angJoint, low: P.lowest, knee: Math.min(P.kneeL, P.kneeR), elb: Math.min(P.elbL, P.elbR),
        skate: [m.skate[0], m.skate[1]], scrape: [m.scrape[0], m.scrape[1]], carried: [m.carried[0], m.carried[1]], clear: m.clear, rear: m.rear, sep: m.sep, legOv: Math.max(m.bootOv, m.shinOv), legPart: m.bootOv >= m.shinOv ? 'boots' : 'shins',
        ballPen: m.ballPen, penPart: m.penPart, yaw: P.yawRate, pelvisY: m.pelvisY / h, sideways: m.sideways, nan: P.nan, exh: !!pv.exhausted, evs: evs.map((e) => e.type), pos: [P.wld[15], P.wld[16], P.wld[17]] };
      recs.push(r);
      // contact windows: a strike by the subject; a save / claim / block involving him
      for (const e of evs) {
        let type = null;
        if (!sc.gk && e.type === 'kick' && e.p === W.G.players[0]) type = 'kick';
        else if (sc.gk && (e.type === 'save' || e.type === 'claim')) type = e.catch || e.type === 'claim' || e.smother ? 'catch' : 'parry';
        else if (!sc.gk && e.type === 'block' && e.p === W.G.players[0]) type = 'parry';
        if (type === 'kick' && pv.kick && pv.kick.owned) { const b = vf.ball; sb.x = b.x; sb.y = drawH(b.y) + BR; sb.z = b.z; kw.start(ac, pv, pv.kick.foot || ac.foot || 1, W.dc, sb, key); }
        if (type) cw.push({ type, n: Math.round(0.15 * hz), min: 1e9, at: '', head: !!(pv.kick && pv.kick.high), side: pv.kick && pv.kick.foot ? pv.kick.foot : ac.foot || 1, cx: W.dc.x, cy: W.dc.y, cz: W.dc.z });
      }
      for (const w of cw) if (w.n-- > 0) {
        const g = w.type === 'kick' ? (w.head ? pointGap(ac, 'head', 0.12, 0.13, w.cx, w.cy, w.cz) : bootGap(ac, w.side, w.cx, w.cy, w.cz)) : w.type === 'catch' ? gloveGap(ac, W.dc.x, W.dc.y, W.dc.z) : bodyGap(ac, W.dc.x, W.dc.y, W.dc.z);
        if (g < w.min) { w.min = g; w.at = key + ' +' + Math.round(((Math.round(0.15 * hz) - w.n) * 1000) / hz) + 'ms'; }
      }
      { const b = vf.ball; sb.x = b.x; sb.y = drawH(b.y) + BR; sb.z = b.z; kw.frame(W.dc, sb, () => pv, !!(W.ball && W.ball.kickWindow), hz); }
      stop = en.done(W, key);
    });
  }
  if (W.ballErr) err = err || 'ball3d: ' + W.ballErr;
  return { recs, err, contacts: cw, cand: c, kicks: kw.done };
}
// ---------------------------------------------------------------- one scene variant's frames -> the measures (worst value + where)
const REF = { pelvis: 0.81 };      // the subject's steady-sprint pelvis low (x h), measured at the start of section A
function measure(sc, R, hz) {
  const recs = R.recs, n = recs.length, dt = 1 / hz;
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) if (sc.clip(recs[i].key)) { if (first < 0) first = i; last = i; }
  const M = { spd: [0, 0, 0, 0], spdAt: ['', '', '', ''], snap: [0, 0, 0, 0], snapAt: ['', '', '', ''], joint: 0, jointAt: '', low: 1e9, lowAt: '', knee: 1e9, kneeAt: '', elbow: 1e9, nan: 0,
    drop: -1, dropAt: '', rear: 0, rearAt: '', skate: 0, skateAt: '', skPeak: 0, skPeakAt: '', scrape: 0, scrapeAt: '', air: 0, airAt: '', airT: 0, airTAt: '', airHi: 0, airHiAt: '',
    carried: 0, carriedAt: '', kdGap: null, kdFwd: null, kdWrong: 0, kdOver: 0, kdOverMax: 0, legOv: -1, legOvAt: '', width: 0, widthAt: '', pen: -1, penAt: '', gkHand: 0, gkHandAt: '', yaw: 0, yawAt: '', contact: {}, frames: 0, first, worst: -1, worstR: 0 };
  if (first < 0) return Object.assign(M, { missing: true });
  const i0 = sc.loco ? Math.round(0.3 * hz) : Math.max(0, first - Math.round(0.15 * hz));
  let exitI = -1;
  for (let i = last + 1; i < n; i++) if (isLoco(recs[i].key)) { exitI = i; break; }
  const at = (i) => { const r = recs[i]; if (sc.loco) return r.key + ' t=' + r.t.toFixed(2); if (i < first) return 'pre'; if (exitI >= 0 && i >= exitI) return 'out+' + Math.round(((i - exitI) * 1000) / hz) + 'ms'; return r.key + ' u=' + r.u.toFixed(2); };
  const use = { sk: [0, 0], sc: [0, 0], car: [0, 0], key: null }, air = { on: false, t: 0, clr: 0, at: '', ok: false };
  const closeAir = () => {
    if (!air.on) return;
    if (air.gk) { /* keeper dive / leap */ }
    else if (air.ok) { if (air.clr > M.airHi) { M.airHi = air.clr; M.airHiAt = air.at; } }
    else {
      if (air.clr > M.air) { M.air = air.clr; M.airAt = air.at + ' (' + Math.round(air.t * 1000) + ' ms)'; }
      if (air.t > M.airT) { M.airT = air.t; M.airTAt = air.at + ' (' + Math.round(air.clr * 100) + ' cm)'; }
    }
    air.on = false;
  };
  for (let i = i0; i < n; i++) {
    const r = recs[i], pre = !sc.loco && i < first, key = r.key;
    M.frames++;
    if (r.nan) M.nan++;
    for (let e = 0; e < 6; e++) {
      const k = e < 2 ? 0 : e < 4 ? 1 : e - 2, kind = KINDS[k];
      if (r.spd[e] > M.spd[k]) { M.spd[k] = r.spd[e]; M.spdAt[k] = EFF[e] + ' ' + at(i); }
      if (r.snap[e] > M.snap[k]) { M.snap[k] = r.snap[e]; M.snapAt[k] = EFF[e] + ' ' + at(i); }
      const q = Math.max(r.spd[e] / TH.spd[kind], r.snap[e] / TH.snap[kind]);
      if (q > M.worstR) { M.worstR = q; M.worst = i; }
    }
    const jd = (r.ang / dt / 60) * 180 / PI;
    if (jd > M.joint) { M.joint = jd; M.jointAt = r.angJ + ' ' + at(i); }
    if (r.low < M.low) { M.low = r.low; M.lowAt = at(i); }
    if (r.yaw > M.yaw) { M.yaw = r.yaw; M.yawAt = at(i); }
    if (r.knee < M.knee) { M.knee = r.knee; M.kneeAt = at(i); }
    M.elbow = Math.min(M.elbow, r.elb);
    if (pre) continue;
    if (PLAIN[key] && !r.exh && REF.pelvis - r.pelvisY > M.drop) { M.drop = REF.pelvis - r.pelvisY; M.dropAt = at(i) + ' (pelvis ' + r.pelvisY.toFixed(2) + ' h, knee ' + r.knee.toFixed(2) + ')'; }
    if (isLoco(key) && r.rear > M.rear) { M.rear = r.rear; M.rearAt = at(i); }
    // planted boots over the turf, per clip use (a use = the run of frames of one key)
    if (key !== use.key) { use.sk[0] = use.sk[1] = use.sc[0] = use.sc[1] = use.car[0] = use.car[1] = 0; use.key = key; }
    if (key.indexOf('skill:') === 0) for (let s = 0; s < 2; s++) { use.car[s] += r.carried[s]; if (use.car[s] > M.carried) { M.carried = use.car[s]; M.carriedAt = (s ? 'R' : 'L') + ' boot, ' + key + ' to u=' + r.u.toFixed(2); } }
    if (!SLIDES[key] && (sc.loco || !isLoco(key))) for (let s = 0; s < 2; s++) {      // locomotion scenes (starts, stops, cuts): the gait's own feet too
      use.sk[s] += r.skate[s]; use.sc[s] += r.scrape[s];
      if (use.sk[s] > M.skate) { M.skate = use.sk[s]; M.skateAt = (s ? 'R' : 'L') + ' boot, ' + key + ' to u=' + r.u.toFixed(2); }
      if (r.skate[s] / dt > M.skPeak) { M.skPeak = r.skate[s] / dt; M.skPeakAt = (s ? 'R ' : 'L ') + at(i); }
      if (use.sc[s] > M.scrape) { M.scrape = use.sc[s]; M.scrapeAt = (s ? 'R' : 'L') + ' boot, ' + key + ' to u=' + r.u.toFixed(2); }
    }
    if (r.clear > 0.03) { if (!air.on) { air.on = true; air.t = 0; air.clr = 0; air.ok = false; air.gk = false; air.at = at(i); } air.t += dt; if (AIR_OK[key]) air.ok = true; if (AIR_GK[key]) air.gk = true; if (r.clear > air.clr) air.clr = r.clear; } else closeAir();
    if (r.legOv > M.legOv) { M.legOv = r.legOv; M.legOvAt = r.legPart + ' ' + at(i); }
    if (r.sideways && isLoco(key) && r.sep > M.width) { M.width = r.sep; M.widthAt = at(i); }
    if (r.ballPen > M.pen) { M.pen = r.ballPen; M.penAt = r.penPart + ' ' + at(i); }
    if (GKSET[key]) { const hj = Math.max(r.spd[2], r.spd[3]) / 60; if (hj > M.gkHand) { M.gkHand = hj; M.gkHandAt = at(i); } }
  }
  closeAir();
  for (const c of R.contacts) if (!M.contact[c.type] || c.min > M.contact[c.type].v) M.contact[c.type] = { v: c.min, at: c.at };
  for (const k of R.kicks || []) {
    if (k.gap != null && (M.kdGap == null || k.gap > M.kdGap)) { M.kdGap = k.gap; M.kdGapAt = k.at; }
    if (k.fwd != null && (M.kdFwd == null || k.fwd < M.kdFwd)) M.kdFwd = k.fwd;
    M.kdWrong = Math.max(M.kdWrong, k.wrong); M.kdOver = Math.max(M.kdOver, k.over); M.kdOverMax = Math.max(M.kdOverMax, k.overMax);
  }
  if (M.kdFwd != null) M.kdBehind = M.kdFwd < 0 ? 1 : 0;
  return M;
}
const STEPPED = (k) => k.indexOf('kick:') === 0 || k === 'fake' || k === 'charge';
function peakSmooth(sc, R, hz) {
  const recs = R.recs, first = recs.findIndex((r) => sc.clip(r.key)), i0 = sc.loco ? Math.round(0.3 * hz) : Math.max(0, first - Math.round(0.15 * hz)), pk = [0, 0, 0, 0];
  for (let i = Math.max(0, i0); i < recs.length; i++) { if (STEPPED(recs[i].key) || (i > 0 && STEPPED(recs[i - 1].key))) continue; for (let e = 0; e < 6; e++) { const k = e < 2 ? 0 : e < 4 ? 1 : e - 2; if (recs[i].spd[e] > pk[k]) pk[k] = recs[i].spd[e]; } }
  return pk;
}
// share of a clip's display frames (at 144 Hz) on which its clock did not move: a clock interpolated to the display never repeats
function frozenShare(sc, R) {
  let n = 0, z = 0;
  for (let i = 1; i < R.recs.length; i++) { const r = R.recs[i], q = R.recs[i - 1]; if (!sc.clip(r.key) || isLoco(r.key) || r.key !== q.key || r.u < 0.02 || r.u > 0.98) continue; n++; if (r.u === q.u) z++; }
  return n > 4 ? z / n : 0;
}
// ---------------------------------------------------------------- raw target continuity (lab clips via samplePV): the clip clock moves, time (almost) does not
function synthBall(name, pv, keeper, foot, bv) {
  const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw);
  if (keeper) { const s = pv.diveDir || 1; bv.x = pv.x + (pv.state === 'dive' ? s * 2.4 : 0); bv.y = pv.high ? 1.9 : pv.state === 'dive' ? 0.3 : 0.9; bv.z = pv.z + 0.9; }
  else { bv.x = pv.x + fx * 0.45 - fz * 0.12 * foot; bv.z = pv.z + fz * 0.45 + fx * 0.12 * foot; bv.y = name === 'header' ? 1.65 : name === 'volley' ? 0.55 : 0; }
  bv.vx = bv.vy = bv.vz = 0; bv.r = BR; bv.owner = pv.owner ? 0 : -1; bv.held = !!pv.holding;
  return bv;
}
function targetPop(name, o) {
  const A = R3D.Anim, keeper = name.indexOf('gk:') === 0, actor = mkActor(keeper, o.foot, null, 0.7), anim = actor.anim;
  if (!anim.target || !anim.target.length) return null;
  const bv = {}, T = anim.target, prev = new Float32Array(T.length), CHN = (A.CH && Object.keys(A.CH).sort((a, b) => A.CH[a] - A.CH[b])) || [];
  const chName = (i) => { let nm = '' + i; for (const k of CHN) if (A.CH[k] <= i) nm = k + (i > A.CH[k] ? '+' + (i - A.CH[k]) : ''); return nm; };
  let pv = null, best = 0, at = '';
  const opts = { sd: o.sd, foot: o.foot }, t0 = 0.37;
  // a lab view has no live sim object; clips-keeper.js then eases on wall-clock time: a fixed sim clock keeps this deterministic
  const fake = { stT: t0, antic: 0 }, sv = (q) => { if (keeper && !q.sim) q.sim = fake; return q; };
  for (let i = 0; i < 12; i++) { pv = sv(A.samplePV(name, 0, t0, pv, opts)); synthBall(name, pv, keeper, o.foot, bv); anim.update(pv, 1 / 60, bv); }
  prev.set(T);
  for (let i = 1; i <= 1000; i++) {
    const u = i / 1000;
    pv = sv(A.samplePV(name, u, t0, pv, opts)); synthBall(name, pv, keeper, o.foot, bv);
    anim.update(pv, 1e-5, bv);
    for (let c = 0; c < T.length; c++) { const d = Math.abs(T[c] - prev[c]); if (d > best) { best = d; at = chName(c) + ' u=' + u.toFixed(3); } prev[c] = T[c]; }
  }
  return { step: best, at };
}

// ---------------------------------------------------------------- section A
const OWNED_KICK = { shoot: 1, power: 1, finesse: 1, chip: 1, cross: 1, pass: 1 };
function sectionA() {
  const res = { scenes: {}, tpop: {} };
  // reference pelvis low: the subject sprinting at his own top speed (synthetic, section B's runner)
  { const sim = ISO.Game.create({ roster: [SUBJ, OPPD], seed: 1 }).players[0], ac = mkActor(false, 1, SUBJ, 0.7);
    const R = gaitRun({ actor: ac, hz: 60, secs: 2.5, warm: 1, jog: sim.jog * S, top: sim.top * S, fn: () => ({ sp: sim.top * S, dir: 0, face: 0, sprint: true }) });
    let m = 1e9; for (const r of R) m = Math.min(m, r.pelvisY); if (m < 1e8) REF.pelvis = m; res.refPelvis = r3(REF.pelvis); }
  const list = SCENES.filter((s) => !CLIP_F || s.name.indexOf(CLIP_F) >= 0);
  for (const sc of list) {
    const row = { variants: [], flags: [], score: 0, worst: null };
    sc.variants.forEach((v, vi) => {
      const V = { v: vtag(v) };
      try {
        const R60 = runScene(sc, v, vi, 60);
        if (R60.error || R60.err) { V.error = R60.error || R60.err; row.error = row.error || V.error; row.variants.push(V); return; }
        const M = measure(sc, R60, 60);
        if (M.missing) { V.error = 'the scene never reached its clip (' + sc.name + ')'; row.error = row.error || V.error; row.variants.push(V); return; }
        const R144 = runScene(sc, v, vi, 144), M144 = measure(sc, R144, 144);
        // rate: peak speeds at 144 vs 60 Hz over the frames whose clocks js/smooth.js interpolates (a kick / fake / charge clock steps at
        // the sim's 72 Hz: judged apart, as 'clock')
        const p60 = peakSmooth(sc, R60, 60), p144 = peakSmooth(sc, R144, 144);
        M.ratio = 0; for (let k = 0; k < 4; k++) if (p60[k] > 2) M.ratio = Math.max(M.ratio, p144[k] / p60[k]);
        M.clock = frozenShare(sc, R144);
        M.low = Math.min(M.low, M144.low); M.knee = Math.min(M.knee, M144.knee); M.elbow = Math.min(M.elbow, M144.elbow); M.nan += M144.nan;
        V.M = M; V.recs = TRACE && sc.name === TRACE ? R60.recs : null; V.cand = R60.cand;
      } catch (e) { V.error = short(e); row.error = row.error || V.error; }
      row.variants.push(V);
    });
    if (row.error) { out.errors.push('A ' + sc.name + ': ' + row.error); row.flags.push('ERR'); row.score = 99; res.scenes[sc.name] = row; continue; }
    // worst over variants, each measure keeping the variant tag in its "where"
    const W = { spd: [0, 0, 0, 0], snap: [0, 0, 0, 0], spdAt: [], snapAt: [], contact: {} };
    const take = (k, v, M, lo) => { const val = M[k]; if (W[k] === undefined || (lo ? val < W[k] : val > W[k])) { W[k] = val; W[k + 'At'] = (M[k + 'At'] || '') + ' ' + v.v; } };
    for (const V of row.variants) {
      const M = V.M;
      for (let k = 0; k < 4; k++) { if (M.spd[k] > W.spd[k]) { W.spd[k] = M.spd[k]; W.spdAt[k] = M.spdAt[k] + ' ' + V.v; } if (M.snap[k] > W.snap[k]) { W.snap[k] = M.snap[k]; W.snapAt[k] = M.snapAt[k] + ' ' + V.v; } }
      for (const k of ['joint', 'drop', 'rear', 'skate', 'skPeak', 'scrape', 'air', 'airT', 'airHi', 'legOv', 'width', 'pen', 'gkHand', 'yaw', 'ratio', 'clock', 'carried', 'kdGap', 'kdBehind', 'kdWrong', 'kdOver', 'kdOverMax', 'nan']) take(k, V, M);
      for (const k of ['low', 'knee', 'elbow']) take(k, V, M, true);
      for (const t in M.contact) if (!W.contact[t] || M.contact[t].v > W.contact[t].v) W.contact[t] = { v: M.contact[t].v, at: M.contact[t].at + ' ' + V.v };
      if (!row.worst || M.worstR > row.worst.M.worstR) row.worst = V;
    }
    const F = [];
    const chk = (code, val, lim, lo) => { if (val == null) return; const r = lo ? (val < lim ? 1 + (lim - val) * 10 : 0) : val / lim; if (r > row.score) row.score = r; if (lo ? val < lim : val > lim) { F.push(code); fail('A', sc.name + ' ' + code, val, lim); } };
    for (let k = 0; k < 4; k++) { chk('spd:' + KINDS[k], W.spd[k], TH.spd[KINDS[k]]); chk('snap:' + KINDS[k], W.snap[k], TH.snap[KINDS[k]]); }
    chk('jnt', W.joint, TH.jointDeg); chk('rate', W.ratio, TH.rateRatio); chk('yaw', W.yaw, TH.yawRate); chk('clock', W.clock, TH.clockFrozen);
    chk('low', W.low, TH.low, true); chk('knee', W.knee, TH.knee, true); chk('elbow', W.elbow, TH.elbow, true);
    chk('lunge', W.drop, TH.lungeDrop); chk('rear', W.rear, TH.rearReach);
    chk('skate', W.skate, TH.clipSkate); chk('skatePeak', W.skPeak, TH.clipSkatePeak); chk('scrape', W.scrape, TH.clipScrape);
    chk('air', W.air, TH.airClear); chk('airtime', W.airT, TH.airTime); chk('airHigh', W.airHi, TH.airHigh);
    chk('legs', W.legOv, TH.legOverlap); chk('width', W.width, TH.sideWidth); chk('ball', W.pen, TH.ballPen); chk('gkHand', W.gkHand, TH.gkSetHand);
    if (W.contact.kick) chk('contact:kick', W.contact.kick.v, TH.kickContact);
    if (W.contact.catch) chk('contact:catch', W.contact.catch.v, TH.catchContact);
    if (W.contact.parry) chk('contact:parry', W.contact.parry.v, TH.parryContact);
    chk('carried', W.carried, TH.carriedSlide);
    if (W.kdGap != null) { chk('kickBall', W.kdGap, TH.kickDrawnMax); chk('kickBehind', W.kdBehind, TH.kickBehind); chk('kickBack', W.kdWrong, TH.kickWrongWay); chk('kickFast', W.kdOver, TH.kickOverspeed); }
    else if (OWNED_KICK[sc.name]) { F.push('kickBall'); fail('A', sc.name + ' kickBall (the drawn ball never left)', 1, 0); }
    if (W.nan) { F.push('NaN'); row.score = 99; fail('A', sc.name + ' NaN', W.nan, 0); }
    row.W = W; row.flags = F;
    res.scenes[sc.name] = row;
  }
  // A2: the lab clips' raw target continuity
  const A = R3D.Anim, names = (A.CLIPS || []).concat(A.GK_CLIPS || []).filter((n) => !CLIP_F || n.indexOf(CLIP_F) >= 0);
  for (const name of names) {
    let w = null;
    for (const o of name.indexOf('skill:') === 0 ? [{ sd: 1, foot: 1 }, { sd: -1, foot: 1 }, { sd: 1, foot: -1 }, { sd: -1, foot: -1 }] : [{ sd: 1, foot: 1 }, { sd: -1, foot: -1 }]) {
      try { const t = targetPop(name, o); if (t && (!w || t.step > w.step)) w = Object.assign({ v: vtag(o) }, t); } catch (e) { out.errors.push('A2 ' + name + ': ' + short(e)); }
    }
    if (w) { res.tpop[name] = w; if (w.step > TH.tpop) fail('A', name + ' tpop', w.step, TH.tpop); }
  }
  return res;
}
const cm = (v) => (v == null || v < -0.5 ? '-' : (v * 100).toFixed(0));
function printA(res) {
  say('A. CLIPS IN THE GAME   scripted scenes through the real sim, 60 Hz (+144 Hz for the rate test), worst variant. Speeds per unit rig height h.');
  say('   limits: spd foot ' + TH.spd.foot + ' hand ' + TH.spd.hand + ' head ' + TH.spd.head + ' pelvis ' + TH.spd.pelvis + ' m/s | snap ' + TH.snap.foot + '/' + TH.snap.hand + '/' + TH.snap.head + '/' + TH.snap.pelvis + ' m/s per 1/60 s | jnt ' + TH.jointDeg +
    ' deg/frame | 144/60 ' + TH.rateRatio + ' | lunge ' + TH.lungeDrop + ' h below the sprint low (' + res.refPelvis + ' h) | rear ' + TH.rearReach + ' h | skate ' + TH.clipSkate * 100 + ' cm, ' + TH.clipSkatePeak + ' m/s | scrape ' + TH.clipScrape * 100 + ' cm');
  say('           air ' + TH.airClear * 100 + ' cm / ' + TH.airTime * 1000 + ' ms (jumps by design ' + TH.airHigh * 100 + ' cm) | legs ' + TH.legOverlap * 100 + ' cm | width ' + TH.sideWidth + ' h | ball in boot ' + TH.ballPen * 100 + ' cm | keeper set hand ' + TH.gkSetHand * 100 + ' cm/frame | contact kick ' + TH.kickContact * 100 + ', catch ' + TH.catchContact * 100 + ', parry/block ' + TH.parryContact * 100 + ' cm');
  const names = Object.keys(res.scenes).sort((a, b) => res.scenes[b].score - res.scenes[a].score);
  const rows = [];
  for (const n of names) {
    const c = res.scenes[n], W = c.W;
    if (!ALL && rows.length >= TOP) break;
    if (c.error) { rows.push([n, 'ERROR', '', '', '', '', '', '', '', '', '', '', '', 'ERR ' + c.error]); continue; }
    const ct = Object.keys(W.contact).map((k) => k[0] + (W.contact[k].v * 100).toFixed(0)).join(' ') + (W.kdGap != null ? ' d' + cm(W.kdGap) : '');
    rows.push([n, W.spd.map((v) => v.toFixed(1)).join('/'), W.snap.map((v) => v.toFixed(1)).join('/'), W.joint.toFixed(0), W.ratio.toFixed(2), cm(W.drop) + '/' + W.rear.toFixed(2), cm(W.skate) + '/' + W.skPeak.toFixed(1) + '/' + cm(W.scrape) + (W.carried > 0.005 ? '/' + cm(W.carried) : ''),
      cm(W.air) + '/' + Math.round(W.airT * 1000) + (W.airHi > 0 ? '/' + cm(W.airHi) : ''), cm(W.legOv) + '/' + W.width.toFixed(2), cm(W.pen), cm(W.gkHand), ct || '-', (c.flags.length ? 'FAIL ' + compact(c.flags) : 'ok')]);
  }
  table(['scene', 'spd f/h/hd/p', 'snap f/h/hd/p', 'jnt', '144/60', 'lunge/rear', 'skt/pk/scr/car', 'air cm/ms', 'legs/wid', 'ball', 'gkH', 'contact cm', ' verdict'], rows, [15, 19, 19, 4, 6, 10, 15, 11, 9, 5, 4, 14, 0]);
  const bad = names.filter((n) => res.scenes[n].flags.length && !res.scenes[n].error);
  say('   ' + bad.length + ' of ' + names.length + ' scenes over a limit' + (ALL || names.length <= TOP ? '' : ' (worst ' + TOP + ' shown; --all for every row)'));
  const WHERE = { 'spd': (W, k) => W.spdAt[k], 'snap': (W, k) => W.snapAt[k] };
  const AT = { jnt: 'jointAt', rate: null, clock: null, yaw: 'yawAt', carried: 'carriedAt', kickBall: 'kdGapAt', kickBehind: null, kickBack: null, kickFast: null, low: 'lowAt', knee: 'kneeAt', lunge: 'dropAt', rear: 'rearAt', skate: 'skateAt', skatePeak: 'skPeakAt', scrape: 'scrapeAt', air: 'airAt', airtime: 'airTAt', airHigh: 'airHiAt', legs: 'legOvAt', width: 'widthAt', ball: 'penAt', gkHand: 'gkHandAt' };
  if (bad.length) say('   where (u = the clip clock, out+ms = after he is back in locomotion, (sd/foot/run/side) = the variant):');
  for (const n of bad.slice(0, ALL ? 999 : TOP)) {
    const c = res.scenes[n], W = c.W, parts = [];
    for (const f of c.flags) {
      const [a, b] = f.split(':');
      if (a === 'spd' || a === 'snap') { const k = KINDS.indexOf(b); parts.push(f + ' ' + (a === 'spd' ? W.spd[k] : W.snap[k]).toFixed(1) + ' @ ' + WHERE[a](W, k)); }
      else if (a === 'contact') parts.push(f + ' ' + (W.contact[b].v * 100).toFixed(0) + ' cm @ ' + W.contact[b].at);
      else if (a === 'kickBall') parts.push(f + ' boot ' + cm(W.kdGap) + ' cm from the drawn ball when it starts to move @ ' + W.kdGapAt);
      else if (a === 'kickBehind') parts.push(f + ' the drawn ball leaves ' + cm(-W.kdFwd) + ' cm behind his hips');
      else if (a === 'kickBack') parts.push(f + ' ' + W.kdWrong + ' drawn-ball frame steps against the flight');
      else if (a === 'kickFast') parts.push(f + ' ' + W.kdOver + ' frames above 1.6x the sim ball (worst ' + fin0(W.kdOverMax).toFixed(1) + 'x)');
      else if (AT[a] !== undefined) parts.push(f + (AT[a] ? ' @ ' + W[AT[a]] : a === 'clock' ? ' ' + Math.round(W.clock * 100) + '% of its 144 Hz frames repeat the clip clock (kickT / fakeT / charge.t are not interpolated by js/smooth.js)' : ' ' + W.ratio.toFixed(2)));
      else parts.push(f);
    }
    say('     ' + pad(n, 15) + ' ' + parts.join('\n                     '));
  }
  // tpop
  const tp = Object.keys(res.tpop).sort((a, b) => res.tpop[b].step - res.tpop[a].step), tb = tp.filter((k) => res.tpop[k].step > TH.tpop);
  say('   A2. raw target continuity (tpop, rad per 0.001 of clip clock, limit ' + TH.tpop + '): ' + tb.length + ' of ' + tp.length + ' lab clips over' + (tb.length ? ': ' + tb.map((k) => k + ' ' + res.tpop[k].step.toFixed(3) + ' @ ' + res.tpop[k].at + ' ' + res.tpop[k].v).join(', ') : '') +
    (ALL ? '\n      ' + tp.map((k) => k + ' ' + res.tpop[k].step.toFixed(3)).join(', ') : '   (worst ' + (tp[0] ? tp[0] + ' ' + res.tpop[tp[0]].step.toFixed(3) : '-') + ')'));
  if (TRACE && res.scenes[TRACE]) {
    const V = res.scenes[TRACE].worst;
    if (V && V.recs && V.M.worst >= 0) {
      say('   trace of ' + TRACE + ' ' + V.v + ' around its worst limb frame (speeds m/s per h, foot L R / hand L R / head / pelvis):');
      for (let i = Math.max(0, V.M.worst - 6); i <= Math.min(V.recs.length - 1, V.M.worst + 5); i++) {
        const r = V.recs[i];
        say('     ' + (i === V.M.worst ? '>' : ' ') + 't=' + r.t.toFixed(3) + ' ' + pad(r.key, 15) + ' u ' + r.u.toFixed(2) + ' spd ' + r.spd.map((x) => x.toFixed(1)).join(' ') + ' | snap ' + r.snap.map((x) => x.toFixed(1)).join(' ') + ' | seg ' + ((r.ang * 180) / PI).toFixed(0) + ' ' + r.angJ +
          ' | pelvis ' + r.pelvisY.toFixed(2) + ' h, clear ' + (r.clear * 100).toFixed(0) + ' cm, ball ' + cm(r.ballPen) + ' ' + r.evs.join(','));
      }
    }
  }
}

// ================================================================ B. steady gaits at the subject's own sim speeds (synthetic pv, no sim)
// jog / top are the subject's (sim jog / top x S); the defensive gaits at the speeds the sim gives them (jockey 0.92 jog, focus up to 0.85 top).
// Starts, stops and cuts are scenes of section A (the sim's own velocity response).
function gaitRun(o) {
  const A = R3D.Anim, actor = o.actor, anim = actor.anim, P = actor.probe; anim.reset(); P.reset();
  const hz = o.hz, dt = 1 / hz, dts = dt * SPEED, n = Math.round(o.secs * hz), warm = Math.round(o.warm * hz), jog = o.jog, top = o.top, STRIDE_M = (C.STRIDE || 44) * S;
  let pv = null, x = 0, z = 0, ph = 0, pY = 0, pVy = 0;
  const recs = [], bv = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: BR, owner: 0, held: false };
  for (let f = 0; f < n; f++) {
    const s = o.fn(f * dt), vx = Math.sin(s.dir) * s.sp, vz = Math.cos(s.dir) * s.sp;
    pv = A.samplePV('idle', 0, 0, pv);
    pv.jog = jog; pv.top = top; pv.speed = s.sp; pv.vx = vx; pv.vz = vz; pv.yaw = s.face; pv.sprint = !!s.sprint; pv.jock = !!s.jock; pv.focus = !!s.focus; pv.owner = !!s.owner;
    const dph = ((s.sp * dts) / (STRIDE_M * STRIDE_F * (1 + 0.3 * Math.min(1, s.sp / top)))) * TAU;      // --stride f: the sim's per-player stride factor (ms.stride, 0.9-1.12) scales the phase
    pv.stride = STRIDE_F;
    ph += dph; pv.runPh = ph; x += vx * dts; z += vz * dts; pv.x = x; pv.z = z;
    // a dribbled ball beside the strong foot, 0.3 m ahead (ball3d's owned-ball mapping puts it about there at a jog)
    if (s.owner) { bv.x = x + Math.sin(s.face) * 0.3 - Math.cos(s.face) * 0.3; bv.z = z + Math.cos(s.face) * 0.3 + Math.sin(s.face) * 0.3; }
    anim.update(pv, dt, s.owner ? bv : null);
    P.read(dt);
    const m = frameMetrics(P, pv, null), y = P.wld[16], vy = (y - pY) / dt;
    if (f >= warm) recs.push({ t: f * dt, sp: s.sp, dph, spd: Array.from(P.spd, (q) => q / P.h), snap: Array.from(P.snap, (q) => q / P.h), clear: m.clear, pelvisY: m.pelvisY / P.h, rear: m.rear, sep: m.sep,
      legOv: Math.max(m.bootOv, m.shinOv), sideways: m.sideways, skate: [m.skate[0], m.skate[1]], scrape: [m.scrape[0], m.scrape[1]], low: P.lowest, nan: P.nan, vy: Math.abs(vy), vys: f > warm ? Math.abs(vy - pVy) / (dt * 60) : 0, ang: P.ang });
    pY = y; pVy = vy;
  }
  return recs;
}
function sectionB() {
  const sim = ISO.Game.create({ roster: [SUBJ, OPPD], seed: 1 }).players[0], jog = sim.jog * S, top = sim.top * S;
  const hold = (sp, dir, o) => () => Object.assign({ sp, dir, face: 0 }, o || {});
  const SC = [['walk', hold(jog * 0.35, 0)], ['jog', hold(jog, 0)], ['sprint', hold(top, 0, { sprint: 1 })], ['dribble', hold(jog * 0.95, 0, { owner: 1 })],
    ['backpedal', hold(jog * 0.92, PI, { jock: 1 })], ['strafeL', hold(jog * 0.92, PI / 2, { jock: 1 })], ['strafeR', hold(jog * 0.92, -PI / 2, { jock: 1 })], ['focus shuffle', hold(top * 0.75, -PI / 2, { jock: 1, focus: 1 })]];
  const res = { scenarios: {}, jog: r2(jog), top: r2(top) };
  const actor = mkActor(false, 1, SUBJ, 0.7);
  for (const [name, fn] of SC) {
    const row = { flags: [] };
    try {
      for (const hz of [60, 144]) {
        const R = gaitRun({ actor, hz, secs: 3, warm: 0.8, jog, top, fn }), dt = 1 / hz;
        let skate = 0, scrape = 0, dist = 0, phase = 0, peak = 0, fl = 0, flMax = 0, clr = 0, vy = 0, vys = 0, low = 1e9, leg = -1, wid = 0, nan = 0;
        for (const r of R) {
          dist += r.sp * dt * SPEED; phase += r.dph; if (r.nan) nan++;
          for (let s = 0; s < 2; s++) { skate += r.skate[s]; scrape += r.scrape[s]; if (r.skate[s] / dt > peak) peak = r.skate[s] / dt; }
          if (r.clear > 0.03) { fl += dt; if (fl > flMax) flMax = fl; if (r.clear > clr) clr = r.clear; } else fl = 0;
          vy = Math.max(vy, r.vy); vys = Math.max(vys, r.vys); low = Math.min(low, r.low); leg = Math.max(leg, r.legOv); if (r.sideways) wid = Math.max(wid, r.sep);
        }
        row['hz' + hz] = { slipPct: dist > 0.01 ? (100 * skate) / dist : 0, scrapePerStride: phase > 0.1 ? scrape / (phase / TAU) : 0, skatePeak: peak, flight: flMax, flightClear: clr, pelvisVy: vy, pelvisSnap: vys, low, legOv: leg, width: wid, nan };
      }
      const w = (k, lo) => (lo ? Math.min(row.hz60[k], row.hz144[k]) : Math.max(row.hz60[k], row.hz144[k]));
      const chk = (code, v, lim, lo) => { if (lo ? v < lim : v > lim) { row.flags.push(code); fail('B', name + ' ' + code, v, lim); } };
      chk('slip', w('slipPct'), TH.slipPct); chk('peak', w('skatePeak'), TH.skatePeak); chk('scrape', w('scrapePerStride'), TH.scrape); chk('air', w('flightClear'), TH.airClear); chk('airtime', w('flight'), TH.airTime);
      chk('pelvisVy', w('pelvisVy'), TH.pelvisVy); chk('pelvisSnap', w('pelvisSnap'), TH.pelvisSnap); chk('low', w('low', true), TH.low, true); chk('legs', w('legOv'), TH.legOverlap); chk('width', w('width'), TH.sideWidth);
      if (w('nan')) { row.flags.push('NaN'); fail('B', name + ' NaN', w('nan'), 0); }
    } catch (e) { row.error = short(e); out.errors.push('B ' + name + ': ' + row.error); }
    res.scenarios[name] = row;
  }
  return res;
}
function printB(res) {
  say('B. STEADY GAITS at the subject\'s sim speeds (jog ' + res.jog + ', top ' + res.top + ' m per sim s = ' + r2(res.jog * SPEED) + ' / ' + r2(res.top * SPEED) + ' m/s on screen), worst of 60 / 144 Hz.');
  say('   limits: slip ' + TH.slipPct + '% | skate peak ' + TH.skatePeak + ' m/s | scrape ' + TH.scrape * 100 + ' cm/stride | flight ' + TH.airClear * 100 + ' cm / ' + TH.airTime * 1000 + ' ms | pelvis vy ' + TH.pelvisVy + ' m/s, snap ' + TH.pelvisSnap + ' | legs ' + TH.legOverlap * 100 + ' cm | width ' + TH.sideWidth + ' h');
  const rows = [];
  for (const n in res.scenarios) {
    const r = res.scenarios[n];
    if (r.error) { rows.push([n, '', '', '', '', '', '', '', '', '', 'ERR ' + r.error]); continue; }
    const w = (k) => Math.max(r.hz60[k], r.hz144[k]);
    rows.push([n, w('slipPct').toFixed(1), w('skatePeak').toFixed(2), (w('scrapePerStride') * 100).toFixed(1), (w('flightClear') * 100).toFixed(0) + '/' + Math.round(w('flight') * 1000), w('pelvisVy').toFixed(2), w('pelvisSnap').toFixed(2),
      (w('legOv') * 100).toFixed(0), w('width').toFixed(2), Math.min(r.hz60.low, r.hz144.low).toFixed(3), r.flags.length ? 'FAIL ' + r.flags.join(',') : 'ok']);
  }
  table(['gait', 'slip%', 'peak m/s', 'scrape', 'flight', 'pelv vy', 'pelv snap', 'legs', 'width', 'low', ' verdict'], rows, [14, 6, 8, 6, 8, 8, 9, 5, 6, 7, 0]);
}

// ================================================================ C. real matches
// zones where ball3d draws a loose ball displaced from the sim's on purpose (posts / bar / side net, the back board): the drawn-vs-sim rows
// leave them out and count them apart
function inShiftZone(x, h, z) {
  const gw = (K.goalW || 7.5) / 2, back = (K.depth || 17) + (K.back || 0);
  if (back - z < 1.4 && (K.back || 0) > 0) return true;                                              // back board (BACK_FADE 0.9 + a ball)
  if (h < (K.goalH || 3) + 0.4 && z < 1.8 && Math.min(Math.hypot(x - gw, z), Math.hypot(x + gw, z)) < 1.8) return true;   // posts (POST_D + POST_FADE)
  if (Math.abs(x) < gw + 0.2 && z < 2.8 && z > -1 && h > (K.goalH || 3) - 0.6 && h < (K.goalH || 3) + 0.5) return true;    // crossbar band
  if (z < 0) return true;                                                                            // in the goal (net)
  return false;
}
function sectionC() {
  const hz = HZ_C, dt = 1 / hz;
  const res = { hz, matches: [], states: {}, trans: {}, ballModule: 'ok' };
  const bucket = (m, k) => m[k] || (m[k] = { n: 0, spd: [0, 0, 0, 0], snap: [0, 0, 0, 0], jump: 0, jumpEff: '', joint: 0, worst: [], score: 0, drop: -1, dropAt: '', rear: 0, legOv: -1, pen: 0, gkHand: 0, gkHandAt: '', skate: 0, skPeak: 0, air: 0, airT: 0, airHi: 0, flags: [] });
  const drib = [], dribPen = { n: 0, pen: 0 }, loose = [], looseDead = [], looseZone = [], looseMelt = [], looseWorst = { v: 0, at: '' }, kickJoin = [], kicks = [], kickAt = [], saves = [], parries = [], blocks = [];
  const skillMin = {}, skillTouch = {}, kickLag = [];
  const kdAll = [];
  let playT = 0, dips = 0, lockSlides = 0, lockRel = 0, dipWorst = 9, dipAt = '';
  let lowFrames = 0, actorFrames = 0, outFrames = 0, penFrames = 0, lowMin = 1e9, lowWhere = '', nan = 0, frames = 0, simT = 0, ballErr = null;
  const animErrs = {}, evCount = {};
  // a skill chord pressed by the home player on top of the AI: [chord mask (1 J, 2 K, 4 L), sprint, sideways]
  const SKILL_SEQ = [[1], [2], [4], [3], [5], [6], [7], [1, 1], [2, 1], [4, 1], [4, 0, 1], [4, 0, -1]];
  for (let m = 0; m < MATCHES; m++) {
    // home: the most skilful players (every move unlocked for the CPU), so the scripted skill presses cover all moves
    const PL = ISO.PLAYERS, bySkill = PL.slice().sort((p, q) => ((q.attr && q.attr.skl) || 0) - ((p.attr && p.attr.skl) || 0));
    const h = bySkill[m % 6], a = PL[(m * 3 + 5) % PL.length] === h ? PL[(m * 3 + 6) % PL.length] : PL[(m * 3 + 5) % PL.length];
    const inj = { cd: 1.5, hold: 0, i: m * 3, cur: null };
    const ai = [ISO.AI.create(['hard', 'normal', 'hard'][m % 3]), ISO.AI.create(['hard', 'hard', 'normal'][m % 3])];
    const W = World({ home: h, away: a, seed: 4200 + m, kickoff: m % 2, subjects: [0, 1, 'k'], pin: (j) => (j * 2.399) % TAU,      // the seeds the game's own actors get (created in this order)

      input(G) {
        const inp = [0, 1].map((i) => ({ ...ISO.AI.update(G, G.players[i], ai[i], STEP) }));
        if (!NO_SKILLS) {
          const p0 = G.players[0];
          inj.cd -= STEP;
          if (inj.hold > 0) { const q = inj.cur; inj.hold--; inp[0].j = !!(q[0] & 1); inp[0].k = !!(q[0] & 2); inp[0].l = !!(q[0] & 4); if (q[1]) inp[0].sprint = true; if (q[2]) { inp[0].mx = -Math.sin(p0.face) * q[2]; inp[0].my = Math.cos(p0.face) * q[2]; } inp[0].shoot = inp[0].finesse = inp[0].chip = inp[0].pass = false; }
          else if (inj.cd <= 0 && G.phase === 'play' && G.ball.owner === p0 && p0.state === 'free' && !p0.charge && p0.x < C.FW - 60) { inj.cur = SKILL_SEQ[inj.i++ % SKILL_SEQ.length]; inj.hold = 8; inj.cd = 1.0; inp[0].j = inp[0].k = inp[0].l = false; }
        }
        return inp;
      } });
    const G = W.G, all = W.actors, kAct = all[2], actors = [all[0], all[1]];
    if (W.ballErr) ballErr = W.ballErr;
    const kw = kickWatch(), sb = { x: 0, y: 0, z: 0 };
    const trk = all.map(() => ({ p1: null, p2: null, lkOn: [0, 0], lkT: [-1, -1], lkD: [0, 0], key: null, tr: null, trN: 0, px: 0, pz: 0, skill: null, skMin: 1e9, ring: [], more: 0, use: { key: null, sk: [0, 0], car: [0, 0], air: 0, airT: 0, ok: false } }));
    const pend = [];
    let prevDrawn = { x: 0, y: 0, z: 0, ok: false }, prevPhase = G.phase, lastHeld = -9;
    while (G.phase !== 'end' && G.time < SECS) {
      W.frame(dt, (W, vf, evs) => {
        const b = vf.ball, dc = W.dc, dx = dc.x, dy = dc.y, dz = dc.z;
        for (const e of evs) evCount[e.type] = (evCount[e.type] || 0) + 1;
        const phaseCut = vf.phase !== prevPhase; prevPhase = vf.phase;
        if (vf.phase === 'play') playT += dt;
        sb.x = b.x; sb.y = drawH(b.y) + BR; sb.z = b.z;
        for (let i = 0; i < all.length; i++) {
          const ac = all[i], keeper = ac.isKeeper, pv = keeper ? vf.keeper : vf.players[i], P = ac.probe, tk = trk[i];
          try { ac.anim.update(pv, dt, W.bv); }
          catch (e2) { const k2 = keyOf(pv, keeper) + ': ' + short(e2); animErrs[k2] = (animErrs[k2] || 0) + 1; try { ac.anim.reset(); } catch (e3) { /* ignore */ } P.reset(); tk.key = null; continue; }
          if (pv.hidden) { P.reset(); tk.key = null; continue; }
          const tele = phaseCut || Math.hypot(pv.x - tk.px, pv.z - tk.pz) > 1.2;
          tk.px = pv.x; tk.pz = pv.z;
          if (tele) { P.reset(); tk.tr = null; tk.trN = 0; tk.p1 = tk.p2 = null; tk.lkT[0] = tk.lkT[1] = -1; }
          P.read(dt);
          actorFrames++;
          if (P.nan) nan++;
          if (P.lowest < TH.low) lowFrames++;
          const key = keyOf(pv, keeper), hh = P.h, fm = frameMetrics(P, pv, dc);
          if (P.lowest < lowMin) { lowMin = P.lowest; lowWhere = key + ' m' + m + ' t=' + G.time.toFixed(2); }
          if (tk.key !== null && key !== tk.key && !tele) { tk.tr = tk.key + ' > ' + key; tk.trN = Math.round(0.12 * hz); }
          // per state use: planted boot slide and flights (closed when the state changes)
          const u = tk.use;
          if (u.key !== key || tele) {
            if (u.key && u.air > 0 && !AIR_GK[u.key]) { const B = bucket(res.states, u.key); if (u.ok) B.airHi = Math.max(B.airHi, u.air); else { B.air = Math.max(B.air, u.air); B.airT = Math.max(B.airT, u.airT); } }
            u.key = key; u.sk[0] = u.sk[1] = u.car[0] = u.car[1] = 0; u.air = 0; u.airT = 0; u.fl = 0; u.ok = false;
          }
          tk.key = key;
          if (P.n > 2) {
            const B = tk.trN > 0 ? bucket(res.trans, tk.tr) : bucket(res.states, key), Bs = bucket(res.states, key);
            B.n++;
            let fs2 = 0, fe = '';
            for (let e = 0; e < 6; e++) {
              const k = e < 2 ? 0 : e < 4 ? 1 : e - 2, kind = EFF_KIND[e], sp = P.spd[e] / hh, sn = P.snap[e] / hh;
              if (sp > B.spd[k]) B.spd[k] = sp;
              if (sn > B.snap[k]) B.snap[k] = sn;
              if (P.jump[e] > B.jump) { B.jump = P.jump[e]; B.jumpEff = EFF[e]; }
              const sc = Math.max(sp / TH.spd[kind], sn / TH.snap[kind]);
              if (sc > fs2) { fs2 = sc; fe = EFF[e]; }
            }
            const jd = (P.ang / dt / 60) * 180 / PI;
            if (jd > B.joint) B.joint = jd;
            if (jd / TH.jointDeg > fs2) { fs2 = jd / TH.jointDeg; fe = P.angJoint + ' (segment)'; }
            // body checks, attributed to the state
            if (PLAIN[key] && !pv.exhausted && REF.pelvis - fm.pelvisY / hh > Bs.drop) { Bs.drop = REF.pelvis - fm.pelvisY / hh; Bs.dropAt = 'm' + m + ' t=' + G.time.toFixed(2); }
            if (isLoco(key) && fm.rear > Bs.rear) Bs.rear = fm.rear;
            const lo = Math.max(fm.bootOv, fm.shinOv); if (lo > Bs.legOv) Bs.legOv = lo;
            if (!keeper) { outFrames++; if (fm.ballPen > TH.ballPen) { penFrames++; Bs.pen++; } }
            if (GKSET[key]) { const hj = Math.max(P.spd[2], P.spd[3]) / hh / 60; if (hj > Bs.gkHand) { Bs.gkHand = hj; Bs.gkHandAt = 'm' + m + ' t=' + G.time.toFixed(2); } }
            if (key.indexOf('skill:') === 0) for (let s = 0; s < 2; s++) { u.car[s] += fm.carried[s]; if (u.car[s] > (Bs.carried || 0)) Bs.carried = u.car[s]; }
            if (!keeper) {
              // pelvis dips (local minima below 0.62 h) in plain locomotion; feet the foot lock lets go that then slide along the turf
              const y = fm.pelvisY / hh;
              if (PLAIN[key] && !pv.exhausted && vf.phase === 'play') { if (tk.p1 != null && tk.p2 != null && tk.p1 < 0.62 && tk.p1 < tk.p2 && tk.p1 <= y) { dips++; if (tk.p1 < dipWorst) { dipWorst = tk.p1; dipAt = key + ' m' + m + ' t=' + G.time.toFixed(2); } } tk.p2 = tk.p1; tk.p1 = y; } else tk.p1 = tk.p2 = null;
              const lk = ac.anim.state && ac.anim.state.lk;
              if (lk && lk[0]) for (let s = 0; s < 2; s++) {
                const hi = s * 2, ti = s * 2 + 1, ii = P.sole[hi * 3 + 1] <= P.sole[ti * 3 + 1] ? hi : ti, lowS = P.sole[ii * 3 + 1], on = lk[0][s] ? 1 : 0;
                if (tk.lkOn[s] && !on) { lockRel++; if (lowS < 0.025) { tk.lkT[s] = 0; tk.lkD[s] = 0; } }
                else if (tk.lkT[s] >= 0) {
                  if (lowS < 0.025 && tk.lkT[s] < 0.6) { tk.lkD[s] += Math.hypot(P.sole[ii * 3] - P.psole[ii * 3], P.sole[ii * 3 + 2] - P.psole[ii * 3 + 2]); tk.lkT[s] += dt; }
                  else { if (tk.lkD[s] > 0.4) lockSlides++; tk.lkT[s] = -1; }
                }
                tk.lkOn[s] = on;
              }
            }
            if (!SLIDES[key] && !isLoco(key)) for (let s = 0; s < 2; s++) { u.sk[s] += fm.skate[s]; if (u.sk[s] > Bs.skate) Bs.skate = u.sk[s]; if (fm.skate[s] / dt > Bs.skPeak) Bs.skPeak = fm.skate[s] / dt; }
            if (fm.clear > 0.03) { u.fl += dt; if (fm.clear > u.air) u.air = fm.clear; if (u.fl > u.airT) u.airT = u.fl; if (AIR_OK[key]) u.ok = true; } else u.fl = 0;
            if (TRACE) {
              const bk = tk.trN > 0 ? tk.tr : key;
              tk.ring.push('m' + m + ' f' + W.f + ' t=' + G.time.toFixed(3) + ' ' + pad(bk, 26) + ' sp ' + fin0(pv.speed).toFixed(2) + ' yaw ' + fin0(pv.yaw).toFixed(2) + '/' + ac.group.rotation.y.toFixed(2) +
                (pv.runPh !== undefined ? ' ph ' + (pv.runPh % TAU).toFixed(2) : '') + ' u ' + fin0(pv.u).toFixed(2) + ' kT ' + fin0(pv.kickT).toFixed(3) + ' own ' + (pv.owner ? 1 : 0) +
                ' | cm/frame ' + Array.from(P.jump).map((v, e) => EFF[e] + ' ' + (v * 100).toFixed(1)).join(' ') + ' | seg ' + ((P.ang * 180) / PI).toFixed(0) + ' ' + P.angJoint + ' | pelvis ' + (fm.pelvisY / hh).toFixed(2) + ' h | low ' + P.lowest.toFixed(3));
              if (tk.ring.length > 7) tk.ring.shift();
              if (tk.more > 0 && --tk.more === 0) res.trace = tk.ring.slice();
              if (bk === TRACE && fs2 > B.score) tk.more = 3;
            }
            if (fs2 > B.score) { B.score = fs2; B.where = fe + ' m' + m + ' t=' + G.time.toFixed(2); }
          }
          if (tk.trN > 0) tk.trN--;
          // ---- ball contact while dribbling / in a skill
          if (!keeper) {
            const owner = b.owner === i;
            if (owner && (pv.state === 'free' || pv.state === 'skill')) {
              const g2 = Math.min(bootGap(ac, 1, dx, dy, dz), bootGap(ac, -1, dx, dy, dz));
              if (pv.state === 'free' && !(pv.kickT > 0) && vf.phase === 'play' && pv.speed > 1) { drib.push(g2); dribPen.n++; if (g2 < -0.06) dribPen.pen++; }
              if (pv.state === 'skill' && pv.skill) {
                if (tk.skill !== pv.skill.id) { tk.skill = pv.skill.id; tk.skMin = 1e9; }
                if (g2 < tk.skMin) tk.skMin = g2;
                const stt = ac.anim.state;
                if (stt && typeof stt.touchW === 'number' && stt.touchW > 0.5 && stt.touchSide) (skillTouch[pv.skill.id] = skillTouch[pv.skill.id] || []).push(bootGap(ac, stt.touchSide, dx, dy, dz));
              }
            }
            if (tk.skill && !(pv.state === 'skill' && pv.skill)) { if (tk.skMin < 1e8) (skillMin[tk.skill] = skillMin[tk.skill] || []).push(tk.skMin); tk.skill = null; }
          }
        }
        // ---- events -> contact windows (this and the following frames)
        for (const e of evs) {
          const c = prevDrawn.ok ? prevDrawn : { x: dx, y: dy, z: dz };
          if (e.type === 'kick' && e.p) {
            const i = G.players.indexOf(e.p), pv = vf.players[i];
            if (i < 0 || !pv) continue;
            const side = pv.kick && pv.kick.foot ? pv.kick.foot : actors[i].foot || 1, head = !!(pv.kick && pv.kick.high);
            if (pv.kick && pv.kick.owned && !head) kw.start(actors[i], pv, side, dc, sb, (pv.kick.type || 'pass') + ' m' + m + ' t=' + G.time.toFixed(2));
            pend.push({ kind: 'kick', i, side, head, cx: c.x, cy: c.y, cz: c.z, ex: dx, ey: dy, ez: dz, left: Math.round(0.15 * hz), min: 1e9, n: 0, lag: 0, type: head ? 'header' : (pv.kick && pv.kick.type) || 'pass' });
            kickAt.push(head ? pointGap(actors[i], 'head', 0.12, 0.13, dx, dy, dz) : bootGap(actors[i], side, dx, dy, dz));
          } else if (e.type === 'save' || e.type === 'claim') {
            const kind = e.type === 'claim' ? 'claim' : e.catch ? 'catch' : e.smother ? 'smother' : e.slide ? 'slide' : e.weak ? 'weak' : 'parry';
            pend.push({ kind: 'save', sub: kind, cx: c.x, cy: c.y, cz: c.z, ex: dx, ey: dy, ez: dz, left: Math.round(0.15 * hz), min: 1e9, n: 0, lag: 0 });
          } else if (e.type === 'block' && e.p) {
            const i = G.players.indexOf(e.p);
            if (i >= 0) pend.push({ kind: 'block', i, cx: c.x, cy: c.y, cz: c.z, ex: dx, ey: dy, ez: dz, left: Math.round(0.15 * hz), min: 1e9, n: 0, lag: 0 });
          }
        }
        for (let q = pend.length - 1; q >= 0; q--) {
          const w = pend[q];
          let g2 = 1e9;
          const held = w.kind === 'save' && (w.sub === 'catch' || w.sub === 'claim' || w.sub === 'smother');
          if (held) g2 = gloveGap(kAct, dx, dy, dz);
          else for (let q2 = 0; q2 <= 4; q2++) {      // a strike / parry / block happens on the ball's path between the frame before the event and the event frame
            const cx = w.cx + ((w.ex - w.cx) * q2) / 4, cy = w.cy + ((w.ey - w.cy) * q2) / 4, cz = w.cz + ((w.ez - w.cz) * q2) / 4;
            const g3 = w.kind === 'save' ? bodyGap(kAct, cx, cy, cz) : w.kind === 'block' ? bodyGap(actors[w.i], cx, cy, cz) : w.head ? pointGap(actors[w.i], 'head', 0.12, 0.13, cx, cy, cz) : bootGap(actors[w.i], w.side, cx, cy, cz);
            if (g3 < g2) g2 = g3;
          }
          if (g2 < w.min) { w.min = g2; w.lag = w.n; }
          w.n++;
          if (--w.left < 0) {
            if (w.kind === 'kick') { kicks.push(w.min); kickLag.push((w.lag / hz) * 1000); (res.kickByType = res.kickByType || {})[w.type] = (res.kickByType[w.type] || []).concat(w.min); }
            else if (w.kind === 'block') blocks.push(w.min);
            else if (held) saves.push(w.min); else parries.push(w.min);
            pend.splice(q, 1);
          }
        }
        kw.frame(dc, sb, (ac) => vf.players[ac.idx], !!(W.ball && W.ball.kickWindow), hz);
        // ---- drawn ball vs sim ball (the sim height through ball3d's drawHeight)
        if (b.owner >= 0 || b.held) lastHeld = G.t;
        if (b.owner < 0 && !b.held && W.ball && !W.ballErr) {
          const e2 = Math.hypot(dx - b.x, dy - (drawH(b.y) + BR), dz - b.z);
          // ball3d melts the difference between where an owned / held ball was drawn and the sim's over 0.10-0.22 s after it is released
          if (W.ball.dead || vf.phase !== 'play' || b.inNet) looseDead.push(e2); else if (W.ball.kickWindow) kickJoin.push(e2); else if (inShiftZone(b.x, b.y, b.z)) looseZone.push(e2);
          else if ((G.t - lastHeld) / SPEED < 0.25) looseMelt.push(e2); else { loose.push(e2); if (e2 > looseWorst.v) { looseWorst.v = e2; looseWorst.at = 'm' + m + ' t=' + G.time.toFixed(2) + ' sim ball h ' + b.y.toFixed(2) + ' z ' + b.z.toFixed(1) + ' v ' + Math.hypot(b.vx, b.vy, b.vz).toFixed(1); } }
        }
        if (!(dx === dx && dy === dy && dz === dz)) nan++;
        prevDrawn.x = dx; prevDrawn.y = dy; prevDrawn.z = dz; prevDrawn.ok = true;
        frames++;
      });
    }
    for (const w of kw.done) kdAll.push(w);
    simT += G.time;
    res.matches.push({ home: h.short || h.name, away: a.short || a.name, score: G.score.join('-'), simSeconds: r2(G.time), phase: G.phase });
    for (const ac of all) if (ac.dispose) ac.dispose();
  }
  res.animErrors = animErrs;
  for (const k in animErrs) out.errors.push('C anim.update threw in ' + k + '  (x' + animErrs[k] + ', those frames skipped)');
  if (ballErr) { res.ballModule = ballErr; out.errors.push('C ball3d: ' + ballErr + ' (raw sim ball used instead)'); }
  const st = (arr) => ({ n: arr.length, mean: r3(mean(arr)), p50: r3(pct(arr, 0.5)), p90: r3(pct(arr, 0.9)), p95: r3(pct(arr, 0.95)), p99: r3(pct(arr, 0.99)), max: r3(arr.length ? pct(arr, 1) : null), min: r3(arr.length ? pct(arr, 0) : null) });
  res.frames = frames; res.actorFrames = actorFrames; res.simSeconds = r2(simT); res.events = evCount;
  res.dribble = Object.assign(st(drib), { touchPct: r2(drib.length ? (100 * drib.filter((g) => g < 0.05).length) / drib.length : null), penPct: r2(dribPen.n ? (100 * dribPen.pen) / dribPen.n : 0) });
  res.skillClosest = {}; const allSk = [];
  for (const k in skillMin) { res.skillClosest[k] = st(skillMin[k]); for (const v of skillMin[k]) allSk.push(v); }
  res.skillClosestAll = st(allSk);
  res.skillTouch = {}; for (const k in skillTouch) res.skillTouch[k] = st(skillTouch[k]);
  res.loose = st(loose); res.looseDead = st(looseDead); res.looseZone = st(looseZone); res.looseMelt = st(looseMelt); res.looseWorst = looseWorst; res.kickJoin = st(kickJoin);
  res.kick = st(kicks); res.kickAtEvent = st(kickAt); res.kickLagMs = st(kickLag);
  if (res.kickByType) for (const k in res.kickByType) res.kickByType[k] = st(res.kickByType[k]);
  res.save = st(saves); res.parry = st(parries); res.block = st(blocks);
  res.low = { frames: lowFrames, pct: r3(actorFrames ? (100 * lowFrames) / actorFrames : 0), min: r3(lowMin), where: lowWhere };
  res.penPct = r3(outFrames ? (100 * penFrames) / outFrames : 0);
  { const g = kdAll.filter((w) => w.gap != null).map((w) => w.gap), worst = kdAll.filter((w) => w.gap != null).sort((a, b) => b.gap - a.gap)[0];
    res.kickDrawn = Object.assign(st(g), { within8: g.filter((x) => x <= 0.08).length, behind: kdAll.filter((w) => w.fwd != null && w.fwd < 0).length, wrong: kdAll.filter((w) => w.wrong > 0).length,
      over: kdAll.filter((w) => w.over > 0).length, overMax: r2(Math.max(0, ...kdAll.map((w) => w.overMax))), never: kdAll.filter((w) => w.gap == null).length, worstAt: worst ? worst.at : '' }); }
  const mins = playT / SPEED / 60;
  res.dips = { n: dips, perMin: r2(mins > 0 ? dips / mins : 0), lowest: r3(dipWorst), at: dipAt, minutes: r2(mins) };
  res.lockSlide = { n: lockSlides, releases: lockRel, perMin: r2(mins > 0 ? lockSlides / mins : 0) };
  res.nan = nan;
  // verdicts
  for (const map of [res.states, res.trans]) for (const k in map) {
    const B = map[k], F = [];
    for (let i = 0; i < 4; i++) { if (B.spd[i] > TH.spd[KINDS[i]]) F.push('spd:' + KINDS[i]); if (B.snap[i] > TH.snap[KINDS[i]]) F.push('snap:' + KINDS[i]); }
    if (B.joint > TH.jointDeg) F.push('jnt');
    if (map === res.states) {
      if (B.drop > TH.lungeDrop) F.push('lunge'); if (B.rear > TH.rearReach) F.push('rear'); if (B.legOv > TH.legOverlap) F.push('legs');
      if (B.skate > TH.clipSkate) F.push('skate'); if (B.skPeak > TH.clipSkatePeak) F.push('skatePeak');
      if ((B.carried || 0) > TH.carriedSlide) F.push('carried');
      if (B.air > TH.airClear) F.push('air'); if (B.airT > TH.airTime) F.push('airtime'); if (B.airHi > TH.airHigh) F.push('airHigh'); if (B.gkHand > TH.gkSetHand) F.push('gkHand');
    }
    B.flags = F;
    if (F.length) fail('C', (map === res.trans ? 'transition ' : 'state ') + k + ' ' + F.join(','), B.score, 1);
  }
  const chk = (what, v, lim) => { if (v != null && v > lim) fail('C', what, v, lim); };
  chk('dribble gap p95', res.dribble.p95, TH.dribGapP95); chk('dribble penetration %', res.dribble.penPct, TH.dribPenPct);
  chk('skill closest touch p90', res.skillClosestAll.p90, TH.skillTouchP90);
  chk('loose ball drawn-vs-sim p99', res.loose.p99, TH.looseP99); chk('loose ball drawn-vs-sim max', res.loose.max, TH.looseMax);
  chk('kick hold + catch-up drawn-vs-sim max', res.kickJoin.max, TH.kickJoinMax);
  chk('kick contact p90', res.kick.p90, TH.kickP90); chk('keeper catch hands p90', res.save.p90, TH.saveP90);
  chk('keeper parry body p90', res.parry.p90, TH.parryP90); chk('block body p90', res.block.p90, TH.blockP90);
  const kd = res.kickDrawn;
  chk('owned kick: boot to drawn ball when it leaves, p50', kd.p50, TH.kickDrawnP50); chk('owned kick: drawn ball behind the hip line (strikes)', kd.behind, TH.kickBehind);
  chk('owned kick: drawn ball steps backwards (strikes)', kd.wrong, TH.kickWrongWay); chk('owned kick: drawn ball above 1.6x the sim ball (strikes)', kd.over, TH.kickOverspeed);
  chk('pelvis dips below 0.62 h per minute', res.dips.perMin, TH.dipsPerMin); chk('foot-lock releases sliding > 40 cm per minute', res.lockSlide.perMin, TH.lockSlidePerMin);
  chk('ground penetration % frames', res.low.pct, TH.lowFramesPct); chk('ball inside a boot / shin % frames', res.penPct, TH.penFramesPct);
  if (nan) fail('C', 'NaN', nan, 0);
  return res;
}
function printC(res) {
  say('C. REAL MATCHES   ' + res.matches.map((m) => m.home + ' ' + m.score + ' ' + m.away + ' (' + m.simSeconds + ' s)').join(', ') + '   ' + res.frames + ' frames @ ' + res.hz + ' Hz' + (res.ballModule !== 'ok' ? '   [ball3d FAILED: raw sim ball]' : ''));
  const rowsOf = (map, body) => Object.keys(map).filter((k) => map[k].n > 0).sort((a, b) => (map[b].flags.length ? 1 : 0) - (map[a].flags.length ? 1 : 0) || map[b].score - map[a].score).filter((k, i) => ALL || i < TOP).map((k) => {
    const B = map[k], r = [k, B.n, B.spd.map((v) => v.toFixed(1)).join('/'), B.snap.map((v) => v.toFixed(1)).join('/'), (B.jump * 100).toFixed(1) + ' ' + B.jumpEff, B.joint.toFixed(0)];
    if (body) r.push(cm(B.drop) + '/' + B.rear.toFixed(2), cm(B.skate) + '/' + B.skPeak.toFixed(1) + (B.carried ? '/' + cm(B.carried) : ''), cm(B.air) + '/' + Math.round(B.airT * 1000) + (B.airHi ? '/' + cm(B.airHi) : ''), cm(B.legOv), B.pen, cm(B.gkHand));
    r.push((B.flags.length ? 'FAIL ' + compact(B.flags) : 'ok') + '  @ ' + (B.where || '') + (B.flags.indexOf('lunge') >= 0 ? ' lunge @ ' + B.dropAt : '') + (B.flags.indexOf('gkHand') >= 0 ? ' hand @ ' + B.gkHandAt : ''));
    return r;
  });
  say('   per transition (the 0.12 s after state A > B), failing first. spd / snap per h as foot/hand/head/pelvis; jump = worst single frame (cm); jnt = segment deg per 1/60 s');
  table(['transition', 'frames', 'spd f/h/hd/p', 'snap f/h/hd/p', 'jump', 'jnt', ' verdict'], rowsOf(res.trans), [34, 6, 20, 19, 12, 4, 0]);
  const nt = Object.keys(res.trans), ntb = nt.filter((k) => res.trans[k].flags.length);
  say('   ' + ntb.length + ' of ' + nt.length + ' transitions over a limit');
  say('   per state (steady, outside the transition windows); body: lunge cm / rear h, skate cm per use / peak m/s, air cm / ms (/ jump cm), legs cm, frames with the ball in a boot, keeper set hand cm');
  table(['state', 'frames', 'spd f/h/hd/p', 'snap f/h/hd/p', 'jump', 'jnt', 'lunge/rear', 'skate', 'air', 'legs', 'ball', 'gkH', ' verdict'], rowsOf(res.states, true), [22, 6, 20, 19, 12, 4, 10, 8, 10, 5, 5, 4, 0]);
  const ns = Object.keys(res.states), nsb = ns.filter((k) => res.states[k].flags.length);
  say('   ' + nsb.length + ' of ' + ns.length + ' states over a limit');
  const v = (x, lim) => (x == null ? '-' : x + (lim != null ? (x > lim ? ' FAIL(>' + lim + ')' : ' ok') : ''));
  const d = res.dribble;
  say('   ball contact (m, surface gap: 0 = touching, negative = overlapping)');
  say('     dribble boot-ball gap   n ' + d.n + '  mean ' + d.mean + '  p50 ' + d.p50 + '  p95 ' + v(d.p95, TH.dribGapP95) + '  max ' + d.max + '  min ' + d.min + '  touching(<5cm) ' + d.touchPct + '%  inside(>6cm) ' + v(d.penPct, TH.dribPenPct) + '%');
  say('     ball inside a boot / shin (> ' + TH.ballPen * 100 + ' cm), any outfield frame: ' + v(res.penPct, TH.penFramesPct) + '%');
  say('     skill closest approach  n ' + res.skillClosestAll.n + '  p50 ' + res.skillClosestAll.p50 + '  p90 ' + v(res.skillClosestAll.p90, TH.skillTouchP90) + '  max ' + res.skillClosestAll.max);
  const sk = Object.keys(res.skillClosest).sort((a, b) => res.skillClosest[b].p90 - res.skillClosest[a].p90);
  if (sk.length) say('       per skill p90 (n): ' + sk.map((k) => k + ' ' + res.skillClosest[k].p90 + ' (' + res.skillClosest[k].n + ')').join(', '));
  const tk = Object.keys(res.skillTouch);
  say('     skill touch frames (touchW > 0.5): ' + (tk.length ? tk.map((k) => k + ' p90 ' + res.skillTouch[k].p90 + ' (' + res.skillTouch[k].n + ')').join(', ') : 'none requested by any clip'));
  say('     kick: boot/head to strike point, closest within 0.15 s   n ' + res.kick.n + '  p50 ' + res.kick.p50 + '  p90 ' + v(res.kick.p90, TH.kickP90) + '  max ' + res.kick.max + '   at the event frame p50 ' + res.kickAtEvent.p50 + '   lag of closest p50 ' + res.kickLagMs.p50 + ' ms');
  if (res.kickByType) say('       per type p90 (n): ' + Object.keys(res.kickByType).map((k) => k + ' ' + res.kickByType[k].p90 + ' (' + res.kickByType[k].n + ')').join(', '));
  const kd = res.kickDrawn;
  say('     owned kicks as drawn (n ' + kd.n + '): boot to drawn ball when it starts to move p50 ' + v(kd.p50, TH.kickDrawnP50) + ' p90 ' + kd.p90 + ' max ' + kd.max + ' (worst ' + kd.worstAt + '), within 8 cm ' + kd.within8 + '; behind the hips ' + v(kd.behind, TH.kickBehind) +
    '; steps backwards ' + v(kd.wrong, TH.kickWrongWay) + '; above 1.6x the sim ball ' + v(kd.over, TH.kickOverspeed) + ' (worst ' + kd.overMax + 'x)' + (kd.never ? '; never left within 0.4 s ' + kd.never : ''));
  say('     pelvis dips below 0.62 h (plain locomotion) ' + res.dips.n + ' in ' + res.dips.minutes + ' min = ' + v(res.dips.perMin, TH.dipsPerMin) + ' per minute, lowest ' + res.dips.lowest + ' h ' + res.dips.at + ';  foot-lock releases ' + res.lockSlide.releases + ', sliding > 40 cm after: ' + res.lockSlide.n + ' = ' + v(res.lockSlide.perMin, TH.lockSlidePerMin) + ' per minute');
  say('     keeper catch/claim/smother: glove to ball within 0.15 s   n ' + res.save.n + '  p50 ' + res.save.p50 + '  p90 ' + v(res.save.p90, TH.saveP90) + '  max ' + res.save.max);
  say('     keeper parry/weak/slide: body to ball within 0.15 s   n ' + res.parry.n + '  p50 ' + res.parry.p50 + '  p90 ' + v(res.parry.p90, TH.parryP90) + '  max ' + res.parry.max + '   block: n ' + res.block.n + '  p50 ' + res.block.p50 + '  p90 ' + v(res.block.p90, TH.blockP90));
  say('     drawn ball vs sim ball (sim height through drawHeight), unowned in play   n ' + res.loose.n + '  mean ' + res.loose.mean + '  p99 ' + v(res.loose.p99, TH.looseP99) + '  max ' + v(res.loose.max, TH.looseMax));
  say('       worst at ' + res.looseWorst.at + '. Not judged (by design): near posts / bar / back board n ' + res.looseZone.n + ' p99 ' + res.looseZone.p99 + ' max ' + res.looseZone.max + '; the 0.25 s after a release (melt) n ' + res.looseMelt.n + ' p99 ' + res.looseMelt.p99 + ' max ' + res.looseMelt.max + '; dead ball / net n ' + res.looseDead.n);
  say('     drawn ball vs sim ball inside the kick hold + catch-up window   n ' + res.kickJoin.n + '  mean ' + res.kickJoin.mean + '  p99 ' + res.kickJoin.p99 + '  max ' + v(res.kickJoin.max, TH.kickJoinMax));
  if (res.trace) { say('   trace of ' + TRACE + ' (worst frame is the 4th from the end)'); for (const l of res.trace) say('     ' + l); }
  say('   ground: ' + res.low.frames + ' of ' + res.actorFrames + ' actor frames below ' + TH.low + ' m (' + v(res.low.pct, TH.lowFramesPct) + '%), deepest ' + res.low.min + ' in ' + res.low.where + '   NaN ' + res.nan);
}

// ================================================================ main
const need = (ok, what) => { if (!ok) out.errors.push('missing ' + what); return ok; };
const haveAnim = need(THREE, 'THREE') && need(R3D.Player && R3D.Player.create, 'R3D.Player') && need(R3D.Anim && R3D.Anim.create && R3D.Anim.samplePV, 'R3D.Anim') && need(R3D.Adapter, 'R3D.Adapter') && need(ISO.Game && ISO.AI && ISO.Smooth, 'ISO.Game / AI / Smooth');
const t0 = Date.now();
for (const [id, fn, pr] of [['A', sectionA, printA], ['B', sectionB, printB], ['C', sectionC, printC]]) {
  if (!want(id)) continue;
  if (!haveAnim) { say(id + '. skipped: modules missing'); continue; }
  try { const r = fn(); out[id] = r; if (!JSON_OUT) { pr(r); say(); } }
  catch (e) { out.errors.push('section ' + id + ' crashed: ' + short(e)); say(id + '. CRASHED: ' + short(e)); say(); }
}
out.ms = Date.now() - t0;
const loadBad = Object.keys(out.loadErrors);
out.exit = loadBad.length || out.errors.length ? 2 : out.fails.length ? 1 : 0;
if (JSON_OUT) {
  if (out.A) for (const k in out.A.scenes) for (const V of out.A.scenes[k].variants) delete V.recs;
  process.stdout.write(JSON.stringify(out, (k, v) => (typeof v === 'number' && v === v && Math.abs(v) < 1e8 ? Math.round(v * 1e4) / 1e4 : typeof v === 'number' ? null : v)) + '\n');
} else {
  if (out.absent) console.log('note: not present in this tree: ' + out.absent.join(', '));
  for (const f of loadBad) console.log('LOAD ERROR ' + f + ': ' + out.loadErrors[f]);
  for (const e of out.errors) console.log('ERROR ' + e);
  if (loadBad.length || out.errors.length) console.log('');
  console.log(lines.join('\n'));
  const by = { A: 0, B: 0, C: 0 }; for (const f of out.fails) by[f.section]++;
  console.log('RESULT: ' + (out.exit === 0 ? 'PASS' : out.exit === 1 ? 'FAIL' : 'ERROR') + '  limits exceeded: A ' + by.A + ', B ' + by.B + ', C ' + by.C + '  (' + out.ms + ' ms, exit ' + out.exit + ')');
}
process.exitCode = out.exit;
