// Invariant checks over CPU-vs-CPU matches: node tools/check.js [matches]
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js');
const ISO = globalThis.ISO, C = ISO.C, N = +process.argv[2] || 40;
const bad = {}, note = (k) => (bad[k] = (bad[k] || 0) + 1);
let ci = 0, cf = 0, clears = 0, quickOuts = 0, outs = 0, goals = 0, time = 0, koTackle = 0, maxNoOwner = 0, own = 0, shots = 0, pend = 0, ownRebGoals = 0, reShots = 0, maxBoard = 0;
for (let m = 0; m < N; m++) {
  const P = ISO.PLAYERS, G = ISO.Game.create({ home: P[(m * 7) % 20], away: P[(m * 3 + 5) % 20], seed: 77 + m, kickoff: m % 2 });
  const ai = [ISO.AI.create(['easy', 'normal', 'hard'][m % 3]), ISO.AI.create(['hard', 'normal', 'easy'][m % 3])];
  let lastOutT = -9, playStart = 0, prevPhase = '', loose = 0, board = 0, lastShotTeam = -1, shotSinceClear = false;
  while (G.phase !== 'end' && G.time < 1200) {
    const mcBefore = G.mustClear, attBefore = G.attacker;
    const inp = [0, 1].map((i) => ({ ...ISO.AI.update(G, G.players[i], ai[i], C.STEP) }));
    ISO.Game.step(G, inp);
    const b = G.ball;
    if (G.phase === 'play' && prevPhase !== 'play') playStart = G.time;
    prevPhase = G.phase;
    for (const e of G.events) {
      if (e.type === 'out' && b.x < -C.BACK + 2 && b.y > 2 && b.y < C.FH - 2) note('out at the back');
      if (e.type === 'clear') { if (e.team !== mcBefore && mcBefore !== -1) note('clear for the wrong team'); lastShotTeam = -1; }
      if (e.type === 'kick' && e.shot && e.p && e.p.team === mcBefore) note('shot by a team with a pending clear');
      if (e.type === 'kick' && e.shot && e.p && e.p.team !== attBefore) note('shot by a non-attacker');
      if (e.type === 'kick' && e.shot && e.p) { shotSinceClear = lastShotTeam === e.p.team; if (shotSinceClear) reShots++; lastShotTeam = e.p.team; }
      if (e.type === 'goal' && lastShotTeam === e.team && shotSinceClear) ownRebGoals++;
      if (e.type === 'out') { outs++; if (G.time - lastOutT < 1.5) quickOuts++; lastOutT = G.time; }
      if (e.type === 'tackle' && e.on && G.time - playStart < 0.8) koTackle++;
      if (e.type === 'goal' && e.team === mcBefore) note('goal by a team with a pending clear');
      if (e.type === 'goal') { goals++; shotSinceClear = false; if (e.own) own++; }
      if (e.type === 'clear') { clears++; if (!e.p || e.p.team !== e.team) note('clear event without its player'); }
      if (e.type === 'clearit') { ci++; if (!e.p || e.p.team !== e.team || G.mustClear !== e.team) note('bad clearit'); }
      if (e.type === 'clearfirst') { cf++; if (!e.p || e.p.team !== e.team) note('bad clearfirst'); }
      if (e.type === 'kick' && e.shot) shots++;
    }
    G.events.length = 0;
    if (G.mustClear !== -1 && G.mustClear === G.attacker) note('mustClear equals attacker');
    if (G.phase !== 'play' && G.mustClear !== -1) note('mustClear left set outside play (' + G.phase + ')');
    if (G.mustClear !== -1) pend++;
    if (b.x < -C.BACK + C.BR - 0.01) note('ball behind the back board');
    if (G.phase === 'play' && b.x < -C.BACK + C.BR + 3 && !b.owner && !b.holder && Math.hypot(b.vx, b.vy) < 8) { board += C.STEP; maxBoard = Math.max(maxBoard, board); if (board > 5) note('ball stuck at the back board'); } else board = 0;
    for (const p of G.players) {
      if (p.x < C.PR - C.BACK - 0.01 && p.x > -400) note('player behind the back board');
      if (!(p.x === p.x && p.y === p.y && p.vx === p.vx && p.face === p.face && p.stam === p.stam)) note('player NaN');
      if (p.x > C.FW - 4.9 && p.y > C.GY0 - 9.9 && p.y < C.GY1 + 9.9) note('player inside goal');
      if (p.stam < 0 || p.stam > 100) note('stamina range');
      if (Math.hypot(p.vx, p.vy) > 700) note('player speed');
    }
    for (const k of G.keepers) { if (!(k.x === k.x && k.y === k.y)) note('keeper NaN'); if (k.x < C.FW - C.BOXD) note('keeper out of box'); }
    if (!(b.x === b.x && b.y === b.y && b.z === b.z && b.vx === b.vx)) note('ball NaN');
    if (b.z < 0) note('ball below ground');
    if (b.owner && b.holder) note('owner+holder');
    if (G.phase === 'play' && (b.x < -C.BACK - 10 || b.x > C.FW + 40 || b.y < -40 || b.y > C.FH + 40)) note('ball far outside in play');
    if (G.phase === 'play' && !b.owner && !b.holder) { loose += C.STEP; maxNoOwner = Math.max(maxNoOwner, loose); } else loose = 0;
  }
  if (G.phase !== 'end') note('unfinished');
  time += G.time;
}
console.log({ matches: N, goals, own, shots, avgMin: +(time / N / 60).toFixed(2), outs, quickOuts, koTackle, clears, clearit: ci, clearfirst: cf, maxLooseSec: +maxNoOwner.toFixed(1), maxBoardSec: +maxBoard.toFixed(1), pendingClearSteps: pend, reboundShotsBySameTeam: reShots, goalsFromOwnRebound: ownRebGoals });
console.log('violations:', bad);


