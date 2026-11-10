/* ISO FOOTBALL — MyCareer, Box Draw and Achievements screens. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, App = ISO.App;
  const $ = (id) => document.getElementById(id);
  const RR = ISO.RARITY, RANKS = ['common', 'rare', 'epic', 'legend', 'icon'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const imgCache = new Map();
  function face(d, kit) {
    const key = d.id + (kit ? kit.a : '');
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
        '<span class="lname">' + esc(d.name) + '<small>' + esc(d.club) + '</small></span><span class="lovr">' + d.ovr + '</span>' +
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
      row.querySelector('.t-base').style.width = pct(C.base[k]);
      row.querySelector('.t-val').style.width = pct(v);
      row.querySelector('.t-reach').style.width = pct(PF.reach(k));
      row.querySelector('b').textContent = v;
      row.querySelector('.ccost').textContent = v >= 99 ? 'MAX' : PF.upgradeCost(v) + ' PT';
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
  function renderBoxes() {
    const P = PF.data;
    $('boxPity').style.width = (P.pity / PF.PITY) * 100 + '%';
    $('boxPityTxt').textContent = 'LEGENDARY+ GUARANTEED IN ' + (PF.PITY - P.pity) + (PF.PITY - P.pity === 1 ? ' BOX' : ' BOXES');
    $('boxCollection').textContent = 'COLLECTION ' + PF.ownedCount() + ' / ' + ISO.PLAYERS.length;
    $('boxGrid').innerHTML = PF.BOXES.map((b) => {
      const st = PF.canOpen(b);
      const odds = RANKS.filter((r) => b.odds[r] > 0).map((r) => '<li style="color:' + RR[r].col + '"><span>' + RR[r].name + '</span><b>' + +(b.odds[r] * 100).toFixed(1) + '%</b></li>').join('');
      const btn = st === 'locked' ? '<div class="breq">🔒 COMPLETE “' + esc(achName(b.req)) + '”</div>'
        : '<button class="btn ' + (st === 'ok' ? 'primary' : '') + '" data-open="' + b.id + '"' + (st === 'ok' ? '' : ' disabled') + '>OPEN · ' + b.cost.toLocaleString() + ' CR</button>';
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
  function closeOpening() { spin = null; $('opening').classList.add('hidden'); renderBoxes(); }

  // ---------------------------------------------------------------- achievements
  function renderAch() {
    const P = PF.data;
    const gates = {}; for (const b of PF.BOXES) gates[b.req] = b.name;
    let done = 0;
    $('achList').innerHTML = PF.ACH.map((a) => {
      const v = Math.min(PF.statOf(a), a.goal), ok = v >= a.goal, cl = !!P.claimed[a.id];
      if (ok) done++;
      const act = cl ? '<span class="claimed">✓ CLAIMED</span>'
        : ok ? '<button class="btn small primary" data-claim="' + a.id + '">CLAIM +' + a.reward + '</button>'
          : '<span class="rew">+' + a.reward + ' CR</span>';
      return '<div class="achrow' + (ok ? ' done' : '') + (ok && !cl ? ' ready' : '') + '"><div class="achtxt"><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span>' +
        (gates[a.id] ? '<em>UNLOCKS ' + gates[a.id] + '</em>' : '') + '</div>' +
        '<div class="achprog"><span class="bar"><i style="width:' + (v / a.goal) * 100 + '%"></i></span><small>' + v + ' / ' + a.goal + '</small></div>' + act + '</div>';
    }).join('');
    $('achSub').textContent = done + ' / ' + PF.ACH.length + ' COMPLETE';
  }

  // ---------------------------------------------------------------- settings
  function renderSettings() {
    const ST = PF.data.settings, A = ST.admin;
    $('setVolume').value = Math.round(ST.volume * 100); $('setVolumeVal').textContent = Math.round(ST.volume * 100) + '%';
    $('setSound').checked = !ST.muted; $('setCrowd').checked = ST.crowd;
    $('setSpeed').value = Math.round(ST.speed * 100); $('setSpeedVal').textContent = Math.round(ST.speed * 100) + '%';
    $('setDiff').value = ST.diff || 'normal';
    $('setMouse').checked = ST.mouseAim; $('setReticle').checked = ST.reticle; $('setHint').checked = ST.hint;
    $('adminLogin').classList.toggle('hidden', A.unlocked); $('adminPanel').classList.toggle('hidden', !A.unlocked);
    document.querySelectorAll('[data-admin]').forEach((el) => { el.checked = !!A[el.dataset.admin]; });
  }
  function onSetting(e) {
    const t = e.target;
    if (!t.closest || !t.closest('#settings')) return;
    const ST = PF.data.settings;
    if (t.id === 'setVolume') { PF.setSetting('volume', t.value / 100); ISO.Audio.setVolume(t.value / 100); $('setVolumeVal').textContent = t.value + '%'; }
    else if (t.id === 'setSound') { PF.setSetting('muted', !t.checked); ISO.Audio.setMuted(!t.checked); }
    else if (t.id === 'setCrowd') { PF.setSetting('crowd', t.checked); ISO.Audio.setCrowd(t.checked); }
    else if (t.id === 'setSpeed') { PF.setSetting('speed', t.value / 100); $('setSpeedVal').textContent = t.value + '%'; }
    else if (t.id === 'setDiff') { PF.setSetting('diff', t.value); App.diff = t.value; }
    else if (t.id === 'setMouse') PF.setSetting('mouseAim', t.checked);
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
    const t = e.target.closest('[data-up],[data-open],[data-claim],[data-again],[data-meta]');
    if (!t) return;
    ISO.Audio.init();
    if (t.dataset.up) { if (PF.upgrade(t.dataset.up)) { ISO.Audio.play('coin'); renderCareer(); } else ISO.Audio.play('deny'); }
    else if (t.dataset.open) openBox(t.dataset.open);
    else if (t.dataset.again) { if (!t.disabled) openBox(t.dataset.again); }
    else if (t.dataset.claim) { const cr = PF.claim(t.dataset.claim); if (cr) { ISO.Audio.play('coin'); App.toast('+' + cr + ' CREDITS', 'Achievement reward claimed', '#ffcf4d'); App.updateCredits(); renderAch(); } }
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
    else if (t.dataset.meta === 'admin-logout') { PF.adminLogout(); App.updateCredits(); renderSettings(); }
    else if (t.dataset.meta === 'reset-all') { if (window.confirm('Reset ALL progress? Credits, unlocked players, achievements and your career will be wiped. Settings are kept.')) { PF.reset(); App.updateCredits(); App.toast('PROGRESS RESET', 'Fresh start', '#f1735f'); } }
    else if (t.dataset.meta === 'skip') { if (spin && !spin.done) finish(); }
    else if (t.dataset.meta === 'close-open') { if (!spin || spin.done) closeOpening(); }
  });

  ISO.Meta = {
    onShow(screen) {
      if (screen === 'career') renderCareer();
      else if (screen === 'boxes') renderBoxes();
      else if (screen === 'ach') renderAch();
      else if (screen === 'settings') renderSettings();
      else $('opening').classList.add('hidden');
      const ready = PF.ACH.some((a) => !PF.data.claimed[a.id] && PF.statOf(a) >= a.goal);
      $('achBadge').classList.toggle('hidden', !ready);
    },
  };
})();
