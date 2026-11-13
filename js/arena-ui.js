/* ISO FOOTBALL — Advanced Training Arena (Phase 4.3): the in-match sandbox panel, its sim options and the accuracy tally.
   Offline and single-player only. Every change restarts the arena through App.startMatch() with the new opts (Game.create opts.sand, see game.js
   sandOpts / sandPlace / sandStep); nothing here writes to a running sim. The tally is app-side: it reads kick / goal / save / out events. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const C = ISO.C;
  const SPOTX = C.FW - C.BOXD - C.TEN, GCY = (C.GY0 + C.GY1) / 2;
  const SPOTS = [['CENTRE', SPOTX, GCY], ['LEFT WING', 200, 120], ['RIGHT WING', 200, 600], ['EDGE OF BOX', 135, GCY], ['LONG RANGE', 60, GCY]];
  const NERF = { easy: 16, normal: 0, hard: -6 };
  const TYPES = ['normal', 'power', 'finesse', 'chip', 'first-time'];
  const A = { cfg: null, panel: null, open: true, pick: false, ai: null, aiFor: null, sess: null, pend: null, streak: 0, lastOT: 0, flushAt: 0, upd: 0, dirty: false };
  ISO.ArenaUI = A;

  const fresh = () => ({ shots: 0, goals: 0, onTarget: 0, byType: {}, bestStreak: 0 });
  A.defaults = () => ({ defenders: 0, defMode: 'static', keeper: 'live', nerf: null, infStam: false, spot: { x: SPOTX, y: GCY }, ball: 'feet', rain: false, turf: 'grass', slow: 1 });
  A.cfg = A.defaults(); A.sess = fresh();
  const isArena = (App) => !App.demo && App.mode === 'drill' && App.drill === 'arena';

  // ------------------------------------------------------------- hooks called from main.js
  A.simOpts = (App, quiet) => (!quiet && isArena(App) ? { ...A.cfg, spot: { ...A.cfg.spot }, nerf: A.cfg.nerf != null ? A.cfg.nerf : NERF[App.matchDiff || App.diff] || 0 } : undefined);
  // the footballers for team 1: the sandbox's defenders, or a custom drill's (always at least one, so the game has a second player)
  A.roster = (App, home) => {
    if (App.demo) return null;
    const want = App.drill === 'arena' ? A.cfg.defenders : App.drill === 'custom' && App.drillDef ? App.drillDef.defenders.length : 0;
    if (want <= 0) return null;
    const pool = ISO.PLAYERS.filter((d) => d.id !== home.id).sort(() => Math.random() - 0.5), out = [home];
    for (let i = 0; i < want; i++) out.push(pool[i % pool.length]);
    return out;
  };
  // CPU defenders (defMode 'cpu'): the AI drives them. Static ones, and anyone parked, get no input.
  A.fill = (out, G, App) => {
    if (A.aiFor !== G) { A.aiFor = G; A.ai = {}; }
    for (let i = 1; i < G.players.length; i++) {
      const p = G.players[i];
      if (G.sand.defMode === 'cpu' && p.state !== 'away' && i <= G.sand.defenders) out[i] = ISO.AI.update(G, p, A.ai[i] || (A.ai[i] = ISO.AI.create(App.matchDiff || 'normal', { pers: ISO.AI.profileOf(p.def) })), C.STEP);
      else if (!out[i]) out[i] = ISO.Game.ZERO;
    }
  };
  A.timeScale = (App) => (isArena(App) ? A.cfg.slow : 1);

  // ------------------------------------------------------------- accuracy tally
  const bump = (t, type, k) => { const e = t.byType[type] = t.byType[type] || { s: 0, g: 0 }; e[k]++; };
  A.onEvent = (App, G, e) => {
    if (!isArena(App)) return;
    const S = A.sess;
    if (A.otG !== G) { A.otG = G; A.lastOT = 0; }
    const miss = () => { if (A.pend) { A.pend = null; A.streak = 0; } };
    if (e.type === 'kick' && e.shot && e.p === G.players[0]) {
      miss();      // a second strike before the first one resolved: the first did not score
      S.shots++; bump(S, e.shot, 's'); A.pend = e.shot; A.dirty = true;
    } else if (e.type === 'goal' && e.team === 0) {
      if (A.pend) { S.goals++; bump(S, A.pend, 'g'); A.streak++; S.bestStreak = Math.max(S.bestStreak, A.streak); A.pend = null; A.dirty = true; }
    } else if (e.type === 'out' || (e.type === 'save' && e.catch)) miss();      // a parry can still go in: only a catch or an out settles it
    const ot = G.stats.onTarget[0];
    if (ot > A.lastOT) { S.onTarget += ot - A.lastOT; A.dirty = true; }
    A.lastOT = ot;
  };
  A.rate = (t) => (t.shots ? Math.round((t.goals / t.shots) * 100) + '%' : '-');
  A.flush = () => {      // fold the session's NEW shots into the profile (once per few seconds, on leaving the match, on page hide)
    if (!A.dirty) return;
    A.dirty = false;
    try {
      const S = A.sess, d = A.sent || fresh(), delta = fresh();
      delta.shots = S.shots - d.shots; delta.goals = S.goals - d.goals; delta.onTarget = S.onTarget - d.onTarget; delta.bestStreak = S.bestStreak;
      for (const k of Object.keys(S.byType)) { const o = d.byType[k] || { s: 0, g: 0 }; delta.byType[k] = { s: S.byType[k].s - o.s, g: S.byType[k].g - o.g }; }
      if (delta.shots > 0 || delta.bestStreak > (d.bestStreak || 0)) ISO.Profile.recordArena(delta);
      A.sent = JSON.parse(JSON.stringify(S));
    } catch (er) { /* a full or blocked storage: the session tally still shows */ }
  };

  // ------------------------------------------------------------- the panel
  const CSS = '#arenaPanel{position:absolute;right:6px;top:82px;width:178px;z-index:30;background:rgba(8,14,22,.88);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px;font:700 11px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif;color:#dfe8f2;letter-spacing:.04em;max-height:620px;overflow:auto}' +
    '#arenaPanel h4{margin:6px 0 3px;font-size:10px;color:#8fa3b8;letter-spacing:.12em}#arenaPanel .row{display:flex;gap:3px;flex-wrap:wrap}' +
    '#arenaPanel button{flex:1 1 auto;min-width:30px;padding:4px 5px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#dfe8f2;border-radius:5px;font:inherit;cursor:pointer}' +
    '#arenaPanel button.on{background:#35e08a;color:#06120c;border-color:#35e08a}#arenaPanel button:hover{border-color:#fff}' +
    '#arenaPanel .hd{display:flex;justify-content:space-between;align-items:center;font-size:12px}#arenaPanel .st{display:grid;grid-template-columns:1fr auto auto;gap:1px 8px;font-size:10px;margin-top:2px}#arenaPanel .st b{color:#fff}' +
    '#arenaPanel .st i{font-style:normal;color:#8fa3b8}#arenaToggle{position:absolute;right:6px;top:82px;z-index:31;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(8,14,22,.88);color:#dfe8f2;font:700 11px Arial,sans-serif;cursor:pointer}';
  const btn = (a, v, label, on) => '<button data-a="' + a + '" data-v="' + v + '"' + (on ? ' class="on"' : '') + '>' + label + '</button>';
  function html(App) {
    const c = A.cfg, lvl = c.nerf != null ? c.nerf : NERF[App.diff] || 0, S = A.sess, T = ISO.Profile.data.arena || fresh();
    const seg = (a, list, cur) => '<div class="row">' + list.map(([v, l]) => btn(a, v, l, String(cur) === String(v))).join('') + '</div>';
    const rows = TYPES.filter((k) => S.byType[k] || (T.byType && T.byType[k])).map((k) => { const s = S.byType[k] || { s: 0, g: 0 }, t = (T.byType && T.byType[k]) || { s: 0, g: 0 }; return '<span>' + k.toUpperCase() + '</span><b>' + s.g + '/' + s.s + '</b><i>' + t.g + '/' + t.s + '</i>'; }).join('');
    return '<div class="hd"><b>TRAINING ARENA</b><button data-a="hide" style="flex:0">×</button></div>' +
      '<h4>DEFENDERS</h4>' + seg('def', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], c.defenders) + seg('dmode', [['static', 'STATIC'], ['cpu', 'CPU']], c.defMode) +
      '<h4>KEEPER</h4>' + seg('keeper', [['live', 'LIVE'], ['dummy', 'DUMMY'], ['none', 'NONE']], c.keeper) + seg('lvl', [[16, 'EASY'], [0, 'NORMAL'], [-6, 'HARD']], lvl) +
      '<h4>START SPOT</h4><div class="row">' + SPOTS.map((s, i) => btn('spot', i, s[0], c.spot.x === Math.round(s[1]) && c.spot.y === Math.round(s[2]))).join('') + btn('pick', 1, A.pick ? 'CLICK PITCH…' : 'PICK ON PITCH', A.pick) + '</div>' +
      '<h4>BALL</h4>' + seg('ball', [['feet', 'FEET'], ['rolling', 'ROLLING'], ['high', 'DROP']], c.ball) +
      '<h4>CONDITIONS</h4><div class="row">' + btn('stam', 1, 'INF STAMINA', c.infStam) + btn('rain', 1, 'RAIN', c.rain) + btn('turf', 1, 'PITCH: ' + c.turf.toUpperCase(), false) + '</div>' +
      '<h4>SPEED</h4>' + seg('slow', [[1, '1×'], [0.5, '½×'], [0.25, '¼×']], c.slow) +
      '<h4>ACCURACY <i>SESSION · ALL-TIME</i></h4><div class="st"><span>SHOTS</span><b>' + S.shots + '</b><i>' + T.shots + '</i><span>GOALS</span><b>' + S.goals + ' (' + A.rate(S) + ')</b><i>' + T.goals + ' (' + A.rate(T) + ')</i>' +
      '<span>ON TARGET</span><b>' + S.onTarget + '</b><i>' + T.onTarget + '</i><span>BEST STREAK</span><b>' + S.bestStreak + '</b><i>' + T.bestStreak + '</i>' + rows + '</div>' +
      '<div class="row" style="margin-top:6px">' + btn('reset', 1, 'RESET REP', false) + btn('clear', 1, 'CLEAR SESSION', false) + '</div>' +
      '<h4>PRACTISE</h4><div class="row">' + btn('go', 'drill-penalty', 'PENALTIES', false) + btn('go', 'drill-freekick', 'FREE KICKS', false) + '</div>';
  }
  const TURFS = () => ISO.Game.turfs;
  function act(App, a, v) {
    const c = A.cfg;
    if (a === 'hide') { A.open = false; return; }
    if (a === 'def') c.defenders = +v;
    else if (a === 'dmode') c.defMode = v === 'cpu' ? 'cpu' : 'static';
    else if (a === 'keeper') c.keeper = v;
    else if (a === 'lvl') c.nerf = +v;
    else if (a === 'spot') { const s = SPOTS[+v]; c.spot = { x: Math.round(s[1]), y: Math.round(s[2]) }; }
    else if (a === 'pick') { A.pick = !A.pick; A.rebuild = true; return; }
    else if (a === 'ball') c.ball = v;
    else if (a === 'stam') c.infStam = !c.infStam;
    else if (a === 'rain') c.rain = !c.rain;
    else if (a === 'turf') { const t = TURFS(), i = t.indexOf(c.turf); c.turf = t[(i + 1) % t.length]; }
    else if (a === 'slow') { c.slow = +v; A.rebuild = true; return; }      // app-side time scale: no restart needed
    else if (a === 'clear') { A.flush(); A.sess = fresh(); A.sent = null; A.pend = null; A.streak = 0; A.rebuild = true; return; }
    else if (a === 'go') { A.flush(); App.paused = false; if (App.actions[v]) App.actions[v](); return; }
    else if (a === 'reset') { /* restart with the same options */ }
    A.flush(); A.restart(App);
  }
  A.restart = (App) => { A.pick = false; A.pend = null; App.startMatch(); A.rebuild = true; };
  function ensure(App) {
    if (A.panel) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const p = A.panel = document.createElement('div'); p.id = 'arenaPanel'; p.className = 'hidden';
    const t = A.tog = document.createElement('button'); t.id = 'arenaToggle'; t.textContent = 'ARENA ▸'; t.className = 'hidden';
    const host = document.getElementById('stage') || document.body; host.appendChild(p); host.appendChild(t);
    p.addEventListener('mousedown', (e) => e.stopPropagation());
    p.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (!b) return; e.stopPropagation(); act(App, b.dataset.a, b.dataset.v); if (b.blur) b.blur(); });
    t.addEventListener('mousedown', (e) => e.stopPropagation());
    t.addEventListener('click', (e) => { e.stopPropagation(); A.open = true; A.rebuild = true; t.blur(); });
    // PICK ON PITCH (2D view only): the next click on the pitch sets the start spot (the top-down transform: screen (x, y) = (OX + Z * simY, OY + Z * (FW - simX)))
    const cv = document.getElementById('cv');
    if (cv) cv.addEventListener('click', (ev) => {
      if (!A.pick || !isArena(App)) return;
      const R = ISO.Render, r = cv.getBoundingClientRect(), mx = ((ev.clientX - r.left) / r.width) * R.VW, my = ((ev.clientY - r.top) / r.height) * R.VH;
      const x = Math.round(C.FW - (my - R.OY) / R.Z), y = Math.round((mx - R.OX) / R.Z);
      if (!(x === x && y === y)) return;
      A.cfg.spot = { x: Math.max(40, Math.min(C.FW - 70, x)), y: Math.max(60, Math.min(C.FH - 60, y)) };
      A.flush(); A.restart(App);
    });
    window.addEventListener('pagehide', A.flush);
  }
  A.frame = (App, dt) => {
    ensure(App);
    const on = App.screen === 'match' && isArena(App);
    A.panel.classList.toggle('hidden', !on || !A.open); A.tog.classList.toggle('hidden', !on || A.open);
    if (App.screen !== 'match' || !isArena(App)) { if (A.dirty) A.flush(); return; }
    A.flushAt += dt; if (A.flushAt > 15) { A.flushAt = 0; A.flush(); }
    A.upd -= dt;
    if (A.open && (A.upd <= 0 || A.rebuild)) { A.upd = 0.4; A.rebuild = false; const h = html(App); if (h !== A.last) { A.last = h; A.panel.innerHTML = h; } }      // only touched when the text changed, so a click is never swallowed by a rebuild
  };
})();
