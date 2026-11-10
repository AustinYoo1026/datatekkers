/* ISO FOOTBALL — CPU opponent. Produces the same input structure a human does,
   so the CPU plays by exactly the same rules as a keyboard player. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const C = ISO.C, { FW, FH, GY0, GY1 } = C;
  const GCY = (GY0 + GY1) / 2;
  const { clamp, hyp, q } = ISO.util;

  const DIFFS = {
    easy:   { think: 0.3,  tackleP: 0.22, slideP: 0.04, skillP: 0.08, foolP: 0.85, eager: 0.55, smart: 0.3, speed: 0.9 },
    normal: { think: 0.18, tackleP: 0.48, slideP: 0.1,  skillP: 0.25, foolP: 0.6,  eager: 1.0,  smart: 0.6, speed: 1 },
    hard:   { think: 0.09, tackleP: 0.8,  slideP: 0.18, skillP: 0.45, foolP: 0.32, eager: 1.4,  smart: 0.9, speed: 1 },
  };

  function create(diff) {
    return { diff: diff || 'normal', t: 0, laneY: GCY, shot: null, shotCd: 0, tackleCd: 0, skillCd: 1, fool: null,
      out: { mx: 0, my: 0, sprint: false, jockey: false, shoot: false, finesse: false, chip: false, skill: false } };
  }

  function update(G, me, m, dt) {
    const D = DIFFS[m.diff], o = m.out, b = G.ball, opp = G.players[1 - me.team], dir = me.dir;
    const R = G.rand;
    m.tackleCd -= dt; m.skillCd -= dt; m.shotCd -= dt;
    o.skill = false; o.jockey = false; o.sprint = false; o.mx = 0; o.my = 0;
    o.shoot = o.finesse = o.chip = false;
    if (G.phase !== 'play') { m.shot = null; m.aimHold = 0; m.fool = null; return o; }

    const tgx = FW, ogx = FW;           // both players attack the one goal; the defender protects it too
    const inBox = ISO.inBox(b), clearing = b.owner === me && inBox && me.team !== G.attacker;
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
      if (Math.abs(tgx - me.x) < 45 && (me.y < GY0 || me.y > GY1)) { dx = -dir * 0.2; dy = me.y < GCY ? 1 : -1; }
      d = hyp(dx, dy) || 1; dx /= d; dy /= d;
      o.mx = dx * D.speed; o.my = dy * D.speed;
      o.sprint = me.stam > 22 && !(ahead && od < 75);
      if (m.shot || m.aimHold) {          // keep aiming through the release frame
        o.sprint = false; o.mx = dir * 0.7; o.my = (m.shot ? m.shot.aim : m.aimHold) * 0.7; m.aimHold = 0; return o;
      }

      if (clearing) return o;
      if (m.skillCd <= 0 && ahead && od < 92 && od > 38 && R() < D.skillP * dt * 6) {
        m.skillCd = 1.2 + R() * 1.6;
        o.skill = true;
        const r = R(), fx = Math.cos(me.face), fy = Math.sin(me.face);
        const side = fx * oy - fy * ox > 0 ? -1 : 1;
        o.sprint = R() < 0.45;
        if (r < 0.45) { o.mx = -fy * side; o.my = fx * side; }        // side move, away from the defender
        else if (r < 0.65) { o.mx = fx; o.my = fy; }                  // forward: nutmeg / feint / heel
        else if (r < 0.8) { o.mx = -fx; o.my = -fy; }                 // back: drag back / rainbow
        else { o.mx = 0; o.my = 0; }                                  // neutral: stepover / roulette
        return o;
      }

      const range = 240 + 110 * q(me.a.lng);
      const angOK = Math.abs(me.y - GCY) < Math.abs(tgx - me.x) * 1.3 + 40;
      const blocked = ahead && od < 45 && Math.abs(oy) < 26;
      if (m.shotCd <= 0 && dg < range && angOK && (!blocked || dg < 120) &&
        (dg < 105 || R() < dt * (dg < 170 ? 9 : 1.6) * D.eager)) {
        const kOut = Math.abs(K.x - tgx);
        let key = 'shoot', hold;
        if (dg > 150 && R() < 0.45 * D.smart) { key = 'chip'; hold = 1.0 + R() * 0.35; }      // power shot: long wind-up
        else if (dg > 170 && R() < 0.15 + 0.4 * q(me.a.cur)) { key = 'finesse'; hold = 0.35 + R() * 0.25; }
        else hold = dg > 230 ? 0.48 + R() * 0.24 : 0.22 + R() * 0.3;
        let aim = K.y > GCY ? -1 : 1;
        if (R() > 0.5 + D.smart * 0.5) aim = R() < 0.5 ? -1 : 1;
        m.shot = { key, t: hold, aim };
        o[key] = true;
      }
      return o;
    }

    if (b.owner === opp) {
      if (opp.state === 'skill' && opp.skill && opp.skill.t < dt * 1.5 && opp.skill.def.fake && dB < 125 &&
        R() < D.foolP * (0.45 + 0.55 * q(opp.a.skl))) {
        m.fool = { t: 0.28 + R() * 0.2, x: opp.skill.fakeX, y: opp.skill.fakeY };     // bought the feint
      }
      if (!m.fool && opp.fakeT > 0.4 - dt * 1.5 && dB < 125 && R() < D.foolP * (0.45 + 0.55 * q(opp.a.skl))) {
        m.fool = { t: 0.3 + R() * 0.2, x: (opp.x - me.x) / (hyp(opp.x - me.x, opp.y - me.y) || 1), y: (opp.y - me.y) / (hyp(opp.x - me.x, opp.y - me.y) || 1) };     // bought the fake shot: lunges to block
      }
      if (m.fool) {
        m.fool.t -= dt;
        o.mx = m.fool.x; o.my = m.fool.y;
        if (m.fool.t <= 0) m.fool = null;
        return o;
      }
      const gdx = ogx - b.x, gdy = GCY - b.y, gd = hyp(gdx, gdy) || 1;
      const goalSide = me.x - b.x > -6;       // between the ball and the goal
      const gap = goalSide ? (dB < 150 ? 22 : 50) : 95;
      const tx = b.x + (gdx / gd) * gap + b.vx * 0.12, ty = b.y + (gdy / gd) * gap + b.vy * 0.12;
      const d = go(tx, ty, D.speed);
      o.sprint = me.stam > 15 && (d > 80 || !goalSide);
      if (goalSide && dB < 95 && dB > 30 && d < 40) { o.jockey = true; o.sprint = false; }
      if (m.tackleCd <= 0 && opp.state !== 'skill') {
        if (dB < 33 && R() < D.tackleP * dt * 8) {
          o.shoot = true; o.sprint = false; o.jockey = false; m.tackleCd = 0.7 + R() * 0.5;
          go(b.x, b.y, 1);
        } else if (!goalSide && dB < 78 && dB > 36 && hyp(me.vx, me.vy) > me.jog && me.stam > 20 && R() < D.slideP * dt * 5) {
          o.shoot = true; o.sprint = true; m.tackleCd = 1.6;
          go(b.x + b.vx * 0.2, b.y + b.vy * 0.2, 1);
        }
      }
      return o;
    }

    // loose ball, or a keeper has it
    m.fool = null;
    if (b.holder) { go(C.FW - C.BOXD - 70, GCY, 0.9); return o; }       // the keeper is about to throw it out: get ready
    let tt = Math.min(0.45, dB / 350);
    if (b.z > 18 || b.vz > 150) tt = Math.max(tt, (b.vz + Math.sqrt(b.vz * b.vz + 1800 * b.z)) / 900 * 0.9);   // run to where a high ball lands
    const d = go(clamp(b.x + b.vx * tt, 4, FW - 4), clamp(b.y + b.vy * tt, 4, FH - 4), 1);
    o.sprint = d > 40 && me.stam > 10;
    if (!m.shot && m.shotCd <= 0 && dB < 85 && hyp(tgx - b.x, GCY - b.y) < 270 && hyp(b.vx, b.vy) > 60 && R() < D.smart * dt * 6) {
      m.shot = { key: 'shoot', t: 0.6, aim: G.keeper.y > GCY ? -1 : 1 };    // first-time finish
      o.shoot = true;
    }
    return o;
  }

  ISO.AI = { create, update, DIFFS };
})();
