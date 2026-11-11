/* ISO FOOTBALL — rebound drill simulation. Pure 2D game logic: no DOM, no rendering.
   Time: a fixed 120 Hz step. The caller decides how fast steps are fed (real time x C.SPEED); nothing in here scales time.
   Coordinates: pitch-space pixels, origin at the top-left corner of the half-field.
   One goal (right, +x) with a keeper; both players attack it. Each rep starts with both players
   10 yards outside the 18-yard box, in the centre. After a shot, the rebound must be cleared
   outside the box to end the rep. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const C = (ISO.C = {
    FW: 340, FH: 720,             // drill area: depth (x, goal at x = FW) and width (y). Rendered with the goal at the top.
    GY0: 285, GY1: 435,           // goal mouth (y range)
    K_REACH0: 6, K_REACH1: 6, K_DIVE0: 88, K_DIVE1: 55, K_STEP: 170, K_ANTIC: 0.03, K_CLOSE: 0.82, K_CORNER: 0.06,   // keeper tuning
    GD: 34,                       // goal depth
    BAR: 60,                      // crossbar height (ball z)
    PR: 12, BR: 6,                // player / ball radius
    BOXD: 190, BOXY0: 110, BOXY1: 610, PEN: 127,
    SIXD: 64, SIXY0: 250, SIXY1: 470,
    TEN: 105,                     // 10 yards (the box is 18)
    K_CATCH: 0.7,                // keepers hold shots less often than they spill them: rebounds are the point
    SPEED: 0.6,                   // game speed vs real time (1 = original pace). The one place the pace is set: the main loop and the online server
                                  // both feed real time x SPEED into the fixed-step simulation, so players, ball, keeper and timers all slow together.
    // shot charge timing (seconds held): full = full power, over = starts to sail over the bar, max = auto-release
    CHG: { normal: { full: 0.33, over: 0.47, max: 0.72 }, finesse: { full: 0.37, over: 0.52, max: 0.78 },
      power: { full: 0.6, over: 0.78, max: 1.02 }, chip: { full: 0.3, over: 0.44, max: 0.65 } },      // wind-up times (s): about a third quicker than before
    FAKE_T: 0.26,                 // the fake-shot swing: quick, then the player bursts away
    CR: 100, WIN: 3, STEP: 1 / 120, GRAV: 900, GOAL_T: 1.7, OUT_T: 0.6,
    REPLAY_T: 4.5,                // length of the goal pause when the goal is replayed (matches): celebration, replay, back to play
    STRIDE: 44,                   // pixels covered by one full running stride (two steps) at a jog
  });
  const { FW, FH, GY0, GY1, GD, BAR, PR, BR, BOXD, BOXY0, BOXY1 } = C;
  const SPOTX = FW - BOXD - C.TEN;       // both players start here, 10 yards outside the box
  const inBox = (b) => b.x > FW - BOXD && b.y > BOXY0 && b.y < BOXY1;
  ISO.inBox = inBox; ISO.SPOTX = SPOTX;
  const GCY = (GY0 + GY1) / 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hyp = Math.hypot;
  const q = (v) => clamp((v - 40) / 59, 0, 1);    // generic attribute -> 0..1
  const q2 = (v) => clamp((v - 60) / 39, 0, 1);   // pace / acceleration -> 0..1
  const sm = (x) => x * x * (3 - 2 * x);
  // Pace. Everyone is quick; ratings separate players without crippling the weak ones: a 50-rated runner has about
  // 83% of the top speed of a 99-rated one (it used to be 66%), and gets going about 75% as fast.
  const topSpeed = (a) => 240 + 50 * q(a.pac);
  const JOG = 0.7;
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  ISO.util = { clamp, lerp, hyp, q, q2, angDiff };

  // mulberry32, with its state kept on the game object (G.rs) so a snapshot carries it: an online client that re-simulates
  // from a snapshot rolls exactly the dice the server will.
  function rng(G) {
    return () => {
      const a = (G.rs = (G.rs + 0x6d2b79f5) | 0);
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ZERO = { mx: 0, my: 0, sprint: false, jockey: false, shoot: false, finesse: false, chip: false, lob: false, skill: false, j: false, k: false, l: false, pass: false, tackle: false, slide: false, shoulder: false, focus: false };
  const ev = (G, type, d) => { const e = d || {}; e.type = type; G.events.push(e); };
  const mark = (G) => { G.ball.seq = ++G.seq; };
  const setState = (p, s, dur) => { p.state = s; p.stT = 0; p.stDur = dur || 0; };
  // the nearest opponent (in 1v1 simply the other player)
  const other = (G, p) => {
    let best = null, bd = 1e12;
    for (const o of G.players) {
      if (o.team === p.team || o.state === 'away') continue;
      const d = (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best || G.players[1 - p.team];
  };
  const FAKE_T = C.FAKE_T;
  const snapPrev = (inp) => ({ shoot: inp.shoot, finesse: inp.finesse, chip: inp.chip, lob: inp.lob, skill: inp.skill, j: inp.j, k: inp.k, l: inp.l, pass: inp.pass, tackle: inp.tackle, slide: inp.slide, shoulder: inp.shoulder, focus: inp.focus });

  // ------------------------------------------------------------------ skills
  // star: minimum skill-move stars. prot: [from,to] fraction of the move during
  // which the ball is protected from tackles. fake: the move sells a feint.
  const SK = {
    stepover: { name: 'Stepover', star: 2, dur: 0.33, cost: 3, exit: 1.25, prot: [0.3, 1], fake: true },
    feint:    { name: 'Body Feint', star: 1, dur: 0.25, cost: 2, exit: 1.2, prot: [0.4, 1], fake: true },
    knock:    { name: 'Knock On', star: 1, dur: 0.22, cost: 3, exit: 1.5, prot: [0, 0.45] },
    roll:     { name: 'Ball Roll', star: 2, dur: 0.27, cost: 2, exit: 1.0, prot: [0.1, 1] },
    croqueta: { name: 'La Croqueta', star: 3, dur: 0.22, cost: 3, exit: 1.2, prot: [0, 1] },
    roulette: { name: 'Roulette', star: 3, dur: 0.42, cost: 4, exit: 1.15, prot: [0.1, 1] },
    elastico: { name: 'Elastico', star: 5, dur: 0.3, cost: 4, exit: 1.3, prot: [0.42, 1], fake: true },
    heel:     { name: 'Heel to Heel', star: 4, dur: 0.22, cost: 3, exit: 1.35, prot: [0, 0.6] },
    rainbow:  { name: 'Rainbow Flick', star: 5, dur: 0.56, cost: 5, exit: 1.1, prot: [0.28, 1] },
    dragback: { name: 'Drag Back', star: 2, dur: 0.3, cost: 2, exit: 1.1, prot: [0.2, 1] },
    nutmeg:   { name: 'Nutmeg', star: 4, dur: 0.36, cost: 3, exit: 1.3, prot: [0, 0] },
  };
  const SK_FALLBACK = { roulette: 'stepover', heel: 'feint', elastico: 'croqueta', rainbow: 'dragback', nutmeg: 'feint',
    croqueta: 'knock', stepover: 'feint', roll: 'knock', dragback: 'feint' };

  // Each move returns, for progress u (0..1): player velocity in the move's local
  // frame (vf forward, vs sideways), the ball offset from the player (bf, bs, bz)
  // and optionally the facing angle and a body-lean hint for the renderer.
  const SKFN = {
    stepover: (u, s) => ({ vf: s.v0 * 0.85, vs: 0, bf: 17, bs: 3.5 * Math.sin(u * Math.PI * 4), lean: Math.sin(u * Math.PI * 4) }),
    feint: (u, s) => ({ vf: s.v0, vs: u < 0.45 ? -105 : 265, bf: 16,
      bs: u < 0.45 ? -5 * seg(u, 0, 0.45) : lerp(-5, 7, seg(u, 0.45, 1)), lean: u < 0.45 ? -1 : 1 }),
    // knock on: push the ball ahead and burst after it, straight where the keys point
    knock: (u, s) => ({ vf: s.v0 + 170 * sm(u), vs: 0, bf: lerp(15, 34, sm(u)) }),
    roll: (u, s) => ({ vf: s.v0 * 0.6, vs: 205, bf: 12, bs: 5 + 8 * Math.sin(u * Math.PI) }),
    croqueta: (u, s) => ({ vf: s.v0 * 0.45 + 70, vs: 310, bf: 14, bs: lerp(-9, 10, sm(u)) }),
    roulette: (u, s) => {
      const an = u * Math.PI * 2;
      return { vf: Math.max(s.v0, 120), vs: 45 * Math.sin(u * Math.PI), bf: 13 * Math.cos(an), bs: 13 * Math.sin(an), face: s.a0 + s.sd * an };
    },
    elastico: (u, s) => ({ vf: s.v0 * 0.6, vs: u < 0.45 ? -65 : 285, bf: 16,
      bs: u < 0.45 ? -17 * sm(seg(u, 0, 0.45)) : lerp(-17, 20, sm(seg(u, 0.45, 0.75))), lean: u < 0.45 ? -1 : 1 }),
    heel: (u, s) => ({ vf: s.v0 + 90, vs: 0, bf: u < 0.35 ? lerp(15, -7, seg(u, 0, 0.35)) : lerp(-7, 44, sm(seg(u, 0.35, 1))) }),
    rainbow: (u, s) => {
      const w = seg(u, 0.28, 1);
      return { vf: Math.max(s.v0, 130), vs: 0, bf: u < 0.28 ? lerp(15, -11, seg(u, 0, 0.28)) : lerp(-11, 62, w),
        bz: u < 0.28 ? 10 * seg(u, 0.1, 0.28) : 10 + 58 * Math.sin(Math.PI * w) - 10 * w };
    },
    dragback: (u, s) => ({ vf: lerp(s.v0 * 0.5, -100, sm(seg(u, 0, 0.6))), vs: 0, bf: lerp(16, -13, sm(seg(u, 0, 0.7))),
      face: s.a0 + angDiff(s.a0, s.exit) * sm(seg(u, 0.3, 1)) }),
    nutmeg: (u, s) => ({ vf: s.v0 + 80, vs: u < 0.55 ? 200 : -150 }),
  };

  // Which move does this input select? (also used by the UI hint)
  // Skill moves are chosen by chord: J, K and L alone or together (bit 1 = J, 2 = K, 4 = L); Sprint swaps the single keys for the heel / drag back / nutmeg.
  // L alone is the forward burst (knock on); with a sideways direction held it is the ball roll, for players who have it.
  const CHORD = { 1: 'stepover', 2: 'feint', 4: 'knock', 3: 'croqueta', 5: 'roulette', 6: 'elastico', 7: 'rainbow' };
  const CHORD_SPRINT = { 1: 'heel', 2: 'dragback', 4: 'nutmeg' };
  function pickSkill(G, p, inp, mx, my, hasIn, mask) {
    const opp = other(G, p);
    const stars = G.solo ? 5 : ISO.stars(p.a.skl);       // the testing arena unlocks every move
    const fx = Math.cos(p.face), fy = Math.sin(p.face);
    let rel = 'neutral', sd = 0, inAng = p.face;
    if (hasIn) {
      inAng = Math.atan2(my, mx);
      const d = angDiff(p.face, inAng), ad = Math.abs(d);
      if (ad < 0.6) rel = 'fwd'; else if (ad > 2.54) rel = 'back'; else { rel = 'side'; sd = d > 0 ? 1 : -1; }
    }
    const ox = opp.x - p.x, oy = opp.y - p.y, od = hyp(ox, oy) || 1;
    const cross = fx * oy - fy * ox;
    if (!sd) sd = od < 170 ? (cross > 0 ? -1 : 1) : (G.rand() < 0.5 ? -1 : 1);
    const oppAhead = od < 85 && (ox * fx + oy * fy) / od > 0.8;
    const spd = hyp(p.vx, p.vy);
    let id = (inp.sprint && CHORD_SPRINT[mask]) || CHORD[mask] || 'stepover';
    if (id === 'knock' && rel === 'side') id = 'roll';
    // p.moves (optional) is the set of moves this player has unlocked; anything else falls back to a simpler one
    while (SK[id].star > stars || (p.moves && !G.solo && !p.moves.has(id) && SK_FALLBACK[id])) id = SK_FALLBACK[id];
    return { id, rel, sd, inAng, od };
  }

  function startSkill(G, p, inp, mx, my, hasIn, mask) {
    const b = G.ball, opp = other(G, p), a = p.a;
    const pk = pickSkill(G, p, inp, mx, my, hasIn, mask);
    const id = pk.id, def = SK[id], sd = pk.sd;
    const fx = Math.cos(p.face), fy = Math.sin(p.face);
    const spd = hyp(p.vx, p.vy);
    let exit = p.face;
    if (id === 'stepover') exit = hasIn && pk.rel !== 'back' ? pk.inAng : p.face + sd * 0.6;
    else if (id === 'feint') exit = p.face + sd * 0.7;
    else if (id === 'knock') exit = hasIn && pk.rel !== 'back' ? pk.inAng : p.face;
    else if (id === 'croqueta') exit = p.face + sd * 0.35;
    else if (id === 'elastico') exit = p.face + sd * 0.85;
    else if (id === 'dragback') exit = pk.rel === 'back' ? pk.inAng : p.face + Math.PI;
    const s = (p.skill = {
      id, def, t: 0, dur: def.dur, d0x: fx, d0y: fy, sx: -fy * sd, sy: fx * sd, sd, a0: p.face, exit,
      v0: clamp(spd, 60, p.jog * 1.1), botch: false, botched: false, lean: 0,
      fakeX: fx * 0.4 + fy * sd, fakeY: fy * 0.4 - fx * sd,
    });
    if (id === 'dragback') { s.fakeX = fx; s.fakeY = fy; }
    if (id === 'knock') { s.d0x = Math.cos(exit); s.d0y = Math.sin(exit); s.a0 = exit; p.face = exit; }
    // a move you ask for is a move you get: only a tired or clumsy player ever loses the ball doing it
    const pBotch = clamp(0.05 - 0.06 * q(a.skl) + (def.star - 1) * 0.008 - 0.02 * q(a.dri) + (p.stam < 25 ? 0.08 : 0), 0, 0.14);
    s.botch = G.rand() < pBotch;
    p.stam = Math.max(0, p.stam - def.cost);
    p.charge = null; p.bufSkill = null;
    setState(p, 'skill', def.dur);
    G.stats.skills[p.team]++;
    if (id === 'nutmeg') {
      let P = 0.45 + 0.4 * q(a.skl) - 0.3 * q(opp.a.tck);
      if (opp.jock) P -= 0.2;
      if (opp.state !== 'free' || opp.sprinting) P += 0.15;
      b.owner = null; b.shot = null;
      const v = 215 + Math.min(pk.od, 120) * 0.8;      // a short poke through the legs, not a long punt
      b.vx = fx * v; b.vy = fy * v; b.lastKicker = p; b.kickT = 0; b.lastTouch = p.team;
      if (!G.solo && G.rand() < clamp(P, 0.1, 0.92)) { b.pass = opp; b.ptT = 0.5; }
      mark(G);
    }
    ev(G, 'skill', { p, name: def.name, id });
  }

  // Ankles are broken only when the defender commits to a defensive move (a lunge or a slide) and the attacker dodges it
  // with a skill move: either the challenge arrives while the move protects the ball, or the move lands on a defender
  // who is still lunging, sliding or recovering from a miss close by. Nothing else puts a defender on the floor.
  const ANKLE = { stepover: 1, feint: 1, knock: 1, roll: 1, croqueta: 1, roulette: 1, elastico: 1, heel: 1, rainbow: 1, dragback: 1 };
  const ANKLE_R = 76, ANKLE_T = 0.92;
  function tryAnkles(G, p, s) {
    const o = other(G, p);
    if (G.solo || !ANKLE[s.id]) return;
    if (!(o.state === 'tackle' || o.state === 'slide' || (o.state === 'recover' && !o.won))) return;
    if (hyp(o.x - p.x, o.y - p.y) > ANKLE_R) return;
    breakAnkles(G, p, o, s);
  }
  function breakAnkles(G, p, o, s) {
    if (G.solo || !ANKLE[s.id] || o.state === 'ankle' || o.state === 'celebrate' || o.state === 'away') return;
    o.charge = null; o.skill = null; o.noCtrl = ANKLE_T;
    o.vx *= 0.15; o.vy *= 0.15; o.fallDir = Math.atan2(o.y - p.y, o.x - p.x);
    setState(o, 'ankle', ANKLE_T);
    p.boost = Math.max(p.boost, 0.9);                                       // the attacker bursts into the space
    G.stats.ankles = (G.stats.ankles || 0) + 1;
    ev(G, 'ankles', { p, on: o, name: s.def.name });
  }

  function updateSkill(G, p, dt) {
    const s = p.skill, b = G.ball;
    s.t += dt;
    const u = Math.min(1, s.t / s.dur);
    const P = SKFN[s.id](u, s);
    p.vx = s.d0x * P.vf + s.sx * P.vs;
    p.vy = s.d0y * P.vf + s.sy * P.vs;
    if (P.face !== undefined) p.face = P.face;
    s.lean = (P.lean || 0) * s.sd;
    if (!s.ankleDone && u >= 0.5 && !s.botch) { s.ankleDone = true; tryAnkles(G, p, s); }
    if (b.owner === p && P.bf !== undefined) {
      if (s.botch && !s.botched && u >= 0.5) {
        s.botched = true; b.owner = null;
        const an = G.rand() * Math.PI * 2;
        b.vx = p.vx * 0.6 + Math.cos(an) * 150; b.vy = p.vy * 0.6 + Math.sin(an) * 150;
        p.noCtrl = 0.18; setState(p, 'stumble', 0.12); p.skill = null; p.skillCd = 0.15;
        ev(G, 'botch', { p }); mark(G);
        return;
      }
      const bs = P.bs || 0;
      const tx = p.x + s.d0x * P.bf + s.sx * bs, ty = p.y + s.d0y * P.bf + s.sy * bs;
      let vx = (tx - b.x) / dt, vy = (ty - b.y) / dt;
      const vl = hyp(vx, vy);
      if (vl > 1200) { vx *= 1200 / vl; vy *= 1200 / vl; }
      b.vx = vx; b.vy = vy; b.z = P.bz || 0; b.vz = 0; b.driven = true; b.zDriven = true;
    }
    if (u >= 1) {
      const J = Math.min(p.jog * s.def.exit, p.top * 1.05);
      const ex = Math.cos(s.exit), ey = Math.sin(s.exit);
      p.vx = ex * J; p.vy = ey * J; p.face = s.exit;
      if (b.owner === p) {
        const k = hyp(b.x - p.x, b.y - p.y) > 40 ? 0.55 : 1.05;     // a ball flicked far ahead waits to be collected
        b.vx = ex * J * k; b.vy = ey * J * k; b.z = 0;
      }
      p.boost = Math.max(p.boost, 0.55); p.skillCd = 0.05; p.skill = null;      // moves chain: the next one can start almost at once
      setState(p, 'free');
    }
  }

  // ---------------------------------------------------------------- shooting
  function shoot(G, p, type, power, ft, mx, my, hasIn) {
    const b = G.ball, a = p.a, K = G.keeper;
    const gx = FW;
    const dGoal = hyp(gx - b.x, GCY - b.y);
    const facingGoal = hasIn ? mx * p.dir > -0.3 : Math.cos(p.face) * p.dir > -0.3;
    let aim, tgtY = GCY, atGoal = facingGoal && dGoal < 760;
    if (atGoal) {
      const inset = type === 'finesse' ? 12 : 18;
      if (hasIn && my < -0.35) tgtY = GY0 + inset;
      else if (hasIn && my > 0.35) tgtY = GY1 - inset;
      else tgtY = K.y > GCY ? GY0 + 34 : GY1 - 34;        // auto-aim: away from the keeper, less extreme
      aim = Math.atan2(tgtY - b.y, gx - b.x);
    } else aim = hasIn ? Math.atan2(my, mx) : p.face;
    if (p.aim) {       // mouse aiming: strike toward the cursor
      aim = Math.atan2(p.aim.y - b.y, p.aim.x - b.x);
      atGoal = Math.cos(aim) > 0.05;
      if (atGoal) tgtY = b.y + Math.tan(aim) * (gx - b.x);
    }

    // which foot? aiming across the body uses the other foot
    const turn = angDiff(p.face, aim);
    // turn>0 = struck toward the player's right-hand side = left foot
    const weak = Math.abs(turn) > 0.2 && ((turn > 0 && p.def.foot === 'R') || (turn < 0 && p.def.foot === 'L'));
    const wf = q(a.wf);

    const far = clamp((dGoal - 170) / 260, 0, 1);      // long range starts earlier
    const acc = lerp(q(a.fin), q(a.lng), far);
    let err = lerp(0.095, 0.026, acc) * (1 - far * 0.15);      // long shots are no longer less accurate
    if (type === 'finesse') err *= 0.85 - 0.25 * q(a.cur);
    else if (type === 'power') err *= power > 0.95 ? 1.3 : 0.95;
    if (Math.abs(turn) > 0.6) err *= 1 + (Math.abs(turn) - 0.6) * 0.55;
    const spd = hyp(p.vx, p.vy);
    err *= 1 + (spd / p.top) * 0.5 * (1.2 - q(a.bal));
    if (p.jostle > 0) err *= 1.5 - 0.4 * q(a.bal);
    err *= 1 + (1 - p.stam / 100) * 0.35;
    if (weak) err *= 1 + (1 - wf) * 0.9;
    if (G.drill && G.drill.kind === 'penalty' && type === 'power') err *= 1.8;      // a blast from the spot is a gamble
    if (ft) err *= 1.3 - 0.25 * q(a.fin) + hyp(b.vx, b.vy) / 1600;

    const sp = q(a.sho);
    let v, vz, spin = 0;
    if (type === 'finesse') {
      v = (430 + 250 * power) * (0.85 + 0.2 * sp); vz = 40 + 230 * power;       // holding longer lifts every shot type
      spin = (0.5 + 0.5 * q(a.cur)) * (atGoal ? Math.sign(GCY - tgtY) || 1 : 1) * p.dir;
    } else if (type === 'chip') {
      // a lofted scoop over the keeper: it flies on a steep arc and drops toward the goal line. Hit it too hard
      // and it sails over the bar, too soft and the keeper plucks it down. Aim is generous, the power is the skill.
      vz = 470 + 40 * power;
      const T = 2 * vz / C.GRAV, tc = lerp(0.97, 0.86, power) * T;       // time to cross the line
      v = clamp(dGoal, 70, 700) / (tc * 0.97) * (0.96 + 0.08 * sp);
      if (!atGoal) v = 260 + 200 * power;
      err *= 0.8;
    } else if (type === 'power') {      // long wind-up, but hard and flat: can score from outside the box
      v = (540 + 640 * power) * (0.85 + 0.3 * sp); vz = 30 + 170 * power + Math.abs(G.gauss()) * 15;
    } else {
      v = (400 + 330 * power) * (0.82 + 0.3 * sp);
      vz = 40 + 260 * power + Math.abs(G.gauss()) * 25;
    }
    // hold it too long and it sails over the bar
    const CG = C.CHG[type] || C.CHG.normal;
    const over = p.charge && !ft ? clamp((p.charge.t - CG.over) / ((CG.max - CG.over) * 0.8), 0, 1) : 0;
    vz += over * (type === 'chip' ? 330 : 420);
    if (type !== 'chip') v *= 1 + 0.12 * far;        // and they come in harder
    if (weak) v *= 0.85 + 0.15 * wf;
    v *= 0.92 + 0.08 * (p.stam / 100);
    if (ft) v *= 1.06;

    if (spin) { // start the ball outside its target so the curl brings it back
      const T = dGoal / (v * 0.85), accl = Math.abs(spin) * 560 * (v / 500);
      const off = Math.atan2(0.5 * accl * T * T * 0.7, Math.max(dGoal, 60));
      aim -= Math.sign(spin) * off;
    }
    const ang = aim + G.gauss() * err;
    b.owner = null; b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = vz; b.z = Math.max(b.z, 1);
    b.spin = spin; b.pass = null;
    b.shot = { id: ++G.shotSeq, team: p.team, type: ft ? 'first-time' : type, by: p, out: Math.abs(gx - p.x) > BOXD || p.y < BOXY0 || p.y > BOXY1 };      // out: struck from outside the box
    b.lastKicker = p; b.kickT = 0; b.lastTouch = p.team; b.shotTeam = p.team; b.shotT = G.t; mark(G);
    p.noCtrl = G.drill ? 9 : 0.14; p.kickT = 0.3; p.charge = null;
    p.stam = Math.max(0, p.stam - 1.5);
    p.face += clamp(turn, -1.2, 1.2);
    G.stats.shots[p.team]++; G.shotTaken = true; if (G.drill) G.drill.shot = true;
    if (atGoal) {
      const pr = predict(b, gx, 1);
      if (pr && pr.y > GY0 && pr.y < GY1 && pr.z < BAR) G.stats.onTarget[p.team]++;
    }
    ev(G, 'kick', { power: clamp(v / 800, 0.2, 1), shot: b.shot.type, p });
  }

  function handleCharge(G, p, inp, mx, my, hasIn, dt) {
    const b = G.ball, pr = p.prev, owner = b.owner === p;
    const TYPES = [['shoot', 'normal'], ['finesse', 'finesse'], ['chip', 'power'], ['lob', 'chip']];     // the 'chip' input key fires the power shot; 'lob' is the chip shot
    if (!p.charge) {
      for (const [key, type] of TYPES) {
        if ((inp[key] && !pr[key]) || p.bufKey === key) {
          const held = p.bufKey === key ? p.bufHold : 0;       // a buffered press arrives already wound up by however long it has been held
          p.bufKey = null; p.bufT = 0;
          if (owner) { if (p.team === G.attacker) { p.charge = { type, key, t: held, ft: false }; break; } continue; }   // the defender cannot shoot until they clear
          const d = hyp(b.x - p.x, b.y - p.y);
          if (p.team === G.attacker && !b.owner && !b.holder && d < 95 && b.z < 45) { p.charge = { type, key, t: 0, ft: true }; break; }
          if (key === 'shoot') { startTackle(G, p, inp, mx, my, hasIn); return; }
        }
      }
    }
    const c = p.charge;
    if (!c) return;
    c.t += dt;
    if (c.ft) {
      const d = hyp(b.x - p.x, b.y - p.y);
      const reach = !b.holder && (owner || (!b.owner && d < PR + BR + 10 && b.z < 26));
      if (reach) shoot(G, p, c.type, clamp(0.5 + c.t * 0.7, 0.5, 0.85), true, mx, my, hasIn);
      else if (!inp[c.key] || c.t > 1.1 || (b.owner && b.owner !== p) || b.holder) {
        const tap = !inp[c.key] && c.key === 'shoot' && c.t < 0.25 && !b.holder;
        p.charge = null;
        if (tap) startTackle(G, p, inp, mx, my, hasIn);      // a quick tap near a loose ball is a poke at it
      }
    } else if (!owner) p.charge = null;
    else if (inp.skill && !pr.skill) p.charge = null;        // fake shot: skill key cancels the wind-up
    else if (!inp[c.key] && c.t < 0.18 && c.type === 'normal') {         // a quick tap on a normal shot is a fake shot; other shots just fire as a quick, weak strike
      const bs = Math.sign(b.y - p.y) || (Math.sin(p.face) >= 0 ? 1 : -1);      // the side the ball is on now
      p.charge = null; p.kickT = 0; p.fakeT = FAKE_T; p.fakeDrag = -bs; p.ballSd = -bs; p.boost = Math.max(p.boost, 0.8); p.skillCd = 0; p.stam = Math.max(0, p.stam - 1);
      ev(G, 'fake', { p });
    } else if (!inp[c.key] || c.t > C.CHG[c.type].max) shoot(G, p, c.type, clamp(c.t / C.CHG[c.type].full, 0.3, 1), false, mx, my, hasIn);
  }

  // ------------------------------------------------------------------ passing (2v2)
  // A ground pass to a teammate, led by their run.
  function passSpeed(d) {       // launch speed that carries a rolling ball d pixels and leaves it arriving at ~170 px/s
    for (let v = 200; v < 1000; v += 10) {
      const t = Math.log((v + 40) / (170 + 40)) / 0.7;       // drag: k1 = 0.7, k0 = 28, so k0 / k1 = 40
      if ((v - 170) / 0.7 - 40 * t >= d) return v;
    }
    return 1000;
  }
  function doPass(G, p, mx, my, hasIn) {
    const b = G.ball;
    // the target is the closest teammate in the direction the passer is facing (within 60 degrees either side);
    // if nobody is there, simply the closest teammate
    const fx = Math.cos(p.face), fy = Math.sin(p.face);
    let best = null, bd = 1e9, near = null, nd = 1e9;
    for (const t of G.players) {
      if (t === p || t.team !== p.team || t.state === 'away') continue;
      const dx = t.x - p.x, dy = t.y - p.y, d = hyp(dx, dy) || 1;
      if (d < nd) { nd = d; near = t; }
      if ((dx * fx + dy * fy) / d >= 0.5 && d < bd) { bd = d; best = t; }
    }
    best = best || near;
    if (!best) return;
    let d = hyp(best.x - p.x, best.y - p.y);
    const lead = Math.min(0.55, d / 450);
    const tx = clamp(best.x + best.vx * lead, 4, FW - 4), ty = clamp(best.y + best.vy * lead, 4, FH - 4);
    d = hyp(tx - b.x, ty - b.y) || 1;
    const v = passSpeed(d) * (0.94 + 0.06 * q(p.a.lng)), ang = Math.atan2(ty - b.y, tx - b.x), err = G.gauss() * lerp(0.07, 0.015, q(p.a.lng));
    b.owner = null; b.shot = null; b.spin = 0; b.z = 0; b.vz = 0;
    b.vx = Math.cos(ang + err) * v; b.vy = Math.sin(ang + err) * v;
    b.lastKicker = p; b.kickT = 0; b.lastTouch = p.team; mark(G);
    p.noCtrl = 0.15; p.kickT = 0.25; p.face = ang; p.stam = Math.max(0, p.stam - 1);
    ev(G, 'kick', { power: 0.3, p });
  }

  // ----------------------------------------------------------------- tackles
  function startTackle(G, p, inp, mx, my, hasIn, force) {
    const b = G.ball;
    const spd = hyp(p.vx, p.vy);
    const slide = force === 'slide' ? !p.exhausted : force === 'stand' ? false : inp.sprint && hasIn && !p.exhausted && !inp.jockey && spd > p.jog * 0.75;
    let dx, dy;
    const bd = hyp(b.x - p.x, b.y - p.y);
    if (!slide && bd < 66 && bd > 1) { dx = (b.x - p.x) / bd; dy = (b.y - p.y) / bd; }  // standing tackle reaches for a nearby ball
    else if (hasIn) { const l = hyp(mx, my); dx = mx / l; dy = my / l; }
    else { dx = Math.cos(p.face); dy = Math.sin(p.face); }
    p.tdx = dx; p.tdy = dy; p.tackleHit = false; p.won = false; p.beaten = false; p.bodyHit = false;
    p.face = Math.atan2(dy, dx); p.charge = null;
    if (slide) {
      const v = Math.max(spd, 210) + 170;
      p.vx = dx * v; p.vy = dy * v; p.stam = Math.max(0, p.stam - 5);
      setState(p, 'slide', 0.44);
    } else {
      const v = spd * 0.4 + 235;
      p.vx = dx * v; p.vy = dy * v;
      setState(p, 'tackle', 0.2);
    }
    ev(G, 'lunge', { p, slide });
  }

  function resolveTackle(G, t, slide) {
    const b = G.ball, o = b.owner;
    t.tackleHit = true;
    const knock = (sp, jit) => {
      const an = Math.atan2(t.tdy, t.tdx) + (G.rand() - 0.5) * jit;
      b.vx = Math.cos(an) * sp; b.vy = Math.sin(an) * sp;
      b.lastKicker = t; b.kickT = 0; b.lastTouch = t.team; b.shot = null; b.spin = 0; mark(G);
    };
    if (!o) { knock(slide ? 400 : 230, 0.4); t.won = true; ev(G, 'tackle', { p: t, loose: true }); return; }
    if (o.team === t.team) return;
    let bonus = 0;
    if (o.state === 'skill' && o.skill) {
      const u = o.skill.t / o.skill.dur, pr = o.skill.def.prot;
      if (u >= pr[0] && u <= pr[1] && !(t.wasFocus > 0)) { t.beaten = true; ev(G, 'beaten', { p: t, by: o }); breakAnkles(G, o, t, o.skill); return; }
      bonus = t.wasFocus > 0 ? 0.24 : 0.18;
    }
    let ch = (slide ? 0.64 : 0.53) + 0.3 * q(t.a.tck)
      - 0.24 * (0.5 * q(o.a.bal) + 0.3 * q(o.a.bct) + 0.2 * q(o.a.dri)) + (t.wasJockey > 0 ? 0.18 : 0) + bonus;
    // shielding: is the owner's body between the tackler and the ball?
    const bx = b.x - o.x, by = b.y - o.y, tx = t.x - o.x, ty = t.y - o.y;
    const dot = (bx * tx + by * ty) / ((hyp(bx, by) || 1) * (hyp(tx, ty) || 1));
    if (dot < -0.15) { ch *= o.shield ? 0.3 : 0.55; ch += 0.15 * (q(t.a.str) - q(o.a.str)); }
    if (G.rand() < clamp(ch, 0.05, 0.95)) {
      b.owner = null; o.noCtrl = 0.2; o.charge = null; o.skill = null;
      setState(o, 'stumble', slide ? 0.16 : 0.1);
      t.won = true; G.stats.tackles[t.team]++;
      if (!slide && G.rand() < 0.3 + 0.5 * q(t.a.tck)) {   // clean win: ball stays at the tackler's feet
        b.vx = t.vx * 0.3 + t.tdx * 40; b.vy = t.vy * 0.3 + t.tdy * 40;
        b.shot = null; b.lastTouch = t.team; t.clean = true; mark(G);
      } else knock(slide ? 380 : 240, slide ? 0.5 : 1.4);
      ev(G, 'tackle', { p: t, on: o, slide });
    } else {
      t.beaten = true; o.boost = Math.max(o.boost, 0.3);        // rode the challenge: the dribbler keeps going, unhindered
      ev(G, 'beaten', { p: t, by: o });
    }
  }

  // Focus: while a focused defender is close to a dribbler mid-skill, every moment is a chance to read the move and take the ball.
  function tickFocus(G, p, dt) {
    const b = G.ball, o = b.owner;
    if (!o || o.team === p.team || o.state !== 'skill' || !o.skill || G.phase !== 'play') return;
    if (hyp(o.x - p.x, o.y - p.y) > 52) return;
    const rate = 0.5 + 1.1 * q(p.a.tck) - 0.7 * q(o.a.skl) - 0.04 * (o.skill.def.star - 1);
    if (G.rand() < Math.max(0.08, rate) * dt) {
      b.owner = null; o.skill = null; o.noCtrl = 0.2; o.charge = null; setState(o, 'stumble', 0.14);
      const an = Math.atan2(p.y - o.y, p.x - o.x);
      b.vx = Math.cos(an) * 90; b.vy = Math.sin(an) * 90; b.z = 0; b.shot = null; b.lastTouch = p.team; b.lastKicker = p; mark(G);
      G.stats.tackles[p.team]++; ev(G, 'tackle', { p, on: o });
    }
  }

  // Focus also positions you: you are drawn toward the spot on the line between the ball and your own goal, a jockeying distance off it,
  // so you cut off the shot and the run. Your own steering still counts; with no keys held the assist does most of the work.
  // An opposing shot in flight towards your goal: where does its path pass closest to you, and how soon does it get there?
  function shotLine(G, p) {
    const b = G.ball, sh = b.shot;
    if (!sh || sh.team === p.team || b.owner || b.holder) return null;
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 < 150 * 150 || b.vx < 60) return null;
    const t = ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / sp2;
    if (t < 0.02 || t > 0.9) return null;
    const px = b.x + b.vx * t, py = b.y + b.vy * t, z = b.z + b.vz * t - 0.5 * C.GRAV * t * t;
    return { px, py, t, z, dd: hyp(px - p.x, py - p.y), id: sh.id };
  }
  // Focus, caught behind the dribbler and right on their heels: lunge in with a tackle rather than watch them go.
  function autoTackle(G, p, inp) {
    const o = G.ball.owner;
    if (!o || o.team === p.team || p.chaseCd > 0 || p.exhausted) return false;
    const gdx = FW - o.x, gdy = GCY - o.y, gl = hyp(gdx, gdy) || 1;
    const along = ((p.x - o.x) * gdx + (p.y - o.y) * gdy) / gl, d = hyp(o.x - p.x, o.y - p.y);
    if (along > -4 || d > 58) return false;
    p.chaseCd = 1.4;
    startTackle(G, p, inp, (o.x - p.x) / (d || 1), (o.y - p.y) / (d || 1), true, 'stand');
    return true;
  }
  // Focus defends the shot for you: when they shoot, the defender throws themselves into the path of the ball.
  function autoBlock(G, p, inp) {
    const L = shotLine(G, p);
    if (!L || p.blockId === L.id || p.exhausted || L.dd > 105 || L.t < 0.05 || L.t > 0.65 || L.z > 34) return false;
    p.blockId = L.id;      // one decision per shot
    if (p.blockCd > 0 || G.rand() > 0.25 + 0.3 * q(p.a.tck)) return false;      // it only sometimes reads the shot in time
    p.blockCd = 3;
    const dx = L.px - p.x, dy = L.py - p.y, dl = hyp(dx, dy);
    const ux = dl > 4 ? dx / dl : 0, uy = dl > 4 ? dy / dl : 0;
    const bx = dl > 4 ? ux : Math.cos(p.face), by = dl > 4 ? uy : Math.sin(p.face);
    startTackle(G, p, inp, bx, by, true, 'slide');
    return true;
  }

  function focusSteer(G, p, hasIn, maxV, dt) {
    const b = G.ball, o = b.owner && b.owner.team !== p.team ? b.owner : null;
    const gx = FW, tx0 = o ? o.x + o.vx * 0.12 : b.x, ty0 = o ? o.y + o.vy * 0.12 : b.y;      // aim where they are about to be, not where they were
    const dx = gx - tx0, dy = GCY - ty0, dl = hyp(dx, dy) || 1;
    const L = shotLine(G, p);
    if (L) {      // a shot is on its way: get onto its path
      const ex = L.px - p.x, ey = L.py - p.y, ed = hyp(ex, ey), k = 1 - Math.exp(-18 * dt);
      const sp = Math.min(p.top * 1.1, ed / Math.max(L.t, 0.12));
      if (ed > 2) { p.vx += (ex / ed * sp - p.vx) * k; p.vy += (ey / ed * sp - p.vy) * k; }
      return;
    }
    // stand on the line from the dribbler to the middle of the goal; the closer they are to shooting range, the tighter the cover
    const gap = o ? clamp(dl * 0.2, 46, 96) + 10 * (1 - q(p.a.tck)) : 70;
    const ux = dx / dl, uy = dy / dl;
    let tx = tx0 + ux * Math.min(gap, dl), ty = ty0 + uy * Math.min(gap, dl);
    // never cut through the dribbler: if you are level with or behind them, swing round the side to get goal-side again
    const rx = p.x - tx0, ry = p.y - ty0, along = rx * ux + ry * uy, side = rx * -uy + ry * ux;
    if (o && along < gap * 0.6) { const sg2 = side >= 0 ? 1 : -1, sw = clamp(1 - along / (gap * 0.6), 0, 1.5); tx += -uy * sg2 * 44 * sw; ty += ux * sg2 * 44 * sw; }
    const ex = tx - p.x, ey = ty - p.y, ed = hyp(ex, ey);
    // desired velocity: travel with the dribbler, plus whatever closes the gap to the spot between them and the goal
    let vx = (o ? o.vx : 0) + ex * 9, vy = (o ? o.vy : 0) + ey * 9;
    const vl = hyp(vx, vy);
    const behind = o && along < 0;
    const cap = behind ? maxV * 1.08 : maxV;       // caught behind the dribbler: sprint to get back at them
    if (vl > cap) { vx *= cap / vl; vy *= cap / vl; }
    const k = 1 - Math.exp(-(hasIn ? 9 : 20) * dt);       // your keys still steer a little; with none held the assist does the work
    p.vx += (vx - p.vx) * k; p.vy += (vy - p.vy) * k;
  }

  // Shoulder: a short barge at the dribbler. Strong defenders win the ball; a dribbler mid-move is harder to hit.
  function startShoulder(G, p, inp, mx, my, hasIn) {
    const o = other(G, p), od = hyp(o.x - p.x, o.y - p.y) || 1;
    let dx, dy;
    if (od < 140 && o.state !== 'away') { dx = (o.x - p.x) / od; dy = (o.y - p.y) / od; }
    else if (hasIn) { dx = mx; dy = my; } else { dx = Math.cos(p.face); dy = Math.sin(p.face); }
    p.tdx = dx; p.tdy = dy; p.bodyHit = false; p.face = Math.atan2(dy, dx); p.charge = null; p.shCd = 0.9;
    const v = hyp(p.vx, p.vy) * 0.4 + 250;
    p.vx = dx * v; p.vy = dy * v; p.stam = Math.max(0, p.stam - 5);
    setState(p, 'shoulder', 0.34);
    ev(G, 'lunge', { p, slide: false });
  }
  function updateShoulder(G, p, dt) {
    const b = G.ball, o = other(G, p);
    p.stT += dt;
    const f = Math.exp(-5 * dt); p.vx *= f; p.vy *= f;
    if (!p.bodyHit && p.stT > 0.03 && p.stT < 0.24 && o.state !== 'away' && hyp(o.x - p.x, o.y - p.y) < PR * 2 + 7) {
      p.bodyHit = true;
      const has = b.owner === o;
      let P = 0.5 + 0.6 * (q(p.a.str) - (0.6 * q(o.a.bal) + 0.4 * q(o.a.str)));
      if (o.state === 'skill') P *= 0.55;
      if (o.shield) P *= 0.5;
      o.vx += p.tdx * 130; o.vy += p.tdy * 130;
      if (has && G.phase === 'play' && G.rand() < clamp(P, 0.08, 0.85)) {
        b.owner = null; o.skill = null; o.charge = null; o.noCtrl = 0.22; setState(o, 'stumble', 0.18);
        b.vx = p.tdx * 150 + p.vx * 0.3; b.vy = p.tdy * 150 + p.vy * 0.3; b.z = 0; b.shot = null; b.lastTouch = p.team; b.lastKicker = p; mark(G);
        G.stats.tackles[p.team]++; ev(G, 'bump', { p, on: o });
      } else { o.jostle = 0.45; p.vx *= 0.3; p.vy *= 0.3; }
    }
    if (p.stT >= p.stDur) setState(p, 'free');
  }

  function updateTackle(G, p, dt) {
    const b = G.ball, slide = p.state === 'slide';
    p.stT += dt;
    const f = Math.exp(-(slide ? 2.6 : 6) * dt);
    p.vx *= f; p.vy *= f;
    const active = p.stT > 0.015 && p.stT < (slide ? 0.37 : 0.17);
    if (active && !p.tackleHit && !b.holder && b.z < 22) {
      const reach = slide ? 21 : 18, r = slide ? 17 : 15;
      if (hyp(b.x - (p.x + p.tdx * reach), b.y - (p.y + p.tdy * reach)) < r + BR || hyp(b.x - p.x, b.y - p.y) < PR + BR) resolveTackle(G, p, slide);
    }
    if (slide && active && !p.bodyHit) {
      const o = other(G, p);
      if (hyp(o.x - p.x, o.y - p.y) < PR * 2 + 2 && (o.state === 'free' || o.state === 'skill')) {
        p.bodyHit = true; o.jostle = 0.5; o.vx *= 0.6; o.vy *= 0.6;
      }
    }
    if (p.stT >= p.stDur) {
      const ag = q(p.a.agi);
      if (slide) setState(p, 'down', p.won ? 0.1 : 0.22 - 0.07 * ag);          // straight back on the feet: play carries on
      else setState(p, 'recover', p.won ? 0.03 : (p.beaten ? 0.16 : 0.12) - 0.05 * ag);
      p.clean = false;
    }
  }

  // ----------------------------------------------------------------- players
  function makePlayer(def, team, idx) {
    const a = def.attr;
    const top = topSpeed(a);
    return {
      kind: 'p', def, a, team, idx: idx || 0, dir: 1, x: 0, y: 0, vx: 0, vy: 0, face: 0,
      top, jog: top * JOG, state: 'free', stT: 0, stDur: 0, stam: 100, exhausted: false,
      charge: null, skill: null, chord: null, noCtrl: 0, kickT: 0, fakeT: 0, fakeDrag: 0, jostle: 0, skillCd: 0, boost: 0, wasJockey: 0, wasFocus: 0, focus: false, shCd: 0, chaseCd: 0, blockId: 0, blockCd: 0,
      bufSkill: null, bufKey: null, bufT: 0, bufHold: 0, animDist: 0, runPh: 0, latSign: 0, rollT: 0, rollSd: 0, ballSd: 0, dribPh: 0, prev: {}, sprinting: false, shield: false, jock: false, contact: false,
      tdx: 1, tdy: 0, tackleHit: false, won: false, beaten: false, bodyHit: false, clean: false,
    };
  }
  function resetPlayer(p) {
    p.vx = p.vy = 0; p.state = 'free'; p.stT = 0; p.charge = null; p.skill = null; p.chord = null;
    p.noCtrl = p.kickT = p.fakeT = p.jostle = p.skillCd = p.boost = p.wasJockey = p.wasFocus = p.shCd = 0; p.focus = false;
    p.sprinting = p.shield = p.jock = p.contact = false; p.latSign = 0; p.rollT = 0; p.bufSkill = null; p.bufKey = null; p.bufT = 0;
  }

  // Roles. You attack while your team last had the ball (you or a teammate holds it, or it was last touched by your side); the moment the
  // other side gets it you are defending. Attack keys do nothing while defending and defence keys do nothing while attacking, so keys can be shared.
  const isAttacking = (G, p) => G.ball.owner ? G.ball.owner.team === p.team : (G.ball.lastTouch === 0 || G.ball.lastTouch === 1) ? G.ball.lastTouch === p.team : G.attacker === p.team;
  function updatePlayer(G, p, raw, dt) {
    const inp = Object.assign({}, raw);
    p.atk = isAttacking(G, p);
    if (p.atk) inp.tackle = inp.slide = inp.shoulder = inp.focus = false;
    else inp.finesse = inp.chip = inp.lob = inp.j = inp.k = inp.l = inp.skill = inp.pass = false;      // defenders keep shoot: it is the standing tackle
    const a = p.a, b = G.ball;
    p.noCtrl = Math.max(0, p.noCtrl - dt); p.kickT = Math.max(0, p.kickT - dt); p.fakeT = Math.max(0, p.fakeT - dt);
    p.jostle = Math.max(0, p.jostle - dt); p.skillCd = Math.max(0, p.skillCd - dt); p.rollT = Math.max(0, p.rollT - dt);
    p.boost = Math.max(0, p.boost - dt); p.wasJockey = Math.max(0, p.wasJockey - dt); p.wasFocus = Math.max(0, p.wasFocus - dt); p.shCd = Math.max(0, p.shCd - dt); p.chaseCd = Math.max(0, p.chaseCd - dt); p.blockCd = Math.max(0, p.blockCd - dt);
    p.aim = inp.ax != null ? { x: inp.ax, y: inp.ay } : null;
    let mx = inp.mx || 0, my = inp.my || 0, ml = hyp(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    const hasIn = ml > 0.15;
    const spd = hyp(p.vx, p.vy);
    p.sprinting = false; p.shield = false; p.jock = false; p.focus = false;

    if (p.state === 'free' && inp.pass && !p.prev.pass && b.owner === p && !p.charge && !G.drill) doPass(G, p, mx, my, hasIn);
    // Input buffering. A press is never thrown away because it came a moment early: a skill chord or a shoot / tackle press made
    // while the player is still finishing something (a move, a lunge, a stumble, a cooldown) is held briefly and fires the
    // instant it can. Moves chain into moves and into shots without the player having to time the gap.
    {
      // a skill chord: the first J/K/L press opens a very short window in which the other keys can join it
      const keys = (inp.j ? 1 : 0) | (inp.k ? 2 : 0) | (inp.l ? 4 : 0);
      if (p.chord) { p.chord.t += dt; p.chord.mask |= keys; if (p.chord.t >= 0.036) { p.bufSkill = { mask: p.chord.mask, t: 0.3 }; p.chord = null; } }
      else if (keys && !(p.prev.j || p.prev.k || p.prev.l)) p.chord = { t: 0, mask: keys };
      if (p.bufSkill && (p.bufSkill.t -= dt) <= 0) p.bufSkill = null;
      if (p.state !== 'free' || p.noCtrl > 0) for (const key of ['shoot', 'finesse', 'chip', 'lob']) if (inp[key] && !p.prev[key]) { p.bufKey = key; p.bufT = 0.2; p.bufHold = 0; }
      if (p.bufKey && inp[p.bufKey]) { p.bufHold += dt; p.bufT = Math.max(p.bufT, 0.12); }      // still held: it keeps waiting, and keeps charging
      if (p.bufKey && (p.bufT -= dt) <= 0) p.bufKey = null;
    }
    if (p.state === 'free') {
      if (p.bufSkill && b.owner === p && p.skillCd <= 0 && !p.charge && !G.drill) startSkill(G, p, inp, mx, my, hasIn, p.bufSkill.mask);
      else if (inp.focus && b.owner !== p && (autoBlock(G, p, inp) || autoTackle(G, p, inp))) { /* slid in to block the shot, or lunged at a dribbler who got past */ }
      else if (inp.shoulder && !p.prev.shoulder && p.shCd <= 0 && !G.drill) startShoulder(G, p, inp, mx, my, hasIn);
      else if (b.owner !== p && ((inp.tackle && !p.prev.tackle) || (inp.slide && !p.prev.slide))) {
        // dedicated defensive keys: they share keys with the attacking ones, and only act when you are not the one on the ball
        startTackle(G, p, inp, mx, my, hasIn, inp.slide && !p.prev.slide ? 'slide' : 'stand');
      } else handleCharge(G, p, inp, mx, my, hasIn, dt);
    }
    if (p.state === 'free') {
      const owner = b.owner === p;
      // Focus: a held defensive stance. Side-on, eyes on the ball, it blunts a dribbler's moves (see tickFocus) and costs stamina.
      const foc = !!inp.focus && !owner && !p.exhausted && !p.charge;
      const jock = !!inp.jockey || foc;
      let maxV;
      if (jock) {
        maxV = p.jog * (owner ? 0.6 : 0.92);      // a jockeying defender backs off almost as fast as they jog
        if (owner) p.shield = true; else { p.jock = true; p.wasJockey = 0.4; }
        if (foc) { const ob = b.owner && b.owner.team !== p.team ? b.owner : null; if (ob) maxV = clamp(hyp(ob.vx, ob.vy) * 1.15, p.top * 0.85, p.top * 1.02); }      // focus matches the dribbler's pace
        if (foc && !b.owner && shotLine(G, p)) maxV = p.top;
        if (foc) { p.focus = true; p.wasFocus = 0.45; p.stam = Math.max(0, p.stam - 8 * dt); tickFocus(G, p, dt); }
      } else if (inp.sprint && hasIn && !p.exhausted) { maxV = p.top; p.sprinting = true; }
      else maxV = p.jog;
      maxV *= 0.86 + 0.14 * clamp(p.stam / 40, 0, 1);
      if (owner) maxV *= 0.9 + 0.08 * q(a.dri);
      if (p.charge) {      // the more it is wound up, the slower you move: no walking around at full power
        const f = p.charge.ft ? 0 : clamp(p.charge.t / C.CHG[p.charge.type].full, 0, 1);
        maxV *= 0.8 - 0.55 * f;
      }
      if (G.drill && owner) maxV = 0;       // drills are taken from the spot: you aim, you don't dribble
      // a dribbler with a focused defender close by cannot burst away: the sprint and the skill-move boost are dampened
      const hemmed = owner && G.players.some((d) => d.team !== p.team && d.wasFocus > 0.3 && hyp(d.x - p.x, d.y - p.y) < 130);
      if (hemmed) {
        if (p.sprinting) maxV *= 0.94;
        // a focused defender right in front is a wall: driving straight at them is slow, and you cannot just dribble by
        const dfn = G.players.find((d) => d.team !== p.team && d.wasFocus > 0.3 && hyp(d.x - p.x, d.y - p.y) < 62);
        if (dfn && (dfn.x - p.x) * p.vx + (dfn.y - p.y) * p.vy > 0) maxV *= 0.88;
      }
      else if (p.boost > 0) maxV *= 1.1;
      if (p.jostle > 0) maxV *= 0.85;
      // Velocity eases straight toward what the stick asks for (no linear ramp): most of a start, stop or cut happens in the
      // first tenth of a second, so the player answers the keys at once. Acceleration sets how fast, agility sharpens cuts.
      let rate = (10.5 + 6 * q(a.acc)) * (p.boost > 0 ? 1.3 : 1) * (jock ? 1.5 : 1);
      if (!hasIn) rate = 15;
      else if (spd > 40 && (p.vx * mx + p.vy * my) / (spd * ml) < 0.5) rate *= 1.15 + 0.35 * q(a.agi);
      const kf = 1 - Math.exp(-rate * dt);
      p.vx += ((hasIn ? mx * maxV : 0) - p.vx) * kf; p.vy += ((hasIn ? my * maxV : 0) - p.vy) * kf;
      if (!hasIn && spd < 6) p.vx = p.vy = 0;
      if (p.focus) focusSteer(G, p, hasIn, maxV, dt);      // after the stop-dead check, or a standing player is never moved
      if (p.sprinting && spd > p.jog * 0.8) {
        p.stam -= (10 + 8 * (1 - q(a.sta))) * dt;
        if (p.stam <= 0) { p.stam = 0; p.exhausted = true; }
      } else {
        p.stam = Math.min(100, p.stam + (4.5 + 5 * q(a.sta)) * (spd < 30 ? 1.6 : 1) * dt);
        if (p.exhausted && p.stam >= 22) p.exhausted = false;
      }
      let want = null;
      if (p.jock) want = Math.atan2(b.y - p.y, b.x - p.x);
      else if (hasIn) want = Math.atan2(my, mx);
      if (want !== null) {
        // no turning phase: the body swings straight onto the line of travel, and from a standstill it simply faces that way
        const tr = (16 + 10 * q(a.agi)) * (owner ? 0.85 + 0.15 * q(a.dri) : p.jock ? 1.6 : 1) * dt;
        if (!p.jock && spd < 45) p.face = want; else p.face += clamp(angDiff(p.face, want), -tr, tr);
      }
      // a change of horizontal direction with the ball: roll it across the body with the sole (see updateBall)
      const lat = Math.abs(p.vy) > 28 ? Math.sign(p.vy) : 0;
      if (lat && p.latSign && lat !== p.latSign && owner) { p.rollT = 0.26; p.rollSd = lat; }
      if (lat) p.latSign = lat;
    } else if (p.state === 'tackle' || p.state === 'slide') updateTackle(G, p, dt);
    else if (p.state === 'shoulder') updateShoulder(G, p, dt);
    else if (p.state === 'skill') updateSkill(G, p, dt);
    else {
      const f = Math.exp(-(p.state === 'recover' ? 5 : 7) * dt);
      p.vx *= f; p.vy *= f; p.stT += dt;
      p.stam = Math.min(100, p.stam + 3 * dt);
      if (p.state !== 'celebrate' && p.stT >= p.stDur) setState(p, 'free');
    }
    const oy = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    { const v = hyp(p.vx, p.vy), st = v * dt; p.animDist += st; p.runPh += (st / (C.STRIDE * (1 + 0.3 * clamp(v / p.top, 0, 1)))) * Math.PI * 2; }      // stride phase: feet and ball touches share it
    p.x = clamp(p.x, -18, FW + 18); p.y = clamp(p.y, -18, FH + 18);
    if (p.x > FW - 5 && p.y > GY0 - 10 && p.y < GY1 + 10) {   // the goal is solid: slide along it
      if (oy <= GY0 - 10) p.y = GY0 - 10; else if (oy >= GY1 + 10) p.y = GY1 + 10; else p.x = FW - 5;
    }
    p.prev = snapPrev(raw);      // the raw keys: a key held through a change of role is not a fresh press
  }

  function collideBodies(G) {
    const P = G.players, b = G.ball;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const A = P[i], B = P[j], key = i * 8 + j;
      if (G.solo || A.state === 'celebrate' || B.state === 'celebrate') continue;
      let dx = B.x - A.x, dy = B.y - A.y, d = hyp(dx, dy);
      const min = PR * 2 - 2;
      if (d < min) {
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d, ov = min - d;
        const heavy = (p) => (0.6 + q(p.a.str)) * (p.state === 'slide' ? 2 : 1) * (p.shield ? 1.3 : 1);
        const mA = heavy(A), mB = heavy(B), tot = mA + mB;
        A.x -= nx * ov * (mB / tot); A.y -= ny * ov * (mB / tot);
        B.x += nx * ov * (mA / tot); B.y += ny * ov * (mA / tot);
        const closing = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
        if (closing > 0) {
          A.vx -= nx * closing * 0.5 * (mB / tot); A.vy -= ny * closing * 0.5 * (mB / tot);
          B.vx += nx * closing * 0.5 * (mA / tot); B.vy += ny * closing * 0.5 * (mA / tot);
        }
        if (!G.pairs[key]) {       // shoulder challenge on first contact (between opponents only)
          const o = b.owner, df = o === A ? B : o === B ? A : null;
          if (df && df.team !== o.team && o.state === 'free' && df.state === 'free' && closing > 110 && G.phase === 'play') {
            let Pb = clamp(0.1 + 0.55 * (q(df.a.str) - (0.6 * q(o.a.bal) + 0.4 * q(o.a.str))), 0.02, 0.45);
            if (o.shield) Pb *= 0.5;
            if (G.rand() < Pb) {
              b.owner = null; o.noCtrl = 0.16; setState(o, 'stumble', 0.1);
              const s = o === A ? -1 : 1;
              b.vx += nx * s * 120; b.vy += ny * s * 120; b.lastTouch = df.team; mark(G);
              ev(G, 'bump', { p: df, on: o });
            } else o.jostle = 0.35;
          }
        }
        G.pairs[key] = true;
      } else if (d > min + 4) G.pairs[key] = false;
    }
    for (const p of G.players) for (const k of G.keepers) {
      const dx = p.x - k.x, dy = p.y - k.y, d = hyp(dx, dy), min = PR * 2;
      if (d < min && d > 0.01) { p.x += (dx / d) * (min - d); p.y += (dy / d) * (min - d); }
    }
  }

  // -------------------------------------------------------------------- ball
  function ballMotion(s, dt, spinF) {
    let sp = hyp(s.vx, s.vy);
    if (s.spin && sp > 60) {
      const acc = s.spin * spinF * 560 * (sp / 500);
      const nx = -s.vy / sp, ny = s.vx / sp;
      s.vx += nx * acc * dt; s.vy += ny * acc * dt;
      s.spin *= Math.exp(-0.9 * dt);
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.z > 0 || s.vz > 0) {
      s.vz -= C.GRAV * dt; s.z += s.vz * dt;
      if (s.z <= 0) {
        s.z = 0;
        if (s.vz < -90) { s.vz = -s.vz * 0.48; s.vx *= 0.84; s.vy *= 0.84; s.bounced = true; } else s.vz = 0;
      }
    }
    const air = s.z > 1, k1 = air ? 0.2 : 0.7, k0 = air ? 0 : 28;
    sp = hyp(s.vx, s.vy);
    if (sp > 0) { const ns = Math.max(0, sp - (k1 * sp + k0) * dt); s.vx *= ns / sp; s.vy *= ns / sp; }
  }

  // Where (y, z, time) will the ball cross the vertical line x = xPlane?
  function predict(b, xPlane, spinF) {
    const s = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, spin: b.spin };
    const side = Math.sign(xPlane - s.x);
    if (!side) return { y: s.y, z: s.z, t: 0 };
    for (let t = 0; t < 1.6; t += 1 / 60) {
      const px = s.x, py = s.y, pz = s.z;
      ballMotion(s, 1 / 60, spinF);
      if ((xPlane - s.x) * side <= 0) {
        const f = (xPlane - px) / (s.x - px || 1e-6);
        return { y: py + (s.y - py) * f, z: pz + (s.z - pz) * f, t: t + f / 60 };
      }
      if (Math.abs(s.vx) < 15) return null;
    }
    return null;
  }
  ISO.predict = predict;

  const POSTS = [[FW, GY0], [FW, GY1]];

  function updateBall(G, dt) {
    const b = G.ball, live = G.phase === 'play';
    b.kickT += dt; b.ptT = Math.max(0, b.ptT - dt);
    if (b.ptT <= 0) b.pass = null;
    if (b.holder) return;

    // dribbling: the owner steers the ball toward a touch point ahead of the feet
    if (b.owner) {
      const p = b.owner;
      if (p.state !== 'skill') {
        const d = hyp(b.x - p.x, b.y - p.y);
        if (p.state !== 'free' || d > 52 || b.z > 28) b.owner = null;
        else {
          const sp = hyp(p.vx, p.vy), sf = sp / p.top, dri = q(p.a.dri);
          let fx = Math.cos(p.face), fy = Math.sin(p.face);
          p.dribPh = p.runPh;
          let lead = 10 + sf * (p.sprinting ? 16 : 7) * (1.35 - 0.6 * dri) + Math.sin(p.dribPh * 2) * (0.6 + sf * 3);  // close control: one touch per step
          // lateral touches: the ball is nudged from foot to foot, more so when moving across the pitch
          const latK = sp > 20 ? Math.abs(p.vy) / sp : 0;
          let side = Math.sin(p.dribPh) * (1.1 + 2.7 * latK) * clamp(sf * 2.2, 0, 1), ry = 0;
          if (p.rollT > 0) ry = p.rollSd * lerp(-7, 3.5, sm(1 - p.rollT / 0.26));      // sole roll on a change of horizontal direction
          let shielding = false;
          if (p.shield) {
            const o = other(G, p), ox = p.x - o.x, oy = p.y - o.y, od = hyp(ox, oy);
            if (od < 95 && od > 1) { fx = ox / od; fy = oy / od; lead = 14; side = 0; ry = 0; shielding = true; }
          }
          // the ball is always carried beside the player on screen (screen horizontal is sim y), never in front of or
          // behind the body where the figure hides it. Travelling sideways it sits on the trailing side, by the opposite
          // foot; otherwise it stays on the side it was last on. A fake shot drags it across to the other side.
          let lx = 0, latM = 0;
          if (!p.ballSd) p.ballSd = b.y >= p.y ? 1 : -1;
          if (!p.shield && sp > 20) latM = clamp((Math.abs(p.vy) / sp - 0.3) / 0.4, 0, 1) * clamp(sf * 2.2, 0, 1);
          if (latM > 0.5) p.ballSd = -Math.sign(p.vy);
          if (p.fakeT > 0) lx = p.fakeDrag * 19 * lerp(-1, 1, sm(1 - p.fakeT / FAKE_T));      // fake shot: drag it to the other side
          else if (!shielding) lx = p.ballSd * (19 + 1.5 * Math.sin(p.dribPh) * clamp(sf * 2.2, 0, 1));
          const lk = shielding ? 1 : 0.45;
          let ax = fx * lead * lk;
          if (!shielding && ax > 0) ax *= 0.3;      // up the screen the body would cover a ball pushed ahead: keep it level with the feet
          const tx = p.x + ax - fy * side, ty = p.y + fy * lead * lk * (1 - latM) + fx * side + ry + lx;
          const k = (8 + 7 * dri) * (p.sprinting ? 0.8 : 1);
          const wx = p.vx + (tx - b.x) * k, wy = p.vy + (ty - b.y) * k;
          const bl = Math.min(1, (10 + 10 * q(p.a.bct)) * dt);
          b.vx += (wx - b.vx) * bl; b.vy += (wy - b.vy) * bl;
          b.driven = true;
        }
      }
    }
    if (b.driven) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (!b.zDriven && (b.z > 0 || b.vz > 0)) { b.vz -= C.GRAV * dt; b.z += b.vz * dt; if (b.z <= 0) { b.z = 0; b.vz = 0; } }
    } else {
      b.bounced = false;
      ballMotion(b, dt, 1);
      if (b.bounced) ev(G, 'bounce');
    }
    b.driven = false; b.zDriven = false;
    const speed = hyp(b.vx, b.vy);
    b.rot += speed * dt * 0.035;
    if (b.shot && speed < 120 && b.z < 2) b.shot = null;

    if (b.inNet !== null) {       // settled in the back of the net
      const s = b.inNet === 0 ? -1 : 1, edge = b.inNet === 0 ? 0 : FW;
      const back = edge + s * (GD - BR);
      if ((b.x - back) * s > 0) { b.x = back; b.vx *= -0.15; }
      if (b.y < GY0 + BR) { b.y = GY0 + BR; b.vy *= -0.2; }
      if (b.y > GY1 - BR) { b.y = GY1 - BR; b.vy *= -0.2; }
      if (b.z > BAR - 8) { b.z = BAR - 8; b.vz = 0; }
      const f = Math.exp(-5 * dt); b.vx *= f; b.vy *= f;
      return;
    }

    // ball vs player bodies
    for (const p of G.players) {
      const dx = b.x - p.x, dy = b.y - p.y, d = hyp(dx, dy);
      if (p === b.owner) {
        if (d < 8 && d > 0.01) { b.x = p.x + (dx / d) * 8; b.y = p.y + (dy / d) * 8; }
        continue;
      }
      if (b.z >= 24 || d >= PR + BR - 1) continue;
      if ((b.pass === p && b.ptT > 0) || (p === b.lastKicker && b.kickT < 0.25)) continue;
      const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
      b.x = p.x + nx * (PR + BR - 1); b.y = p.y + ny * (PR + BR - 1);
      const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (vn < 0) {
        b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny;
        if (!b.owner) {
          b.lastTouch = p.team;
          if (-vn > 220) { ev(G, 'block', { p }); b.shot = null; b.spin = 0; if (G.shotTaken) G.armed = true; mark(G); }
        }
      }
    }

    // possession
    if (live && b.z < 22) {
      if (!b.owner) {
        let best = null, bd = 1e9;
        for (const p of G.players) {
          if (p.state !== 'free' || p.noCtrl > 0) continue;
          if ((b.pass === p && b.ptT > 0) || (p === b.lastKicker && b.kickT < 0.3)) continue;
          const d = hyp(b.x - p.x, b.y - p.y);
          if (d < PR + BR + 9 && d < bd) { best = p; bd = d; }
        }
        if (best) {
          const p = best, rvx = b.vx - p.vx, rvy = b.vy - p.vy, rel = hyp(rvx, rvy);
          const thr = 300 + 450 * q(p.a.bct);
          if (!(b.shot && rel > thr)) {       // too hot to bring down -> body collision handles it
            const heavy = clamp(rel / thr, 0, 1) * (1.1 - 0.8 * q(p.a.bct));    // first touch
            b.vx = p.vx + rvx * heavy * 0.55; b.vy = p.vy + rvy * heavy * 0.55;
            b.owner = p; b.shot = null; b.spin = 0; b.lastTouch = p.team;
            if (rel > 200) ev(G, 'touch', { p });
          }
        }
      } else {
        // a long touch can be nicked by a defender who gets to the ball first
        const p = b.owner;
        if (p.state === 'free' && hyp(b.x - p.x, b.y - p.y) > 27) {
          for (const o of G.players) {
            if (o.team === p.team || o.state !== 'free' || o.noCtrl > 0 || hyp(b.x - o.x, b.y - o.y) >= PR + BR + 3) continue;
            p.noCtrl = 0.16; b.owner = o; b.lastTouch = o.team; ev(G, 'steal', { p: o, on: p });
            break;
          }
        }
      }
    }

    // goal frame
    if (b.z < BAR + 4) {
      for (const [px, py] of POSTS) {
        const dx = b.x - px, dy = b.y - py, d = hyp(dx, dy);
        if (d < BR + 4 && d > 0.01) {
          const nx = dx / d, ny = dy / d;
          b.x = px + nx * (BR + 4); b.y = py + ny * (BR + 4);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 1.65 * vn * nx; b.vy -= 1.65 * vn * ny; b.spin *= 0.3;
            if (-vn > 60) { ev(G, 'post', { power: clamp(-vn / 500, 0.2, 1) }); mark(G); }
          }
        }
      }
    }
    if (!live) return;

    if (b.x > FW + BR) {
      if (b.y > GY0 && b.y < GY1) {
        if (b.z > BAR + 5) return ballOut(G, 'out');
        if (b.z > BAR - 5) {            // crossbar
          b.x = FW + BR - 1; b.vx = -b.vx * 0.55; b.vz = -Math.abs(b.vz) * 0.4; b.z = BAR - 6;
          ev(G, 'post', { power: 0.9 }); mark(G); return;
        }
        return goal(G);
      }
      return ballOut(G, 'out');
    }
    if (b.x < -BR || b.y < -BR || b.y > FH + BR) return ballOut(G, 'out');
    if (!(b.x === b.x) || !(b.y === b.y)) { b.x = FW / 2; b.y = GCY; b.vx = b.vy = b.vz = 0; b.z = 0; }   // NaN guard
  }

  const isPlayerTeam = (t) => t === 0 || t === 1;

  function goal(G) {
    if (G.drill) return drillGoal(G);
    const b = G.ball;
    // the scorer is whoever last touched it; a keeper deflection into the net still counts for the shooter
    const t = isPlayerTeam(b.lastTouch) ? b.lastTouch : b.shotTeam >= 0 ? b.shotTeam : G.attacker;
    if (b.shot && b.shot.type === 'power' && b.shot.team === t) G.stats.powerGoals[t]++;
    G.score[t]++; G.phase = 'goal'; G.phaseT = G.goalDur = G.replay ? C.REPLAY_T : C.GOAL_T; G.concede = 1 - t; G.own = false;
    b.inNet = 1; b.owner = null; b.shot = null; b.spin = 0;
    for (const p of G.players) { p.charge = null; if (p.state === 'skill') { p.skill = null; setState(p, 'free'); } }
    const kk = b.lastKicker, sc = kk && kk.kind === 'p' && kk.team === t ? kk : G.players.find((p) => p.team === t);
    setState(sc, 'celebrate');
    if (G.score[t] >= G.win) G.winner = t;
    G.goals.push({ team: t, time: G.time, own: false, by: sc.idx });
    ev(G, 'goal', { team: t, own: false });
  }

  // End the rep without a goal. `next` attacks the next rep.
  function endRep(G, kind, next) {
    if (G.drill) return drillResolve(G, 'miss');
    const b = G.ball;
    G.phase = 'out'; G.phaseT = C.OUT_T;
    G.outInfo = { kind, team: next };
    G.next = next;
    b.owner = null; b.shot = null; b.spin = 0;
    for (const p of G.players) p.charge = null;
    ev(G, 'out', { kind });
  }
  // out of play: the ball goes to whoever was defending
  const ballOut = (G, kind) => endRep(G, kind, 1 - G.attacker);

  // Rebound rule: once a shot has gone in (or a block has stopped it), the ball has to be cleared out of the box.
  // A clear is counted, play continues, and the clearer becomes the attacker. Only the attacker may shoot: a defender who has the ball must first get it outside the box.
  function drillCheck(G) {
    if (G.phase !== 'play') return;
    const b = G.ball;
    if (b.inNet !== null || b.holder) return;
    const inb = inBox(b);
    if (G.shotTaken && inb) G.armed = true;
    if (G.armed && !inb && !b.shot && isPlayerTeam(b.lastTouch)) {
      G.stats.clears[b.lastTouch]++;
      ev(G, 'clear', { team: b.lastTouch });
      G.attacker = b.lastTouch;                   // the clearer is now the attacker and may shoot
      G.armed = false; G.shotTaken = false;       // play carries on; a new shot re-arms the rebound rule
    } else if (!G.armed && !inb && b.owner && b.owner.team !== G.attacker) {
      G.attacker = b.owner.team;                  // won it back outside the box: already clear
    }
  }

  // ----------------------------------------------------------------- drills
  // One player against a keeper, in a fixed number of attempts. Each attempt ends with a goal, a save or a miss: there are no rebounds.
  //   penalty: 5 penalties against a live keeper.   target: 10 shots at a lit corner of the goal (3 points, any other goal 1).
  //   chip:    6 chances to lob a keeper who has come off his line (only a chip shot scores).
  const DRILLS = {
    penalty: { name: 'PENALTY SHOOTOUT', total: 5, max: 5 },
    target:  { name: 'TARGET PRACTICE', total: 10, max: 30 },
    chip:    { name: 'CHIP CHALLENGE', total: 6, max: 6 },
  };
  // the four target boxes in the goal mouth: y range along the line and ball-height range
  const TARGETS = [
    { y0: GY0, y1: GY0 + 50, z0: 30, z1: BAR, name: 'TOP LEFT' }, { y0: GY1 - 50, y1: GY1, z0: 30, z1: BAR, name: 'TOP RIGHT' },
    { y0: GY0, y1: GY0 + 50, z0: 0, z1: 30, name: 'BOTTOM LEFT' }, { y0: GY1 - 50, y1: GY1, z0: 0, z1: 30, name: 'BOTTOM RIGHT' },
  ];
  ISO.DRILLS = DRILLS; ISO.TARGETS = TARGETS;
  function makeDrill(kind, opts) {
    const d = DRILLS[kind];
    const D = { kind, name: d.name, total: d.total, max: d.max, n: 0, goals: 0, points: 0, results: [], target: -1, t: 0, still: 0, msg: '', sub: '' };
    // Penalty shootout: you and an opposing team take turns. `so` holds the shootout: whose turn it is, every kick so far,
    // the opposing takers and the plan of the one about to shoot.
    if (kind === 'penalty') D.so = { turn: 'shoot', kicks: [[], []], takers: (opts && opts.takers) || null, ti: 0, ai: null, sudden: false };
    return D;
  }
  const soGoals = (l) => l.filter((r) => r === 'goal').length;
  // -1 while the shootout is still open, otherwise the winning side (0 = you)
  function soDecided(so) {
    const a = so.kicks[0], b = so.kicks[1], ga = soGoals(a), gb = soGoals(b), N = DRILLS.penalty.total;
    if (a.length <= N && b.length <= N && (a.length < N || b.length < N)) {       // best of five: over as soon as one side cannot be caught
      if (ga > gb + (N - b.length)) return 0;
      if (gb > ga + (N - a.length)) return 1;
      return -1;
    }
    return a.length === b.length && ga !== gb ? (ga > gb ? 0 : 1) : -1;          // level after five each: sudden death, pair by pair
  }
  ISO.soDecided = soDecided;
  function setDef(p, def) { p.def = def; p.a = def.attr; p.top = topSpeed(def.attr); p.jog = p.top * JOG; }

  // The opposing taker's plan: where, how high and how hard, decided before the run-up and without looking at the keeper
  // (most of the time). Each taker has a favoured side; better finishers pick out the corners and miss the target less.
  function planPenalty(G, T, so) {
    const a = T.a, R = G.rand, fin = q(a.fin), pw = q(a.sho), cool = 0.5 * q(a.skl) + 0.5 * fin;
    const fav = T.def.foot === 'L' ? 1 : -1;                    // across the body: the natural side
    const last = so.lastSide || 0;
    let r = R(), side = r < 0.47 ? fav : r < 0.86 ? -fav : 0;
    if (side === last && R() < 0.45) side = R() < 0.6 ? -side || fav : 0;      // do not put every kick in the same place
    so.lastSide = side;
    const corner = R() < 0.25 + 0.3 * fin;                       // a proper corner, or a safer one
    const inset = corner ? 9 + R() * 9 : 20 + R() * 22;
    const y = side ? (side < 0 ? GY0 + inset : GY1 - inset) : GCY + (R() - 0.5) * 44;
    const hr = R(), z = hr < 0.55 ? 3 + R() * 11 : hr < 0.8 ? 17 + R() * 16 : 38 + R() * 15;
    const power = clamp(0.25 + R() * 0.75 * (0.55 + 0.45 * pw) + (side === 0 ? 0.15 : 0), 0, 1);
    const hon = R(), honest = 0.66 - 0.26 * cool;                 // the run-up gives the side away, unless the taker disguises it
    const tell = side === 0 ? (R() < 0.5 ? 0 : (R() < 0.5 ? -1 : 1)) : hon < honest ? side : hon < honest + 0.14 ? 0 : -side;
    return { side, y, z, power, tell, delay: 1.0 + R() * 0.7, peek: R() < 0.18 + 0.12 * cool, err: lerp(19, 6, fin) * (0.75 + 0.5 * power), t: 0, kicked: false };
  }
  function penaltyKick(G, T, so) {
    const b = G.ball, A = so.ai, k = G.keeper;
    let y = A.y;
    if (A.peek && Math.abs(k.y - GCY) > 26 && k.state === 'set') y = k.y > GCY ? GY0 + 16 + G.rand() * 14 : GY1 - 16 - G.rand() * 14;    // a late look: the keeper has gone early
    y += G.gauss() * A.err;
    const z = Math.max(1, A.z + G.gauss() * A.err * 0.45);
    const v = (420 + 250 * A.power) * (0.92 + 0.12 * q(T.a.sho));
    const dx = FW - b.x, dy = y - b.y, d = hyp(dx, dy), tm = d / (v * 0.975);
    b.owner = null; b.vx = (dx / d) * v; b.vy = (dy / d) * v; b.z = 1; b.vz = (z + 0.5 * C.GRAV * tm * tm) / tm; b.spin = 0; b.pass = null;
    b.shot = { id: ++G.shotSeq, team: 1, type: A.power > 0.8 ? 'power' : 'normal', by: T };
    b.lastKicker = T; b.kickT = 0; b.lastTouch = 1; b.shotTeam = 1; b.shotT = G.t; mark(G);
    T.kickT = 0.3; T.face = Math.atan2(dy, dx); A.kicked = true; G.drill.shot = true; G.shotTaken = true;
    ev(G, 'kick', { power: clamp(v / 800, 0.2, 1), shot: b.shot.type, p: T });
  }
  // The opposing taker: waits, runs up, strikes. Driven here rather than through the input structure because nobody controls him.
  function penaltyTaker(G, T, dt) {
    const so = G.drill.so, A = so.ai, b = G.ball;
    T.kickT = Math.max(0, T.kickT - dt);
    if (T.state !== 'free') { T.stT += dt; return; }
    let v = 0;
    if (G.phase === 'play' && A && !A.kicked) {
      A.t += dt;
      const left = A.delay - A.t, gap = b.x - 19 - T.x;
      if (left <= 0) { penaltyKick(G, T, so); }
      else if (left < 0.5) { v = clamp(gap / Math.max(left, dt), 0, T.jog * 1.15); T.face = Math.atan2(A.tell * 0.34 * clamp(1 - left / 0.5, 0, 1), 1); }
    }
    T.vx += (v - T.vx) * Math.min(1, 14 * dt); T.vy = 0;
    const st = Math.abs(T.vx) * dt;
    T.x += T.vx * dt; T.animDist += st; T.runPh += (st / C.STRIDE) * Math.PI * 2;
  }
  // You, in goal: move along the line, and dive by pressing shoot / tackle with a direction held (add up for a high dive).
  function humanKeeper(G, k, dt) {
    const inp = G.kInp || ZERO, live = G.phase === 'play';
    const lat = clamp(inp.my || 0, -1, 1);
    k.vx = 0; k.vy = lat * 150; k.x = FW - 16;
    k.y = clamp(k.y + k.vy * dt, GY0 + 12, GY1 - 12); k.animDist += Math.abs(k.vy) * dt; k.face = Math.PI;
    if (live && inp.shoot && !k.prevShoot && Math.abs(lat) > 0.3) {
      k.state = 'dive'; k.slid = false; k.stT = 0; k.diveDir = Math.sign(lat);
      k.vy = k.diveDir * (150 + 50 * q(k.a.div)); k.high = (inp.mx || 0) > 0.3;       // hold up as well to go high k.stDur = k.diveT = 0.42;
      ev(G, 'dive', { k });
    }
    k.prevShoot = !!inp.shoot;
    if (live && k.state === 'set') keeperBall(G, k);
  }

  function setupDrill(G) {
    const D = G.drill, A = G.players[0], b = G.ball, k = G.keeper;
    k.dummy = false; k.human = false;
    let x, y = GCY;
    if (D.kind === 'penalty') x = FW - C.PEN;
    else if (D.kind === 'target') { x = FW - (175 + G.rand() * 55); y = GCY + (G.rand() - 0.5) * 220; k.dummy = true; D.target = (G.rand() * 4) | 0; }
    else { x = FW - (150 + G.rand() * 70); y = GCY + (G.rand() - 0.5) * 160; k.dummy = true; k.x = FW - (58 + G.rand() * 22); k.y = GCY + (G.rand() - 0.5) * 36; }
    A.x = x - 12; A.y = y; A.face = 0;
    b.x = x; b.y = y;
    D.t = 0; D.still = 0; D.msg = ''; D.shot = false; D.touchT = 0;
    if (D.so) {
      const so = D.so, T = G.players[1];
      so.turn = so.kicks[0].length > so.kicks[1].length ? 'save' : 'shoot';
      so.sudden = so.kicks[1].length >= D.total;
      so.ai = null;
      if (so.turn === 'save') {             // their kick: you are the keeper
        A.x = A.y = -900; A.state = 'away'; b.owner = null;
        so.ti = so.kicks[1].length;
        if (so.takers && so.takers.length) setDef(T, so.takers[so.ti % so.takers.length]);
        T.state = 'free'; T.x = x - 42; T.y = y; T.face = 0; T.vx = T.vy = 0; T.noCtrl = 99; T.kickT = 0;
        k.human = true; k.prevShoot = true;
        so.ai = planPenalty(G, T, so);
      }
    }
  }
  function drillFinish(G, phase, t) {
    const b = G.ball;
    G.phase = phase; G.phaseT = G.goalDur = t; G.concede = 1;
    b.owner = null; b.shot = null; b.spin = 0;
    for (const p of G.players) p.charge = null;
  }
  function drillGoal(G) {
    const D = G.drill, b = G.ball, st = b.shot && b.shot.type;
    if (G.phase !== 'play') return;
    if (D.so) {
      const side = D.so.turn === 'shoot' ? 0 : 1;
      D.so.kicks[side].push('goal'); D.n++; G.score[side]++;
      if (!side) { D.goals++; D.points = Math.min(D.max, D.goals); }
      D.msg = side ? 'THEY SCORE' : 'GOAL!'; D.sub = '';
      drillFinish(G, 'goal', 1.15);
      b.inNet = 1;
      setState(G.players[side], 'celebrate');
      G.goals.push({ team: side, time: G.time, own: false, by: side });
      ev(G, 'goal', { team: side, own: false });
      return;
    }
    let pts = 1, msg = 'GOAL!', sub = '';
    if (D.kind === 'target') {
      const T = TARGETS[D.target], hit = b.y >= T.y0 && b.y <= T.y1 && b.z >= T.z0 && b.z <= T.z1;
      if (hit) { pts = 3; msg = 'BULLSEYE!'; sub = '+3'; } else { sub = '+1'; }
    } else if (D.kind === 'chip' && st !== 'chip') { pts = 0; msg = 'GOAL — BUT USE THE CHIP'; }
    else if (D.kind === 'chip') { msg = 'CHEEKY CHIP!'; }
    D.goals++; D.points += pts; D.n++; G.score[0] = D.points; D.msg = msg; D.sub = sub;
    D.results.push({ res: 'goal', pts });
    drillFinish(G, 'goal', 1.5);
    b.inNet = 1;
    setState(G.players[0], 'celebrate');
    G.goals.push({ team: 0, time: G.time, own: false, by: 0 });
    ev(G, 'goal', { team: 0, own: false });
  }
  function drillResolve(G, res) {
    const D = G.drill;
    if (G.phase !== 'play') return;
    if (res === 'miss' && G.ball.lastTouch === 2 && D.shot) res = 'saved';      // kept out by the keeper, even without a clean catch
    D.n++;
    if (D.so) {
      const mine = D.so.turn === 'shoot';
      D.so.kicks[mine ? 0 : 1].push(res);
      if (!mine && res === 'saved') D.saves = (D.saves || 0) + 1;
      D.msg = mine ? (res === 'saved' ? 'SAVED!' : 'MISSED') : res === 'saved' ? 'WHAT A SAVE!' : 'OFF TARGET!'; D.sub = '';
      drillFinish(G, 'out', 1.0);
      ev(G, 'out', { kind: res });
      return;
    }
    D.results.push({ res, pts: 0 });
    D.msg = res === 'saved' ? 'SAVED!' : 'MISSED'; D.sub = '';
    drillFinish(G, 'out', 1.3);
    ev(G, 'out', { kind: res });
  }
  function drillStep(G, dt) {
    const D = G.drill, b = G.ball;
    if (D.so && D.so.turn === 'save') penaltyTaker(G, G.players[1], dt);
    if (G.phase !== 'play' || !D.shot) return;
    D.t += dt;
    for (const e of G.events) if (e.type === 'save' && !e.weak && !e.slide) return drillResolve(G, 'saved');
    if (b.holder) return drillResolve(G, 'saved');
    if (b.inNet !== null) return;
    if (D.so && b.lastTouch === 2) { D.touchT += dt; if (b.vx < 20 || D.touchT > 0.45) return drillResolve(G, 'saved'); }      // the keeper got something on it and it is not going in
    D.still = hyp(b.vx, b.vy) < 14 && b.z < 2 ? D.still + dt : 0;
    if (D.still > 0.8 || D.t > (D.so ? 3.5 : 7)) drillResolve(G, 'miss');
  }

  function resetBall(b) {
    b.z = 0; b.vx = b.vy = b.vz = 0; b.spin = 0; b.owner = null; b.holder = null; b.shot = null;
    b.lastKicker = null; b.kickT = 9; b.pass = null; b.ptT = 0; b.inNet = null; b.driven = false; b.zDriven = false; b.shotTeam = -1; b.shotT = 0;
  }

  // The attacker starts on the spot 10 yards outside the box, centred on the goal, with the ball. The defender stands in front.
  function setupRep(G, atk, first) {
    if (G.solo) atk = 0;
    const b = G.ball, def = 1 - atk, As = G.players.filter((p) => p.team === atk), Ds = G.players.filter((p) => p.team === def);
    const A = As[G.rep % As.length], D = Ds[0];       // with two a side, the ball carrier alternates
    resetBall(b);
    for (const p of G.players) { resetPlayer(p); p.stam = first ? 100 : Math.min(100, p.stam + 30); p.exhausted = false; p.face = 0; p.vx = p.vy = 0; }
    resetKeeper(G.keeper);
    A.x = SPOTX; A.y = GCY; D.x = SPOTX + 46; D.y = GCY; D.face = Math.PI;     // the defender starts in front of the attacker
    const A2 = As.find((p) => p !== A), D2 = Ds[1];
    if (A2) { A2.x = SPOTX; A2.y = GCY - 150; }
    if (D2) { D2.x = SPOTX + 46; D2.y = GCY - 150; D2.face = Math.PI; }
    b.x = SPOTX + 12; b.y = GCY; b.owner = A; b.lastTouch = atk;
    if (G.solo) { D.x = D.y = -900; D.state = 'away'; }       // testing arena: nobody else on the pitch
    G.attacker = atk; G.guard = null; G.shotTaken = false; G.armed = false; G.rep++;
    G.phase = 'countdown'; G.cdTick = first ? 0.6 : G.drill ? 0.3 : 0.34;      // sim seconds per count: 3-2-1 takes 3 s of real time at kick-off, under 2 s after that G.phaseT = 3 * G.cdTick; G.lastCount = 4;
    G.msg = null; G.outInfo = null;
    if (G.drill) setupDrill(G);
  }

  // ------------------------------------------------------------- goalkeepers
  // Lower-level opponents get a weaker keeper: every rating drops by `nerf` points.
  function nerfKeeper(def, nerf) {
    if (!nerf) return def;
    const a = {};
    for (const k in def.a) a[k] = clamp(def.a[k] - nerf, 30, 99);
    return { ...def, a };
  }
  function makeKeeper(team, def) {
    return { kind: 'k', team, def, a: def.a, x: 0, y: GCY, vx: 0, vy: 0, face: team ? Math.PI : 0, state: 'set', stT: 0, stDur: 0,
      cd: 0, smCd: 0, reactT: 0, seen: -1, antic: 0, stepT: 0, stepY: 0, diveT: 0, chip: false, diveDir: 1, holdT: 0, animDist: 0, rush: 0, rushCd: 1.5, slideCd: 0, slideHit: false };
  }
  function resetKeeper(k) {
    k.x = k.team ? FW - 16 : 16; k.y = GCY; k.vx = k.vy = 0; k.state = 'set'; k.stT = 0; k.cd = 0; k.smCd = 0;
    k.chip = false; k.seen = -1; k.antic = 0; k.stepT = 0; k.face = k.team ? Math.PI : 0;
    k.rush = 0; k.rushCd = 1.5; k.slideCd = 0; k.slideHit = false; k.high = false;
  }
  function keeperHold(G, k) {
    const b = G.ball;
    b.holder = k; b.owner = null; b.shot = null; b.spin = 0; b.vx = b.vy = b.vz = 0; b.lastTouch = 2;
    k.state = 'hold'; k.holdT = 0.9; k.heldFor = 0; k.chip = false;
    G.armed = false; G.shotTaken = false;       // the rebound is over; the throw restarts the contest
  }
  // The keeper throws the ball out of the box, to a random spot in front of it, for either player to win.
  function distribute(G, k) {
    const b = G.ball;
    b.x = k.x - 16; b.y = k.y;
    const tx = FW - BOXD - 35 - G.rand() * 30, ty = clamp(GCY + (G.rand() - 0.5) * 360, 100, FH - 100);
    const dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy) || 1;
    // a high, slow lob: it goes up rather than far, lands where it was aimed and cannot run out of play
    const T = 1.15 + d / 700, sp = d / (T * 0.88);
    b.holder = null; b.vx = (dx / d) * sp; b.vy = (dy / d) * sp; b.z = 14; b.vz = (C.GRAV * T) / 2 - 14 / T;
    b.lastKicker = k; b.kickT = 0; b.lastTouch = 2; k.state = 'set'; k.cd = 0.5; mark(G);
    ev(G, 'kick', { power: 0.3 });
  }
  function keeperBall(G, k) {
    const b = G.ball;
    if (b.holder || k.cd > 0 || b.inNet !== null) return;
    const a = k.a, sg = k.team === 0 ? 1 : -1;
    let d, r, zmax;
    if (k.state === 'dive') {
      // a human keeper (penalty shootout) covers the whole outstretched body, feet to gloves
      const reach = (k.human ? 8 + 5 * q(a.div) : (C.K_REACH0 + 3 + C.K_REACH1 * q(a.div)) * (b.shot && b.shot.out ? 1.15 : 1)) * Math.min(1, k.stT / 0.1), y2 = k.y + k.diveDir * reach, y1 = k.human ? k.y - k.diveDir * 4 : k.y;
      const cy = clamp(b.y, Math.min(y1, y2), Math.max(y1, y2));
      d = hyp(b.x - k.x, b.y - cy); r = 11; zmax = k.human ? (k.high ? 60 : 30) : k.high ? 72 : 50;
      if (k.human && k.high && b.z < 15) return;        // a high dive goes over a low shot
    } else if (k.state === 'ground') {
      const cy = k.human ? clamp(b.y, Math.min(k.y - k.diveDir * 4, k.y + k.diveDir * 14), Math.max(k.y - k.diveDir * 4, k.y + k.diveDir * 14)) : k.y;
      d = hyp(b.x - k.x, b.y - cy); r = 11; zmax = 18;
    }
    else { d = hyp(b.x - k.x, b.y - k.y); r = 12; zmax = k.chip ? 68 : 50; }
    if (d > r + BR || b.z > zmax) return;
    const o = b.owner;
    if (o) {      // smothering a dribbler: a contest, not a guaranteed claim
      if (k.state !== 'set' || k.smCd > 0) return;
      k.smCd = 0.7;
      let P = 0.26 + 0.5 * q(a.ooo) - 0.12 * q(o.a.dri);
      if (o.state === 'skill') P *= 0.5;
      if (G.rand() < P) { keeperHold(G, k); o.noCtrl = 0.3; o.charge = null; G.stats.saves[o.team]++; ev(G, 'save', { k, smother: true }); }
      return;
    }
    if (b.lastKicker === k && b.kickT < 0.5) return;
    const sp = hyp(b.vx, b.vy);
    if (k.state === 'ground') {
      const dx = b.x - k.x, dy = b.y - k.y, dd = hyp(dx, dy) || 1, nx = dx / dd, ny = dy / dd, vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; }
      k.cd = 0.15; b.lastTouch = 2; mark(G); return;
    }
    if (sp < 190) { keeperHold(G, k); ev(G, 'claim', { k }); return; }
    const dive = k.state === 'dive';
    const pThrough = clamp((sp - 560) / 900, 0, 0.5) * (1.15 - 0.65 * q(a.han)) * (dive ? 1 : 0.6) * ((b.shot && b.shot.type === 'power') ? 0.45 : 1) * (b.shot && b.shot.out ? 0.6 : 1);
    if (G.rand() < pThrough) {        // too hot to handle: only slowed
      const j = (G.rand() - 0.5) * 0.5, c = Math.cos(j), s = Math.sin(j), vx = b.vx * 0.6, vy = b.vy * 0.6;
      b.vx = vx * c - vy * s; b.vy = vx * s + vy * c; b.spin = 0; k.cd = 0.4; b.lastTouch = 2; mark(G);
      ev(G, 'save', { k, weak: true }); return;
    }
    G.stats.saves[Math.max(0, b.shotTeam)]++;
    const pCatch = clamp(0.3 + 0.55 * q(a.han) - sp / 1900, 0.05, 0.9) * (dive ? 0.18 : 1) * C.K_CATCH * (b.shot && b.shot.out ? 1.25 : 1);      // a diving keeper mostly gets a hand to it and deflects it
    if (G.rand() < pCatch) { keeperHold(G, k); ev(G, 'save', { k, catch: true }); return; }
    const ang = (sg > 0 ? 0 : Math.PI) + (G.rand() - 0.5) * 2.2 + (b.y < k.y ? -1 : 1) * 0.5 * sg;
    const ns = sp * (0.3 + G.rand() * 0.2);
    b.vx = Math.cos(ang) * ns; b.vy = Math.sin(ang) * ns; b.vz = 80 + G.rand() * 120; b.spin = 0; b.shot = null;
    b.lastTouch = 2; b.lastKicker = k; b.kickT = 0; k.cd = 0.3; mark(G);
    ev(G, 'save', { k, parry: true });
  }

  function updateKeeper(G, k, dt) {
    const b = G.ball, a = k.a, left = k.team === 0, gx = left ? 0 : FW, sg = left ? 1 : -1;
    const live = G.phase === 'play';
    k.stT += dt; k.cd = Math.max(0, k.cd - dt); k.smCd = Math.max(0, k.smCd - dt);
    if (G.drill) { k.slideCd = 99; k.rushCd = 99; }       // drill keepers stay on their line
    if (k.state === 'hold') {
      k.vx = k.vy = 0;
      if (b.holder !== k) { k.state = 'set'; return; }
      b.x = k.x + sg * 9; b.y = k.y; b.z = 12; b.vx = b.vy = b.vz = 0;
      k.face = left ? 0 : Math.PI;
      if (live && !G.drill) { k.holdT -= dt; if (k.holdT <= 0) distribute(G, k); }
      return;
    }
    if (k.dummy) {          // a mannequin: stands where it is placed and only blocks what hits it
      k.vx = k.vy = 0; k.state = 'set'; k.face = left ? 0 : Math.PI;
      if (live) keeperBall(G, k);
      return;
    }
    k.rushCd = Math.max(0, k.rushCd - dt); k.slideCd = Math.max(0, k.slideCd - dt);
    if (k.state === 'slide') {          // sliding tackle at the dribbler's feet
      if (k.stT < 0.32 && !b.holder) {     // the keeper tracks the ball while sliding, so it is not a blind lunge
        const px = b.x + b.vx * 0.12 - k.x, py = b.y + b.vy * 0.12 - k.y, pd = hyp(px, py) || 1, ks = hyp(k.vx, k.vy);
        const bl = Math.min(1, 9 * dt);
        k.vx += ((px / pd) * ks - k.vx) * bl; k.vy += ((py / pd) * ks - k.vy) * bl;
        k.face = Math.atan2(k.vy, k.vx);
      }
      const f = Math.exp(-2.4 * dt);
      k.vx *= f; k.vy *= f;
      k.x = clamp(k.x + k.vx * dt, FW - BOXD + 10, FW - 6); k.y = clamp(k.y + k.vy * dt, BOXY0 + 10, BOXY1 - 10);
      const o = b.owner;
      if (live && !k.slideHit && k.stT > 0.04 && !b.holder && b.z < 30 && hyp(b.x - k.x, b.y - k.y) < 36) {
        k.slideHit = true;
        if (o) {
          let P = 0.5 + 0.4 * q(a.ooo) - 0.25 * q(o.a.dri) - 0.1 * q(o.a.bal);
          if (o.state === 'skill' && o.skill) P *= 0.5;
          if (G.rand() < P) { G.stats.saves[o.team]++; keeperHold(G, k); o.noCtrl = 0.3; o.charge = null; ev(G, 'save', { k, smother: true }); }
          else { b.owner = null; o.noCtrl = 0.18; o.charge = null; b.vx = k.vx * 0.5 + (G.rand() - 0.5) * 120; b.vy = k.vy * 0.5 + (G.rand() - 0.5) * 120; b.lastTouch = 2; mark(G); ev(G, 'save', { k, slide: true }); }
        } else if (G.rand() < 0.7) { keeperHold(G, k); ev(G, 'claim', { k }); }
        return;
      }
      if (k.stT >= 0.5) { k.state = 'ground'; k.stT = 0; k.stDur = 0.45; }
      return;
    }
    if (k.state === 'dive') {
      if (k.human) k.vy *= Math.exp(-4 * dt);          // a spring off the line that runs out of travel
      k.x += k.vx * dt; k.y = clamp(k.y + k.vy * dt, GY0 - 34, GY1 + 34);
      if (live) keeperBall(G, k);
      if (k.state === 'dive' && k.stT >= k.stDur) { k.state = 'ground'; k.stT = 0; k.stDur = 0.4 + 0.35 * (1 - q(a.ref)); }
      return;
    }
    if (k.state === 'ground') {
      k.vx *= 0.9; k.vy *= 0.9; k.x += k.vx * dt; k.y += k.vy * dt;
      if (live) keeperBall(G, k);
      if (k.stT >= k.stDur) { k.state = 'set'; k.stT = 0; }
      return;
    }
    if (k.human) return humanKeeper(G, k, dt);
    // reading the wind-up: a charged shot gives the keeper a head start, a snap shot does not
    const windup = live && G.players.some((p) => p.charge && sg * (p.x - gx) < 430);
    k.antic = windup ? Math.min(C.K_ANTIC, k.antic + dt * 0.3) : Math.max(0, k.antic - dt * 0.25);
    k.stepT = Math.max(0, k.stepT - dt);
    const threat = live && !b.owner && !b.holder && b.vx * sg < -140;
    if (threat) {
      if (k.seen !== b.seq) {
        k.seen = b.seq;
        k.reactT = Math.max(0.07, (G.drill && G.drill.kind === 'penalty' ? 0.8 : 1) * ((b.shot && b.shot.type === 'power') ? 0.72 : 1) * lerp(0.24, 0.16, q(a.ref)) * (b.shot && b.shot.out ? 0.8 : 1) + G.rand() * 0.05 - k.antic);
        k.wide = Math.abs(b.y - GCY) > 120;         // struck from a difficult angle: harder to judge
      }
      k.reactT -= dt;
      if (k.reactT <= 0) {
        const fin = b.shot && b.shot.type === 'finesse';
        const sf = (0.15 + 0.5 * q(a.pos)) * (fin ? 0.5 : 1);       // how well the curl is read: a finesse shot bends late
        const line = predict(b, gx + sg * 2, sf);
        if (line && k.lagSeq !== b.seq && Math.abs(line.y - GCY) > 42) { k.lagSeq = b.seq; k.reactT = C.K_CORNER + 0.05 * (1 - q(a.ref)); }      // a shot heading for the corner takes a moment longer to pick up
        else if (line && line.y > GY0 - 22 && line.y < GY1 + 22 && line.z < BAR + 20) {
          const pr = predict(b, k.x, sf) || line;
          if (pr.z > 46 && b.shot && b.shot.type === 'chip') { k.chip = true; k.reactT = 0.05; }      // only a scooped chip is met by standing tall; every other shot gets a dive, high if it is up
          else {
            const err = G.gauss() * (42 - 18 * q(a.pos)) * clamp(pr.t * 2.5, 0.25, 1) * (fin ? 1.3 : 1) * (k.wide ? 1.25 : 1);
            const dy = pr.y + err - k.y;
            const ady = Math.abs(dy);
            {      // the keeper always commits: every shot on target gets a dive at it. Skill (and the level's nerf) decides the aim and the reach
              const t = Math.max(pr.t, 0.07), mxs = (C.K_DIVE0 + C.K_DIVE1 * q(a.div)) * ((b.shot && b.shot.type === 'power') ? 1.25 : fin ? 0.9 : 1);
              k.state = 'dive'; k.slid = false; k.stT = 0; k.diveDir = Math.sign(dy);
              k.diveDir = Math.sign(dy) || (G.rand() < 0.5 ? -1 : 1); k.vy = k.diveDir * Math.min(Math.max((Math.abs(dy) / t) * 1.05, 45), mxs); k.vx = 0;
              k.stDur = clamp(t + 0.12, 0.3, 0.6); k.chip = false; k.high = pr.z > 46; k.stepT = 0; k.diveT = k.stDur;
              ev(G, 'dive', { k });
              return;
            }
          }
        } else k.reactT = 0.1;
      }
    } else { k.chip = false; if (!live) k.stepT = 0; }

    if (live && k.state === 'set' && b.owner && !b.holder) {      // close to the dribbler: slide in, or rush out at them
      const dk = hyp(b.x - k.x, b.y - k.y);
      // no sliding in if the other player is standing between the dribbler and the goal
      const o = b.owner, gdx = FW - o.x, gdy = GCY - o.y, gl2 = gdx * gdx + gdy * gdy || 1;
      const blocked = G.players.some((rv) => {
        if (rv.team === o.team) return false;
        const tp = clamp(((rv.x - o.x) * gdx + (rv.y - o.y) * gdy) / gl2, 0, 1);
        return tp > 0 && hyp(rv.x - (o.x + gdx * tp), rv.y - (o.y + gdy * tp)) < 42;
      });
      if (k.slideCd <= 0 && !blocked && dk < 150 && dk > 55 && G.rand() < dt * 3) {
        k.state = 'slide'; k.stT = 0; k.slideHit = false; k.slid = true; k.slideCd = 2.5; k.rush = 0;
        { const lx = b.x + b.vx * 0.25 - k.x, ly = b.y + b.vy * 0.25 - k.y, ld = hyp(lx, ly) || 1; k.vx = (lx / ld) * 350; k.vy = (ly / ld) * 350; }      // aim where the dribbler will be
        k.face = Math.atan2(k.vy, k.vx);
        ev(G, 'lunge', { p: k, slide: true });
        return;
      }
      if (k.rush <= 0 && k.rushCd <= 0 && inBox(b) && dk > 70 && dk < 240 && G.rand() < dt * 0.6 * (0.4 + q(a.ooo))) { k.rush = 1.1; k.rushCd = 3.5; }
    }
    if (!live || !b.owner || !inBox(b)) k.rush = 0;
    k.rush = Math.max(0, k.rush - dt);
    let tx, ty, spd = 150 + 70 * q(a.pos);
    if (k.rush > 0) { tx = b.x; ty = b.y; spd = 190; }                    // goalkeeper rush
    else if (k.stepT > 0 && !k.chip) { tx = k.x; ty = k.stepY; spd = C.K_STEP; }
    else if (k.chip) { tx = gx + sg * 8; ty = clamp(b.y + b.vy * 0.4, GY0 + 10, GY1 - 10); spd *= 1.5; }
    else {
      const inBox = sg * (b.x - gx) < BOXD && b.y > BOXY0 && b.y < BOXY1;
      const dk = hyp(b.x - k.x, b.y - k.y);
      if (live && !b.owner && !b.holder && inBox && hyp(b.vx, b.vy) < 260 && b.z < 30 &&
        dk < Math.min(...G.players.map((p) => hyp(b.x - p.x, b.y - p.y))) * 1.1 + 15) { tx = b.x; ty = b.y; spd = 230; }     // come and claim it
      else {
        const dx = b.x - gx, dy = b.y - GCY, d = hyp(dx, dy) || 1;
        let out = 16 + 26 * q(a.pos) * clamp(1 - d / 650, 0, 1);
        if (b.owner && d < 220) out = 22 + (20 + 45 * q(a.ooo)) * clamp(1 - (d - 70) / 150, 0, 1);  // narrow the angle
        out = Math.min(out, Math.max(10, d - 18));
        tx = gx + (dx / d) * out; ty = GCY + (dy / d) * out;
        if (sg * (tx - gx) < 18) tx = gx + sg * 18;
        ty = clamp(ty, GY0 + 14, GY1 - 14);          // stay between the posts
      }
    }
    const mx = tx - k.x, my = ty - k.y, md = hyp(mx, my);
    if (md > 0.5) {
      const st = Math.min(md, spd * dt);
      k.vx = (mx / md) * st / dt; k.vy = (my / md) * st / dt;
      k.x += (mx / md) * st; k.y += (my / md) * st; k.animDist += st;
    } else k.vx = k.vy = 0;
    k.x = left ? clamp(k.x, 6, BOXD - 10) : clamp(k.x, FW - BOXD + 10, FW - 6);
    k.y = clamp(k.y, BOXY0 + 10, BOXY1 - 10);
    k.face = Math.atan2(b.y - k.y, b.x - k.x);
    if (live) keeperBall(G, k);
  }

  // -------------------------------------------------------------------- game
  function create(opts) {
    const G = {
      rs: (opts.seed || ((Math.random() * 1e9) | 0)) >>> 0,
      t: 0, time: 0, phase: 'countdown', phaseT: 3, cdTick: 1, lastCount: 4, score: [0, 0], events: [],
      seq: 0, shotSeq: 0, winner: -1, concede: 0, own: false, msg: null, outInfo: null, goals: [],
      players: (opts.roster || [opts.home, opts.away]).map((d, i) => makePlayer(d, i % 2, i)),      // player i is on team i % 2 (2v2: four players)
      pairs: {},
      keeper: makeKeeper(1, nerfKeeper((opts.keepers || ISO.KEEPERS)[1], opts.keeperNerf || 0)),
      ball: { x: SPOTX, y: GCY, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, seq: 0, lastTouch: 0 },
      stats: { poss: [0, 0], shots: [0, 0], onTarget: [0, 0], saves: [0, 0], tackles: [0, 0], skills: [0, 0], clears: [0, 0], powerGoals: [0, 0] },
      drill: opts.drill && DRILLS[opts.drill] ? makeDrill(opts.drill, opts) : null, solo: !!opts.solo, replay: !!opts.replay && !opts.solo && !opts.drill, goalDur: C.GOAL_T, win: opts.solo ? 1e9 : opts.win || C.WIN, attacker: opts.kickoff || 0, next: 0, rep: 0, shotTaken: false, armed: false,
    };
    if (opts.moves) G.players.forEach((p, i) => { p.moves = opts.moves[i] || null; });
    G.keepers = [G.keeper];
    G.rand = rng(G);
    G.gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += G.rand(); return (u - 2) * 1.732; };
    setupRep(G, G.attacker, true);
    return G;
  }

  function step(G, inputs) {
    const dt = C.STEP, ph = G.phase;
    if (ph === 'end') return;
    G.t += dt;
    if (ph === 'countdown' || ph === 'ready') {
      G.phaseT -= dt;
      for (const p of G.players) {
        const inp = inputs[p.idx] || ZERO;
        p.stam = Math.min(100, p.stam + 4 * dt);
        p.prev = snapPrev(inp);
      }
      if (ph === 'countdown') {
        const c = Math.ceil(G.phaseT / G.cdTick);
        if (c !== G.lastCount && c > 0) { G.lastCount = c; ev(G, 'beep', { n: c }); }
      }
      if (G.phaseT <= 0) { G.phase = 'play'; G.msg = null; if (ph === 'countdown') ev(G, 'whistle'); }
      return;
    }
    const live = ph === 'play';
    if (G.drill) G.kInp = live ? inputs[0] || ZERO : ZERO;        // penalty shootout: the same input drives your keeper when it is their kick
    for (const p of G.players) if (!(G.solo && p.team === 1) && p.state !== 'away') updatePlayer(G, p, live ? inputs[p.idx] || ZERO : ZERO, dt);
    for (const k of G.keepers) updateKeeper(G, k, dt);
    collideBodies(G);
    for (const p of G.players) {      // nobody ends up inside a goal, even when shoved
      if (p.x > FW - 5 && p.y > GY0 - 10 && p.y < GY1 + 10) {
        const ex = p.x - (FW - 5), ey = Math.min(p.y - (GY0 - 10), GY1 + 10 - p.y);
        if (ex <= ey) p.x = FW - 5; else p.y = p.y < GCY ? GY0 - 10 : GY1 + 10;
      }
    }
    updateBall(G, dt);
    if (G.drill) drillStep(G, dt); else drillCheck(G);
    if (live) {
      G.time += dt;
      if (G.ball.owner) G.stats.poss[G.ball.owner.team] += dt;
    } else if (G.phase === ph) {
      G.phaseT -= dt;
      if (G.phaseT <= 0) {
        if (G.drill) {
          const w = G.drill.so ? soDecided(G.drill.so) : G.drill.n >= G.drill.total ? 0 : -1;
          if (w >= 0) { G.phase = 'end'; G.winner = w; ev(G, 'final', { team: w }); }
          else setupRep(G, 0, false);
        } else if (ph === 'goal') {
          if (G.winner >= 0) { G.phase = 'end'; ev(G, 'final', { team: G.winner }); }
          else setupRep(G, 1 - G.concede, false);       // the scorer starts with the ball
        } else if (ph === 'out') setupRep(G, G.next, false);
      }
    }
  }

  ISO.Game = { create, step, SKILLS: SK, pickSkill, ZERO, CHORD, CHORD_SPRINT };
})();
