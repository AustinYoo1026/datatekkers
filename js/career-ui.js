/* ISO FOOTBALL — the MyCareer season panel (middle column of #career): season banner, TABLE / FIXTURES / SEASONS tabs, the season summary.
   The league logic is js/career.js, the saved season and the rewards js/profile.js; starting a fixture is main.js (App.mode = 'career'). */
(function () {
  'use strict';
  const ISO = globalThis.ISO, PF = ISO.Profile, CA = ISO.Career, RV = ISO.Rivals;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cr = (n) => n.toLocaleString();
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
  const faces = new Map();
  function face(d) { if (!faces.has(d.id)) faces.set(d.id, ISO.Sprites.portrait(d, 40, d.kit).toDataURL()); return faces.get(d.id); }
  const S = { tab: 'table', last: null };
  const MOVE = { champion: 'CHAMPIONS', up: 'PROMOTED', stay: 'STAY IN THE LEAGUE', down: 'RELEGATED' };
  const nameOf = (i) => ISO.SEASONS[i].name;

  function bannerHtml(C) {
    const sn = C.sn, def = ISO.SEASONS[sn.i], pos = CA.posOf(C.seed, sn, PF.careerOvr(C.attr));
    const done = sn.md >= CA.MD;
    return '<div class="cs-b" style="--sc:' + def.col + '"><div><small>' + esc(def.tag) + '</small><b>' + esc(def.name) + '</b></div>' +
      '<div class="cs-r"><span>' + (done ? 'SEASON COMPLETE' : 'MATCHDAY ' + (sn.md + 1) + ' / ' + CA.MD) + '</span><span>' + (sn.md ? ord(pos) + ' IN THE TABLE' : 'EIGHT TEAMS · SEVEN MATCHDAYS') + '</span>' +
      '<span>TITLE PRIZE ' + cr(def.prize) + ' CR' + (C.best[sn.i] === 1 ? ' (HALVED: WON BEFORE)' : '') + '</span></div></div>' + repHtml(C);
  }
  // ---- Phase 5.2-5.4: reputation, objectives, training
  const TIERC = ['#7f8da6', '#35e08a', '#4fa3ff', '#b06bff', '#ffcf4d', '#f1735f', '#ff5fa2'];
  function repHtml(C) {
    const ti = CA.tierInfo(C.rep), pc = ti.next == null ? 100 : Math.round(100 * (C.rep - ti.from) / (ti.next - ti.from));
    return '<div class="cs-rep" style="--tc:' + TIERC[ti.tier] + '" title="Reputation: goals, wins, ratings, streaks, objectives and season finishes. It unlocks kits, looks and harder objectives."><b>' + ti.name + '</b><div class="rb"><i style="width:' + pc + '%"></i></div><small>REP ' + cr(C.rep) + (ti.next == null ? ' · MAX' : ' / ' + cr(ti.next) + ' · ' + ti.nextName) + '</small></div>';
  }
  const TCOL = ['#35e08a', '#ffcf4d', '#f1735f'];
  const objLine = (o, st) => '<div class="obj ' + (st === true ? 'ok' : st === false ? 'no' : '') + '" style="--oc:' + TCOL[o.tier] + '"><span class="ot">' + CA.TIERS[o.tier] + '</span><span class="od">' + (st === true ? '✓ ' : st === false ? '✗ ' : '') + esc(o.desc) + '</span><span class="or">' + (o.credits ? '+' + o.credits + ' CR' : '') + (o.points ? ' · +' + o.points + ' PT' : '') + ' · +' + o.rep + ' REP</span></div>';
  function nextObjHtml() {      // right column: the fixture's three objectives
    const objs = PF.careerObjectives();
    return objs.length ? '<div class="side">OBJECTIVES</div>' + objs.map((o) => objLine(o, null)).join('') : '';
  }
  function objectivesHtml(C) {
    const objs = PF.careerObjectives(), so = PF.seasonObjectives(), ti = CA.tierInfo(C.rep), t = C.sn.tally || CA.freshTally();
    let h = '<div class="side">THIS FIXTURE</div>' + (objs.length ? objs.map((o) => objLine(o, null)).join('') : '<p class="note">The season is over.</p>');
    h += '<div class="side">THIS SEASON</div>' + so.map((o) => objLine(o, o.done === true ? true : null)).join('') +
      '<p class="note">Played ' + t.p + ' · won ' + t.w + ' · goals ' + t.gf + ' · clean sheets ' + t.clean + ' · best streak ' + t.streakMax + '. Season objectives pay when you close the season.</p>';
    h += '<div class="side">REPUTATION · ' + ti.name + '</div>' + repHtml(C) + CA.REP_TIERS.map(([n, name], k) => {
      const un = [];
      CA.KIT_REQ.forEach((q, i) => { if (q === k && k > 0) un.push('KIT ' + (i + 1)); }); CA.LOOK_REQ.forEach((q, i) => { if (q === k && k > 0) un.push('LOOK ' + (i + 1)); });
      for (const o of CA.OBJ) if (o.minRep > 0 && CA.tierOf(o.minRep) === k) un.push('OBJ: ' + o.desc.toUpperCase());
      for (const x of CA.RIVAL_CH) if (x.tier === k) un.push('RIVAL CHALLENGES');
      return '<div class="lrow" style="--rc:' + TIERC[k] + '"><span class="ln">' + (k + 1) + '</span><span></span><span class="lname">' + name + '<small>' + (un.length ? un.join(' · ') : 'THE START') + '</small></span><span class="lovr">' + (C.rep >= n ? '✓' : cr(n)) + '</span><span class="lst"></span></div>';
    }).join('');
    return h;
  }
  function trainingHtml(C) {
    const cap = ISO.SEASONS[C.sn.i].cap;
    let h = '<p class="note">Training comes from play: every fixture earns XP in each programme (doubled on your focus), and every fixture earns a token (bank of ' + CA.TOKEN_MAX + ') to play a drill as your career player. A point costs 100 XP per upgrade-point cost; the lowest stat of the programme first, never above ' + cap + ' this season.</p>' +
      '<div class="cs-tok">TRAINING TOKENS <b>' + C.tokens + ' / ' + CA.TOKEN_MAX + '</b></div>';
    for (const T of CA.TRAIN) {
      const low = T.attrs.reduce((a, k) => (C.attr[k] < C.attr[a] ? k : a), T.attrs[0]), need = CA.xpCost(C.attr[low]), full = C.attr[low] >= Math.min(99, cap), xp = C.xp[T.id], pc = full ? 100 : Math.min(100, Math.round(100 * xp / need)), foc = C.focus === T.id;
      h += '<div class="trow' + (foc ? ' focus' : '') + '"><button class="segb' + (foc ? ' on' : '') + '" data-cs="focus" data-prog="' + T.id + '" title="Focus doubles this programme\'s XP">' + (foc ? '★ FOCUS' : 'FOCUS') + '</button>' +
        '<div class="tn"><b>' + T.name + '</b><small>' + T.attrs.map((k) => k.toUpperCase() + ' ' + C.attr[k] + (C.trained[k] ? ' (+' + C.trained[k] + ')' : '')).join(' · ') + ' · ' + T.tip.toUpperCase() + '</small></div>' +
        '<div class="tb"><i style="width:' + pc + '%"></i></div><span class="tx">' + (full ? 'CAP' : xp + ' / ' + need) + '</span><div class="td">' +
        (T.drills.length ? T.drills.map((d) => '<button class="btn small" data-act="career-drill" data-drill="' + d + '" data-prog="' + T.id + '"' + (C.tokens < 1 ? ' disabled' : '') + '>' + esc(ISO.DRILLS[d].name) + '</button>').join('') : '<small>MATCH ONLY</small>') + '</div></div>';
    }
    return h;
  }
  let lastDrill = null;
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-drill]'); if (b) lastDrill = { prog: b.dataset.prog, kind: b.dataset.drill }; }, true);      // read by drillSetup (main.js dispatches data-act after this)
  const fmtGains = (gs) => gs.map((g) => g.k.toUpperCase() + ' ' + g.from + '→' + g.to).join(' · ');
  // ---- hooks called from main.js
  function begin(App) {
    App.tr = App.mode === 'career' ? CA.Tracker.create(0) : null;
    if (App.tr) PF.careerObjectives();      // drawn (and saved) before kickoff, so the pause list and the payout use the same three
    App.trainTok = !!App.trainArm && App.mode === 'drill'; App.trainArm = false;
    if (!App.trainTok) PF.trainAbort();      // a token drill that was left unfinished never pays a later drill
    const el = $('pObj'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  }
  function summary(App) {
    if (!App.tr) return null;
    const me = App.matchDefs[0], opp = App.matchDefs[1];
    return CA.Tracker.finish(App.tr, App.G, { gap: opp.ovr - me.ovr });
  }
  function pause(App) {
    const el = $('pObj');
    if (!el) return;
    if (!App.tr || App.mode !== 'career') { el.classList.add('hidden'); return; }
    if (App.boss) { const m = summary(App); el.innerHTML = '<b>FINALE OBJECTIVES</b>' + RV.objsOf(App.boss.rival).map((o, k) => objLine({ tier: k, desc: o.desc, credits: Math.round(RV.BOSS_OBJ_CR[k] * (1 + 0.25 * PF.data.career.sn.i)), points: 0, rep: RV.BOSS_OBJ_REP[k] }, o.id === 'rv_back' || o.id === 'rv_out' || o.id === 'rv_poss' || o.id === 'rv_rating' ? (o.test(m) ? true : null) : null)).join('') + '<small>Paid when you win. Leaving the match forfeits it (a loss on the rival ledger, nothing paid).</small>'; el.classList.remove('hidden'); return; }
    const m = summary(App), ids = (PF.data.career.obj && PF.data.career.obj.ids) || [], live = ['o_win', 'o_clean', 'o_stronger', 'o_comeback', 'o_master', 'o_dominant', 'o_rating', 'o_keep', 'o_never', 'o_poss45', 'o_poss55'];
    el.innerHTML = '<b>MATCH OBJECTIVES</b>' + ids.map((id) => { const o = CA.OBJ_BY[id], r = CA.objReward(o.tier, PF.data.career.sn.i), now = !!o.test(m); return objLine(Object.assign({ tier: o.tier, desc: o.desc }, r), live.includes(id) && !now ? null : now); }).join('') + '<small>Judged on the final result. Leaving the match forfeits it.</small>';
    el.classList.remove('hidden');
  }
  function endRows(res) {
    const x = res.obj;
    if (!x) return '';
    let h = '<span class="pts">OBJECTIVES ' + x.done + '/' + x.objs.length + (x.credits ? ' · +' + x.credits + ' CR' : '') + (x.points ? ' · +' + x.points + ' UPGRADE POINT' + (x.points === 1 ? '' : 'S') : '') + '</span>';
    for (const o of x.objs) h += '<span class="' + (o.done ? 'boost' : 'dim') + '">' + (o.done ? '✓ ' : '✗ ') + esc(o.desc.toUpperCase()) + '</span>';
    h += '<span>MATCH RATING ' + x.rating.toFixed(1) + '</span><span class="boost">REPUTATION +' + x.rep + ' · ' + CA.tierInfo(PF.data.career.rep).name + '</span>';
    h += '<span>TRAINING XP ' + CA.TRAIN.map((T) => T.name.split(' ')[0].slice(0, 3) + ' +' + x.xp[T.id]).join(' · ') + (x.gains.length ? '</span><span class="boost">TRAINED ' + fmtGains(x.gains) : '') + '</span>';
    h += '<span>TRAINING TOKEN ' + x.tokens + ' / ' + CA.TOKEN_MAX + '</span>';
    return h;
  }
  // the right column while the finale is open (called by renderCareer in meta-ui when there is no league opponent): true when it drew the rival
  function bossCard() {
    if (!RV || !PF.bossReady()) return false;
    const m = PF.bossMatch(), d = m.def, cv = $('careerOppFace'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 184, 184); ctx.drawImage(ISO.Sprites.portrait(d, 184, d.kit), 0, 0, 184, 184);
    $('careerOppName').textContent = 'FINALE · ' + d.name;
    $('careerOppMeta').textContent = m.rival.nick + ' · ' + d.club + ' · OVR ' + d.ovr;
    $('careerOppDiff').textContent = 'CPU ' + m.diff.toUpperCase() + ' · ' + archName(m.rival) + ' · FIRST TO 5 · NO RISK';
    $('careerPlay').classList.remove('hidden'); $('careerPlay').textContent = 'PLAY FINALE ›';
    return true;
  }
  function bossRows(res) {
    const x = res.boss;
    if (!x) return '<span class="dim">FINALE FORFEITED · NOTHING PAID</span>';
    const rv = x.rival;
    let h = '<span class="' + (x.won ? 'boost' : 'dim') + '">' + esc(rv.name.toUpperCase()) + ' · LEVEL ' + (x.level + 1) + ' · "' + esc(x.won ? rv.lines.win : rv.lines.loss).toUpperCase() + '"</span>';
    if (x.won) {
      h += '<span class="pts">FINALE PRIZE +' + cr(x.prize) + ' CR' + (x.mult > 1 ? ' (REMATCH ×' + x.mult + ')' : '') + '</span>';
      for (const o of x.objs) h += '<span class="' + (o.done ? 'boost' : 'dim') + '">' + (o.done ? '✓ ' : '✗ ') + esc(o.desc.toUpperCase()) + (o.done ? ' +' + o.credits + ' CR · +' + o.rep + ' REP' : '') + '</span>';
      h += '<span class="boost">REPUTATION +' + x.rep + ' · ' + CA.tierInfo(PF.data.career.rep).name + '</span>';
    } else h += '<span>NOTHING LOST: PROMOTION AND THE SEASON ARE UNAFFECTED. THEY ARE STRONGER NEXT TIME.</span>';
    return h;
  }
  function bossToasts(res) {
    const x = res.boss;
    if (!x) return;
    if (x.won) ISO.App.toast('RIVAL BEATEN', x.rival.name.toUpperCase() + ' · +' + cr(x.credits) + ' CR · REP +' + x.rep, x.rival.col);
    if (x.tierUp) ISO.App.toast('REPUTATION: ' + CA.tierInfo(PF.data.career.rep).name, 'New kits, looks and objectives may be unlocked', TIERC[CA.tierOf(PF.data.career.rep)]);
  }
  function endToasts(res) {
    const x = res.obj;
    if (!x) return;
    if (x.tierUp) ISO.App.toast('REPUTATION: ' + CA.tierInfo(PF.data.career.rep).name, 'New kits, looks and objectives may be unlocked', TIERC[x.tier]);
    for (const id of x.traitsNew || []) ISO.App.toast('TRAIT UNLOCKED', ISO.TRAITS[id].name.toUpperCase(), '#35e08a');
    if (x.gains.length) ISO.App.toast('TRAINING GAINS', fmtGains(x.gains), '#4fa3ff');
  }
  function drillSetup(App) {
    const d = lastDrill; lastDrill = null;
    if (!d || !PF.trainStart(d.prog, d.kind)) { ISO.Audio.play('deny'); ISO.App.toast('NO TRAINING TOKEN', 'Play a career fixture to earn one', '#f1735f'); return false; }
    const me = ISO.outfit(PF.careerDef(), false, 'home', PF.celebOf());
    App.mode = 'drill'; App.drill = d.kind; App.side = 0; App.touched = true; App.pick = [me, App.pick && App.pick[1] || me]; App.trainArm = true;
    return true;
  }
  function trainDone(App, D) {
    App.trainTok = false;
    const x = PF.trainFinish(D.kind, D.points);
    if (!x) return;
    ISO.App.toast('TRAINING · ' + CA.TRAIN_BY[x.prog].name, '+' + x.xp + ' XP' + (x.gains.length ? ' · ' + fmtGains(x.gains) : ''), '#4fa3ff');
    for (const id of x.traitsNew || []) ISO.App.toast('TRAIT UNLOCKED', ISO.TRAITS[id].name.toUpperCase(), '#35e08a');
  }
  function tableHtml(C) {
    const sn = C.sn, def = ISO.SEASONS[sn.i], rows = PF.seasonTable(), me = PF.careerDef();
    let h = '<div class="lrow cs-h"><span class="ln">#</span><span></span><span class="lname">TEAM</span><span class="lovr">PTS</span><span class="lst">W-L · GD</span></div>';
    rows.forEach((x, k) => {
      const pos = k + 1, d = x.id === 'me' ? me : ISO.playerById(x.id);
      const zone = pos <= def.up ? '#35e08a' : def.rel != null && pos >= def.rel ? '#f1735f' : '#4b5a74';
      const gd = x.gf - x.ga;
      h += '<div class="lrow' + (x.id === 'me' ? ' next' : '') + '" style="--rc:' + zone + '"><span class="ln">' + pos + '</span><img src="' + face(d) + '" alt="">' +
        '<span class="lname">' + esc(x.id === 'me' ? d.name : d.name) + '<small>' + (x.id === 'me' ? 'YOU · OVR ' + d.ovr : esc(d.club) + ' · OVR ' + d.ovr) + '</small></span><span class="lovr">' + x.pts + '</span>' +
        '<span class="lst">' + x.w + '-' + x.l + ' · ' + (gd > 0 ? '+' : '') + gd + '</span></div>';
    });
    h += '<p class="note">Top ' + def.up + ' go up' + (def.rel != null ? ', ' + ord(def.rel) + ' and below go down a season' : ', no relegation in this season') + '. Three points a win; a prize for 1st, 2nd-3rd and 4th-6th.</p>';
    return h;
  }
  // ---- Phase 5.5 rivals: the finale ("matchday 8"), head-to-head text, the RIVALS tab; 5.6: the custom kit tab
  const h2hText = (C, id) => { const x = C.h2h && C.h2h[id]; return x ? ' · H2H ' + x.w + '-' + x.l : ''; };
  const rec = (C, id) => (C.rivals && C.rivals[id]) || RV.blank();
  const archName = (r) => ISO.AI.ARCH[r.arch].name.toUpperCase();
  function bossLine(b) { const C = PF.data.career, r = rec(C, b.rival.id); return r.met ? b.rival.lines.rematch : b.rival.lines.first; }
  function finaleRow(C) {
    const sn = C.sn, b = sn.boss;
    if (!RV || !b) return '';
    const rv = RV.BY[b.id], r = rec(C, b.id), d = RV.rivalDef(rv, RV.levelOf(sn.i, r.met)), ready = PF.bossReady();
    return '<div class="lrow rival' + (b.done ? (b.res.w ? ' beaten' : '') : ready ? ' next' : ' ahead') + '" style="--rc:' + rv.col + '"><span class="ln">8</span><img src="' + face(d) + '" alt="">' +
      '<span class="lname">FINALE · ' + esc(rv.name) + '<small>' + esc(rv.nick) + ' · ' + esc(archName(rv)) + ' · FIRST TO 5' + (r.met ? ' · RECORD ' + r.w + '-' + r.l : '') + '</small></span><span class="lovr">' + d.ovr + '</span>' +
      '<span class="lst">' + (b.done ? (b.res.w ? 'W ' : 'L ') + b.res.gf + '-' + b.res.ga : ready ? 'NEXT' : '') + '</span></div>';
  }
  function bossBanner(C) {      // the strip above CLOSE SEASON while the finale is open or just played
    const b = C.sn.boss;
    if (!RV || !b) return '';
    const rv = RV.BY[b.id], r = rec(C, b.id), lvl = RV.levelOf(C.sn.i, r.met), prize = RV.prizeOf(C.sn.i, r.w);
    if (b.done) return '<div class="cs-sum rv" style="--sc:' + rv.col + '"><b>FINALE · ' + esc(rv.name) + '</b><span>' + (b.res.w ? 'YOU WON ' : 'YOU LOST ') + b.res.gf + '-' + b.res.ga + ' · "' + esc(b.res.w ? rv.lines.win : rv.lines.loss) + '"</span></div>';
    return '<div class="cs-sum rv" style="--sc:' + rv.col + '"><b>SEASON FINALE · ' + esc(rv.name) + ' · ' + esc(rv.nick) + '</b><span>"' + esc(r.met ? rv.lines.rematch : rv.lines.first) + '"</span>' +
      '<span class="cr">LEVEL ' + (lvl + 1) + ' · OVR ' + RV.rivalDef(rv, lvl).ovr + ' · FIRST TO 5 · WIN +' + cr(prize) + ' CR + REP · A LOSS COSTS NOTHING</span></div>';
  }
  function rivalsHtml(C) {
    const sn = C.sn;
    let h = '<p class="note">Four rivals close your seasons, one each, first to five. Every meeting makes the next one harder (their level is the season plus your earlier meetings). Beat a rival again for a bigger prize. A loss never blocks promotion or the season.</p>';
    for (const rv of RV.RIVALS) {
      const r = rec(C, rv.id), lvl = RV.levelOf(sn.i, r.met), d = RV.rivalDef(rv, lvl), now = sn.boss && sn.boss.id === rv.id;
      h += '<div class="lrow rival' + (now ? ' next' : '') + '" style="--rc:' + rv.col + '"><span class="ln">' + (r.met || '–') + '</span><img src="' + face(d) + '" alt="">' +
        '<span class="lname">' + esc(rv.name) + ' · ' + esc(rv.nick) + '<small>' + esc(rv.club) + ' · ' + esc(archName(rv)) + ' · ' + r.w + 'W ' + r.l + 'L · GOALS ' + r.gf + '-' + r.ga + '</small>' +
        '<small class="q">"' + esc(r.met ? rv.lines.rematch : rv.lines.first) + '" · OBJECTIVE: ' + esc(rv.obj.desc.toUpperCase()) + '</small></span>' +
        '<span class="lovr">' + d.ovr + '</span><span class="lst">' + (now ? (sn.boss.done ? 'MET' : sn.md >= CA.MD ? 'NEXT' : 'THIS SEASON') : 'LATER') + '</span></div>';
    }
    const ks = Object.keys(C.h2h || {}).sort((a, b) => (C.h2h[b].w + C.h2h[b].l) - (C.h2h[a].w + C.h2h[a].l)).slice(0, 6);
    h += '<div class="side">HEAD TO HEAD</div>' + (ks.length ? ks.map((id) => { const x = C.h2h[id], d = ISO.playerById(id); return '<div class="lrow"><span class="ln"></span><img src="' + face(d) + '" alt=""><span class="lname">' + esc(d.name) + '<small>' + esc(d.club) + ' · GOALS ' + x.gf + '-' + x.ga + '</small></span><span class="lovr">' + x.w + '-' + x.l + '</span><span class="lst"></span></div>'; }).join('') : '<p class="note">Your results against league opponents appear here.</p>');
    return h;
  }
  function kitHtml(C) {
    const kc = C.kitCustom, cur = PF.careerDef().kit;
    return '<p class="note">Pick two colours for a custom kit (shirt and shorts). It replaces the kit you cycle with ‹ ›; clear it to go back.</p><div class="cs-kit">' +
      '<label>SHIRT <input type="color" id="kcA" value="' + (kc ? kc.a : cur.a) + '"></label><label>SHORTS <input type="color" id="kcB" value="' + (kc ? kc.b : cur.b) + '"></label>' +
      '<button class="btn small" data-cs="kitsave">APPLY</button><button class="btn small ghost" data-cs="kitclear"' + (kc ? '' : ' disabled') + '>CLEAR</button></div>';
  }
  function fixturesHtml(C) {
    const sn = C.sn;
    let h = '';
    for (let r = 0; r < CA.MD; r++) {
      const d = ISO.playerById(sn.field[CA.slotOf(r) - 1]), m = sn.res[r], cur = r === sn.md;
      h += '<div class="lrow ' + (m ? (m.w ? 'beaten' : '') : cur ? 'next' : 'ahead') + ' r-' + ISO.rarityOf(d) + '"><span class="ln">' + (r + 1) + '</span><img src="' + face(d) + '" alt="">' +
        '<span class="lname">' + esc(d.name) + '<small>' + esc(d.club) + ' · CPU ' + ISO.SEASONS[sn.i].lv[r].toUpperCase() + h2hText(C, d.id) + '</small></span><span class="lovr">' + d.ovr + '</span>' +
        '<span class="lst">' + (m ? (m.w ? 'W ' : 'L ') + m.gf + '-' + m.ga : cur ? 'NEXT' : '') + '</span></div>';
    }
    return h + finaleRow(C);
  }
  function seasonsHtml(C) {
    let h = '';
    for (const x of C.hist.slice().reverse()) {
      const d = ISO.SEASONS[x.i];
      h += '<div class="lrow" style="--rc:' + d.col + '"><span class="ln">S' + (x.i + 1) + '</span><span></span><span class="lname">' + esc(d.name) + '<small>' +
        (x.legacy ? 'CLEARED ON THE LADDER' : ord(x.pos) + ' · ' + MOVE[x.move] + (x.prize ? ' · +' + cr(x.prize) + ' CR' : '')) + '</small></span><span class="lovr">' + (x.legacy ? '✓' : x.pos) + '</span><span class="lst"></span></div>';
    }
    const sn = C.sn, d = ISO.SEASONS[sn.i];
    h = '<div class="lrow next" style="--rc:' + d.col + '"><span class="ln">S' + (sn.i + 1) + '</span><span></span><span class="lname">' + esc(d.name) + '<small>IN PROGRESS · MATCHDAY ' + Math.min(sn.md + 1, CA.MD) + ' / ' + CA.MD + '</small></span><span class="lovr">' + (C.best[sn.i] ? ord(C.best[sn.i]) : '–') + '</span><span class="lst">NOW</span></div>' + h;
    h += '<p class="note">Best finish: ' + ISO.SEASONS.map((s, i) => 'S' + (i + 1) + ' ' + (C.best[i] ? ord(C.best[i]) : '–')).join(' · ') + '</p>';
    return h;
  }
  function summaryHtml(C) {       // matchday 7 played: the result and the button that pays it
    const sn = C.sn, def = ISO.SEASONS[sn.i], f = CA.finish(C.seed, sn, PF.careerOvr(C.attr));
    const again = C.best[sn.i] === 1, prize = CA.prize(sn, f.pos, again), bonus = f.move === 'champion' ? 2 * def.win : f.move === 'up' ? def.win : 0;
    const nx = ISO.SEASONS[f.next.i].name;
    return '<div class="cs-sum" style="--sc:' + def.col + '"><b>SEASON ' + (sn.i + 1) + ' COMPLETE · ' + ord(f.pos) + '</b><span>' + MOVE[f.move] + (f.move === 'stay' || f.move === 'champion' && sn.i === ISO.SEASONS.length - 1 ? '' : ' · NEXT: ' + nx) + '</span>' +
      '<span class="cr">+' + cr(prize) + ' CR' + (again && prize ? ' (HALVED: WON BEFORE)' : '') + (bonus ? ' · +' + bonus + ' UPGRADE POINTS' : '') + '</span>' +
      '<button class="btn primary" data-cs="close">CLOSE SEASON ›</button></div>';
  }
  function lastHtml() {       // what the last CLOSE SEASON paid (kept until you leave the screen)
    const x = S.last;
    if (!x) return '';
    return '<div class="cs-sum done" style="--sc:' + ISO.SEASONS[x.i].col + '"><b>' + nameOf(x.i) + ' · ' + ord(x.pos) + '</b><span>' + MOVE[x.move] + ' · NOW: ' + nameOf(x.next.i) + '</span><span class="cr">+' + cr(x.prize) + ' CR' + (x.bonus ? ' · +' + x.bonus + ' UPGRADE POINTS' : '') + '</span>' +
      (x.sobj ? x.sobj.objs.map((o) => objLine(o, o.done)).join('') : '') + '</div>';
  }

  function render() {
    const C = PF.data.career;
    $('careerBanner').innerHTML = bannerHtml(C);
    for (const b of $('careerTabs').children) b.classList.toggle('on', b.dataset.csTab === S.tab);
    const sn = C.sn, done = sn.md >= CA.MD;
    $('careerLadder').innerHTML = (done ? bossBanner(C) + summaryHtml(C) : lastHtml()) + (S.tab === 'fixtures' ? fixturesHtml(C) : S.tab === 'seasons' ? seasonsHtml(C) : S.tab === 'objectives' ? objectivesHtml(C) : S.tab === 'training' ? trainingHtml(C) : S.tab === 'rivals' ? rivalsHtml(C) : S.tab === 'kit' ? kitHtml(C) : tableHtml(C));
    const no = $('careerObj'); if (no) no.innerHTML = nextObjHtml();
    { const pl = $('careerPlay'); if (pl) pl.textContent = PF.bossReady() ? 'PLAY FINALE ›' : 'PLAY ›'; }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cs-tab],[data-cs]');
    if (!t || !$('career') || $('career').classList.contains('hidden')) return;
    ISO.Audio.init();
    if (t.dataset.csTab) { S.tab = t.dataset.csTab; ISO.Audio.play('ui'); render(); return; }
    if (t.dataset.cs === 'kitsave') { const a = $('kcA'), b = $('kcB'); if (a && b && PF.setKitCustom(a.value, b.value)) { ISO.Audio.play('ui'); if (ISO.Meta && ISO.Meta.refreshCareer) ISO.Meta.refreshCareer(); else render(); } else ISO.Audio.play('deny'); return; }
    if (t.dataset.cs === 'kitclear') { PF.setKitCustom(null); ISO.Audio.play('ui'); if (ISO.Meta && ISO.Meta.refreshCareer) ISO.Meta.refreshCareer(); else render(); return; }
    if (t.dataset.cs === 'focus') { PF.setFocus(t.dataset.prog); ISO.Audio.play('ui'); render(); return; }
    if (t.dataset.cs === 'close') {
      const x = PF.seasonEnd();
      if (!x) { ISO.Audio.play('deny'); return; }
      S.last = x; ISO.Audio.play('coin');
      ISO.App.toast(x.move === 'champion' ? 'SEASON WON' : x.move === 'up' ? 'PROMOTED' : x.move === 'down' ? 'RELEGATED' : 'SEASON OVER', nameOf(x.i) + ' · ' + ord(x.pos) + ' · +' + cr(x.prize) + ' CR', ISO.SEASONS[x.i].col);
      ISO.App.achToasts(x.ach); ISO.App.updateCredits();
      if (x.sobj) { const d = x.sobj.objs.filter((o) => o.done).length; ISO.App.toast('SEASON OBJECTIVES ' + d + '/3', '+' + cr(x.sobj.credits) + ' CR · +' + x.sobj.points + ' PT · REPUTATION +' + x.sobj.rep, '#ffcf4d'); if (x.sobj.tierUp) ISO.App.toast('REPUTATION: ' + CA.tierInfo(PF.data.career.rep).name, 'New kits, looks and objectives may be unlocked', '#ffcf4d'); }
      if (ISO.Meta && ISO.Meta.refreshCareer) ISO.Meta.refreshCareer(); else render();
    }
  });
  ISO.CareerUI = { render, setTab(t) { S.tab = t; }, onShow() { S.last = null; }, MOVE, begin, summary, pause, endRows, endToasts, drillSetup, trainDone, bossCard, bossRows, bossToasts, bossLine };
})();
