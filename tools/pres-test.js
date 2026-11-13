// Match presentation logic (roadmap 6.4), headless: node tools/pres-test.js
// Ratings, player of the match, goal lines, pips, match point, slow-motion scale and the intro data; none of it may touch G.
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js'); require('../js/pres.js');
const ISO = globalThis.ISO, P = ISO.Pres;
const bad = [], fail = (m) => { if (!bad.includes(m)) bad.push(m); };
const snap = (G) => JSON.stringify(G, (k, v) => (typeof v === 'function' ? undefined : v));
const mk = (o) => ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[1], seed: 7, ...o });
const calls = (G) => { const before = snap(G); const out = [P.rate(G), P.potm(G), P.goalLines(G), P.pips(G), P.matchPoint(G), P.timeScale(G, true), P.timeScale(G, false)]; if (snap(G) !== before) fail('a Pres call mutated G'); return out; };

// zero-stat match
let G = mk({ replay: true });
let r = P.rate(G);
if (r.length !== 2 || r.some((e) => e.rating !== 6.0 && e.rating !== 6)) fail('zero-stat rating should be 6.0: ' + JSON.stringify(r));
calls(G);
if (P.pips(G).win !== 3) fail('pips win');
if (P.matchPoint(G) !== -1) fail('matchPoint at 0-0');

// monotonic in goals, bounds, determinism
let prev = -1;
for (let g = 0; g <= 6; g++) {
  const H = mk({}); H.winner = -1; H.score = [g, 0]; H.goals = []; for (let i = 0; i < g; i++) H.goals.push({ team: 0, time: 10 + i, own: false, by: 0 });
  const e = P.rate(H)[0];
  if (e.rating < prev) fail('rating not monotonic in goals at ' + g); prev = e.rating;
  if (e.rating < 3 || e.rating > 10 || Math.round(e.rating * 10) !== e.rating * 10) fail('rating bounds / one decimal: ' + e.rating);
  if (JSON.stringify(P.rate(H)) !== JSON.stringify(P.rate(H))) fail('rate not deterministic');
}
// extremes stay in bounds
{ const H = mk({}); H.stats.shots = [99, 0]; H.stats.onTarget = [99, 0]; H.stats.tackles = [99, 0]; H.stats.skills = [99, 0]; H.stats.clears = [99, 0]; H.stats.poss = [100, 0]; H.score = [30, 0]; H.winner = 0; H.goals = Array.from({ length: 30 }, () => ({ team: 0, time: 1, by: 0 }));
  const e = P.rate(H); if (e[0].rating !== 10) fail('max should clamp to 10, got ' + e[0].rating); if (e[1].rating < 3) fail('floor');
  const L = mk({}); L.score = [0, 30]; L.winner = 1; L.stats.poss = [0, 100]; if (P.rate(L)[0].rating !== 3) fail('min should clamp to 3, got ' + P.rate(L)[0].rating); }

// POTM ties: winner first, then goals, then lower index
{ const H = mk({}); H.winner = 1; const e = P.potm(H); if (!e || e.idx !== 1) fail('tie should go to the winner');
  const T = mk({}); T.winner = -1; if (P.potm(T).idx !== 0) fail('tie with no winner goes to the lower index'); }

// 2v2 roster: team stats shared, goals per player
{ const d = ISO.PLAYERS; const H = ISO.Game.create({ home: d[0], away: d[1], roster: [d[0], d[1], d[2], d[3]], seed: 3 });
  H.score = [2, 1]; H.winner = 0; H.goals = [{ team: 0, time: 5, by: 0 }, { team: 0, time: 9, by: 2 }, { team: 1, time: 12, by: 1 }]; H.stats.shots = [2, 1]; H.stats.onTarget = [2, 1];
  const e = P.rate(H); if (e.length !== 4) fail('2v2 roster size');
  if (e[0].goals !== 1 || e[2].goals !== 1 || e[3].goals !== 0 || e[1].goals !== 1) fail('2v2 goals per player ' + JSON.stringify(e));
  if (e[0].rating !== e[2].rating) fail('two scorers with equal goals on one team should tie'); if (!(e[0].rating > e[2 + 1].rating)) fail('scorer should rate above his silent mate');
  calls(H); }

