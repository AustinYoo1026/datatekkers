/* ISO FOOTBALL — app shell: screens, HUD, main loop. The simulation lives in game.js. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, C = ISO.C, R = ISO.Render;
  const $ = (id) => document.getElementById(id);
  try { const ve = document.querySelector('.ver'); if (ve && ISO.VERSION) ve.textContent = 'BETA ' + ISO.VERSION; } catch (e) {}      // the menu's version label comes from data.js
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
  const T = (k, v) => ISO.I18n.t(k, v);      // Phase 9.3 (js/i18n.js); the English literals in index.html are the fallback

  const App = {
    screen: 'menu',           // menu | select | match | end
    mode: 'cpu',              // cpu | drill (one player, no opponent: see App.drill) | career (MyCareer ladder) | online (1v1 on the server)
    drill: 'arena',           // arena (free practice) | penalty | target | chip
    diff: 'normal',
    rain: false,              // prematch weather: play the match in the rain
    rules: '',                // prematch rule set: '' (standard) | 'street' (Street Football): offline CPU matches only, not persisted
    turf: 'grass',            // prematch pitch type (grass | firm | lush | astro): offline CPU matches only, not persisted
    pick: [ISO.playerById('messi'), ISO.playerById('ronaldo')],
    side: 0,                  // which side the selection grid is picking for
    paused: false,
    G: null, V: null, ai: [null, null], ctrl: ['human', 'cpu'],
    demo: true, kickoffFlip: 0, acc: 0, last: 0, endTimer: 0, hintT: 0,
  };
  ISO.App = App;
  if (ISO.Profile && ISO.Profile.onSaveFail) ISO.Profile.onSaveFail(() => toast(T('toast.save_fail'), T('toast.save_fail_sub'), '#ffb23d'));      // 9.4: once per session
  App.show = (s) => show(s); App.toast = (a, b, c) => toast(a, b, c); App.achToasts = (l) => achToasts(l); App.updateCredits = () => updateCredits();

  // ------------------------------------------------------------- layout
  function fit() {
    const s = Math.min(window.innerWidth / R.VW, window.innerHeight / R.VH);
    stage.style.transform = 'scale(' + s + ') translate(-50%, -50%)';
    const ratio = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * s));
    cv.width = Math.round(R.VW * ratio); cv.height = Math.round(R.VH * ratio);
    App.ratio = ratio;
    if (ISO.R3D && ISO.R3D.resize) ISO.R3D.resize(Math.min(ratio, 1.5));
  }
  window.addEventListener('resize', fit);

  // ------------------------------------------------------------- matches
  // `roster` (online 2v2): four footballers, player i on team i % 2; a team shares one kit
  function buildMatch(home, away, ctrl, labels, quiet, roster, takers) {
    if (App.tut && (quiet || App.mode !== 'tut') && ISO.Tutorial) ISO.Tutorial.abort();      // any game that is not a lesson ends the lesson first (panel, saved Views settings, the tutHold freeze)
    const defs = roster || [home, away];
    const kst = !quiet && !takers && !roster && (App.mode === 'cpu' || App.mode === 'career') && !!App.matchGk;      // Phase 3 offline CPU seat knobs (level, momentum, keeper style)
    const kits = ISO.resolveKits(defs[0], defs[1]);
    App.kits = kits;
    App.G = ISO.Game.create({ home, away, roster: defs, kickoff: App.kickoffFlip, solo: !quiet && App.mode === 'drill', drill: !quiet && App.mode === 'drill' ? App.drill : null, win: quiet ? 0 : App.matchWin,
      walls: !quiet && App.mode !== 'online' && !!(ISO.mapById(ISO.Profile.data.map).walls),      // futsal courts: the ball bounces off the walls (offline only)
      rules: !quiet && App.mode !== 'online' && !takers && App.matchRules || undefined,      // opt-in rule set (Street Football); never online (the server builds its own game and never passes one)
      rain: !quiet && App.mode === 'cpu' && !takers && !!App.rain,
      turf: !quiet && App.mode === 'cpu' && !takers ? App.turf : null,
      replay: !quiet, takers: takers || null,          // goals in a match are replayed; the menu demo and the drills play straight on
      keepers: kst ? [ISO.KEEPERS[0], { ...ISO.KEEPERS[1], gk: App.matchGk }] : undefined,      // Phase 3.4: a styled CPU keeper (offline CPU and MyCareer only: the def is never serialised, so never online)
      sand: ISO.ArenaUI ? ISO.ArenaUI.simOpts(App, quiet) : undefined, drillDef: !quiet && App.mode === 'drill' && App.drill === 'custom' ? App.drillDef : undefined,      // Phase 4.3 / 4.4: the training sandbox and a custom drill (offline only: the server never passes either)
      keeperNerf: quiet ? 0 : (kst && App.matchLvl != null ? ISO.AI.Adapt.keeperNerf(App.matchLvl) : ({ easy: 16, normal: 0, hard: -6 }[App.matchDiff] || 0)),
      ...(!quiet && App.mode === 'online' && App.onOpts ? App.onOpts : {}),      // online: the room's validated pitch / weather / rules / walls / win target (the server builds its game from the same settings)
      moves: ctrl.map((c) => (c === 'human' ? ISO.Profile.moveSet() : null)),      // you can only use the skill moves you have unlocked
      ...(!quiet && App.mode === 'tut' && ISO.Tutorial ? ISO.Tutorial.simOpts(App) : {}) });      // a tutorial lesson's situation (js/tutorial.js): a solo sandbox, a one-on-one with a scripted dribbler or a shootout; the same simulation, overrides only
    if (!quiet && App.mode === 'tut' && ISO.Tutorial && App.tut) ISO.Tutorial.setup(App.G, App.tut.cfg);      // the lesson's situation on the fresh sim (a mannequin keeper, a loose ball): js/tutorial.js
    App.ctrl = ctrl;
    App.ai = ctrl.map((c, i) => { const pers = !quiet && App.mode === 'career' && App.matchPers && i === 1 ? App.matchPers : !quiet && App.mode === 'cpu' && !takers && !roster && i === 1 && App.cpuStyle && App.cpuStyle !== 'auto' && ISO.AI.ARCH[App.cpuStyle] ? ISO.AI.archProfile(App.cpuStyle) : ISO.AI.profileOf(defs[i]); return c === 'cpu' ? ISO.AI.create(quiet ? 'normal' : App.matchDiff, kst && App.matchLvl != null ? { pers, lvl: App.matchLvl, adapt: App.matchAdapt } : { pers }) : null; });      // App.matchPers: a rival's forced archetype (5.5), career finale only
    App.matchDefs = defs; App.hudIdx = [0, 1]; App.me = 0;
    App.V = {
      sheets: defs.map((d, i) => ISO.Sprites.forPlayer(d, kits[i % 2], i)), me: 0,
      keeperSheet: ISO.Sprites.forKeeper(ISO.KEEPERS[1], 1),
      myKeeperSheet: ISO.Sprites.forKeeper(ISO.KEEPERS[0], 0),       // penalty shootout: the keeper you play
      labels, quiet,
    };
    App.takerDef = defs[1]; App.V.canSkip = !quiet && App.mode !== 'online';
    App.acc = 0; App.endTimer = 0;
    R.reset(); ISO.Smooth.reset();
    if (ISO.R3D && ISO.R3D.onMatch) ISO.R3D.onMatch(App.G, App.V, { defs, kits, quiet });
  }

  // Street rules force the walls in the sim; the picture follows: a map that has no walls is swapped for the wire-fenced rooftop cage for this match
  // (a look only: nothing is bought or changed in the profile), and the equipped map comes back as soon as you leave the match.
  function streetLook() {
    const own = ISO.Profile.data.map, want = App.matchRules && !ISO.mapById(own).walls ? 'fs_roof' : own;
    R.setMap(want); App.mapTmp = want !== own;
  }
  function startDemo() {
    const P = ISO.PLAYERS, a = P[(Math.random() * P.length) | 0];
    let b = a; while (b === a) b = P[(Math.random() * P.length) | 0];
    App.demo = true;
    buildMatch(a, b, ['cpu', 'cpu'], [a.short, b.short], true);
  }

  function startMatch() {
    if (App.mode === 'tut' && ISO.Tutorial && App.tut) {      // a tutorial lesson: no stats, credits, challenges or career (nothing below the buildMatch call runs)
      const S = ISO.Tutorial.matchSetup(App);
      App.demo = false; App.paused = false; App.tutHold = false; App.matchDiff = 'easy'; App.matchWin = 0; App.boss = null; App.matchPers = null; App.matchRules = null; App.matchLvl = null; App.matchAdapt = false; App.matchGk = null; App.kickoffFlip = 0;
      streetLook();
      buildMatch(S.home, S.away, S.ctrl, S.labels, false, null, S.takers);
      if (S.teams) App.V.teams = S.teams;      // (the countdown banner reads "<team> ATTACKS")
      beginMatch(S.arena); return;
    }
    let [home, away] = App.pick;
    App.demo = false; App.paused = false;
    const arena = App.mode === 'drill', career = App.mode === 'career', cupMode = App.mode === 'cup';       // `arena`: any one-player drill
    App.matchDiff = App.diff; App.matchWin = 0; App.boss = null; App.matchPers = null;
    App.matchRules = App.mode === 'cpu' && App.rules && ISO.RULES[App.rules] ? App.rules : null;
    if (cupMode) {      // a tournament match: you and the bracket's opponent, the round's CPU level, and the kickoff is written to the profile first (quitting from here is a loss)
      const st = ISO.Profile.data.cup, opp = ISO.Profile.cupOpponent();
      if (!st || !opp || ISO.Cup.mineDone(st)) { show('cup'); return; }
      const cup = ISO.Cup.cupById(st.id);
      home = ISO.Profile.outfit(ISO.playerById(st.me)); away = opp;
      App.matchDiff = cup.rounds[st.round]; App.matchWin = 3; App.cupInfo = { id: cup.id, round: st.round }; App.matchRules = cup.rules && ISO.RULES[cup.rules] ? cup.rules : null;
      ISO.Profile.cupKickoff();
    }
    ISO.Profile.setSetting('diff', App.diff);
    if (cupMode) { /* set above */ }
    else if (career) {
      home = ISO.outfit(ISO.Profile.careerDef(), false, 'home', ISO.Profile.celebOf());
      const fin = ISO.Profile.bossMatch();      // Phase 5.5: after matchday 7 the season finale is a rival, first to 5, with a forced AI archetype
      away = fin ? fin.def : ISO.Profile.careerOpponent();
      if (!away) { show('career'); return; }
      App.matchDiff = fin ? fin.diff : ISO.Profile.careerDiff(); App.matchWin = fin ? fin.win : 3;
      if (fin) { App.boss = fin; App.matchPers = ISO.AI.archProfile(fin.arch); ISO.Profile.bossKickoff(); }
      else ISO.Profile.careerKickoff();      // written and saved first: quitting or reloading from here is a 0-3 loss
    }
    else home = ISO.Profile.outfit(home);        // your prime upgrade and equipped skin
    if (arena) away = home;
    let takers = null;
    if (arena && App.drill === 'penalty') {      // the opposing team: five takers drawn from the roster, better finishers on the harder levels
      const pool = ISO.PLAYERS.filter((d) => d.id !== App.pick[0].id).sort((a, b) => (a.attr.fin + a.attr.sho) - (b.attr.fin + b.attr.sho));
      const cut = App.diff === 'easy' ? pool.slice(0, Math.ceil(pool.length * 0.6)) : App.diff === 'hard' ? pool.slice(Math.floor(pool.length * 0.45)) : pool;
      takers = [];
      while (takers.length < 5 && cut.length) takers.push(cut.splice((Math.random() * cut.length) | 0, 1)[0]);
      away = takers[0];
    }
    const pens = !!takers;
    let roster = null;
    if (arena && App.drill === 'freekick') {      // the taker plus a wall of four
      const pool = ISO.PLAYERS.filter((d) => d.id !== home.id).sort(() => Math.random() - 0.5);
      roster = [home, away, pool[0], pool[1], pool[2]];
    }
    if (arena && ISO.ArenaUI) roster = ISO.ArenaUI.roster(App, home) || roster;      // Phase 4.3 / 4.4: defenders for the sandbox or a custom drill
    App.matchLvl = null; App.matchAdapt = false; App.matchGk = null;
    if ((App.mode === 'cpu' || career) && !cupMode && !arena) {      // Phase 3.2 / 3.4 (offline Quick Match and MyCareer): the adaptive level, and the CPU keeper's style
      const ad = ISO.Profile.data.settings.adaptive !== false;
      App.matchLvl = ad ? ISO.Profile.adaptLevel(App.matchDiff) : ISO.AI.LVL[App.matchDiff]; App.matchAdapt = ad; App.matchGk = ISO.gkFor(away);
    }
    streetLook();
    buildMatch(home, away, ['human', arena ? 'none' : 'cpu'], [career ? 'YOU' : pens ? 'YOU' : 'P1', pens ? 'CPU' : arena ? '' : 'CPU'], false, roster, takers);
    if (roster) roster.forEach((d, i) => { App.V.labels[i] = App.V.labels[i] || ''; App.V.sheets[i] = ISO.Sprites.forPlayer(d, App.kits[i ? 1 : 0], i); });
    beginMatch(arena && !pens);
  }

  // Online 1v1 / 2v2: the server runs the match; this builds the local mirror the renderer and HUD read from.
  // Player i is seat i and plays for team i % 2.
  const teamName = (t) => App.names.filter((_, i) => i % 2 === t).map((n) => String(n || 'Player').toUpperCase().slice(0, 9)).join(' + ');
  App.startOnline = (picks, names, kickoff, me, settings) => {
    App.onSettings = ISO.Net.sanitizeSettings(settings); App.onOpts = ISO.Net.settingsOpts(App.onSettings);      // a server without settings: the defaults
    const defs = picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin, p.celeb));
    App.mode = 'online'; App.demo = false; App.paused = false; App.names = names;
    App.matchDiff = 'normal'; App.matchWin = 0; App.kickoffFlip = kickoff;
    buildMatch(defs[0], defs[1], defs.map(() => 'none'), defs.map((_, i) => (i === me ? 'YOU' : String(names[i] || 'P' + (i + 1)).toUpperCase().slice(0, 8))), false, defs);
    App.me = me; App.V.me = me; App.hudIdx = [0, 1].map((t) => (me % 2 === t ? me : t));
    App.V.names = names.map((n, i) => String(n || 'P' + (i + 1)).toUpperCase());
    App.V.teams = [teamName(0), teamName(1)];
    $('pRestart').classList.add('hidden'); $('pQuit').textContent = T('btn.leave_match'); $('pQuitMenu').classList.add('hidden');
    { const st = App.onSettings, own = ISO.Profile.data.map, want = st.map ? (st.rules && !ISO.mapById(st.map).walls ? 'fs_roof' : st.map) : (st.rules && !ISO.mapById(own).walls ? 'fs_roof' : own);      // a look only, like streetLook: nothing is bought
      R.setMap(want); App.mapTmp = want !== own; }
    beginMatch(false);
  };

  function beginMatch(arena) {
    $('pRestart').textContent = T(App.mode === 'tut' ? 'btn.restart_lesson' : 'btn.restart_match');      // (in a lesson it starts the whole lesson again)
    if (App.mode !== 'online') { const noRestart = App.mode === 'cup' || App.mode === 'career'; $('pRestart').classList.toggle('hidden', noRestart); $('pQuit').textContent = T(App.mode === 'cup' ? 'btn.forfeit_cup' : App.mode === 'career' ? 'btn.forfeit_match' : App.mode === 'tut' ? 'btn.exit_lesson' : 'btn.change_players'); $('pQuitMenu').classList.remove('hidden'); }      // a cup match cannot be restarted: leaving it is a forfeit
    ISO.Input.resetMouse();
    $('hud').classList.toggle('arena', arena);
    const team2 = App.matchDefs.length > 2 && !!App.V.teams;
    for (const i of [0, 1]) {
      const d = App.matchDefs[App.hudIdx[i]], f = $('hudFace' + i).getContext('2d');
      f.clearRect(0, 0, 88, 88); f.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0, 88, 88);
      $('hudName' + i).textContent = team2 ? App.V.teams[i] : d.short; $('hudOvr' + i).textContent = team2 ? '' : d.ovr;
      $('hudFace' + i).parentElement.querySelector('.stam').style.visibility = App.G.drill && App.G.drill.so ? 'hidden' : '';
      $('hudTag' + i).textContent = team2 ? T(App.me % 2 === i ? 'hud.your_team' : 'hud.opponents') : App.V.labels[i]; $('hudScore' + i).textContent = '0';
    }
    App.hud = { s: [-1, -1], t: -1 };
    App.hintT = ISO.Profile.data.settings.hint && App.mode !== 'tut' ? 8 : 0;
    $('hint').classList.toggle('hidden', !ISO.Profile.data.settings.hint || App.mode === 'tut');
    show('match');
    ISO.Audio.init(); ISO.Audio.ambience(true);
    if (ISO.PresUI) ISO.PresUI.begin(App);      // Phase 6.4: intro card / online lower-third (App.introOn holds the sim)
    if (ISO.ChallengeUI) ISO.ChallengeUI.begin(App);      // Phase 9.2: App.chTr, the challenges' own tracker (cpu / career / cup only)
    if (ISO.CareerUI) ISO.CareerUI.begin(App);      // Phase 5.2-5.4: the career fixture's tracker, objectives list in the pause menu, a training drill's token
  }

  // ------------------------------------------------------------- screens
  const MENU_SCREENS = ['menu', 'play', 'drills', 'select', 'career', 'cup', 'store', 'settings', 'online', 'editor', 'info', 'tutorial'];
  function updateCredits() { $('creditsVal').textContent = ISO.Profile.infinite() ? '∞' : ISO.Profile.data.credits.toLocaleString(); }
  function toast(title, sub, col) {
    const el = document.createElement('div'); el.className = 'toast';
    el.style.borderColor = col || 'var(--green)';
    el.innerHTML = '<b></b><span></span>'; el.firstChild.textContent = title; el.lastChild.textContent = sub || '';
    $('toasts').appendChild(el); setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4200);
  }
  function achToasts(list) { for (const a of list || []) toast(T('toast.ach', { name: ISO.I18n.up(a.name) }), T('toast.ach_sub', { desc: a.desc, reward: a.reward }), '#ffcf4d'); }

  function show(screen) {
    if (screen === 'select' && App.screen !== 'select') {
      App.selStep = 'players'; App.hov = null;
      const ST = ISO.Profile.data.settings; App.cpuStyle = ST.mCpu || 'auto'; App.rain = !!ST.mRain; App.turf = ISO.Game.turfs.includes(ST.mTurf) ? ST.mTurf : 'grass';      // the arena panel also writes the shared prematch weather / pitch
    }      // Quick Match: players first, then the match-settings page
    App.screen = screen;
    for (const id of MENU_SCREENS) $(id).classList.toggle('hidden', screen !== id);
    $('credits').classList.toggle('hidden', !MENU_SCREENS.includes(screen));
    if (App.mapTmp && screen !== 'match' && screen !== 'end') { R.setMap(ISO.Profile.data.map); App.mapTmp = false; }      // street rules borrowed a walled look for the match
    $('hud').classList.toggle('hidden', screen !== 'match' && screen !== 'end' && screen !== 'drillend');
    $('end').classList.toggle('hidden', screen !== 'end');
    $('drillend').classList.toggle('hidden', screen !== 'drillend');
    $('pause').classList.add('hidden');
    $('hint').classList.toggle('hidden', screen !== 'match' || !ISO.Profile.data.settings.hint || App.mode === 'tut');
    $('dim').classList.toggle('on', MENU_SCREENS.includes(screen));
    ISO.Input.setCapture(screen === 'match');
    if (screen !== 'match' && screen !== 'end') ISO.Audio.ambience(false);
    if (MENU_SCREENS.includes(screen) && !App.demo) startDemo();
    if (screen === 'select') {
      const P = ISO.Profile;
      if (!P.owns(App.pick[0].id)) App.pick[0] = ISO.PLAYERS.filter((d) => P.owns(d.id)).sort((a, b) => b.ovr - a.ovr)[0];
      renderSelect();
    }
    if (ISO.Meta && ISO.Meta.onShow) ISO.Meta.onShow(screen);
    if (ISO.Tutorial && ISO.Tutorial.onShow) ISO.Tutorial.onShow(screen);      // the lesson list, the first-run offer
    updateCredits();
  }

  // Mouse controls (aim + click to shoot) are one switch: Settings, or the pause menu mid-match.
  App.setMouse = (on) => {
    ISO.Profile.setSetting('mouseAim', on); ISO.Input.setMouse(on);
    $('mouseBtn').textContent = T('btn.mouse_aim', { state: T(on ? 'common.on' : 'common.off') });
    const K = (a) => ISO.Input.keyLabel(a).toUpperCase();
    $('hint').textContent = T('hint.match', { aim: on ? T('hint.mouse_aims') : '', shoot: K('shoot'), chip: K('chip'), lob: K('lob'), finesse: K('finesse'), jockey: K('jockey') });
    if ($('setMouse')) $('setMouse').checked = on;
  };
  function setPaused(p) {
    if (App.screen !== 'match') return;
    App.paused = p;
    $('pause').classList.toggle('hidden', !p);
    ISO.Input.setCapture(!p);
    if (p && ISO.CareerUI) ISO.CareerUI.pause(App);      // career fixture: this match's objectives and how they stand
    if (p && ISO.ChallengeUI) ISO.ChallengeUI.pause(App);      // Phase 9.2: today's challenges
    $('soundBtn').textContent = T('btn.sound', { state: T(ISO.Audio.muted ? 'common.off' : 'common.on') });
  }

  // ------------------------------------------------------------- selection
  const barCol = (v) => (v >= 90 ? '#35e08a' : v >= 80 ? '#8fdc5a' : v >= 70 ? '#e9c46a' : v >= 55 ? '#f4a261' : '#e76f51');

  { const pg = document.querySelector('.playgrid'); if (pg) pg.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { pg.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }      // wheel scrolls the mode strip sideways
  function buildGrid() {
    const grid = $('grid');
    ISO.PLAYERS.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'pcard r-' + ISO.rarityOf(d) + (d.era === 'legend' ? ' legend' : '');
      b.dataset.id = d.id;
      b.title = d.name + ' — ' + d.club;
      const c = document.createElement('canvas'); c.width = c.height = 168;
      c.getContext('2d').drawImage(ISO.Sprites.portrait(d, 84), 0, 0);
      b.innerHTML = '<span class="c-ovr">' + d.ovr + '</span><span class="c-flag">' + d.flag + '</span><span class="c-pick"></span><span class="c-lock">🔒<small>BOX DRAW</small></span>';
      b.appendChild(c);
      const n = document.createElement('span'); n.className = 'c-name'; n.textContent = d.short; b.appendChild(n);
      b.addEventListener('mouseenter', () => { App.hov = d; if (App.screen === 'select') renderPanel(App.side); });
      b.addEventListener('mouseleave', () => { App.hov = null; if (App.screen === 'select') renderPanel(App.side); });
      b.addEventListener('click', () => {
        ISO.Audio.init();
        if (App.side === 0 && !ISO.Profile.owns(d.id)) { ISO.Audio.play('deny'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); toast('LOCKED', d.name + ' — win them from a Box Draw', '#f1735f'); return; }
        ISO.Audio.play('ui');
        App.pick[App.side] = d;
        if (!App.touched) { App.touched = true; App.side = 1 - App.side; }
        renderSelect();
      });
      grid.appendChild(b);
    });
  }

  // Player comparison: the delta of a highlighted player's stat over the current pick's (green up, red down, nothing when equal)
  const deltaHTML = (v, ref) => (ref === undefined || v === ref ? '' : '<em class="dl ' + (v > ref ? 'up' : 'dn') + '">' + (v > ref ? '+' : '') + (v - ref) + '</em>');
  App.deltaHTML = deltaHTML;
  function renderPanel(i) {
    const P0 = ISO.Profile, cur = i === 0 && P0.owns(App.pick[0].id) ? P0.outfit(App.pick[0]) : App.pick[i];
    const hov = App.hov && App.side === i && App.hov.id !== App.pick[i].id && App.screen === 'select' ? App.hov : null;
    const mine = i === 0 && P0.owns(App.pick[0].id);
    const d = hov ? (i === 0 && P0.owns(hov.id) ? P0.outfit(hov) : hov) : cur, el = $('panel' + i), two = false, ref = hov ? cur : null;
    const who = i === 0 ? 'HOME · P1' : 'AWAY · ' + (two ? 'P2' : 'CPU');
    const stars = ISO.stars(d.attr.skl), sy = ISO.styleOf(d), wfs = sy.wfStars;
    const styleChips = sy.role === 'none' ? '' : '<span class="chip">STYLE <b>' + ISO.ROLES[sy.role].name.toUpperCase() + '</b></span><span class="chip">WEAK FOOT <b>' + '★'.repeat(wfs) + '☆'.repeat(5 - wfs) + '</b></span>' +
      sy.traits.map((t) => '<span class="chip trait" title="' + ISO.TRAITS[t].desc + '">' + ISO.TRAITS[t].tag + '</span>').join('');
    el.classList.toggle('active', App.side === i);
    el.innerHTML =
      '<div class="ovr-big">' + d.ovr + (ref ? deltaHTML(d.ovr, ref.ovr) : '') + '</div>' +
      (ref ? '<div class="cmp-note">PREVIEW · vs ' + ref.short + '</div>' : '') +
      '<div class="p-top"><canvas width="184" height="184"></canvas><div><div class="side">' + who + '</div>' +
      '<div class="nm">' + d.name + '</div><div class="meta">' + d.flag + ' ' + d.nat + '<br>' + d.club + '</div></div></div>' +
      '<div class="chips"><span class="chip">SKILLS <b>' + '★'.repeat(stars) + '</b></span><span class="chip">FOOT <b>' + (d.foot === 'L' ? 'LEFT' : 'RIGHT') +
      '</b></span><span class="chip">' + (d.era === 'legend' ? 'LEGEND' : 'MODERN') + '</span>' + (d.prime ? '<span class="chip primechip">★ PRIME</span>' : '') + styleChips +
      (i === 1 && !two && App.mode !== 'online' ? '<span class="chip trait" title="' + ISO.AI.profileOf(d).desc + '">AI <b>' + ISO.AI.profileOf(d).name.toUpperCase() + '</b></span>' : '') + '</div>' +
      '<div class="attrs">' + ISO.ATTRS.map(([k, label]) => {
        const v = d.attr[k];
        return '<div class="attr"><span>' + label + '</span><span class="bar"><i style="width:' + v + '%;background:' + barCol(v) + '"></i></span><span class="v">' + v + (ref ? deltaHTML(v, ref.attr[k]) : '') + '</span></div>';
      }).join('') + '</div>';
    const kits = ISO.resolveKits(ISO.Profile.owns(App.pick[0].id) ? ISO.Profile.outfit(App.pick[0]) : App.pick[0], App.pick[1]);
    el.querySelector('canvas').getContext('2d').drawImage(ISO.Sprites.portrait(d, 92, kits[i]), 0, 0);
  }

  function renderSelect() {
    const online = App.mode === 'online', arena = App.mode === 'drill' || online, two = false, P = ISO.Profile;
    $('selMode').textContent = (online ? T('sel.online') : arena ? T('sel.drill', { name: drillName(App.drill) }) : T(App.rules === 'street' ? 'sel.street' : 'sel.cpu')) + '  ·  ' + T('sel.collection', { n: P.ownedCount(), total: ISO.PLAYERS.length });
    // what a win is worth with this match-up: tougher opponent and harder CPU pay more
    const me = P.owns(App.pick[0].id) ? P.outfit(App.pick[0]) : App.pick[0], wm = P.winMult(App.diff, me, App.pick[1], undefined, ISO.Collection ? ISO.Collection.setBonus(P.data.owned, (me.base || me).id) : 0);
    $('selReward').className = 'sel-reward' + (arena ? ' hidden' : '') + (wm.total > 1 ? ' up' : wm.total < 1 ? ' down' : '');
    $('selReward').innerHTML = 'WIN BONUS <b>×' + wm.total + '</b><small>' + (App.pick[1].ovr - me.ovr > 0 ? '+' : '') + (App.pick[1].ovr - me.ovr) + ' OVR GAP</small>';
    const vs = !online && !arena, set = vs && App.selStep === 'set';      // Quick Match / Street: two pages
    $('select').classList.toggle('step-set', set);
    $('selKick').textContent = online ? 'CONFIRM ›' : vs ? (set ? 'PLAY ›' : 'NEXT: MATCH SETTINGS ›') : 'START ›';
    $('selSettings').classList.toggle('hidden', online || (vs && !set)); $('selSettings').classList.toggle('page', set);
    $('selBackStep').classList.toggle('hidden', !set); $('sideSeg').classList.toggle('hidden', arena || set); document.querySelector('[data-act="random"]').classList.toggle('hidden', set);
    $('selMatchup').classList.toggle('hidden', !set);
    if (set) $('selMatchup').innerHTML = '<div class="mu"><span class="mu-k">YOU</span><b>' + me.short + '</b><i>' + me.ovr + '</i></div><span class="mu-vs">VS</span><div class="mu away"><span class="mu-k">CPU</span><b>' + App.pick[1].short + '</b><i>' + App.pick[1].ovr + '</i><span class="mu-k">' + (App.cpuStyle && App.cpuStyle !== 'auto' && ISO.AI.ARCH[App.cpuStyle] ? ISO.AI.ARCH[App.cpuStyle].name.toUpperCase() : 'AUTO STYLE') + '</span></div>';
    $('diffSeg').classList.toggle('hidden', online);
    $('weatherSeg').classList.toggle('hidden', online || (arena && App.drill !== 'arena'));      // the training arena has the prematch's weather and pitch too
    $('rulesSeg').classList.toggle('hidden', online || arena);
    $('segRules-std').classList.toggle('on', !App.rules); $('segRules-street').classList.toggle('on', App.rules === 'street');
    { const cs = $('cpuStyleSeg'), sel = $('selCpuStyle'); cs.classList.toggle('hidden', online || arena);
      if (!sel.options.length) { sel.innerHTML = '<option value="auto">AUTO</option>' + ISO.AI.ARCH_ORDER.map((k) => '<option value="' + k + '">' + ISO.AI.ARCH[k].name.toUpperCase() + '</option>').join(''); sel.addEventListener('change', () => { App.cpuStyle = sel.value; ISO.Profile.setSetting('mCpu', sel.value); renderSelect(); }); }
      if (!App.cpuStyle) App.cpuStyle = 'auto'; sel.value = App.cpuStyle; $('selCpuDesc').textContent = App.cpuStyle !== 'auto' && ISO.AI.ARCH[App.cpuStyle] ? ISO.AI.ARCH[App.cpuStyle].desc : 'The CPU plays to its own player style.'; }
    $('turfSeg').classList.toggle('hidden', online || (arena && App.drill !== 'arena'));
    for (const t of ISO.Game.turfs) { const e = $('segTurf-' + t); if (e) e.classList.toggle('on', App.turf === t); }
    $('segWx-clear').classList.toggle('on', !App.rain); $('segWx-rain').classList.toggle('on', !!App.rain);
    $('diffSeg').querySelector('.seg-label').textContent = T(arena ? 'sel.keeper' : 'sel.cpu_label');
    $('panel1').style.visibility = arena ? 'hidden' : '';
    renderPanel(0); renderPanel(1);
    for (const i of [0, 1]) $('segSide' + i).classList.toggle('on', App.side === i);
    for (const k of ['easy', 'normal', 'hard']) $('segDiff-' + k).classList.toggle('on', App.diff === k);
    { const el = $('selAdapt'), vs = !arena && !online;      // Phase 3: the adaptive level line and the CPU keeper's style
      el.classList.toggle('hidden', !vs);
      el.innerHTML = vs ? (P.data.settings.adaptive !== false ? '<span class="chip" title="The CPU eases off after losses and tightens after wins">' + ISO.AI.Adapt.label(App.diff, P.adaptLevel(App.diff)) + '</span>' : '') +
        '<span class="chip trait" title="' + ISO.GK_STYLES[ISO.gkFor(App.pick[1])].desc + '">KEEPER <b>' + ISO.GK_STYLES[ISO.gkFor(App.pick[1])].name.toUpperCase() + '</b></span>' : ''; }
    document.querySelectorAll('.pcard').forEach((b) => {
      b.classList.toggle('locked', App.side === 0 && !P.owns(b.dataset.id));
      const base = ISO.playerById(b.dataset.id), pr = P.owns(base.id) && P.isPrime(base.id);
      b.classList.toggle('prime', pr);
      const ovr = pr ? ISO.primeOf(base).ovr : base.ovr;
      b.querySelector('.c-ovr').textContent = ovr;
      b.style.order = (100 - ovr) * 1000 + ISO.PLAYERS.indexOf(base);      // highest overall first
      const s0 = App.pick[0].id === b.dataset.id, s1 = !arena && App.pick[1].id === b.dataset.id;
      b.classList.toggle('sel0', s0); b.classList.toggle('sel1', s1);
      b.querySelector('.c-pick').innerHTML = (s0 ? '<span style="background:#35e08a">P1</span>' : '') + (s1 ? '<span style="background:#ffb23d">' + (two ? 'P2' : 'CPU') + '</span>' : '');
    });
  }

  const drillName = (k) => ISO.I18n.opt('drill.' + k, DRILL_NAMES[k] || 'DRILL');      // display only: G.drill.name is never touched
  const DRILL_NAMES = { arena: 'TESTING ARENA', penalty: 'PENALTY SHOOTOUT', target: 'TARGET PRACTICE', chip: 'CHIP CHALLENGE', freekick: 'FREE KICKS', oneonone: 'ONE ON ONE', longshot: 'LONG SHOTS', finesse: 'FINESSE CURLERS', power: 'POWER BLASTS' };

  // ------------------------------------------------------------- drill results
  // Phase 9.2: a finished drill counts towards the daily / weekly challenges (the shootout passes its result as the full score when won)
  function chDrill(D, won) { if (ISO.ChallengeUI && !D.def) ISO.ChallengeUI.drill(App, D, won); }
  function showDrillEnd() {
    const G = App.G, D = G.drill, so = D.so, won = so && G.winner === 0;
    const res = ISO.Profile.recordDrill(D.def ? 'custom:' + D.def.id : D.kind, D.points, App.matchDiff, won ? 60 : 0);
    if (App.trainTok && ISO.CareerUI) ISO.CareerUI.trainDone(App, D);      // a drill played on a career training token
    const dot = (r) => '<i class="' + (r.res === 'goal' ? (r.pts >= 3 ? 'gold' : r.pts ? 'ok' : 'meh') : 'bad') + '" title="' + r.res + '"></i>';
    if (so) {         // shootout: the final score, and every kick of both sides
      const row = (name, kicks) => '<div class="de-row"><span>' + name + '</span>' + kicks.map((k) => dot({ res: k, pts: 1 })).join('') + '</div>';
      $('deTitle').textContent = T(won ? 'de.won' : 'de.lost'); $('deTitle').style.color = R.TEAM_COL[won ? 0 : 1];
      $('deScore').textContent = G.score[0] + ' – ' + G.score[1]; $('deMax').textContent = T('de.on_pens');
      $('deDots').innerHTML = row(T('de.you'), so.kicks[0]) + row(T('hud.opponents'), so.kicks[1]);
      $('deRewards').innerHTML = '<span class="cr">+' + res.credits + ' CR</span><span>' + T('de.scored', { n: D.goals }) + '</span><span>' + T('de.saved', { n: D.saves || 0 }) + '</span><span>' + T('de.level', { d: T('diff.' + App.matchDiff) }) + '</span>' +
        (won ? '<span class="boost">' + T('de.win_bonus') + '</span>' : '') + (res.newBest ? '<span class="boost">' + T('de.new_best') + '</span>' : '');
      chDrill(D, won); show('drillend'); achToasts(res.ach); return;
    }
    $('deTitle').textContent = D.def ? D.name : drillName(D.kind) === 'DRILL' ? D.name : drillName(D.kind); $('deTitle').style.color = '';
    $('deScore').textContent = D.points; $('deMax').textContent = '/ ' + D.max + T(D.kind === 'custom' || D.kind === 'target' || D.kind === 'longshot' || D.kind === 'finesse' ? 'de.points' : 'de.goals');
    $('deDots').innerHTML = D.results.map(dot).join('');
    const rate = D.results.length ? Math.round((D.results.filter((r) => r.res === 'goal').length / D.results.length) * 100) : 0;
    $('deRewards').innerHTML = '<span class="cr">+' + res.credits + ' CR</span><span>' + T('de.rate', { n: rate }) + '</span><span>' + T('de.keeper', { d: T('diff.' + App.matchDiff) }) + '</span>' +
      (res.newBest ? '<span class="boost">' + T('de.new_best') + '</span>' : '<span>' + T('de.best', { n: res.best }) + '</span>');
    chDrill(D, false);
    show('drillend');
    achToasts(res.ach);
  }

  // ------------------------------------------------------------- end screen
  function showEnd() {
    if (App.mode === 'tut') return;      // a lesson never ends as a match: no result, stats, credits, challenges or achievements (the loop hands its end to Tutorial.onEnd)
    const G = App.G, w = G.winner, s = G.stats;
    const team2 = App.matchDefs.length > 2 && !!App.V.teams;
    for (const i of [0, 1]) {
      const d = App.matchDefs[App.hudIdx[i]], c = $('endFace' + i).getContext('2d');
      c.clearRect(0, 0, 160, 160); c.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0);
      $('endName' + i).textContent = team2 ? App.V.teams[i] : d.short; $('endScore' + i).textContent = G.score[i];
      $('endFace' + i).parentElement.classList.toggle('win', w === i);
    }
    const online = App.mode === 'online', me = App.me;
    if (online) $('endTitle').textContent = w === me % 2 ? T('end.you_win') : team2 ? T('end.opp_win') : T('end.wins', { name: String(App.names[w] || App.matchDefs[w].short).toUpperCase() });
    else $('endTitle').textContent = App.mode === 'career' ? (w === 0 ? T('end.you_win') : T('end.wins', { name: App.matchDefs[1].short })) : T('end.wins', { name: App.matchDefs[w].short }) + T(w === 0 ? 'end.you_win_tail' : 'end.cpu_win_tail');
    $('endTitle').style.color = R.TEAM_COL[w];
    const tot = s.poss[0] + s.poss[1] || 1, pp = Math.round((s.poss[0] / tot) * 100);
    const mm = Math.floor(G.time / 60), ss = Math.floor(G.time % 60);
    const rows = [[pp + '%', T('end.poss'), 100 - pp + '%'], [s.shots[0], T('end.shots'), s.shots[1]], [s.onTarget[0], T('end.on_target'), s.onTarget[1]],
      [s.saves[0], T('end.saves'), s.saves[1]], [s.clears[0], T('end.clears'), s.clears[1]], [s.tackles[0], T('end.tackles'), s.tackles[1]], [s.skills[0], T('end.skills'), s.skills[1]],
      ['', T('end.time', { t: String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') }), '']];
    $('endStats').innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('');
    if (ISO.PresUI) ISO.PresUI.end(App);      // Phase 6.4: player of the match, ratings, goal timeline, stat bars
    $('endRematch').textContent = T('btn.rematch'); $('endRematch').disabled = false;
    if (online) {          // friendly matches: no credits, no career progress
      $('endRewards').innerHTML = '<span>' + T('end.online_friendly', { m: team2 ? '2V2' : '1V1' }) + '</span>';
      $('endRematch').classList.remove('hidden'); $('endContinue').classList.add('hidden'); $('endChange').classList.add('hidden');
      $('endMenu').textContent = T('btn.leave'); show('end'); return;
    }
    $('endMenu').textContent = T('btn.main_menu');
    // rewards
    const career = App.mode === 'career', cupMode = App.mode === 'cup';
    const res = ISO.Profile.recordMatch({ mode: career ? (App.boss ? 'boss' : 'career') : cupMode ? 'cup' : 'cpu', won: w === 0, gf: G.score[0], ga: G.score[1], diff: App.matchDiff, lvl: App.matchLvl == null ? undefined : App.matchLvl, adapt: !!App.matchAdapt && App.matchLvl != null, win: G.win, poss: s.poss[0] / tot, sot: s.onTarget[0] / ((s.onTarget[0] + s.onTarget[1]) || 1),
      me: App.matchDefs[0], opp: App.matchDefs[1], rules: App.matchRules, skills: s.skills[0], clears: s.clears[0], powerGoals: s.powerGoals[0], m: career && ISO.CareerUI ? ISO.CareerUI.summary(App) : null });
    let rw = '<span class="cr">+' + res.credits + ' CR</span>';
    const chx = ISO.ChallengeUI ? ISO.ChallengeUI.end(App, res) : '';      // Phase 9.2: daily / weekly challenge rows and toasts (its own tracker, App.chTr)
    if (w === 0 && res.mult !== 1) {
      const parts = [];
      if (res.wm.diff !== 1) parts.push(T('end.cpu_x', { d: T('diff.' + App.matchDiff), x: res.wm.diff }));
      if (res.wm.set) parts.push(T('end.sets_x', { x: (1 + res.wm.set).toFixed(2) }));
      if (!career && res.wm.gap !== 1) parts.push(T(res.wm.gap > 1 ? 'end.tougher_x' : 'end.weaker_x', { x: res.wm.gap }));
      rw += '<span class="' + (res.mult > 1 ? 'boost' : '') + '">' + T('end.win_bonus', { x: res.mult }) + ' · ' + parts.join(' · ') + '</span>';
    }
    if (career && !App.boss) rw += '<span class="pts">' + ISO.I18n.n('end.upgrade_points', res.points) + '</span>' + (res.season ? '<span>' + (res.season.done ? T('end.season_complete') : T('end.matchday', { md: res.season.md })) + ordinal(res.season.pos) + '</span>' : '');
    if (App.matchAdapt && App.matchLvl != null && !cupMode) rw += '<span>NEXT MATCH: ' + ISO.AI.Adapt.label(App.matchDiff, ISO.Profile.adaptLevel(App.matchDiff)).replace('ADAPTIVE \u00b7 ', '') + '</span>';
    let cupAch = [];
    if (cupMode) {      // tournament: pay the round, move the bracket on (or end the run)
      const cr = ISO.Profile.recordCup(w === 0, G.score[0], G.score[1]);
      if (cr) {
        const rn = ISO.Cup.ROUND_NAMES[cr.round] || 'ROUND', nx = ISO.Cup.ROUND_NAMES[cr.round + 1];
        $('endTitle').textContent = cr.status === 'champion' ? cr.cup.name + ' CHAMPION!' : cr.status === 'out' ? 'ELIMINATED IN THE ' + rn : 'THROUGH TO THE ' + nx;
        $('endTitle').style.color = cr.status === 'out' ? R.TEAM_COL[1] : '#ffcf4d';
        rw += cr.status === 'out' ? '<span>' + cr.cup.name + ' OVER · RE-ENTER FROM THE CUP SCREEN</span>' : '<span class="pts">+' + cr.prize + ' CR PRIZE</span>' + (cr.status === 'champion' ? '<span class="boost">TROPHY WON</span>' : '<span>NEXT: ' + nx + '</span>');
        cupAch = cr.ach || [];
      }
    }
    if (career && ISO.CareerUI) rw += ISO.CareerUI.endRows(res);      // objectives, rating, reputation, training
    if (career && App.boss && ISO.CareerUI) { $('endTitle').textContent = res.boss && res.boss.won ? 'RIVAL BEATEN!' : App.boss.rival.name.toUpperCase() + ' WINS'; rw += ISO.CareerUI.bossRows(res); }      // 5.5 finale
    $('endRewards').innerHTML = rw + chx;
    $('endRematch').classList.toggle('hidden', career || cupMode);
    $('endContinue').classList.toggle('hidden', !(career || cupMode));
    $('endChange').classList.toggle('hidden', career || cupMode);
    show('end');
    achToasts(res.ach); achToasts(cupAch);
    if (career && ISO.CareerUI) ISO.CareerUI.endToasts(res);
    if (ISO.ChallengeUI) ISO.ChallengeUI.endToasts(App);
    if (career && App.boss && ISO.CareerUI) ISO.CareerUI.bossToasts(res);
  }

  // ------------------------------------------------------------- 3D mode (a second renderer over the same simulation; see js/3d/)
  const want3d = () => ISO.Profile.data.settings.camera === '3d';
  const use3d = () => want3d() && ISO.R3D && ISO.R3D.ready && !App.demo;      // (a custom drill's cones and walls: r3d.js buildCust; its lit target zones are 2D only)      // every mode has a 3D view (the shootout included); only the menu's background demo stays 2D
  // Which view this frame is on. Decided once per frame, so the inputs it samples, the renderer its events go to and the
  // picture it draws always belong to the same view, whatever happens in between (a toggle, Three.js arriving, a 3D error).
  // The view only ever changes what is sampled as input and what is drawn: nothing on either path writes to the sim.
  let cur3d = false, noTape = null;
  function pickView() {
    const u3 = !!use3d();
    if (u3 === cur3d) return;
    cur3d = u3;
    // the renderer coming back missed every event while the other one was showing: it starts clean (no stale effect texts,
    // event latches, camera state or half a replay tape from before the switch)
    if (u3) ISO.R3D.onView(); else R.reset();
    // back on 2D in the middle of a goal pause: Classic has no footage of that goal, so it shows the pause without a replay
    noTape = !u3 && App.G.phase === 'goal' ? App.G : null;
  }
  let viewLabel = '';
  function syncCamBtn() {      // the pause menu's camera button: only in the 3D view
    const b = $('camBtn'); if (!b) return;
    b.classList.toggle('hidden', !want3d());
    const R = ISO.R3D && ISO.R3D.CamRig, id = ISO.Profile.data.settings.cam3d || 'chase';
    b.textContent = T('btn.camera', { name: R && R.PRESETS[id] ? R.PRESETS[id].name : 'PLAYER CHASE' });
  }
  function syncView() {
    const t = T(want3d() ? 'btn.view_3d' : 'btn.view_classic');
    syncCamBtn();
    if (t === viewLabel) return;
    viewLabel = t; for (const id of ['viewBtn', 'viewBtnP', 'viewBtnE']) { const b = $(id); if (b) b.textContent = t; }
    const sel = $('setCamera'); if (sel && sel.value !== ISO.Profile.data.settings.camera) sel.value = ISO.Profile.data.settings.camera;
  }
  function ensure3d() {      // load Three.js the first time 3D is wanted; fall back to Classic if WebGL is not available
    if (!want3d() || (ISO.R3D && ISO.R3D.ready) || App.r3dLoading) return;
    // the 3D scripts are not on this host (a server that only serves js/*.js): say so instead of showing Classic under a 3D label
    if (!ISO.R3D || !ISO.R3D.ensure) { ISO.Profile.setSetting('camera', 'classic'); toast(T('toast.3d_off'), T('toast.3d_noserver'), '#ffb23d'); return; }
    App.r3dLoading = true;
    ISO.R3D.ensure((ok) => { App.r3dLoading = false; if (!ok && want3d()) { ISO.Profile.setSetting('camera', 'classic'); toast(T('toast.3d_off'), T('toast.3d_nogl'), '#ffb23d'); } });
  }

  // ------------------------------------------------------------- actions
  const ACTIONS = {
    'mode-cpu': () => { App.mode = 'cpu'; App.rules = ''; App.side = 0; App.touched = false; show('select'); },
    'mode-drills': () => show('drills'),
    'mode-tutorial': () => show('tutorial'),
    'drills-back': () => show('drills'),
    'select-back': () => App.screen === 'select' && App.selStep === 'set' ? (App.selStep = 'players', renderSelect()) : show(App.mode === 'drill' ? 'drills' : App.mode === 'online' ? 'online' : 'play'),
    'controls': () => { $('controls').classList.remove('hidden'); if (ISO.Tutorial) ISO.Tutorial.syncControls(App.screen); },
    'close-controls': () => $('controls').classList.add('hidden'),
    'back-menu': () => show('menu'),
    'side-0': () => { App.side = 0; App.touched = true; renderSelect(); },
    'side-1': () => { App.side = 1; App.touched = true; renderSelect(); },
    'random': () => { const P = ISO.PLAYERS; App.pick[App.side] = P[(Math.random() * P.length) | 0]; renderSelect(); },
    'turf-grass': () => { App.turf = 'grass'; ISO.Profile.setSetting('mTurf', 'grass'); renderSelect(); },
    'turf-firm': () => { App.turf = 'firm'; ISO.Profile.setSetting('mTurf', 'firm'); renderSelect(); },
    'turf-lush': () => { App.turf = 'lush'; ISO.Profile.setSetting('mTurf', 'lush'); renderSelect(); },
    'turf-astro': () => { App.turf = 'astro'; ISO.Profile.setSetting('mTurf', 'astro'); renderSelect(); },
    'rules-std': () => { App.rules = ''; renderSelect(); },
    'rules-street': () => { App.rules = 'street'; renderSelect(); },
    'mode-street': () => { App.mode = 'cpu'; App.rules = 'street'; App.side = 0; App.touched = false; show('select'); },
    'wx-clear': () => { App.rain = false; ISO.Profile.setSetting('mRain', false); renderSelect(); },
    'wx-rain': () => { App.rain = true; ISO.Profile.setSetting('mRain', true); renderSelect(); },
    'diff-easy': () => { App.diff = 'easy'; renderSelect(); },
    'diff-normal': () => { App.diff = 'normal'; renderSelect(); },
    'diff-hard': () => { App.diff = 'hard'; renderSelect(); },
    'sel-steps': () => { App.selStep = 'players'; renderSelect(); },
    'kickoff': () => { if (App.mode === 'cpu' && App.selStep !== 'set') { App.selStep = 'set'; renderSelect(); return; } if (App.mode === 'online') { show('online'); return; } if (App.mode === 'career') App.mode = 'cpu'; App.kickoffFlip = 0; startMatch(); },
    'mode-career': () => show('career'),
    'mode-online': () => { App.mode = 'online'; show('online'); },
    'online-pick': () => { App.mode = 'online'; App.side = 0; App.touched = true; show('select'); },
    'career-play': () => { App.mode = 'career'; App.kickoffFlip = 0; startMatch(); },
    'career-drill': () => { if (ISO.CareerUI && ISO.CareerUI.drillSetup(App)) startMatch(); },      // training token: a drill as your career player
    'career-continue': () => show(App.mode === 'cup' ? 'cup' : 'career'),
    'mode-cup': () => { App.mode = 'cup'; show('cup'); },
    'cup-play': () => { App.mode = 'cup'; App.kickoffFlip = 0; startMatch(); },
    'play': () => show('play'),
    'store': () => show('store'),
    'boxes': () => { ISO.Meta.storeTab('boxes'); show('store'); },
    'achievements': () => { ISO.Meta.storeTab('ach'); show('store'); },
    'resume': () => setPaused(false),
    'restart': () => { if (App.mode === 'tut' && ISO.Tutorial) { ISO.Tutorial.restart(); return; } if (App.mode !== 'cup' && App.mode !== 'career') startMatch(); },
    'rematch': () => { if (App.mode === 'online') { ISO.Online.rematch(); return; } if (App.mode === 'cup') { show('cup'); return; } App.kickoffFlip = 1 - App.kickoffFlip; startMatch(); },
    'mode-cpu-menu': () => { App.mode = 'cpu'; App.side = 0; App.touched = false; show('select'); },
    'cam-next': () => { const o = ISO.R3D && ISO.R3D.camPresets ? ISO.R3D.camPresets() : [], S = ISO.Profile.data.settings, i = o.indexOf(S.cam3d || 'chase'), n = o[(i + 1) % (o.length || 1)]; if (!n) return; ISO.Profile.setSetting('cam3d', n); syncCamBtn(); toast(T('toast.camera'), ISO.R3D.CamRig.PRESETS[n].name, '#7ad0ff'); },
    'toggle-3d': () => { ISO.Profile.setSetting('camera', want3d() ? 'classic' : '3d'); ensure3d(); syncView(); },
    'mouse': () => App.setMouse(!ISO.Profile.data.settings.mouseAim),
    'sound': () => { ISO.Audio.setMuted(!ISO.Audio.muted); ISO.Profile.setSetting('muted', ISO.Audio.muted); $('soundBtn').textContent = T('btn.sound', { state: T(ISO.Audio.muted ? 'common.off' : 'common.on') }); },
    'settings': () => show('settings'),
    'info': () => show('info'),
    'challenges': () => { if (ISO.ChallengeUI) ISO.ChallengeUI.open(); },
    'chal-close': () => { if (ISO.ChallengeUI) ISO.ChallengeUI.close(); },
    'quit': () => { App.paused = false; if (App.mode === 'tut' && ISO.Tutorial) { ISO.Tutorial.exit(); return; } if (App.mode === 'online') { ISO.Online.leave(); show('online'); return; } if (App.mode === 'cup') { forfeitCup(); show('cup'); return; } if (App.mode === 'career') forfeitCareer(); show(App.mode === 'career' ? 'career' : 'select'); },
    'quit-menu': () => { App.paused = false; if (App.mode === 'tut' && ISO.Tutorial) { ISO.Tutorial.exit(); show('menu'); return; } if (App.mode === 'online') ISO.Online.leave(); if (App.mode === 'cup') forfeitCup(); if (App.mode === 'career') forfeitCareer(); show('menu'); },
  };
  // leaving a cup match (or its pause menu) is a loss and ends the run: the prize of the rounds already won stays paid
  // leaving a career fixture is a 0-3 loss (the matchday counts, no retries)
  function forfeitCareer() { if (ISO.Profile.careerForfeit()) toast(T('toast.forfeit'), T('toast.forfeit_sub'), '#f1735f'); }
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
  function forfeitCup() { if (ISO.Profile.data.cup) { ISO.Profile.recordCup(false, 0, 0); toast(T('toast.cup_forfeit'), T('toast.cup_forfeit_sub'), '#f1735f'); } }
  for (const id of ['arena', 'penalty', 'target', 'chip', 'freekick', 'oneonone', 'longshot', 'finesse', 'power']) ACTIONS['drill-' + id] = () => { App.mode = 'drill'; App.drill = id; App.side = 0; App.touched = true; show('select'); };
  App.actions = ACTIONS; App.startMatch = () => startMatch();      // for the late-loading Phase 4.3 / 4.4 modules (arena-ui.js, editor-ui.js)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.classList.contains('panel') && e.target.closest('button')) return;
    ISO.Audio.init(); ISO.Audio.play('ui');
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn();
    if (el.blur && App.screen === 'match') el.blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;          // a key-rebind in Settings already took this press
    if (e.code === 'Enter' && $('controls').classList.contains('hidden') && !e.repeat) {
      if (App.screen === 'select') { e.preventDefault(); ACTIONS.kickoff(); }
      else if (App.screen === 'end') { e.preventDefault(); ACTIONS.rematch(); }
      else if (App.screen === 'drillend') { e.preventDefault(); ACTIONS.restart(); }
      else if (App.screen === 'match' && App.paused) { e.preventDefault(); setPaused(false); }
      return;
    }
    if (e.code !== 'Escape') return;
    if (!$('controls').classList.contains('hidden')) $('controls').classList.add('hidden');
    else if (App.screen === 'match') setPaused(!App.paused);
    else if (App.screen === 'career' && $('career').dataset.page !== 'hub') $('career').dataset.page = 'hub';      // Esc: one page back
    else if (App.screen === 'select' && App.selStep === 'set') { App.selStep = 'players'; renderSelect(); }
    else if (App.screen !== 'menu' && MENU_SCREENS.includes(App.screen) && $('opening').classList.contains('hidden')) show(App.screen === 'select' ? (App.mode === 'drill' ? 'drills' : App.mode === 'online' ? 'online' : 'play') : App.screen === 'career' || App.screen === 'cup' || App.screen === 'drills' || App.screen === 'online' || App.screen === 'tutorial' ? 'play' : 'menu');
  });
  window.addEventListener('blur', () => { if (App.screen === 'match' && !App.paused && App.mode !== 'online' && App.G.phase !== 'end') setPaused(true); });

  // ------------------------------------------------------------- loop
  // the cursor in canvas pixels, and in pitch (sim) coordinates
  function mouseCanvas() {
    const m = ISO.Input.mouse;
    if (!m.moved) return null;
    const r = cv.getBoundingClientRect();
    return { x: ((m.x - r.left) / r.width) * R.VW, y: ((m.y - r.top) / r.height) * R.VH };
  }
  function mouseSim() {
    if (!ISO.Profile.data.settings.mouseAim) return null;
    const m = mouseCanvas();
    if (cur3d) return m && ISO.R3D.unproject(m.x, m.y);
    if (m && App.G.drill && App.G.drill.so) return { x: C.FW, y: R.unprojectGoal(m.x, m.y).X };      // shootout view: the cursor picks a spot in the goal
    const lv = m && R.unprojectLive(m.x, m.y);
    if (lv) return lv;
    return m && { x: C.FW - (m.y - R.OY) / R.Z, y: (m.x - R.OX) / R.Z };
  }

  function inputs() {
    const G = App.G, out = [null, null];
    for (const i of [0, 1]) {
      if (App.ctrl[i] === 'none') out[i] = ISO.Game.ZERO;
      else if (App.ctrl[i] === 'cpu') out[i] = ISO.AI.update(G, G.players[i], App.ai[i], C.STEP);
      else if (App.ctrl[i] === 'tut') out[i] = ISO.Tutorial.input(App, G, i);      // a tutorial lesson's scripted seat (it only ever reads G)
      else out[i] = humanInput(i);
    }
    if (G.sand && ISO.ArenaUI) ISO.ArenaUI.fill(out, G, App);      // Phase 4.3: CPU defenders beyond the two seats
    return out;
  }
  function humanInput(i) {
    const k = ISO.Input.get('solo', i), aim = mouseSim();
    const o = cur3d ? ISO.R3D.mapInput(k) : { ...k, mx: -k.my, my: k.mx };       // screen: up = towards the goal (+x in the sim); 3D: up = where the camera looks
    // whole units, and never -0 (JSON would send it as 0): the aim simulated here is exactly the one that travels (net.js packInput)
    if (aim) { o.ax = Math.round(aim.x) + 0; o.ay = Math.round(aim.y) + 0; }
    return o;
  }
  App.humanInput = () => humanInput(0);

  function updateHud() {
    const G = App.G, H = App.hud;
    for (const i of [0, 1]) {
      if (H.s[i] !== G.score[i]) {
        const el = $('hudScore' + i); el.textContent = G.score[i];
        if (H.s[i] >= 0) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        H.s[i] = G.score[i];
      }
      const st = $('hudStam' + i), p = G.players[App.hudIdx[i]];
      st.style.width = p.stam.toFixed(0) + '%'; st.classList.toggle('low', p.exhausted || p.stam < 20);
    }
    const so = G.drill && G.drill.so;
    if (so && App.takerDef !== G.players[1].def) {        // the next opposing taker steps up
      const d = (App.takerDef = G.players[1].def), f = $('hudFace1').getContext('2d');
      App.V.sheets[1] = ISO.Sprites.forPlayer(d, App.kits[1], 1);
      f.clearRect(0, 0, 88, 88); f.drawImage(ISO.Sprites.portrait(d, 80, App.kits[1]), 0, 0, 88, 88);
      $('hudName1').textContent = d.short; $('hudOvr1').textContent = d.ovr;
    }
    const t = so ? (so.sudden ? T('hud.sudden') : T('hud.kick', { n: Math.min(Math.min(so.kicks[0].length, so.kicks[1].length) + 1, G.drill.total), total: G.drill.total }))
      : G.drill ? T('hud.shot', { n: Math.min(G.drill.n + 1, G.drill.total), total: G.drill.total }) : G.limit > 0 ? (G.sudden ? -1 : Math.max(0, Math.ceil(G.limit - G.time))) : Math.floor(G.time);      // street rules: a countdown, then SUDDEN DEATH
    if (t !== H.t) { H.t = t; $('hudTime').textContent = G.drill ? t : t === -1 ? T('hud.sudden') : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
    if (ISO.PresUI) ISO.PresUI.hud(G, H);      // Phase 6.4: pips, match point, scorer ticker, red clock
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - App.last) / 1000 || 0);
    App.last = now;
    const online = App.mode === 'online' && !App.demo;           // the server runs the match: no local stepping, and no pausing
    const D = ISO.Dbg, t0 = D ? performance.now() : 0; let steps = 0, t1 = 0, t2 = 0;      // Phase 9.5: zero cost while the debug HUD is off (ISO.Dbg is null)
    const G = App.G, running = (online || !(App.screen === 'match' && App.paused)) && !App.introOn && !App.tutHold;      // (App.tutHold: a finished lesson's card freezes the pitch)
    pickView();
    if (running) {
      if (online) ISO.Online.frame(G, dt);
      else {
        App.acc += dt * C.SPEED * (ISO.Pres ? ISO.Pres.timeScale(G, ISO.Profile.data.settings.slowmo !== false && cur3d && !(ISO.Access && ISO.Access.rm)) : 1) * (G.sand && ISO.ArenaUI ? ISO.ArenaUI.timeScale(App) : 1);          // (6.4: goal slow-mo, 3D offline only) // the whole game runs at C.SPEED of real time; nothing else scales the pace
        // a replay can be skipped: the goal pause simply ends early. Offline only (this branch, and V.canSkip): online the
        // pause belongs to the server, and a client that shortened its own copy would be predicting a different match.
        // Both views open the same window for it (the 3D view has no replay to show, but the pause is the same length).
        if (!App.demo && App.screen === 'match' && App.V.canSkip && G.phase === 'goal' && (cur3d ? ISO.R3D.inReplay(G) : !noTape && R.inReplay(G, App.V)) && ISO.Input.get('solo', 0).shoot) G.phaseT = Math.min(G.phaseT, 0.06);
        let stepped = false;
        while (App.acc >= C.STEP) {
          ISO.Smooth.capture(G);
          ISO.Game.step(G, inputs());
          App.acc -= C.STEP; stepped = true; steps++;
        }
        if (stepped) ISO.Input.consume();
      }
      for (const e of G.events) {
        if (App.chTr) ISO.Career.Tracker.onEvent(App.chTr, G, e);      // Phase 9.2: daily / weekly challenges (reads the event, never writes G)
        if (App.tr) ISO.Career.Tracker.onEvent(App.tr, G, e);      // career objectives: reads the event, never writes G
        if (G.sand && ISO.ArenaUI) ISO.ArenaUI.onEvent(App, G, e);      // Phase 4.3: the accuracy tally (app-side, reads only)
        if (App.mode === 'tut' && ISO.Tutorial) ISO.Tutorial.onEvent(App, G, e);      // the lesson's step detection (reads the event, never writes G)
        if (cur3d) ISO.R3D.onEvent(G, e); else R.onEvent(G, e);
        if (!App.demo) ISO.Audio.play(e.type, e);
        if (!App.demo && App.mode === 'drill' && App.drill === 'arena' && e.type === 'goal' && (!G.sand || (G.sand.keeper === 'live' && G.sand.nerf <= 16))) achToasts(ISO.Profile.recordArenaGoal());
      }
      G.events.length = 0;
      if (G.phase === 'end') {
        if (App.demo) startDemo();
        else if (App.screen === 'match') { App.endTimer += dt; if (App.endTimer > (ISO.PresUI ? ISO.PresUI.endDelay(App) : 0.6)) { if (App.mode === 'drill') showDrillEnd(); else if (App.mode === 'tut') ISO.Tutorial.onEnd(App); else showEnd(); } }
      }
    }
    if (D) t1 = performance.now();
    const ST = ISO.Profile.data.settings;
    App.V.cam = !App.demo && (App.mode === 'drill' && ['chip', 'freekick', 'oneonone', 'longshot', 'finesse'].includes(App.drill)) ? 'cinematic' : 'classic';
    App.V.aim = App.screen === 'match' && !App.paused && !App.demo && ST.mouseAim && ST.reticle ? mouseCanvas() : null;
    ctx.setTransform(App.ratio, 0, 0, App.ratio, 0, 0);
    // drawn part-way between the last two simulation steps, so motion is even on any display rate (see smooth.js)
    ensure3d(); syncView();
    if (App.G !== G) pickView();           // a match that ended this frame was replaced (the menu demo): the view follows the new one
    ISO.Smooth.begin(App.G, !running ? 1 : online ? ISO.Online.alpha : App.acc / C.STEP, running ? dt : 0);
    try {
      if (cur3d) {
        ctx.clearRect(0, 0, R.VW, R.VH);
        ISO.R3D.render(App.G, App.V, running ? dt : 0, ctx);      // the 3D scene, plus its 2D texts and reticle drawn onto the overlay canvas
        if (ISO.R3D.ready) {
          const pen = !!(App.G.drill && App.G.drill.so);      // the shootout's scoreline and banners are the 2D view's own (render.js penaltyOverlay / overlays(.., pen))
          if (pen && R.penaltyOverlay) R.penaltyOverlay(ctx, App.G, App.V);
          R.overlays(ctx, App.G, App.V, ISO.R3D.replayView ? ISO.R3D.replayView() : null, pen);      // (the goal replay's state: the GOAL banner steps aside)
        }
        else { cur3d = false; R.reset(); noTape = App.G.phase === 'goal' ? App.G : null; }      // 3D gave up (an error, a lost context): this very frame is drawn by Classic
      }
      $('cv3d').classList.toggle('hidden', !cur3d);
      if (noTape) { if (noTape === App.G && App.G.phase === 'goal' && !cur3d) R.reset(); else noTape = null; }
      if (!cur3d) {
        // 9.4: the menu demo sits behind #dim, so it is drawn every other frame (30 fps on a 60 Hz display) with the skipped time carried over
        if (App.demo) { App.demoT = (App.demoT || 0) + dt; App.demoFlip = !App.demoFlip; }
        if (!App.demo || App.demoFlip) { R.draw(ctx, App.G, App.V, running ? (App.demo ? App.demoT : dt) : 0); App.demoT = 0; }
      }
    } finally { ISO.Smooth.end(App.G); }
    if (D) t2 = performance.now();
    if (ISO.ArenaUI) ISO.ArenaUI.frame(App, dt);      // Phase 4.3: the arena side panel (match screen) and the tally flush (any screen)
    if (ISO.Tutorial && ISO.Tutorial.frame) ISO.Tutorial.frame(App, dt);      // the tutorial's instruction panel and step detection (no-op outside a lesson)
    if (App.screen === 'match') {
      updateHud();
      if (ISO.PresUI) ISO.PresUI.frame(App, dt, !App.demo && App.G.phase === 'goal' && (cur3d ? ISO.R3D.inReplay(App.G) : !noTape && R.inReplay(App.G, App.V)));
      if (App.hintT > 0 && !App.paused) { App.hintT -= dt; if (App.hintT <= 0) $('hint').classList.add('hidden'); }
    }
    if (D) { D.frame(App, { t0, t1, t2, t3: performance.now(), steps, dt, cur3d }); D.draw(ctx, App, cur3d); }
  }

  { // apply saved settings
    const ST = ISO.Profile.data.settings;
    ISO.Audio.setVolume(ST.volume); ISO.Audio.setMuted(ST.muted); ISO.Audio.setCrowd(ST.crowd); App.diff = ST.diff || 'normal';
    R.setMap(ISO.Profile.data.map); R.setBall(ISO.Profile.data.ball);
    ISO.Input.setBindings(ST.keys);
    if (ISO.Access) { ISO.Access.clean(ST); ISO.Access.apply(ST); }      // Phase 9.1: UI scale, palette, high contrast, reduce motion / flashes, pad layout
    App.cpuStyle = ST.mCpu || 'auto'; App.rain = !!ST.mRain; App.turf = ISO.Game.turfs.includes(ST.mTurf) ? ST.mTurf : 'grass';      // the saved prematch weather and pitch
    App.setMouse(ST.mouseAim);
    if (ISO.Meta) ISO.Meta.keyLabels();
  }
  buildGrid();
  fit();
  startDemo();
  show('menu');
  requestAnimationFrame(frame);
})();