// ---- scripted clear-rule and back-board scenarios ------------------------------------------------------------------------------
const { FW, FH, BR, BAR, PR, BACK, BOXD, BOXY0, BOXY1 } = C, GCY = (C.GY0 + C.GY1) / 2, PXMIN = PR - BACK, P = ISO.PLAYERS;
const bad2 = {}, fail = (k) => (bad2[k] = (bad2[k] || 0) + 1);
const Z = ISO.Game.ZERO;
function mk(n, o) {      // n players (2 or 4), in play, keeper out of the way (cd pinned)
  const roster = P.slice(0, n), G = ISO.Game.create({ roster, home: P[0], away: P[1], seed: 5, kickoff: 0, walls: !!(o && o.walls) });
  G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false;
  for (const p of G.players) { p.x = 40 + 30 * p.idx; p.y = 80 + 60 * p.idx; }
  return G;
}
function run(G, steps, inputs, each, free) {
  const evs = [];
  for (let i = 0; i < steps; i++) {
    if (!free && G.keeper.state !== 'hold') G.keeper.cd = 99;
    ISO.Game.step(G, inputs ? inputs(G, i) : G.players.map(() => Z));
    for (const e of G.events) evs.push(e);
    G.events.length = 0;
    if (each && each(G, i) === false) break;
  }
  return evs;
}
const loose = (G, x, y, z, vx, vy, vz, last) => { const b = G.ball; b.owner = null; b.holder = null; b.shot = null; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.lastTouch = last; b.lastKicker = null; b.spin = 0; };
const goals0 = (evs) => evs.filter((e) => e.type === 'goal').length;

