/* ISO FOOTBALL — online play: shared snapshot codec. Loaded by the browser and by server/server.js.
   The server owns the simulation; clients receive snapshots of everything the renderer reads and apply them
   onto a local Game object (built with the same player definitions) so render.js and the HUD work unchanged. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const SKIP = new Set(['def', 'a', 'moves', 'rand', 'gauss', 'keepers', 'events', 'players', 'keeper', 'ball']);
  const LERP = ['x', 'y', 'z'];                  // blended between snapshots on the client; everything else is taken from the earlier one

  function enc(v) {
    if (v && typeof v === 'object') {
      if (v.kind === 'p') return { $p: v.team };
      if (v.kind === 'k') return { $k: v.team };
      if (Array.isArray(v)) return v.map(enc);
      const o = {};
      for (const k in v) { const x = v[k]; if (typeof x !== 'function' && !(k === 'def' || k === 'a' || k === 'moves')) o[k] = enc(x); }
      return o;
    }
    return v;
  }
  function body(o) {
    const r = {};
    for (const k in o) { const x = o[k]; if (typeof x !== 'function' && !SKIP.has(k)) r[k] = enc(x); }
    return r;
  }
  // events are queued on the server between sends and attached to the next snapshot
  function snapshot(G, events) {
    const s = body(G);
    s.players = G.players.map(body);
    s.keeper = body(G.keeper);
    s.ball = body(G.ball);
    s.ev = (events || []).map(enc);
    return s;
  }

  function dec(v, G) {
    if (v && typeof v === 'object') {
      if (v.$p != null) return G.players[v.$p];
      if (v.$k != null) return G.keeper;
      if (Array.isArray(v)) return v.map((x) => dec(x, G));
      const o = {};
      for (const k in v) o[k] = dec(v[k], G);
      return o;
    }
    return v;
  }
  function assign(dst, src, G) {
    for (const k in src) dst[k] = dec(src[k], G);
    for (const k of Object.keys(dst)) if (!(k in src) && !SKIP.has(k) && typeof dst[k] !== 'function' && k !== 'def' && k !== 'a' && k !== 'moves') delete dst[k];
    if (dst.skill && dst.skill.id) dst.skill.def = ISO.Game.SKILLS[dst.skill.id];
  }
  // Apply snapshot s onto G. With `to` (the following snapshot) and f in 0..1, positions are interpolated.
  function apply(G, s, to, f) {
    const top = {};
    for (const k in s) if (k !== 'players' && k !== 'keeper' && k !== 'ball' && k !== 'ev') top[k] = s[k];
    for (const k in top) G[k] = dec(top[k], G);
    s.players.forEach((p, i) => assign(G.players[i], p, G));
    assign(G.keeper, s.keeper, G); G.keepers = [G.keeper];
    assign(G.ball, s.ball, G);
    if (to && f > 0) {
      const mix = (d, a, b) => { for (const k of LERP) if (typeof a[k] === 'number' && typeof b[k] === 'number') d[k] = a[k] + (b[k] - a[k]) * f; };
      s.players.forEach((p, i) => { mix(G.players[i], p, to.players[i]); G.players[i].face = lerpAng(p.face, to.players[i].face, f); });
      mix(G.keeper, s.keeper, to.keeper); G.keeper.face = lerpAng(s.keeper.face, to.keeper.face, f);
      mix(G.ball, s.ball, to.ball);
    }
  }
  function lerpAng(a, b, f) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * f;
  }
  // events of a snapshot, with references resolved against G
  const events = (G, s) => (s.ev || []).map((e) => dec(e, G));

  ISO.Net = { snapshot, apply, events };
})();
