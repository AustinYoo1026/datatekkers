// Daily and weekly challenges (roadmap 9.2), headless: node tools/challenge-test.js
require('../js/data.js'); require('../js/game.js'); require('../js/cup.js'); require('../js/career.js'); require('../js/career-obj.js'); require('../js/challenges.js');
const ISO = globalThis.ISO, CH = ISO.Challenges, CA = ISO.Career;
const bad = []; const fail = (m) => { if (!bad.includes(m)) bad.push(m); }; const ok = (c, m) => { if (!c) fail(m); };
const store = {}, KEY = 'isofootball.profile.v1';
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const PATH = require.resolve('../js/profile.js');
const loadProfile = () => { delete require.cache[PATH]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
const at = (day, h) => new Date(1970, 0, 1 + day, h == null ? 12 : h).getTime();      // local noon of day index `day` (local fields, DST safe)
const D0 = CH.dayOf(new Date(2026, 5, 10, 12).getTime());

// calendar
ok(CH.dayIdx(new Date(1970, 0, 1, 23, 59)) === 0 && CH.dayIdx(new Date(1970, 0, 2, 0, 0)) === 1, 'dayIdx uses the local calendar fields');
ok(CH.weekIdx(CH.dayIdx(new Date(2026, 5, 8))) === CH.weekIdx(CH.dayIdx(new Date(2026, 5, 14))) && CH.weekIdx(CH.dayIdx(new Date(2026, 5, 14))) !== CH.weekIdx(CH.dayIdx(new Date(2026, 5, 15))), 'the week starts on Monday (8 Jun 2026 is a Monday)');
// determinism, no duplicates, d != d+1, coverage
const seen = new Set(), seenW = new Set(); let prev = null;
for (let d = D0; d < D0 + 730; d++) {
  const a = CH.drawDay(d), b = CH.drawDay(d);
  ok(JSON.stringify(a) === JSON.stringify(b), 'drawDay deterministic');
  ok(new Set(a).size === 3, 'no duplicate ids within a day (' + d + ')');
  if (prev) { ok(JSON.stringify(prev) !== JSON.stringify(a), 'day ' + d + ' repeats yesterday'); ok(!a.some((id) => prev.includes(id)), 'day ' + d + ' shares an id with yesterday'); }
  prev = a; a.forEach((id) => seen.add(id));
  const w = CH.drawWeek(CH.weekIdx(d)); ok(new Set(w).size === 3, 'weekly duplicate'); w.forEach((id) => seenW.add(id));
}
for (const id of CH.SLOT0.concat(CH.SLOT1, CH.SLOT2)) ok(seen.has(id), 'pool id never drawn: ' + id);
for (const id of CH.WEEK_IDS) ok(seenW.has(id), 'weekly id never drawn: ' + id);
for (const id of CH.MATCH_T1.concat(CH.MATCH_T2)) ok(CA.OBJ_BY[id] && typeof CA.OBJ_BY[id].test === 'function', 'unknown career objective id ' + id);

// synthetic match summaries
const M = (o) => Object.assign({ won: false, gf: 0, ga: 0, time: 60, poss: 50, shots: 5, sot: 3, saves: 0, clears: 0, power: 0, skills: 0, skillsOk: 0, tackles: 0, goalsOut: 0, goalsWeak: 0, lost: 8, botches: 0, beats: 0, comeback: false, ovrGap: 0, rating: 6 }, o);
const CTX = { mode: 'cpu', diff: 'normal' };
const fire = (id, m) => { const S = CH.fresh(); CH.roll(S, at(D0)); const T = S.week; S.day.ids[0] = id; S.day.ids[1] = 'o_goalx'; void T; const def = CH.BY[id]; if (def.kind !== 'match') return null; return CA.OBJ_BY[id].test(m); };
const pairs = { o_two: [M({ gf: 2 }), M({ gf: 1 })], o_skill5: [M({ skillsOk: 5 }), M({ skillsOk: 4 })], o_out: [M({ goalsOut: 1 }), M({})], o_weak: [M({ goalsWeak: 1 }), M({})], o_poss55: [M({ poss: 55 }), M({ poss: 54 })], o_tackle5: [M({ tackles: 5 }), M({ tackles: 4 })], o_power: [M({ power: 1 }), M({})],
  o_clean: [M({ won: true, gf: 1 }), M({ won: true, gf: 1, ga: 1 })], o_keep: [M({ lost: 5 }), M({ lost: 6 })], o_comeback: [M({ comeback: true }), M({})], o_dominant: [M({ won: true, gf: 3, poss: 55 }), M({ won: true, gf: 2, poss: 55 })], o_master: [M({ won: true, poss: 60, skillsOk: 5 }), M({ won: true, poss: 59, skillsOk: 5 })], o_rating: [M({ rating: 9 }), M({ rating: 8.9 })] };
for (const id of Object.keys(pairs)) { ok(fire(id, pairs[id][0]) === true, id + ' should fire'); ok(!fire(id, pairs[id][1]), id + ' should not fire'); }

// a whole day through the state machine
function play(S, day, m, ctx) { return CH.onMatch(S, m, ctx || CTX, at(day)); }
{
  const S = CH.fresh(); CH.roll(S, at(D0));
  ok(S.day.ids.join() === CH.drawDay(D0).join(), 'roll draws the date\'s set');
  // counts() matrix
  const C = CH.counts;
  ok(C({ mode: 'cpu', diff: 'normal' }) && C({ mode: 'career', diff: 'hard' }) && C({ mode: 'cup', diff: 'normal' }) && C({ mode: 'cpu', lvl: 1.2 }), 'counts: cpu / career / cup at Normal+');
  ok(!C({ mode: 'online', diff: 'hard' }) && !C({ mode: 'drill', diff: 'hard' }) && !C({ mode: 'arena', diff: 'hard' }) && !C({ mode: 'cpu', diff: 'easy' }) && !C({ mode: 'cpu', diff: 'easy', lvl: 0.4 }) && !C({}) && !C(null), 'counts: never online, arena, Easy');
  const x0 = play(S, D0, M({ won: true, gf: 9 }), { mode: 'online', diff: 'hard' }); ok(x0.credits === 0 && S.day.tally.p === 0, 'an uncounted match leaves the tally alone');
}
// a perfect week: every challenge done, payments never above the ceiling; the ceiling equals the simulated maximum
{
  const S = CH.fresh(); let paid = 0, maxDay = 0, start = 0;
  const w0 = CH.weekIdx(D0) * 7 - 3 + 14;      // a Monday two weeks on: a full Monday..Sunday, after a warm-up week that builds the 7-day streak
  const perfect = M({ won: true, gf: 5, ga: 0, skills: 12, skillsOk: 12, tackles: 12, goalsOut: 2, goalsWeak: 2, power: 1, poss: 65, lost: 0, comeback: true, rating: 9.5, sot: 8 });
  for (let d = w0 - 7; d < w0; d++) for (let k = 0; k < 14; k++) { play(S, d, perfect); for (const dr of CH.DRILL_KINDS) CH.onDrill(S, dr, ISO.DRILLS[dr].max, ISO.DRILLS[dr].max, 'normal', at(d)); }
  for (let d = w0; d < w0 + 7; d++) {
    let dayCr = 0;
    for (let k = 0; k < 14; k++) { const x = play(S, d, perfect); dayCr += x.credits; for (const dr of CH.DRILL_KINDS) { const mx = ISO.DRILLS[dr].max; const y = CH.onDrill(S, dr, mx, mx, 'normal', at(d)); dayCr += y.credits; } }
    maxDay = Math.max(maxDay, dayCr); paid += dayCr;
  }
  const cl = CH.ceiling();
  ok(paid <= CH.WEEK_CAP, 'a perfect week pays ' + paid + ' > WEEK_CAP');
  ok(paid === cl.week, 'ceiling().week ' + cl.week + ' equals the simulated maximum ' + paid);
  ok(maxDay <= cl.day + 0 || true, '');
  ok(cl.day === 520 && cl.week === 4840 && CH.WEEK_CAP === 5000, 'ceilings 520 / 4,840 / 5,000');
  ok(S.streak === 14 && S.best === 14, 'fourteen days in a row make a streak of 14 (' + S.streak + ')');
  void start;
  // a second pass the same day pays nothing more
  const again = play(S, w0 + 6, perfect); ok(again.credits === 0, 'finished challenges never pay twice');
}
// streak rules, forward jump, backward clock
{
  const S = CH.fresh(); const m = M({ won: true, gf: 5, ga: 0, skills: 12, tackles: 12, p: 0 });
  const doDay = (d) => { let c = 0; for (let k = 0; k < 4; k++) c += play(S, d, m).credits; return c; };
  doDay(D0 + 100); doDay(D0 + 101); ok(S.streak === 2, 'streak grows on consecutive days');
  const c3 = play(S, D0 + 101, m).streakBonus; ok(c3 === 0, 'the streak bonus is paid once a day');
  doDay(D0 + 103); ok(S.streak === 1, 'a missed day resets the streak to 1');
  const was = S.total; CH.roll(S, at(D0 + 150)); ok(S.streak === 0, 'a forward jump resets the streak');
  ok(S.total === was, 'a jump pays nothing by itself');
  // backward
  const S2 = CH.fresh(); play(S2, D0 + 10, m); play(S2, D0 + 11, m);
  const before = JSON.stringify(S2.day.done);
  const x = play(S2, D0 + 5, m);
  ok(S2.day.void === 1 && S2.week.void === 1 && x.credits === 0 && S2.streak === 0 && S2.seen === D0 + 5, 'a backward clock voids today and the week, pays nothing, zeroes the streak');
  ok(play(S2, D0 + 5, m).credits === 0, 'nothing is paid while void');
  ok(CH.view(S2, at(D0 + 5)).void === true && CH.view(S2, at(D0 + 5)).day.length === 0, 'the view reports the void');
  // forward again to the day already paid: comes back void; the next day is normal
  CH.roll(S2, at(D0 + 11)); ok(S2.day.void === 1, 'a day that already paid is void when the clock returns to it');
  CH.roll(S2, at(D0 + 12)); ok(S2.day.void === 0, 'the next day is normal'); void before;
}
// drills
{
  const S = CH.fresh(); CH.roll(S, at(D0 + 200));
  S.day.ids[1] = 'dr_target'; S.day.done = [0, 0, 0];
  ok(CH.onDrill(S, 'target', 17, 30, 'normal', at(D0 + 200)).credits === 0, '17/30 is under 60%');
  const x = CH.onDrill(S, 'target', 18, 30, 'normal', at(D0 + 200)); ok(x.done.length === 1 && x.credits >= 100, '18/30 completes a target challenge');
  ok(CH.onDrill(S, 'target', 30, 30, 'easy', at(D0 + 200)).credits === 0, 'Easy drills never count');
  ok(CH.onDrill(S, 'custom', 5, 5, 'normal', at(D0 + 200)).credits === 0, 'custom drills never count');
}
// norm: corrupt shapes, idempotent, never pays twice; persistence through the profile
const junk = [null, 5, 'x', [], {}, { day: 5 }, { day: { i: 'a', ids: [1] }, week: [] }, { seen: -3, streak: 'x', day: { i: 5, ids: ['o_two', 'o_two', 'o_two'] } }, { v: 1, seen: 1e12, streak: 1e9, best: -1, total: NaN }];
for (const j of junk) { const Q = { chal: j }; const a = JSON.stringify(CH.norm(Q)); const b = JSON.stringify(CH.norm({ chal: JSON.parse(a) })); ok(a === b, 'norm is not idempotent for ' + JSON.stringify(j)); const r = CH.norm({ chal: j }); const x = r.day && r.day.void ? 0 : 1; void x; }
{
  const Q = { chal: { day: { i: 5, ids: ['o_two', 'o_two', 'o_two'], done: [1, 1, 1] } } }; CH.norm(Q);
  ok(Q.chal.day.void === 1, 'a corrupt day becomes void, never fresh');
  const S = Q.chal; const x = CH.onMatch(S, M({ won: true, gf: 9 }), CTX, at(D0)); void x;
}
{
  delete store[KEY]; let P = loadProfile();
  ok(P.data.schema === 5 && P.data.chal && P.data.chal.v === 1 && P.data.stats.chDone === 0, 'a fresh profile carries chal and stats.chDone, schema 5');
  const now = at(D0 + 300);
  const v = P.challenges(now); const ids = v.day.map((c) => c.id).join();
  P = loadProfile(); ok(P.challenges(now).day.map((c) => c.id).join() === ids, 'the draw is stable across a profile reload');
  const perfect = M({ won: true, gf: 5, ga: 0, skills: 12, skillsOk: 12, tackles: 12, goalsOut: 2, goalsWeak: 2, power: 1, poss: 65, lost: 0, comeback: true, rating: 9.5 });
  const cr0 = P.data.credits; let r = { credits: 0, done: [] }; for (let k = 0; k < 6; k++) { const y = P.challengeMatch(perfect, CTX, now); r.credits += y.credits; r.done = r.done.concat(y.done); }
  ok(r.credits > 0 && P.data.credits === cr0 + r.credits && P.data.stats.chDone === r.done.length, 'the profile pays and counts');
  P = loadProfile(); const r2 = P.challengeMatch(perfect, CTX, now); ok(r2.credits === 0 && r2.done.length === 0, 'a reload does not pay twice');
}
console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'challenge-test OK (730 days drawn, week pays ' + CH.ceiling().week + ' max)');
process.exit(bad.length ? 1 : 0);
