/* ISO FOOTBALL — online play: shared snapshot codec, input format and client-side prediction core.
   Loaded by the browser and by server/server.js (and the node tests), so nothing in here touches the DOM.

   The server owns the simulation. Clients receive snapshots of the complete simulation state and apply them onto a
   local Game object (built with the same player definitions). Because the simulation is deterministic (its random
   state G.rs travels in the snapshot), a client can then re-simulate forward from a snapshot with the inputs the server
   has not consumed yet and arrive exactly where the server will: see Predictor below. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  // never sent: static definitions, functions / derived objects, and the lists that are encoded separately
  const SKIP = new Set(['def', 'a', 'moves', 'rand', 'gauss', 'keepers', 'events', 'players', 'keeper', 'ball']);
  const STATIC = (k) => k === 'def' || k === 'a' || k === 'moves';
  const LERP = ['x', 'y', 'z'];                  // legacy apply(G, s, to, f): blended between two snapshots

  // JSON cannot carry -0, NaN or +-Infinity, and a re-simulation has to start from exactly the server's numbers
  function num(v) {
    if (v === 0) return 1 / v < 0 ? { $n: '-0' } : 0;
    return v === v && v !== Infinity && v !== -Infinity ? v : { $n: String(v) };
  }
  function enc(v) {
    if (typeof v === 'number') return num(v);
    if (v && typeof v === 'object') {
      if (v.kind === 'p') return { $p: v.idx };
      if (v.kind === 'k') return { $k: v.team };
      if (Array.isArray(v)) return v.map(enc);
      if (v instanceof Set) return { $s: Array.from(v) };
      const o = {};
      for (const k in v) { const x = v[k]; if (typeof x !== 'function' && x !== undefined && !STATIC(k)) o[k] = enc(x); }
      return o;
    }
    return v;
  }
  function body(o) {
    const r = {};
    for (const k in o) { const x = o[k]; if (typeof x !== 'function' && x !== undefined && !SKIP.has(k)) r[k] = enc(x); }
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
      if (v.$n != null) return +v.$n;
      if (v.$s != null) return new Set(v.$s);
      if (Array.isArray(v)) return v.map((x) => dec(x, G));
      const o = {};
      for (const k in v) o[k] = dec(v[k], G);
      return o;
    }
    return v;
  }
  function assign(dst, src, G) {
    for (const k in src) dst[k] = dec(src[k], G);
    for (const k of Object.keys(dst)) if (!(k in src) && !SKIP.has(k) && typeof dst[k] !== 'function') delete dst[k];
    if (dst.skill && dst.skill.id) dst.skill.def = ISO.Game.SKILLS[dst.skill.id];
  }
  // Apply snapshot s onto G: afterwards G steps exactly like the game the snapshot was taken from.
  // (Legacy: with `to`, the following snapshot, and f in 0..1, positions are interpolated.)
  function apply(G, s, to, f) {
    for (const k in s) if (k !== 'players' && k !== 'keeper' && k !== 'ball' && k !== 'ev') G[k] = dec(s[k], G);
    for (const k of Object.keys(G)) if (!(k in s) && !SKIP.has(k) && typeof G[k] !== 'function') delete G[k];
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

  // ------------------------------------------------------------------ inputs
  // One input has two forms. The wire form (packInput) is what travels: movement rounded to 2 decimals, pressed buttons
  // as 1, the mouse aim rounded to whole units. The sim form (sanitizeInput) is what Game.step gets. The client predicts
  // with sanitizeInput(packInput(raw)) and the server steps with sanitizeInput(received), so both use identical numbers.
  let BOOLS = null;
  const bools = () => BOOLS || (BOOLS = Object.keys(ISO.Game.ZERO).filter((k) => typeof ISO.Game.ZERO[k] === 'boolean'));      // every button the sim reads
  function sanitizeInput(i) {
    const o = {};
    const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    o.mx = n(i.mx); o.my = n(i.my);
    for (const b of bools()) o[b] = !!i[b];
    if (typeof i.ax === 'number' && typeof i.ay === 'number' && isFinite(i.ax) && isFinite(i.ay)) { o.ax = i.ax; o.ay = i.ay; }
    return o;
  }
  function packInput(i) {
    const o = { mx: +(+i.mx || 0).toFixed(2), my: +(+i.my || 0).toFixed(2) };
    for (const b of bools()) if (i[b]) o[b] = 1;
    if (i.ax != null && i.ay != null) { o.ax = Math.round(i.ax) + 0; o.ay = Math.round(i.ay) + 0; }      // + 0: never -0, which JSON would turn into 0 on the wire only
    return o;
  }

  // ------------------------------------------------------------------ prediction
  /* Client-side prediction with full-world re-simulation (rollback).

     The client runs its own step clock at the server's rate. Every client step n it samples its input once, sends
     { t:'in', n, i } and advances its local game one step straight away: its own player with that input, everybody else
     with the last input the server reported for them. The server consumes one input per seat per simulation step and
     every snapshot message says how far it got:

       { t:'s', k, ack:[..], inp:[..], q:[..], n: <snapshot> }
         k    server step count
         ack  per seat: seq of the last input consumed
         inp  per seat: the input (wire form) applied in the latest step
         q    per seat: inputs still waiting after that step; -1 if the queue ran dry since the previous snapshot

     On a snapshot the client throws its guess away: it applies the snapshot, then replays every input the server has not
     consumed yet (seq > ack[me]). What comes out is the new present. ISO.Smooth (if given) turns the difference between
     the old guess and the new one into a short decaying offset, so a correction is never a visible jump.

     Limits. At most MAXPRED inputs may be unacknowledged. When that many are (a stalled connection, or a round trip
     beyond ~400 ms) the local clock simply stops: no new input is sampled or sent and the picture holds still until the
     server catches up. The alternative, replaying only the newest few inputs, would show a present built on inputs the
     server will apply to a different past, and would keep feeding the server a backlog it can only throw away; a freeze
     is honest and ends the moment snapshots flow again.

     Clock. q[me] steers the step clock: a few percent faster while the server's queue for this seat runs empty, slower
     while it holds more than it needs, so inputs wait about one step on the server: no starvation, minimal delay.

     Events. The server's events are authoritative and are handed out when their snapshot is applied. The exception is
     this player's own kick / skill / lunge / fake: those come from the first-time local step, at once, and the server's
     copy is dropped when it arrives. (If the server reports one that was never predicted, it is let through, late but
     not lost.) Everything else the local steps and the replays generate is discarded.

       const P = ISO.Net.Predictor({ me, send, smooth });
       P.onSnapshot(m)               for every { t:'s' } message
       n = P.frame(G, dt, sample)    once per display frame; sample() returns the raw input. Returns the steps taken.
       P.alpha                       fraction of a step since the last one, for ISO.Smooth.begin */
  const MAXPRED = 30;                   // steps of prediction at most (30 steps = 417 ms of round trip, queue and frame time)
  const OWN = { kick: 1, skill: 1, lunge: 1, fake: 1 };
  const OWN_TTL = 72;                   // steps a predicted own event waits for the server's copy
  // clock steering: the fewest inputs the server had waiting over the last second should be Q_TARGET. One spare input
  // costs this player nothing (their own moves are predicted) and absorbs the jitter of the network and of display frames.
  const Q_TARGET = 1, Q_WINDOW = 36, Q_GAIN = 0.01, RATE_MIN = 0.97, RATE_MAX = 1.02;

  function Predictor(opt) {
    const C = ISO.C, Game = ISO.Game, S = opt.smooth || null, send = opt.send, me = opt.me | 0;
    let seq = 0, acc = 0, hist = [], others = [], pend = [], mine = [], lastK = -1, qs = [];
    const P = {
      me, alpha: 0, rate: 1, synced: false,
      stats: { snaps: 0, steps: 0, replayed: 0, stalls: 0, starved: 0, errN: 0, errSum: 0, errMax: 0, errBig: 0, othSum: 0, othMax: 0, lag: 0, qSum: 0, qN: 0 },
      get seq() { return seq; },
      get pending() { return hist.length; },
    };
    const inputsFor = (G, own) => G.players.map((_, s) => (s === me ? own : others[s] || Game.ZERO));

    P.onSnapshot = (m) => {
      if (!m || !m.n || !(m.k > lastK)) return;
      lastK = m.k;
      // only the newest state is ever applied; of the older ones just the events and the queue reading are still needed
      if (pend.length) { const o = pend[pend.length - 1]; pend[pend.length - 1] = { q: o.q, n: { ev: o.n.ev } }; }
      pend.push(m);
      if (pend.length > 240) pend.shift();               // a tab left in the background: stay bounded
    };

    function reconcile(G, out) {
      const st = P.stats;
      for (const m of pend) {
        for (const e of events(G, m.n)) {
          if (OWN[e.type] && e.p === G.players[me]) {
            const j = mine.findIndex((x) => x.type === e.type);
            if (j >= 0) { mine.splice(j, 1); continue; }           // already played when it was predicted
          }
          out.push(e);
        }
        const q = m.q ? m.q[me] : Q_TARGET;
        qs.push(q); if (qs.length > Q_WINDOW) qs.shift();
        if (q < 0) st.starved++; else { st.qSum += q; st.qN++; }
      }
      P.rate = Math.max(RATE_MIN, Math.min(RATE_MAX, 1 + (Q_TARGET - Math.min.apply(null, qs)) * Q_GAIN));
      const m = pend[pend.length - 1];
      pend = [];
      const old = S ? S.grab(G) : null, was = G.players.map((p) => ({ x: p.x, y: p.y }));
      apply(G, m.n);
      others = (m.inp || []).map((i) => (i ? sanitizeInput(i) : null));
      const ack = m.ack ? m.ack[me] : seq;
      let d = 0;
      while (d < hist.length && hist[d].n <= ack) d++;
      if (d) hist.splice(0, d);
      const keep = G.events.length;
      for (const h of hist) Game.step(G, inputsFor(G, h.i));
      G.events.length = keep;                                       // what the replay generated has been heard already (or never will be)
      if (S) S.correct(G, old);
      if (P.synced) {                                               // how wrong the guess was: this player, and the worst of the others
        let oth = 0;
        G.players.forEach((p, s) => {
          const err = Math.hypot(p.x - was[s].x, p.y - was[s].y);
          if (s !== me) { if (err > oth) oth = err; return; }
          st.errN++; st.errSum += err; if (err > st.errMax) st.errMax = err; if (err > 0.01) st.errBig++;
        });
        st.othSum += oth; if (oth > st.othMax) st.othMax = oth;
      }
      P.synced = true;
      st.snaps++; st.replayed += hist.length; st.lag += seq - ack;
      while (mine.length && seq - mine[0].n > OWN_TTL) mine.shift();
    }

    // Returns how many new steps were taken (the caller clears its latched key presses when that is > 0).
    P.frame = (G, dt, sample) => {
      const out = [];
      if (pend.length) reconcile(G, out);
      let n = 0;
      if (G.phase !== 'end') {
        acc += dt * C.SPEED * P.rate;
        while (acc >= C.STEP) {
          if (hist.length >= MAXPRED) { acc = C.STEP; P.stats.stalls++; break; }      // see "Limits" above
          const wire = packInput(sample() || Game.ZERO), inp = sanitizeInput(wire);
          hist.push({ n: ++seq, i: inp });
          send({ t: 'in', n: seq, i: wire });
          if (S) S.capture(G);
          const keep = G.events.length;
          Game.step(G, inputsFor(G, inp));
          for (let j = keep; j < G.events.length; j++) {
            const e = G.events[j];
            if (OWN[e.type] && e.p === G.players[me]) { out.push(e); mine.push({ type: e.type, n: seq }); }
          }
          G.events.length = keep;
          acc -= C.STEP; n++;
        }
        P.alpha = Math.min(1, acc / C.STEP);
      } else P.alpha = 1;
      P.stats.steps += n;
      for (const e of out) G.events.push(e);
      return n;
    };
    return P;
  }

  ISO.Net = { snapshot, apply, events, sanitizeInput, packInput, Predictor, MAXPRED };
})();