// 1. a team with a pending clear cannot score by any route: pass that rolls in, header height, volley height, a dribble; the other team still can
for (const [name, z, vz, vx] of [['rolling pass', 0, 0, 420], ['header height', 40, 0, 420], ['volley height', 22, 40, 600], ['slow roll', 0, 0, 90]]) {
  const G = mk(2); G.attacker = 0; G.mustClear = 1; G.players.forEach((p) => { p.x = 60; p.y = 40 + 400 * p.idx; });
  loose(G, FW - 40, GCY, z, vx, 0, vz, 1);
  const evs = run(G, 240, null, (g) => { if (g.ball.x > FW + BR) fail('pending clear: ball left past the goal line (drawn in the net): ' + name); });
  if (goals0(evs) || G.score[1] || G.phase !== 'play' || G.ball.x > FW + BR) fail('pending clear scored: ' + name);
  const G2 = mk(2); G2.attacker = 0; G2.mustClear = 1; G2.players.forEach((p) => { p.x = 60; p.y = 40 + 400 * p.idx; });
  loose(G2, FW - 40, GCY, z, vx, 0, vz, 0);
  if (!goals0(run(G2, 240))) fail('attacker could not score while the other team had a pending clear: ' + name);
  if (G2.mustClear !== -1) fail('mustClear left set after a goal');
}
{   // dribbling the ball into the goal with a pending clear
  const G = mk(2); G.attacker = 0; G.mustClear = 1; const p = G.players[1]; G.players[0].x = 60;
  p.x = FW - 90; p.y = GCY; G.ball.owner = p; G.ball.x = p.x + 10; G.ball.y = p.y; G.ball.lastTouch = 1;
  const evs = run(G, 600, (g) => [Z, { ...Z, mx: 1, sprint: true }].map((x) => x));
  if (goals0(evs) || G.score[1] || G.ball.x > FW + BR + 0.1 || p.x > FW - 4.9) fail('pending clear: dribbled in');
}
{   // a shot attempt (owner, first-time, header height, volley height) by the team with the pending clear never starts
  for (const [z, own] of [[0, true], [0, false], [20, false], [40, false]]) {
    const G = mk(2); G.attacker = 0; G.mustClear = 1; const p = G.players[1]; G.players[0].x = 60;
    p.x = FW - 120; p.y = GCY; p.face = 0;
    if (own) { G.ball.owner = p; G.ball.x = p.x + 9; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = G.ball.vy = 0; G.ball.lastTouch = 1; } else loose(G, FW - 100, GCY, z, 60, 0, 0, 1);
    let cf2 = 0;
    const evs = run(G, 160, (g, i) => [Z, { ...Z, shoot: i % 20 < 10, mx: 0 }]);
    for (const e of evs) { if (e.type === 'kick' && e.shot && e.p && e.p.team === 1) fail('pending clear: shot started (owner=' + own + ' z=' + z + ')'); if (e.type === 'clearfirst') cf2++; }
    if (own && !cf2) fail('no clearfirst on an early shot');
  }
}
// 2. mustClear is reset by a keeper claim, a goal, an out, a new rep and the end of the match
{
  let claimed = 0, reset = 0;
  for (let sd = 0; sd < 8; sd++) {
    const G = mk(2); G.attacker = 0; G.mustClear = 1; G.players.forEach((p) => { p.x = 60; p.y = 40 + 400 * p.idx; });
    G.keeper.y = GCY; loose(G, FW - 80, GCY, 10, 150, 0, 0, 0);
    const evs = run(G, 200, null, (g) => { if (g.ball.holder) { if (g.mustClear !== -1) fail('mustClear left set with the keeper holding it'); else reset++; return false; } }, true);
    claimed += evs.filter((e) => e.type === 'claim' || e.type === 'save').length;
  }
  if (!reset) fail('keeper never held the ball in the claim scenario');
  const G = mk(2); G.attacker = 0; G.mustClear = 1; G.players.forEach((p) => { p.x = 60; p.y = 40 + 400 * p.idx; });
  loose(G, 200, -30, 0, 0, -200, 0, 0);
  run(G, 90, null, (g) => g.phase === 'play');
  if (G.phase === 'play' || G.mustClear !== -1) fail('mustClear left set after an out');
  run(G, 400, null, (g) => g.phase !== 'out' && g.phase !== 'countdown' ? false : true);
  const H = mk(2); H.score = [2, 0]; H.attacker = 0; H.mustClear = 1; H.players.forEach((p) => { p.x = 60; p.y = 40 + 400 * p.idx; });
  loose(H, FW - 40, GCY, 0, 400, 0, 0, 0);
  run(H, 2000, null, (g) => { if (g.phase !== 'play' && g.mustClear !== -1) fail('mustClear set in phase ' + g.phase); return g.phase !== 'end'; });
  if (H.phase !== 'end' || H.mustClear !== -1) fail('match end with mustClear set / no end');
}
// 3. the back board: a ball pinned against it or wedged in a corner comes free, players never end up behind it
for (const walls of [false, true]) for (const [bx, by] of [[BR - BACK, 300], [BR - BACK, BR + 1], [BR - BACK, FH - BR - 1], [BR - BACK + 2, 40]]) for (const pin of [0, 1]) {
  const G = mk(2, { walls }); G.attacker = 0; G.mustClear = -1;
  const ai = [ISO.AI.create('normal'), ISO.AI.create('hard')];
  loose(G, bx, by, 0, 0, 0, 0, 2);
  G.players[0].x = PXMIN; G.players[0].y = by; G.players[1].x = PXMIN; G.players[1].y = by + (pin ? 20 : 120);
  let free = false, t = 0, minX = 1e9;
  run(G, 120 * 14, (g) => [0, 1].map((i) => ({ ...(pin && g.t < 3 ? { ...Z, mx: -1, sprint: true } : ISO.AI.update(g, g.players[i], ai[i], C.STEP)) })), (g) => {
    for (const p of g.players) if (p.x < PXMIN - 0.01) fail('player pushed behind the back board');
    if (g.ball.x < BR - BACK - 0.01) fail('ball behind the back board');
    if (g.phase !== 'play') return false;
    if (g.ball.owner || g.ball.x > BR - BACK + 25) free = true;
  });
  if (!free && G.phase === 'play') fail('ball pinned at the back board (walls=' + walls + ' pin=' + pin + ' at ' + bx + ',' + by + ')');
}
{   // shoved hard into the board by speed, by a slide and a shoulder: still clamped
  const G = mk(2); G.players[0].x = -20; G.players[0].y = 300; G.players[1].x = 0; G.players[1].y = 300; G.players[0].vx = -700; G.players[1].vx = -700;
  run(G, 600, () => [{ ...Z, mx: -1, sprint: true, slide: true }, { ...Z, mx: -1, sprint: true, shoulder: true }], (g) => { for (const p of g.players) if (p.x < PXMIN - 0.01) fail('player pushed behind the back board (slide / shoulder)'); });
}
// 4. 2v2: the pending clear belongs to the team, not the player
{
  const G = mk(4); G.attacker = 0; const [a0, b1, a2, b3] = G.players;       // teams: a0, a2 = 0; b1, b3 = 1
  a0.x = 60; a0.y = 60; a2.x = 80; a2.y = 700; b1.x = FW - 110; b1.y = GCY - 60; b3.x = FW - 70; b3.y = GCY + 100;
  G.ball.owner = b1; G.ball.x = b1.x + 9; G.ball.y = b1.y; G.ball.lastTouch = 1; G.ball.z = 0; G.ball.vx = G.ball.vy = 0;
  const evs = run(G, 6, null);
  if (G.mustClear !== 1) fail('2v2: no pending clear after winning the ball in the box');
  const evs2 = run(G, 240, (g, i) => g.players.map((p) => (p === b1 && i < 2 ? { ...Z, pass: true } : Z)));
  const ci2 = evs.concat(evs2).filter((e) => e.type === 'clearit').length;
  if (G.ball.owner === b3 || (G.ball.owner && G.ball.owner.team === 1)) { if (G.mustClear !== 1 && inBoxNow(G)) fail('2v2: the teammate receiving in the box cleared it'); }
  if (ci2 > 1) fail('2v2: clearit re-fired for the teammate');
  if (evs2.some((e) => e.type === 'clear') && inBoxNow(G)) fail('2v2: clear event while still inside the box');
  // the teammate carries it out: now it is cleared, for the team
  const ownerNow = G.ball.owner;
  if (ownerNow && ownerNow.team === 1) {
    const evs3 = run(G, 600, (g) => g.players.map((p) => (p === ownerNow ? { ...Z, mx: -1 } : Z)));
    if (!evs3.some((e) => e.type === 'clear' && e.team === 1) || G.attacker !== 1 || G.mustClear !== -1) fail('2v2: teammate carried it out but no clear');
  } else fail('2v2: the pass did not reach the teammate (scenario)');
}
// 5. the tester's rules script (T1 / T1b / T2 / T3): the team with the pending clear never scores and never keeps a goal on the board
{
  const setup = (o) => { const G = ISO.Game.create({ roster: (o.four ? ['messi', 'ronaldo', 'neymar', 'mbappe'] : ['messi', 'ronaldo']).map((id) => ISO.playerById(id)), seed: o.seed || 5, kickoff: 0, walls: !!o.walls }); while (G.phase !== 'play') ISO.Game.step(G, G.players.map(() => Z)); G.events.length = 0; return G; };
  const give = (G, p, x, y) => { const b = G.ball; p.x = x; p.y = y; p.vx = p.vy = 0; p.face = 0; p.state = 'free'; p.noCtrl = 0; b.owner = p; b.holder = null; b.x = x + 4; b.y = y + 19; b.z = 0; b.vx = b.vy = b.vz = 0; b.lastTouch = p.team; b.shot = null; };
  const go = (G, steps, fn, label) => {      // never a goal credited to a team while G.mustClear is that team
    const evs = [];
    for (let s = 0; s < steps; s++) {
      const mc = G.mustClear;
      ISO.Game.step(G, G.players.map((p, i) => ({ ...Z, ...((fn && fn(G, s)[i]) || {}) })));
      for (const e of G.events) { evs.push(e); if (e.type === 'goal' && e.team === mc) fail('goal credited to the team with the pending clear: ' + label); }
      G.events.length = 0;
      if (G.phase !== 'play') break;
    }
    return evs;
  };
  for (const walls of [false, true]) {
    for (const mode of ['walk', 'sprint', 'shield']) {
      const G = setup({ walls }); const A = G.players[0], D = G.players[1]; G.attacker = 0; give(G, D, FW - 40, GCY - 19); A.x = FW - 90; A.y = GCY; A.vx = A.vy = 0;
      go(G, 600, () => [{}, { mx: 1, sprint: mode === 'sprint', jockey: mode === 'shield' }], 'carry ' + mode);
      if (G.score[1] || G.ball.inNet !== null || G.ball.x > FW + BR + 0.1) fail('T1 carried in: ' + mode);
    }
    for (const chord of [{ j: true }, { k: true }, { l: true }, { j: true, k: true }, { j: true, l: true }, { k: true, l: true }, { j: true, k: true, l: true }]) {
      const G = setup({ walls }); const A = G.players[0], D = G.players[1]; G.attacker = 0; give(G, D, FW - 22, GCY - 19); A.x = FW - 120; A.y = GCY + 100; A.vx = A.vy = 0;
      go(G, 400, (g, s) => [{}, { mx: 1, ...(s > 3 && s < 9 ? { ...chord, skill: true } : {}) }], 'skill ' + JSON.stringify(chord));
      if (G.score[1] || G.ball.inNet !== null) fail('T1b skill carried in: ' + JSON.stringify(chord));
    }
  }
  let t2 = 0, t2cf = 0;
  for (let seed = 1; seed <= 40; seed++) {      // 2v2: a pass to a teammate standing in the goal mouth
    const G = setup({ four: true, seed }); const [A, D, A2, D2] = G.players; G.attacker = 0; give(G, D, FW - 60, GCY - 19); D2.x = FW - 6; D2.y = GCY + (seed % 5 - 2) * 20; D2.vx = D2.vy = 0; A.x = 100; A.y = 100; A2.x = 100; A2.y = 600;
    go(G, 200, (g, s) => [{}, { pass: s === 2 }, {}, {}], '2v2 pass to the goal mouth'); if (G.score[1]) t2++;
  }
  if (t2) fail('T2 2v2 pass into the goal mouth scored ' + t2 + ' times');
  {   // spam every shot key with a pending clear: no shot, clearfirst rate-limited
    const G = setup({}); const A = G.players[0], D = G.players[1]; G.attacker = 0; give(G, D, FW - 100, GCY - 19); A.x = 40; A.y = 40;
    const evs = go(G, 360, (g, s) => [{}, { shoot: s % 2 === 0, finesse: s % 3 === 0, chip: s % 5 === 0, lob: s % 7 === 0 }], 'spam');
    const cf = evs.filter((e) => e.type === 'clearfirst').length;
    if (evs.some((e) => e.type === 'kick' && e.shot && e.p.team === 1)) fail('T3 shot with a pending clear');
    if (!cf) fail('T3 no clearfirst'); if (cf > 5) fail('T3 clearfirst not rate limited (' + cf + ')');
  }
  {   // a carried ball against the goal line emits clearfirst (rate-limited) and is never stuck in the net
    const G = setup({}); const A = G.players[0], D = G.players[1]; G.attacker = 0; give(G, D, FW - 40, GCY - 19); A.x = 40; A.y = 40;
    const evs = go(G, 600, () => [{}, { mx: 1 }], 'goal-line clearfirst');
    const cf = evs.filter((e) => e.type === 'clearfirst').length;
    if (!cf || cf > 12) fail('goal line carry: clearfirst count ' + cf);
  }
}
// 6. an attacker that wins the ball outside the box becomes the attacker at once; own-rebound goals are legal; determinism
{
  const G = mk(2); G.attacker = 0; G.mustClear = -1; const p = G.players[1]; G.players[0].x = 60; G.players[0].y = 700; p.x = 100; p.y = 300; G.ball.owner = p; G.ball.x = 109; G.ball.y = 300; G.ball.lastTouch = 1;
  run(G, 5);
  if (G.attacker !== 1 || G.mustClear !== -1) fail('winning the ball outside the box did not flip the attacker');
  const H = mk(2); H.attacker = 0; H.players.forEach((q) => { q.x = 60; q.y = 40 + 400 * q.idx; }); loose(H, FW - 40, GCY, 0, 400, 0, 0, 0); H.ball.shotTeam = 0;
  if (!goals0(run(H, 200)) || H.score[0] !== 1) fail('an attacker goal off its own rebound was refused');
  const fin = (seed) => { const g = ISO.Game.create({ home: P[2], away: P[9], seed, kickoff: 0 }), a = [ISO.AI.create('normal'), ISO.AI.create('hard')]; for (let i = 0; i < 120 * 60 && g.phase !== 'end'; i++) { ISO.Game.step(g, [0, 1].map((j) => ({ ...ISO.AI.update(g, g.players[j], a[j], C.STEP) }))); g.events.length = 0; } return JSON.stringify([g.score, g.time, g.attacker, g.mustClear, g.rs, g.ball.x, g.ball.y, g.players.map((q) => [q.x, q.y])]); };
  if (fin(31) !== fin(31)) fail('not deterministic: same seed, different final state');
}

