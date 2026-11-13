/* ISO FOOTBALL — the Tournament screen (#cup): cup list, player chooser, bracket. The rules and the bracket live in js/cup.js,
   the saved run and the prizes in js/profile.js; starting the match is main.js (App.mode = 'cup'). */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, CU = ISO.Cup;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cr = (n) => n.toLocaleString();
  const faces = new Map();
  function face(d) {
    const key = d.id;
    if (!faces.has(key)) faces.set(key, ISO.Sprites.portrait(d, 40, d.kit).toDataURL());
    return faces.get(key);
  }
  const S = { sel: null, me: null, token: 0 };

  // your owned players that fit the cup, best first
  const pool = (cup) => ISO.PLAYERS.filter((d) => PF.owns(d.id) && CU.eligible(cup, d)).sort((a, b) => b.ovr - a.ovr);

  function renderList(st) {
    $('cupList').innerHTML = ISO.CUPS.map((c) => {
      const locked = c.req && !PF.cupWon(c.req) && !(PF.data.settings.admin.unlocked && PF.data.settings.admin.allAch), rec = PF.data.cups[c.id] || { won: 0, best: 0 };
      const busy = st && st.id !== c.id, on = c.id === S.sel;
      const sub = locked ? 'LOCKED: WIN THE ' + CU.cupById(c.req).name : busy ? 'FINISH OR FORFEIT YOUR CUP FIRST' : 'QF ' + cr(c.prize[0]) + ' · SF ' + cr(c.prize[1]) + ' · FINAL ' + cr(c.prize[2]) + ' CR';
      return '<button class="cup-item' + (on ? ' on' : '') + (locked || busy ? ' off' : '') + '" data-cup-pick="' + c.id + '" style="--cc:' + c.col + '"><b>' + esc(c.name) + (st && st.id === c.id ? ' <em>IN PROGRESS</em>' : '') + '</b><span>' + esc(c.tag) + ' · ' + c.rounds.map((r) => r[0].toUpperCase()).join('/') + '</span><small>' + sub + (rec.won ? ' · WON ×' + rec.won : '') + '</small></button>';
    }).join('');
  }

  function entry(id, side, f, st, r) {
    if (!id) return '<div class="cb-p tbd"><span class="cb-n">TBD</span></div>';
    const d = ISO.playerById(id), x = (st.res[r] || [])[f], win = x && x.w === id;
    const sc = x ? (x.a === id ? x.sa : x.sb) : '';
    return '<div class="cb-p' + (id === st.me ? ' me' : '') + (x ? (win ? ' won' : ' lost') : '') + '"><img src="' + face(d) + '" alt=""><span class="cb-n">' + esc(d.short) + '</span><i>' + d.ovr + '</i><b>' + sc + '</b></div>';
  }
  function renderBracket(cup, st) {
    const n = CU.roundCount(cup);
    let h = '';
    for (let r = 0; r < n; r++) {
      const fx = st ? CU.fixtures(st, r) : Array.from({ length: cup.size / Math.pow(2, r + 1) }, () => ({ a: null, b: null }));
      h += '<div class="cb-col' + (st && r === st.round ? ' cur' : '') + '"><h4>' + CU.ROUND_NAMES[n === 3 ? r : Math.min(r, 2)] + '</h4>' + fx.map((x, f) => {
        const mine = st && r === st.round && (x.a === st.me || x.b === st.me);
        return '<div class="cb-fx' + (mine ? ' mine' : '') + '">' + (st ? entry(x.a, 0, f, st, r) + entry(x.b, 1, f, st, r) : '<div class="cb-p tbd"><span class="cb-n">TBD</span></div><div class="cb-p tbd"><span class="cb-n">TBD</span></div>') + '</div>';
      }).join('') + '</div>';
    }
    $('cupBracket').innerHTML = h;
  }

  function render() {
    const st = PF.data.cup;
    if (st) S.sel = st.id;
    if (!S.sel || !CU.cupById(S.sel)) S.sel = (ISO.CUPS.find((c) => PF.cupCan(c.id, (pool(c)[0] || {}).id) === 'ok') || ISO.CUPS[0]).id;
    const cup = CU.cupById(S.sel), pl = pool(cup);
    if (st) S.me = st.me; else if (!pl.some((d) => d.id === S.me)) S.me = (pl.find((d) => d.id === (ISO.App.pick[0] || {}).id) || pl[0] || {}).id || null;
    renderList(st);
    const meDef = S.me && ISO.playerById(S.me);
    { const c = $('cupFace').getContext('2d'); c.clearRect(0, 0, 96, 96); if (meDef) c.drawImage(ISO.Sprites.portrait(PF.outfit(meDef), 48, meDef.kit), 0, 0, 96, 96); }
    $('cupMeName').textContent = meDef ? meDef.name : 'NO ELIGIBLE PLAYER';
    $('cupMeOvr').textContent = meDef ? 'OVR ' + meDef.ovr + ' · ' + cup.tag : 'You own nobody who fits the ' + cup.name;
    for (const b of document.querySelectorAll('[data-cup-act="prev"],[data-cup-act="next"]')) b.disabled = !!st || pl.length < 2;
    renderBracket(cup, st);
    const btn = $('cupPlay'), info = $('cupInfo');
    $('cupForfeit').classList.toggle('hidden', !st);
    const can = st ? 'ok' : PF.cupCan(cup.id, S.me);
    if (st) {
      const pend = CU.pending(st).length, nm = CU.ROUND_NAMES[st.round];
      btn.textContent = pend ? 'SIMULATING…' : 'PLAY ' + nm + ' ›'; btn.disabled = pend > 0;
      btn.dataset.act = 'cup-play'; delete btn.dataset.cupAct;
      const opp = PF.cupOpponent();
      info.textContent = pend ? 'The other fixtures are being played…' : nm + ' · vs ' + (opp ? opp.name + ' (OVR ' + opp.ovr + ')' : '') + ' · CPU ' + cup.rounds[st.round].toUpperCase() + ' · FIRST TO 3 · PRIZE ' + cr(cup.prize[st.round]) + ' CR' + (cup.rules ? ' · ' + cup.rules.toUpperCase() + ' RULES' : '');
    } else {
      btn.textContent = can === 'ok' ? 'ENTER THE ' + cup.name + ' ›' : can === 'locked' ? 'LOCKED' : 'NO ELIGIBLE PLAYER'; btn.disabled = can !== 'ok';
      delete btn.dataset.act; btn.dataset.cupAct = 'enter';
      info.textContent = can === 'locked' ? 'Win the ' + CU.cupById(cup.req).name + ' to unlock this cup.' : cup.desc + ' Lose one match and you are out; prizes are paid as you win rounds.';
    }
    $('cupSub').textContent = st ? cup.name + ' · ' + CU.ROUND_NAMES[st.round] : ISO.CUPS.filter((c) => PF.cupWon(c.id)).length + ' / ' + ISO.CUPS.length + ' CUPS WON';
    pump();
  }

  // the other fixtures of a round play out one per beat after your match (resumes after a reload: the sim is seeded per fixture)
  function pump() {
    const tk = ++S.token;
    if (!PF.data.cup || !CU.mineDone(PF.data.cup)) return;      // my match is not played yet: nothing to simulate
    let frames = 0;
    const tick = () => {
      if (tk !== S.token || ISO.App.screen !== 'cup' || !PF.data.cup) return;
      if (++frames % 10 === 0) {
        const r = PF.cupSimNext();
        if (!r) return;
        if (r.left === 0) { render(); return; }
        renderBracket(CU.cupById(PF.data.cup.id), PF.data.cup);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cup-pick],[data-cup-act]');
    if (!t || t.disabled || !$('cup') || $('cup').classList.contains('hidden')) return;
    ISO.Audio.init();
    if (t.dataset.cupPick) {
      const c = CU.cupById(t.dataset.cupPick), st = PF.data.cup;
      if (st || (c.req && !PF.cupWon(c.req))) { ISO.Audio.play('deny'); return; }
      ISO.Audio.play('ui'); S.sel = c.id; render(); return;
    }
    const cup = CU.cupById(S.sel), act = t.dataset.cupAct, pl = pool(cup);
    if (act === 'prev' || act === 'next') { const i = pl.findIndex((d) => d.id === S.me); S.me = pl[(i + (act === 'next' ? 1 : -1) + pl.length) % pl.length].id; ISO.Audio.play('ui'); render(); }
    else if (act === 'enter') {
      if (PF.cupEnter(cup.id, S.me, (Date.now() % 2147483647) + 1)) ISO.Audio.play('coin'); else ISO.Audio.play('deny');
      render();
    } else if (act === 'forfeit') {
      if (window.confirm('Forfeit the ' + cup.name + '? The prizes already paid are kept; the run ends.')) { PF.recordCup(false, 0, 0); ISO.App.toast('CUP FORFEITED', 'You can enter again from here', '#f1735f'); render(); }
    }
  });

  ISO.CupUI = { onShow() { S.token++; render(); }, render };
})();
