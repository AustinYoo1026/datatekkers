/* ISO FOOTBALL — MyCareer, Box Draw and Achievements screens. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, App = ISO.App;
  const $ = (id) => document.getElementById(id);
  const RR = ISO.RARITY, RANKS = ['common', 'rare', 'epic', 'legend', 'icon'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const imgCache = new Map();
  function face(d, kit) {
    kit = kit || d.kit;
    const key = d.id + kit.a + kit.b + kit.pat + (d.look.boot || '');
    if (!imgCache.has(key)) imgCache.set(key, ISO.Sprites.portrait(d, 64, kit).toDataURL());
    return imgCache.get(key);
  }
  function drawTo(canvasId, d, size) {
    const c = $(canvasId).getContext('2d');
    c.clearRect(0, 0, size, size); c.drawImage(ISO.Sprites.portrait(d, size / 2, d.kit), 0, 0, size, size);
  }
  const achName = (id) => (PF.ACH.find((a) => a.id === id) || {}).name || id;

  // ---------------------------------------------------------------- career
  function renderCareer() {
    const P = PF.data, C = P.career, me = PF.careerDef(), opp = PF.careerOpponent();
    drawTo('careerFace', me, 184);
    $('careerOvr').textContent = me.ovr;
    $('careerPts').textContent = C.points;
    $('careerSub').textContent = 'STAGE ' + Math.min(C.stage + 1, C.ladder.length) + ' / ' + C.ladder.length;
    $('careerAttrs').innerHTML = ISO.ATTRS.map(([k, label]) =>
      '<div class="cattr" data-row="' + k + '"><span>' + label + '</span>' +
      '<div class="ctrack"><i class="t-reach"></i><i class="t-val"></i><i class="t-base"></i><input type="range" class="cslide" min="0" max="99" step="1" data-slide="' + k + '" value="' + C.attr[k] + '"></div>' +
      '<b></b><small class="ccost"></small></div>').join('');
    paintSliders();
    $('careerLadder').innerHTML = C.ladder.map((id, i) => {
      const d = ISO.playerById(id), st = i < C.stage ? 'beaten' : i === C.stage ? 'next' : 'ahead';
      return '<div class="lrow ' + st + ' r-' + ISO.rarityOf(d) + '"><span class="ln">' + (i + 1) + '</span><img src="' + face(d) + '" alt="">' +
        '<span class="lname">' + esc(d.name) + '<small>' + esc(d.club) + (C.ladder.indexOf(id) < i ? ' · REMATCH' : '') + '</small></span><span class="lovr">' + d.ovr + '</span>' +
        '<span class="lst">' + (st === 'beaten' ? '✓' : st === 'next' ? 'NEXT' : '') + '</span></div>';
    }).join('');
    if (opp) {
      drawTo('careerOppFace', opp, 184);
      $('careerOppName').textContent = opp.name;
      $('careerOppMeta').textContent = opp.club + ' · OVR ' + opp.ovr;
      $('careerOppDiff').textContent = 'CPU ' + PF.careerDiff(C.stage).toUpperCase() + ' · FIRST TO 3';
      $('careerPlay').classList.remove('hidden');
    } else {
      $('careerOppName').textContent = 'CAREER COMPLETE';
      $('careerOppMeta').textContent = 'You beat everyone. The GOAT.';
      $('careerOppDiff').textContent = '';
      $('careerPlay').classList.add('hidden');
      $('careerOppFace').getContext('2d').clearRect(0, 0, 184, 184);
    }
    const nx = $('careerLadder').querySelector('.next');
    if (nx) nx.scrollIntoView({ block: 'center' });
  }

  // fill = current value, faint band = how far your points could take it, dark start = the career's base value
  function paintSliders() {
    const C = PF.data.career;
    document.querySelectorAll('.cattr[data-row]').forEach((row) => {
      const k = row.dataset.row, v = C.attr[k], s = row.querySelector('input');
      s.value = v;
      const pct = (x) => (x / 99) * 100 + '%';
      row.querySelector('.t-base').style.left = pct(C.base[k]);       // tick at the starting value
      row.querySelector('.t-val').style.width = pct(v);
      row.querySelector('.t-reach').style.width = pct(PF.reach(k));
      row.querySelector('b').textContent = v;
      row.querySelector('.ccost').textContent = v >= 99 ? 'MAX' : PF.upgradeCost(v) + ' PT';
      row.classList.toggle('below', v < C.base[k]);
    });
    $('careerPts').textContent = C.points;
    $('careerOvr').textContent = PF.careerOvr(C.attr);
  }
  document.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.slide;
    if (!k) return;
    const before = PF.data.career.attr[k], now = PF.setAttr(k, +e.target.value);
    if (now !== before) ISO.Audio.play('tick', { pitch: now > before ? 0.6 : 0 });
    paintSliders();
  });
  document.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.slide) renderCareer(); });     // refresh the portrait / opponent panel once you let go

  // ---------------------------------------------------------------- boxes
  // every player a box can give, by rarity, with which boxes can roll that rarity and what you already own
  function renderPool() {
    $('boxPool').innerHTML = '<h3 class="pool-h">EVERY PLAYER YOU CAN DRAW</h3>' + RANKS.slice().reverse().map((r) => {
      const list = ISO.PLAYERS.filter((d) => ISO.rarityOf(d) === r).sort((a, b) => b.ovr - a.ovr);
      if (!list.length) return '';
      const boxes = PF.BOXES.filter((b) => b.odds[r] > 0).map((b) => b.name.replace(' BOX', '')).join(' · ');
      const owned = list.filter((d) => PF.owns(d.id)).length;
      return '<div class="poolrow" style="--rc:' + RR[r].col + '"><div class="poolhead"><b>' + RR[r].name + '</b><span>' + owned + ' / ' + list.length + ' owned · drops from ' + (boxes || 'no box') + '</span></div>' +
        '<div class="poolchips">' + list.map((d) => '<span class="pchip' + (PF.owns(d.id) ? ' got' : '') + '">' + esc(d.name) + '<i>' + d.ovr + '</i></span>').join('') + '</div></div>';
    }).join('');
  }
  function renderBoxes() {
    const P = PF.data;
    $('boxPity').style.width = (P.pity / PF.PITY) * 100 + '%';
    $('boxPityTxt').textContent = 'LEGENDARY+ GUARANTEED IN ' + (PF.PITY - P.pity) + (PF.PITY - P.pity === 1 ? ' BOX' : ' BOXES');
    $('storeSub').textContent = 'COLLECTION ' + PF.ownedCount() + ' / ' + ISO.PLAYERS.length + ' · Pull random players. Rarer boxes unlock as you complete achievements; duplicates refund credits.';
    renderPool();
    $('boxGrid').innerHTML = PF.BOXES.map((b) => {
      const st = PF.canOpen(b);
      const odds = RANKS.filter((r) => b.odds[r] > 0).map((r) => '<li style="color:' + RR[r].col + '"><span>' + RR[r].name + '</span><b>' + +(b.odds[r] * 100).toFixed(1) + '%</b></li>').join('');
      const btn = st === 'locked' ? '<div class="breq">🔒 COMPLETE “' + esc(achName(b.req)) + '”</div>'
        : '<button class="btn ' + (st === 'ok' ? 'primary' : '') + '" data-open="' + b.id + '"' + (st === 'ok' ? '' : ' disabled') + '>OPEN · ' + b.cost.toLocaleString() + ' CR</button>' +
          '<button class="btn small ' + (PF.canOpen(b, 5) === 'ok' ? 'primary' : '') + '" data-open5="' + b.id + '"' + (PF.canOpen(b, 5) === 'ok' ? '' : ' disabled') + '>OPEN ×5 · ' + (b.cost * 5).toLocaleString() + ' CR</button>';
      return '<div class="boxcard ' + (st === 'locked' ? 'locked' : '') + '" style="--bc:' + b.col + '">' +
        '<div class="boxart"><div class="lid"></div><div class="body"><span>?</span></div></div>' +
        '<h3>' + b.name + '</h3><ul class="odds">' + odds + '</ul>' + btn + '</div>';
    }).join('');
  }

  // the spin: a strip of cards that decelerates onto the prize
  const CARD = 140, VIEW = 980, WIN_AT = 40, N = 48;
  let spin = null;
  function cardHTML(d) {
    const r = ISO.rarityOf(d);
    return '<div class="rcard r-' + r + '"><img src="' + face(d) + '" alt=""><b>' + d.ovr + '</b><span>' + esc(d.short) + '</span><i>' + RR[r].name + '</i></div>';
  }
  function openBox(id) {
    const box = PF.BOXES.find((b) => b.id === id);
    const res = PF.openBox(id);
    if (!res) { ISO.Audio.play('deny'); return; }
    App.updateCredits(); renderBoxes();
    const items = [];
    for (let i = 0; i < N; i++) items.push(PF.filler(box, Math.random));
    items[WIN_AT] = res.def;
    // near miss: park a shiny card right next to the prize
    const shiny = ISO.PLAYERS.filter((d) => ['legend', 'icon'].includes(ISO.rarityOf(d)));
    items[WIN_AT + (Math.random() < 0.5 ? 1 : -1)] = shiny[(Math.random() * shiny.length) | 0];
    $('reelStrip').innerHTML = items.map(cardHTML).join('');
    $('reelStrip').style.transform = 'translateX(0px)';
    $('opening').classList.remove('hidden', 'revealed');
    $('opening').style.setProperty('--rc', RR[res.rarity].col);
    $('openBoxName').textContent = box.name;
    $('openBox').style.setProperty('--bc', box.col);
    $('openStage').className = 'stage-shake';
    const target = WIN_AT * CARD + CARD / 2 - VIEW / 2 + (Math.random() - 0.5) * (CARD - 30);
    spin = { res, box, target, t0: 0, dur: 6.2, last: -1, done: false };
    ISO.Audio.play('shake'); setTimeout(() => ISO.Audio.play('shake'), 300); setTimeout(() => ISO.Audio.play('shake'), 600);
    setTimeout(() => { $('openStage').className = 'stage-spin'; spin.t0 = performance.now(); requestAnimationFrame(tick); }, 950);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 4.2);
  function tick(now) {
    if (!spin || spin.done) return;
    const t = Math.max(0, Math.min(1, (now - spin.t0) / 1000 / spin.dur)), x = spin.target * ease(t);
    $('reelStrip').style.transform = 'translateX(' + -x + 'px)';
    const idx = Math.floor((x + VIEW / 2) / CARD);
    if (idx !== spin.last) { spin.last = idx; ISO.Audio.play('tick', { pitch: 1 - t }); }
    if (t < 1) requestAnimationFrame(tick); else finish();
  }
  function finish() {
    if (!spin || spin.done) return;
    spin.done = true;
    $('reelStrip').style.transform = 'translateX(' + -spin.target + 'px)';
    const { res } = spin, rank = RANKS.indexOf(res.rarity), d = res.def;
    const cards = $('reelStrip').children;
    if (cards[WIN_AT]) cards[WIN_AT].classList.add('won');
    setTimeout(() => {
      $('revealCard').className = 'reveal r-' + res.rarity;
      $('revealCard').innerHTML = '<div class="rv-rar">' + RR[res.rarity].name + (res.forced ? ' · PITY' : '') + '</div>' +
        '<img src="' + face(d) + '" alt=""><div class="rv-ovr">' + d.ovr + '</div><div class="rv-name">' + esc(d.name) + '</div>' +
        '<div class="rv-club">' + d.flag + ' ' + esc(d.club) + '</div>' +
        (res.dup ? '<div class="rv-dup">DUPLICATE · +' + res.refund + ' CR</div>' : '<div class="rv-new">NEW · UNLOCKED</div>');
      $('opening').classList.add('revealed');
      $('openStage').className = rank >= 3 ? 'stage-boom' : '';
      burst(rank);
      ISO.Audio.play('reveal', { rank });
      if (res.dup) setTimeout(() => ISO.Audio.play('coin'), 600);
      const again = $('openAgain'); again.dataset.again = spin.box.id;
      again.disabled = PF.canOpen(spin.box) !== 'ok';
      App.updateCredits(); renderBoxes();
      App.achToasts(res.ach);
    }, 450);
  }
  function burst(rank) {
    const host = $('revealFx'); host.innerHTML = '';
    const n = [10, 18, 30, 60, 90][rank], col = RR[RANKS[rank]].col;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i'), a = Math.random() * Math.PI * 2, r = 120 + Math.random() * (rank >= 3 ? 420 : 220);
      s.style.setProperty('--x', Math.cos(a) * r + 'px'); s.style.setProperty('--y', Math.sin(a) * r + 'px');
      s.style.background = i % 3 ? col : '#ffffff'; s.style.animationDelay = Math.random() * 0.15 + 's';
      host.appendChild(s);
    }
  }
  function openFive(id) {
    const box = PF.BOXES.find((b) => b.id === id);
    if (!box || PF.canOpen(box, 5) !== 'ok') { ISO.Audio.play('deny'); return; }
    const rs = PF.openBoxes(id, 5);
    if (!rs.length) { ISO.Audio.play('deny'); return; }
    App.updateCredits(); renderBoxes();
    let best = 0, refund = 0;
    $('multiGrid').innerHTML = rs.map((r) => {
      best = Math.max(best, RANKS.indexOf(r.rarity)); refund += r.refund;
      const d = r.def;
      return '<div class="rcard won r-' + r.rarity + ' multi-card" style="--rc:' + RR[r.rarity].col + '"><img src="' + face(d) + '" alt=""><b>' + d.ovr + '</b><span>' + esc(d.short) + '</span><i>' + RR[r.rarity].name + '</i>' +
        (r.dup ? '<em class="dup">DUP +' + r.refund + '</em>' : '<em class="new">NEW</em>') + '</div>';
    }).join('');
    $('multiTitle').textContent = box.name + ' ×' + rs.length + (refund ? ' · +' + refund + ' CR FROM DUPLICATES' : '');
    $('multi').classList.remove('hidden');
    ISO.Audio.play('reveal', { rank: best });
    if (refund) setTimeout(() => ISO.Audio.play('coin'), 500);
    rs.forEach((r) => App.achToasts(r.ach));
  }
  function closeOpening() { spin = null; $('opening').classList.add('hidden'); renderBoxes(); }

  // ---------------------------------------------------------------- store
  const store = { tab: 'players', pid: null };
  const cr = (n) => n.toLocaleString() + ' CR';
  const buyBtn = (kind, id, cost, label) => '<button class="btn small ' + (PF.infinite() || PF.data.credits >= cost ? 'primary' : 'poor') +
    '" data-st="' + kind + '" data-id="' + id + '">' + (label || 'BUY') + ' · ' + cr(cost) + '</button>';
  const MOVE_DESC = {
    feint: 'Drop the shoulder one way, go the other.', stepover: 'Feet over the ball to freeze the defender.',
    knock: 'Push the ball ahead and burst after it.', roll: 'Roll the ball sideways out of a tackle.', dragback: 'Pull it back and turn away from pressure.',
    croqueta: 'Snap the ball from foot to foot past a lunge.', roulette: 'Spin 360° over the ball, shielding it all the way.',
    heel: 'Flick it forward off both heels and burst clear.', nutmeg: 'Slip it through their legs and run round.',
    elastico: 'Out, then in, in one touch. Sells the biggest fake.', rainbow: 'Flick the ball over the defender’s head.',
  };
  function chordOf(id) {
    const IN = ISO.Input, G = ISO.Game, keys = (m) => ['j', 'k', 'l'].filter((_, i) => m & (1 << i)).map((k) => '<kbd>' + esc(IN.keyLabel(k)) + '</kbd>').join(' + ');
    for (const m in G.CHORD) if (G.CHORD[m] === id) return keys(+m);
    for (const m in G.CHORD_SPRINT) if (G.CHORD_SPRINT[m] === id) return '<kbd>' + esc(IN.keyLabel('sprint')) + '</kbd> + ' + keys(+m);
    if (id === 'roll') return keys(4) + ' + sideways';
    return '';
  }

  function storePlayers() {
    const mine = ISO.PLAYERS.filter((d) => PF.owns(d.id)).map((d) => [d, PF.outfit(d).ovr]).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).map((x) => x[0]);
    if (!mine.some((d) => d.id === store.pid)) store.pid = (mine.find((d) => d.id === App.pick[0].id) || mine[0]).id;
    const base = ISO.playerById(store.pid), prime = PF.isPrime(base.id), cur = PF.outfit(base), pr = ISO.primeOf(base), rar = ISO.rarityOf(base);
    const roster = mine.map((d) => {
      const o = PF.outfit(d);
      return '<button class="st-pl r-' + ISO.rarityOf(d) + (d.id === store.pid ? ' on' : '') + (o.prime ? ' prime' : '') + '" data-st="pl" data-id="' + d.id + '">' +
        '<img src="' + face(o) + '" alt=""><span>' + esc(d.short) + (o.prime ? '<small>★ PRIME</small>' : '') + '</span><b>' + o.ovr + '</b></button>';
    }).join('');
    const ups = ISO.ATTRS.filter(([k]) => pr.attr[k] > base.attr[k]).length;
    const primeBox = prime
      ? '<div class="st-prime on"><div class="pk">★ PRIME ACTIVE</div><div class="pv"><b>' + pr.ovr + '</b> OVR</div><p>Every attribute boosted. Gold boots on. ' + '★'.repeat(ISO.stars(pr.attr.skl)) + ' skill moves.</p></div>'
      : '<div class="st-prime"><div class="pk">PRIME UPGRADE</div><div class="pv">' + base.ovr + ' <i>›</i> <b>' + pr.ovr + '</b> OVR</div>' +
        '<p>+' + ISO.PRIME.boost + ' to ' + ups + ' attributes, permanently' + (ISO.stars(pr.attr.skl) > ISO.stars(base.attr.skl) ? ', ' + ISO.stars(pr.attr.skl) + '★ skill moves' : '') + ' and gold boots.</p>' +
        buyBtn('prime', base.id, ISO.primeCost(base), 'GO PRIME') + '</div>';
    const skins = ISO.SKINS.map((sk) => {
      const own = PF.ownsSkin(base.id, sk.id), eq = PF.skinOf(base.id) === sk.id;
      const act = eq ? '<span class="st-tag on">✓ EQUIPPED</span>' : own ? '<button class="btn small" data-st="equip" data-id="' + sk.id + '">EQUIP</button>' : buyBtn('skin', sk.id, sk.cost);
      return '<div class="st-card' + (eq ? ' on' : '') + '"><img src="' + face(ISO.outfit(base, prime, sk.id)) + '" alt=""><h4>' + sk.name + '</h4><p>' + sk.desc(base) + '</p>' + act + '</div>';
    }).join('');
    return '<div class="st-players"><div class="st-roster" id="stRoster">' + roster + '</div><div class="st-detail">' +
      '<div class="st-hero r-' + rar + '"><img src="' + face(cur) + '" alt=""><div class="st-id"><div class="st-rar">' + RR[rar].name + '</div><h3>' + esc(base.name) + '</h3>' +
      '<div class="st-meta">' + base.flag + ' ' + esc(base.club) + '</div><div class="st-attrs">' +
      [['pac', 'PAC'], ['dri', 'DRI'], ['fin', 'FIN'], ['sho', 'SHO'], ['skl', 'SKL'], ['str', 'STR']].map(([k, l]) => '<span>' + l + ' <b>' + cur.attr[k] + '</b></span>').join('') + '</div></div>' + primeBox + '</div>' +
      '<div class="st-sub">SKINS FOR ' + esc(base.short) + '</div><div class="st-skins">' + skins + '</div></div></div>';
  }
  function storeMoves() {
    const SK = ISO.Game.SKILLS, mine = ISO.PLAYERS.filter((d) => PF.owns(d.id)).map((d) => ISO.stars(PF.outfit(d).attr.skl));
    const ids = Object.keys(ISO.MOVE_COST).sort((a, b) => ISO.MOVE_COST[a] - ISO.MOVE_COST[b] || SK[a].star - SK[b].star);
    return '<div class="st-moves">' + ids.map((id) => {
      const m = SK[id], cost = ISO.MOVE_COST[id], own = PF.hasMove(id), can = mine.filter((s) => s >= m.star).length;
      const act = !cost ? '<span class="st-tag on">FREE</span>' : own ? '<span class="st-tag on">✓ UNLOCKED</span>' : buyBtn('move', id, cost, 'UNLOCK');
      return '<div class="st-card move' + (own ? ' on' : '') + '"><div class="st-stars">' + '★'.repeat(m.star) + '<i>' + '★'.repeat(5 - m.star) + '</i></div><h4>' + esc(m.name.toUpperCase()) + '</h4>' +
        '<div class="st-chord">' + chordOf(id) + '</div><p>' + MOVE_DESC[id] + '</p>' +
        '<small class="' + (can ? '' : 'warn') + '">' + (can ? can + ' of your players can do it' : 'None of your players has ' + m.star + '★ skills yet') + '</small>' + act + '</div>';
    }).join('') + '</div><p class="note center">Every move is unlocked, but your player needs enough skill stars to pull it off. Until then the input does a simpler move.</p>';
  }
  const mapImg = new Map();
  function storeMaps() {
    const card = (m) => {
      if (!mapImg.has(m.id)) mapImg.set(m.id, ISO.Render.thumb(m.id).toDataURL());
      const own = PF.ownsMap(m.id), on = PF.data.map === m.id;
      const act = on ? '<span class="st-tag on">✓ SELECTED</span>' : own ? '<button class="btn small" data-st="setmap" data-id="' + m.id + '">PLAY HERE</button>' : buyBtn('map', m.id, m.cost);
      return '<div class="st-card map' + (on ? ' on' : '') + '"><img src="' + mapImg.get(m.id) + '" alt=""><h4>' + m.name + (m.walls ? ' <small class="walltag">WALLS</small>' : '') + '</h4><p>' + m.desc + '</p>' + act + '</div>';
    };
    const group = (title, list) => '<h3 class="st-cat">' + title + '</h3><div class="st-maps">' + list.map(card).join('') + '</div>';
    return group('PITCHES', ISO.MAPS.filter((m) => !m.cat)) + group('FUTSAL · WALLED COURTS (the ball bounces off the walls · offline modes)', ISO.MAPS.filter((m) => m.cat === 'futsal')) +
      '<p class="note center">Maps change the look of every match — Quick Match, MyCareer and the Testing Arena. Pitches play the same everywhere; futsal courts add walls the ball bounces off.</p>';
  }
  const ballImg = new Map();
  function ballPic(id) {
    if (!ballImg.has(id)) { const cv = document.createElement('canvas'), P = ISO.Sprites.BALL_PX; cv.width = cv.height = 96; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(ISO.Sprites.ball(id), 2 * P, 0, P, P, 0, 0, 96, 96); ballImg.set(id, cv.toDataURL()); }
    return ballImg.get(id);
  }
  function storeBalls() {
    return '<div class="st-maps st-balls">' + ISO.BALLS.map((b) => {
      const own = PF.ownsBall(b.id), on = PF.data.ball === b.id;
      const act = on ? '<span class="st-tag on">✓ EQUIPPED</span>' : own ? '<button class="btn small" data-st="setball" data-id="' + b.id + '">EQUIP</button>' : buyBtn('ball', b.id, b.cost);
      return '<div class="st-card ball' + (on ? ' on' : '') + '"><div class="ballpic"><img src="' + ballPic(b.id) + '" alt=""></div><h4>' + b.name + '</h4><p>' + b.desc + '</p>' + act + '</div>';
    }).join('') + '</div><p class="note center">Ball skins are cosmetic and show on your screen in every mode.</p>';
  }
  function renderStore() {
    const ro = $('stRoster'), top = ro ? ro.scrollTop : 0, T = store.tab;
    document.querySelectorAll('#storeTabs .segb').forEach((b) => b.classList.toggle('on', b.dataset.id === T));
    const own = T === 'players' || T === 'moves' || T === 'maps' || T === 'balls';
    $('storeBody').classList.toggle('hidden', !own);
    $('storeBoxes').classList.toggle('hidden', T !== 'boxes');
    $('storeAch').classList.toggle('hidden', T !== 'ach');
    if (own) $('storeBody').innerHTML = T === 'moves' ? storeMoves() : T === 'maps' ? storeMaps() : T === 'balls' ? storeBalls() : storePlayers();
    else $('storeBody').innerHTML = '';
    $('storeSub').textContent = {
      boxes: 'Pull random players. Rarer boxes unlock as you complete achievements; duplicates refund credits.',
      players: 'Skins and Prime upgrades for the players you own.',
      moves: 'Unlock skill moves for your matches.',
      maps: 'Pitches to play on.',
      balls: 'Ball skins: spend credits to play with a different ball.',
      ach: '',
    }[T];
    if (T === 'boxes') renderBoxes();      // these two write their own subtitle
    if (T === 'ach') renderAch();
    if ($('stRoster')) $('stRoster').scrollTop = top;
    updateBadge();
  }
  function updateBadge() {
    const ready = PF.ACH.some((a) => !PF.data.claimed[a.id] && PF.statOf(a) >= a.goal);
    $('achBadge').classList.toggle('hidden', !ready);
    $('achDot').classList.toggle('hidden', !ready);
  }
  // ---------------------------------------------------------------- play hub
  function renderDrills() {
    for (const k of ['penalty', 'target', 'chip', 'freekick', 'oneonone', 'longshot', 'finesse', 'power']) {
      const d = PF.data.drills[k], max = ISO.DRILLS[k].max;
      $('drillBest-' + k).textContent = d ? 'BEST ' + d.best + ' / ' + max + (k === 'penalty' ? ' SCORED' : '') + ' · ' + d.plays + ' PLAYED' : 'NOT PLAYED YET';
    }
  }
  function renderPlay() {
    const C = PF.data.career, opp = PF.careerOpponent();
    $('playCareer').textContent = opp ? 'STAGE ' + (C.stage + 1) + ' / ' + C.ladder.length + ' · NEXT: ' + opp.short : 'CAREER COMPLETE';
    $('playQuick').textContent = PF.ownedCount() + ' / ' + ISO.PLAYERS.length + ' PLAYERS OWNED';
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-st]');
    if (!t) return;
    ISO.Audio.init();
    const k = t.dataset.st, id = t.dataset.id;
    if (k === 'tab') { store.tab = id; ISO.Audio.play('ui'); }
    else if (k === 'pl') { store.pid = id; ISO.Audio.play('ui'); }
    else if (k === 'equip') { PF.equipSkin(store.pid, id); ISO.Audio.play('ui'); }
    else if (k === 'setball') { PF.equipBall(id); ISO.Render.setBall(id); ISO.Audio.play('ui'); }
    else if (k === 'setmap') { PF.setMap(id); ISO.Render.setMap(id); ISO.Audio.play('ui'); }
    else {
      const d = ISO.playerById(store.pid);
      if (k === 'prime' && (PF.infinite() || PF.data.credits >= ISO.primeCost(d)) &&
        !window.confirm('Upgrade ' + d.name + ' to Prime for ' + cr(ISO.primeCost(d)) + '? This is permanent.')) return;
      const res = k === 'skin' ? PF.buySkin(store.pid, id) : k === 'prime' ? PF.buyPrime(store.pid) : k === 'move' ? PF.buyMove(id) : k === 'ball' ? PF.buyBall(id) : PF.buyMap(id);
      if (res === 'ok') {
        if (k === 'prime') { ISO.Audio.play('reveal', { rank: 4 }); App.toast('★ PRIME ' + d.short, 'Now ' + ISO.primeOf(d).ovr + ' OVR — every attribute boosted', '#ffcf4d'); }
        else {
          ISO.Audio.play('coin');
          if (k === 'skin') App.toast(ISO.skinById(id).name + ' SKIN', 'Bought and equipped on ' + d.short, '#35e08a');
          else if (k === 'move') App.toast(ISO.Game.SKILLS[id].name.toUpperCase() + ' UNLOCKED', 'Use it in your next match', '#35e08a');
          else if (k === 'ball') { ISO.Render.setBall(id); App.toast(ISO.ballById(id).name + ' BALL', 'Bought and equipped', '#35e08a'); }
          else { ISO.Render.setMap(id); App.toast(ISO.mapById(id).name, 'Map bought and selected', '#35e08a'); }
        }
        App.achToasts(PF.takeAch());
      } else {
        ISO.Audio.play('deny');
        if (res === 'poor') { t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); App.toast('NOT ENOUGH CREDITS', 'Play matches and claim achievements to earn more', '#f1735f'); return; }
      }
    }
    App.updateCredits(); renderStore();
  });

  // ---------------------------------------------------------------- main menu: stats, a rotating featured player, a tip ticker
  const TIPS = ['Hold the shot key longer for a harder strike, but hold too long and it sails over the bar.', 'A skill move at the right moment can break a defender\'s ankles.', 'Futsal courts have walls: the ball bounces back into play.',
    'Open 5 boxes at once from the Box Draw tab.', 'Achievements now have levels. Some hand you a player.', 'Try the free-kick and one-on-one drills to sharpen your finishing.', 'Rematches in MyCareer get harder: bring upgraded stats.',
    'Switch to the Cinematic camera in Settings to play from the replay angle.', 'Ball skins are in the Store: pick one that matches your style.', 'Keeper dives early? Chip it over him.'];
  let menuTimer = null, featI = 0, tipI = 0;
  function menuFeature() {
    const pool = ISO.PLAYERS.filter((d) => PF.owns(d.id)), list = pool.length ? pool : ISO.PLAYERS;
    const d = list[(Math.random() * list.length) | 0], r = ISO.rarityOf(d), el = $('menuFeature');
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
    el.style.setProperty('--rc', RR[r].col); drawTo('mfFace', d, 200);
    $('mfName').textContent = d.name; $('mfMeta').textContent = d.flag + ' ' + d.club + ' · OVR ' + d.ovr; $('mfRar').textContent = RR[r].name;
  }
  function menuLive(on) {
    clearInterval(menuTimer); menuTimer = null;
    $('menuFeature').classList.toggle('hidden', !on); $('menuTip').classList.toggle('hidden', !on);
    if (!on) return;
    const C = PF.data.career, done = PF.ACH.filter((a) => PF.statOf(a) >= a.goal).length, ready = PF.ACH.some((a) => !PF.data.claimed[a.id] && PF.statOf(a) >= a.goal);
    $('menuStats').innerHTML = [['CREDITS', PF.infinite() ? '∞' : PF.data.credits.toLocaleString()], ['PLAYERS', PF.ownedCount() + ' / ' + ISO.PLAYERS.length], ['CAREER', 'STAGE ' + Math.min(C.stage + 1, C.ladder.length) + ' / ' + C.ladder.length], ['ACHIEVEMENTS', done + ' / ' + PF.ACH.length + (ready ? ' · CLAIM!' : '')]]
      .map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('');
    menuFeature(); tipI = (Math.random() * TIPS.length) | 0; $('menuTip').textContent = 'TIP · ' + TIPS[tipI];
    menuTimer = setInterval(() => { featI++; menuFeature(); if (featI % 2 === 0) { tipI = (tipI + 1) % TIPS.length; $('menuTip').textContent = 'TIP · ' + TIPS[tipI]; } }, 4500);
  }
  // ---------------------------------------------------------------- achievements
  function renderAch() {
    const P = PF.data;
    const gates = {}; for (const b of PF.BOXES) gates[b.req] = b.name;
    let done = 0;
    // one row per family: the level you are working on (the first one not yet claimed), with the levels laid out as pips
    const rows = [];
    for (const F of PF.FAMILIES) {
      const tiers = PF.ACH.filter((a) => a.fam === F.fam);
      done += tiers.filter((a) => PF.statOf(a) >= a.goal).length;
      const cur = tiers.find((a) => !P.claimed[a.id]) || tiers[tiers.length - 1];
      rows.push([F, tiers, cur]);
    }
    rows.sort((x, y) => (+!!(PF.statOf(y[2]) >= y[2].goal && !P.claimed[y[2].id])) - (+!!(PF.statOf(x[2]) >= x[2].goal && !P.claimed[x[2].id])));      // ready-to-claim first
    $('achList').innerHTML = rows.map(([F, tiers, a]) => {
      const v = Math.min(PF.statOf(a), a.goal), ok = v >= a.goal, cl = !!P.claimed[a.id], maxed = cl && a.tier === a.tiers;
      const pd = a.player && ISO.playerById(a.player), plus = pd ? ' + ' + pd.name.toUpperCase() : '';
      const act = maxed ? '<span class="claimed">✓ MAXED</span>' : ok ? '<button class="btn small primary" data-claim="' + a.id + '">CLAIM +' + a.reward + plus + '</button>' : '<span class="rew">+' + a.reward + ' CR' + plus + '</span>';
      const pips = tiers.map((t) => '<i class="' + (P.claimed[t.id] ? 'on' : t === a ? 'cur' : '') + '"></i>').join('');
      return '<div class="achrow' + (ok ? ' done' : '') + (ok && !cl ? ' ready' : '') + '"><div class="achtxt"><b>' + esc(a.name) + ' <small class="lvl">LEVEL ' + a.tier + ' / ' + a.tiers + '</small></b><span>' + esc(a.desc) + '</span>' +
        (gates[a.id] ? '<em>UNLOCKS ' + gates[a.id] + '</em>' : '') + '<div class="pips">' + pips + '</div></div>' +
        '<div class="achprog"><span class="bar"><i style="width:' + (v / a.goal) * 100 + '%"></i></span><small>' + v + ' / ' + a.goal + '</small></div>' + act + '</div>';
    }).join('');
    $('storeSub').textContent = done + ' / ' + PF.ACH.length + ' LEVELS COMPLETE · Achievements level up, pay out credits, unlock box tiers and some hand you a player.';
  }

  // ---------------------------------------------------------------- keyboard
  let rebind = null;       // { a: action, i: slot } while waiting for a key
  function renderKeys() {
    const IN = ISO.Input, B = IN.bindings;
    const GROUPS = [['MOVEMENT', ['up', 'down', 'left', 'right', 'sprint']], ['ATTACK', ['shoot', 'finesse', 'chip', 'lob', 'pass', 'j', 'k', 'l']], ['DEFENSE', ['jockey', 'tackle', 'slide', 'shoulder', 'focus']]];
    const nm = Object.fromEntries(IN.ACTIONS);
    $('keyBinds').innerHTML = GROUPS.map(([g, list]) => '<div class="kb-group">' + g + '</div>' + list.map((a) => [a, nm[a]]).map(([a, name]) => '<div class="kb-row"><span>' + name + '</span>' + [0, 1].map((i) => {
      const wait = rebind && rebind.a === a && rebind.i === i;
      return '<button class="kb' + (wait ? ' wait' : '') + (B[a][i] ? '' : ' empty') + '" data-bind="' + a + '" data-slot="' + i + '">' + (wait ? (combo.length ? esc(combo.map(IN.label).join('+')) + '+…' : 'PRESS KEYS…') : esc(IN.label(B[a][i]))) + '</button>';
    }).join('') + '</div>').join('')).join('');
  }
  // the controls guide, store chords and match hint all show whatever keys are bound now
  function keyLabels() {
    const IN = ISO.Input, B = IN.bindings, k = (code) => '<kbd>' + esc(IN.label(code)) + '</kbd>';
    const both = (a) => B[a].filter(Boolean).map(k).join(' / ') || '<i>unbound</i>';
    const tbl = (rows) => '<tr><th>Action</th><th>Keys</th></tr>' + rows.map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('');
    $('keysMove').innerHTML = tbl([['Up', both('up')], ['Down', both('down')], ['Left', both('left')], ['Right', both('right')], ['Sprint', both('sprint')], ['Aim', 'Mouse (optional, Settings)'], ['Pause', '<kbd>Esc</kbd>']]);
    $('keysAtk').innerHTML = tbl([['Shoot', both('shoot')], ['Finesse shot', both('finesse')], ['Power shot', both('chip')], ['Chip shot', both('lob')], ['Pass (2v2)', both('pass')], ['Skill keys', ['j', 'k', 'l'].map((a) => k(B[a].find(Boolean))).join(' ')]]);
    $('keysDef').innerHTML = tbl([['Jockey · Shield', both('jockey')], ['Tackle', both('tackle')], ['Slide tackle', both('slide')], ['Shoulder barge', both('shoulder')], ['Focus stance', both('focus')]]);
    document.querySelectorAll('kbd[data-k]').forEach((el) => { el.textContent = IN.keyLabel(el.dataset.k); });
    App.setMouse(PF.data.settings.mouseAim);       // refreshes the match hint
  }
  function saveKeys(B) { ISO.Input.setBindings(B); PF.setSetting('keys', B); keyLabels(); }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-bind]');
    if (t) { ISO.Audio.init(); ISO.Audio.play('ui'); rebind = { a: t.dataset.bind, i: +t.dataset.slot }; combo = []; renderKeys(); }
  });
  // capture phase on window: runs before the game's own key handlers, so the pressed key only rebinds.
  // A binding is one key, or a combination: hold the first key(s) and press the last (e.g. Shift then Q → Shift+Q).
  // Modifier keys alone (Shift, Ctrl, Alt) are bound when released without a partner.
  const MODS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight']);
  let combo = [];
  function finishRebind(code) {
    const { a, i } = rebind; rebind = null; combo = [];
    const IN = ISO.Input, B = IN.bindings;
    if (code === null) B[a][i] = null;
    else {
      const old = B[a][i];
      for (const b in B) for (let j = 0; j < 2; j++) if (B[b][j] === code && !(b === a && j === i) && IN.clash(a, b)) B[b][j] = b === a ? null : old;      // swap
      B[a][i] = code;
      ISO.Audio.play('coin');
    }
    saveKeys(B); renderKeys();
  }
  window.addEventListener('keydown', (e) => {
    if (!rebind) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    const code = e.code;
    if (code === 'Escape') { rebind = null; combo = []; renderKeys(); return; }
    if ((code === 'Backspace' || code === 'Delete') && !combo.length) return finishRebind(null);
    if (!combo.includes(code)) combo.push(code);
    if (!MODS.has(code) || combo.length >= 3) finishRebind(combo.slice(0, 3).join('+')); else renderKeys();
  }, true);
  // a mouse button can be bound too (alone, or with the modifier keys already held)
  window.addEventListener('mousedown', (e) => {
    if (!rebind) return;
    e.preventDefault(); e.stopImmediatePropagation();
    combo.push('Mouse' + e.button); finishRebind(combo.slice(0, 3).join('+'));
  }, true);
  window.addEventListener('contextmenu', (e) => { if (rebind) e.preventDefault(); }, true);
  window.addEventListener('keyup', (e) => {
    if (!rebind || !combo.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (combo.includes(e.code)) finishRebind(combo.join('+'));      // only modifiers were pressed: bind them
  }, true);

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const ST = PF.data.settings, A = ST.admin;
    $('setVolume').value = Math.round(ST.volume * 100); $('setVolumeVal').textContent = Math.round(ST.volume * 100) + '%';
    $('setSound').checked = !ST.muted; $('setCrowd').checked = ST.crowd;
    $('setDiff').value = ST.diff || 'normal';
    $('setCamera').value = ST.camera || 'classic';
    $('setMouse').checked = ST.mouseAim; $('setReticle').checked = ST.reticle; $('setHint').checked = ST.hint;
    $('adminLogin').classList.toggle('hidden', A.unlocked); $('adminPanel').classList.toggle('hidden', !A.unlocked);
    document.querySelectorAll('[data-admin]').forEach((el) => { el.checked = !!A[el.dataset.admin]; });
    rebind = null; renderKeys();
  }
  function onSetting(e) {
    const t = e.target;
    if (!t.closest || !t.closest('#settings')) return;
    const ST = PF.data.settings;
    if (t.id === 'setVolume') { PF.setSetting('volume', t.value / 100); ISO.Audio.setVolume(t.value / 100); $('setVolumeVal').textContent = t.value + '%'; }
    else if (t.id === 'setSound') { PF.setSetting('muted', !t.checked); ISO.Audio.setMuted(!t.checked); }
    else if (t.id === 'setCrowd') { PF.setSetting('crowd', t.checked); ISO.Audio.setCrowd(t.checked); }
    else if (t.id === 'setCamera') PF.setSetting('camera', t.value);
    else if (t.id === 'setDiff') { PF.setSetting('diff', t.value); App.diff = t.value; }
    else if (t.id === 'setMouse') App.setMouse(t.checked);
    else if (t.id === 'setReticle') PF.setSetting('reticle', t.checked);
    else if (t.id === 'setHint') PF.setSetting('hint', t.checked);
    else if (t.dataset.admin) { PF.setAdmin(t.dataset.admin, t.checked); App.updateCredits(); App.toast('ADMIN', t.closest('.set-row').textContent.trim() + (t.checked ? ' — ON' : ' — OFF'), '#f1735f'); }
    void ST;
  }
  document.addEventListener('input', onSetting);
  document.addEventListener('change', onSetting);
  document.addEventListener('keydown', (e) => { if (e.code === 'Enter' && document.activeElement === $('adminPw')) document.querySelector('[data-meta=admin-login]').click(); });

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-up],[data-open],[data-open5],[data-claim],[data-again],[data-meta]');
    if (!t) return;
    ISO.Audio.init();
    if (t.dataset.up) { if (PF.upgrade(t.dataset.up)) { ISO.Audio.play('coin'); renderCareer(); } else ISO.Audio.play('deny'); }
    else if (t.dataset.open5) openFive(t.dataset.open5);
    else if (t.dataset.open) openBox(t.dataset.open);
    else if (t.dataset.again) { if (!t.disabled) openBox(t.dataset.again); }
    else if (t.dataset.claim) { const cr = PF.claim(t.dataset.claim); if (cr) { ISO.Audio.play('coin'); const ci = PF.claimInfo(); App.toast('+' + cr + ' CREDITS', ci.player ? 'PLAYER UNLOCKED: ' + ci.player.name : ci.dup ? 'Player already owned: +' + ci.dup + ' CR refund' : 'Achievement reward claimed', '#ffcf4d'); App.updateCredits(); renderAch(); updateBadge(); } }
    else if (t.dataset.meta === 'look-prev') { PF.cycleLook(-1); renderCareer(); }
    else if (t.dataset.meta === 'look-next') { PF.cycleLook(1); renderCareer(); }
    else if (t.dataset.meta === 'kit-prev') { PF.cycleKit(-1); renderCareer(); }
    else if (t.dataset.meta === 'kit-next') { PF.cycleKit(1); renderCareer(); }
    else if (t.dataset.meta === 'career-reset') { if (window.confirm('Start a new career? Your stats and ladder progress reset (credits and players are kept).')) { PF.resetCareer(); renderCareer(); } }
    else if (t.dataset.meta === 'admin-login') {
      const ok = PF.adminLogin($('adminPw').value); $('adminPw').value = '';
      $('adminErr').classList.toggle('hidden', ok); ISO.Audio.play(ok ? 'coin' : 'deny');
      if (ok) App.toast('ADMIN UNLOCKED', 'Developer switches are available', '#f1735f');
      renderSettings();
    }
    else if (t.dataset.meta === 'keys-reset') { saveKeys(null); PF.setSetting('keys', null); renderKeys(); App.toast('CONTROLS RESET', 'Default keys restored', '#35e08a'); }
    else if (t.dataset.meta === 'admin-max') { PF.maxAll(); ISO.Audio.play('reveal', { rank: 4 }); App.updateCredits(); App.toast('MAXED OUT', 'Every character, Prime, skin and ball skin unlocked', '#ffcf4d'); }
    else if (t.dataset.meta === 'admin-logout') { PF.adminLogout(); App.updateCredits(); renderSettings(); }
    else if (t.dataset.meta === 'reset-all') { if (window.confirm('Reset ALL progress?\n\nCredits, unlocked players, skins, Prime upgrades, skill moves, maps, achievements and your MyCareer will be wiped. Settings and key bindings are kept.\n\nThis cannot be undone.')) { PF.reset(); ISO.Render.setMap(PF.data.map); App.updateCredits(); App.toast('PROGRESS RESET', 'Fresh start — everything is back to day one', '#f1735f'); updateBadge(); renderSettings(); } }
    else if (t.dataset.meta === 'close-multi') { $('multi').classList.add('hidden'); renderBoxes(); }
    else if (t.dataset.meta === 'skip') { if (spin && !spin.done) finish(); }
    else if (t.dataset.meta === 'close-open') { if (!spin || spin.done) closeOpening(); }
  });

  keyLabels();
  ISO.Meta = {
    onShow(screen) {
      menuLive(screen === 'menu');
      if (screen === 'career') renderCareer();
      else if (screen === 'store') renderStore();
      else if (screen === 'play') renderPlay();
      else if (screen === 'drills') renderDrills();
      else if (screen === 'settings') renderSettings();
      else if (screen === 'online') ISO.Online && ISO.Online.onShow();
      else $('opening').classList.add('hidden');
      updateBadge();
    },
    storeTab(t) { store.tab = t; },
    keyLabels,
  };
})();
