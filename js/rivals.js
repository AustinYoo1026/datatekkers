/* ISO FOOTBALL — MyCareer rivals (roadmap 5.5): four fictional recurring rivals, the season-finale boss fixture ("matchday 8"), the head-to-head ledgers.
   Pure logic, node-loadable (needs data.js, ai.js for the archetype names, career.js and career-obj.js). No DOM, no Math.random: which rival closes a season is a pure
   function of the career seed, season and attempt; a rival's strength is a pure function of (rival, level) with level = season index + earlier meetings.
   The profile (js/profile.js) stores the state and pays the rewards; the screen is js/career-ui.js (RIVALS tab). The sim is never touched: the match is an ordinary
   match with first-to-5 and a forced AI archetype (App.matchPers in js/main.js, through ISO.AI.create's opts.pers). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {}), CA = ISO.Career;
  if (!CA) return;
  const KEYS = ['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'lng', 'cur', 'wf', 'skl', 'str', 'tck', 'sta'];      // the order of the ISO.PROF offset rows
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const mix = (...n) => ISO.Cup.mix(...n);

  const BOSS_WIN = 5;                                  // the finale is first to five
  const STEP = 7;                                      // overall points a rival gains per level (season index + earlier meetings)
  const OVR_MAX = 97;
  const BOSS_PRIZE = [200, 350, 550, 800, 1200];       // credits for the first win over a rival, by season
  const REMATCH_STEP = 0.2, REMATCH_MAX = 3;           // each earlier win over the same rival adds 20% to the prize and 5 rep, up to three
  const BOSS_OBJ_CR = [60, 80, 120], BOSS_OBJ_REP = [5, 8, 12];
  const objMult = (i) => 1 + 0.25 * (i | 0);           // the same season multiplier as the career objectives
  const REC_CAP = 40;                                  // head-to-head ledger entries kept (the most recently met)

  // One row per rival. prof: the ISO.PROF attribute shape; arch: the forced AI archetype (ISO.AI.ARCH key); base: overall at level 0.
  // obj: the rival's own finale objective (m = the tracker summary of the match, see ISO.Career.Tracker.finish).
  const RIVALS = [
    { id: 'calder', name: 'Rex Calder', short: 'CALDER', nick: 'THE FLASH', nat: 'RIV', flag: '🔥', club: 'Ember Rovers', num: 11, foot: 'L', base: 64, prof: 'winger', arch: 'unpredictable', col: '#ff7a3d',
      look: { skin: '#c98f62', hair: 'mohawk', hairColor: '#4fa3ff', face: 'narrow', h: 0.97, w: 0.92 }, kit: { a: '#e8452c', b: '#17171b', pat: 'vstripes', shorts: '#17171b', socks: '#e8452c' },
      obj: { id: 'rv_out', desc: 'Score from outside the box', test: (m) => m.goalsOut >= 1 },
      lines: { first: 'They say you are the next big thing. I will take that from you.', win: 'Lucky. Next time I will not leave you the space.', loss: 'Too slow. Come back when you can keep up.', rematch: 'I have been working on something for you.' } },
    { id: 'vantelli', name: 'Mateo Vantelli', short: 'VANTELLI', nick: 'THE KILLER', nat: 'RIV', flag: '🎯', club: 'Northgate United', num: 9, foot: 'R', base: 66, prof: 'striker', arch: 'clinical', col: '#4fa3ff',
      look: { skin: '#f6d7bd', hair: 'quiff', hairColor: '#e8cf7a', face: 'sharp', h: 1.02, w: 0.98 }, kit: { a: '#2a6fe0', b: '#f4f4f4', pat: 'solid', shorts: '#f4f4f4', socks: '#2a6fe0' },
      obj: { id: 'rv_tight', desc: 'Concede one goal or fewer', test: (m) => m.ga <= 1 },
      lines: { first: 'Give me one chance and it is over. I only need one.', win: 'You gave me nothing. I will remember that.', loss: 'One chance. That was all I needed.', rematch: 'Defend better than last time.' } },
    { id: 'kessler', name: 'Bruno Kessler', short: 'KESSLER', nick: 'THE WALL', nat: 'RIV', flag: '🧱', club: 'Ironbridge FC', num: 4, foot: 'R', base: 63, prof: 'defender', arch: 'defensive', col: '#c9a227',
      look: { skin: '#e8bd95', hair: 'buzz', hairColor: '#3a2a1c', beard: 'full', beardColor: '#3a2a1c', face: 'square', brow: 'heavy', h: 1.08, w: 1.1 }, kit: { a: '#1b1b1f', b: '#c9a227', pat: 'cstripe', shorts: '#1b1b1f', socks: '#c9a227' },
      obj: { id: 'rv_poss', desc: 'Win with 55% possession', test: (m) => m.poss >= 55 },
      lines: { first: 'Nobody gets past me. Nobody.', win: 'You found a way through. Do not expect it twice.', loss: 'The wall stands.', rematch: 'I have studied every one of your moves.' } },
    { id: 'orozco', name: 'Sol Orozco', short: 'OROZCO', nick: 'THE MAESTRO', nat: 'RIV', flag: '🎼', club: 'Casa Dorada', num: 10, foot: 'R', base: 65, prof: 'playmaker', arch: 'possession', col: '#b06bff',
      look: { skin: '#9a6a44', hair: 'long', hairColor: '#17100c', band: '#ffcf4d', face: 'oval', h: 0.98, w: 0.95 }, kit: { a: '#f5c518', b: '#1a1a2e', pat: 'solid', shorts: '#1a1a2e', socks: '#f5c518' },
      obj: { id: 'rv_back', desc: 'Win after going behind', test: (m) => !!m.comeback },
      lines: { first: 'The ball does the work. You will only watch it.', win: 'You took the ball from me. Impressive.', loss: 'You chased it all night.', rematch: 'This time you will not get the ball back.' } },
  ];
  const BY = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
  // the three finale objectives (paid only on a win): the rival's own, a margin and a rating
  const objsOf = (r) => [r.obj, { id: 'rv_margin', desc: 'Win by three goals or more', test: (m) => m.won && m.gf - m.ga >= 3 }, { id: 'rv_rating', desc: 'Match rating 7.0 or better', test: (m) => m.rating >= 7 }];

  const levelOf = (season, met) => Math.max(0, season | 0) + Math.max(0, met | 0);
  // A rival as a def clone with `base`, like ISO.primeOf. Pure: the same (rival, level) always gives equal values. The attributes are the ISO.PROF row around the overall.
  function rivalDef(r, level) {
    r = typeof r === 'string' ? BY[r] : r;
    level = Math.max(0, level | 0);
    const ovr = Math.min(OVR_MAX, r.base + STEP * level), row = ISO.PROF[r.prof], attr = {};
    KEYS.forEach((k, i) => { attr[k] = Math.max(25, Math.min(99, Math.round(ovr + row[i]))); });
    const d = { id: 'rival_' + r.id, name: r.name, short: r.short, nat: r.nat, flag: r.flag, club: r.club, era: 'modern', ovr, foot: r.foot, num: r.num, attr, look: Object.assign({}, r.look), kit: Object.assign({}, r.kit), role: r.prof, rival: r.id, level };
    return Object.assign(d, { base: Object.assign({}, d) });
  }
  // the rival who closes season i of attempt n (a walk through the table: consecutive seasons rarely repeat a rival)
  const rivalFor = (seed, i, n) => RIVALS[(mix(seed >>> 0, 0xb055) + (i | 0) + (n | 0)) % RIVALS.length];
  // the finale is played one CPU level above the season's last matchday (easy -> normal -> hard)
  const bossDiff = (i) => ({ easy: 'normal', normal: 'hard', hard: 'hard' }[ISO.SEASONS[CA.clampI(i)].lv[CA.MD - 1]] || 'hard');
  // the prize of a win: the season's base times the rematch factor (earlier wins over this rival)
  const rematchMult = (wins) => Math.round((1 + REMATCH_STEP * Math.min(REMATCH_MAX, Math.max(0, wins | 0))) * 100) / 100;
  const prizeOf = (i, wins) => Math.round(BOSS_PRIZE[CA.clampI(i)] * rematchMult(wins));
  const bossRepOf = (i, wins) => 20 + 5 * CA.clampI(i) + 5 * Math.min(REMATCH_MAX, Math.max(0, wins | 0));
  // the most one finale can pay in credits (prize at the largest rematch factor plus the three objectives), and over the five seasons of a career
  const bossCreditMax = (i) => prizeOf(i, REMATCH_MAX) + Math.round(BOSS_OBJ_CR.reduce((a, b) => a + b, 0) * objMult(i));
  const BOSS_CREDIT_CAP = ISO.SEASONS.reduce((s, _, i) => s + bossCreditMax(i), 0);

  // ---- state
  const blank = () => ({ w: 0, l: 0, gf: 0, ga: 0, met: 0 });
  const validBoss = (b) => isObj(b) && typeof b.id === 'string' && !!BY[b.id] && typeof b.done === 'boolean' && typeof b.live === 'boolean';
  // C.sn.boss = { id, done, live, res: null | { w, gf, ga } }. Created by shape (a session-2 career has none), idempotent.
  function ensureBoss(C) {
    const sn = C.sn;
    if (!isObj(sn)) return null;
    if (!isObj(C.rivals)) C.rivals = {};
    for (const r of RIVALS) { const x = C.rivals[r.id]; C.rivals[r.id] = isObj(x) ? { w: nonNeg(x.w), l: nonNeg(x.l), gf: nonNeg(x.gf), ga: nonNeg(x.ga), met: nonNeg(x.met) } : blank(); }
    for (const k of Object.keys(C.rivals)) if (!BY[k]) delete C.rivals[k];
    if (!validBoss(sn.boss)) sn.boss = { id: rivalFor(C.seed, sn.i, sn.n).id, done: false, live: false, res: null };
    else if (!(isObj(sn.boss.res) && typeof sn.boss.res.w === 'boolean')) sn.boss.res = null;
    sn.boss.res = sn.boss.res ? { w: sn.boss.res.w, gf: nonNeg(sn.boss.res.gf), ga: nonNeg(sn.boss.res.ga) } : null;
    return sn.boss;
  }
  // head-to-head against ordinary season opponents: { w, l, gf, ga } per catalogue id, the most recent REC_CAP kept
  function h2hAdd(C, id, won, gf, ga) {
    if (!id || !ISO.playerById(id)) return;
    if (!isObj(C.h2h)) C.h2h = {};
    const x = C.h2h[id] || { w: 0, l: 0, gf: 0, ga: 0 };
    delete C.h2h[id];      // re-inserted last: the keys stay ordered by recency
    if (won) x.w++; else x.l++;
    x.gf += gf | 0; x.ga += ga | 0;
    C.h2h[id] = x;
    const ks = Object.keys(C.h2h);
    for (let k = 0; k < ks.length - REC_CAP; k++) delete C.h2h[ks[k]];
  }
  function normH2h(C) {
    const src = isObj(C.h2h) ? C.h2h : {}, out = {};
    for (const id of Object.keys(src)) { const x = src[id]; if (ISO.playerById(id) && isObj(x)) out[id] = { w: nonNeg(x.w), l: nonNeg(x.l), gf: nonNeg(x.gf), ga: nonNeg(x.ga) }; }
    const ks = Object.keys(out); for (let k = 0; k < ks.length - REC_CAP; k++) delete out[ks[k]];
    C.h2h = out;
  }
  const bossLevel = (C) => { const b = ensureBoss(C); return levelOf(C.sn.i, C.rivals[b.id].met); };
  // the finale is available once the seven matchdays are played and it has not been played (or forfeited)
  const bossReady = (C) => { const sn = C.sn; return !!sn && sn.md >= CA.MD && !sn.live && !!ensureBoss(C) && !sn.boss.done && !sn.boss.live; };
  // everything a match needs: the def, the CPU level, the forced archetype id, the target score
  function bossMatch(C) {
    const b = ensureBoss(C), r = BY[b.id], level = bossLevel(C);
    return { rival: r, level, def: rivalDef(r, level), diff: bossDiff(C.sn.i), arch: r.arch, win: BOSS_WIN };
  }
  const bossKickoff = (C) => { if (!bossReady(C)) return false; C.sn.boss.live = true; return true; };
  const record = (C, id, won, gf, ga) => { const x = C.rivals[id]; x.met++; x.gf += gf; x.ga += ga; if (won) x.w++; else x.l++; };
  // a finale that was left (quit, reload, close): a loss on the ledger, nothing paid
  function bossForfeit(C) {
    const b = ensureBoss(C);
    if (!b || b.done || !b.live) return null;
    record(C, b.id, false, 0, 3); b.done = true; b.live = false; b.res = { w: false, gf: 0, ga: 3 };
    return { id: b.id, won: false };
  }
  // the finale is over: the ledger, and for a win the prize, the objectives and reputation. m = the tracker summary (without it no objective is done). Returns the report
  // (the profile adds the credits): { rival, level, won, gf, ga, prize, mult, objs[], credits, rep, tierUp } or null when there is nothing to settle.
  function bossSettle(C, r) {
    const b = ensureBoss(C);
    if (!b || b.done) return null;
    const rv = BY[b.id], rec = C.rivals[b.id], level = levelOf(C.sn.i, rec.met), wins = rec.w, i = C.sn.i, won = !!r.won, gf = r.gf | 0, ga = r.ga | 0;
    const tier0 = CA.tierOf(C.rep);
    record(C, b.id, won, gf, ga); b.done = true; b.live = false; b.res = { w: won, gf, ga };
    const x = { rival: rv, level, won, gf, ga, prize: 0, mult: rematchMult(wins), objs: [], credits: 0, rep: 0, tierUp: false };
    if (won) {
      const m = r.m || null;
      x.prize = prizeOf(i, wins);
      x.objs = objsOf(rv).map((o, k) => ({ id: o.id, desc: o.desc, done: !!(m && o.test(m)), credits: Math.round(BOSS_OBJ_CR[k] * objMult(i)), rep: BOSS_OBJ_REP[k] }));
      x.credits = x.prize + x.objs.reduce((s, o) => s + (o.done ? o.credits : 0), 0);
      x.rep = bossRepOf(i, wins) + x.objs.reduce((s, o) => s + (o.done ? o.rep : 0), 0);
      C.rep += x.rep; x.tierUp = CA.tierOf(C.rep) > tier0;
    }
    return x;
  }
  const totals = (C) => { let w = 0, l = 0; for (const id of Object.keys(C.rivals || {})) { w += C.rivals[id].w; l += C.rivals[id].l; } return { w, l }; };

  // keyed on shape: back-fills rivals, h2h and sn.boss (a session-2 career has none), turns a finale that was live at reload into a loss
  function norm(C) {
    ensureBoss(C); normH2h(C);
    if (C.sn && C.sn.boss && C.sn.boss.live) bossForfeit(C);
    if (C.sn && C.sn.boss && C.sn.boss.done && !C.sn.boss.res) C.sn.boss.res = { w: false, gf: 0, ga: 3 };
  }
  const prev = CA.norm;
  CA.norm = function (C) { if (prev) prev(C); norm(C); };

  ISO.Rivals = { RIVALS, BY, BOSS_WIN, STEP, BOSS_PRIZE, BOSS_OBJ_CR, BOSS_OBJ_REP, REMATCH_STEP, REMATCH_MAX, REC_CAP, BOSS_CREDIT_CAP, rivalDef, rivalFor, levelOf, bossDiff, rematchMult, prizeOf, bossRepOf, bossCreditMax, objsOf,
    ensureBoss, h2hAdd, bossLevel, bossReady, bossMatch, bossKickoff, bossForfeit, bossSettle, totals, norm, blank };
})();
