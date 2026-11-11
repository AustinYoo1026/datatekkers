/* ISO FOOTBALL — render smoothing. The simulation advances in fixed steps that do not line up with display frames
   (72 steps a second against a 60 / 120 / 144 Hz screen), so drawing the raw state judders. Instead every frame is drawn
   part-way between the last two simulation states. Online, the same layer hides corrections from the server: when a
   snapshot moves something, the difference is kept as an offset that melts away over a few frames.

     capture(G)            before every simulation step: remember where everything is
     begin(G, alpha, dt)   before drawing: blend the state (alpha = fraction of a step since the last one). Call end(G) after.
     grab(G) / correct(G, old)   around applying a server snapshot: turn the jump into a decaying offset
     reset()               new match */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const TELEPORT = 48;            // a move this large in one step is a reset (kick-off), not motion: never blended
  const SNAP = 110;               // a correction this large is shown at once
  const DECAY = 14;               // 1/s: how fast a correction offset melts away

  let prev = null, saved = null, errs = null;
  const ents = (G) => G.players.concat(G.keeper, G.ball);
  const shot = (e) => ({ x: e.x, y: e.y, z: e.z || 0, face: e.face || 0, runPh: e.runPh || 0, animDist: e.animDist || 0, rot: e.rot || 0,
    stT: e.stT || 0, state: e.state, skT: e.skill ? e.skill.t : -1, skId: e.skill ? e.skill.id : null });
  const angLerp = (a, b, f) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * f; };

  function capture(G) { prev = ents(G).map(shot); }
  function grab(G) { return ents(G).map((e) => ({ x: e.x, y: e.y, z: e.z || 0 })); }
  function correct(G, old) {
    const E = ents(G);
    if (!errs || errs.length !== E.length) errs = E.map(() => ({ x: 0, y: 0, z: 0 }));
    E.forEach((e, i) => {
      const r = errs[i], o = old[i];
      r.x += o.x - e.x; r.y += o.y - e.y; r.z += o.z - (e.z || 0);
      if (Math.hypot(r.x, r.y) > SNAP) { r.x = r.y = r.z = 0; }
    });
    // prev belongs to the timeline that was just replaced: shift it with the correction so the blend stays continuous
    if (prev && prev.length === E.length) E.forEach((e, i) => { const p = prev[i], o = old[i]; p.x += e.x - o.x; p.y += e.y - o.y; p.z += (e.z || 0) - o.z; });
  }

  function begin(G, alpha, dt) {
    const E = ents(G);
    saved = E.map(shot);
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha, k = errs ? Math.exp(-DECAY * (dt || 0)) : 0;
    E.forEach((e, i) => {
      const p = prev && prev.length === E.length ? prev[i] : null, c = saved[i];
      if (p && a < 1 && Math.hypot(c.x - p.x, c.y - p.y) < TELEPORT) {
        e.x = p.x + (c.x - p.x) * a; e.y = p.y + (c.y - p.y) * a;
        if (e.z !== undefined) e.z = p.z + (c.z - p.z) * a;
        if (e.face !== undefined) e.face = angLerp(p.face, c.face, a);
        if (e.runPh !== undefined) e.runPh = p.runPh + (c.runPh - p.runPh) * a;
        if (e.animDist !== undefined) e.animDist = p.animDist + (c.animDist - p.animDist) * a;
        if (e.rot !== undefined) e.rot = p.rot + (c.rot - p.rot) * a;
        if (e.stT !== undefined && p.state === c.state && c.stT >= p.stT) e.stT = p.stT + (c.stT - p.stT) * a;
        if (e.skill && p.skId === c.skId && c.skT >= p.skT && p.skT >= 0) e.skill.t = p.skT + (c.skT - p.skT) * a;
      }
      if (errs && errs[i]) {
        const r = errs[i];
        r.x *= k; r.y *= k; r.z *= k;
        e.x += r.x; e.y += r.y; if (e.z !== undefined) e.z = Math.max(0, e.z + r.z);
      }
    });
  }
  function end(G) {
    if (!saved) return;
    ents(G).forEach((e, i) => {
      const c = saved[i];
      e.x = c.x; e.y = c.y;
      if (e.z !== undefined) e.z = c.z;
      if (e.face !== undefined) e.face = c.face;
      if (e.runPh !== undefined) e.runPh = c.runPh;
      if (e.animDist !== undefined) e.animDist = c.animDist;
      if (e.rot !== undefined) e.rot = c.rot;
      if (e.stT !== undefined) e.stT = c.stT;
      if (e.skill && c.skT >= 0) e.skill.t = c.skT;
    });
    saved = null;
  }
  function reset() { prev = null; saved = null; errs = null; }

  ISO.Smooth = { capture, grab, correct, begin, end, reset };
})();
