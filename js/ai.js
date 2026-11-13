/* ISO FOOTBALL — CPU opponent. Produces the same input structure a human does,
   so the CPU plays by exactly the same rules as a keyboard player. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const C = ISO.C, { FW, FH, GY0, GY1 } = C;
  const GCY = (GY0 + GY1) / 2;
  const { clamp, hyp, q } = ISO.util;

  const DIFFS = {
    easy:   { think: 0.42, tackleP: 0.12, slideP: 0.02, skillP: 0.05, foolP: 0.95, eager: 0.4,  smart: 0.18, speed: 0.8 },
    normal: { think: 0.25, tackleP: 0.34, slideP: 0.06, skillP: 0.18, foolP: 0.74, eager: 0.78, smart: 0.45, speed: 0.92 },
    hard:   { think: 0.09, tackleP: 0.8,  slideP: 0.18, skillP: 0.45, foolP: 0.32, eager: 1.4,  smart: 0.9, speed: 1 },
  };

  // ---- Phase 3: personalities (offline CPU only: the server never runs an AI) --------------------------------------------------
  // KNOBS: key: [neutral, 'mul' | 'add', lo, hi], the same shape as ISO.MODS. A personality is a table of these knobs; the neutral table
  // (every mul 1, every add 0) is bit-identical to the pre-Phase-3 brain: multiplicative hooks multiply by exactly 1, additive hooks add 0,
  // and every new behaviour (and every new G.rand draw) sits behind a short-circuit on a non-neutral knob. Personalities change decisions,
  // never reactions: speed, think and foolP are never touched.
  const KNOBS = {
    tackle: [1, 'mul', 0.4, 2], slide: [1, 'mul', 0.4, 2], pressGap: [1, 'mul', 0.5, 1.5], jockeyR: [1, 'mul', 0.6, 1.6],
    skill: [1, 'mul', 0.5, 2.2], sg: [1, 'mul', 0.5, 2], range: [1, 'mul', 0.8, 1.2], eager: [1, 'mul', 0.5, 1.6], closeIn: [1, 'mul', 0.75, 1.3],
    recover: [1, 'mul', 1, 1.4], aimSmart: [0, 'add', 0, 0.25], minQ: [0, 'add', 0, 0.6], patience: [0, 'add', 0, 3], counter: [0, 'add', 0, 3],
    dropDeep: [0, 'add', 0, 0.7], vary: [0, 'add', 0, 1],
    laneBlock: [0, 'add', 0, 1], rebound: [0, 'add', 0, 1], ctxSkill: [0, 'add', 0, 1],      // session 2 tactics
  };
  const NEUTRAL = Object.freeze(Object.fromEntries(Object.entries(KNOBS).map(([k, e]) => [k, e[0]])));
  const resolve = (kn) => { const z = { ...NEUTRAL }; for (const k in kn) { const e = KNOBS[k]; if (!e) continue; z[k] = clamp(e[1] === 'mul' ? e[0] * kn[k] : e[0] + kn[k], e[2], e[3]); } return Object.freeze(z); };
  const ARCH = {
    aggressive: { name: 'Aggressive', desc: 'Presses high, tackles often and shoots early.', knobs: { tackle: 1.9, slide: 1.8, pressGap: 0.6, jockeyR: 0.8, range: 1.1, eager: 1.3, counter: 0.8 } },
    technical: { name: 'Technical', desc: 'Dribbles at defenders: lots of skill moves and stop-and-gos.', knobs: { skill: 2, sg: 1.8, tackle: 0.9, ctxSkill: 0.8 } },
    defensive: { name: 'Defensive', desc: 'Stays tight and goal-side, rarely lunges in.', knobs: { dropDeep: 0.7, tackle: 1.3, jockeyR: 1.4, slide: 0.6, skill: 0.6, recover: 1.4, laneBlock: 0.6, rebound: 0.25 } },
    clinical: { name: 'Clinical', desc: 'Waits for the clean chance, shoots from close and aims for the corner.', knobs: { range: 0.8, eager: 1, closeIn: 0.8, aimSmart: 0.2, minQ: 0.3, patience: 0.5, recover: 1.2, laneBlock: 0.3, rebound: 0.5 } },
    unpredictable: { name: 'Unpredictable', desc: 'Switches mood mid-match: nobody knows what comes next.', knobs: { skill: 1.3, vary: 1 } },
    counter: { name: 'Counter', desc: 'Breaks at pace the moment it wins the ball.', knobs: { sg: 0.7, eager: 1.4, closeIn: 1.2, counter: 2.8, recover: 1.3 } },
    possession: { name: 'Possession', desc: 'Keeps the ball, works the shot and rarely lunges.', knobs: { tackle: 0.9, slide: 0.9, minQ: 0.25, patience: 1.5 } },
  };
  const ARCH_ORDER = Object.keys(ARCH);
  const ARCH_Z = Object.fromEntries(ARCH_ORDER.map((k) => [k, resolve(ARCH[k].knobs)]));
  // Archetype derivation: nothing is hand authored per player. Score each archetype from the player's role, traits and attributes
  // (ISO.styleOf), take the highest (ties by ARCH order), then nudge a few knobs continuously from attributes.
  const ROLE_AFF = { winger: ['technical', 'counter'], striker: ['clinical'], playmaker: ['possession', 'technical'], target: ['aggressive', 'clinical'], box2box: ['aggressive', 'counter'], defender: ['defensive'] };
  const TRAIT_AFF = { trickster: ['unpredictable', 'technical'], acrobat: ['unpredictable'], technical: ['technical'], finesse: ['clinical'], longshot: ['clinical'], quickstep: ['counter'], relentless: ['aggressive'], press: ['possession'], reflex: ['defensive'], header: ['aggressive'] };
  const ATTR_AFF = { tck: ['defensive'], skl: ['technical', 'unpredictable'], fin: ['clinical'], pac: ['counter'], str: ['aggressive'], bal: ['possession'] };
  // BIAS evens out how common each archetype is across the roster (tuned so each covers 6-30% of it; tools/ai-test.js section A asserts it)
  const BIAS = { aggressive: 0, technical: -0.9, defensive: 0.8, clinical: -0.9, unpredictable: 1.4, counter: -0.1, possession: 0.6 };
  const profCache = new WeakMap();
  function profileOf(def) {
    if (ISO.PERS_OFF || ISO.STYLE_OFF || !def || !def.attr) return NEUTRAL_PROF;
    const key = def.base || def;
    let pr = profCache.get(key);
    if (!pr) { pr = derive(key); profCache.set(key, pr); }
    return pr;
  }
  function derive(def) {
    const st = ISO.styleOf(def), a = def.attr, sc = Object.fromEntries(ARCH_ORDER.map((k) => [k, BIAS[k]]));
    for (const k of ROLE_AFF[st.role] || []) sc[k] += 3;
    for (const t of st.traits) for (const k of TRAIT_AFF[t] || []) sc[k] += 2;
    const qo = q(def.ovr);
    for (const at in ATTR_AFF) for (const k of ATTR_AFF[at]) sc[k] += clamp(1 + 3 * (q(a[at]) - qo), 0, 2);
    let best = ARCH_ORDER[0];
    for (const k of ARCH_ORDER) if (sc[k] > sc[best] + 1e-9) best = k;
    const kn = { ...ARCH[best].knobs }, mulBy = (k, f) => { kn[k] = (kn[k] === undefined ? 1 : kn[k]) * f; }, addTo = (k, v) => { kn[k] = (kn[k] === undefined ? 0 : kn[k]) + v; };
    // continuous nudges (about +-10%): who the player is shades how the archetype plays
    mulBy('tackle', 1 + 0.2 * (q(a.tck) - 0.5)); mulBy('skill', 1 + 0.2 * (q(a.skl) - 0.5)); mulBy('range', 1 + 0.1 * (q(a.lng) - 0.5));
    addTo('aimSmart', 0.06 * q(a.fin)); mulBy('eager', 1 + 0.2 * (q(a.sho) - 0.5));
    return Object.freeze({ id: best, name: ARCH[best].name, desc: ARCH[best].desc, z: resolve(kn), scores: Object.freeze(sc) });
  }
  const NEUTRAL_PROF = Object.freeze({ id: 'neutral', name: 'Balanced', desc: 'No particular style.', z: NEUTRAL, scores: Object.freeze({}) });

  // Pure shot quality 0..1 (no RNG): distance over range, angle, a blocker, pressure and the keeper's position.
  function shotQ(G, me, opp, K, dg, range) {
    const dir = me.dir, ox = opp.x - me.x, oy = opp.y - me.y, od = hyp(ox, oy) || 1;
    const dq = clamp(1 - dg / range, 0, 1), ang = clamp(1 - Math.abs(me.y - GCY) / (Math.abs(FW - me.x) * 1.3 + 40), 0, 1);
    const blocked = ox * dir > 0 && od < 45 && Math.abs(oy) < 26, press = clamp(1 - od / 110, 0, 1);
    const kOff = clamp(Math.abs(K.y - GCY) / (GY1 - GCY), 0, 1) * 0.1 + (Math.abs(K.x - FW) > 22 ? 0.1 : 0);
    return clamp(0.2 + 0.55 * dq + 0.3 * ang - (blocked ? 0.3 : 0) - 0.12 * press + kOff, 0, 1);
  }

  // ---- Phase 3 session 2: adaptive difficulty (offline only) --------------------------------------------------------------------
  // A level is a real number on the Easy 0 .. Normal 1 .. Hard 2 axis. paramsAt interpolates DIFFS piecewise-linearly and returns the DIFFS
  // object itself at integer levels (so an opted-out or untouched tier is the legacy brain exactly).
  const LVL = { easy: 0, normal: 1, hard: 2 }, LVL_KEYS = ['easy', 'normal', 'hard'];
  const lvlOf = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, 0, 2) : 1);
  const lerp3 = (v0, v1, v2, l) => { l = lvlOf(l); return l === 0 ? v0 : l === 1 ? v1 : l === 2 ? v2 : l < 1 ? v0 + (v1 - v0) * l : v1 + (v2 - v1) * (l - 1); };
  function paramsAt(lvl) {
    const l = lvlOf(lvl);
    if (l === 0 || l === 1 || l === 2) return DIFFS[LVL_KEYS[l]];
    const lo = DIFFS[LVL_KEYS[Math.floor(l)]], hi = DIFFS[LVL_KEYS[Math.ceil(l)]], f = l - Math.floor(l), o = {};
    for (const k in lo) o[k] = lo[k] + (hi[k] - lo[k]) * f;
    return o;
  }
  const ADAPT = { MAX: 0.5, STEP: 0.15, DEAD: 0.15, EMA: 0.5, MOM: 0.05 };
  const offBounds = (diff) => { const t = LVL[diff] === undefined ? 1 : LVL[diff]; return [Math.max(-ADAPT.MAX, 0 - t), Math.min(ADAPT.MAX, 2 - t)]; };      // easy only harder, hard only easier
  const Adapt = {
    fresh: () => ({ v: 1, off: { easy: 0, normal: 0, hard: 0 }, ema: { easy: 0, normal: 0, hard: 0 }, n: 0 }),
    sanitize(st) {
      const o = Adapt.fresh(); if (!st || typeof st !== 'object') return o;
      for (const d of LVL_KEYS) {
        const [lo, hi] = offBounds(d), f = st.off && st.off[d], e = st.ema && st.ema[d];
        o.off[d] = Number.isFinite(f) && f >= lo && f <= hi ? f : 0;
        o.ema[d] = Number.isFinite(e) && e >= -1 && e <= 1 ? e : 0;
      }
      o.n = Number.isFinite(st.n) && st.n >= 0 && st.n < 1e9 ? Math.floor(st.n) : 0;
      return o;
    },
    // match performance of the human, -1 (crushed) .. 1 (dominant): r = { gf, ga, win, poss (human share 0..1), sot (human share of shots on target) }
    perf(r) {
      if (!r) return 0;
      const win = Math.max(1, +r.win || 1), gf = +r.gf || 0, ga = +r.ga || 0, share = (v) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0.5);
      const p = 0.6 * (gf - ga) / win + 0.25 * (2 * share(r.poss) - 1) + 0.15 * (2 * share(r.sot) - 1);
      return Number.isFinite(p) ? clamp(p, -1, 1) : 0;
    },
    // pure: the next state after a match at tier `diff` (r is a result or { perf })
    next(st, diff, r) {
      const o = Adapt.sanitize(st), d = LVL[diff] === undefined ? 'normal' : diff, pf = typeof (r && r.perf) === 'number' && Number.isFinite(r.perf) ? clamp(r.perf, -1, 1) : Adapt.perf(r);
      const e = ADAPT.EMA * o.ema[d] + (1 - ADAPT.EMA) * pf, [lo, hi] = offBounds(d);
      o.ema[d] = e;
      if (Math.abs(e) > ADAPT.DEAD) o.off[d] = clamp(o.off[d] + ADAPT.STEP * e, lo, hi);
      o.n++;
      return o;
    },
    level(st, diff) { const d = LVL[diff] === undefined ? 'normal' : diff, o = Adapt.sanitize(st); return lvlOf(LVL[d] + o.off[d]); },
    keeperNerf: (l) => lerp3(16, 0, -6, l),
    payout: (l) => lerp3(0.4, 0.7, 1, l),
    label(diff, lvl) { const d = LVL[diff] === undefined ? 'normal' : diff, off = lvlOf(lvl) - LVL[d]; return 'ADAPTIVE \u00b7 ' + d.toUpperCase() + ' ' + (off < 0 ? '-' : '+') + Math.abs(off).toFixed(2); },
  };
  const oppOf = (G, me) => G.players[1 - me.team];      // the opposing player (1v1; with two a side this stays the legacy pick, bit-identical: 2v2 CPU tactics are blocked on an offline 2v2 mode)
  const baseTac = (m, D) => (m.baseTac ? 0.3 * D.smart : 0);      // opts.pers set (and not the neutral profile): a small base of every session 2 tactic, scaled by the CPU's smarts

  // create(diff, opts): opts = { pers (a profile from profileOf), lvl (a level 0..2), adapt (in-match momentum) }.
  // create(diff) with no opts is the pre-Phase-3 brain exactly: m.D is the DIFFS entry and m.pz is the neutral table.
  function create(diff, opts) {
    const pers = (opts && opts.pers) || NEUTRAL_PROF, dn = diff || 'normal', hasLvl = !!opts && opts.lvl !== undefined && opts.lvl !== null && Number.isFinite(+opts.lvl);
    const lvl = hasLvl ? lvlOf(opts.lvl) : (LVL[dn] === undefined ? 1 : LVL[dn]);
    return { diff: dn, D: hasLvl ? paramsAt(lvl) : DIFFS[dn], lvl0: lvl, adapt: !!(opts && opts.adapt), rep: -1, baseTac: pers !== NEUTRAL_PROF, pers, pz: pers.z, mood: null, moodT: 0, vt: 0, moods: 0, ctrT: 0, holdT: 0, possT: 0, oppHad: false, hadBall: false, dbg: { act: '', q: 0 },
      t: 0, laneY: GCY, shot: null, shotCd: 0, tackleCd: 0, skillCd: 1, fool: null, sg: null, shT: 0, shCd: 0, ovDone: false, ovStops: 0,
      out: { mx: 0, my: 0, sprint: false, jockey: false, shoot: false, finesse: false, chip: false, lob: false, skill: false, j: false, k: false, l: false, pass: false } };
  }

  function update(G, me, m, dt) {
    if (m.adapt && G.rep !== m.rep) {      // in-match momentum (stateless: derived from the score at each rep change, inside the tier's +-0.5 band)
      m.rep = G.rep;
      const t = LVL[m.diff] === undefined ? 1 : LVL[m.diff], gap = clamp(G.score[1 - me.team] - G.score[me.team], -2, 2);
      m.D = paramsAt(clamp(m.lvl0 + ADAPT.MOM * gap, Math.max(0, t - ADAPT.MAX), Math.min(2, t + ADAPT.MAX)));
    }
    const D = m.D, o = m.out, b = G.ball, opp = oppOf(G, me), dir = me.dir;
    const R = G.rand;
    // Phase 2: the CPU knows its own player's traits and weak foot (offline only: the server has no CPU). All neutral when ISO.STYLE_OFF.
    const trs = ISO.styleOf(me.def).traits, has = (id) => trs.includes(id), fake = ISO.styleOf(opp.def).m.fakeSell;
    m.tackleCd -= dt; m.skillCd -= dt; m.shotCd -= dt; m.shT = Math.max(0, m.shT - dt); m.shCd = Math.max(0, m.shCd - dt);
    if (opp.stopT <= 0) m.ovDone = false;      // one-shot latch per opponent stop
    o.skill = false; o.j = o.k = o.l = false; o.jockey = false; o.sprint = false; o.mx = 0; o.my = 0;
    o.shoot = o.finesse = o.chip = o.lob = false;
    m.dbg.act = '';
    if (G.phase !== 'play') { m.shot = null; m.aimHold = 0; m.fool = null; m.sg = null; m.oppHad = false; m.ctrT = 0; m.holdT = 0; m.possT = 0; m.hadBall = false; return o; }
    // Phase 3 memory (lives on the AI object only): possession clock, counter window, mood
    m.ctrT = Math.max(0, m.ctrT - dt);
    if (b.owner === me) { m.possT += dt; if (!m.hadBall && m.oppHad && m.pz.counter > 0) m.ctrT = m.pz.counter; if (!m.hadBall) m.oppHad = false; m.hadBall = true; }
    else { m.possT = 0; m.hadBall = false; if (b.owner === opp) m.oppHad = true; }
    if (m.pz.vary > 0) {              // unpredictable: borrow another archetype's knob table for a while
      if (m.mood) { m.moodT -= dt; if (m.moodT <= 0) m.mood = null; }
      else { m.vt -= dt; if (m.vt <= 0) { m.vt = 0.5; if (R() < m.pz.vary * 0.25) { m.mood = ARCH_Z[ARCH_ORDER[(R() * ARCH_ORDER.length) | 0]]; m.moodT = 1.5 + R() * 1.5; m.moods++; } } }
    }
    const Z = m.mood || m.pz, ctr = m.ctrT > 0, tb = baseTac(m, D), lbK = Z.laneBlock + tb, rbK = Z.rebound, cxK = Z.ctxSkill;

    const tgx = FW, ogx = FW;           // both players attack the one goal; the defender protects it too
    const inBox = ISO.inBox(b), clearing = b.owner === me && inBox && (G.mustClear === me.team || me.team !== G.attacker);      // won the ball in the box: carry it out before anything else
    const dB = hyp(b.x - me.x, b.y - me.y);
    const go = (x, y, s) => { const dx = x - me.x, dy = y - me.y, d = hyp(dx, dy); if (d > 4) { o.mx = (dx / d) * s; o.my = (dy / d) * s; } return d; };

    if (m.shot) {                       // holding a shot key to charge it
      m.shot.t -= dt;
      if (b.owner === opp || b.holder) m.shot = null;
      else if (m.shot.t > 0) o[m.shot.key] = true;
      else { m.aimHold = m.shot.aim; m.shot = null; m.shotCd = 0.5; }
    }

    if (b.owner === me) {
      const K = G.keeper;
      const dg = hyp(tgx - me.x, GCY - me.y);
      const ox = opp.x - me.x, oy = opp.y - me.y, od = hyp(ox, oy) || 1;
      const ahead = ox * dir > 0;
      m.t -= dt;
      if (m.t <= 0) {
        m.t = D.think * (0.7 + R() * 0.6);
        if (ahead && od < 190 && Math.abs(oy) < 80) m.laneY = clamp(me.y + (oy > 0 ? -1 : 1) * 120, 70, FH - 70);
        else m.laneY = me.y + (GCY - me.y) * 0.6;
        if (ctr && !(ahead && od < 190 && Math.abs(oy) < 80)) m.laneY = me.y + (GCY - me.y) * 0.9;
      }
      let tx = tgx - dir * 110, ty = m.laneY;
      if (clearing) { tx = tgx - C.BOXD - 90; ty = me.y < GCY ? Math.max(70, me.y - 60) : Math.min(FH - 70, me.y + 60); }   // won the rebound: take it out of the box
      else if (Math.abs(tgx - me.x) < 220) { tx = tgx - dir * 30; ty = GCY + (me.y - GCY) * 0.3; }
      let dx = tx - me.x, dy = ty - me.y, d = hyp(dx, dy) || 1;
      dx /= d; dy /= d;
      if (od < 110 && (ox * dx + oy * dy) / od > 0.2) {       // swerve around the defender
        const side = dx * oy - dy * ox > 0 ? -1 : 1, w = (1 - od / 110) * 1.4;
        const px = -dy * side * w, py = dx * side * w;
        dx += px; dy += py;
        d = hyp(dx, dy) || 1; dx /= d; dy /= d;
      }
      // stay on the pitch
      if (me.y < 55 && dy < 0.25) dy = 0.25 + (55 - me.y) / 55;
      else if (me.y > FH - 55 && dy > -0.25) dy = -0.25 - (me.y - (FH - 55)) / 55;
      if (Math.abs(tgx - me.x) < 45 && (me.y < GY0 || me.y > GY1)) { dx = -dir * 0.8; dy = me.y < GCY ? -0.3 : 0.3; }      // beside the goal on the line: back out, never push against the post
      d = hyp(dx, dy) || 1; dx /= d; dy /= d;
      o.mx = dx * D.speed; o.my = dy * D.speed;
      o.sprint = me.stam > (has('relentless') ? 14 : 22) - (ctr ? 8 : 0) && !(ahead && od < 75);
      if (m.shot || m.aimHold) {          // keep aiming through the release frame
        o.sprint = false; o.mx = dir * 0.7; o.my = (m.shot ? m.shot.aim : m.aimHold) * 0.7; m.aimHold = 0; return o;
      }

      if (clearing) { m.dbg.act = 'clear'; return o; }
      m.dbg.act = 'carry';
      if (m.sg) {          // stop-and-go: one jockey tap, a beat, then sprint away from the defender
        const g = m.sg; g.t += dt;
        if (g.t <= dt * 1.5) { o.jockey = true; o.sprint = false; o.mx = dx * 0.5; o.my = dy * 0.5; return o; }
        if (me.stopT > 0) { o.sprint = false; return o; }
        if (me.goT > 0) { o.sprint = true; o.mx = g.x; o.my = g.y; return o; }
        m.sg = null;
      } else if (ahead && od < 75 && od > 40 && me.sgCd <= 0 && me.stam > 30 && hyp(me.vx, me.vy) > me.jog * 0.8 && R() < D.smart * dt * 3 * (has('quickstep') ? 1.5 : 1) * Z.sg) {
        const fx = Math.cos(me.face), fy = Math.sin(me.face), side = fx * oy - fy * ox > 0 ? -1 : 1;
        m.dbg.act = 'sg'; m.sg = { t: 0, x: -fy * side * 0.8 + fx * 0.6, y: fx * side * 0.8 + fy * 0.6 };
        o.jockey = true; o.sprint = false; return o;
      }
      if (!ahead && od < 40 && me.stam < 25 && m.shT <= 0 && m.shCd <= 0) { m.shT = 0.4; m.shCd = has('press') ? 1.6 : 2.5; }
      if (m.shT > 0 && od < 60) { o.jockey = true; o.sprint = false; return o; }
      if (m.skillCd <= 0 && ahead && od < 92 && od > 38 && R() < Math.min(0.6, D.skillP * Z.skill * (ctr ? 0.5 : 1)) * dt * 6 * (has('trickster') ? 1.4 : 1)) {
        m.skillCd = 1.2 + R() * 1.6;
        o.skill = true; m.dbg.act = 'skill';
        { const mask = [1, 2, 4, 3, 5, 6][(R() * 6) | 0]; o.j = !!(mask & 1); o.k = !!(mask & 2); o.l = !!(mask & 4); }       // a random J/K/L chord
        const r = R(), fx = Math.cos(me.face), fy = Math.sin(me.face);
        const side = fx * oy - fy * ox > 0 ? -1 : 1;
        o.sprint = R() < 0.45;
        if (r < 0.45) { o.mx = -fy * side; o.my = fx * side; }        // side move, away from the defender
        else if (r < 0.65) { o.mx = fx; o.my = fy; }                  // forward: nutmeg / feint / heel
        else if (r < 0.8) { o.mx = -fx; o.my = -fy; }                 // back: drag back / rainbow
        else { o.mx = 0; o.my = 0; }                                  // neutral: stepover / roulette
        if (cxK > 0 && R() < cxK) {      // context: pick the move from the defender's side, closing speed and distance (a new draw only behind a non-neutral knob)
          const dxn = ox / od, dyn = oy / od, cs = -((opp.vx - me.vx) * dxn + (opp.vy - me.vy) * dyn);      // > 0: the defender is closing on me
          const sx = -fy * side, sy = fx * side;
          o.j = o.k = o.l = false;
          if (od >= 70) { o.k = true; o.sprint = true; o.mx = fx; o.my = fy; m.dbg.act = 'skill-ctx'; }       // room: knock it past him and go
          else if (cs > 80) { o.j = o.l = true; o.sprint = false; o.mx = sx; o.my = sy; }       // he is lunging in: roulette away from him
          else { o.k = o.l = true; o.sprint = false; o.mx = sx; o.my = sy; }       // he is standing off: elastico to the open side
        }
        return o;
      }

      const range = (240 + 110 * q(me.a.lng) + (has('longshot') ? 20 : 0)) * Z.range;
      const angOK = Math.abs(me.y - GCY) < Math.abs(tgx - me.x) * 1.3 + 40;
      const blocked = ahead && od < 45 && Math.abs(oy) < 26;
      const sq = Z.minQ > 0 || Z.patience > 0 ? shotQ(G, me, opp, K, dg, range) : 1, minEff = Z.minQ * clamp((12 - m.possT) / 4, 0, 1);
      m.dbg.q = sq;
      if (Z.patience > 0 && ahead && od < 110 && sq < minEff && m.holdT < Z.patience && dg > 60) {     // hold-up: shield the ball and drift to the open side instead of forcing the shot
        m.holdT += dt; m.dbg.act = 'hold';
        const side = oy > 0 ? -1 : 1;
        o.jockey = true; o.sprint = false; o.mx = dir * 0.15; o.my = side * 0.6;
        return o;
      }
      if (sq >= minEff) m.holdT = Math.max(0, m.holdT - dt * 0.5);
      if (m.shotCd <= 0 && dg < range && angOK && (!blocked || dg < 120) && (Z.minQ <= 0 || sq >= minEff) &&
        (dg < 105 * Z.closeIn * (ctr ? 1.3 : 1) || R() < dt * (dg < (ctr ? 230 : 170) ? 9 : 1.6) * clamp(D.eager * Z.eager * (ctr ? 1.5 : 1), 0.25, 1.8))) {
        m.dbg.act = 'shoot';
        const kOut = Math.abs(K.x - tgx);
        let key = 'shoot', hold;
        if (kOut > 22 && dg > 90 && dg < 230 && R() < 0.4 * D.smart) { key = 'lob'; hold = 0.3 + R() * 0.12; }     // keeper off his line: chip him
        else if (dg > 150 && R() < 0.45 * D.smart) { key = 'chip'; hold = 0.7 + R() * 0.24; }      // power shot: long wind-up
        else if (dg > 170 && R() < 0.15 + 0.4 * q(me.a.cur) + (has('finesse') ? 0.2 : 0)) { key = 'finesse'; hold = 0.26 + R() * 0.18; }
        else hold = dg > 230 ? 0.33 + R() * 0.16 : 0.15 + R() * 0.2;
        let aim = K.y > GCY ? -1 : 1;
        if (R() > 0.5 + (D.smart + Z.aimSmart) * 0.5) aim = R() < 0.5 ? -1 : 1;
        // weak foot: a shooter with a poor weak foot lines up the side his strong foot covers (more often when the CPU is smarter)
        if (!ISO.STYLE_OFF && q(me.a.wf) < 0.5 && R() < D.smart * (1 - 2 * q(me.a.wf))) aim = (me.def.foot === 'R' ? -1 : 1) * dir;
        m.shot = { key, t: hold, aim };
        o[key] = true;
      }
      return o;
    }

    if (b.owner === opp) {
      if (opp.state === 'skill' && opp.skill && opp.skill.t < dt * 1.5 && opp.skill.def.fake && dB < 125 &&
        R() < D.foolP * fake * (0.45 + 0.55 * q(opp.a.skl))) {
        m.fool = { t: 0.28 + R() * 0.2, x: opp.skill.fakeX, y: opp.skill.fakeY };     // bought the feint
      }
      if (!m.fool && opp.fakeT > ISO.C.FAKE_T - dt * 1.5 && dB < 125 && R() < D.foolP * fake * (0.45 + 0.55 * q(opp.a.skl))) {
        m.fool = { t: 0.3 + R() * 0.2, x: (opp.x - me.x) / (hyp(opp.x - me.x, opp.y - me.y) || 1), y: (opp.y - me.y) / (hyp(opp.x - me.x, opp.y - me.y) || 1) };     // bought the fake shot: lunges to block
      }
      if (!m.fool && opp.stopT > 0 && !m.ovDone && dB < 125 && (m.ovDone = true) && R() < D.foolP * 0.6) {
        m.ovStops++;
        const ux = (opp.x - me.x) / (hyp(opp.x - me.x, opp.y - me.y) || 1), uy = (opp.y - me.y) / (hyp(opp.x - me.x, opp.y - me.y) || 1);
        m.fool = { t: 0.2, x: ux, y: uy };      // overruns the dribbler's stop
      }
      if (m.fool) {
        m.dbg.act = 'fool'; m.fool.t -= dt;
        o.mx = m.fool.x; o.my = m.fool.y;
        if (m.fool.t <= 0) m.fool = null;
        return o;
      }
      const gdx = ogx - b.x, gdy = GCY - b.y, gd = hyp(gdx, gdy) || 1;
      const goalSide = me.x - b.x > -6;       // between the ball and the goal
      const gap = (goalSide ? (dB < 150 ? 22 : 50) : 95) * Z.pressGap;
      const tx0 = b.x + (gdx / gd) * gap + b.vx * 0.12, ty0 = b.y + (gdy / gd) * gap + b.vy * 0.12;
      let tx = tx0, ty = ty0;
      if (lbK > 0 && opp.charge && dB < 170) { const k = Math.min(1, lbK), lx = b.x + (gdx / gd) * 34, ly = b.y + (gdy / gd) * 34; tx += (lx - tx) * k; ty += (ly - ty) * k; m.dbg.act = 'block'; }      // a shot is winding up: step onto the shot line (pure)
      if (Z.dropDeep > 0 && gd > 200) { const px = ogx - (gdx / gd) * (C.BOXD - 30), py = GCY - (gdy / gd) * (C.BOXD - 30); tx += (px - tx) * Z.dropDeep; ty += (py - ty) * Z.dropDeep; }
      const d = go(tx, ty, D.speed);
      o.sprint = me.stam > 15 / Z.recover && (d > 80 || !goalSide);
      m.dbg.act = 'press';
      if (goalSide && dB < 95 * Z.jockeyR && dB > 30 && d < 40) { o.jockey = true; o.sprint = false; m.dbg.act = 'jockey'; }
      if (m.tackleCd <= 0 && opp.state !== 'skill') {
        if (dB < 33 && R() < Math.min(0.9, D.tackleP * Z.tackle) * dt * 8) {
          m.dbg.act = 'tackle'; o.shoot = true; o.sprint = false; o.jockey = false; m.tackleCd = 0.7 + R() * 0.5;
          go(b.x, b.y, 1);
        } else if (!goalSide && dB < 78 && dB > 36 && hyp(me.vx, me.vy) > me.jog && me.stam > 20 && R() < Math.min(0.25, D.slideP * Z.slide) * dt * 5) {
          m.dbg.act = 'slide'; o.shoot = true; o.sprint = true; m.tackleCd = 1.6;
          go(b.x + b.vx * 0.2, b.y + b.vy * 0.2, 1);
        }
      }
      return o;
    }

    // loose ball, or a keeper has it
    m.fool = null; m.dbg.act = 'loose';
    if (b.holder) { go(C.FW - C.BOXD - 70, GCY, 0.9); return o; }       // the keeper is about to throw it out: get ready
    let tt = Math.min(0.45, dB / 350);
    if (b.z > 18 || b.vz > 150) tt = Math.max(tt, ISO.Phys.landT(b) * 0.9);   // run to where a high ball lands
    let lx = clamp(b.x + b.vx * tt, 4 - C.BACK, FW - 4), ly = clamp(b.y + b.vy * tt, 4, FH - 4);
    if (rbK > 0 && b.shotLive && b.shotTeam >= 0 && (b.shot || G.t - b.shotT < 0.6) && G.keeper.state !== 'hold') {      // a shot is live: be where the rebound drops, in front of the keeper on the ball's side
      const k = Math.min(1, rbK), sx = G.keeper.x - 70, sy = clamp(GCY + (b.y - GCY) * 0.5, GY0, GY1);
      lx += (sx - lx) * k; ly += (sy - ly) * k; m.dbg.act = 'rebound';
    }
    const d = go(lx, ly, 1);
    o.sprint = d > 40 && me.stam > 10;
    if (!m.shot && me.team === G.attacker && G.mustClear !== me.team && m.shotCd <= 0 && dB < C.SHOT.T.ftPress && hyp(tgx - b.x, GCY - b.y) < 270 && R() < D.smart * dt * 6) {
      // resolve the strike on the ball's predicted state at arrival (pure: no RNG): fast ground balls as before, plus volleys, half-volleys and headers
      const ta = Math.min(0.3, dB / 400), pz = b.z + b.vz * ta - (0.5 * C.GRAV) * ta * ta;
      const pb = { x: b.x + b.vx * ta, y: b.y + b.vy * ta, z: Math.max(0, pz), vx: b.vx, vy: b.vy, vz: b.vz - C.GRAV * ta, bncAt: b.bncAt };
      const sh = { ...me, x: pb.x - 12 * dir, y: pb.y, vx: 0, vy: 0, face: dir > 0 ? 0 : Math.PI };
      const rs = ISO.Game.resolveStrike(G, sh, 'normal', true, undefined, undefined, pb);
      if (rs.reach && (rs.kind !== 'first-time' ? true : hyp(b.vx, b.vy) > 60)) {
        m.shot = { key: 'shoot', t: 0.6, aim: G.keeper.y > GCY ? -1 : 1 };    // first-time finish
        o.shoot = true;
      }
    }
    return o;
  }

  const archProfile = (id) => (id === 'neutral' ? NEUTRAL_PROF : Object.freeze({ id, name: ARCH[id].name, desc: ARCH[id].desc, z: ARCH_Z[id], scores: Object.freeze({}) }));      // a pure archetype table (tests, tools)
  ISO.AI = { create, update, DIFFS, LVL, ADAPT, Adapt, paramsAt, oppOf, KNOBS, ARCH, ARCH_ORDER, NEUTRAL, profileOf, archProfile, shotQ };
})();
