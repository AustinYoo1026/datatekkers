/* ISO FOOTBALL — match presentation screens (roadmap 6.4): the intro card and the online lower-third, the HUD extras (first-to-N pips,
   MATCH POINT, scorer ticker, red clock), the goal card, the FULL TIME sting and the end screen's player of the match, timeline and stat bars.
   Presentation only: reads G, never writes it; the logic is in js/pres.js. main.js calls begin() when a match starts, frame() every frame,
   hud() from updateHud(), endDelay() for the end timer and end() from showEnd(). All of it is off when settings.pres is false. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, P = ISO.Pres;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INTRO_T = 4, LOWER_T = 2.5, TEAMCOL = ['#35e08a', '#ff5d5d'];
  const S = { intro: 0, lower: 0, goalN: -1, sting: false, hudKey: '' };
  let App = null;

  const on = () => ISO.Profile.data.settings.pres !== false;
  const matchLike = (G) => !!G && !G.drill && !G.solo;
  function el(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function face(def, kit, px) {
    const c = document.createElement('canvas'); c.width = c.height = px; c.className = 'pr-face';
    try { c.getContext('2d').drawImage(ISO.Sprites.portrait(def, 80, kit), 0, 0, px, px); } catch (e) { /* no sprites (headless): an empty portrait */ }
    return c;
  }
  const nameOf = (i) => { const d = App.matchDefs[i]; return d ? d.short : ''; };

  // ------------------------------------------------------------------ DOM
  function mount() {
    if ($('intro')) return;
    const root = $('hud').parentNode;
    el('div', 'hidden', '', root).id = 'intro';
    el('div', 'hidden', '', root).id = 'goalCard';
    el('div', 'hidden', 'FULL TIME', root).id = 'sting';
    const mid = document.querySelector('.hud-mid');
    const pips = el('div', 'hud-pips', '<span id="hudPips0"></span><span id="hudPips1"></span>', mid); pips.id = 'hudPips';
    el('div', 'hud-mp hidden', 'MATCH POINT', mid).id = 'hudMP';
    el('div', 'hud-tick hidden', '', mid).id = 'hudTick';
    const es = $('endStats'); if (es && es.parentNode) { const e = el('div', 'hidden'); e.id = 'endPres'; es.parentNode.insertBefore(e, es); }
  }

  // ------------------------------------------------------------------ intro
  function introData() {
    const PF = ISO.Profile, sn = PF.data.career && PF.data.career.sn;
    let careerLine = '';
    try { if (App.mode === 'career' && sn && ISO.SEASONS[sn.i]) careerLine = ISO.SEASONS[sn.i].name + ' · MATCHDAY ' + (sn.md + 1) + ' / ' + ISO.Career.MD; } catch (e) { /* none */ }
    if (App.boss && App.boss.rival) careerLine = 'SEASON FINALE · ' + App.boss.rival.nick + ' · ' + (ISO.CareerUI && ISO.CareerUI.bossLine ? ISO.CareerUI.bossLine(App.boss) : '');      // Phase 5.5: the rival's introduction on the intro card
    const G = App.G;
    return P.intro({
      mode: App.mode, defs: [App.matchDefs[0], App.matchDefs[1]], win: G.win, rules: G.rules || App.matchRules,
      weather: G.weather, turf: G.turf, mapName: ISO.mapById(App.mapTmp ? 'fs_roof' : PF.data.map).name,
      cupName: App.cupInfo && ISO.Cup.cupById(App.cupInfo.id) ? ISO.Cup.cupById(App.cupInfo.id).name : '', round: App.cupInfo && ISO.Cup.ROUND_NAMES ? ISO.Cup.ROUND_NAMES[App.cupInfo.round] : '', careerLine,
      persOf: (d) => (App.matchPers && d === App.matchDefs[1] ? App.matchPers.name : ISO.AI && ISO.AI.profileOf ? ISO.AI.profileOf(d).name : null),
      celebName: (d) => { const st = ISO.styleOf(d); const c = ISO.celebById ? ISO.celebById(st.celeb) : null; return c && c.name ? c.name : st.celeb; },
    });
  }
  function side(i, d, kit) {
    const s = el('div', 'in-side s' + i);
    s.appendChild(face(App.matchDefs[i], App.kits[i], 120));
    const b = el('div', 'in-info', '<b>' + esc(d.name) + '</b><span><i>' + esc(d.ovr) + '</i> ' + esc(d.flag || '') + ' ' + esc(d.club || '') + '</span>', s);
    el('div', 'in-chips', d.chips.map((c) => '<u class="' + c.k + '">' + esc(c.t) + '</u>').join(''), b);
    s.style.setProperty('--tc', TEAMCOL[i]);
    return s;
  }
  function showIntro() {
    const d = introData(), box = $('intro'); box.innerHTML = ''; box.className = 'full';
    el('div', 'in-mid', '<div class="in-t">' + esc(d.title) + '</div>' + (d.sub ? '<div class="in-s">' + esc(d.sub) + '</div>' : '') + '<div class="in-vs">VS</div><div class="in-e">' + esc(d.env) + '</div>' + (d.first ? '<div class="in-f">' + esc(d.first) + '</div>' : ''), box);
    const row = el('div', 'in-row', '', box);
    if (d.sides[0]) row.appendChild(side(0, d.sides[0]));
    if (d.sides[1]) row.appendChild(side(1, d.sides[1]));
    el('div', 'in-skip', 'PRESS ENTER, SPACE OR CLICK TO SKIP', box);
    if (ISO.R3D) ISO.R3D.introP = ISO.Access && ISO.Access.rm ? null : 0;      // Phase 9.1: reduce motion skips the intro sweep
  }
  function showLower() {
    const box = $('intro'); box.innerHTML = ''; box.className = 'lower';
    const t2 = App.matchDefs.length > 2 && !!App.V.teams;
    for (const i of [0, 1]) {
      const idx = App.hudIdx[i], d = App.matchDefs[idx];
      const s = el('div', 'lt s' + i, '<b>' + esc(t2 ? App.V.teams[i] : d.short) + '</b><span>' + (t2 ? '' : esc(d.ovr)) + '</span>', box);
      s.style.setProperty('--tc', TEAMCOL[i]);
    }
    el('div', 'lt-f', P.intro({ mode: 'online', defs: [], win: App.G.win }).first || 'ONLINE', box);
  }
  function endIntro() {
    S.intro = 0; S.lower = 0; App.introOn = false;
    const b = $('intro'); if (b) b.classList.add('hidden');
    if (ISO.R3D) ISO.R3D.introP = null;
    ISO.Input.consume();
  }

  function begin(app) {
    App = app; mount();
    S.goalN = -1; S.sting = false; S.hudKey = ''; S.intro = 0; S.lower = 0; app.introOn = false;
    $('goalCard').classList.add('hidden'); $('sting').classList.add('hidden'); $('intro').classList.add('hidden'); if (ISO.R3D) ISO.R3D.introP = null;
    const G = app.G;
    if (!on() || app.demo || !matchLike(G)) return;
    if (app.mode === 'online') { S.lower = LOWER_T; showLower(); return; }
    if (app.mode === 'cpu' || app.mode === 'career' || app.mode === 'cup') { S.intro = INTRO_T; app.introOn = true; showIntro(); }
  }

  function skipIntro() { if (S.intro > 0) endIntro(); }
  window.addEventListener('keydown', (e) => { if (S.intro > 0 && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { e.preventDefault(); skipIntro(); } }, true);
  window.addEventListener('mousedown', () => { skipIntro(); }, true);

  // ------------------------------------------------------------------ HUD extras
  function hud(G, H) {
    if (!App || !G) return;
    const ok = on() && matchLike(G) && !App.demo, pr = ok ? P.pips(G) : null, mp = ok ? P.matchPoint(G) : -1;
    const lines = ok ? P.goalLines(G) : [], last = lines[lines.length - 1];
    const lim = ok && G.limit > 0 && !G.sudden ? Math.ceil(G.limit - G.time) : -1;
    const key = (pr ? pr.win + ':' + pr.filled : '') + '|' + mp + '|' + lines.length + '|' + (lim >= 0 && lim <= 30 ? 'r' : '');
    if (key === S.hudKey) return;
    S.hudKey = key;
    for (const i of [0, 1]) {
      const e = $('hudPips' + i); if (!e) continue;
      e.innerHTML = pr ? Array.from({ length: pr.win }, (_, k) => '<i class="' + (k < pr.filled[i] ? 'on' : '') + '"></i>').join('') : '';
      e.style.setProperty('--tc', TEAMCOL[i]);
    }
    $('hudMP').classList.toggle('hidden', mp < 0); if (mp >= 0) $('hudMP').style.color = TEAMCOL[mp];
    const tk = $('hudTick');
    if (last && ok) { tk.classList.remove('hidden'); tk.textContent = nameOf(last.by).toUpperCase() + ' ' + last.clock; tk.style.color = TEAMCOL[last.team]; } else tk.classList.add('hidden');
    $('hudTime').classList.toggle('red', lim >= 0 && lim <= 30);
  }

  // ------------------------------------------------------------------ goal card, sting
  function goalCard(G, inReplay) {
    const c = $('goalCard');
    let show = false;
    if (on() && !App.demo && matchLike(G) && G.phase === 'goal' && G.goals.length && G.goalDur > 0 && !inReplay) {
      const el_ = G.goalDur - G.phaseT; show = el_ >= 0.3 && G.phaseT >= 0.3;
    }
    if (!show) { if (!c.classList.contains('hidden')) c.classList.add('hidden'); if (G.phase !== 'goal') S.goalN = -1; return; }
    if (S.goalN !== G.goals.length) {
      S.goalN = G.goals.length;
      const g = P.goalLines(G)[G.goals.length - 1], d = App.matchDefs[g.by];
      c.innerHTML = ''; c.style.setProperty('--tc', TEAMCOL[g.team]);
      if (d) c.appendChild(face(d, App.kits[g.team], 64));
      el('div', 'gc-t', '<b>' + esc((d ? d.short : '').toUpperCase()) + '</b><span>' + P.ORD(g.n) + ' GOAL · ' + g.clock + '</span>', c);
      if (g.pts > 1) el('div', 'gc-p', '+' + g.pts, c);
    }
    c.classList.remove('hidden');
  }
  function sting(G) {
    const e = $('sting'), want = on() && !App.demo && matchLike(G) && G.phase === 'end' && App.screen === 'match';
    if (want !== S.sting) { S.sting = want; e.classList.toggle('hidden', !want); }
  }

  function frame(app, dt, inReplay) {
    App = app; if (!$('intro')) return;
    const G = app.G;
    if (S.intro > 0) {
      ISO.Input.consume();      // nothing pressed during the card reaches the kick-off
      if (!app.paused) {
        S.intro -= dt;
        if (ISO.R3D) ISO.R3D.introP = ISO.Access && ISO.Access.rm ? null : Math.min(1, 1 - S.intro / INTRO_T);
        if (ISO.Input.get('solo', 0).shoot) { skipIntro(); return; }
        if (S.intro <= 0) endIntro();
      }
    }
    if (S.lower > 0 && !app.paused) { S.lower -= dt; if (S.lower <= 0) { S.lower = 0; $('intro').classList.add('hidden'); } }
    goalCard(G, inReplay); sting(G);
  }
  const endDelay = (app) => (on() && !app.demo && matchLike(app.G) ? 1.4 : 0.6);

  // ------------------------------------------------------------------ end screen
  function end(app) {
    App = app; mount();
    const box = $('endPres'), G = app.G;
    const rows = $('endStats').querySelectorAll('tr');
    rows.forEach((tr) => {      // proportional bars behind the stat rows (the last row is the match time)
      const t = tr.children; tr.style.background = '';
      if (!on() || t.length < 3 || tr === rows[rows.length - 1]) return;
      const a = parseFloat(t[0].textContent) || 0, b = parseFloat(t[2].textContent) || 0, sum = a + b;
      if (sum <= 0) return;
      const l = (a / sum) * 46, r = (b / sum) * 46;
      tr.style.background = 'linear-gradient(90deg, rgba(53,224,138,.22) 0 ' + l + '%, transparent ' + l + '% ' + (100 - r) + '%, rgba(255,93,93,.22) ' + (100 - r) + '% 100%)';
    });
    box.innerHTML = '';
    const rt = on() && matchLike(G) ? P.rate(G) : null;
    if (!rt) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const pm = P.potm(G), d = app.matchDefs[pm.idx], t2 = app.matchDefs.length > 2 && !!app.V.teams;
    const top = el('div', 'ep-potm', '', box); top.style.setProperty('--tc', TEAMCOL[pm.team]);
    top.appendChild(face(d, app.kits[pm.team], 72));
    el('div', 'ep-pt', '<span>PLAYER OF THE MATCH</span><b>' + esc(d.short.toUpperCase()) + '</b>', top);
    el('div', 'ep-pr', pm.rating.toFixed(1), top);
    const rr = el('div', 'ep-rate', '', box);
    for (const e of rt) el('span', 't' + e.team, esc(app.matchDefs[e.idx].short) + ' <b>' + e.rating.toFixed(1) + '</b>' + (e.goals ? ' <i>' + e.goals + '⚽</i>' : ''), rr);
    const gl = P.goalLines(G);
    if (gl.length) el('div', 'ep-line', gl.map((g) => '<span class="t' + g.team + '">' + g.clock + ' ' + esc(nameOf(g.by).toUpperCase()) + (g.pts > 1 ? ' +' + g.pts : '') + ' <i>' + g.score[0] + '-' + g.score[1] + '</i></span>').join(''), box);
    void t2;
  }

  ISO.PresUI = { begin, frame, hud, end, endDelay, skipIntro };
})();
