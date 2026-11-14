/* ISO FOOTBALL — the game tutorial. Eight interactive lessons, each a short scripted situation on the pitch with 2-5 steps.
   A lesson runs on the ordinary simulation (opts overrides only: a solo sandbox like the Testing Arena, a one-on-one against a scripted dribbler, or a penalty
   shootout) and watches it from OUTSIDE: it reads the events the sim already emits (kick, skill, lunge, tackle, clearit, clearfirst, clear, dive, goal ...) and
   read-only state (the player's speed, stance, charge). The only thing it ever writes to the sim is the starting situation (Tut.setup: a mannequin keeper, a loose ball, right after Game.create); steps and frames never write. It never records a match, a drill, a challenge, credits or career state:
   the only thing it saves is which lessons are done (profile settings.tut: 1 = completed, 2 = finished with a step skipped) and a one-time reward for completing all of them.
   Pure and node-loadable except the DOM part at the bottom (guarded); tools/tutorial-test.js drives every step headless.
   main.js hooks: App.mode 'tut' (buildMatch spreads Tutorial.simOpts, inputs() asks Tutorial.opponent for the scripted seat), App.tut (the live run),
   Tutorial.onEvent / Tutorial.frame from the main loop, Tutorial.onEnd (a lesson's sim reaching its final phase never shows the match-end screen), App.tutHold
   (the finished-lesson card and the lesson's "ok" flash freeze the sim; Tutorial.frozen decides; it is cleared whenever a lesson is not running: Tutorial.abort from buildMatch, Tutorial.frame). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const C = ISO.C, GCY = (C.GY0 + C.GY1) / 2;
  const T = (k, v) => ISO.I18n.t(k, v);
  const hyp = Math.hypot;
  const STEP = C.STEP;
  const REWARD = 150;      // credits, once, for finishing every lesson (profile.tutReward pays it at most once, ever)

  // ------------------------------------------------------------------ keys: always the player's CURRENT bindings
  const ACTS = ['up', 'down', 'left', 'right', 'sprint', 'shoot', 'finesse', 'chip', 'lob', 'j', 'k', 'l', 'jockey', 'pass', 'tackle', 'slide', 'shoulder', 'focus'];
  const PAD = {
    classic: { shoot: 'A', finesse: 'B', chip: 'Y', lob: 'R3', j: 'X', sprint: 'RT', jockey: 'LT', tackle: 'X', slide: 'B', shoulder: 'Y', focus: 'R3' },
    chords: { shoot: 'A', finesse: 'B', chip: 'Y', lob: 'R3', j: 'X', k: 'LB', l: 'RB', sprint: 'RT', jockey: 'LT', tackle: 'X', slide: 'LB', shoulder: 'RB', focus: 'R3' },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S0 = () => (ISO.Profile && ISO.Profile.data && ISO.Profile.data.settings) || {};
  const padOn = () => { try { return !!(typeof navigator !== 'undefined' && navigator.getGamepads && Array.from(navigator.getGamepads()).some((g) => g && g.connected)); } catch (e) { return false; } };
  // the labels of an action's two slots (mouse buttons only while mouse aiming is on), best first
  function labels(a) {
    const I = ISO.Input;
    if (!I || !I.bindings) return [a === 'sprint' ? 'SHIFT' : a.toUpperCase()];
    const b = I.bindings[a] || [], all = b.filter(Boolean), mouse = S0().mouseAim === true;
    const use = all.filter((k) => mouse || !k.startsWith('Mouse'));
    return (use.length ? use : all).slice(0, 2).map((k) => I.label(k).toUpperCase());
  }
  const kbd = (a) => labels(a).map((l) => '<kbd>' + esc(l) + '</kbd>').join(' / ') + (padOn() && (PAD[S0().padLayout] || PAD.classic)[a] ? ' <kbd class="pad">' + esc((PAD[S0().padLayout] || PAD.classic)[a]) + '</kbd>' : '');
  // placeholders for the lesson strings: {shoot} {finesse} {power} (the power shot key) {chip} (the chip shot key) {j} {k} {l} {jockey} {tackle} {slide} {shoulder} {focus} {sprint}, {move} (all four), {pause}
  function vars() {
    const v = {};
    for (const a of ACTS) v[a] = kbd(a);
    v.power = kbd('chip'); v.chip = kbd('lob');
    v.move = ['up', 'left', 'down', 'right'].map((a) => labels(a)[0]).map((l) => '<kbd>' + esc(l) + '</kbd>').join(' ');
    v.pause = '<kbd>ESC</kbd>';
    return v;
  }

  // ------------------------------------------------------------------ the lessons
  // cfg: the situation. kind 'solo' (sandbox: you, a keeper, no score limit), 'duel' (you against a scripted dribbler: you defend), 'pen' (a shootout).
  // The scripted dribbler (duel) walks the ball along cfg.opp and holds it at the end: the defend lesson stops outside the box, the rebound lesson waits outside the box
  // until you are close and goal-side of him (a waypoint with `wait: d`), then walks well inside it (away from the keeper: cfg.calm makes the keeper stay home).
  // A step: { id, init(S, G, R), tick(S, G, R, dt, env), ev(S, G, e, R), fresh(G, R), cfg, paused, hintAfter, okT, freeze, keyOf(G, S) }.
  //   freeze: the sim stands still while the "ok" flash shows (the step's result must not be undone by a carry-on). keyOf: the panel text key to show right now (default: the step's own).
  //   tick / ev return true (step done), a string (flash that warning key) or { msg, restart } (warn, then rebuild the sim). S is the step's scratch, reset on every new sim.
  //   R.touch() restarts the hint timer after real progress. Strings are keys of js/lang-en.js: tut.<lesson>.<step>, .hint and .ok.
  const me = (G) => G.players[0];
  const near = (a, b, d) => !!a && !!b && hyp(a.x - b.x, a.y - b.y) <= d;
  const mine = (G, e) => e.p === G.players[0];
  function noBall(G) { return G.ball.owner !== G.players[0]; }      // a solo step starts with the ball at your feet: a shot that was saved or went out leaves it loose
  const CHG = (type) => C.CHG[type] || C.CHG.normal;

  const LESSONS = [
    { id: 'move', art: 'vardy', col: '#35e08a', cfg: { kind: 'solo', keeper: 'none' }, steps: [
      { id: 'walk', init: (S) => { S.d = 0; S.px = null; },
        tick: (S, G, R) => { const p = me(G); if (S.px !== null) { const d = hyp(p.x - S.px, p.y - S.py); if (d < 40) { S.d += d; if (d > 0.2) R.touch(G); } } S.px = p.x; S.py = p.y; return S.d >= 170; } },
      { id: 'sprint', init: (S) => { S.t = 0; S.l = null; },
        tick: (S, G, R) => { const p = me(G), dt = S.l === null ? 0 : G.t - S.l; S.l = G.t; if (p.sprinting && hyp(p.vx, p.vy) > p.jog * 1.05) { S.t += dt; R.touch(G); } return S.t >= 1; } },
      { id: 'turn', init: (S) => { S.a = null; S.n = 0; },
        tick: (S, G, R) => { const p = me(G); if (hyp(p.vx, p.vy) < 60) return false; const a = Math.atan2(p.vy, p.vx); if (S.a === null) S.a = a; else if (Math.abs(Math.atan2(Math.sin(a - S.a), Math.cos(a - S.a))) > 1.1) { S.a = a; S.n++; R.touch(G); } return S.n >= 4; } },
    ] },
    { id: 'shoot', art: 'pulisic', col: '#ffb23d', cfg: { kind: 'solo', keeper: 'dummy', spot: { x: 175, y: GCY } }, steps: [
      { id: 'charge', ev: (S, G, e) => (e.type === 'kick' && mine(G, e) && e.shot === 'normal' ? true : e.type === 'fake' && mine(G, e) ? 'tut.shoot.charge.tap' : false) },
      { id: 'aim', fresh: noBall, init: (S) => { S.dir = 0; },      // which way you were steering (or aiming the mouse) as you let go; a goal on that side counts
        ev: (S, G, e) => {
          if (e.type === 'kick' && mine(G, e)) { const p = e.p, a = p.aim ? p.aim.y - GCY : p.vy; S.dir = Math.abs(a) > (p.aim ? 25 : 8) ? Math.sign(a) : 0; return false; }
          if (e.type !== 'goal' || e.team !== 0) return false;
          const d = S.dir; S.dir = 0;
          return d === 0 ? 'tut.shoot.aim.steer' : Math.sign(G.ball.y - GCY) === d && Math.abs(G.ball.y - GCY) >= 30 ? true : 'tut.shoot.aim.mid';
        } },
      { id: 'over', fresh: noBall, init: (S) => { S.over = false; },
        tick: (S, G) => { const p = me(G); S.over = !!(p.charge && !p.charge.ft && p.charge.type === 'normal' && p.charge.t >= CHG('normal').over + 0.1); return false; },
        ev: (S, G, e) => { if (e.type !== 'kick' || !mine(G, e)) return false; const was = S.over; S.over = false; return was && e.shot === 'normal' ? true : 'tut.shoot.over.early'; } },
    ] },
    { id: 'shots', art: null, col: '#b06bff', cfg: { kind: 'solo', keeper: 'live', spot: { x: 150, y: GCY } }, steps: [
      { id: 'finesse', ev: (S, G, e) => e.type === 'kick' && mine(G, e) && e.shot === 'finesse' },
      { id: 'power', fresh: noBall, ev: (S, G, e) => e.type === 'kick' && mine(G, e) && e.shot === 'power' },
      { id: 'chip', fresh: noBall, ev: (S, G, e) => e.type === 'kick' && mine(G, e) && e.shot === 'chip' },
      { id: 'fake', fresh: noBall, ev: (S, G, e) => e.type === 'fake' && mine(G, e) },
      { id: 'first', cfg: { ball: 'rolling' }, tick: (S, G) => (G.ball.owner === me(G) ? { msg: 'tut.shots.first.late', restart: true } : false), ev: (S, G, e) => e.type === 'kick' && mine(G, e) && e.shot === 'first-time' },
    ] },
    { id: 'skills', art: 'palmer', col: '#4fa3ff', cfg: { kind: 'solo', keeper: 'none' }, steps: [
      { id: 'stepover', ev: (S, G, e) => e.type === 'skill' && mine(G, e) && e.id === 'stepover' },
      { id: 'feint', ev: (S, G, e) => e.type === 'skill' && mine(G, e) && e.id === 'feint' },
      { id: 'knock', ev: (S, G, e) => e.type === 'skill' && mine(G, e) && e.id === 'knock' },
      { id: 'chord', ev: (S, G, e) => e.type === 'skill' && mine(G, e) && e.id === 'croqueta' },
    ] },
    { id: 'defend', art: 'rooney', col: '#f1735f', cfg: { kind: 'duel', opp: [{ x: 70, y: GCY + 62 }, { x: 128, y: GCY }] }, steps: [
      { id: 'stance', init: (S) => { S.t = 0; S.l = null; },
        tick: (S, G, R) => { const p = me(G), o = G.ball.owner, dt = S.l === null ? 0 : G.t - S.l; S.l = G.t; if ((p.jock || p.focus) && o && o.team === 1 && near(p, o, 150)) { S.t += dt; R.touch(G); } return S.t >= 1 || lostBall(G) || stalled(S, G, dt); } },
      { id: 'tackle', fresh: (G) => !dribbling(G), tick: (S, G, R, dt) => lostBall(G) || stalled(S, G, dt), ev: (S, G, e) => e.type === 'lunge' && mine(G, e) && e.p.state === 'tackle' && !e.slide && (near(e.p, G.ball.owner, 75) || near(e.p, G.ball, 60)) ? true : e.type === 'lunge' && mine(G, e) && e.p.state === 'tackle' ? 'tut.defend.tackle.far' : false },
      { id: 'slide', fresh: (G) => !dribbling(G), tick: (S, G, R, dt) => lostBall(G) || stalled(S, G, dt), ev: (S, G, e) => e.type === 'lunge' && mine(G, e) && e.slide === true && (near(e.p, G.ball.owner, 100) || near(e.p, G.ball, 90)) },
      { id: 'shoulder', fresh: (G) => !dribbling(G), tick: (S, G, R, dt) => lostBall(G) || stalled(S, G, dt), ev: (S, G, e) => e.type === 'lunge' && mine(G, e) && e.p.state === 'shoulder' && (near(e.p, G.ball.owner, 80) || near(e.p, G.ball, 70)) },
    ] },
    { id: 'rebound', art: null, col: '#ffcf4d', cfg: { kind: 'duel', screen: true, dummyKeeper: true, opp: [], loose: { ball: { x: 205, y: 360 }, you: { x: 205, y: 455 }, cpu: { x: 168, y: 320 } } }, steps: [
      { id: 'win', okT: 0.7, freeze: true, init: (S, G) => { S.won = false; },
        tick: (S, G) => (G.attacker === 0 && G.mustClear < 0 && !S.won ? { msg: 'tut.rebound.win.early', restart: true } : G.ball.holder ? { msg: 'tut.rebound.keeper', restart: true } : false),
        ev: (S, G, e) => { if (e.type === 'clearit' && e.team === 0) { S.won = true; return true; } return e.type === 'out' ? { msg: 'tut.rebound.out', restart: true } : false; } },      // (an out is told apart from "won it outside the box": a tackle pokes the ball far, and it can roll over a line)
      // (the next two steps start from the situation the first one ends in; skipped into, they ask for the ball first, and once you have had it, losing it starts the situation over)
      { id: 'shoot', okT: 0.7, freeze: true, keyOf: (G, S) => (S.has ? null : 'tut.rebound.win'), init: (S, G) => { S.has = G.mustClear === 0; }, ev: (S, G, e) => e.type === 'clearfirst' && e.team === 0, tick: (S, G) => lostClear(S, G) },
      { id: 'clear', keyOf: (G, S) => (S.has ? null : 'tut.rebound.win'), init: (S, G) => { S.has = G.mustClear === 0; }, ev: (S, G, e) => e.type === 'clear' && e.team === 0, tick: (S, G) => lostClear(S, G) },
    ] },
    { id: 'penalty', art: null, col: '#4fd0a0', cfg: { kind: 'pen' }, steps: [
      { id: 'kick', ev: (S, G, e) => e.type === 'kick' && mine(G, e) },
      { id: 'save', keyOf: (G) => (G.drill && G.drill.so && G.drill.so.turn === 'shoot' && G.ball.owner === G.players[0] ? 'tut.penalty.save.wait' : null), ev: (S, G, e) => e.type === 'dive' && !!G.keeper.human && !!G.drill && !!G.drill.so && G.drill.so.turn === 'save' },
    ] },
    { id: 'views', art: null, col: '#7ad0ff', touches: ['camera', 'cam3d', 'mouseAim'], cfg: { kind: 'solo', keeper: 'dummy', spot: { x: 175, y: GCY } }, steps: [
      { id: 'pause', paused: true, tick: (S, G, R, dt, env) => !!env.paused },
      { id: 'view', paused: true, init: (S, G, R, env) => { S.cam = env.camera; }, tick: (S, G, R, dt, env) => env.camera !== S.cam },
      { id: 'mouse', ev: (S, G, e) => (e.type === 'kick' && mine(G, e) && !!e.p.aim ? true : e.type === 'fake' && mine(G, e) && !!e.p.aim ? 'tut.views.mouse.tap' : false) },
    ] },
  ];
  // the scripted dribbler only walks with the ball: once a challenge has knocked it loose nobody fetches it, so after 2 s without an owner the step starts again
  // (counted in sim time, so a pause does not add to it)
  const stalled = (S, G) => { const d = S.nbT === undefined ? 0 : Math.max(0, G.t - S.nbT); S.nbT = G.t; S.nb = G.phase === 'play' && !G.ball.owner ? (S.nb || 0) + d : 0; return S.nb > 2 ? { msg: 'tut.defend.loose', restart: true } : false; };
  // the duel is spoilt for this step (the ball went out and came back to you, or you took it): start it again
  const lostBall = (G) => (G.attacker === 0 || (G.ball.owner && G.ball.owner.team === 0) ? { msg: 'tut.defend.again', restart: true } : false);
  // the clear steps: once you have had the ball inside the box (S.has), losing it (the CPU, the keeper, or the clear already void) starts the situation over, at the same step
  const lostClear = (S, G) => {
    if (G.mustClear === 0) S.has = true;
    return S.has && ((G.ball.owner && G.ball.owner.team === 1) || G.ball.holder || (G.attacker === 0 && G.mustClear < 0)) ? { msg: 'tut.rebound.lost', restart: true } : false;
  };
  // is the scripted attacker still dribbling the ball (so the step has something to defend against)?
  function dribbling(G) { const o = G.ball.owner; return !!o && o.team === 1 && o.x < 200 && G.mustClear < 0; }
  for (const L of LESSONS) { L.n = L.steps.length; for (const s of L.steps) { s.key = 'tut.' + L.id + '.' + s.id; } }
  const byId = (id) => LESSONS.find((l) => l.id === id) || null;
  const ORDER = LESSONS.map((l) => l.id);

  // ------------------------------------------------------------------ the sim situation
  const cfgOf = (L, st) => Object.assign({ kind: 'solo', keeper: 'live', ball: 'feet', spot: { x: C.FW - C.BOXD - C.TEN, y: GCY } }, L.cfg, st && st.cfg);
  const cfgKey = (c) => JSON.stringify(c);
  // Game.create overrides for a situation (main.js buildMatch spreads this last; tools/tutorial-test.js builds the same game with it)
  function createOpts(c) {
    const base = { replay: false, walls: false, rules: undefined, rain: false, turf: null, drillDef: undefined };
    if (c.kind === 'duel') return Object.assign(base, { solo: false, drill: null, sand: undefined, win: 1e9, kickoff: 1 });      // nobody can win: a goal never ends the lesson
    if (c.kind === 'pen') return Object.assign(base, { solo: true, drill: 'penalty', sand: undefined });
    return Object.assign(base, { solo: true, drill: null, win: 0, sand: { defenders: 0, defMode: 'static', keeper: c.keeper, nerf: 0, infStam: !!c.infStam, spot: { x: c.spot.x, y: c.spot.y }, ball: c.ball, rain: false, turf: 'grass' } });
  }
  // The one thing a lesson sets on a fresh sim (the writes are the situation itself, before the first whistle; Tutorial.frame / step never write): a duel with `dummyKeeper` gets
  // the keeper the sandbox already has, a mannequin that only stands on his line (a live keeper rushes and slides at whoever has the ball in his box, and this lesson is about
  // the two of you); a duel with `loose` starts with the ball loose inside the box (his shot was saved) and you a few steps from it: the rule needs possession to change
  // inside the box, and a tackle cannot promise that (a won ball is knocked away from the tackler, out of the box, or beaten, depending on the player's stats).
  // Called right after Game.create (main.js buildMatch, tools/tutorial-test.js).
  function setup(G, c) {
    if (!G || !c || c.kind !== 'duel') return;
    if (c.dummyKeeper && G.keeper) G.keeper.dummy = true;
    if (c.loose) {
      const b = G.ball, me = G.players[0], cpu = G.players[1], L = c.loose;
      b.owner = null; b.x = L.ball.x; b.y = L.ball.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.lastTouch = 1;
      me.x = L.you.x; me.y = L.you.y; me.face = Math.atan2(L.ball.y - me.y, L.ball.x - me.x);
      cpu.x = L.cpu.x; cpu.y = L.cpu.y; cpu.face = Math.atan2(L.ball.y - cpu.y, L.ball.x - cpu.x);
    }
  }
  // The scripted seat of a duel: walk the ball along `path` at a gentle pace and hold it at the end; without the ball it stands still.
  const wpOf = new WeakMap();      // which waypoint each scripted player is heading for (kept outside the sim: a new game has new player objects, so it starts over)
  function opponent(G, p, c) {
    const Z = ISO.Game.ZERO;
    if (!G || G.phase !== 'play' || !c || !c.opp) return Z;
    const own = G.ball.owner;
    if (c.screen && own && own.team !== p.team) {      // you have the ball: he drops goal-side of you (so the keeper does not come out and slide it off you) and waits
      const gx = ISO.C.FW - own.x, gy = GCY - own.y, gl = hyp(gx, gy) || 1, tx = own.x + gx / gl * 44, ty = own.y + gy / gl * 44, d = hyp(tx - p.x, ty - p.y);
      return d < 6 ? Z : Object.assign({}, Z, { mx: (tx - p.x) / d * 0.7, my: (ty - p.y) / d * 0.7 });
    }
    if (own !== p) return Z;
    let i = wpOf.get(p) || 0;
    const you = G.players.find((q) => q.team !== p.team), n = c.opp.length;
    const ready = (w) => !w.wait || (!!you && hyp(you.x - p.x, you.y - p.y) <= w.wait && hyp(C.FW - you.x, GCY - you.y) < hyp(C.FW - p.x, GCY - p.y));      // a `wait` waypoint: held until you are that close and nearer the goal than he is
    while (i < n && hyp(c.opp[i].x - p.x, c.opp[i].y - p.y) < 10 && ready(c.opp[i])) i++;
    wpOf.set(p, i);
    const wp = c.opp[i];
    if (!wp) return Z;
    const d = hyp(wp.x - p.x, wp.y - p.y) || 1, v = wp.speed || c.speed || 0.42;
    return Object.assign({}, Z, { mx: (wp.x - p.x) / d * v, my: (wp.y - p.y) / d * v, sprint: !!wp.sprint });      // (sprint: the ball runs ahead of him, where you can nick it)
  }

  // ------------------------------------------------------------------ a run: one lesson being played
  // ctx: { rebuild() asks the host for a fresh sim (the next G it passes to step() replaces the old one), done(id) is called once when the lesson is finished }
  function create(id, ctx) {
    const L = byId(id);
    if (!L) return null;
    const R = { id, L, ctx: ctx || {}, idx: 0, G: null, S: {}, state: 'play', okT: 0, flash: null, stepT: 0, hint: false, rebuilding: false, tries: 0, started: false, skips: 0 };
    R.cfg = cfgOf(L, L.steps[0]); R.key = cfgKey(R.cfg);
    R.cur = () => L.steps[R.idx];
    R.touch = (G) => { R.stepT = G ? G.t : R.stepT; R.hint = false; };
    R.setFlash = (k, kind, t) => { R.flash = { k, kind: kind || 'warn', t: t || 2.4 }; };
    function enter(G) {      // a new step or a new sim: fresh scratch, hint timer restarted
      const st = R.cur();
      R.S = {}; R.hint = false; R.stepT = G.t;
      if (st.init) st.init(R.S, G, R, R.env || {});
    }
    function advance(G) {
      R.idx++; R.flash = null;
      if (R.idx >= L.steps.length) { R.state = 'done'; if (R.ctx.done) R.ctx.done(id, R.skips === 0); return; }
      R.state = 'play';
      const st = R.cur(), c = cfgOf(L, st), key = cfgKey(c);
      if (key !== R.key || (st.fresh && st.fresh(G, R))) { R.cfg = c; R.key = key; R.rebuilding = true; if (R.ctx.rebuild) R.ctx.rebuild(); return; }
      R.cfg = c; enter(G);
    }
    R.restart = (note, to) => {      // a fresh sim (and, with `to`, back to an earlier step: the lesson's situation starts over from there)
      if (to !== undefined) { R.idx = to; R.cfg = cfgOf(L, L.steps[to]); R.key = cfgKey(R.cfg); }
      R.rebuilding = true; R.state = 'play'; if (note) R.setFlash(note, 'warn', 2.6); if (R.ctx.rebuild) R.ctx.rebuild();
    };
    R.skip = (G) => { if ((R.state === 'play' || R.state === 'ok') && G && !R.rebuilding) { if (R.state === 'play') R.skips++; advance(G); } };      // (always moves on, whatever the situation: the step it lands on builds its own; a lesson finished with a skip is not counted as completed)
    // one frame: the events since the last call, then the state
    R.step = (G, dt, evs, env) => {
      R.env = env = env || {};
      if (R.rebuilding) { if (R.G === G) return; R.rebuilding = false; R.G = null; }
      if (R.G !== G) { R.G = G; enter(G); }
      if (env.paused && !(R.cur() && R.cur().paused)) return;      // (a paused frame runs no timers: only the Views steps that need the pause menu keep ticking)
      if (R.flash) { R.flash.t -= dt; if (R.flash.t <= 0) R.flash = null; }
      if (R.state === 'ok') { R.okT -= dt; if (R.okT <= 0) advance(G); return; }
      if (R.state !== 'play') return;
      const st = R.cur();
      if (L.cfg.kind === 'pen' && penSpent(G)) { R.restart(); return; }      // the shootout is practice: it starts over before it can be decided
      if (G.phase !== 'play') R.stepT = G.t;      // the hint timer runs from the whistle
      {
        const note = (r) => {
          if (r === true) { R.state = 'ok'; R.okT = st.okT || 1.3; R.flash = { k: st.key + '.ok', kind: 'ok', t: 99 }; return true; }
          if (typeof r === 'string') R.setFlash(r, 'warn');
          else if (r && r.restart) { R.restart(r.msg, r.to); return true; }
          return false;
        };
        if (!env.paused && st.ev) for (const e of evs || []) if (note(st.ev(R.S, G, e, R))) return;      // (a goal arrives in the step that ends the play phase)
        if ((G.phase === 'play' || st.paused) && st.tick && note(st.tick(R.S, G, R, dt, env))) return;
        if (G.phase === 'play' && !R.hint && G.t - R.stepT > (st.hintAfter || 6)) R.hint = true;
      }
    };
    // what the panel shows
    R.view = () => {
      const st = R.cur() || L.steps[L.steps.length - 1];
      const alt = st && st.keyOf && R.G ? st.keyOf(R.G, R.S) : null;
      return { lesson: L, idx: Math.min(R.idx, L.n - 1), n: L.n, state: R.state, key: alt || (st && st.key), hint: R.hint && R.state === 'play', flash: R.flash, skipped: R.skips > 0 };
    };
    return R;
  }

  // ------------------------------------------------------------------ progress (profile settings.tut: done[id] is 1 = completed, 2 = finished with a step skipped)
  function prog() {
    const P = ISO.Profile;
    if (!P || !P.tutState) return { done: {}, seen: false, paid: false };
    return P.tutState();
  }
  const doneCount = () => { const d = prog().done; return ORDER.filter((id) => d[id] === 1).length; };
  function markDone(id, completed) {      // completed: no step was skipped. Only completed lessons count towards the reward
    const P = ISO.Profile;
    if (!P || !P.tutDone || !byId(id)) return null;
    P.tutDone(id, completed !== false);
    if (doneCount() === ORDER.length && !prog().paid && P.tutReward) { const cr = P.tutReward(REWARD); if (cr > 0) return { reward: cr }; }
    return {};
  }

  // ------------------------------------------------------------------ decisions main.js and the DOM side take, kept pure so tools/tutorial-test.js runs the very same code
  // the shootout lesson is practice: after two kicks each (it cannot be decided before three each) the sim is rebuilt as a fresh shootout
  function penSpent(G) { const so = G.drill && G.drill.so; return !!so && G.phase === 'countdown' && so.kicks[0].length >= 2 && so.kicks[1].length >= 2; }
  // a sim that reaches its final phase: a match ends in the end screen, a lesson never does (it starts over, or, once the lesson card is up, stays as it is)
  const endAction = (mode, run) => (mode !== 'tut' ? 'show' : run && run.state === 'done' ? 'hold' : 'restart');
  // the pitch stands still under the finished-lesson card (once the countdown / banner of the moment has played out) and during a step's "ok" flash when it asks for it
  function frozen(run, G) {
    if (!run) return false;
    if (run.state === 'done') return !G || G.phase === 'play';
    const st = run.cur();
    return run.state === 'ok' && !!st && !!st.freeze;
  }
  // the lesson list's "play the tutorial" is only for the menus: a match that is running (any mode) is left through its own quit / forfeit / leave
  const canOpen = (screen) => screen !== 'match';
  // the first-run offer: a profile that has not played anything, has not answered the offer and has no lesson done
  function wantsNudge(st, stats) { return !st.seen && !ORDER.some((id) => st.done[id]) && !(stats.matches > 0 || stats.drillRuns > 0 || stats.arenaGoals > 0); }
  // what a lesson reads from the settings (the one place the panel / steps learn about camera and mouse aiming)
  const envFrom = (paused, st) => ({ paused: !!paused, camera: st && st.camera === '3d' ? '3d' : 'classic', mouseAim: !!st && st.mouseAim === true });
  // the settings a lesson changes on its own steps (L.touches) are put back when it ends: which of them differ from what they were at the start
  const touched = (L) => (L && L.touches) || [];
  function restorePlan(L, snap, cur) { const o = {}; if (snap) for (const k of touched(L)) if (snap[k] !== cur[k]) o[k] = snap[k]; return o; }
  const snapOf = (L, st) => { const o = {}; for (const k of touched(L)) o[k] = st[k]; return o; };

  const Tut = { LESSONS, ORDER, REWARD, byId, create, createOpts, setup, opponent, cfgOf, vars, labels, progress: () => ({ done: doneCount(), total: ORDER.length }), markDone, penSpent, endAction, frozen, canOpen, wantsNudge, envFrom, restorePlan, snapOf, STEP };
  ISO.Tutorial = Tut;
  if (typeof document === 'undefined') { if (typeof module !== 'undefined') module.exports = Tut; return; }

  // ================================================================== the DOM side
  const $ = (id) => document.getElementById(id);
  let App = null, panel = null, nudge = null, last = '', extra = null, rebuildT = 0, snap = null, nowClean = true;
  const A = () => (App = App || ISO.App);

  // -------- starting, restarting, leaving
  Tut.start = (id) => {
    const app = A(), L = byId(id);
    if (!app || !L) return;
    ISO.Audio.init();
    if (app.screen === 'match') app.paused = false;
    restoreSettings(); snap = L.touches ? { L, vals: snapOf(L, S0()) } : null;      // (a lesson that changes the view or the mouse puts them back when it ends)
    if (snap) ISO.Profile.tutSnap(snap.vals);      // (and a reload mid-lesson puts them back at the next boot: see the end of this file)
    app.mode = 'tut'; app.drill = 'tut'; app.side = 0; app.touched = true; app.tutHold = false;
    extra = null; nowClean = true; evq.length = 0;
    app.tut = create(id, { rebuild: () => { clearTimeout(rebuildT); rebuildT = setTimeout(() => { if (ISO.App.mode === 'tut' && ISO.App.tut) ISO.App.startMatch(); }, 0); }, done: onDone });
    const P = ISO.Profile; if (P.tutSeen) P.tutSeen();
    hideNudge(); app.startMatch();
  };
  // the settings the Views lesson changed go back as they were
  function restoreSettings() {
    if (!snap) return;
    const app = A(), plan = restorePlan(snap.L, snap.vals, S0());
    snap = null; ISO.Profile.tutSnap(null);
    for (const k of Object.keys(plan)) { if (k === 'mouseAim') app.setMouse(plan[k]); else ISO.Profile.setSetting(k, plan[k]); }
  }
  function onDone(id, clean) {
    const r = Tut.markDone(id, clean);
    nowClean = clean !== false; restoreSettings();
    extra = r && r.reward ? r.reward : null;
    if (r && r.reward) A().toast(T('tut.toast.all'), T('tut.toast.all_sub', { cr: r.reward }), '#ffcf4d');
    if (A().updateCredits) A().updateCredits();
  }
  Tut.abort = () => { const app = A(); clearTimeout(rebuildT); restoreSettings(); app.tut = null; app.tutHold = false; hidePanel(); };      // a non-lesson game starts: the lesson ends quietly (no screen change, the caller builds its own game)
  Tut.restart = () => { const app = A(); if (app.tut) Tut.start(app.tut.id); };
  Tut.exit = () => {
    const app = A();
    clearTimeout(rebuildT); restoreSettings();
    app.tut = null; app.tutHold = false; app.paused = false;
    if (app.mode === 'tut') { app.mode = 'cpu'; app.drill = 'arena'; }
    hidePanel();
    app.show('tutorial');
  };
  Tut.next = () => { const app = A(), i = ORDER.indexOf(app.tut && app.tut.id); if (i >= 0 && i + 1 < ORDER.length) Tut.start(ORDER[i + 1]); else Tut.exit(); };

  // -------- the sim hooks main.js calls
  // who plays: you (the owned footballer you picked), and a CPU opponent / a row of penalty takers drawn from the weakest of the roster
  Tut.matchSetup = (app) => {
    const P = ISO.Profile, run = app.tut, c = run.cfg;
    let pick = app.pick[0]; if (!P.owns(pick.id)) pick = ISO.PLAYERS.filter((d) => P.owns(d.id)).sort((a, b) => b.ovr - a.ovr)[0];
    const home = P.outfit(pick), weak = ISO.PLAYERS.filter((d) => d.id !== pick.id).sort((a, b) => a.ovr - b.ovr);
    const takers = c.kind === 'pen' ? weak.slice(0, 5) : null;
    return { home, away: c.kind === 'duel' ? weak[0] : takers ? takers[0] : home, ctrl: ['human', c.kind === 'duel' ? 'tut' : 'none'], labels: [T('tut.ui.you'), c.kind === 'duel' ? T('tut.ui.cpu') : ''], teams: c.kind === 'duel' ? [T('tut.ui.your_side'), T('tut.ui.cpu_side')] : null, takers, arena: c.kind === 'solo' };
  };
  Tut.simOpts = (app) => (app.tut ? createOpts(app.tut.cfg) : {});
  Tut.input = (app, G, i) => opponent(G, G.players[i], app.tut && app.tut.cfg);
  // a lesson's sim reached its final phase (only the shootout can): never the match-end screen. Mid-lesson it starts over, under the finished card it stays as it is.
  Tut.onEnd = (app) => { if (Tut.endAction(app.mode, app.tut) === 'restart' && app.tut && !app.tut.rebuilding) app.tut.restart(); };
  const evq = [];
  Tut.onEvent = (app, G, e) => { if (app.mode === 'tut' && app.tut) evq.push(e); };
  Tut.frame = (app, dt) => {
    const on = app.mode === 'tut' && !!app.tut && app.screen === 'match' && !app.demo;
    document.getElementById('stage').classList.toggle('tut-on', on);
    if (!on) { evq.length = 0; hidePanel(); app.tutHold = false; return; }      // (the freeze belongs to a lesson only: never leave it behind)
    const env = envFrom(app.paused, S0());
    const evs = evq.splice(0);
    if (app.tut.state !== 'done') app.tut.step(app.G, dt, evs, env);
    app.tutHold = frozen(app.tut, app.G);
    if (app.V) app.V.freeze = app.tutHold;      // (the renderer's GO! banner would hang on the frozen pitch)
    draw(app);
  };

  // -------- the instruction panel (a DOM overlay: identical in Classic 2D, Cinematic and 3D)
  function mountPanel() {
    if (panel) return;
    panel = document.createElement('div'); panel.id = 'tutPanel'; panel.className = 'hidden';
    $('stage').appendChild(panel);
    panel.addEventListener('mousedown', (e) => e.stopPropagation());      // a click on the panel is never a shot
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tp]'); if (!b) return;
      e.stopPropagation(); ISO.Audio.play('ui');
      const a = b.dataset.tp, app = A();
      if (a === 'exit') Tut.exit(); else if (a === 'list') Tut.exit(); else if (a === 'replay') Tut.restart(); else if (a === 'next') Tut.next();
      else if (a === 'skip' && app.tut) app.tut.skip(app.G);
      else if (a === 'retry' && app.tut) app.tut.restart();
      if (b.blur) b.blur();
    });
  }
  function hidePanel() { if (panel && !panel.classList.contains('hidden')) { panel.classList.add('hidden'); last = ''; } }
  function draw(app) {
    mountPanel();
    const R = app.tut, v = R.view(), V = vars(), L = v.lesson, i = ORDER.indexOf(L.id);
    let h;
    if (v.state === 'done') {
      const last_ = i + 1 >= ORDER.length;
      h = '<div class="tp-k">' + esc(T('tut.ui.lesson_n', { n: i + 1, total: ORDER.length })) + ' · ' + esc(T('tut.' + L.id + '.title').toUpperCase()) + '</div>' +
        '<div class="tp-done">' + esc(T(nowClean ? 'tut.ui.complete' : 'tut.ui.finished')) + '</div>' + (nowClean ? '' : '<div class="tp-warn">' + esc(T('tut.ui.skipped_note')) + '</div>') + '<div class="tp-tip">' + T('tut.' + L.id + '.tip', V) + '</div>' +
        (extra ? '<div class="tp-reward">' + esc(T('tut.ui.reward', { cr: extra })) + '</div>' : '') +
        '<div class="tp-btns"><button class="tp-b primary" data-tp="next">' + esc(T(last_ ? 'tut.ui.finish' : 'tut.ui.next')) + '</button><button class="tp-b" data-tp="replay">' + esc(T('tut.ui.replay')) + '</button><button class="tp-b ghost" data-tp="list">' + esc(T('tut.ui.all')) + '</button></div>';
    } else {
      const dots = Array.from({ length: v.n }, (_, k) => '<i class="' + (k < v.idx || (k === v.idx && v.state === 'ok') ? 'ok' : k === v.idx ? 'cur' : '') + '"></i>').join('');
      const fl = v.flash, ok = fl && fl.kind === 'ok';
      const ph = app.G && app.G.phase !== 'play' && app.G.phase !== 'goal' && app.G.phase !== 'out';
      h = '<div class="tp-k">' + esc(T('tut.ui.lesson_n', { n: i + 1, total: ORDER.length })) + ' · ' + esc(T('tut.' + L.id + '.title').toUpperCase()) + '</div>' +
        '<div class="tp-dots">' + dots + '<span>' + esc(T('tut.ui.step_n', { n: v.idx + 1, total: v.n })) + '</span></div>' +
        (ok ? '<div class="tp-ok">' + T(fl.k, V) + '</div>' : '<div class="tp-txt">' + T(v.key, V) + '</div>') +
        (!ok && fl && fl.kind === 'warn' ? '<div class="tp-warn">' + T(fl.k, V) + '</div>' : '') +
        (!ok && v.hint ? '<div class="tp-hint">' + T(v.key + '.hint', V) + '</div>' : '') +
        (ph && !ok ? '<div class="tp-wait">' + esc(T('tut.ui.ready')) + '</div>' : '') +
        '<div class="tp-btns"><button class="tp-b ghost" data-tp="skip">' + esc(T('tut.ui.skip')) + '</button><button class="tp-b ghost" data-tp="retry">' + esc(T('tut.ui.retry')) + '</button><button class="tp-b ghost" data-tp="exit">' + esc(T('tut.ui.exit')) + '</button></div>';
    }
    if (h !== last) { last = h; panel.innerHTML = h; }
    panel.classList.remove('hidden');
    panel.classList.toggle('done', v.state === 'done');
  }

  // -------- the lesson list screen
  const DESC = (id) => T('tut.' + id + '.desc');
  Tut.render = () => {
    const grid = $('tutGrid'); if (!grid) return;
    const d = prog().done, n = doneCount();
    $('tutProg').textContent = T('tut.ui.progress', { n, total: ORDER.length });
    $('tutAll').textContent = T(n === 0 ? 'tut.ui.start_all' : 'tut.ui.start_over');
    grid.innerHTML = LESSONS.map((L, i) => '<button class="drillcard art tutcard' + (L.art ? ' art-' + L.art : ' art-plain') + (d[L.id] === 1 ? ' done' : d[L.id] === 2 ? ' skipped' : '') + '" style="--pc:' + L.col + '" data-tut="' + L.id + '">' +
      '<span class="pc-k">' + esc(T('tut.ui.lesson_n', { n: i + 1, total: ORDER.length })) + (d[L.id] === 1 ? ' · ✓ ' + esc(T('tut.ui.done')) : d[L.id] === 2 ? ' · ' + esc(T('tut.ui.skipped')) : '') + '</span><span class="dc-t">' + esc(T('tut.' + L.id + '.title').toUpperCase()) + '</span>' +
      '<span class="pc-d">' + esc(DESC(L.id)) + '</span><span class="pc-s">' + esc(T('tut.ui.steps', { n: L.n })) + '</span></button>').join('');
    const pc = $('playTut'); if (pc) pc.textContent = T('tut.ui.progress', { n, total: ORDER.length });
  };
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('[data-tut]');
    if (c) { ISO.Audio.init(); ISO.Audio.play('ui'); Tut.start(c.dataset.tut); return; }
    const a = e.target.closest && e.target.closest('[data-tut-act]');
    if (!a) return;
    ISO.Audio.init(); ISO.Audio.play('ui');
    const act = a.dataset.tutAct;
    if (act === 'all') Tut.start(ORDER[0]);
    else if (act === 'open') { const app = A(); if (!Tut.canOpen(app.screen)) return; if (!$('controls').classList.contains('hidden')) $('controls').classList.add('hidden'); app.show('tutorial'); }
    else if (act === 'nudge-yes') { Tut.start(ORDER[0]); }
    else if (act === 'nudge-no') { if (ISO.Profile.tutSeen) ISO.Profile.tutSeen(); hideNudge(); }
  });

  // -------- the first-run nudge: once, on the main menu, for a profile that has not played anything yet. It sits in the empty top-left corner of the stage: it covers no button.
  function hideNudge() { if (nudge) nudge.classList.add('hidden'); }
  Tut.onShow = (screen) => {
    if (screen === 'tutorial') Tut.render();
    if (screen === 'play') Tut.render();
    const P = ISO.Profile;
    if (screen !== 'menu') { hideNudge(); return; }
    if (!Tut.wantsNudge(prog(), P.data.stats)) return;
    if (!nudge) {
      nudge = document.createElement('div'); nudge.id = 'tutNudge'; nudge.className = 'hidden';
      nudge.innerHTML = '<b>' + esc(T('tut.nudge.title')) + '</b><span>' + esc(T('tut.nudge.body')) + '</span><div><button class="btn small primary" data-tut-act="nudge-yes">' + esc(T('tut.nudge.yes')) + '</button><button class="btn small ghost" data-tut-act="nudge-no">' + esc(T('tut.nudge.no')) + '</button></div>';
      $('stage').appendChild(nudge);
    }
    nudge.classList.remove('hidden');
  };
  // the Controls guide opens from the pause menu too: its PLAY THE TUTORIAL button is only there outside a match
  Tut.syncControls = (screen) => { const b = document.querySelector('#controls [data-tut-act="open"]'); if (b) b.classList.toggle('hidden', !Tut.canOpen(screen)); };
  // (main.js shows the first menu before this file has loaded: show it now)
  // (a lesson that was cut off by a closed tab or a reload left its saved settings behind: put them back now)
  { const vals = ISO.Profile.tutSnap && ISO.Profile.tutSnap(); if (vals && A()) { snap = { L: byId('views'), vals }; restoreSettings(); } }
  if (A() && A().screen === 'menu') Tut.onShow('menu');
  ISO.I18n.onChange(() => { last = ''; if (App && App.screen === 'tutorial') Tut.render(); });
})();
