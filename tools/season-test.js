// MyCareer seasons (roadmap 5.1), headless: node tools/season-test.js [seeds=200] [--sim]
// Seeded result bots play whole careers through the real profile, with a JSON round trip through a profile reload at every step.
// Asserts termination, promotion-rate bands, a perfect run's points, prize caps. --sim plays one season of CPU-vs-CPU fixtures on the real sim.
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js'); require('../js/cup.js'); require('../js/career.js'); require('../js/career-obj.js'); require('../js/rivals.js'); require('../js/collection.js');
const ISO = globalThis.ISO, CA = ISO.Career, RV = ISO.Rivals, N = +process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 200, SIM = process.argv.includes('--sim');
const bad = [], fail = (m) => { if (!bad.includes(m)) bad.push(m); };
const store = {}, KEY = 'isofootball.profile.v1';
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const PATH = require.resolve('../js/profile.js');
const reload = () => { store[KEY] = JSON.stringify(JSON.parse(store[KEY])); delete require.cache[PATH]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
const FIN = { n: 0, w: 0, ff: 0, cr: 0, rep: 0 };      // finales over the whole run (led is reset per career)
const resetLed = () => { for (const k of Object.keys(led)) led[k] = 0; };
const fresh = (seed) => { resetLed(); delete store[KEY]; delete require.cache[PATH]; delete ISO.Profile; require('../js/profile.js'); const P = ISO.Profile; P.resetCareer(seed); P.data.credits = 0; P.data.career.points = 0; P.save(); return P; };

// Phase 5.2-5.4: a synthetic tracker summary (what ISO.Career.Tracker.finish returns), drawn from the seeded rnd. The means come from tools sim averages of the
// sim (CPU vs CPU: about 8 tackles, 1 burst, 1.7 skills, 8 shots on target, 50% possession per match); skills and bursts are set at about double, as a human plays them.
const led = { bossCr: 0, bossN: 0, bossW: 0, bossFf: 0, bossRep: 0, objCr: 0, objPts: 0, objDone: 0, objN: 0, rep: 0, tPE: 0, xp: 0, gains: 0, sobjCr: 0, sobjPts: 0, tokensUsed: 0 };
const cost = (v) => (v < 70 ? 1 : v < 80 ? 2 : v < 90 ? 3 : 4);
function synth(rnd, won, gf, ga, gap) {
  const R = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const m = { won, gf, ga, time: 55 + R(0, 30), poss: R(40, 62), shots: R(6, 14), sot: Math.max(gf, R(4, 11)), saves: R(0, 4), clears: R(0, 3), power: gf && rnd() < 0.12 ? 1 : 0,
    skills: R(1, 5), tackles: R(5, 11), goalsOut: gf && rnd() < 0.25 ? 1 : 0, goalsWeak: gf && rnd() < 0.5 ? 1 : 0, goalsByType: {}, lost: R(6, 14), botches: rnd() < 0.05 ? 1 : 0, bursts: R(1, 5), bumps: R(0, 2), beats: R(5, 11), ankles: 0, comeback: won && ga > 0 && rnd() < 0.25, ovrGap: gap };
  m.skillsOk = Math.max(0, m.skills - m.botches); m.rating = CA.rating(m);
  return m;
}
const ledger = (x, cap) => {
  if (!x) return;
  for (const g of x.gains) if (g.to > cap) fail('training took ' + g.k + ' to ' + g.to + ' above the season cap ' + cap);
  led.objN += x.objs.length; led.objDone += x.done; led.objCr += x.credits; led.objPts += x.points; led.rep += x.rep; led.xp += Object.values(x.xp).reduce((a, b) => a + b, 0);
  for (const g of x.gains) { led.gains += g.to - g.from; for (let v = g.from; v < g.to; v++) led.tPE += cost(v); }
};
// one season for a bot with win probability p (wins: an array forces the results instead). Returns the summary of seasonEnd.
function playSeason(P, rnd, p, wins) {
  for (let steps = 0; P.data.career.sn.md < CA.MD; steps++) {
    const opp = P.careerOpponent(); if (!opp || steps > 7) { fail('no opponent / too many matchdays'); break; }
    const won = wins ? wins[steps] : rnd() < p;
    const cap = ISO.SEASONS[P.data.career.sn.i].cap, gf = won ? 3 : (rnd() * 3) | 0, ga = won ? (rnd() * 3) | 0 : 3, m = synth(rnd, won, gf, ga, opp.ovr - P.careerDef().ovr);
    P.careerKickoff(); const res = P.recordMatch({ mode: 'career', won, gf, ga, diff: P.careerDiff(), opp, skills: 0, clears: 0, powerGoals: 0, m }); ledger(res.obj, cap);
    if (P.data.career.tokens > 0) {      // the bot spends its token on a drill of the programme it has the most room in
      const prog = ['finishing', 'technical', 'dribbling'][steps % 3], kind = CA.TRAIN_BY[prog].drills[0];
      if (P.trainStart(prog, kind)) { led.tokensUsed++; const x = P.trainFinish(kind, Math.round(0.55 * ISO.DRILLS[kind].max)); if (x) { for (const g of x.gains) if (g.to > cap) fail('a drill took ' + g.k + ' above the season cap'); led.xp += x.xp; for (const g of x.gains) { led.gains += g.to - g.from; for (let v = g.from; v < g.to; v++) led.tPE += cost(v); } } }
    }
    P = reload();
    if (P.data.career.sn.md !== steps + 1 || P.data.career.sn.live) fail('the matchday did not survive the reload');
  }
  // Phase 5.5: the season finale (matchday 8) on its own seeded stream so the league stream is unchanged: it is won with probability p (always in a perfect run),
  // one in ten is abandoned (the profile reloaded while the fixture is live = a forfeited loss); every step goes through a JSON round trip
  if (P.bossReady()) {
    const c0 = P.data.career, sn0 = c0.sn, br = ISO.Cup.prng(ISO.Cup.mix(c0.seed, sn0.i, sn0.n, 0xb055)), fin = P.bossMatch(), pos0 = P.seasonTable().findIndex((x) => x.id === 'me'), snap0 = JSON.stringify([sn0.md, sn0.res, c0.points, c0.tokens, c0.xp]), rep0 = c0.rep, cr0 = P.data.credits, pts0 = c0.points;
    if (fin.win !== 5 || fin.diff !== RV.bossDiff(sn0.i) || fin.def.level !== sn0.i + c0.rivals[fin.rival.id].met) fail('boss match info');
    const abandon = !wins && br() < 0.1, won = wins ? true : br() < p;
    P.bossKickoff(); led.bossN++; FIN.n++;
    if (abandon) { P = reload(); led.bossFf++; FIN.ff++; if (P.data.credits !== cr0 || P.data.career.rep !== rep0 || !P.data.career.sn.boss.done) fail('abandoned finale paid or stayed open'); }
    else {
      const gf = won ? 5 : (br() * 5) | 0, ga = won ? (br() * 4) | 0 : 5, m = synth(br, won, gf, ga, fin.def.ovr - P.careerDef().ovr), res = P.recordMatch({ mode: 'boss', won, gf, ga, diff: fin.diff, opp: fin.def, skills: 0, clears: 0, powerGoals: 0, m });
      if (!res.boss) fail('finale not settled'); else { led.bossCr += res.boss.credits; led.bossRep += res.boss.rep; led.rep += res.boss.rep; FIN.cr += res.boss.credits; FIN.rep += res.boss.rep; if (won) { led.bossW++; FIN.w++; } if (res.boss.credits > RV.bossCreditMax(sn0.i)) fail('finale credits over the per-season cap'); if (!won && (res.boss.credits || res.boss.rep)) fail('a lost finale paid'); }
      P = reload();
    }
    const c1 = P.data.career;
    if (JSON.stringify([c1.sn.md, c1.sn.res, c1.points, c1.tokens, c1.xp]) !== snap0 || c1.points !== pts0) fail('finale changed the league state, points, token or XP');
    if (P.seasonTable().findIndex((x) => x.id === 'me') !== pos0) fail('finale changed the table position');
    if (P.bossReady() || !c1.sn.boss.done) fail('finale still open after it was played');
    for (const id of Object.keys(c1.rivals)) { const x = c1.rivals[id]; if (x.w + x.l !== x.met) fail('rival ledger w + l != met'); }
  }
  const sum = P.seasonEnd();
  if (sum && sum.sobj) { led.sobjCr += sum.sobj.credits; led.sobjPts += sum.sobj.points; led.rep += sum.sobj.rep; led.objN += 3; led.objDone += sum.sobj.objs.filter((o) => o.done).length; }
  return { P, sum };
}
function career(seed, p, maxSeasons, stopAtTitle) {
  let P = fresh(seed), rnd = ISO.Cup.prng(ISO.Cup.mix(seed, 0xb07)), seasons = 0, firstUp = null, title = -1, pts0 = P.data.career.points, ptsAtTitle = 0, maxPrize = 0;
  while (seasons < maxSeasons) {
    const r = playSeason(P, rnd, p); P = r.P;
    const x = r.sum; if (!x) { fail('seasonEnd returned null at matchday 7'); break; }
    P = reload(); seasons++;
    if (firstUp === null) firstUp = x.move === 'up' || x.move === 'champion';
    maxPrize = Math.max(maxPrize, x.prize);
    if (x.i === 4 && x.move === 'champion') { title = seasons; ptsAtTitle = P.data.career.points - pts0; if (P.data.stats.careerDone !== 1) fail('title did not set careerDone'); if (stopAtTitle) break; }
    const c = P.data.career; if (!CA.valid(c.sn) || c.sn.i < 0 || c.sn.i > 4) fail('invalid season after seasonEnd');
  }
  return { seasons, firstUp, title, ptsAtTitle, maxPrize, P };
}

let t0 = Date.now();
const seeds = Array.from({ length: N }, (_, i) => 1000 + i * 7919);
// every step goes through a profile reload; bound the number of seasons so a bot cannot loop forever
const half = seeds.map((s) => career(s, 0.5, 1, false)), pHalf = half.filter((r) => r.firstUp).length / N;
if (pHalf < 0.30 || pHalf > 0.65) fail('0.5 bot promotion rate in S1 ' + pHalf.toFixed(3) + ' outside 30-65% (measured about 34.8% over 1000 seeds; the roadmap 35% sits on the edge)');
const hi = seeds.slice(0, Math.min(N, 100)).map((s) => career(s, 0.7, 12, true)), titles = hi.filter((r) => r.title > 0);
if (titles.length / hi.length < 0.8) fail('0.7 bot reached the S5 title within 12 seasons in only ' + (100 * titles.length / hi.length).toFixed(0) + '%');
const maxPrize = Math.max(...half.map((r) => r.maxPrize), ...hi.map((r) => r.maxPrize));
if (maxPrize > 15000) fail('season prize over 15,000 (' + maxPrize + ')');
// a perfect run: seven wins a season until the Season 5 title (always champion: nobody else can match 21 points)
{
  let P = fresh(4242), rnd = ISO.Cup.prng(1), seasons = 0, ach = 0, credits = 0;
  while (P.data.stats.careerDone !== 1 && seasons < 8) { const r = playSeason(P, rnd, 1, Array(7).fill(true)); P = r.P; if (!r.sum || r.sum.move !== 'champion') { fail('perfect run did not win a season'); break; } credits += r.sum.prize; seasons++; P = reload(); }
  const ptsAll = P.data.career.points, pts = ptsAll - led.objPts - led.sobjPts;      // the 5.1 points (matches, promotions, titles) without the objective points
  if (seasons !== 5 || pts < 700 || pts > 850) fail('perfect run: ' + seasons + ' seasons, ' + pts + ' points (want 5 seasons, 700-850)');
  if (credits !== 1000 + 1800 + 2600 + 3600 + 6000) fail('perfect run prizes ' + credits);
  // 5.2 budget: training supplies 10-15% of the career's growth (growth = trained point-equivalents + every upgrade point earned); 5.3 economy: objective credits stay under the documented cap
  const share = led.tPE / (led.tPE + ptsAll), objCr = led.objCr + led.sobjCr;
  if (share < 0.10 || share > 0.15) fail('training share of career growth ' + (100 * share).toFixed(1) + '% outside 10-15%');
  if (objCr > CA.OBJ_CREDIT_CAP || CA.objCreditMax() > CA.OBJ_CREDIT_CAP) fail('objective credits ' + objCr + ' / ' + CA.objCreditMax() + ' over the cap ' + CA.OBJ_CREDIT_CAP);
  if (credits + objCr > 15000 + CA.OBJ_CREDIT_CAP) fail('prizes + objectives over the combined bound');
  { const tr = Object.values(P.data.career.trained).reduce((a, b) => a + b, 0); if (tr !== led.gains) fail('trained[] ' + tr + ' != levels gained ' + led.gains); }
  if (led.bossN !== 5 || led.bossW !== 5 || led.bossFf) fail('perfect run: finales ' + led.bossN + '/' + led.bossW);
  if (led.bossCr > RV.BOSS_CREDIT_CAP) fail('finale credits ' + led.bossCr + ' over the cap ' + RV.BOSS_CREDIT_CAP);
  // the documented ceiling: five 5.1 prizes + objectives + finales (win, rematch bonus and objectives all maxed) stay under their combined bounds
  if (credits + objCr + RV.BOSS_CREDIT_CAP > 15000 + CA.OBJ_CREDIT_CAP + RV.BOSS_CREDIT_CAP || RV.BOSS_CREDIT_CAP !== 6910 || ISO.Collection.creditTotal() > ISO.Collection.SET_CREDIT_CAP) fail('economy ceiling bound');
  { const rv = Object.values(P.data.career.rivals); if (rv.reduce((n, x) => n + x.met, 0) !== 5 || rv.reduce((n, x) => n + x.w, 0) !== 5) fail('perfect run: rival ledger ' + JSON.stringify(P.data.career.rivals)); }
  const rp = P.data.career.rep; if (!(rp > 0) || Math.abs(rp - led.rep) > 0) fail('rep ledger mismatch ' + rp + ' vs ' + led.rep);
  var perfect = { seasons, pts, ptsAll, credits, objCr, objDone: led.objDone + '/' + led.objN, trainShare: +(100 * share).toFixed(1), trainedPE: led.tPE, trainedLevels: led.gains, tokens: led.tokensUsed, rep: rp, tier: CA.tierInfo(rp).name, finaleCr: led.bossCr, finaleRep: led.bossRep };
}
// a bot that never wins is never relegated out of season 1 and always terminates
{ const r = career(5, 0, 6, false); if (r.P.data.career.sn.i !== 0 || r.P.data.stats.promotions !== 0) fail('0-win bot left season 1'); }
console.log('finales played ' + FIN.n + ' (won ' + FIN.w + ', abandoned ' + FIN.ff + ', credits ' + FIN.cr + ', rep ' + FIN.rep + ')');
console.log('seeds ' + N + ': 0.5 bot promoted from S1 ' + (100 * pHalf).toFixed(1) + '%; 0.7 bot S5 title in <=12 seasons ' + titles.length + '/' + hi.length + (titles.length ? ' (mean ' + (titles.reduce((n, r) => n + r.title, 0) / titles.length).toFixed(1) + ' seasons)' : '') + '; perfect run ' + JSON.stringify(perfect) + '; max prize ' + maxPrize + '; ' + (Date.now() - t0) + ' ms');

if (SIM) {
  // one season of real CPU-vs-CPU fixtures (a careerDef-shaped def against the season's rivals, first to three, the season's CPU level)
  const P = fresh(99), me = P.careerDef(), sn = P.data.career.sn; let ms = 0, worst = 0;
  for (let md = 0; md < CA.MD; md++) {
    const opp = P.careerOpponent(), lv = P.careerDiff(), t = Date.now();
    const G = ISO.Game.create({ home: me, away: opp, seed: 500 + md, kickoff: md % 2, win: 3 });
    const ai = [ISO.AI.create(lv, { pers: ISO.AI.profileOf(me) }), ISO.AI.create(lv, { pers: ISO.AI.profileOf(opp) })];
    while (G.phase !== 'end' && G.time < 900) ISO.Game.step(G, [ISO.AI.update(G, G.players[0], ai[0], ISO.C.STEP), ISO.AI.update(G, G.players[1], ai[1], ISO.C.STEP)]);
    if (G.phase !== 'end') fail('sim: unfinished match at matchday ' + (md + 1));
    for (const o of [G.ball, ...G.players]) if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) fail('sim: NaN position');
    if (!Number.isFinite(G.score[0]) || !Number.isFinite(G.score[1]) || G.winner < 0) fail('sim: bad score');
    P.careerKickoff(); P.recordMatch({ mode: 'career', won: G.winner === 0, gf: G.score[0], ga: G.score[1], diff: lv, opp, skills: 0, clears: 0, powerGoals: 0 });
    ms += Date.now() - t; worst = Math.max(worst, Date.now() - t);
  }
  const x = P.seasonEnd(); if (!x || !Number.isFinite(x.pos) || !CA.valid(P.data.career.sn)) fail('sim: season did not close');
  console.log('--sim: 7 real fixtures, ' + ms + ' ms (worst ' + worst + ' ms); finished ' + (x ? CA.PRIZE_PCT(x.pos) * 100 : '?') + '% prize tier, position ' + (x && x.pos));
}
if (bad.length) { console.log('FAIL', bad); process.exit(1); }
console.log('season-test OK');
