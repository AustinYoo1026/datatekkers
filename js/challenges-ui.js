/* ISO FOOTBALL — daily and weekly challenges, the DOM side (roadmap 9.2): the #chal overlay, the strip in #play, the end-of-match rows and toasts, the pause-menu list.
   Logic is js/challenges.js, storage and payment js/profile.js (challenges / challengeMatch / challengeDrill). The clock is read HERE (Date.now()) and passed down. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, CH = ISO.Challenges;
  const $ = (id) => document.getElementById(id);
  const T = (k, v) => ISO.I18n.t(k, v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const desc = (c) => ISO.I18n.opt('chal.' + c.id, c.desc);
  const hm = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h >= 24 ? T('chal.dh', { d: Math.floor(h / 24), h: h % 24 }) : T('chal.hm', { h, m: m % 60 }); };
  let timer = null;

  function begin(App) {
    const ok = !App.demo && (App.mode === 'cpu' || App.mode === 'career' || App.mode === 'cup');
    App.chTr = ok && ISO.Career && ISO.Career.Tracker ? ISO.Career.Tracker.create(0) : null;      // its own tracker: independent of App.tr (the career objectives)
    App.chRes = null;
  }
  const rowHtml = (c) => '<div class="chal-row' + (c.done ? ' done' : '') + '"><span>' + esc(desc(c)) + (c.n > 1 ? ' <small>' + Math.min(c.cur, c.n) + ' / ' + c.n + '</small>' : '') + '</span><div class="cr-bar"><i style="width:' + Math.round(100 * Math.min(1, c.cur / c.n)) + '%"></i></div><span class="cr-r">' + (c.done ? '✓ ' : '') + '+' + c.cr + ' CR</span></div>';
  function rowsOf(x) {      // the end-screen rows for a payment
    if (!x || (!x.done.length && !x.credits)) return '';
    let h = '<span class="pts">' + T('chal.end', { n: x.done.length, cr: x.credits }) + '</span>';
    for (const c of x.done) h += '<span class="boost">✓ ' + esc(ISO.I18n.opt('chal.' + c.id, (CH.BY[c.id] || {}).desc || c.id).toUpperCase()) + '</span>';
    if (x.streakBonus) h += '<span>' + T('chal.streak_bonus', { cr: x.streakBonus }) + '</span>';
    if (x.allBonus) h += '<span class="boost">' + T('chal.all_bonus', { cr: x.allBonus }) + '</span>';
    return h;
  }
  function toastsOf(App, x) {
    if (!x) return;
    for (const c of x.done) App.toast(T(c.scope === 'week' ? 'chal.toast_week' : 'chal.toast_day'), ISO.I18n.opt('chal.' + c.id, (CH.BY[c.id] || {}).desc || c.id) + ' · +' + c.cr + ' CR', '#ffcf4d');
    if (x.allBonus) App.toast(T('chal.toast_all'), '+' + x.allBonus + ' CR', '#35e08a');
    if (x.done.length || x.credits) App.updateCredits();
  }
  // a finished match: summary from the challenges' own tracker, paid straight away (cpu / career / cup at Normal or harder; online and Easy never count)
  function end(App) {
    if (!App.chTr || !CH) return '';
    const me = App.matchDefs[0], opp = App.matchDefs[1];
    const m = ISO.Career.Tracker.finish(App.chTr, App.G, { gap: opp.ovr - me.ovr });
    App.chTr = null;
    App.chRes = PF.challengeMatch(m, { mode: App.mode, diff: App.matchDiff, lvl: App.matchLvl == null ? undefined : App.matchLvl }, Date.now());
    return rowsOf(App.chRes);
  }
  function endToasts(App) { const x = App.chRes; App.chRes = null; toastsOf(App, x); }
  function drill(App, D, won) {
    if (!CH || !D || D.def || D.kind === 'arena' || D.kind === 'custom') return;
    const so = D.so, max = ISO.DRILLS[D.kind] ? ISO.DRILLS[D.kind].max : D.max;
    const x = PF.challengeDrill(D.kind, so ? (won ? max : 0) : D.points, max, App.matchDiff, Date.now());
    toastsOf(App, x);
  }
  function pause(App) {
    const el = $('pChal'); if (!el) return;
    if (!CH || !App.chTr) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const v = PF.challenges(Date.now());
    if (v.void || !v.day.length) { el.classList.add('hidden'); return; }
    el.innerHTML = '<b>' + esc(T('chal.pause')) + '</b>' + v.day.map((c) => '<div class="obj ' + (c.done ? 'ok' : '') + '"><span class="od">' + (c.done ? '✓ ' : '') + esc(desc(c)) + '</span></div>').join('');
    el.classList.remove('hidden');
  }

  function render() {
    const v = PF.challenges(Date.now());
    $('chalHead').innerHTML = '<span>' + T('chal.streak') + ' <b>' + v.streak + '</b></span><span>' + T('chal.best') + ' <b>' + v.best + '</b></span><span>' + T('chal.total') + ' <b>' + v.total + '</b></span><span>' + T('chal.resets', { t: hm(v.resetIn) }) + '</span><span>' + T('chal.week_resets', { t: hm(v.weekResetIn) }) + '</span>';
    $('chalVoid').classList.toggle('hidden', !v.void);
    $('chalDay').innerHTML = v.day.map(rowHtml).join('') + (v.day.length ? '<div class="chal-pause">' + T('chal.all_line', { cr: v.allCr }) + ' · ' + T('chal.next_streak', { cr: v.nextStreak }) + '</div>' : '');
    $('chalWeek').innerHTML = v.week.map(rowHtml).join('');
    return v;
  }
  function strip() {
    const v = PF.challenges(Date.now()), el = $('chalStrip'), b = $('chBadge');
    const left = v.day.filter((c) => !c.done).length;
    if (el) el.innerHTML = '<b>' + esc(T('chal.kicker')) + '</b><span>' + (v.void ? esc(T('chal.void_short')) : esc(T('chal.strip', { done: v.day.length - left, total: v.day.length, streak: v.streak, t: hm(v.resetIn) }))) + '</span>';
    if (b) b.classList.toggle('hidden', v.void || !left);
  }
  function open() { render(); $('chal').classList.remove('hidden'); clearInterval(timer); timer = setInterval(render, 1000); }
  function close() { $('chal').classList.add('hidden'); clearInterval(timer); timer = null; strip(); }
  if (ISO.Meta) { const old = ISO.Meta.onShow; ISO.Meta.onShow = (s) => { old(s); if (s === 'play' || s === 'menu') { try { strip(); } catch (e) { /* storage or clock trouble must not break a screen */ } } }; }
  ISO.ChallengeUI = { begin, end, endToasts, drill, pause, open, close, strip, render };
})();
