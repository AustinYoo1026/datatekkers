/* ISO FOOTBALL — daily and weekly challenges (roadmap 9.2). LOCAL ONLY: no server, no leaderboard, credits only.
   Pure logic, node-loadable after career-obj.js (needs ISO.Cup.prng / mix, ISO.Career.OBJ_BY / freshTally / tallyAdd, ISO.DRILLS). No DOM, no Math.random, no clock:
   every function takes `now` (ms) from the caller. The profile (js/profile.js) stores the state (`chal`) and pays; the overlay is js/challenges-ui.js.
   Honest limits: the date is the device clock, so a FORWARD clock change cannot be detected (it earns at most `ceiling().day` credits per simulated day); a BACKWARD
   change voids the current day and week; the profile is editable localStorage anyway. Online matches pay nothing. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const CA = ISO.Career;
  const prng = (s) => ISO.Cup.prng(s), mix = (...n) => ISO.Cup.mix(...n);

  // ------------------------------------------------------------------ calendar (the player's LOCAL date; the week starts on Monday)
  const dayIdx = (date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  const weekIdx = (day) => Math.floor((day + 3) / 7);
  const dayOf = (now) => dayIdx(new Date(now));
  const nextReset = (now) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now; };      // ms to the next local midnight
  const nextWeekReset = (now) => { const d = new Date(now), w = weekIdx(dayIdx(d)), days = (w + 1) * 7 - 3 - dayIdx(d); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime() - now; };

  // ------------------------------------------------------------------ pools
  // kind 'match': the test of a MyCareer objective (ISO.Career.OBJ_BY[id].test(m)) on ONE match; 'tally': a counter over the day / week; 'drill': one drill run
  const MATCH_T1 = ['o_two', 'o_skill5', 'o_out', 'o_weak', 'o_poss55', 'o_tackle5', 'o_power'];
  const MATCH_T2 = ['o_clean', 'o_keep', 'o_comeback', 'o_dominant', 'o_master', 'o_rating'];
  const DRILL_KINDS = ['penalty', 'target', 'chip', 'freekick', 'oneonone', 'longshot', 'finesse', 'power'];
  const DAY_TALLY = [
    { id: 'd_win2', key: 'w', n: 2, desc: 'Win 2 matches' }, { id: 'd_goal5', key: 'gf', n: 5, desc: 'Score 5 goals' }, { id: 'd_skill8', key: 'skills', n: 8, desc: 'Perform 8 skill moves' },
    { id: 'd_tackle8', key: 'tackles', n: 8, desc: 'Win the ball with 8 tackles' }, { id: 'd_play3', key: 'p', n: 3, desc: 'Play 3 matches' },
  ];
  const WEEK = [
    { id: 'w_win10', key: 'w', n: 10, desc: 'Win 10 matches' }, { id: 'w_goal25', key: 'gf', n: 25, desc: 'Score 25 goals' }, { id: 'w_clean4', key: 'clean', n: 4, desc: 'Keep 4 clean sheets' },
    { id: 'w_out5', key: 'goalsOut', n: 5, desc: 'Score 5 goals from outside the box' }, { id: 'w_weak3', key: 'goalsWeak', n: 3, desc: 'Score 3 goals with your weak foot' },
    { id: 'w_skill40', key: 'skills', n: 40, desc: 'Perform 40 skill moves' }, { id: 'w_tackle40', key: 'tackles', n: 40, desc: 'Win the ball with 40 tackles' },
    { id: 'w_streak4', key: 'streakMax', n: 4, desc: 'Win 4 matches in a row' }, { id: 'w_drill10', key: 'drills', n: 10, desc: 'Finish 10 drills' }, { id: 'w_daily5', key: 'dailies', n: 5, desc: 'Complete 5 daily challenges' },
  ];
  const drillMax = (kind) => (ISO.DRILLS && ISO.DRILLS[kind] ? ISO.DRILLS[kind].max : 5);
  const drillNeed = (kind) => (kind === 'penalty' ? drillMax(kind) : Math.ceil(0.6 * drillMax(kind)));      // the shootout is won (the UI passes a won shootout as the full score)
  const DRILL = DRILL_KINDS.map((k) => ({ id: 'dr_' + k, dk: k, desc: k === 'penalty' ? 'Win the penalty shootout' : 'Score 60% of the points in the ' + ((ISO.DRILLS && ISO.DRILLS[k] && ISO.DRILLS[k].name) || k).toLowerCase() + ' drill' }));
  const BY = {};
  for (const d of DAY_TALLY) BY[d.id] = Object.assign({ kind: 'tally', tier: 0, scope: 'day' }, d);
  for (const id of MATCH_T1) BY[id] = { id, kind: 'match', tier: 1, scope: 'day', desc: CA && CA.OBJ_BY[id] ? CA.OBJ_BY[id].desc : id, n: 1 };
  for (const id of MATCH_T2) BY[id] = { id, kind: 'match', tier: 2, scope: 'day', desc: CA && CA.OBJ_BY[id] ? CA.OBJ_BY[id].desc : id, n: 1 };
  for (const d of DRILL) BY[d.id] = Object.assign({ kind: 'drill', tier: 1, scope: 'day' }, d);
  for (const d of WEEK) BY[d.id] = Object.assign({ kind: 'tally', tier: 0, scope: 'week' }, d);
  const SLOT0 = DAY_TALLY.map((d) => d.id), SLOT1 = MATCH_T1.concat(DRILL.map((d) => d.id)), SLOT2 = MATCH_T2.slice(), WEEK_IDS = WEEK.map((d) => d.id);
  const drillN = (id) => drillNeed(BY[id].dk);

  // ------------------------------------------------------------------ rewards
  const D_CR = [60, 100, 160], D_ALL = 80, W_CR = [250, 400, 550], STREAK_STEP = 20, STREAK_CAP = 6, WEEK_CAP = 5000;
  const streakBonus = (streak) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, streak - 1));
  const DAY_MAX = D_CR[0] + D_CR[1] + D_CR[2] + D_ALL + STREAK_STEP * STREAK_CAP;      // 520
  const ceiling = () => ({ day: DAY_MAX, week: 7 * DAY_MAX + W_CR[0] + W_CR[1] + W_CR[2], cap: WEEK_CAP });      // week: 4,840

  // ------------------------------------------------------------------ the draw (the same for every device on a date)
  const pick = (pool, day, slot, avoid) => { const p = pool.filter((id) => !avoid || avoid.indexOf(id) < 0), q = p.length ? p : pool; return q[(prng(mix(day, slot, 0xda11))() * q.length) | 0]; };
  // A day is drawn from a fixed epoch onwards (day after day, each avoiding the one before), so "not yesterday's three" is exact and still the same on every device.
  const EPOCH = 19000, memo = new Map();
  const draw0 = (day) => [pick(SLOT0, day, 0), pick(SLOT1, day, 1), pick(SLOT2, day, 2)];
  function drawDay(day) {
    day = Math.round(day);
    if (day <= EPOCH) return draw0(day);
    if (memo.has(day)) return memo.get(day).slice();
    let k = day; while (k > EPOCH && !memo.has(k - 1)) k--;
    let y = k > EPOCH ? memo.get(k - 1) : draw0(EPOCH);
    for (let d = Math.max(k, EPOCH + 1); d <= day; d++) { y = [pick(SLOT0, d, 0, [y[0]]), pick(SLOT1, d, 1, [y[1]]), pick(SLOT2, d, 2, [y[2]])]; memo.set(d, y); }
    return y.slice();
  }
  function drawWeek(week) {
    const a = WEEK_IDS.slice(), r = prng(mix(week, 0xbee)), out = [];
    for (let i = 0; i < 3; i++) out.push(a.splice((r() * a.length) | 0, 1)[0]);
    return out;
  }

  // ------------------------------------------------------------------ state
  const freshDayTally = () => (CA ? CA.freshTally() : { p: 0, w: 0, gf: 0, ga: 0, skills: 0, tackles: 0, goalsOut: 0, goalsWeak: 0, clean: 0, streakMax: 0 });
  const freshWeekTally = () => Object.assign(freshDayTally(), { drills: 0, dailies: 0 });
  const fresh = () => ({ v: 1, seen: 0, streak: 0, best: 0, lastDone: 0, total: 0, day: null, week: null });
  const newDay = (i, voided) => ({ i, ids: drawDay(i), done: [0, 0, 0], p: [0, 0, 0], tally: freshDayTally(), all: 0, bonus: 0, void: voided ? 1 : 0 });
  const newWeek = (i, voided) => ({ i, ids: drawWeek(i), done: [0, 0, 0], tally: freshWeekTally(), void: voided ? 1 : 0 });
  const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
  const flags = (a) => [0, 1, 2].map((k) => (Array.isArray(a) && a[k] ? 1 : 0));
  const tallyOf = (t, base) => { const o = base(); if (t && typeof t === 'object') for (const k of Object.keys(o)) o[k] = int(t[k], 0, 1e6); return o; };
  // Sanitise by shape (idempotent). A day or week that cannot be trusted becomes a VOID one: nothing is paid until the next boundary, so corruption never pays twice.
  function norm(Q) {
    let S = Q && Q.chal;
    if (!S || typeof S !== 'object' || Array.isArray(S)) S = fresh();
    const o = fresh();
    o.seen = int(S.seen, 0, 1e6); o.streak = int(S.streak, 0, 1e5); o.best = Math.max(o.streak, int(S.best, 0, 1e5)); o.lastDone = int(S.lastDone, 0, 1e6); o.total = int(S.total, 0, 1e7);
    const d = S.day;
    if (d && typeof d === 'object' && Number.isFinite(d.i) && Array.isArray(d.ids) && d.ids.length === 3 && d.ids.every((id, k) => BY[id] && BY[id].scope === 'day' && id === drawDay(Math.round(d.i))[k])) {
      o.day = { i: Math.round(d.i), ids: d.ids.slice(), done: flags(d.done), p: [0, 1, 2].map((k) => int(d.p && d.p[k], 0, 1e6)), tally: tallyOf(d.tally, freshDayTally), all: d.all ? 1 : 0, bonus: d.bonus ? 1 : 0, void: d.void ? 1 : 0 };
    } else if (d != null) o.day = newDay(o.seen, true);
    const w = S.week;
    if (w && typeof w === 'object' && Number.isFinite(w.i) && Array.isArray(w.ids) && w.ids.length === 3 && w.ids.every((id, k) => id === drawWeek(Math.round(w.i))[k])) {
      o.week = { i: Math.round(w.i), ids: w.ids.slice(), done: flags(w.done), tally: tallyOf(w.tally, freshWeekTally), void: w.void ? 1 : 0 };
    } else if (w != null) o.week = newWeek(weekIdx(o.seen), true);
    if (Q) Q.chal = o;
    return o;
  }
  // Step the state to `now`. Returns true when anything changed.
  function roll(S, now) {
    const day = dayOf(now), wk = weekIdx(day);
    let ch = false;
    if (day < S.seen || (S.day && S.day.i > day)) {      // the clock went BACK: today and this week are void, the streak is gone
      if (!(S.day && S.day.i === day && S.day.void)) S.day = newDay(day, true);
      if (!(S.week && S.week.i === wk && S.week.void)) S.week = newWeek(wk, true);
      S.seen = day; S.streak = 0; return true;
    }
    if (!S.day || day > S.day.i) { if (S.lastDone < day - 1) S.streak = 0; S.day = newDay(day, day <= S.lastDone); ch = true; }      // a day that already paid (the clock went back and forward again) comes back void
    if (!S.week || wk > S.week.i) { S.week = newWeek(wk, false); ch = true; }
    if (S.week && S.week.i > wk) { S.week = newWeek(wk, true); ch = true; }
    if (day > S.seen) { S.seen = day; ch = true; }
    return ch;
  }

  // ------------------------------------------------------------------ what counts
  // cpu, career or cup, against the CPU at Normal or harder. Never online, the Testing Arena or Easy.
  function counts(ctx) {
    if (!ctx || (ctx.mode !== 'cpu' && ctx.mode !== 'career' && ctx.mode !== 'cup')) return false;
    return (Number.isFinite(ctx.lvl) && ctx.lvl >= 1) || (!!ctx.diff && ctx.diff !== 'easy');
  }

  // ------------------------------------------------------------------ progress and payment
  const none = () => ({ done: [], credits: 0, streakBonus: 0, allBonus: 0 });
  const curOf = (S, scope, k) => {
    const T = scope === 'day' ? S.day : S.week, id = T.ids[k], def = BY[id];
    if (def.kind === 'tally') return Math.min(def.n, T.tally[def.key] | 0);
    if (def.kind === 'drill') return Math.min(drillN(id), T.p[k] | 0);
    return T.done[k] ? 1 : 0;
  };
  function finishDay(S, x, day) {      // after at least one daily completed: streak (once a day), the three-of-three bonus
    const T = S.day;
    if (x.done.some((c) => c.scope === 'day') && !T.bonus) {
      T.bonus = 1;
      S.streak = S.lastDone === day - 1 ? S.streak + 1 : S.lastDone === day ? Math.max(1, S.streak) : 1; S.lastDone = day; S.best = Math.max(S.best, S.streak);
      x.streakBonus = streakBonus(S.streak); x.credits += x.streakBonus;
    }
    if (!T.all && T.done.every((v) => v)) { T.all = 1; x.allBonus = D_ALL; x.credits += D_ALL; }
  }
  function settleWeek(S, x) {
    const W = S.week; if (!W || W.void) return;
    for (let k = 0; k < 3; k++) {
      if (W.done[k]) continue;
      const def = BY[W.ids[k]];
      if ((W.tally[def.key] | 0) >= def.n) { W.done[k] = 1; S.total++; x.done.push({ id: def.id, scope: 'week', cr: W_CR[k] }); x.credits += W_CR[k]; }
    }
  }
  // one finished match (m: ISO.Career.Tracker.finish summary)
  function onMatch(S, m, ctx, now) {
    roll(S, now);
    const x = none();
    if (!m || !counts(ctx)) return x;
    const day = dayOf(now), D = S.day, W = S.week;
    if (D && !D.void) {
      CA.tallyAdd(D.tally, m);
      for (let k = 0; k < 3; k++) {
        if (D.done[k]) continue;
        const def = BY[D.ids[k]];
        let ok = false;
        if (def.kind === 'tally') ok = (D.tally[def.key] | 0) >= def.n;
        else if (def.kind === 'match') { try { ok = !!CA.OBJ_BY[def.id].test(m); } catch (e) { ok = false; } }
        if (ok) { D.done[k] = 1; S.total++; x.done.push({ id: def.id, scope: 'day', cr: D_CR[k] }); x.credits += D_CR[k]; }
      }
    }
    if (W && !W.void) {
      CA.tallyAdd(W.tally, m);
      if (D && !D.void) W.tally.dailies += x.done.length;
    }
    if (D && !D.void) finishDay(S, x, day);
    settleWeek(S, x);
    return x;
  }
  // one finished drill (kind 'penalty' passes its shootout as score = max when won, 0 when lost); custom drills never count
  function onDrill(S, kind, score, max, diff, now) {
    roll(S, now);
    const x = none();
    if (!DRILL_KINDS.includes(kind) || !diff || diff === 'easy') return x;
    const day = dayOf(now), D = S.day, W = S.week;
    if (D && !D.void) {
      for (let k = 0; k < 3; k++) {
        const def = BY[D.ids[k]];
        if (def.kind !== 'drill') continue;
        if (def.id !== 'dr_' + kind) continue;
        D.p[k] = Math.max(D.p[k], int(score, 0, 1e6));
        if (!D.done[k] && D.p[k] >= drillNeed(kind)) { D.done[k] = 1; S.total++; x.done.push({ id: def.id, scope: 'day', cr: D_CR[k] }); x.credits += D_CR[k]; }
      }
    }
    if (W && !W.void) { W.tally.drills++; if (D && !D.void) W.tally.dailies += x.done.length; }
    if (D && !D.void) finishDay(S, x, day);
    settleWeek(S, x);
    return x;
  }
  // everything the overlay shows
  function view(S, now) {
    roll(S, now);
    const day = dayOf(now), mk = (scope, T, cr) => T.ids.map((id, k) => { const d = BY[id]; return { id, scope, kind: d.kind, desc: d.desc, n: d.kind === 'tally' ? d.n : d.kind === 'drill' ? drillN(id) : 1, cur: curOf(S, scope, k), done: !!T.done[k], cr: cr[k] }; });
    return { day: S.day.void ? [] : mk('day', S.day, D_CR), week: S.week.void ? [] : mk('week', S.week, W_CR), void: !!(S.day.void || S.week.void), streak: S.lastDone >= day - 1 ? S.streak : 0, best: S.best, total: S.total,
      all: !!S.day.all, allCr: D_ALL, nextStreak: streakBonus((S.lastDone === day ? S.streak : S.lastDone === day - 1 ? S.streak + 1 : 1)), resetIn: nextReset(now), weekResetIn: nextWeekReset(now) };
  }
  ISO.Challenges = { dayIdx, weekIdx, dayOf, nextReset, nextWeekReset, drawDay, drawWeek, draw0, fresh, norm, roll, counts, onMatch, onDrill, view, ceiling, streakBonus, BY, SLOT0, SLOT1, SLOT2, WEEK_IDS, MATCH_T1, MATCH_T2, DRILL_KINDS, D_CR, D_ALL, W_CR, WEEK_CAP, drillNeed };
})();
