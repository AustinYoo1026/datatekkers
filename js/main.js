/* ISO FOOTBALL — app shell: screens, HUD, main loop. The simulation lives in game.js. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, C = ISO.C, R = ISO.Render;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');

  const App = {
    screen: 'menu',           // menu | select | match | end
    mode: 'cpu',              // cpu | drill (one player, no opponent: see App.drill) | career (MyCareer ladder) | online (1v1 on the server)
    drill: 'arena',           // arena (free practice) | penalty | target | chip
    diff: 'normal',
    pick: [ISO.playerById('messi'), ISO.playerById('ronaldo')],
    side: 0,                  // which side the selection grid is picking for
    paused: false,
    G: null, V: null, ai: [null, null], ctrl: ['human', 'cpu'],
    demo: true, kickoffFlip: 0, acc: 0, last: 0, endTimer: 0, hintT: 0,
  };
  ISO.App = App;
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
    const defs = roster || [home, away];
    const kits = ISO.resolveKits(defs[0], defs[1]);
    App.kits = kits;
    App.G = ISO.Game.create({ home, away, roster: defs, kickoff: App.kickoffFlip, solo: !quiet && App.mode === 'drill', drill: !quiet && App.mode === 'drill' ? App.drill : null, win: quiet ? 0 : App.matchWin,
      walls: !quiet && App.mode !== 'online' && !!(ISO.mapById(ISO.Profile.data.map).walls),      // futsal courts: the ball bounces off the walls (offline only)
      replay: !quiet, takers: takers || null,          // goals in a match are replayed; the menu demo and the drills play straight on
      keeperNerf: quiet ? 0 : ({ easy: 16, normal: 0, hard: -6 }[App.matchDiff] || 0),
      moves: ctrl.map((c) => (c === 'human' ? ISO.Profile.moveSet() : null)) });      // you can only use the skill moves you have unlocked
    App.ctrl = ctrl;
    App.ai = ctrl.map((c) => (c === 'cpu' ? ISO.AI.create(quiet ? 'normal' : App.matchDiff) : null));
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

  function startDemo() {
    const P = ISO.PLAYERS, a = P[(Math.random() * P.length) | 0];
    let b = a; while (b === a) b = P[(Math.random() * P.length) | 0];
    App.demo = true;
    buildMatch(a, b, ['cpu', 'cpu'], [a.short, b.short], true);
  }

  function startMatch() {
    let [home, away] = App.pick;
    App.demo = false; App.paused = false;
    const arena = App.mode === 'drill', career = App.mode === 'career';       // `arena`: any one-player drill
    App.matchDiff = App.diff; App.matchWin = 0;
    ISO.Profile.setSetting('diff', App.diff);
    if (career) {
      home = ISO.Profile.careerDef(); away = ISO.Profile.careerOpponent();
      if (!away) { show('career'); return; }
      App.matchDiff = ISO.Profile.careerDiff(ISO.Profile.data.career.stage); App.matchWin = 3;
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
    buildMatch(home, away, ['human', arena ? 'none' : 'cpu'], [career ? 'YOU' : pens ? 'YOU' : 'P1', pens ? 'CPU' : arena ? '' : 'CPU'], false, roster, takers);
    if (roster) roster.forEach((d, i) => { App.V.labels[i] = App.V.labels[i] || ''; App.V.sheets[i] = ISO.Sprites.forPlayer(d, App.kits[i ? 1 : 0], i); });
    beginMatch(arena && !pens);
  }

  // Online 1v1 / 2v2: the server runs the match; this builds the local mirror the renderer and HUD read from.
  // Player i is seat i and plays for team i % 2.
  const teamName = (t) => App.names.filter((_, i) => i % 2 === t).map((n) => String(n || 'Player').toUpperCase().slice(0, 9)).join(' + ');
  App.startOnline = (picks, names, kickoff, me) => {
    const defs = picks.map((p) => ISO.outfit(ISO.playerById(p.id), p.prime, p.skin));
    App.mode = 'online'; App.demo = false; App.paused = false; App.names = names;
    App.matchDiff = 'normal'; App.matchWin = 0; App.kickoffFlip = kickoff;
    buildMatch(defs[0], defs[1], defs.map(() => 'none'), defs.map((_, i) => (i === me ? 'YOU' : String(names[i] || 'P' + (i + 1)).toUpperCase().slice(0, 8))), false, defs);
    App.me = me; App.V.me = me; App.hudIdx = [0, 1].map((t) => (me % 2 === t ? me : t));
    App.V.teams = [teamName(0), teamName(1)];
    $('pRestart').classList.add('hidden'); $('pQuit').textContent = 'LEAVE MATCH'; $('pQuitMenu').classList.add('hidden');
    beginMatch(false);
  };

  function beginMatch(arena) {
    if (App.mode !== 'online') { $('pRestart').classList.remove('hidden'); $('pQuit').textContent = 'CHANGE PLAYERS'; $('pQuitMenu').classList.remove('hidden'); }
    ISO.Input.resetMouse();
    $('hud').classList.toggle('arena', arena);
    const team2 = App.matchDefs.length > 2 && !!App.V.teams;
    for (const i of [0, 1]) {
      const d = App.matchDefs[App.hudIdx[i]], f = $('hudFace' + i).getContext('2d');
      f.clearRect(0, 0, 88, 88); f.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0, 88, 88);
      $('hudName' + i).textContent = team2 ? App.V.teams[i] : d.short; $('hudOvr' + i).textContent = team2 ? '' : d.ovr;
      $('hudFace' + i).parentElement.querySelector('.stam').style.visibility = App.G.drill && App.G.drill.so ? 'hidden' : '';
      $('hudTag' + i).textContent = team2 ? (App.me % 2 === i ? 'YOUR TEAM' : 'OPPONENTS') : App.V.labels[i]; $('hudScore' + i).textContent = '0';
    }
    App.hud = { s: [-1, -1], t: -1 };
    App.hintT = ISO.Profile.data.settings.hint ? 8 : 0;
    $('hint').classList.toggle('hidden', !ISO.Profile.data.settings.hint);
    show('match');
    ISO.Audio.init(); ISO.Audio.ambience(true);
  }

  // ------------------------------------------------------------- screens
  const MENU_SCREENS = ['menu', 'play', 'drills', 'select', 'career', 'store', 'settings', 'online'];
  function updateCredits() { $('creditsVal').textContent = ISO.Profile.infinite() ? '∞' : ISO.Profile.data.credits.toLocaleString(); }
  function toast(title, sub, col) {
    const el = document.createElement('div'); el.className = 'toast';
    el.style.borderColor = col || 'var(--green)';
    el.innerHTML = '<b></b><span></span>'; el.firstChild.textContent = title; el.lastChild.textContent = sub || '';
    $('toasts').appendChild(el); setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4200);
  }
  function achToasts(list) { for (const a of list || []) toast('ACHIEVEMENT UNLOCKED · ' + a.name.toUpperCase(), a.desc + ' — claim +' + a.reward + ' CR in Store › Achievements', '#ffcf4d'); }

  function show(screen) {
    App.screen = screen;
    for (const id of MENU_SCREENS) $(id).classList.toggle('hidden', screen !== id);
    $('credits').classList.toggle('hidden', !MENU_SCREENS.includes(screen));
    $('hud').classList.toggle('hidden', screen !== 'match' && screen !== 'end' && screen !== 'drillend');
    $('end').classList.toggle('hidden', screen !== 'end');
    $('drillend').classList.toggle('hidden', screen !== 'drillend');
    $('pause').classList.add('hidden');
    $('hint').classList.toggle('hidden', screen !== 'match' || !ISO.Profile.data.settings.hint);
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
    updateCredits();
  }

  // Mouse controls (aim + click to shoot) are one switch: Settings, or the pause menu mid-match.
  App.setMouse = (on) => {
    ISO.Profile.setSetting('mouseAim', on); ISO.Input.setMouse(on);
    $('mouseBtn').textContent = 'MOUSE AIM: ' + (on ? 'ON' : 'OFF');
    const K = (a) => ISO.Input.keyLabel(a).toUpperCase();
    $('hint').textContent = 'ESC — pause & controls · ' + (on ? 'MOUSE aims, ' : '') + K('shoot') + ' shoots, ' + K('chip') + ' power shot, ' + K('lob') + ' chip, ' + K('finesse') + ' finesse';
    if ($('setMouse')) $('setMouse').checked = on;
  };
  function setPaused(p) {
    if (App.screen !== 'match') return;
    App.paused = p;
    $('pause').classList.toggle('hidden', !p);
    ISO.Input.setCapture(!p);
    $('soundBtn').textContent = 'SOUND: ' + (ISO.Audio.muted ? 'OFF' : 'ON');
  }

  // ------------------------------------------------------------- selection
  const barCol = (v) => (v >= 90 ? '#35e08a' : v >= 80 ? '#8fdc5a' : v >= 70 ? '#e9c46a' : v >= 55 ? '#f4a261' : '#e76f51');

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

  function renderPanel(i) {
    const mine = i === 0 && ISO.Profile.owns(App.pick[0].id);
    const d = mine ? ISO.Profile.outfit(App.pick[i]) : App.pick[i], el = $('panel' + i), two = false;
    const who = i === 0 ? 'HOME · P1' : 'AWAY · ' + (two ? 'P2' : 'CPU');
    const stars = ISO.stars(d.attr.skl);
    el.classList.toggle('active', App.side === i);
    el.innerHTML =
      '<div class="ovr-big">' + d.ovr + '</div>' +
      '<div class="p-top"><canvas width="184" height="184"></canvas><div><div class="side">' + who + '</div>' +
      '<div class="nm">' + d.name + '</div><div class="meta">' + d.flag + ' ' + d.nat + '<br>' + d.club + '</div></div></div>' +
      '<div class="chips"><span class="chip">SKILLS <b>' + '★'.repeat(stars) + '</b></span><span class="chip">FOOT <b>' + (d.foot === 'L' ? 'LEFT' : 'RIGHT') +
      '</b></span><span class="chip">' + (d.era === 'legend' ? 'LEGEND' : 'MODERN') + '</span>' + (d.prime ? '<span class="chip primechip">★ PRIME</span>' : '') + '</div>' +
      '<div class="attrs">' + ISO.ATTRS.map(([k, label]) => {
        const v = d.attr[k];
        return '<div class="attr"><span>' + label + '</span><span class="bar"><i style="width:' + v + '%;background:' + barCol(v) + '"></i></span><span class="v">' + v + '</span></div>';
      }).join('') + '</div>';
    const kits = ISO.resolveKits(ISO.Profile.owns(App.pick[0].id) ? ISO.Profile.outfit(App.pick[0]) : App.pick[0], App.pick[1]);
    el.querySelector('canvas').getContext('2d').drawImage(ISO.Sprites.portrait(d, 92, kits[i]), 0, 0);
  }

  function renderSelect() {
    const online = App.mode === 'online', arena = App.mode === 'drill' || online, two = false, P = ISO.Profile;
    $('selMode').textContent = (online ? 'ONLINE · PICK YOUR PLAYER' : arena ? (DRILL_NAMES[App.drill] || 'DRILL') + ' · 1 PLAYER' : '1 PLAYER · VS CPU') + '  ·  COLLECTION ' + P.ownedCount() + '/' + ISO.PLAYERS.length;
    // what a win is worth with this match-up: tougher opponent and harder CPU pay more
    const me = P.owns(App.pick[0].id) ? P.outfit(App.pick[0]) : App.pick[0], wm = P.winMult(App.diff, me, App.pick[1]);
    $('selReward').className = 'sel-reward' + (arena ? ' hidden' : '') + (wm.total > 1 ? ' up' : wm.total < 1 ? ' down' : '');
    $('selReward').innerHTML = 'WIN BONUS <b>×' + wm.total + '</b><small>' + (App.pick[1].ovr - me.ovr > 0 ? '+' : '') + (App.pick[1].ovr - me.ovr) + ' OVR GAP</small>';
    $('selKick').textContent = online ? 'CONFIRM ›' : 'START ›';
    $('diffSeg').classList.toggle('hidden', online);
    $('diffSeg').querySelector('.seg-label').textContent = arena ? 'KEEPER' : 'CPU';
    $('sideSeg').classList.toggle('hidden', arena);
    $('panel1').style.visibility = arena ? 'hidden' : '';
    renderPanel(0); renderPanel(1);
    for (const i of [0, 1]) $('segSide' + i).classList.toggle('on', App.side === i);
    for (const k of ['easy', 'normal', 'hard']) $('segDiff-' + k).classList.toggle('on', App.diff === k);
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

  const DRILL_NAMES = { arena: 'TESTING ARENA', penalty: 'PENALTY SHOOTOUT', target: 'TARGET PRACTICE', chip: 'CHIP CHALLENGE', freekick: 'FREE KICKS', oneonone: 'ONE ON ONE', longshot: 'LONG SHOTS', finesse: 'FINESSE CURLERS', power: 'POWER BLASTS' };

  // ------------------------------------------------------------- drill results
  function showDrillEnd() {
    const G = App.G, D = G.drill, so = D.so, won = so && G.winner === 0;
    const res = ISO.Profile.recordDrill(D.kind, D.points, App.matchDiff, won ? 60 : 0);
    const dot = (r) => '<i class="' + (r.res === 'goal' ? (r.pts >= 3 ? 'gold' : r.pts ? 'ok' : 'meh') : 'bad') + '" title="' + r.res + '"></i>';
    if (so) {         // shootout: the final score, and every kick of both sides
      const row = (name, kicks) => '<div class="de-row"><span>' + name + '</span>' + kicks.map((k) => dot({ res: k, pts: 1 })).join('') + '</div>';
      $('deTitle').textContent = won ? 'SHOOTOUT WON!' : 'SHOOTOUT LOST'; $('deTitle').style.color = R.TEAM_COL[won ? 0 : 1];
      $('deScore').textContent = G.score[0] + ' – ' + G.score[1]; $('deMax').textContent = 'ON PENALTIES';
      $('deDots').innerHTML = row('YOU', so.kicks[0]) + row('OPPONENTS', so.kicks[1]);
      $('deRewards').innerHTML = '<span class="cr">+' + res.credits + ' CR</span><span>' + D.goals + ' SCORED</span><span>' + (D.saves || 0) + ' SAVED</span><span>' + App.matchDiff.toUpperCase() + ' LEVEL</span>' +
        (won ? '<span class="boost">WIN BONUS</span>' : '') + (res.newBest ? '<span class="boost">NEW BEST</span>' : '');
      show('drillend'); achToasts(res.ach); return;
    }
    $('deTitle').textContent = D.name; $('deTitle').style.color = '';
    $('deScore').textContent = D.points; $('deMax').textContent = '/ ' + D.max + (D.kind === 'target' || D.kind === 'longshot' || D.kind === 'finesse' ? ' POINTS' : ' GOALS');
    $('deDots').innerHTML = D.results.map(dot).join('');
    const rate = D.results.length ? Math.round((D.results.filter((r) => r.res === 'goal').length / D.results.length) * 100) : 0;
    $('deRewards').innerHTML = '<span class="cr">+' + res.credits + ' CR</span><span>' + rate + '% SCORED</span><span>' + App.matchDiff.toUpperCase() + ' KEEPER</span>' +
      (res.newBest ? '<span class="boost">NEW BEST</span>' : '<span>BEST ' + res.best + '</span>');
    show('drillend');
    achToasts(res.ach);
  }

  // ------------------------------------------------------------- end screen
  function showEnd() {
    const G = App.G, w = G.winner, s = G.stats;
    const team2 = App.matchDefs.length > 2 && !!App.V.teams;
    for (const i of [0, 1]) {
      const d = App.matchDefs[App.hudIdx[i]], c = $('endFace' + i).getContext('2d');
      c.clearRect(0, 0, 160, 160); c.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0);
      $('endName' + i).textContent = team2 ? App.V.teams[i] : d.short; $('endScore' + i).textContent = G.score[i];
      $('endFace' + i).parentElement.classList.toggle('win', w === i);
    }
    const online = App.mode === 'online', me = App.me;
    if (online) $('endTitle').textContent = w === me % 2 ? 'YOU WIN!' : team2 ? 'OPPONENTS WIN' : String(App.names[w] || App.matchDefs[w].short).toUpperCase() + ' WINS';
    else $('endTitle').textContent = App.mode === 'career' ? (w === 0 ? 'YOU WIN!' : App.matchDefs[1].short + ' WINS') : App.matchDefs[w].short + ' WINS' + (w === 0 ? ' — YOU WIN!' : ' — CPU WINS');
    $('endTitle').style.color = R.TEAM_COL[w];
    const tot = s.poss[0] + s.poss[1] || 1, pp = Math.round((s.poss[0] / tot) * 100);
    const mm = Math.floor(G.time / 60), ss = Math.floor(G.time % 60);
    const rows = [[pp + '%', 'POSSESSION', 100 - pp + '%'], [s.shots[0], 'SHOTS', s.shots[1]], [s.onTarget[0], 'ON TARGET', s.onTarget[1]],
      [s.saves[0], 'SAVES FACED', s.saves[1]], [s.clears[0], 'REBOUNDS CLEARED', s.clears[1]], [s.tackles[0], 'TACKLES WON', s.tackles[1]], [s.skills[0], 'SKILL MOVES', s.skills[1]],
      ['', 'MATCH TIME ' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), '']];
    $('endStats').innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('');
    $('endRematch').textContent = 'REMATCH'; $('endRematch').disabled = false;
    if (online) {          // friendly matches: no credits, no career progress
      $('endRewards').innerHTML = '<span>ONLINE ' + (team2 ? '2V2' : '1V1') + ' · FRIENDLY</span>';
      $('endRematch').classList.remove('hidden'); $('endContinue').classList.add('hidden'); $('endChange').classList.add('hidden');
      $('endMenu').textContent = 'LEAVE'; show('end'); return;
    }
    $('endMenu').textContent = 'MAIN MENU';
    // rewards
    const career = App.mode === 'career';
    const res = ISO.Profile.recordMatch({ mode: career ? 'career' : 'cpu', won: w === 0, gf: G.score[0], ga: G.score[1], diff: App.matchDiff,
      me: App.matchDefs[0], opp: App.matchDefs[1], skills: s.skills[0], clears: s.clears[0], powerGoals: s.powerGoals[0] });
    let rw = '<span class="cr">+' + res.credits + ' CR</span>';
    if (w === 0 && res.mult !== 1) {
      const parts = [];
      if (res.wm.diff !== 1) parts.push(App.matchDiff.toUpperCase() + ' CPU ×' + res.wm.diff);
      if (!career && res.wm.gap !== 1) parts.push((res.wm.gap > 1 ? 'TOUGHER' : 'WEAKER') + ' OPPONENT ×' + res.wm.gap);
      rw += '<span class="' + (res.mult > 1 ? 'boost' : '') + '">WIN BONUS ×' + res.mult + ' · ' + parts.join(' · ') + '</span>';
    }
    if (career) rw += '<span class="pts">+' + res.points + ' UPGRADE POINT' + (res.points === 1 ? '' : 'S') + '</span>' + (w === 0 ? '<span>NEXT OPPONENT UNLOCKED</span>' : '<span>TRY AGAIN — UPGRADE YOUR STATS</span>');
    $('endRewards').innerHTML = rw;
    $('endRematch').classList.toggle('hidden', career);
    $('endContinue').classList.toggle('hidden', !career);
    $('endChange').classList.toggle('hidden', career);
    show('end');
    achToasts(res.ach);
  }

  // ------------------------------------------------------------- 3D mode (a second renderer over the same simulation; see js/3d/)
  const want3d = () => ISO.Profile.data.settings.camera === '3d';
  const use3d = () => want3d() && ISO.R3D && ISO.R3D.ready && !App.demo;      // every mode has a 3D view (the shootout included); only the menu's background demo stays 2D
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
  function syncView() {
    const t = 'VIEW: ' + (want3d() ? '3D BEHIND PLAYER' : 'CLASSIC 2D');
    if (t === viewLabel) return;
    viewLabel = t; for (const id of ['viewBtn', 'viewBtnP']) { const b = $(id); if (b) b.textContent = t; }
    const sel = $('setCamera'); if (sel && sel.value !== ISO.Profile.data.settings.camera) sel.value = ISO.Profile.data.settings.camera;
  }
  function ensure3d() {      // load Three.js the first time 3D is wanted; fall back to Classic if WebGL is not available
    if (!want3d() || (ISO.R3D && ISO.R3D.ready) || App.r3dLoading) return;
    // the 3D scripts are not on this host (a server that only serves js/*.js): say so instead of showing Classic under a 3D label
    if (!ISO.R3D || !ISO.R3D.ensure) { ISO.Profile.setSetting('camera', 'classic'); toast('3D UNAVAILABLE', 'This server does not carry the 3D view: using Classic', '#ffb23d'); return; }
    App.r3dLoading = true;
    ISO.R3D.ensure((ok) => { App.r3dLoading = false; if (!ok && want3d()) { ISO.Profile.setSetting('camera', 'classic'); toast('3D UNAVAILABLE', 'WebGL could not start: using Classic', '#ffb23d'); } });
  }

  // ------------------------------------------------------------- actions
  const ACTIONS = {
    'mode-cpu': () => { App.mode = 'cpu'; App.side = 0; App.touched = false; show('select'); },
    'mode-drills': () => show('drills'),
    'drills-back': () => show('drills'),
    'select-back': () => show(App.mode === 'drill' ? 'drills' : App.mode === 'online' ? 'online' : 'play'),
    'controls': () => $('controls').classList.remove('hidden'),
    'close-controls': () => $('controls').classList.add('hidden'),
    'back-menu': () => show('menu'),
    'side-0': () => { App.side = 0; App.touched = true; renderSelect(); },
    'side-1': () => { App.side = 1; App.touched = true; renderSelect(); },
    'random': () => { const P = ISO.PLAYERS; App.pick[App.side] = P[(Math.random() * P.length) | 0]; renderSelect(); },
    'diff-easy': () => { App.diff = 'easy'; renderSelect(); },
    'diff-normal': () => { App.diff = 'normal'; renderSelect(); },
    'diff-hard': () => { App.diff = 'hard'; renderSelect(); },
    'kickoff': () => { if (App.mode === 'online') { show('online'); return; } if (App.mode === 'career') App.mode = 'cpu'; App.kickoffFlip = 0; startMatch(); },
    'mode-career': () => show('career'),
    'mode-online': () => { App.mode = 'online'; show('online'); },
    'online-pick': () => { App.mode = 'online'; App.side = 0; App.touched = true; show('select'); },
    'career-play': () => { App.mode = 'career'; App.kickoffFlip = 0; startMatch(); },
    'career-continue': () => show('career'),
    'play': () => show('play'),
    'store': () => show('store'),
    'boxes': () => { ISO.Meta.storeTab('boxes'); show('store'); },
    'achievements': () => { ISO.Meta.storeTab('ach'); show('store'); },
    'resume': () => setPaused(false),
    'restart': () => startMatch(),
    'rematch': () => { if (App.mode === 'online') { ISO.Online.rematch(); return; } App.kickoffFlip = 1 - App.kickoffFlip; startMatch(); },
    'mode-cpu-menu': () => { App.mode = 'cpu'; App.side = 0; App.touched = false; show('select'); },
    'toggle-3d': () => { ISO.Profile.setSetting('camera', want3d() ? 'classic' : '3d'); ensure3d(); syncView(); },
    'mouse': () => App.setMouse(!ISO.Profile.data.settings.mouseAim),
    'sound': () => { ISO.Audio.setMuted(!ISO.Audio.muted); ISO.Profile.setSetting('muted', ISO.Audio.muted); $('soundBtn').textContent = 'SOUND: ' + (ISO.Audio.muted ? 'OFF' : 'ON'); },
    'settings': () => show('settings'),
    'quit': () => { App.paused = false; if (App.mode === 'online') { ISO.Online.leave(); show('online'); return; } show(App.mode === 'career' ? 'career' : 'select'); },
    'quit-menu': () => { App.paused = false; if (App.mode === 'online') ISO.Online.leave(); show('menu'); },
  };
  for (const id of ['arena', 'penalty', 'target', 'chip', 'freekick', 'oneonone', 'longshot', 'finesse', 'power']) ACTIONS['drill-' + id] = () => { App.mode = 'drill'; App.drill = id; App.side = 0; App.touched = true; show('select'); };
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
    else if (App.screen !== 'menu' && MENU_SCREENS.includes(App.screen) && $('opening').classList.contains('hidden')) show(App.screen === 'select' ? (App.mode === 'drill' ? 'drills' : App.mode === 'online' ? 'online' : 'play') : App.screen === 'career' || App.screen === 'drills' || App.screen === 'online' ? 'play' : 'menu');
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
      else out[i] = humanInput(i);
    }
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
    const t = so ? (so.sudden ? 'SUDDEN DEATH' : 'KICK ' + Math.min(Math.min(so.kicks[0].length, so.kicks[1].length) + 1, G.drill.total) + ' / ' + G.drill.total)
      : G.drill ? 'SHOT ' + Math.min(G.drill.n + 1, G.drill.total) + ' / ' + G.drill.total : Math.floor(G.time);
    if (t !== H.t) { H.t = t; $('hudTime').textContent = G.drill ? t : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - App.last) / 1000 || 0);
    App.last = now;
    const online = App.mode === 'online' && !App.demo;           // the server runs the match: no local stepping, and no pausing
    const G = App.G, running = online || !(App.screen === 'match' && App.paused);
    pickView();
    if (running) {
      if (online) ISO.Online.frame(G, dt);
      else {
        App.acc += dt * C.SPEED;          // the whole game runs at C.SPEED of real time; nothing else scales the pace
        // a replay can be skipped: the goal pause simply ends early. Offline only (this branch, and V.canSkip): online the
        // pause belongs to the server, and a client that shortened its own copy would be predicting a different match.
        // Both views open the same window for it (the 3D view has no replay to show, but the pause is the same length).
        if (!App.demo && App.screen === 'match' && App.V.canSkip && G.phase === 'goal' && (cur3d ? ISO.R3D.inReplay(G) : !noTape && R.inReplay(G, App.V)) && ISO.Input.get('solo', 0).shoot) G.phaseT = Math.min(G.phaseT, 0.06);
        let stepped = false;
        while (App.acc >= C.STEP) {
          ISO.Smooth.capture(G);
          ISO.Game.step(G, inputs());
          App.acc -= C.STEP; stepped = true;
        }
        if (stepped) ISO.Input.consume();
      }
      for (const e of G.events) {
        if (cur3d) ISO.R3D.onEvent(G, e); else R.onEvent(G, e);
        if (!App.demo) ISO.Audio.play(e.type, e);
        if (!App.demo && App.mode === 'drill' && App.drill === 'arena' && e.type === 'goal') achToasts(ISO.Profile.recordArenaGoal());
      }
      G.events.length = 0;
      if (G.phase === 'end') {
        if (App.demo) startDemo();
        else if (App.screen === 'match') { App.endTimer += dt; if (App.endTimer > 0.6) { if (App.mode === 'drill') showDrillEnd(); else showEnd(); } }
      }
    }
    const ST = ISO.Profile.data.settings;
    App.V.cam = !App.demo && (ST.camera === 'cinematic' || (App.mode === 'drill' && ['chip', 'freekick', 'oneonone', 'longshot', 'finesse'].includes(App.drill))) ? 'cinematic' : 'classic';
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
          R.overlays(ctx, App.G, App.V, null, pen);
        }
        else { cur3d = false; R.reset(); noTape = App.G.phase === 'goal' ? App.G : null; }      // 3D gave up (an error, a lost context): this very frame is drawn by Classic
      }
      $('cv3d').classList.toggle('hidden', !cur3d);
      if (noTape) { if (noTape === App.G && App.G.phase === 'goal' && !cur3d) R.reset(); else noTape = null; }
      if (!cur3d) R.draw(ctx, App.G, App.V, running ? dt : 0);
    } finally { ISO.Smooth.end(App.G); }
    if (App.screen === 'match') {
      updateHud();
      if (App.hintT > 0 && !App.paused) { App.hintT -= dt; if (App.hintT <= 0) $('hint').classList.add('hidden'); }
    }
  }

  { // apply saved settings
    const ST = ISO.Profile.data.settings;
    ISO.Audio.setVolume(ST.volume); ISO.Audio.setMuted(ST.muted); ISO.Audio.setCrowd(ST.crowd); App.diff = ST.diff || 'normal';
    R.setMap(ISO.Profile.data.map); R.setBall(ISO.Profile.data.ball);
    ISO.Input.setBindings(ST.keys);
    App.setMouse(ST.mouseAim);
    if (ISO.Meta) ISO.Meta.keyLabels();
  }
  buildGrid();
  fit();
  startDemo();
  show('menu');
  requestAnimationFrame(frame);
})();
