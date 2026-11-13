/* ISO FOOTBALL — MyCareer objectives, training and reputation (roadmap 5.2, 5.3, 5.4).
   Pure logic, node-loadable after career.js (needs data.js, cup.js for the seeded prng/mix). No DOM, no Math.random, never touches the sim:
   the tracker only READS the events main.js already drains (G.events) and G.stats. The profile (js/profile.js) pays the rewards and stores the state;
   the screens are js/career-ui.js. Improvement comes from play only: a match gives training XP, a token buys one drill; nothing is automatic. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const CA = ISO.Career;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const prng = (s) => ISO.Cup.prng(s), mix = (...n) => ISO.Cup.mix(...n);
  const upCost = (v) => (v < 70 ? 1 : v < 80 ? 2 : v < 90 ? 3 : 4);      // the same table as profile.js upgradeCost (asserted in tools/check.js)

  // ------------------------------------------------------------------ tracker
  // One per career fixture, owned by main.js (App.tr). `me` is the team index of the human (0 in a career). Pure: onEvent mutates only the tracker.
  // Attribution: a goal belongs to the last kick of the scorer's team (kick events carry the foot/weak flag and the striker).
  function create(team) {
    return { me: team | 0, kick: null, goals: [], skills: 0, botch: 0, beats: 0, ankles: 0, tackles: 0, lost: 0, bursts: 0, bumps: 0, shotsKicked: 0, trail: 0, lead: 0, gf: 0, ga: 0 };
  }
  // out of the box: the shot's own flag if the ball still carries it, else the striker's position (team 0 attacks the goal at x = FW)
  function struckOutside(G, p) {
    const s = G.ball && G.ball.shot;
    if (s && s.by === p && typeof s.out === 'boolean') return s.out;
    const C = ISO.C, gx = p.team === 0 ? C.FW : 0;
    return Math.abs(gx - p.x) > C.BOXD || p.y < C.BOXY0 || p.y > C.BOXY1;
  }
  function onEvent(tr, G, e) {
    if (!tr || !e) return;
    const me = tr.me, mine = (p) => !!p && p.team === me;
    switch (e.type) {
      case 'kick':
        if (mine(e.p) && e.shot) { tr.shotsKicked++; tr.kick = { weak: !!e.weak, out: struckOutside(G, e.p), type: e.shot, kind: e.kind || null, foot: e.foot || null }; }
        break;
      case 'goal':
        if (e.team === me && !e.own) {
          const k = tr.kick || { weak: false, out: false, type: 'normal' };
          tr.goals.push({ weak: k.weak, out: k.out, type: k.type }); tr.gf++; tr.kick = null;
          tr.lead = tr.gf - tr.ga;
        } else if (e.team !== me) { tr.ga++; tr.lead = tr.gf - tr.ga; tr.trail = Math.max(tr.trail, tr.ga - tr.gf); }
        break;
      case 'skill': if (mine(e.p)) tr.skills++; break;
      case 'botch': if (mine(e.p)) tr.botch++; break;
      case 'ankles': if (mine(e.p)) tr.ankles++; break;
      case 'beaten': if (mine(e.by)) tr.beats++; break;
      case 'tackle': if (mine(e.p) && e.on) tr.tackles++; else if (e.on && mine(e.on)) tr.lost++; break;
      case 'steal': if (e.on && mine(e.on)) tr.lost++; break;
      case 'burst': if (mine(e.p)) tr.bursts++; break;
      case 'bump': if (mine(e.p)) tr.bumps++; break;
      default: break;
    }
  }
  // the match summary the profile pays from. opts.gap: the opponent's overall minus yours.
  function finish(tr, G, opts) {
    const me = tr.me, o = 1 - me, s = G.stats, tot = (s.poss[0] + s.poss[1]) || 1;
    const goalsByType = {};
    for (const g of tr.goals) goalsByType[g.type] = (goalsByType[g.type] || 0) + 1;
    const m = {
      won: G.winner === me, gf: G.score[me] | 0, ga: G.score[o] | 0, time: Math.round(G.time * 10) / 10, poss: Math.round((s.poss[me] / tot) * 100),
      shots: s.shots[me] | 0, sot: s.onTarget[me] | 0, saves: s.saves[me] | 0, clears: s.clears[me] | 0, power: s.powerGoals[me] | 0,
      skills: s.skills[me] | 0, skillsOk: Math.max(0, (s.skills[me] | 0) - tr.botch), tackles: s.tackles[me] | 0,
      goalsOut: tr.goals.filter((g) => g.out).length, goalsWeak: tr.goals.filter((g) => g.weak).length, goalsByType,
      lost: tr.lost, botches: tr.botch, bursts: tr.bursts, bumps: tr.bumps, beats: tr.beats, ankles: tr.ankles,
      comeback: G.winner === me && tr.trail > 0, ovrGap: opts && Number.isFinite(opts.gap) ? opts.gap : 0,
    };
    m.rating = rating(m);
    return m;
  }
  // 0..10, one decimal: for the career only (the match presentation has its own rating)
  function rating(m) {
    let r = 5.5;
    r += Math.min(2.7, 0.9 * m.gf) - Math.min(1.5, 0.3 * m.ga) + (m.won ? 0.8 : 0);
    r += ((m.poss || 50) - 50) / 50 * 0.6 + Math.min(0.5, 0.1 * (m.tackles || 0)) + Math.min(0.5, 0.05 * (m.skillsOk || 0));
    r += Math.min(0.5, 0.1 * (m.sot || 0)) - Math.min(0.5, 0.1 * (m.lost || 0)) - Math.min(0.4, 0.2 * (m.botches || 0));
    return Math.round(clamp(r, 0, 10) * 10) / 10;
  }

  // ------------------------------------------------------------------ match objectives (5.3)
  // tier: 0 easy, 1 medium, 2 hard. n: the most times one can be drawn in a season. minSeason / minRep: when it enters the pool (rep is the reputation tier index).
  // can(ctx): optional, whether the fixture makes it possible at all (a "beat a stronger opponent" needs a stronger opponent).
  const OBJ = [
    { id: 'o_goal', tier: 0, desc: 'Score a goal', test: (m) => m.gf >= 1, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_skill3', tier: 0, desc: 'Perform 3 skill moves', test: (m) => m.skills >= 3, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_tackle2', tier: 0, desc: 'Win the ball with 2 tackles', test: (m) => m.tackles >= 2, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_sot3', tier: 0, desc: 'Get 3 shots on target', test: (m) => m.sot >= 3, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_poss45', tier: 0, desc: 'Keep 45% of the possession', test: (m) => m.poss >= 45, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_win', tier: 0, desc: 'Win the match', test: (m) => m.won, n: 1, minSeason: 0, minRep: 0 },
    { id: 'o_two', tier: 1, desc: 'Score two goals', test: (m) => m.gf >= 2, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_skill5', tier: 1, desc: 'Complete five successful skill moves', test: (m) => m.skillsOk >= 5, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_out', tier: 1, desc: 'Score from outside the box', test: (m) => m.goalsOut >= 1, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_weak', tier: 1, desc: 'Score with your weak foot', test: (m) => m.goalsWeak >= 1, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_poss55', tier: 1, desc: 'Keep 55% of the possession', test: (m) => m.poss >= 55, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_tackle5', tier: 1, desc: 'Win the ball with 5 tackles', test: (m) => m.tackles >= 5, n: 1, minSeason: 0, minRep: 0 },
    { id: 'o_power', tier: 1, desc: 'Score with a power shot', test: (m) => m.power >= 1, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_beats8', tier: 1, desc: 'Dribble past 8 challenges', test: (m) => m.beats >= 8, n: 1, minSeason: 1, minRep: 0 },
    { id: 'o_clean', tier: 2, desc: 'Win without conceding', test: (m) => m.won && m.ga === 0, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_keep', tier: 2, desc: 'Get dispossessed 5 times or fewer', test: (m) => m.lost <= 5, n: 2, minSeason: 0, minRep: 0 },
    { id: 'o_never', tier: 2, desc: 'Never get dispossessed', test: (m) => m.lost === 0, n: 1, minSeason: 2, minRep: 1500 },
    { id: 'o_stronger', tier: 2, desc: 'Beat a stronger opponent', test: (m) => m.won && m.ovrGap >= 1, n: 3, minSeason: 0, minRep: 0, can: (c) => c.gap >= 2 },
    { id: 'o_comeback', tier: 2, desc: 'Win after going behind', test: (m) => m.comeback, n: 1, minSeason: 0, minRep: 0 },
    { id: 'o_double', tier: 2, desc: 'Score from outside the box and with your weak foot', test: (m) => m.goalsOut >= 1 && m.goalsWeak >= 1, n: 1, minSeason: 1, minRep: 300 },
    { id: 'o_master', tier: 2, desc: 'Win with 60% possession and 5 skill moves', test: (m) => m.won && m.poss >= 60 && m.skillsOk >= 5, n: 1, minSeason: 1, minRep: 300 },
    { id: 'o_dominant', tier: 2, desc: 'Win 3-0 and keep 55% of the ball', test: (m) => m.won && m.gf >= 3 && m.ga === 0 && m.poss >= 55, n: 1, minSeason: 2, minRep: 700 },
    { id: 'o_rating', tier: 2, desc: 'Earn a match rating of 9.0', test: (m) => m.rating >= 9, n: 1, minSeason: 2, minRep: 700 },
  ];
  const OBJ_BY = Object.fromEntries(OBJ.map((o) => [o.id, o]));
  const TIERS = ['EASY', 'MEDIUM', 'HARD'];
  const OBJ_CR = [40, 80, 150], OBJ_REP = [5, 10, 20], OBJ_PTS = [0, 1, 2];
  const seasonMult = (i) => 1 + 0.25 * (i | 0);
  const objReward = (tier, i) => ({ credits: Math.round(OBJ_CR[tier] * seasonMult(i)), rep: OBJ_REP[tier], points: OBJ_PTS[tier] });

  // The three objectives (easy, medium, hard) of one fixture: a pure function of seed, season, attempt and matchday. ctx { gap, rep } (rep: the reputation points).
  // used: { id: times drawn this season }; a candidate that hit its n is skipped unless nothing else is left.
  function draw(seed, i, n, md, ctx, used) {
    const rt = tierOf(ctx && ctx.rep || 0), gap = ctx && Number.isFinite(ctx.gap) ? ctx.gap : 0, u = used || {}, out = [];
    for (let t = 0; t < 3; t++) {
      const all = OBJ.filter((o) => o.tier === t && o.minSeason <= i && (o.minRep <= 0 || tierOf(o.minRep) <= rt) && (!o.can || o.can({ gap, i, md })));
      const free = all.filter((o) => (u[o.id] || 0) < o.n), cand = free.length ? free : all;
      out.push(cand[(prng(mix(seed, i, n, md, t, 0x0b1))() * cand.length) | 0].id);
    }
    return out;
  }

  // ------------------------------------------------------------------ season objectives (5.3)
  // Tracked in sn.tally (added to after every fixture), paid in seasonEnd. Three per season, one of each tier, drawn by seed and season.
  const SEASON_OBJ = [
    { id: 's_win3', tier: 0, desc: 'Win 3 fixtures', test: (t) => t.w >= 3 },
    { id: 's_goals8', tier: 0, desc: 'Score 8 goals', test: (t) => t.gf >= 8 },
    { id: 's_skill12', tier: 0, desc: 'Perform 12 skill moves', test: (t) => t.skills >= 12 },
    { id: 's_tackle10', tier: 0, desc: 'Win the ball with 10 tackles', test: (t) => t.tackles >= 10 },
    { id: 's_clean2', tier: 1, desc: 'Keep 2 clean sheets', test: (t) => t.clean >= 2 },
    { id: 's_out2', tier: 1, desc: 'Score 2 goals from outside the box', test: (t) => t.goalsOut >= 2 },
    { id: 's_weak2', tier: 1, desc: 'Score 2 goals with your weak foot', test: (t) => t.goalsWeak >= 2 },
    { id: 's_streak3', tier: 1, desc: 'Win 3 fixtures in a row', test: (t) => t.streakMax >= 3 },
    { id: 's_goals12', tier: 1, desc: 'Score 12 goals', test: (t) => t.gf >= 12 },
    { id: 's_top3', tier: 2, desc: 'Finish in the top 3', test: (t, pos) => pos <= 3 },
    { id: 's_win5', tier: 2, desc: 'Win 5 fixtures', test: (t) => t.w >= 5 },
    { id: 's_streak5', tier: 2, desc: 'Win 5 fixtures in a row', test: (t) => t.streakMax >= 5 },
    { id: 's_clean3', tier: 2, desc: 'Keep 3 clean sheets', test: (t) => t.clean >= 3 },
    { id: 's_stronger2', tier: 2, desc: 'Beat 2 stronger opponents', test: (t) => t.stronger >= 2 },
  ];
  const SEASON_BY = Object.fromEntries(SEASON_OBJ.map((o) => [o.id, o]));
  const S_CR = [100, 200, 300], S_REP = [15, 30, 60], S_PTS = [1, 2, 3];
  const seasonReward = (tier, i) => ({ credits: Math.round(S_CR[tier] * seasonMult(i)), rep: S_REP[tier], points: S_PTS[tier] });
  function seasonObjs(seed, i, n) {
    return [0, 1, 2].map((t) => { const c = SEASON_OBJ.filter((o) => o.tier === t); return c[(prng(mix(seed, i, n, t, 0x5ba))() * c.length) | 0].id; });
  }
  const freshTally = () => ({ p: 0, w: 0, gf: 0, ga: 0, skills: 0, tackles: 0, goalsOut: 0, goalsWeak: 0, clean: 0, stronger: 0, streak: 0, streakMax: 0, noLoss: 0 });
  function tallyAdd(t, m) {
    t.p++; t.gf += m.gf; t.ga += m.ga; t.skills += m.skills; t.tackles += m.tackles; t.goalsOut += m.goalsOut; t.goalsWeak += m.goalsWeak;
    if (m.won) { t.w++; t.streak++; t.streakMax = Math.max(t.streakMax, t.streak); if (m.ga === 0) t.clean++; if (m.ovrGap >= 1) t.stronger++; } else t.streak = 0;
    if (m.lost === 0) t.noLoss++;
  }
  // economy ceiling for objectives over a whole career (five seasons, every objective done): asserted in tools/season-test.js
  function objCreditMax() { let s = 0; for (let i = 0; i < ISO.SEASONS.length; i++) s += 7 * (OBJ_CR[0] + OBJ_CR[1] + OBJ_CR[2]) * seasonMult(i) + S_CR.reduce((a, b) => a + Math.round(b * seasonMult(i)), 0); return Math.round(s); }
  const OBJ_CREDIT_CAP = 19000;

  // ------------------------------------------------------------------ reputation (5.4)
  const REP_TIERS = [[0, 'ROOKIE'], [100, 'PROSPECT'], [300, 'RISING STAR'], [700, 'FIRST CHOICE'], [1500, 'STAR'], [3000, 'SUPERSTAR'], [5000, 'LEGEND']];
  const tierOf = (rep) => { let t = 0; for (let k = 0; k < REP_TIERS.length; k++) if (rep >= REP_TIERS[k][0]) t = k; return t; };
  const tierInfo = (rep) => { const t = tierOf(rep), nx = REP_TIERS[t + 1]; return { tier: t, name: REP_TIERS[t][1], from: REP_TIERS[t][0], next: nx ? nx[0] : null, nextName: nx ? nx[1] : null }; };
  // What a tier unlocks. kits / looks index the END-appended CAREER_KITS / CAREER_LOOKS in profile.js (the first six are free, indices never move); objectives: minRep above;
  // rivals: challenge definitions, data only (the rivalry system is session 3)
  const KIT_REQ = [0, 0, 0, 0, 0, 0, 2, 3, 4, 5], LOOK_REQ = [0, 0, 0, 0, 0, 0, 2, 3, 4, 5];
  const RIVAL_CH = [{ id: 'rv1', tier: 3, desc: 'Beat a rival in a league fixture' }, { id: 'rv2', tier: 4, desc: 'Beat a rival without conceding' }, { id: 'rv3', tier: 5, desc: 'Beat a rival 3-0' }];
  const kitOk = (k, rep) => tierOf(rep) >= (KIT_REQ[k] || 0), lookOk = (k, rep) => tierOf(rep) >= (LOOK_REQ[k] || 0);
  // reputation from one fixture (never negative: reputation is monotonic). The parts are listed for the end screen.
  function matchRep(m, streak) {
    const p = {};
    if (m.won) { p.win = 8; if (m.ovrGap > 0) p.stronger = Math.min(10, m.ovrGap); if (streak > 1) p.streak = 2 * Math.min(5, streak - 1); }
    p.goals = Math.min(6, m.gf);
    p.rating = Math.max(0, Math.round((m.rating - 6) * 2));
    p.skills = Math.min(3, Math.floor((m.skillsOk || 0) / 3));
    return p;
  }
  const sumParts = (p) => Object.values(p).reduce((a, b) => a + b, 0);
  const SEASON_REP = { champion: 60, up: 30, stay: 10, down: 0 };
  const seasonRep = (move, i) => (SEASON_REP[move] || 0) + (move === 'champion' || move === 'up' ? 10 * (i | 0) : 0);

  // ------------------------------------------------------------------ training (5.2)
  // measure(m): raw XP of a fixture for the programme (capped at 100 here); the chosen focus doubles it. drills: existing drills a training token can spend
  // (data: sprint, strength and endurance are match-only until 4.3 adds drills). The XP scales were set from the sim's per-match event averages (PHASE5_NOTES.md).
  const TRAIN = [
    { id: 'sprint', name: 'SPRINT TRAINING', attrs: ['pac', 'acc'], drills: [], tip: 'Stop-and-go bursts', measure: (m) => 14 * m.bursts },
    { id: 'dribbling', name: 'DRIBBLING', attrs: ['dri', 'agi'], drills: ['oneonone'], tip: 'Defenders beaten on the ball and skill moves', measure: (m) => 4 * m.beats + 4 * m.skillsOk },
    { id: 'finishing', name: 'FINISHING', attrs: ['fin', 'sho'], drills: ['target', 'penalty', 'power', 'oneonone'], tip: 'Shots on target and goals', measure: (m) => 3 * m.sot + 10 * m.gf + 10 * m.goalsOut },
    { id: 'strength', name: 'STRENGTH', attrs: ['str', 'bal'], drills: [], tip: 'Tackles won and shoulder challenges', measure: (m) => 6 * m.bumps + 5 * m.tackles },
    { id: 'technical', name: 'TECHNICAL', attrs: ['bct', 'skl'], drills: ['finesse', 'freekick', 'chip'], tip: 'Skill moves and weak-foot goals', measure: (m) => 10 * m.skillsOk + 25 * m.goalsWeak },
    { id: 'endurance', name: 'ENDURANCE', attrs: ['sta'], drills: [], tip: 'Minutes played', measure: (m) => 0.7 * m.time },
  ];
  const TRAIN_BY = Object.fromEntries(TRAIN.map((t) => [t.id, t]));
  const XP_CAP = 100, XP_BANK = 400, TOKEN_MAX = 2;
  // +1 attribute costs 100 x the upgrade cost of the next level in XP, so XP / 100 is worth the same upgrade points whatever the level
  const xpCost = (v) => 100 * upCost(v);
  // spend a programme's XP: the lowest attribute of the programme first (ties by order), never above the season cap. Returns [{ k, from, to }].
  function trainApply(C, progId, cap) {
    const T = TRAIN_BY[progId], gains = [];
    if (!T) return gains;
    for (let guard = 0; guard < 200; guard++) {
      let k = null;
      for (const a of T.attrs) if (C.attr[a] < Math.min(99, cap) && (k === null || C.attr[a] < C.attr[k])) k = a;
      if (k === null) { C.xp[progId] = Math.min(C.xp[progId], XP_BANK); break; }
      const need = xpCost(C.attr[k]);
      if (C.xp[progId] < need) break;
      C.xp[progId] -= need; C.attr[k]++; C.trained[k] = (C.trained[k] | 0) + 1;
      gains.push({ k, from: C.attr[k] - 1, to: C.attr[k] });
    }
    return gains;
  }
  const mergeGains = (gs) => { const o = {}; for (const g of gs) { o[g.k] = o[g.k] || { k: g.k, from: g.from, to: g.to }; o[g.k].to = g.to; } return Object.values(o); };
  function addXp(C, progId, raw, cap) {
    const f = C.focus === progId ? 2 : 1, x = Math.round(clamp(raw, 0, XP_CAP) * f);
    C.xp[progId] = Math.min(XP_BANK + 200, (C.xp[progId] || 0) + x);
    return { x, gains: trainApply(C, progId, cap) };
  }
  // drill XP: the score as a share of the drill's maximum, up to 100 (doubled on the focus)
  const drillRaw = (score, max) => Math.round(XP_CAP * clamp(max > 0 ? score / max : 0, 0, 1));
  const progForDrill = (progId, kind) => { const T = TRAIN_BY[progId]; return !!T && T.drills.includes(kind); };

  // ------------------------------------------------------------------ the career's state (every field keyed on shape; old careers are back-filled)
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  function norm(C) {
    const keys = ISO.ATTRS.map((a) => a[0]);
    if (!isObj(C.trained)) C.trained = {};
    for (const k of Object.keys(C.trained)) { if (!keys.includes(k)) delete C.trained[k]; else C.trained[k] = Math.min(nonNeg(C.trained[k]), 99); }
    if (!isObj(C.xp)) C.xp = {};
    for (const T of TRAIN) C.xp[T.id] = Math.min(nonNeg(C.xp[T.id]), XP_BANK + 200);
    for (const k of Object.keys(C.xp)) if (!TRAIN_BY[k]) delete C.xp[k];
    C.focus = TRAIN_BY[C.focus] ? C.focus : 'finishing';
    C.tokens = Number.isFinite(C.tokens) ? clamp(Math.floor(C.tokens), 0, TOKEN_MAX) : 1;
    C.rep = nonNeg(C.rep);
    C.streak = Math.min(nonNeg(C.streak), 99);
    C.traits = Array.isArray(C.traits) ? C.traits.filter((id) => typeof id === 'string' && ISO.TRAITS && ISO.TRAITS[id]) : null;
    if (isObj(C.obj) && typeof C.obj.sk === 'string' && Array.isArray(C.obj.ids) && C.obj.ids.length === 3 && C.obj.ids.every((id) => OBJ_BY[id]) && Number.isInteger(C.obj.md) && isObj(C.obj.used)) {
      for (const id of Object.keys(C.obj.used)) if (!OBJ_BY[id]) delete C.obj.used[id]; else C.obj.used[id] = nonNeg(C.obj.used[id]);
    } else C.obj = null;
    if (C.sn && typeof C.sn === 'object') { const t = C.sn.tally, f = freshTally(); C.sn.tally = isObj(t) ? Object.fromEntries(Object.keys(f).map((k) => [k, nonNeg(t[k])])) : f; }
  }
  // the objectives of the fixture about to be played (drawn once per matchday, remembered so a reload shows the same three)
  function objectivesFor(C, ctx) {
    const sn = C.sn, sk = sn.i + '.' + sn.n;
    if (!C.obj || C.obj.sk !== sk) C.obj = { sk, md: -1, ids: [], used: {} };
    if (C.obj.md !== sn.md || C.obj.ids.length !== 3) {
      C.obj.ids = draw(C.seed, sn.i, sn.n, sn.md, { gap: ctx && ctx.gap, rep: C.rep }, C.obj.used); C.obj.md = sn.md;
      for (const id of C.obj.ids) C.obj.used[id] = (C.obj.used[id] || 0) + 1;
    }
    return C.obj.ids;
  }
  // Pay one finished (not forfeited) fixture into the career: the objectives, the season tally, XP, a token, reputation. Mutates C and returns a report;
  // the profile adds the credits and upgrade points. info: { ids (the fixture's objectives), i (season) }. C.sn.md / res already count this fixture.
  function settle(C, m, info) {
    const i = info.i | 0, cap = ISO.SEASONS[i].cap, rep0 = C.rep, rep = {};
    C.streak = m.won ? Math.min(99, C.streak + 1) : 0;
    const objs = (info.ids || []).map((id) => { const o = OBJ_BY[id], done = !!o.test(m), r = objReward(o.tier, i); return Object.assign({ id, tier: o.tier, desc: o.desc, done }, r); });
    let credits = 0, points = 0, objRep = 0;
    for (const o of objs) if (o.done) { credits += o.credits; points += o.points; objRep += o.rep; }
    if (C.sn) { if (!isObj(C.sn.tally)) C.sn.tally = freshTally(); tallyAdd(C.sn.tally, m); }
    const parts = matchRep(m, C.streak); if (objRep) parts.objectives = objRep;
    const repGain = sumParts(parts); C.rep += repGain;
    const xp = {}, gains = [];
    for (const T of TRAIN) { const a = addXp(C, T.id, T.measure(m), cap); xp[T.id] = a.x; gains.push(...a.gains); }
    C.tokens = Math.min(TOKEN_MAX, C.tokens + 1);
    return { objs, done: objs.filter((o) => o.done).length, credits, points, rep: repGain, repParts: parts, rating: m.rating, xp, gains: mergeGains(gains), tokens: C.tokens, tier: tierOf(C.rep), tierUp: tierOf(C.rep) > tierOf(rep0), streak: C.streak };
  }
  // the season is over: the three season objectives, the finish and the rep. pos: final position, move: the finish() move.
  function seasonSettle(C, pos, move) {
    const sn = C.sn, i = sn.i, t = sn.tally || freshTally(), rep0 = C.rep;
    const objs = seasonObjs(C.seed, i, sn.n).map((id) => { const o = SEASON_BY[id], done = !!o.test(t, pos), r = seasonReward(o.tier, i); return Object.assign({ id, tier: o.tier, desc: o.desc, done }, r); });
    let credits = 0, points = 0, rep = seasonRep(move, i);
    for (const o of objs) if (o.done) { credits += o.credits; points += o.points; rep += o.rep; }
    C.rep += rep;
    return { objs, credits, points, rep, tier: tierOf(C.rep), tierUp: tierOf(C.rep) > tierOf(rep0) };
  }
  // a drill played on a training token: XP for the programme, doubled on the focus
  function drillSettle(C, progId, kind, score, max) {
    if (!progForDrill(progId, kind)) return null;
    const a = addXp(C, progId, drillRaw(score, max), ISO.SEASONS[C.sn.i].cap);
    return { prog: progId, kind, xp: a.x, gains: a.gains };
  }

  Object.assign(CA, {
    Tracker: { create, onEvent, finish }, rating, OBJ, OBJ_BY, TIERS, OBJ_CR, OBJ_REP, OBJ_PTS, objReward, draw, SEASON_OBJ, SEASON_BY, seasonReward, seasonObjs, freshTally, tallyAdd, objCreditMax, OBJ_CREDIT_CAP,
    REP_TIERS, tierOf, tierInfo, KIT_REQ, LOOK_REQ, RIVAL_CH, kitOk, lookOk, matchRep, seasonRep, TRAIN, TRAIN_BY, XP_CAP, XP_BANK, TOKEN_MAX, xpCost, trainApply, addXp, drillRaw, progForDrill,
    norm, objectivesFor, settle, seasonSettle, drillSettle, seasonMult,
  });
})();