// drills give null
{ const D = ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[0], drill: 'arena', solo: true, seed: 1 });
  if (P.rate(D) !== null || P.potm(D) !== null) fail('drill rating should be null'); if (P.pips(D) !== null || P.matchPoint(D) !== -1) fail('drill pips/matchPoint'); if (P.timeScale(D, true) !== 1) fail('drill timeScale'); calls(D); }

// street: points, pips null when win > 5, first to 5 pips
{ const S = mk({ rules: 'street' }); S.score = [0, 0]; S.goals = [{ team: 0, time: 20, by: 0, pts: 2 }, { team: 1, time: 50, by: 1, pts: 1 }, { team: 0, time: 65, by: 0, pts: 2 }];
  const gl = P.goalLines(S); if (gl[2].score[0] !== 4 || gl[2].score[1] !== 1 || gl[2].n !== 2 || gl[0].clock !== '00:20' || gl[2].clock !== '01:05' || gl[0].pts !== 2) fail('street goal lines ' + JSON.stringify(gl));
  S.score = [4, 1]; if (P.pips(S).win !== 5 || P.matchPoint(S) !== 0) fail('street pips / matchPoint');
  S.win = 10; if (P.pips(S) !== null || P.matchPoint(S) !== -1) fail('win > 5 has no pips'); }

// match point, both at match point, sudden death
{ const H = mk({}); H.score = [H.win - 1, 0]; if (P.matchPoint(H) !== 0) fail('match point team 0'); H.score = [0, H.win - 1]; if (P.matchPoint(H) !== 1) fail('match point team 1');
  H.score = [H.win - 1, H.win - 1]; if (P.matchPoint(H) !== -1) fail('both at match point is -1'); H.score = [H.win, 0]; H.winner = 0; if (P.matchPoint(H) !== -1) fail('over'); }

// slow motion scale
{ const H = mk({ replay: true }); H.phase = 'goal'; H.goalDur = 5; H.phaseT = 5; if (P.timeScale(H, true) !== 0.35) fail('slow-mo at goal start'); if (P.timeScale(H, false) !== 1) fail('slow-mo off');
  H.phaseT = 5 - 0.23; if (P.timeScale(H, true) !== 1) fail('slow-mo ends at 0.22 s'); H.phase = 'play'; if (P.timeScale(H, true) !== 1) fail('slow-mo outside goals'); }

// a played match: determinism, no mutation across many frames
{ const H = mk({ replay: true }); const ctl = [ISO.AI.create('normal'), ISO.AI.create('normal')];
  let n = 0; while (H.phase !== 'end' && n < 60 * 120) { n++; ISO.Game.step(H, [ISO.AI.update(H, H.players[0], ctl[0], ISO.C.STEP), ISO.AI.update(H, H.players[1], ctl[1], ISO.C.STEP)]); H.events.length = 0; if (n % 600 === 0) calls(H); }
  const a = JSON.stringify(P.rate(H)), b = JSON.stringify(P.rate(H)); if (a !== b) fail('rate not deterministic on a real match'); calls(H);
  for (const e of P.rate(H)) if (e.rating < 3 || e.rating > 10) fail('real match rating bounds'); }

// intro data
{ const o = P.intro({ mode: 'cup', defs: [ISO.PLAYERS[0], ISO.PLAYERS[1]], win: 3, cupName: 'ROOKIE CUP', round: 'SEMIFINAL', mapName: 'STADIUM', weather: 'rain', turf: 'grass', persOf: (d) => ISO.AI.profileOf(d).name });
  if (o.title !== 'ROOKIE CUP' || o.sub !== 'SEMIFINAL' || o.first !== 'FIRST TO 3' || o.sides.length !== 2 || !o.sides[1].chips.some((c) => c.k === 'ai') || o.sides[0].chips.some((c) => c.k === 'ai')) fail('intro ' + JSON.stringify(o).slice(0, 200));
  if (P.intro({ mode: 'cpu', defs: [ISO.PLAYERS[0], ISO.PLAYERS[1]], win: 3, rules: 'street' }).title !== 'STREET FOOTBALL') fail('street title'); }

if (bad.length) { console.log('pres-test FAIL\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('pres-test OK');
