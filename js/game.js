/* ISO FOOTBALL — rebound drill simulation. Pure 2D game logic: no DOM, no rendering.
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
    K_REACH0: 8, K_REACH1: 9, K_DIVE0: 115, K_DIVE1: 75, K_STEP: 230, K_ANTIC: 0.08, K_CLOSE: 0.65,   // keeper tuning
    GD: 34,                       // goal depth
    BAR: 60,                      // crossbar height (ball z)
    PR: 12, BR: 6,                // player / ball radius
    BOXD: 190, BOXY0: 110, BOXY1: 610, PEN: 127,
    SIXD: 64, SIXY0: 250, SIXY1: 470,
    TEN: 105,                     // 10 yards (the box is 18)
    K_CATCH: 0.7,                // keepers hold shots less often than they spill them: rebounds are the point
    SPEED: 0.75,                  // game speed vs real time (1 = original pace); slows players, ball, keeper and timers together
    CR: 100, WIN: 5, STEP: 1 / 120, GRAV: 900, GOAL_T: 2.2, OUT_T: 0.9,
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
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
  const angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  ISO.util = { clamp, lerp, hyp, q, q2, angDiff };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ZERO = { mx: 0, my: 0, sprint: false, jockey: false, shoot: false, finesse: false, chip: false, skill: false, j: false, k: false, l: false };
  const ev = (G, type, d) => { const e = d || {}; e.type = type; G.events.push(e); };
  const mark = (G) => { G.ball.seq = ++G.seq; };
  const setState = (p, s, dur) => { p.state = s; p.stT = 0; p.stDur = dur || 0; };
  const other = (G, p) => G.players[1 - p.team];

  // ------------------------------------------------------------------ skills
  // star: minimum skill-move stars. prot: [from,to] fraction of the move during
  // which the ball is protected from tackles. fake: the move sells a feint.
  const SK = {
    stepover: { name: 'Stepover', star: 2, dur: 0.5, cost: 3, exit: 1.25, prot: [0.3, 1], fake: true },
    feint:    { name: 'Body Feint', star: 1, dur: 0.36, cost: 2, exit: 1.2, prot: [0.4, 1], fake: true },
    roll:     { name: 'Ball Roll', star: 2, dur: 0.38, cost: 2, exit: 1.0, prot: [0.1, 1] },
    croqueta: { name: 'La Croqueta', star: 3, dur: 0.3, cost: 3, exit: 1.2, prot: [0, 1] },
    roulette: { name: 'Roulette', star: 3, dur: 0.62, cost: 4, exit: 1.15, prot: [0.1, 1] },
    elastico: { name: 'Elastico', star: 5, dur: 0.42, cost: 4, exit: 1.3, prot: [0.42, 1], fake: true },
    heel:     { name: 'Heel to Heel', star: 4, dur: 0.3, cost: 3, exit: 1.35, prot: [0, 0.6] },
    rainbow:  { name: 'Rainbow Flick', star: 5, dur: 0.85, cost: 5, exit: 1.1, prot: [0.28, 1] },
    dragback: { name: 'Drag Back', star: 2, dur: 0.42, cost: 2, exit: 1.1, prot: [0.2, 1] },
    nutmeg:   { name: 'Nutmeg', star: 4, dur: 0.5, cost: 3, exit: 1.3, prot: [0, 0] },
  };
  const SK_FALLBACK = { roulette: 'stepover', heel: 'feint', elastico: 'croqueta', rainbow: 'dragback', nutmeg: 'feint',
    croqueta: 'roll', stepover: 'feint', roll: 'feint', dragback: 'feint' };

  // Each move returns, for progress u (0..1): player velocity in the move's local
  // frame (vf forward, vs sideways), the ball offset from the player (bf, bs, bz)
  // and optionally the facing angle and a body-lean hint for the renderer.
  const SKFN = {
    stepover: (u, s) => ({ vf: s.v0 * 0.55, vs: 0, bf: 17, bs: 3.5 * Math.sin(u * Math.PI * 4), lean: Math.sin(u * Math.PI * 4) }),
    feint: (u, s) => ({ vf: s.v0 * 0.7, vs: u < 0.45 ? -80 : 190, bf: 16,
      bs: u < 0.45 ? -5 * seg(u, 0, 0.45) : lerp(-5, 7, seg(u, 0.45, 1)), lean: u < 0.45 ? -1 : 1 }),
    roll: (u, s) => ({ vf: s.v0 * 0.3, vs: 150, bf: 12, bs: 5 + 8 * Math.sin(u * Math.PI) }),
    croqueta: (u, s) => ({ vf: s.v0 * 0.45 + 70, vs: 235, bf: 14, bs: lerp(-9, 10, sm(u)) }),
    roulette: (u, s) => {
      const an = u * Math.PI * 2;
      return { vf: Math.max(s.v0, 120), vs: 45 * Math.sin(u * Math.PI), bf: 13 * Math.cos(an), bs: 13 * Math.sin(an), face: s.a0 + s.sd * an };
    },
    elastico: (u, s) => ({ vf: s.v0 * 0.6, vs: u < 0.45 ? -50 : 210, bf: 16,
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
  const CHORD = { 1: 'stepover', 2: 'feint', 4: 'roll', 3: 'croqueta', 5: 'roulette', 6: 'elastico', 7: 'rainbow' };
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
    else if (id === 'croqueta') exit = p.face + sd * 0.35;
    else if (id === 'elastico') exit = p.face + sd * 0.85;
    else if (id === 'dragback') exit = pk.rel === 'back' ? pk.inAng : p.face + Math.PI;
    const s = (p.skill = {
      id, def, t: 0, dur: def.dur, d0x: fx, d0y: fy, sx: -fy * sd, sy: fx * sd, sd, a0: p.face, exit,
      v0: clamp(spd, 60, p.jog * 1.1), botch: false, botched: false, lean: 0,
      fakeX: fx * 0.4 + fy * sd, fakeY: fy * 0.4 - fx * sd,
    });
    if (id === 'dragback') { s.fakeX = fx; s.fakeY = fy; }
    const pBotch = clamp(0.2 - 0.19 * q(a.skl) + (def.star - 1) * 0.02 - 0.06 * q(a.dri) + (p.stam < 25 ? 0.1 : 0), 0.01, 0.3);
    s.botch = G.rand() < pBotch;
    p.stam = Math.max(0, p.stam - def.cost);
    p.charge = null;
    setState(p, 'skill', def.dur);
    G.stats.skills[p.team]++;
    if (id === 'nutmeg') {
      let P = 0.45 + 0.4 * q(a.skl) - 0.3 * q(opp.a.tck);
      if (opp.jock) P -= 0.2;
      if (opp.state !== 'free' || opp.sprinting) P += 0.15;
      b.owner = null; b.shot = null;
      const v = 330 + Math.min(pk.od, 160) * 1.5;
      b.vx = fx * v; b.vy = fy * v; b.lastKicker = p; b.kickT = 0; b.lastTouch = p.team;
      if (!G.solo && G.rand() < clamp(P, 0.1, 0.92)) { b.pass = opp; b.ptT = 0.5; }
      mark(G);
    }
    ev(G, 'skill', { p, name: def.name, id });
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
    if (b.owner === p && P.bf !== undefined) {
      if (s.botch && !s.botched && u >= 0.5) {
        s.botched = true; b.owner = null;
        const an = G.rand() * Math.PI * 2;
        b.vx = p.vx * 0.6 + Math.cos(an) * 150; b.vy = p.vy * 0.6 + Math.sin(an) * 150;
        p.noCtrl = 0.45; setState(p, 'stumble', 0.3); p.skill = null; p.skillCd = 0.4;
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
      p.boost = 0.55; p.skillCd = 0.3; p.skill = null;
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

    const far = clamp((dGoal - 260) / 260, 0, 1);
    const acc = lerp(q(a.fin), q(a.lng), far);
    let err = lerp(0.11, 0.03, acc) * (1 + far * 0.35);
    if (type === 'finesse') err *= 0.85 - 0.25 * q(a.cur);
    else if (type === 'power') err *= power > 0.95 ? 1.3 : 0.95;
    if (Math.abs(turn) > 0.6) err *= 1 + (Math.abs(turn) - 0.6) * 0.55;
    const spd = hyp(p.vx, p.vy);
    err *= 1 + (spd / p.top) * 0.5 * (1.2 - q(a.bal));
    if (p.jostle > 0) err *= 1.5 - 0.4 * q(a.bal);
    err *= 1 + (1 - p.stam / 100) * 0.35;
    if (weak) err *= 1 + (1 - wf) * 0.9;
    if (ft) err *= 1.3 - 0.25 * q(a.fin) + hyp(b.vx, b.vy) / 1600;

    const sp = q(a.sho);
    let v, vz, spin = 0;
    if (type === 'finesse') {
      v = (430 + 250 * power) * (0.85 + 0.2 * sp); vz = 40 + 230 * power;       // holding longer lifts every shot type
      spin = (0.5 + 0.5 * q(a.cur)) * (atGoal ? Math.sign(GCY - tgtY) || 1 : 1) * p.dir;
    } else if (type === 'power') {      // long wind-up, but hard and flat: can score from outside the box
      v = (540 + 640 * power) * (0.85 + 0.3 * sp); vz = 30 + 170 * power + Math.abs(G.gauss()) * 15;
    } else {
      v = (400 + 330 * power) * (0.82 + 0.3 * sp);
      vz = 40 + 260 * power + Math.abs(G.gauss()) * 25;
    }
    // hold it too long and it sails over the bar
    const over = p.charge && !ft ? clamp((p.charge.t - (type === 'power' ? 1.6 : 1.0)) / (type === 'power' ? 0.5 : 0.4), 0, 1) : 0;
    vz += over * 420;
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
    b.shot = { id: ++G.shotSeq, team: p.team, type: ft ? 'first-time' : type, by: p };
    b.lastKicker = p; b.kickT = 0; b.lastTouch = p.team; b.shotTeam = p.team; b.shotT = G.t; mark(G);
    p.noCtrl = 0.3; p.kickT = 0.3; p.charge = null;
    p.stam = Math.max(0, p.stam - 1.5);
    p.face += clamp(turn, -1.2, 1.2);
    G.stats.shots[p.team]++; G.shotTaken = true;
    if (atGoal) {
      const pr = predict(b, gx, 1);
      if (pr && pr.y > GY0 && pr.y < GY1 && pr.z < BAR) G.stats.onTarget[p.team]++;
    }
    ev(G, 'kick', { power: clamp(v / 800, 0.2, 1), shot: b.shot.type, p });
  }

  function handleCharge(G, p, inp, mx, my, hasIn, dt) {
    const b = G.ball, pr = p.prev, owner = b.owner === p;
    const TYPES = [['shoot', 'normal'], ['finesse', 'finesse'], ['chip', 'power']];     // the 'chip' input key now fires the power shot
    if (!p.charge) {
      for (const [key, type] of TYPES) {
        if (inp[key] && !pr[key]) {
          if (owner) { if (p.team === G.attacker) { p.charge = { type, key, t: 0, ft: false }; break; } continue; }   // the defender cannot shoot until they clear
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
      if (reach) shoot(G, p, c.type, clamp(0.5 + c.t * 0.5, 0.5, 0.85), true, mx, my, hasIn);
      else if (!inp[c.key] || c.t > 1.1 || (b.owner && b.owner !== p) || b.holder) {
        const tap = !inp[c.key] && c.key === 'shoot' && c.t < 0.25 && !b.holder;
        p.charge = null;
        if (tap) startTackle(G, p, inp, mx, my, hasIn);      // a quick tap near a loose ball is a poke at it
      }
    } else if (!owner) p.charge = null;
    else if (inp.skill && !pr.skill) p.charge = null;        // fake shot: skill key cancels the wind-up
    else if (!inp[c.key] && c.t < 0.18) {         // a quick tap is a fake shot: the swing without the strike
      p.charge = null; p.kickT = 0.3; p.fakeT = 0.4; p.vx *= 0.6; p.vy *= 0.6; p.stam = Math.max(0, p.stam - 1);
      ev(G, 'fake', { p });
    } else if (!inp[c.key] || c.t > (c.type === 'power' ? 2.2 : 1.6)) shoot(G, p, c.type, clamp(c.t / (c.type === 'power' ? 1.3 : 0.75), 0.3, 1), false, mx, my, hasIn);
  }

  // ----------------------------------------------------------------- tackles
  function startTackle(G, p, inp, mx, my, hasIn) {
    const b = G.ball;
    const spd = hyp(p.vx, p.vy);
    const slide = inp.sprint && hasIn && !p.exhausted && !inp.jockey && spd > p.jog * 0.75;
    let dx, dy;
    const bd = hyp(b.x - p.x, b.y - p.y);
    if (!slide && bd < 55 && bd > 1) { dx = (b.x - p.x) / bd; dy = (b.y - p.y) / bd; }  // standing tackle reaches for a nearby ball
    else if (hasIn) { const l = hyp(mx, my); dx = mx / l; dy = my / l; }
    else { dx = Math.cos(p.face); dy = Math.sin(p.face); }
    p.tdx = dx; p.tdy = dy; p.tackleHit = false; p.won = false; p.beaten = false; p.bodyHit = false;
    p.face = Math.atan2(dy, dx); p.charge = null;
    if (slide) {
      const v = Math.max(spd, 210) + 150;
      p.vx = dx * v; p.vy = dy * v; p.stam = Math.max(0, p.stam - 5);
      setState(p, 'slide', 0.55);
    } else {
      const v = spd * 0.4 + 200;
      p.vx = dx * v; p.vy = dy * v;
      setState(p, 'tackle', 0.26);
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
      if (u >= pr[0] && u <= pr[1]) { t.beaten = true; ev(G, 'beaten', { p: t, by: o }); return; }
      bonus = 0.18;
    }
    let ch = (slide ? 0.62 : 0.5) + 0.34 * q(t.a.tck)
      - 0.24 * (0.5 * q(o.a.bal) + 0.3 * q(o.a.bct) + 0.2 * q(o.a.dri)) + (t.wasJockey > 0 ? 0.1 : 0) + bonus;
    // shielding: is the owner's body between the tackler and the ball?
    const bx = b.x - o.x, by = b.y - o.y, tx = t.x - o.x, ty = t.y - o.y;
    const dot = (bx * tx + by * ty) / ((hyp(bx, by) || 1) * (hyp(tx, ty) || 1));
    if (dot < -0.15) { ch *= o.shield ? 0.3 : 0.55; ch += 0.15 * (q(t.a.str) - q(o.a.str)); }
    if (G.rand() < clamp(ch, 0.05, 0.95)) {
      b.owner = null; o.noCtrl = 0.55; o.charge = null; o.skill = null;
      setState(o, 'stumble', slide ? 0.45 : 0.28);
      t.won = true; G.stats.tackles[t.team]++;
      if (!slide && G.rand() < 0.3 + 0.5 * q(t.a.tck)) {   // clean win: ball stays at the tackler's feet
        b.vx = t.vx * 0.3 + t.tdx * 40; b.vy = t.vy * 0.3 + t.tdy * 40;
        b.shot = null; b.lastTouch = t.team; t.clean = true; mark(G);
      } else knock(slide ? 380 : 240, slide ? 0.5 : 1.4);
      ev(G, 'tackle', { p: t, on: o, slide });
    } else {
      t.beaten = true; o.jostle = 0.25;
      ev(G, 'beaten', { p: t, by: o });
    }
  }

  function updateTackle(G, p, dt) {
    const b = G.ball, slide = p.state === 'slide';
    p.stT += dt;
    const f = Math.exp(-(slide ? 2.6 : 6) * dt);
    p.vx *= f; p.vy *= f;
    const active = p.stT > 0.03 && p.stT < (slide ? 0.45 : 0.2);
    if (active && !p.tackleHit && !b.holder && b.z < 22) {
      const reach = slide ? 20 : 15, r = slide ? 16 : 14;
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
      if (slide) setState(p, 'down', p.won ? 0.45 : 0.8 - 0.15 * ag);
      else setState(p, 'recover', p.won ? 0.12 : (p.beaten ? 0.5 : 0.42) - 0.12 * ag);
      p.clean = false;
    }
  }

  // ----------------------------------------------------------------- players
  function makePlayer(def, team) {
    const a = def.attr;
    const top = 178 + 92 * q2(a.pac);
    return {
      kind: 'p', def, a, team, dir: 1, x: 0, y: 0, vx: 0, vy: 0, face: 0,
      top, jog: top * 0.66, state: 'free', stT: 0, stDur: 0, stam: 100, exhausted: false,
      charge: null, skill: null, chord: null, noCtrl: 0, kickT: 0, fakeT: 0, jostle: 0, skillCd: 0, boost: 0, wasJockey: 0,
      animDist: 0, dribPh: 0, prev: {}, sprinting: false, shield: false, jock: false, contact: false,
      tdx: 1, tdy: 0, tackleHit: false, won: false, beaten: false, bodyHit: false, clean: false,
    };
  }
  function resetPlayer(p) {
    p.vx = p.vy = 0; p.state = 'free'; p.stT = 0; p.charge = null; p.skill = null; p.chord = null;
    p.noCtrl = p.kickT = p.fakeT = p.jostle = p.skillCd = p.boost = p.wasJockey = 0;
    p.sprinting = p.shield = p.jock = p.contact = false;
  }

  function updatePlayer(G, p, inp, dt) {
    const a = p.a, b = G.ball;
    p.noCtrl = Math.max(0, p.noCtrl - dt); p.kickT = Math.max(0, p.kickT - dt); p.fakeT = Math.max(0, p.fakeT - dt);
    p.jostle = Math.max(0, p.jostle - dt); p.skillCd = Math.max(0, p.skillCd - dt);
    p.boost = Math.max(0, p.boost - dt); p.wasJockey = Math.max(0, p.wasJockey - dt);
    p.aim = inp.ax != null ? { x: inp.ax, y: inp.ay } : null;
    let mx = inp.mx || 0, my = inp.my || 0, ml = hyp(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    const hasIn = ml > 0.15;
    const spd = hyp(p.vx, p.vy);
    p.sprinting = false; p.shield = false; p.jock = false;

    if (p.state === 'free') {
      // a skill chord: the first J/K/L press opens a short window in which the other keys can join it
      const keys = (inp.j ? 1 : 0) | (inp.k ? 2 : 0) | (inp.l ? 4 : 0);
      let fired = 0;
      if (p.chord) { p.chord.t += dt; p.chord.mask |= keys; if (p.chord.t >= 0.07) { fired = p.chord.mask; p.chord = null; } }
      else if (keys && !(p.prev.j || p.prev.k || p.prev.l)) p.chord = { t: 0, mask: keys };
      if (fired && b.owner === p && p.skillCd <= 0 && !p.charge) startSkill(G, p, inp, mx, my, hasIn, fired);
      else handleCharge(G, p, inp, mx, my, hasIn, dt);
    } else p.chord = null;
    if (p.state === 'free') {
      const owner = b.owner === p;
      const jock = !!inp.jockey;
      let maxV;
      if (jock) {
        maxV = p.jog * (owner ? 0.6 : 0.78);
        if (owner) p.shield = true; else { p.jock = true; p.wasJockey = 0.4; }
      } else if (inp.sprint && hasIn && !p.exhausted) { maxV = p.top; p.sprinting = true; }
      else maxV = p.jog;
      maxV *= 0.86 + 0.14 * clamp(p.stam / 40, 0, 1);
      if (owner) maxV *= 0.9 + 0.08 * q(a.dri);
      if (p.charge) {      // the more it is wound up, the slower you move: no walking around at full power
        const f = p.charge.ft ? 0 : clamp(p.charge.t / (p.charge.type === 'power' ? 1.3 : 0.75), 0, 1);
        maxV *= 0.8 - 0.55 * f;
      }
      if (p.boost > 0) maxV *= 1.1;
      if (p.jostle > 0) maxV *= 0.85;
      let acc = (540 + 640 * q2(a.acc)) * (p.boost > 0 ? 1.4 : 1) * (jock ? 1.35 : 1);
      if (hasIn) {
        if (spd > 50 && (p.vx * mx + p.vy * my) / (spd * ml) < 0.5) acc *= 0.7 + 0.9 * q(a.agi);  // cutting / turning
      } else acc = 760;
      let dvx = mx * maxV - p.vx, dvy = my * maxV - p.vy;
      if (!hasIn) { dvx = -p.vx; dvy = -p.vy; }
      const dl = hyp(dvx, dvy), md = acc * dt;
      if (dl > md) { dvx *= md / dl; dvy *= md / dl; }
      p.vx += dvx; p.vy += dvy;
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
        const tr = (7 + 9 * q(a.agi)) * (owner ? 0.75 + 0.25 * q(a.dri) : 1) * dt;
        p.face += clamp(angDiff(p.face, want), -tr, tr);
      }
    } else if (p.state === 'tackle' || p.state === 'slide') updateTackle(G, p, dt);
    else if (p.state === 'skill') updateSkill(G, p, dt);
    else {
      const f = Math.exp(-(p.state === 'recover' ? 5 : 7) * dt);
      p.vx *= f; p.vy *= f; p.stT += dt;
      p.stam = Math.min(100, p.stam + 3 * dt);
      if (p.state !== 'celebrate' && p.stT >= p.stDur) setState(p, 'free');
    }
    const oy = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.animDist += hyp(p.vx, p.vy) * dt;
    p.x = clamp(p.x, -18, FW + 18); p.y = clamp(p.y, -18, FH + 18);
    if (p.x > FW - 5 && p.y > GY0 - 10 && p.y < GY1 + 10) {   // the goal is solid: slide along it
      if (oy <= GY0 - 10) p.y = GY0 - 10; else if (oy >= GY1 + 10) p.y = GY1 + 10; else p.x = FW - 5;
    }
    p.prev = { shoot: inp.shoot, finesse: inp.finesse, chip: inp.chip, skill: inp.skill, j: inp.j, k: inp.k, l: inp.l };
  }

  function collideBodies(G) {
    const [A, B] = G.players, b = G.ball;
    if (!G.solo && A.state !== 'celebrate' && B.state !== 'celebrate') {
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
        if (!A.contact) {       // shoulder challenge on first contact
          const o = b.owner, df = o === A ? B : o === B ? A : null;
          if (df && o.state === 'free' && df.state === 'free' && closing > 110 && G.phase === 'play') {
            let P = clamp(0.1 + 0.55 * (q(df.a.str) - (0.6 * q(o.a.bal) + 0.4 * q(o.a.str))), 0.02, 0.45);
            if (o.shield) P *= 0.5;
            if (G.rand() < P) {
              b.owner = null; o.noCtrl = 0.35; setState(o, 'stumble', 0.22);
              const s = o === A ? -1 : 1;
              b.vx += nx * s * 120; b.vy += ny * s * 120; b.lastTouch = df.team; mark(G);
              ev(G, 'bump', { p: df, on: o });
            } else o.jostle = 0.35;
          }
        }
        A.contact = B.contact = true;
      } else if (d > min + 4) A.contact = B.contact = false;
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
          p.dribPh += dt * (7 + sf * 11);
          let lead = 10 + sf * (p.sprinting ? 16 : 7) * (1.35 - 0.6 * dri) + Math.sin(p.dribPh) * (0.6 + sf * 3);      // close control: the ball stays near the feet
          if (p.shield) {
            const o = other(G, p), ox = p.x - o.x, oy = p.y - o.y, od = hyp(ox, oy);
            if (od < 95 && od > 1) { fx = ox / od; fy = oy / od; lead = 14; }
          }
          const tx = p.x + fx * lead, ty = p.y + fy * lead;
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
        const p = b.owner, o = other(G, p);
        if (p.state === 'free' && o.state === 'free' && o.noCtrl <= 0 &&
          hyp(b.x - o.x, b.y - o.y) < PR + BR + 3 && hyp(b.x - p.x, b.y - p.y) > 27) {
          p.noCtrl = 0.4; b.owner = o; b.lastTouch = o.team; ev(G, 'steal', { p: o, on: p });
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
    const b = G.ball;
    // the scorer is whoever last touched it; a keeper deflection into the net still counts for the shooter
    const t = isPlayerTeam(b.lastTouch) ? b.lastTouch : b.shotTeam >= 0 ? b.shotTeam : G.attacker;
    if (b.shot && b.shot.type === 'power' && b.shot.team === t) G.stats.powerGoals[t]++;
    G.score[t]++; G.phase = 'goal'; G.phaseT = C.GOAL_T; G.concede = 1 - t; G.own = false;
    b.inNet = 1; b.owner = null; b.shot = null; b.spin = 0;
    for (const p of G.players) { p.charge = null; if (p.state === 'skill') { p.skill = null; setState(p, 'free'); } }
    setState(G.players[t], 'celebrate');
    if (G.score[t] >= G.win) G.winner = t;
    G.goals.push({ team: t, time: G.time, own: false });
    ev(G, 'goal', { team: t, own: false });
  }

  // End the rep without a goal. `next` attacks the next rep.
  function endRep(G, kind, next) {
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

  function resetBall(b) {
    b.z = 0; b.vx = b.vy = b.vz = 0; b.spin = 0; b.owner = null; b.holder = null; b.shot = null;
    b.lastKicker = null; b.kickT = 9; b.pass = null; b.ptT = 0; b.inNet = null; b.driven = false; b.zDriven = false; b.shotTeam = -1; b.shotT = 0;
  }

  // The attacker starts on the spot 10 yards outside the box, centred on the goal, with the ball. The defender stands in front.
  function setupRep(G, atk, first) {
    if (G.solo) atk = 0;
    const b = G.ball, def = 1 - atk, A = G.players[atk], D = G.players[def];
    resetBall(b);
    for (const p of G.players) { resetPlayer(p); p.stam = first ? 100 : Math.min(100, p.stam + 30); p.exhausted = false; p.face = 0; p.vx = p.vy = 0; }
    resetKeeper(G.keeper);
    A.x = SPOTX; A.y = GCY; D.x = SPOTX + 46; D.y = GCY; D.face = Math.PI;     // the defender starts in front of the attacker
    b.x = SPOTX + 12; b.y = GCY; b.owner = A; b.lastTouch = atk;
    if (G.solo) { D.x = D.y = -900; D.state = 'away'; }       // testing arena: nobody else on the pitch
    G.attacker = atk; G.guard = null; G.shotTaken = false; G.armed = false; G.rep++;
    G.phase = 'countdown'; G.cdTick = first ? 1 : 0.5; G.phaseT = 3 * G.cdTick; G.lastCount = 4;
    G.msg = null; G.outInfo = null;
  }

  // ------------------------------------------------------------- goalkeepers
  function makeKeeper(team, def) {
    return { kind: 'k', team, def, a: def.a, x: 0, y: GCY, vx: 0, vy: 0, face: team ? Math.PI : 0, state: 'set', stT: 0, stDur: 0,
      cd: 0, smCd: 0, reactT: 0, seen: -1, antic: 0, stepT: 0, stepY: 0, diveT: 0, chip: false, diveDir: 1, holdT: 0, animDist: 0, rush: 0, rushCd: 1.5, slideCd: 0, slideHit: false };
  }
  function resetKeeper(k) {
    k.x = k.team ? FW - 16 : 16; k.y = GCY; k.vx = k.vy = 0; k.state = 'set'; k.stT = 0; k.cd = 0; k.smCd = 0;
    k.chip = false; k.seen = -1; k.antic = 0; k.stepT = 0; k.face = k.team ? Math.PI : 0;
    k.rush = 0; k.rushCd = 1.5; k.slideCd = 0; k.slideHit = false;
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
      const reach = (C.K_REACH0 + C.K_REACH1 * q(a.div)) * Math.min(1, k.stT / 0.1), y2 = k.y + k.diveDir * reach;
      const cy = clamp(b.y, Math.min(k.y, y2), Math.max(k.y, y2));
      d = hyp(b.x - k.x, b.y - cy); r = 11; zmax = 50;
    } else if (k.state === 'ground') { d = hyp(b.x - k.x, b.y - k.y); r = 11; zmax = 18; }
    else { d = hyp(b.x - k.x, b.y - k.y); r = 12; zmax = k.chip ? 68 : 50; }
    if (d > r + BR || b.z > zmax) return;
    const o = b.owner;
    if (o) {      // smothering a dribbler: a contest, not a guaranteed claim
      if (k.state !== 'set' || k.smCd > 0) return;
      k.smCd = 0.7;
      let P = 0.26 + 0.5 * q(a.ooo) - 0.12 * q(o.a.dri);
      if (o.state === 'skill') P *= 0.5;
      if (G.rand() < P) { keeperHold(G, k); o.noCtrl = 0.5; o.charge = null; G.stats.saves[o.team]++; ev(G, 'save', { k, smother: true }); }
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
    const pThrough = clamp((sp - 560) / 900, 0, 0.5) * (1.15 - 0.65 * q(a.han)) * (dive ? 1 : 0.6) * ((b.shot && b.shot.type === 'power') ? 0.45 : 1);
    if (G.rand() < pThrough) {        // too hot to handle: only slowed
      const j = (G.rand() - 0.5) * 0.5, c = Math.cos(j), s = Math.sin(j), vx = b.vx * 0.6, vy = b.vy * 0.6;
      b.vx = vx * c - vy * s; b.vy = vx * s + vy * c; b.spin = 0; k.cd = 0.4; b.lastTouch = 2; mark(G);
      ev(G, 'save', { k, weak: true }); return;
    }
    G.stats.saves[Math.max(0, b.shotTeam)]++;
    const pCatch = clamp(0.3 + 0.55 * q(a.han) - sp / 1900, 0.05, 0.9) * (dive ? 0.55 : 1) * C.K_CATCH;
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
    if (k.state === 'hold') {
      k.vx = k.vy = 0;
      if (b.holder !== k) { k.state = 'set'; return; }
      b.x = k.x + sg * 9; b.y = k.y; b.z = 12; b.vx = b.vy = b.vz = 0;
      k.face = left ? 0 : Math.PI;
      if (live) { k.holdT -= dt; if (k.holdT <= 0) distribute(G, k); }
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
          if (G.rand() < P) { G.stats.saves[o.team]++; keeperHold(G, k); o.noCtrl = 0.5; o.charge = null; ev(G, 'save', { k, smother: true }); }
          else { b.owner = null; o.noCtrl = 0.3; o.charge = null; b.vx = k.vx * 0.5 + (G.rand() - 0.5) * 120; b.vy = k.vy * 0.5 + (G.rand() - 0.5) * 120; b.lastTouch = 2; mark(G); ev(G, 'save', { k, slide: true }); }
        } else if (G.rand() < 0.7) { keeperHold(G, k); ev(G, 'claim', { k }); }
        return;
      }
      if (k.stT >= 0.5) { k.state = 'ground'; k.stT = 0; k.stDur = 0.45; }
      return;
    }
    if (k.state === 'dive') {
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
    // reading the wind-up: a charged shot gives the keeper a head start, a snap shot does not
    const windup = live && G.players.some((p) => p.charge && sg * (p.x - gx) < 430);
    k.antic = windup ? Math.min(C.K_ANTIC, k.antic + dt * 0.3) : Math.max(0, k.antic - dt * 0.25);
    k.stepT = Math.max(0, k.stepT - dt);
    const threat = live && !b.owner && !b.holder && b.vx * sg < -140;
    if (threat) {
      if (k.seen !== b.seq) {
        k.seen = b.seq;
        const dist = hyp(b.x - k.x, b.y - k.y);
        k.reactT = Math.max(0.07, ((b.shot && b.shot.type === 'power') ? 0.72 : 1) * lerp(0.44, 0.22, q(a.ref)) * (dist < 190 ? lerp(1, C.K_CLOSE, q(a.ooo)) : 1) + G.rand() * 0.04 - k.antic);
      }
      k.reactT -= dt;
      if (k.reactT <= 0) {
        const sf = 0.15 + 0.5 * q(a.pos);       // how well the curl is read
        const line = predict(b, gx + sg * 2, sf);
        if (line && line.y > GY0 - 22 && line.y < GY1 + 22 && line.z < BAR + 20) {
          const pr = predict(b, k.x, sf) || line;
          if (pr.z > 46) { k.chip = true; k.reactT = 0.05; }
          else {
            const err = G.gauss() * (30 - 18 * q(a.pos)) * clamp(pr.t * 2.5, 0.25, 1);
            const dy = pr.y + err - k.y;
            const ady = Math.abs(dy);
            if (ady < 9) k.reactT = 0.08;
            else if (ady < 30 && ady < C.K_STEP * pr.t + 8) {     // close to the body: quick step across, stay on the feet
              k.stepY = k.y + dy; k.stepT = pr.t + 0.12; k.reactT = pr.t + 0.05;
            } else {
              const t = Math.max(pr.t, 0.07), mxs = (C.K_DIVE0 + C.K_DIVE1 * q(a.div)) * ((b.shot && b.shot.type === 'power') ? 1.25 : 1);
              k.state = 'dive'; k.slid = false; k.stT = 0; k.diveDir = Math.sign(dy);
              k.vy = k.diveDir * Math.min((Math.abs(dy) / t) * 1.05, mxs); k.vx = 0;
              k.stDur = clamp(t + 0.12, 0.3, 0.6); k.chip = false; k.stepT = 0; k.diveT = k.stDur;
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
      const o = b.owner, rv = G.players[1 - o.team], gdx = FW - o.x, gdy = GCY - o.y, gl2 = gdx * gdx + gdy * gdy || 1;
      const tp = clamp(((rv.x - o.x) * gdx + (rv.y - o.y) * gdy) / gl2, 0, 1);
      const blocked = tp > 0 && hyp(rv.x - (o.x + gdx * tp), rv.y - (o.y + gdy * tp)) < 42;
      if (k.slideCd <= 0 && !blocked && dk < 150 && dk > 55 && G.rand() < dt * 3) {
        k.state = 'slide'; k.stT = 0; k.slideHit = false; k.slid = true; k.slideCd = 2.5; k.rush = 0;
        { const lx = b.x + b.vx * 0.25 - k.x, ly = b.y + b.vy * 0.25 - k.y, ld = hyp(lx, ly) || 1; k.vx = (lx / ld) * 440; k.vy = (ly / ld) * 440; }      // aim where the dribbler will be
        k.face = Math.atan2(k.vy, k.vx);
        ev(G, 'lunge', { p: k, slide: true });
        return;
      }
      if (k.rush <= 0 && k.rushCd <= 0 && inBox(b) && dk > 70 && dk < 240 && G.rand() < dt * 0.6 * (0.4 + q(a.ooo))) { k.rush = 1.1; k.rushCd = 3.5; }
    }
    if (!live || !b.owner || !inBox(b)) k.rush = 0;
    k.rush = Math.max(0, k.rush - dt);
    let tx, ty, spd = 150 + 70 * q(a.pos);
    if (k.rush > 0) { tx = b.x; ty = b.y; spd = 235; }                    // goalkeeper rush
    else if (k.stepT > 0 && !k.chip) { tx = k.x; ty = k.stepY; spd = C.K_STEP; }
    else if (k.chip) { tx = gx + sg * 8; ty = clamp(b.y + b.vy * 0.4, GY0 + 10, GY1 - 10); spd *= 1.5; }
    else {
      const inBox = sg * (b.x - gx) < BOXD && b.y > BOXY0 && b.y < BOXY1;
      const dk = hyp(b.x - k.x, b.y - k.y);
      if (live && !b.owner && !b.holder && inBox && hyp(b.vx, b.vy) < 260 && b.z < 30 &&
        dk < Math.min(hyp(b.x - G.players[0].x, b.y - G.players[0].y), hyp(b.x - G.players[1].x, b.y - G.players[1].y)) * 1.1 + 15) { tx = b.x; ty = b.y; spd = 230; }     // come and claim it
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
      rand: rng(opts.seed || ((Math.random() * 1e9) | 0)),
      t: 0, time: 0, phase: 'countdown', phaseT: 3, cdTick: 1, lastCount: 4, score: [0, 0], events: [],
      seq: 0, shotSeq: 0, winner: -1, concede: 0, own: false, msg: null, outInfo: null, goals: [],
      players: [makePlayer(opts.home, 0), makePlayer(opts.away, 1)],
      keeper: makeKeeper(1, (opts.keepers || ISO.KEEPERS)[1]),
      ball: { x: SPOTX, y: GCY, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rot: 0, seq: 0, lastTouch: 0 },
      stats: { poss: [0, 0], shots: [0, 0], onTarget: [0, 0], saves: [0, 0], tackles: [0, 0], skills: [0, 0], clears: [0, 0], powerGoals: [0, 0] },
      solo: !!opts.solo, win: opts.solo ? 1e9 : opts.win || C.WIN, attacker: opts.kickoff || 0, next: 0, rep: 0, shotTaken: false, armed: false,
    };
    if (opts.moves) G.players.forEach((p, i) => { p.moves = opts.moves[i] || null; });
    G.keepers = [G.keeper];
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
        const inp = inputs[p.team] || ZERO;
        p.stam = Math.min(100, p.stam + 4 * dt);
        p.prev = { shoot: inp.shoot, finesse: inp.finesse, chip: inp.chip, skill: inp.skill, j: inp.j, k: inp.k, l: inp.l };
      }
      if (ph === 'countdown') {
        const c = Math.ceil(G.phaseT / G.cdTick);
        if (c !== G.lastCount && c > 0) { G.lastCount = c; ev(G, 'beep', { n: c }); }
      }
      if (G.phaseT <= 0) { G.phase = 'play'; G.msg = null; if (ph === 'countdown') ev(G, 'whistle'); }
      return;
    }
    const live = ph === 'play';
    for (const p of G.players) if (!(G.solo && p.team === 1)) updatePlayer(G, p, live ? inputs[p.team] || ZERO : ZERO, dt);
    for (const k of G.keepers) updateKeeper(G, k, dt);
    collideBodies(G);
    for (const p of G.players) {      // nobody ends up inside a goal, even when shoved
      if (p.x > FW - 5 && p.y > GY0 - 10 && p.y < GY1 + 10) {
        const ex = p.x - (FW - 5), ey = Math.min(p.y - (GY0 - 10), GY1 + 10 - p.y);
        if (ex <= ey) p.x = FW - 5; else p.y = p.y < GCY ? GY0 - 10 : GY1 + 10;
      }
    }
    updateBall(G, dt);
    drillCheck(G);
    if (live) {
      G.time += dt;
      if (G.ball.owner) G.stats.poss[G.ball.owner.team] += dt;
    } else if (G.phase === ph) {
      G.phaseT -= dt;
      if (G.phaseT <= 0) {
        if (ph === 'goal') {
          if (G.winner >= 0) { G.phase = 'end'; ev(G, 'final', { team: G.winner }); }
          else setupRep(G, 1 - G.concede, false);       // the scorer starts with the ball
        } else if (ph === 'out') setupRep(G, G.next, false);
      }
    }
  }

  ISO.Game = { create, step, SKILLS: SK, pickSkill, ZERO, CHORD, CHORD_SPRINT };
})();