// 7. a shot by the attackers that deflects in off a defender with a pending clear is a goal for the attackers (a live shot counts for its shooter)
{
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const G = mk(2); G.attacker = 0; G.mustClear = 1; const A = G.players[0], D = G.players[1], b = G.ball; G.keeper.dummy = true; G.keeper.y = C.GY0 + 12;
    D.x = FW - 30; D.y = GCY + (i % 8 - 4) * 3; D.vx = D.vy = 0; D.state = 'tackle'; D.stT = 0; D.stDur = 0.6; A.x = FW - 120; A.y = GCY + 30;
    b.owner = null; b.x = A.x + 14; b.y = A.y - 2; b.z = 2; b.lastTouch = 0; b.lastKicker = A; b.kickT = 0; b.shotTeam = 0; b.shotLive = true; b.shotT = G.t;
    const ang = Math.atan2(D.y - 6 - b.y, D.x - b.x); b.vx = Math.cos(ang) * 700; b.vy = Math.sin(ang) * 700; b.vz = 30;
    b.shot = { id: 99, team: 0, type: 'normal', by: A, out: false };
    const evs = run(G, 150, null, null, true);
    if (G.ball.lastTouch === 1 || evs.some((e) => e.type === 'block')) { n++; if (G.score[0] !== 1 || G.score[1]) fail('a shot deflected in off the clearing defender was not a goal for the shooter'); }
  }
  if (!n) fail('deflection scenario never deflected');
}
// 8. the keeper's throw: nobody can take, block or shoot it at his feet, so standing in front of him gains nothing
{
  let throws = 0, atRelease = 0, goals = 0, shotsWhileThrown = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const G = ISO.Game.create({ roster: [P[0], P[1]], home: P[0], away: P[1], seed, kickoff: 0 });
    while (G.phase !== 'play') { ISO.Game.step(G, G.players.map(() => Z)); G.events.length = 0; }
    const A = G.players[0], D = G.players[1], b = G.ball, k = G.keeper;
    G.attacker = 0; b.owner = null; b.holder = k; k.state = 'hold'; k.holdT = 0.9; k.heldFor = 0; b.lastTouch = 2; G.mustClear = -1;
    k.x = FW - 16; k.y = GCY + (seed % 7 - 3) * 15; A.x = k.x - 26; A.y = k.y; A.face = 0; A.vx = A.vy = 0; A.state = 'free'; A.noCtrl = 0; D.x = FW - 150; D.y = GCY + 100;
    let rel = -1, sT = 0;
    const ai = ISO.AI.create('hard');
    for (let s = 0; s < 400 && G.phase === 'play'; s++) {
      const held = !!b.holder, wasThrown = b.thrown;
      const iA = rel < 0 ? Z : b.owner === A ? { ...Z, mx: 1, my: k.y > GCY ? -1 : 1, finesse: (sT += C.STEP) < 0.03 } : { ...Z, shoot: s % 4 < 2, mx: 1 };
      ISO.Game.step(G, [{ ...iA }, { ...ISO.AI.update(G, D, ai, C.STEP) }]);
      if (held && !b.holder) { rel = s; throws++; if (b.owner === A) atRelease++; }
      if (rel >= 0 && s - rel < 40 && b.thrown && b.owner) fail('throw taken while protected');
      for (const e of G.events) { if (e.type === 'goal' && e.team === 0 && rel >= 0 && (s - rel) * C.STEP < 2) { goals++; if (process.env.DBG) console.log('goal t' + e.team, seed, s - rel); } if (e.type === 'kick' && e.shot && wasThrown && rel >= 0) shotsWhileThrown++; if (e.type === 'block' && rel >= 0 && s - rel < 30) fail('throw blocked at the keeper'); }
      G.events.length = 0;
    }
  }
  if (!throws) fail('no throws in the camper scenario');
  if (atRelease) fail('camper took ' + atRelease + ' throws at release');
  if (shotsWhileThrown) fail('a thrown ball was shot first-time (' + shotsWhileThrown + ')');
  if (goals * 4 > throws) fail('camper goals from throws ' + goals + '/' + throws);
}
function inBoxNow(G) { return ISO.inBox(G.ball); }
console.log('scripted scenarios, violations:', bad2);
if (Object.keys(bad2).length) process.exitCode = 1;
