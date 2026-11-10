/* ISO FOOTBALL — app shell: screens, HUD, main loop. The simulation lives in game.js. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, C = ISO.C, R = ISO.Render;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');

  const App = {
    screen: 'menu',           // menu | select | match | end
    mode: 'cpu',              // cpu | 2p
    diff: 'normal',
    pick: [ISO.playerById('messi'), ISO.playerById('ronaldo')],
    side: 0,                  // which side the selection grid is picking for
    paused: false,
    G: null, V: null, ai: [null, null], ctrl: ['human', 'cpu'],
    demo: true, kickoffFlip: 0, acc: 0, last: 0, endTimer: 0, hintT: 0,
  };
  ISO.App = App;

  // ------------------------------------------------------------- layout
  function fit() {
    const s = Math.min(window.innerWidth / R.VW, window.innerHeight / R.VH);
    stage.style.transform = 'scale(' + s + ') translate(-50%, -50%)';
    const ratio = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * s));
    cv.width = Math.round(R.VW * ratio); cv.height = Math.round(R.VH * ratio);
    App.ratio = ratio;
  }
  window.addEventListener('resize', fit);

  // ------------------------------------------------------------- matches
  function buildMatch(home, away, ctrl, labels, quiet) {
    const kits = ISO.resolveKits(home, away);
    App.kits = kits;
    App.G = ISO.Game.create({ home, away, kickoff: App.kickoffFlip });
    App.ctrl = ctrl;
    App.ai = ctrl.map((c) => (c === 'cpu' ? ISO.AI.create(quiet ? 'normal' : App.diff) : null));
    App.V = {
      sheets: [ISO.Sprites.forPlayer(home, kits[0], 0), ISO.Sprites.forPlayer(away, kits[1], 1)],
      keeperSheets: [ISO.Sprites.forKeeper(ISO.KEEPERS[0], 0), ISO.Sprites.forKeeper(ISO.KEEPERS[1], 1)],
      labels, quiet,
    };
    App.acc = 0; App.endTimer = 0;
    R.reset();
  }

  function startDemo() {
    const P = ISO.PLAYERS, a = P[(Math.random() * P.length) | 0];
    let b = a; while (b === a) b = P[(Math.random() * P.length) | 0];
    App.demo = true;
    buildMatch(a, b, ['cpu', 'cpu'], [a.short, b.short], true);
  }

  function startMatch() {
    const [home, away] = App.pick;
    App.demo = false; App.paused = false;
    const two = App.mode === '2p';
    buildMatch(home, away, ['human', two ? 'human' : 'cpu'], ['P1', two ? 'P2' : 'CPU'], false);
    for (const i of [0, 1]) {
      const d = App.pick[i], f = $('hudFace' + i).getContext('2d');
      f.clearRect(0, 0, 88, 88); f.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0, 88, 88);
      $('hudName' + i).textContent = d.short; $('hudOvr' + i).textContent = d.ovr;
      $('hudTag' + i).textContent = App.V.labels[i]; $('hudScore' + i).textContent = '0';
    }
    App.hud = { s: [-1, -1], t: -1 };
    App.hintT = 8;
    show('match');
    ISO.Audio.init(); ISO.Audio.ambience(true);
  }

  // ------------------------------------------------------------- screens
  function show(screen) {
    App.screen = screen;
    $('menu').classList.toggle('hidden', screen !== 'menu');
    $('select').classList.toggle('hidden', screen !== 'select');
    $('hud').classList.toggle('hidden', screen !== 'match' && screen !== 'end');
    $('end').classList.toggle('hidden', screen !== 'end');
    $('pause').classList.add('hidden');
    $('hint').classList.toggle('hidden', screen !== 'match');
    $('dim').classList.toggle('on', screen === 'menu' || screen === 'select');
    ISO.Input.setCapture(screen === 'match');
    if (screen !== 'match' && screen !== 'end') ISO.Audio.ambience(false);
    if ((screen === 'menu' || screen === 'select') && !App.demo) startDemo();
    if (screen === 'select') renderSelect();
  }

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
      b.className = 'pcard' + (d.era === 'legend' ? ' legend' : '');
      b.dataset.id = d.id;
      b.title = d.name + ' — ' + d.club;
      const c = document.createElement('canvas'); c.width = c.height = 168;
      c.getContext('2d').drawImage(ISO.Sprites.portrait(d, 84), 0, 0);
      b.innerHTML = '<span class="c-ovr">' + d.ovr + '</span><span class="c-flag">' + d.flag + '</span><span class="c-pick"></span>';
      b.appendChild(c);
      const n = document.createElement('span'); n.className = 'c-name'; n.textContent = d.short; b.appendChild(n);
      b.addEventListener('click', () => {
        ISO.Audio.init(); ISO.Audio.play('ui');
        App.pick[App.side] = d;
        if (!App.touched) { App.touched = true; App.side = 1 - App.side; }
        renderSelect();
      });
      grid.appendChild(b);
    });
  }

  function renderPanel(i) {
    const d = App.pick[i], el = $('panel' + i), two = App.mode === '2p';
    const who = i === 0 ? 'HOME · P1' : 'AWAY · ' + (two ? 'P2' : 'CPU');
    const stars = ISO.stars(d.attr.skl);
    el.classList.toggle('active', App.side === i);
    el.innerHTML =
      '<div class="ovr-big">' + d.ovr + '</div>' +
      '<div class="p-top"><canvas width="184" height="184"></canvas><div><div class="side">' + who + '</div>' +
      '<div class="nm">' + d.name + '</div><div class="meta">' + d.flag + ' ' + d.nat + '<br>' + d.club + '</div></div></div>' +
      '<div class="chips"><span class="chip">SKILLS <b>' + '★'.repeat(stars) + '</b></span><span class="chip">FOOT <b>' + (d.foot === 'L' ? 'LEFT' : 'RIGHT') +
      '</b></span><span class="chip">' + (d.era === 'legend' ? 'LEGEND' : 'MODERN') + '</span></div>' +
      '<div class="attrs">' + ISO.ATTRS.map(([k, label]) => {
        const v = d.attr[k];
        return '<div class="attr"><span>' + label + '</span><span class="bar"><i style="width:' + v + '%;background:' + barCol(v) + '"></i></span><span class="v">' + v + '</span></div>';
      }).join('') + '</div>';
    const kits = ISO.resolveKits(App.pick[0], App.pick[1]);
    el.querySelector('canvas').getContext('2d').drawImage(ISO.Sprites.portrait(d, 92, kits[i]), 0, 0);
  }

  function renderSelect() {
    const two = App.mode === '2p';
    $('selMode').textContent = two ? '2 PLAYERS · LOCAL' : '1 PLAYER · VS CPU';
    $('diffSeg').classList.toggle('hidden', two);
    renderPanel(0); renderPanel(1);
    for (const i of [0, 1]) $('segSide' + i).classList.toggle('on', App.side === i);
    for (const k of ['easy', 'normal', 'hard']) $('segDiff-' + k).classList.toggle('on', App.diff === k);
    document.querySelectorAll('.pcard').forEach((b) => {
      const s0 = App.pick[0].id === b.dataset.id, s1 = App.pick[1].id === b.dataset.id;
      b.classList.toggle('sel0', s0); b.classList.toggle('sel1', s1);
      b.querySelector('.c-pick').innerHTML = (s0 ? '<span style="background:#35e08a">P1</span>' : '') + (s1 ? '<span style="background:#ffb23d">' + (two ? 'P2' : 'CPU') + '</span>' : '');
    });
  }

  // ------------------------------------------------------------- end screen
  function showEnd() {
    const G = App.G, w = G.winner, s = G.stats;
    for (const i of [0, 1]) {
      const d = App.pick[i], c = $('endFace' + i).getContext('2d');
      c.clearRect(0, 0, 160, 160); c.drawImage(ISO.Sprites.portrait(d, 80, App.kits[i]), 0, 0);
      $('endName' + i).textContent = d.short; $('endScore' + i).textContent = G.score[i];
      $('endFace' + i).parentElement.classList.toggle('win', w === i);
    }
    $('endTitle').textContent = App.pick[w].short + ' WINS' + (App.mode === 'cpu' ? (w === 0 ? ' — YOU WIN!' : ' — CPU WINS') : ' — ' + App.V.labels[w]);
    $('endTitle').style.color = R.TEAM_COL[w];
    const tot = s.poss[0] + s.poss[1] || 1, pp = Math.round((s.poss[0] / tot) * 100);
    const mm = Math.floor(G.time / 60), ss = Math.floor(G.time % 60);
    const rows = [[pp + '%', 'POSSESSION', 100 - pp + '%'], [s.shots[0], 'SHOTS', s.shots[1]], [s.onTarget[0], 'ON TARGET', s.onTarget[1]],
      [s.saves[1], 'SAVES FACED', s.saves[0]], [s.tackles[0], 'TACKLES WON', s.tackles[1]], [s.skills[0], 'SKILL MOVES', s.skills[1]],
      ['', 'MATCH TIME ' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), '']];
    $('endStats').innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('');
    show('end');
  }

  // ------------------------------------------------------------- actions
  const ACTIONS = {
    'mode-cpu': () => { App.mode = 'cpu'; App.side = 0; App.touched = false; show('select'); },
    'mode-2p': () => { App.mode = '2p'; App.side = 0; App.touched = false; show('select'); },
    'controls': () => $('controls').classList.remove('hidden'),
    'close-controls': () => $('controls').classList.add('hidden'),
    'back-menu': () => show('menu'),
    'side-0': () => { App.side = 0; App.touched = true; renderSelect(); },
    'side-1': () => { App.side = 1; App.touched = true; renderSelect(); },
    'random': () => { const P = ISO.PLAYERS; App.pick[App.side] = P[(Math.random() * P.length) | 0]; renderSelect(); },
    'diff-easy': () => { App.diff = 'easy'; renderSelect(); },
    'diff-normal': () => { App.diff = 'normal'; renderSelect(); },
    'diff-hard': () => { App.diff = 'hard'; renderSelect(); },
    'kickoff': () => { App.kickoffFlip = 0; startMatch(); },
    'resume': () => setPaused(false),
    'restart': () => startMatch(),
    'rematch': () => { App.kickoffFlip = 1 - App.kickoffFlip; startMatch(); },
    'sound': () => { ISO.Audio.setMuted(!ISO.Audio.muted); $('soundBtn').textContent = 'SOUND: ' + (ISO.Audio.muted ? 'OFF' : 'ON'); },
    'quit': () => { App.paused = false; show('select'); },
    'quit-menu': () => { App.paused = false; show('menu'); },
  };
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
    if (e.code === 'Enter' && $('controls').classList.contains('hidden') && !e.repeat) {
      if (App.screen === 'select') { e.preventDefault(); ACTIONS.kickoff(); }
      else if (App.screen === 'end') { e.preventDefault(); ACTIONS.rematch(); }
      else if (App.screen === 'match' && App.paused) { e.preventDefault(); setPaused(false); }
      return;
    }
    if (e.code !== 'Escape') return;
    if (!$('controls').classList.contains('hidden')) $('controls').classList.add('hidden');
    else if (App.screen === 'match') setPaused(!App.paused);
    else if (App.screen === 'select') show('menu');
  });
  window.addEventListener('blur', () => { if (App.screen === 'match' && !App.paused && App.G.phase !== 'end') setPaused(true); });

  // ------------------------------------------------------------- loop
  function inputs() {
    const G = App.G, out = [null, null];
    for (const i of [0, 1]) {
      if (App.ctrl[i] === 'cpu') out[i] = ISO.AI.update(G, G.players[i], App.ai[i], C.STEP);
      else out[i] = ISO.Input.get(App.mode === '2p' ? (i ? 'p2' : 'p1') : 'solo', i);
    }
    return out;
  }

  function updateHud() {
    const G = App.G, H = App.hud;
    for (const i of [0, 1]) {
      if (H.s[i] !== G.score[i]) {
        const el = $('hudScore' + i); el.textContent = G.score[i];
        if (H.s[i] >= 0) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        H.s[i] = G.score[i];
      }
      const st = $('hudStam' + i), p = G.players[i];
      st.style.width = p.stam.toFixed(0) + '%'; st.classList.toggle('low', p.exhausted || p.stam < 20);
    }
    const t = Math.floor(G.time);
    if (t !== H.t) { H.t = t; $('hudTime').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - App.last) / 1000 || 0);
    App.last = now;
    const G = App.G, running = !(App.screen === 'match' && App.paused);
    if (running) {
      App.acc += dt;
      let stepped = false;
      while (App.acc >= C.STEP) {
        ISO.Game.step(G, inputs());
        App.acc -= C.STEP; stepped = true;
      }
      if (stepped) ISO.Input.consume();
      for (const e of G.events) {
        R.onEvent(G, e);
        if (!App.demo) ISO.Audio.play(e.type, e);
      }
      G.events.length = 0;
      if (G.phase === 'end') {
        if (App.demo) startDemo();
        else if (App.screen === 'match') { App.endTimer += dt; if (App.endTimer > 0.6) showEnd(); }
      }
    }
    ctx.setTransform(App.ratio, 0, 0, App.ratio, 0, 0);
    R.draw(ctx, App.G, App.V, running ? dt : 0);
    if (App.screen === 'match') {
      updateHud();
      if (App.hintT > 0 && !App.paused) { App.hintT -= dt; if (App.hintT <= 0) $('hint').classList.add('hidden'); }
    }
  }

  buildGrid();
  fit();
  startDemo();
  show('menu');
  requestAnimationFrame(frame);
})();
