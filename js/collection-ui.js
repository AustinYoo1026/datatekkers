/* ISO FOOTBALL — collection screens (roadmap 5.6): the COLLECTION tab of the store (cards grid, favourites, sets with their credit claim), the player card modal
   and the side-by-side comparison. The rules are js/collection.js, the saved state js/profile.js. Opened from: the store COLLECTION tab, the PLAYER CARD button of the
   store's players tab, and a right-click (or shift-click) on a card of the player select grid / store roster. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, CO = ISO.Collection;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cr = (n) => n.toLocaleString();
  const S = { view: 'cards', filter: 'all', cmp: [], card: null };
  const faces = new Map();
  function face(d) { if (!faces.has(d.id)) faces.set(d.id, ISO.Sprites.portrait(d, 64, d.kit).toDataURL()); return faces.get(d.id); }
  const stars = (n, of) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));
  const barCol = (v) => (v >= 90 ? '#35e08a' : v >= 80 ? '#8fdc5a' : v >= 70 ? '#e9c46a' : v >= 55 ? '#f4a261' : '#e76f51');
  const owned = (id) => PF.data.owned.includes(id);

  // ---- the store's COLLECTION tab
  function sortedPlayers() {
    const F = PF.data.favs;
    let l = ISO.PLAYERS.slice();
    if (S.filter === 'owned') l = l.filter((d) => owned(d.id));
    else if (S.filter === 'fav') l = l.filter((d) => F.includes(d.id));
    return l.sort((a, b) => (F.includes(b.id) - F.includes(a.id)) || (owned(b.id) - owned(a.id)) || b.ovr - a.ovr || (a.name < b.name ? -1 : 1));
  }
  function cardsHtml() {
    const F = PF.data.favs, list = sortedPlayers();
    return '<div class="co-bar"><span>' + PF.ownedCount() + ' / ' + ISO.PLAYERS.length + ' OWNED · ' + F.length + ' / ' + CO.FAV_CAP + ' FAVOURITES</span>' +
      ['all', 'owned', 'fav'].map((f) => '<button class="segb' + (S.filter === f ? ' on' : '') + '" data-co="filter" data-id="' + f + '">' + f.toUpperCase().replace('FAV', 'FAVOURITES') + '</button>').join('') +
      '<span class="co-cmp">' + (S.cmp.length ? 'COMPARE: ' + S.cmp.map((id) => esc(ISO.playerById(id).short)).join(' vs ') : 'Tick two players to compare') +
      '<button class="btn small" data-co="compare"' + (S.cmp.length === 2 ? '' : ' disabled') + '>COMPARE ›</button>' + (S.cmp.length ? '<button class="btn small ghost" data-co="cmpclear">CLEAR</button>' : '') + '</span></div>' +
      '<div class="co-grid">' + (list.length ? list.map((d) => {
        const own = owned(d.id), fav = F.includes(d.id), ds = PF.dupStars(d.id), r = ISO.rarityOf(d);
        return '<div class="co-c r-' + r + (own ? '' : ' lock') + '" data-co="card" data-id="' + d.id + '" title="' + esc(d.name) + ' · ' + esc(d.club) + '"><img src="' + face(d) + '" alt=""><b>' + d.ovr + '</b><span>' + esc(d.short) + '</span>' +
          (ds ? '<i class="ds">' + '★'.repeat(ds) + '</i>' : '') +
          '<button class="fv' + (fav ? ' on' : '') + '" data-co="fav" data-id="' + d.id + '" title="Favourite">' + (fav ? '♥' : '♡') + '</button>' +
          '<button class="cp' + (S.cmp.includes(d.id) ? ' on' : '') + '" data-co="cmp" data-id="' + d.id + '" title="Compare">⇄</button></div>';
      }).join('') : '<p class="note">Nothing here yet.</p>') + '</div>';
  }
  function setsHtml() {
    const KIND = { club: 'CLUBS', nation: 'NATIONS', rarity: 'RARITY', era: 'ERA' };
    let h = '<div class="co-bar"><span>Complete a set to claim its credits once. Every completed set a fielded player belongs to adds +5% to your Quick Match win bonus, up to +15%.</span></div><div class="co-sets">';
    for (const kind of Object.keys(KIND)) {
      h += '<div class="side">' + KIND[kind] + '</div>';
      for (const s of CO.SETS().filter((x) => x.kind === kind)) {
        const st = PF.setStatus(s.id), pc = Math.round(100 * st.have / s.ids.length);
        h += '<div class="co-set' + (st.done ? ' done' : '') + '"' + (s.col ? ' style="--sc:' + s.col + '"' : '') + '><b>' + esc(s.name) + '</b><div class="rb"><i style="width:' + pc + '%"></i></div><span>' + st.have + ' / ' + s.ids.length + '</span>' +
          (st.claimed ? '<em>✓ CLAIMED</em>' : st.done ? '<button class="btn small primary" data-co="claim" data-id="' + esc(s.id) + '">CLAIM +' + cr(s.credit) + ' CR</button>' : '<small>' + cr(s.credit) + ' CR</small>') + '</div>';
      }
    }
    return h + '</div>';
  }
  function html() {
    return '<div class="co-wrap"><div class="seg co-tabs"><button class="segb' + (S.view === 'cards' ? ' on' : '') + '" data-co="view" data-id="cards">PLAYERS</button><button class="segb' + (S.view === 'sets' ? ' on' : '') + '" data-co="view" data-id="sets">SETS</button></div>' +
      (S.view === 'sets' ? setsHtml() : cardsHtml()) + '</div>';
  }

  // ---- the player card modal and the comparison
  function modal() {
    let m = $('coModal');
    if (!m) { m = document.createElement('div'); m.id = 'coModal'; m.className = 'co-modal hidden'; ($('stage') || document.body).appendChild(m); }
    return m;
  }
  const close = () => { S.card = null; modal().classList.add('hidden'); modal().innerHTML = ''; };
  function attrBars(d, other) {
    return ISO.ATTRS.map(([k, label]) => {
      const v = d.attr[k], o = other ? other.attr[k] : null;
      return '<div class="co-a' + (o != null ? (v > o ? ' hi' : v < o ? ' lo' : '') : '') + '"><span>' + esc(label) + '</span><div class="ctrack"><i style="width:' + v + '%;background:' + barCol(v) + '"></i></div><b>' + v + (o != null && v !== o ? '<small>' + (v > o ? '+' : '') + (v - o) + '</small>' : '') + '</b></div>';
    }).join('');
  }
  function cardHtml(id) {
    const base = ISO.playerById(id), prime = PF.isPrime(id), d = prime ? ISO.primeOf(base) : base, st = ISO.styleOf(d), rar = ISO.rarityOf(base), fav = PF.isFav(id), ds = PF.dupStars(id);
    const pers = ISO.AI.profileOf(base), ce = ISO.celebById(st.celeb);
    const sets = CO.setsOf(id).map((s) => { const x = PF.setStatus(s.id); return '<span class="chip' + (x.done ? ' trait' : '') + '">' + esc(s.name) + ' ' + x.have + '/' + s.ids.length + '</span>'; }).join('');
    return '<div class="co-box r-' + rar + '"><button class="btn small ghost co-x" data-co="close">✕</button>' +
      '<div class="co-head"><img src="' + face(base) + '" alt=""><div><div class="st-rar">' + ISO.RARITY[rar].name + (prime ? ' · ★ PRIME' : '') + '</div><h3>' + esc(base.name) + '</h3><div class="st-meta">' + esc(base.flag) + ' ' + esc(base.nat) + ' · ' + esc(base.club) + ' · ' + (base.foot === 'L' ? 'LEFT' : 'RIGHT') + ' FOOT</div>' +
      '<div class="co-ovr"><b>' + d.ovr + '</b> OVR' + (owned(id) ? '' : ' · NOT OWNED') + '</div></div>' +
      '<div class="co-act"><button class="btn small' + (fav ? ' primary' : '') + '" data-co="fav" data-id="' + id + '">' + (fav ? '♥ FAVOURITE' : '♡ FAVOURITE') + '</button><button class="btn small" data-co="cmp" data-id="' + id + '">⇄ COMPARE</button></div></div>' +
      '<div class="co-cols"><div class="co-attrs">' + attrBars(d) + '</div><div class="co-info">' +
      '<p><b>ROLE</b> ' + esc(ISO.ROLES[st.role].name.toUpperCase()) + '</p><p><b>WEAK FOOT</b> ' + stars(st.wfStars, 5) + '</p><p><b>SKILL MOVES</b> ' + stars(ISO.stars(d.attr.skl), 5) + '</p>' +
      '<p><b>CPU PERSONALITY</b> ' + esc(pers.name.toUpperCase()) + '<small>' + esc(pers.desc || '') + '</small></p><p><b>CELEBRATION</b> ' + esc(ce.name) + '</p>' +
      '<div class="traits">' + st.traits.map((t) => '<span class="tr"><b>' + esc(ISO.TRAITS[t].name.toUpperCase()) + '</b>' + esc(ISO.TRAITS[t].desc) + '</span>').join('') + '</div>' +
      '<p><b>DUPLICATE STARS</b> ' + stars(ds, CO.DUP_MAX) + '<small>' + (prime ? 'Prime owned.' : 'Prime price ' + cr(PF.primeCost(base)) + ' CR' + (ds ? ' (-' + Math.round(ds * CO.DUP_CUT * 100) + '%)' : '')) + ' · each duplicate pull adds a star (max ' + CO.DUP_MAX + ')</small></p>' +
      '<div class="co-sets-chips">' + sets + '</div></div></div></div>';
  }
  function openCard(id) {
    if (!ISO.playerById(id)) return;
    S.card = id; const m = modal(); m.innerHTML = cardHtml(id); m.classList.remove('hidden');
  }
  function openCompare() {
    if (S.cmp.length !== 2) return;
    const [a, b] = S.cmp.map((id) => { const d = ISO.playerById(id); return PF.isPrime(id) ? ISO.primeOf(d) : d; });
    const head = (d, o) => '<div class="co-ch r-' + ISO.rarityOf(d.base || d) + '"><img src="' + face(d.base || d) + '" alt=""><h4>' + esc(d.name) + '</h4><div class="co-ovr"><b>' + d.ovr + '</b> OVR' + (d.ovr > o.ovr ? ' ▲' : d.ovr < o.ovr ? ' ▼' : '') + '</div>' +
      '<small>' + esc(ISO.ROLES[ISO.styleOf(d).role].name.toUpperCase()) + ' · WF ' + stars(ISO.styleOf(d).wfStars, 5) + ' · SKILL ' + stars(ISO.stars(d.attr.skl), 5) + '</small>' +
      '<div class="co-tags">' + ISO.styleOf(d).traits.map((t) => '<span class="chip trait">' + ISO.TRAITS[t].tag + '</span>').join('') + '</div></div>';
    const m = modal(); S.card = null;
    m.innerHTML = '<div class="co-box wide"><button class="btn small ghost co-x" data-co="close">✕</button><div class="co-cmpgrid"><div>' + head(a, b) + attrBars(a, b) + '</div><div>' + head(b, a) + attrBars(b, a) + '</div></div></div>';
    m.classList.remove('hidden');
  }
  const refresh = () => { if (ISO.Meta && ISO.Meta.onShow && $('store') && !$('store').classList.contains('hidden')) ISO.Meta.onShow('store'); };
  function toast(a, b, c) { if (ISO.App && ISO.App.toast) ISO.App.toast(a, b, c || '#ffcf4d'); }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-co]');
    if (!t) { if (e.target.id === 'coModal') close(); return; }
    ISO.Audio.init();
    const k = t.dataset.co, id = t.dataset.id;
    if (k === 'close') close();
    else if (k === 'card') openCard(id);
    else if (k === 'view') { S.view = id; ISO.Audio.play('ui'); refresh(); }
    else if (k === 'filter') { S.filter = id; ISO.Audio.play('ui'); refresh(); }
    else if (k === 'fav') {
      e.stopPropagation();
      if (!PF.toggleFav(id)) { ISO.Audio.play('deny'); toast('FAVOURITES FULL', 'At most ' + CO.FAV_CAP + ' favourites', '#f1735f'); } else ISO.Audio.play('ui');
      if (S.card) { modal().innerHTML = cardHtml(S.card); } refresh();
    } else if (k === 'cmp') {
      e.stopPropagation();
      const i = S.cmp.indexOf(id);
      if (i >= 0) S.cmp.splice(i, 1); else { S.cmp.push(id); if (S.cmp.length > 2) S.cmp.shift(); }
      ISO.Audio.play('ui');
      if (S.card && S.cmp.length === 2) { openCompare(); return; }
      if (S.card) toast('COMPARE', S.cmp.length === 1 ? 'Pick one more player' : '', '#4fa3ff');
      refresh();
    } else if (k === 'compare') { ISO.Audio.play('ui'); openCompare(); }
    else if (k === 'cmpclear') { S.cmp = []; refresh(); }
    else if (k === 'claim') {
      const c = PF.claimSet(id);
      if (c) { ISO.Audio.play('coin'); toast('SET COMPLETE', '+' + cr(c) + ' CR · ' + CO.setById(id).name, '#ffcf4d'); if (ISO.App.updateCredits) ISO.App.updateCredits(); } else ISO.Audio.play('deny');
      refresh();
    }
  });
  // a right-click (or shift-click) on a player card in the select grid or the store roster opens the card
  function pid(e) { const c = e.target.closest && e.target.closest('.pcard[data-id], .st-pl[data-id]'); return c ? c.dataset.id : null; }
  document.addEventListener('contextmenu', (e) => { const id = pid(e); if (id) { e.preventDefault(); openCard(id); } });
  document.addEventListener('click', (e) => { if (!e.shiftKey) return; const id = pid(e); if (id) { e.preventDefault(); e.stopPropagation(); openCard(id); } }, true);
  document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.card !== null || (e.code === 'Escape' && $('coModal') && !$('coModal').classList.contains('hidden'))) close(); });

  ISO.CollectionUI = { html, openCard, openCompare, close, state: S };
})();
