// Invariant checks over CPU-vs-CPU matches: node tools/check.js [matches]
require('../js/data.js'); require('../js/game.js'); require('../js/drillspec.js'); require('../js/ai.js'); require('../js/cup.js'); require('../js/career.js'); require('../js/career-obj.js'); require('../js/rivals.js'); require('../js/collection.js');
const ISO = globalThis.ISO, C = ISO.C, N = +process.argv[2] || 40;
if (process.env.STYLE === 'off') ISO.STYLE_OFF = true;      // Phase 2 kill switch (byte-identity check against the pre-Phase-2 output)
const bad = {}, note = (k) => (bad[k] = (bad[k] || 0) + 1);
// Phase 1.3 / 1.4 invariants: spin and topspin finite and bounded, the ball never left inside the goal frame, stumbles capped, the pitch type valid
const FRM = C.PHYS.FRAME;
function physInv(G, note) {
  const b = G.ball;
  if (!Number.isFinite(b.tsp) || !Number.isFinite(b.spin)) note('spin or tsp not finite');
  if (Math.abs(b.spin) > 1.01 || Math.abs(b.tsp) > 1.01) note('spin or tsp out of range');
  for (const [ay, by, az, bz] of [[C.GY0, C.GY0, 0, FRM.barZ], [C.GY1, C.GY1, 0, FRM.barZ], [C.GY0, C.GY1, FRM.barZ, FRM.barZ]]) {
    const ey = by - ay, ez = bz - az, l2 = ey * ey + ez * ez, t = Math.max(0, Math.min(1, ((b.y - ay) * ey + (b.z - az) * ez) / l2));
    if (b.inNet === null && Math.hypot(b.x - C.FW, b.y - (ay + ey * t), b.z - (az + ez * t)) < C.BR + FRM.r - 1.5) note('ball inside the goal frame');      // a ball already settling in the net no longer collides with the frame (a goal scored within 0.5 px of the post tripped this in Phase 2 trajectories)
  }
  for (const p of G.players) if (p.state === 'stumble' && p.stDur > 0.52) note('stumble too long');
  if (!C.PHYS.SURF[G.turf]) note('invalid turf');
}
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
      if (e.type === 'kick' && e.kind === 'header' && b.z < 19) note('header kick below head height');
      if (e.type === 'kick' && e.kind === 'diveheader' && e.p.state !== 'hdive') note('dive header without the hdive state');
      if (e.type === 'kick' && e.shot && !e.kind) note('kick without a kind');
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
      if (p.ps === 'hdive' && p.state !== 'hdive' && p.state !== 'down' && G.phase === 'play') note('hdive did not end in down:' + p.state + ':' + G.phase);
      p.ps = p.state;
      if (Math.hypot(p.vx, p.vy) > 700) note('player speed');
      if (!(p.stopT >= 0 && p.goT >= 0 && p.sgCd >= 0 && isFinite(p.stopT + p.goT + p.sgCd))) note('stop/go timers invalid');
      if ((p.close || p.shield) && b.owner !== p) note('close/shield without the ball');
      if (!(p.shHeld >= 0 && p.shHeld <= C.DRIB.SHIELD_MAX + 0.02 && p.shLock >= 0 && isFinite(p.shHeld + p.shLock))) note('shield timers invalid');
    }
    for (const k of G.keepers) { if (!(k.x === k.x && k.y === k.y)) note('keeper NaN'); if (k.x < C.FW - C.BOXD) note('keeper out of box'); }
    if (!(b.x === b.x && b.y === b.y && b.z === b.z && b.vx === b.vx)) note('ball NaN');
    if (b.z < 0) note('ball below ground');
    physInv(G, note);
    if (b.owner && b.holder) note('owner+holder');
    if (G.phase === 'play' && (b.x < -C.BACK - 10 || b.x > C.FW + 40 || b.y < -40 || b.y > C.FH + 40)) note('ball far outside in play');
    if (G.phase === 'play' && !b.owner && !b.holder) { loose += C.STEP; maxNoOwner = Math.max(maxNoOwner, loose); } else loose = 0;
  }
  if (G.phase !== 'end') note('unfinished');
  time += G.time;
}
console.log({ matches: N, goals, own, shots, avgMin: +(time / N / 60).toFixed(2), outs, quickOuts, koTackle, clears, clearit: ci, clearfirst: cf, maxLooseSec: +maxNoOwner.toFixed(1), maxBoardSec: +maxBoard.toFixed(1), pendingClearSteps: pend, reboundShotsBySameTeam: reShots, goalsFromOwnRebound: ownRebGoals });
// one match per pitch type and wet state: no violations
for (let m = 0; m < 8; m++) {
  const P = ISO.PLAYERS, G = ISO.Game.create({ home: P[(m * 5) % 20], away: P[(m * 3 + 2) % 20], seed: 900 + m, kickoff: m % 2, turf: ISO.Game.turfs[m % 4], rain: m >= 4 });
  const ai = [ISO.AI.create('normal'), ISO.AI.create('normal')];
  while (G.phase !== 'end' && G.time < 1200) {
    ISO.Game.step(G, [0, 1].map((i) => ({ ...ISO.AI.update(G, G.players[i], ai[i], C.STEP) })));
    G.events.length = 0; physInv(G, note);
    for (const p of G.players) if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) note('turf match: player NaN');
    if (!Number.isFinite(G.ball.x + G.ball.y + G.ball.z + G.ball.vx + G.ball.vy + G.ball.vz)) note('turf match: ball NaN');
  }
  if (G.phase !== 'end') note('turf match unfinished ' + G.turf + (G.ball.wet ? ' wet' : ''));
}
console.log('violations:', bad);
if (Object.keys(bad).length) process.exitCode = 1;


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
// 9. advanced dribbling: brake, burst, shield, close control
{
  const DR = C.DRIB;
  const setup = (seed, acc) => {
    const G = ISO.Game.create({ roster: [P[0], P[1]], home: P[0], away: P[1], seed, kickoff: 0 });
    G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; G.attacker = 0; G.mustClear = -1;
    const A = G.players[0], D = G.players[1], b = G.ball;
    if (acc != null) A.a = Object.assign({}, A.a, { acc });
    A.x = 100; A.y = 360; A.face = 0; A.vx = A.jog; A.vy = 0; D.x = 330; D.y = 650; D.vx = D.vy = 0;
    b.owner = A; b.x = A.x + 12; b.y = A.y; b.vx = A.vx; b.vy = 0; b.z = 0; b.lastTouch = 0;
    return G;
  };
  // brake: below 30% of the entry speed within STOP_T, ball kept; then burst reaches jog speed inside 0.1 s
  const burstSpeed = { hi: 0, lo: 0 };
  for (const [tag, acc] of [['hi', 99], ['lo', 45]]) {
    const G = setup(11, acc), A = G.players[0], v0 = Math.hypot(A.vx, A.vy);
    const steps = Math.round((DR.STOP_T + 0.02) / C.STEP);
    let stops = 0, bursts = 0;
    let vEnd = -1, seen = false;
    const evs = run(G, steps, () => [{ ...Z, mx: 1, jockey: true }, Z], () => { if (A.stopT > 0) seen = true; else if (seen && vEnd < 0) vEnd = Math.hypot(A.vx, A.vy); });
    for (const e of evs) if (e.type === 'stop') stops++;
    if (stops !== 1) fail('brake did not fire once (' + stops + ')');
    if (!(vEnd >= 0 && vEnd < 0.3 * v0)) fail('brake left speed ' + vEnd.toFixed(0) + ' of ' + v0.toFixed(0));
    if (G.ball.owner !== A) fail('brake lost the ball');
    let reach = -1;
    const evs2 = run(G, 40, (g, i) => [{ ...Z, mx: 1, sprint: true }, Z], (g, i) => { if (reach < 0 && Math.hypot(A.vx, A.vy) >= A.jog) reach = (i + 1) * C.STEP; if (i === 5) burstSpeed[tag] = Math.hypot(A.vx, A.vy); });
    for (const e of evs2) if (e.type === 'burst') bursts++;
    if (bursts !== 1) fail('burst did not fire once (' + bursts + ')');
    if (tag === 'hi' && !(reach >= 0 && reach <= 0.1)) fail('burst (high acc) reached jog speed in ' + reach);
  }
  if (!(burstSpeed.hi > burstSpeed.lo)) fail('high-acc burst not faster than low-acc: ' + burstSpeed.hi.toFixed(0) + ' vs ' + burstSpeed.lo.toFixed(0));
  // close control keeps the ball within 27 px while dribbling in circles
  {
    const G = setup(12); const A = G.players[0]; let mxd = 0;
    run(G, 600, (g, i) => { const an = i * 0.012; return [{ ...Z, mx: Math.cos(an), my: Math.sin(an), jockey: true }, Z]; }, (g) => { if (g.ball.owner === A) mxd = Math.max(mxd, Math.hypot(g.ball.x - A.x, g.ball.y - A.y)); else { fail('close control lost the ball'); return false; } });
    if (mxd >= 27) fail('close-control ball distance ' + mxd.toFixed(1));
  }
  // a shielding dribbler is harder to tackle from behind than a tackle from the front
  {
    const win = { front: 0, behind: 0 };
    for (const side of ['front', 'behind']) for (let seed = 1; seed <= 200; seed++) {
      const G = setup(seed); const A = G.players[0], D = G.players[1], b = G.ball;
      A.vx = 0; b.vx = 0; b.x = A.x + 11; const sg = side === 'front' ? 1 : -1;
      D.x = A.x + sg * 27; D.y = A.y; D.face = sg > 0 ? Math.PI : 0;
      let won = false, step = 0;
      run(G, 90, () => [{ ...Z, jockey: true }, { ...Z, shoot: step++ < 3 }], null);
      // the tackle shows up as the ball changing hands or loose
      if (G.ball.owner !== A) won = true;
      if (won) win[side]++;
    }
    if (!(win.behind < win.front)) fail('shield from behind not harder to tackle: front ' + win.front + ' behind ' + win.behind);
    console.log('shield tackle wins (of 200): front', win.front, 'behind', win.behind);
  }
  // shielding cannot be held forever: it ends after SHIELD_MAX, stays off for SHIELD_CD, close control continues
  {
    const G = setup(13); const A = G.players[0], D = G.players[1];
    A.vx = 0; G.ball.vx = 0; G.ball.x = A.x + 11; D.x = A.x + 60; D.y = A.y; D.face = Math.PI; D.state = 'free';
    let first = -1, off = -1, again = -1, lost = false;
    run(G, 360, () => [{ ...Z, jockey: true }, Z], (g, i) => {
      const t = (i + 1) * C.STEP;
      if (G.ball.owner !== A) lost = true;
      if (A.shield && first < 0) first = t;
      if (!A.shield && first >= 0 && off < 0) off = t;
      if (A.shield && off >= 0 && again < 0) again = t;
    });
    if (first < 0) fail('shield never engaged in the shield-limit scenario');
    else if (!(off >= 0 && off - first <= DR.SHIELD_MAX + 0.1 && off - first >= DR.SHIELD_MAX - 0.1)) fail('shield did not end after SHIELD_MAX: ' + (off - first));
    else if (!(again < 0 || again - off >= DR.SHIELD_CD - 0.05)) fail('shield re-engaged during the cooldown: ' + (again - off));
    if (lost) fail('ball lost while shielding in the limit scenario');
  }
}
{   // 2a. context-selected shot types: one shoot key, the sim picks the strike
  const strike = (setup, key, hold, mxy, n) => {
    const G = mk(2); G.attacker = 0; G.mustClear = -1; G.players[1].x = 60; G.players[1].y = 40;
    const p = G.players[0]; p.x = FW - 250; p.y = GCY; p.face = 0; p.dir = 1;
    setup(G, p);
    let kind = null;
    const inp = (g, i) => [{ ...Z, [key]: i < hold, mx: mxy ? mxy[0] : 0, my: mxy ? mxy[1] : 0 }, Z];
    run(G, n || 40, inp, (g) => { for (const e of g.events) if (e.type === 'kick') kind = e.kind; return true; });
    return { kind, G };
  };
  const evK = (setup, key, hold, mxy, n) => {
    const G = mk(2); G.attacker = 0; G.mustClear = -1; G.players[1].x = 60; G.players[1].y = 40;
    const p = G.players[0]; p.x = FW - 250; p.y = GCY; p.face = 0; p.dir = 1;
    setup(G, p);
    let kind = null, bz = -1;
    for (let i = 0; i < (n || 40) && !kind; i++) {
      if (G.keeper.state !== 'hold') G.keeper.cd = 99;
      ISO.Game.step(G, [{ ...Z, [key]: i < hold, mx: mxy ? mxy[0] : 0, my: mxy ? mxy[1] : 0, sprint: !!(mxy && mxy[2]) }, Z]);
      for (const e of G.events) if (e.type === 'kick') { kind = e.kind; bz = G.ball.z; }
      G.events.length = 0;
    }
    return { kind, bz, G };
  };
  const want = (name, r, k) => { if (r.kind !== k) fail('shot kind ' + name + ': got ' + r.kind + ' want ' + k); };
  want('rolling ground ball', evK((G, p) => loose(G, p.x + 20, p.y, 0, 200, 0, 0, 0), 'shoot', 99), 'first-time');
  want('falling ball z 14', evK((G, p) => loose(G, p.x + 18, p.y, 14, 0, 0, -150, 0), 'shoot', 99), 'volley');
  want('just bounced', evK((G, p) => { loose(G, p.x + 18, p.y, 5, 0, 0, 150, 0); G.ball.bncAt = G.t; }, 'shoot', 99), 'halfvolley');
  const h = evK((G, p) => loose(G, p.x + 14, p.y, 30, 0, 0, -50, 0), 'shoot', 99); want('ball at z 30', h, 'header');
  if (h.bz < 19) fail('header struck below head height');
  want('running onto z 22 at 40 px', evK((G, p) => { p.x = FW - 150; p.vx = p.jog * 1.3; loose(G, p.x + 40, p.y, 22, 0, 0, 0, 0); }, 'shoot', 99), 'diveheader');
  { const r = evK((G, p) => { p.x = FW - 150; p.vx = p.jog * 1.3; loose(G, p.x + 40, p.y, 22, 0, 0, 0, 0); }, 'shoot', 99, null, 60);
    for (let i = 0; i < 400; i++) { ISO.Game.step(r.G, [Z, Z]); r.G.events.length = 0; r.G.keeper.cd = 99; if (r.G.players[0].state === 'down' || r.G.players[0].state === 'free') break; }
    if (!(r.G.players[0].state === 'down' || r.G.players[0].state === 'free')) fail('hdive did not finish'); }
  want('quick shot at a sprint', evK((G, p) => { p.a = { ...p.a, wf: 99 }; p.x = FW - 200; p.vx = p.jog * 1.3; p.vy = 0; G.ball.owner = p; G.ball.x = p.x + 10; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = p.vx; G.ball.vy = 0; }, 'shoot', 25, [1, 0, 1], 40), 'driven');
  { const ks = ['L', 'R'].map((foot) => evK((G, p) => { p.def = { ...p.def, foot }; p.a = { ...p.a, wf: 45 }; G.ball.owner = p; G.ball.x = p.x + 10; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = G.ball.vy = 0; }, 'finesse', 30, [Math.cos(0.5), Math.sin(0.5)], 60).kind);
    if (ks.filter((k) => k === 'outside').length !== 1) fail('outside-foot shot: kinds ' + ks.join(',')); }
  // purity: the resolver reads state and leaves it alone (no RNG draw, no writes)
  { const G = mk(2); G.attacker = 0; const p = G.players[0]; p.x = FW - 150; p.y = GCY; p.vx = p.jog * 1.3; loose(G, p.x + 30, p.y, 22, 0, 0, 0, 0);
    const snap = () => { const seen = new WeakSet(); return JSON.stringify(G, (k, v) => { if (v && typeof v === 'object') { if (seen.has(v)) return undefined; seen.add(v); } return v; }); };
    const rs0 = G.rs, j0 = snap();
    for (const t of ['normal', 'finesse', 'power', 'chip']) for (const ft of [true, false]) { const a = ISO.Game.resolveStrike(G, p, t, ft, 0.4, 0.5), b2 = ISO.Game.resolveStrike(G, p, t, ft, 0.4, 0.5); if (JSON.stringify(a) !== JSON.stringify(b2)) fail('resolver not repeatable'); }
    if (G.rs !== rs0 || snap() !== j0) fail('resolver changed the game state'); }
}
// 10. Phase 2 individuality: roles, traits, movement profiles, weak foot (ISO.styleOf). Every A/B uses identical attributes and the same seed,
// so the measured ratio is the effect of the one thing that differs. Ranges are the intended effect size (3-30%), not a tuning target.

if (!ISO.STYLE_OFF) {      // (skipped with STYLE=off, which must reproduce the pre-Phase-2 output byte for byte)
  const M = ISO.MODS, ST = (d) => ISO.styleOf(d);
  // 10a. every roster def resolves inside the caps, with a valid role and 1-3 valid traits
  const cover = {}, roles = {};
  for (const d of P) {
    const s = ST(d);
    if (!ISO.ROLES[s.role]) fail('style: invalid role ' + d.id);
    if (s.traits.length < 1 || s.traits.length > 3 || s.traits.some((t) => !ISO.TRAITS[t]) || new Set(s.traits).size !== s.traits.length) fail('style: bad traits ' + d.id);
    for (const t of s.traits) cover[t] = (cover[t] || 0) + 1;
    roles[s.role] = (roles[s.role] || 0) + 1;
    for (const k in M) if (!Number.isFinite(s.m[k]) || s.m[k] < M[k][2] - 1e-12 || s.m[k] > M[k][3] + 1e-12) fail('style: ' + k + ' outside its cap for ' + d.id);
    if (!Object.isFrozen(s.m)) fail('style: table not frozen');
    if (ST(d) !== s) fail('style: not cached per def');
    if (s.wfStars < 1 || s.wfStars > 5) fail('style: wf stars');
  }
  for (const t of ISO.TRAIT_ORDER) { const f = (cover[t] || 0) / P.length; if (f < 0.08 || f > 0.35) fail('style: trait ' + t + ' held by ' + (f * 100).toFixed(0) + '% of the roster (want 8-35%)'); }
  console.log('trait coverage (of ' + P.length + '):', JSON.stringify(cover), 'roles:', JSON.stringify(roles));
  // Prime, skins and the base def share traits and role (they are evaluated on the base)
  for (const d of P.filter((_, i) => i % 5 === 0)) for (const o of [ISO.outfit(d, true, 'gold'), ISO.outfit(d, false, 'away'), ISO.primeOf(d)]) { const a = ST(d), b = ST(o); if (a.role !== b.role || a.traits.join() !== b.traits.join()) fail('style: prime/skin changed traits of ' + d.id); }
  // the kill switch gives the neutral table
  { ISO.STYLE_OFF = true; const s = ST(P[0]); ISO.STYLE_OFF = false; for (const k in M) if (s.m[k] !== M[k][0]) fail('style: STYLE_OFF table is not neutral (' + k + ')'); if (s.traits.length) fail('style: STYLE_OFF has traits'); }
  // an unknown def (no id match, no role) still resolves
  { const s = ST({ id: 'nobody', ovr: 60, foot: 'R', attr: { ...P[40].attr }, look: { h: 1, w: 1 } }); if (!ISO.ROLES[s.role] || !s.traits.length) fail('style: unknown def does not resolve'); }

  const ATT = {}; for (const [k] of ISO.ATTRS) ATT[k] = 75;
  const base = { ...P[0], id: 'sty-test', ovr: 75, foot: 'R', attr: ATT, look: { ...P[0].look, h: 1, w: 1 }, role: 'box2box', traits: [] };
  const cl = (o) => ({ ...base, ...o, attr: { ...base.attr, ...((o && o.attr) || {}) } });
  const mkG = (defs, seed) => {
    const G = ISO.Game.create({ roster: defs, home: defs[0], away: defs[1], seed, kickoff: 0 });
    G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; G.attacker = 0; G.mustClear = -1;
    defs.forEach((_, i) => { const p = G.players[i]; p.x = 150 + 40 * i; p.y = 40 + 120 * i; });
    return G;
  };
  const stepG = (G, inp) => { if (G.keeper.state !== 'hold') G.keeper.cd = 99; ISO.Game.step(G, inp); const ev = G.events.slice(); G.events.length = 0; return ev; };
  const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const within = (name, v, lo, hi) => { if (!(v >= lo && v <= hi)) fail('style A/B ' + name + ': ' + v.toFixed(3) + ' not in [' + lo + ', ' + hi + ']'); return v; };
  const report = [];
  const rec = (name, v) => report.push(name + ' ' + v.toFixed(3));
  const T0 = cl({}), tr = (t) => cl({ traits: [t] });

  // shot helper: the owner winds the key for `hold` frames then it fires; returns angle / speed / kind at the kick
  const shot = (def, seed, key, hold, setup, opts) => {
    const G = mkG([def, cl({})], seed), p = G.players[0], o = G.players[1];
    p.x = (opts && opts.x) != null ? opts.x : FW - 250; p.y = GCY; p.face = 0; o.x = 60; o.y = 40;
    if (setup) setup(G, p, o); else { G.ball.owner = p; G.ball.x = p.x + 10; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = G.ball.vy = 0; }
    for (let i = 0; i < 90; i++) {
      for (const e of stepG(G, [{ ...Z, [key]: i < hold, mx: opts && opts.mx != null ? opts.mx : 1, my: 0 }, Z])) if (e.type === 'kick' && e.p === p) { const b = G.ball; return { ang: Math.atan2(b.vy, b.vx), v: Math.hypot(b.vx, b.vy), kind: e.kind, weak: e.weak, spin: b.spin }; }
    }
    return null;
  };
  const spread = (t, key, hold, setup, opts) => {
    const A = [], B = [];
    for (let s = 0; s < 300; s++) { const a = shot(tr(t), 900 + s, key, hold, setup, opts), b = shot(T0, 900 + s, key, hold, setup, opts); if (a && b) { A.push(a.ang); B.push(b.ang); } }
    if (A.length < 250) fail('style A/B ' + t + ': only ' + A.length + ' shots fired');
    return sd(A) / sd(B);
  };
  // Finesse Specialist: tighter finesse spread (and the spin stays inside 1)
  rec('finesse spread', within('finesse spread', spread('finesse', 'finesse', 30), 0.7, 0.97));
  { const a = shot(cl({ traits: ['finesse'], attr: { cur: 99 } }), 1, 'finesse', 30); if (a && Math.abs(a.spin) > 1.0001) fail('style: finesse spin above 1'); }
  // Long Shot Taker: tighter spread from range
  rec('long shot spread', within('long shot spread', spread('longshot', 'shoot', 22, null, { x: -55 }), 0.7, 0.97));
  // Press Resistant: tighter shot spread with an opponent at 30 px
  rec('press spread', within('press spread', spread('press', 'shoot', 22, (G, p, o) => { G.ball.owner = p; G.ball.x = p.x + 10; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = G.ball.vy = 0; o.x = p.x; o.y = p.y + 30; }), 0.7, 0.97));
  // Acrobatic: tighter volleys; Power Header: faster headers
  const volley = (G, p) => { G.ball.owner = null; G.ball.holder = null; G.ball.shot = null; G.ball.x = p.x + 18; G.ball.y = p.y; G.ball.z = 14; G.ball.vx = G.ball.vy = 0; G.ball.vz = -150; G.ball.lastTouch = 0; G.ball.lastKicker = null; G.ball.spin = 0; };
  rec('volley spread', within('volley spread', spread('acrobat', 'shoot', 99, volley, { mx: 0 }), 0.7, 0.97));
  { const hd = (G, p) => { volley(G, p); G.ball.x = p.x + 14; G.ball.z = 30; G.ball.vz = -50; };
    const NM = { mx: 0 }, a = shot(tr('header'), 3, 'shoot', 99, hd, NM), b = shot(T0, 3, 'shoot', 99, hd, NM);
    if (!a || a.kind !== 'header') fail('style: header scenario did not head it'); else rec('header speed', within('header speed', a.v / b.v, 1.03, 1.3));
    const e = spread('header', 'shoot', 99, hd, NM); rec('header spread', within('header spread', e, 0.7, 0.97));
    // reach: a ball just beyond the base header reach is a header for the Power Header only
    const far = (G, p) => { hd(G, p); G.ball.x = p.x + 28; };
    const ra = shot(tr('header'), 3, 'shoot', 99, far, NM), rb = shot(T0, 3, 'shoot', 99, far, NM);
    if (!(ra && ra.kind === 'header' && (!rb || rb.kind !== 'header'))) fail('style: header reach not extended (' + (ra && ra.kind) + ' vs ' + (rb && rb.kind) + ')');
    const zv = (G, p) => { volley(G, p); G.ball.x = p.x + 27; G.ball.z = 22; };
    const rk = (def, setup) => { const G = mkG([def, cl({})], 3), p = G.players[0]; p.x = FW - 250; p.y = GCY; p.face = 0; p.vx = p.vy = 0; setup(G, p); return ISO.Game.resolveStrike(G, p, 'normal', true); };
    const va = rk(tr('acrobat'), zv), vb = rk(T0, zv);
    if (!(va.kind === 'volley' && vb.kind !== 'volley')) fail('style: volley ceiling not raised (' + va.kind + ' vs ' + vb.kind + ')'); }

  // movement helpers: a lone runner, no ball
  const run1 = (def, n, inpf, init) => {
    const G = mkG([def, cl({})], 5), p = G.players[0]; G.players[1].x = 60; G.players[1].y = 700; p.x = 100; p.y = 300; if (init) init(p, G);
    const tr2 = [];
    for (let i = 0; i < n; i++) { stepG(G, [inpf(i, p, G), Z]); tr2.push({ vx: p.vx, vy: p.vy, x: p.x, y: p.y, stam: p.stam, state: p.state }); }
    return { p, G, tr: tr2 };
  };
  const timeTo = (tr2, f, thr) => { for (let i = 1; i < tr2.length; i++) if (f(tr2[i]) >= thr) { const a = f(tr2[i - 1]), b = f(tr2[i]); return (i - 1 + (thr - a) / (b - a || 1)) * C.STEP; } return NaN; };
  // Quick Step: gets to half the jog speed sooner
  { const a = run1(tr('quickstep'), 120, () => ({ ...Z, mx: 1 })), b = run1(T0, 120, () => ({ ...Z, mx: 1 })), jog = a.p.jog;
    const ta = timeTo(a.tr, (s) => s.vx, 0.5 * jog), tb = timeTo(b.tr, (s) => s.vx, 0.5 * jog); rec('quick step 0-to-half-jog', ta / tb); within('quick step time', ta / tb, 0.7, 0.97); }
  // Relentless: loses less stamina over a 3 s sprint
  { const a = run1(tr('relentless'), 360, () => ({ ...Z, mx: 1, sprint: true })), b = run1(T0, 360, () => ({ ...Z, mx: 1, sprint: true }));
    const la = 100 - a.p.stam, lb = 100 - b.p.stam; rec('relentless stamina lost', la / lb); within('relentless stamina lost', la / lb, 0.7, 0.97); if (!(a.p.stam > b.p.stam)) fail('style: relentless has less stamina after a sprint'); }
  // Technical: the ball stays closer at a sprint with a defender alongside (mean distance, 2 s)
  { const mean = (def) => {
      const G = mkG([def, cl({})], 5), p = G.players[0], o = G.players[1]; p.x = 330; p.y = 300; p.face = Math.PI; p.vx = -p.jog; G.ball.owner = p; G.ball.x = p.x - 8; G.ball.y = p.y + 15; G.ball.z = 0;
      const ds = [];
      for (let i = 0; i < 360; i++) { o.x = p.x; o.y = p.y - 40; o.vx = o.vy = 0; stepG(G, [{ ...Z, mx: -1, my: 0, sprint: true }, Z]); if (i > 30 && i < 150 && G.ball.owner === p) ds.push(Math.hypot(G.ball.x - p.x, G.ball.y - p.y)); }
      return { sd: sd(ds), mean: ds.reduce((x, y) => x + y, 0) / ds.length }; };
    const ta = mean(tr('technical')), tb = mean(T0); rec('technical ball-distance spread (std)', ta.sd / tb.sd); within('technical ball-distance spread', ta.sd / tb.sd, 0.7, 0.97); if (ta.mean > tb.mean * 1.001) fail('style: technical keeps the ball further away'); }
  // Quick Reflexes: back on the feet sooner after a missed standing tackle; a tackled dribbler stumbles for less time
  { const rec1 = (def) => { const G = mkG([cl({}), def], 5), p = G.players[1]; G.ball.owner = G.players[0]; G.players[0].x = 100; G.players[0].y = 100; G.ball.x = 110; G.ball.y = 100; p.x = 100; p.y = 500; p.dir = 1;
      let t0 = -1, t1 = -1; for (let i = 0; i < 160; i++) { stepG(G, [Z, { ...Z, tackle: i < 2, mx: 1 }]); G.ball.owner = G.players[0]; G.ball.x = 110; G.ball.y = 100; G.players[0].x = 100; G.players[0].y = 100; if (t0 < 0 && p.state === 'tackle') t0 = i; if (t0 >= 0 && t1 < 0 && p.state === 'free') t1 = i; }
      return (t1 - t0) * C.STEP; };
    const r = rec1(tr('reflex')) / rec1(T0); rec('reflex tackle recovery', r); within('reflex tackle recovery', r, 0.7, 0.99);
    const stumble = (def) => { let tot = 0, n = 0; for (let s = 0; s < 120; s++) { const G = mkG([def, cl({})], 300 + s), p = G.players[0], t = G.players[1]; p.x = 100; p.y = 300; G.ball.owner = p; G.ball.x = 110; G.ball.y = 300; G.ball.z = 0; t.x = 118; t.y = 300; t.face = Math.PI; G.attacker = 0;
        for (let i = 0; i < 60; i++) { stepG(G, [Z, { ...Z, shoot: i === 0, mx: -1 }]); if (p.state === 'stumble') { tot += p.stDur; n++; break; } } }
      return { mean: tot / Math.max(n, 1), n }; };
    const sa = stumble(tr('reflex')), sb = stumble(T0); if (sa.n < 10 || sb.n < 10) fail('style: no tackles landed in the stumble scenario'); else { rec('reflex stumble time', sa.mean / sb.mean); within('reflex stumble time', sa.mean / sb.mean, 0.7, 0.99); } }
  // Trickster: a skill move costs less stamina and goes wrong less often (botches counted over 300 seeds at low stamina)
  { const probe = (def, seed, stam) => { const G = mkG([def, cl({})], seed), p = G.players[0]; p.x = 100; p.y = 300; p.face = 0; p.stam = stam; G.ball.owner = p; G.ball.x = p.x + 8; G.ball.y = p.y; G.ball.z = 0; p.vx = p.jog;
      for (let i = 0; i < 12; i++) { const s0 = p.stam; const ev = stepG(G, [{ ...Z, mx: 1, j: i < 6 }, Z]); if (ev.some((e) => e.type === 'skill')) return { cost: s0 - p.stam, botch: p.skill ? p.skill.botch : false, id: p.skill && p.skill.id }; } return null; };
    let ca = 0, cb = 0, ba = 0, bb = 0, n = 0;
    for (let s = 0; s < 300; s++) { const a = probe(tr('trickster'), 700 + s, 20), b = probe(T0, 700 + s, 20); if (a && b) { n++; ba += a.botch ? 1 : 0; bb += b.botch ? 1 : 0; } }
    for (let s = 0; s < 20; s++) { const a = probe(tr('trickster'), 700 + s, 100), b = probe(T0, 700 + s, 100); if (a && b && a.id === b.id) { ca += a.cost; cb += b.cost; } }
    if (n < 250) fail('style: trickster scenario played no skill moves'); else { rec('trickster cost', ca / cb); rec('trickster botches', ba / Math.max(bb, 1)); within('trickster stamina cost', ca / cb, 0.7, 0.97); within('trickster botch count', ba / Math.max(bb, 1), 0.5, 0.97); } }

  // Roles, identical attributes: turn, 0-to-top, stop distance orderings; top speed spread
  { const R = (r) => cl({ role: r });
    const turn = (r) => { const x = run1(R(r), 90, (i) => ({ ...Z, mx: i < 1 ? 1 : -1 }), (p) => { p.vx = p.jog; p.face = 0; p.x = 150; });
      return timeTo(x.tr, (s) => -s.vx, 0); };
    const start = (r, f) => { const x = run1(R(r), 200, () => ({ ...Z, mx: 1, sprint: true })); return timeTo(x.tr, (s) => s.vx, f * x.p.top); };
    const stop = (r) => { const x = run1(R(r), 160, () => Z, (p) => { p.vx = p.top; p.face = 0; p.x = 0; }); return x.tr[x.tr.length - 1].x - 0; };
    const tt = {}, ts = {}, td = {}; for (const r of Object.keys(ISO.ROLES)) { tt[r] = turn(r); ts[r] = start(r, 0.3); td[r] = stop(r); }
    const ord = (name, o, lo, hi) => { if (!(o[lo] < o[hi])) fail('style role ' + name + ': ' + lo + ' (' + o[lo].toFixed(4) + ') not below ' + hi + ' (' + o[hi].toFixed(4) + ')'); };
    ord('180 turn', tt, 'winger', 'target'); ord('180 turn', tt, 'playmaker', 'target');
    ord('0-to-30% top', ts, 'winger', 'box2box'); ord('0-to-30% top', ts, 'striker', 'box2box'); ord('0-to-30% top', ts, 'box2box', 'target');
    ord('stop distance', td, 'defender', 'box2box'); ord('stop distance', td, 'box2box', 'target');
    const tops = Object.keys(ISO.ROLES).map((r) => ST(R(r)).m.top); const spreadTop = Math.max(...tops) / Math.min(...tops) - 1; rec('role top-speed spread', spreadTop); if (spreadTop > 0.03) fail('style: role top-speed spread ' + spreadTop);
    console.log('roles: 180 turn s', JSON.stringify(Object.fromEntries(Object.entries(tt).map(([k, v]) => [k, +v.toFixed(3)]))), 'stop px', JSON.stringify(Object.fromEntries(Object.entries(td).map(([k, v]) => [k, +v.toFixed(1)])))); }

  // Weak foot: 1 star vs 5 star clones, a pass across the body in 2v2
  { const WF = (v) => cl({ attr: { wf: v } });
    const pass = (def, seed, th) => { const G = mkG([def, cl({}), cl({}), cl({})], seed), p = G.players[0], mate = G.players[2]; p.x = 100; p.y = 360; p.face = 0; p.vx = p.vy = 0; mate.x = 100 + 150 * Math.cos(th); mate.y = 360 + 150 * Math.sin(th); mate.vx = mate.vy = 0;
      G.players[1].x = 60; G.players[1].y = 40; G.players[3].x = 60; G.players[3].y = 700; G.ball.owner = p; G.ball.x = p.x + 8; G.ball.y = p.y; G.ball.z = 0; G.ball.vx = G.ball.vy = 0;
      const tgt = Math.atan2(mate.y - G.ball.y, mate.x - G.ball.x);
      for (let i = 0; i < 12; i++) for (const e of stepG(G, [{ ...Z, pass: i < 2 }, Z, Z, Z])) if (e.type === 'kick' && e.p === p) return { err: Math.atan2(G.ball.vy, G.ball.vx) - tgt, v: Math.hypot(G.ball.vx, G.ball.vy), weak: e.weak, foot: e.foot };
      return null; };
    const side = (th) => { const A = [], B = [], VA = [], VB = []; let same = true, wk = null, ft = null;
      for (let s = 0; s < 300; s++) { const a = pass(WF(99), 40 + s, th), b = pass(WF(45), 40 + s, th); if (!a || !b) continue; A.push(a.err); B.push(b.err); VA.push(a.v); VB.push(b.v); if (a.err !== b.err || a.v !== b.v) same = false; wk = a.weak; ft = a.foot; }
      return { ratio: rms(B) / rms(A), vr: (VB.reduce((x, y) => x + y, 0) / VB.length) / (VA.reduce((x, y) => x + y, 0) / VA.length), same, weak: wk, foot: ft, n: A.length }; };
    const L = side(0.5), Rr = side(-0.5), weakS = L.weak ? L : Rr, strongS = L.weak ? Rr : L;
    if (L.weak === Rr.weak) fail('style: exactly one side of a right-footed pass should be the weak foot (' + L.weak + ', ' + Rr.weak + ')');
    if (weakS.n < 250) fail('style: weak foot passes did not fire');
    rec('weak pass error ratio 1 star / 5 star', weakS.ratio); within('weak foot pass error ratio', weakS.ratio, 1.25, 2.2);
    rec('weak pass speed ratio', weakS.vr); within('weak foot pass speed ratio', weakS.vr, 0.85, 0.999);
    if (weakS.same) fail('style: 2v2 weak-side pass identical for 1 and 5 stars');
    if (!strongS.same) fail('style: strong-side pass not bit-equal for 1 and 5 stars');
    if (weakS.foot !== 'L' || strongS.foot !== 'R') fail('style: pass kick foot wrong (' + weakS.foot + ', ' + strongS.foot + ')');
    // a skill move toward the weak side costs a little speed and risk: strong side bit-equal, weak side differs
    const sk = (def, seed, my) => { const G = mkG([def, cl({})], seed), p = G.players[0]; p.x = 100; p.y = 300; p.face = 0; p.vx = p.jog; G.ball.owner = p; G.ball.x = p.x + 8; G.ball.y = p.y; G.ball.z = 0; let out = null;
      for (let i = 0; i < 80; i++) { stepG(G, [{ ...Z, mx: 0.3, my, j: i < 6 }, Z]); if (p.skill && !out) out = { sd: p.skill.sd, id: p.skill.id }; } return { out, x: p.x, y: p.y, stam: p.stam }; };
    let sameStrong = 0, diffWeak = 0, nS = 0; for (let s = 0; s < 40; s++) for (const my of [-1, 1]) { const a = sk(WF(99), 60 + s, my), b = sk(WF(45), 60 + s, my); if (!a.out || !b.out) continue; const weak = (a.out.sd > 0 && base.foot === 'R') || (a.out.sd < 0 && base.foot === 'L'); nS++; if (!weak && a.x === b.x && a.y === b.y) sameStrong++; if (weak && (a.x !== b.x || a.y !== b.y)) diffWeak++; if (!weak && (a.x !== b.x || a.y !== b.y)) fail('style: strong-side skill differs with weak foot'); }
    if (nS < 20) fail('style: skill scenario did not fire'); if (!diffWeak) fail('style: weak-side skill moves are not affected by the weak foot'); }
  console.log('style A/B:', report.join(' | '));
}
function inBoxNow(G) { return ISO.inBox(G.ball); }

// ---- Phase 2.5: celebrations (data validity, outfit clone, profile migration). Presentation only: nothing here touches the sim.
{
  const CE = ISO.CELEBS, ids = CE.map((c) => c.id);
  if (CE.length < 6 || new Set(ids).size !== ids.length) fail('celebs: ids missing or not unique');
  if (ids.includes('signature') || ids.includes('__proto__')) fail('celebs: reserved id');
  for (const c of CE) {
    if (typeof c.name !== 'string' || !c.name || typeof c.desc !== 'string') fail('celebs: name or desc missing for ' + c.id);
    if (!Number.isFinite(c.dur) || c.dur < 0.8 || c.dur > 4) fail('celebs: bad duration ' + c.id);
    if (!Number.isFinite(c.cost) || c.cost < 0 || typeof c.loop !== 'boolean') fail('celebs: bad cost or loop ' + c.id);
    if (!c.cam || !(c.cam.D > 3 && c.cam.D < 12) || !(c.cam.H > 0.8 && c.cam.H < 5) || !Number.isFinite(c.cam.yaw)) fail('celebs: bad cam ' + c.id);
  }
  if (!CE.some((c) => c.cost === 0)) fail('celebs: no free celebration');
  // the roster of celebrations: 24 entries, every bought one priced 300..3000, every id has a 2D pose (render.js CELEB_2D) and a shop group, every signature target exists
  if (CE.length < 24) fail('celebs: expected at least 24 celebrations, have ' + CE.length);
  const r2d = require('fs').readFileSync(__dirname + '/../js/render.js', 'utf8'), grouped = [].concat(...ISO.CELEB_GROUPS.map((g) => g[1]));
  for (const c of CE) {
    if (c.cost > 0 && (c.cost < 300 || c.cost > 3000)) fail('celebs: cost out of range ' + c.id + ' ' + c.cost);
    if (!new RegExp('\\n    ' + c.id + '\\(T, t\\)').test(r2d)) fail('celebs: no 2D pose for ' + c.id);
    if (!grouped.includes(c.id)) fail('celebs: ' + c.id + ' is in no shop group');
  }
  if (new Set(grouped).size !== grouped.length || grouped.some((id) => !ISO.hasCeleb(id))) fail('celebs: shop groups repeat an id or name an unknown one');
  for (const d of ISO.PLAYERS) { const sg = ISO.styleOf(d).celeb; if (!ISO.hasCeleb(sg)) fail('celebs: signature of ' + d.id + ' is unknown: ' + sg); }
  for (const [pid, id] of [['salah', 'tree'], ['palmer', 'cold'], ['drogba', 'kneeslide'], ['vardy', 'cornerflag'], ['rooney', 'knockout'], ['ronaldo', 'jumpturn']]) if (ISO.celebOf(ISO.playerById(pid)) !== id) fail('celebs: ' + pid + ' should celebrate with ' + id);
  const used = new Set();
  for (const d of ISO.PLAYERS) { const id = ISO.celebOf(d); used.add(id); if (!ISO.hasCeleb(id)) fail('celebs: ' + d.id + ' resolves to unknown ' + id); }
  if (used.size < 5) fail('celebs: the roster uses only ' + used.size + ' signatures');
  if (!ISO.hasCeleb(ISO.celebOf({ id: 'nobody', ovr: 60, foot: 'R', attr: { ...ISO.PLAYERS[40].attr }, look: { h: 1, w: 1 } })) || ISO.celebOf({}) !== 'fist' || ISO.celebOf(null) !== 'fist') fail('celebs: unknown def does not resolve');
  if (ISO.hasCeleb('constructor') || ISO.hasCeleb('__proto__') || ISO.hasCeleb('signature')) fail('celebs: prototype or meta id accepted');
  const base = ISO.PLAYERS[3], snap = JSON.stringify(base), o1 = ISO.outfit(base, false, 'home', 'robot'), o2 = ISO.outfit(base, true, 'gold', 'knee');
  if (o1 === base || o1.celeb !== 'robot' || o2.celeb !== 'knee' || o2.base !== base || o2.prime !== true) fail('celebs: outfit with a celebration did not clone');
  if (JSON.stringify(base) !== snap || base.celeb !== undefined) fail('celebs: outfit mutated the catalogue def');
  if (ISO.outfit(base, false, 'home') !== base || ISO.outfit(base, false, 'home', 'signature') !== base || ISO.outfit(base, false, 'home', 'bogus') !== base) fail('celebs: signature / unknown must return the def itself');
  if (ISO.celebOf(o1) !== 'robot' || ISO.celebOf(base) !== ISO.styleOf(base).celeb) fail('celebs: celebOf');
  if (ISO.styleOf(o1).role !== ISO.styleOf(base).role || ISO.styleOf(o1).traits.join() !== ISO.styleOf(base).traits.join()) fail('celebs: a celebration changed role or traits');
  // the sim is the same with or without it
  const run = (def) => { const G = ISO.Game.create({ roster: [def, ISO.PLAYERS[9]], seed: 9, kickoff: 0 }); for (let i = 0; i < 900; i++) ISO.Game.step(G, [{ ...ISO.Game.ZERO, my: 1, mx: 0.3, sprint: i % 200 < 100 }, { ...ISO.Game.ZERO }]); return JSON.stringify([G.players.map((p) => [p.x, p.y, p.vx, p.vy, p.stam]), G.ball.x, G.ball.y, G.rs]); };
  if (run(base) !== run(o1)) fail('celebs: a celebration changed the simulation');
  // profile: load an old-shape profile (no schema, no celebs, no celeb, no career.foot, an unknown celebration)
  const store = {}, KEY = 'isofootball.profile.v1';
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const loadProfile = (obj) => { store[KEY] = JSON.stringify(obj); delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
  const old = { credits: 5000, owned: ['messi', 'ghost'], claimed: {}, pity: 3, career: null, skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium', balls: [], ball: 'classic', settings: { volume: 0.5 }, stats: { matches: 4 }, drills: {} };
  let PR = loadProfile(old), D = PR.data;
  if (D.schema !== PR.SCHEMA || D.cup !== null || typeof D.cups !== 'object' || D.stats.cupWins !== 0 || !Array.isArray(D.celebs) || D.celebs.length || D.celeb !== 'signature' || D.career.foot !== 'R') fail('profile: old shape not back-filled');
  if (D.credits !== 5000 || D.stats.matches !== 4 || D.owned.join() !== 'messi' || D.pity !== 3) fail('profile: old data not kept');
  if (PR.careerDef().foot !== 'R') fail('profile: careerDef foot default');
  PR = loadProfile({ ...old, celebs: ['spin', 'nope', 'spin', 'fist', 7], celeb: 'nope', career: { ...JSON.parse(JSON.stringify(ISO.PLAYERS ? { attr: Object.fromEntries(ISO.ATTRS.map(([k]) => [k, 60])) } : {})), points: 2, stage: 1, ladder: [], look: 0, kit: 0, name: 'ME', foot: 'X' } }); D = PR.data;
  if (D.celebs.join() !== 'spin' || D.celeb !== 'signature') fail('profile: unknown celebration ids were not filtered (' + D.celebs + ' / ' + D.celeb + ')');
  if (D.career.foot !== 'R' || D.career.name !== 'ME' || D.career.stage !== 1) fail('profile: bad career foot not repaired or career lost');
  PR = loadProfile({ ...old, celebs: ['spin'], celeb: 'spin', schema: 2 }); D = PR.data;
  if (D.celeb !== 'spin' || PR.celebOf() !== 'spin' || !PR.ownsCeleb('spin') || PR.ownsCeleb('knee')) fail('profile: owned celebration lost');
  if (PR.buyCeleb('knee') !== 'ok' || D.celeb !== 'knee' || D.credits !== 5000 - ISO.celebById('knee').cost) fail('profile: buyCeleb');
  if (PR.buyCeleb('knee') !== 'owned' || PR.buyCeleb('nope') !== 'locked' || !PR.equipCeleb('signature') || PR.equipCeleb('arms') || D.celeb !== 'signature') fail('profile: equip / owned / locked');
  if (ISO.celebOf(PR.outfit(ISO.PLAYERS[3])) !== ISO.celebOf(ISO.PLAYERS[3])) fail('profile: signature outfit changed the celebration');
  PR.equipCeleb('knee'); if (ISO.celebOf(PR.outfit(ISO.PLAYERS[3])) !== 'knee') fail('profile: equipped celebration not on the outfit');
  if (PR.toggleFoot() !== 'L' || PR.careerDef().foot !== 'L' || PR.toggleFoot() !== 'R') fail('profile: foot toggle');
  PR = loadProfile({ ...old, schema: 99 }); if (PR.data.schema !== 99) fail('profile: a newer schema was lowered');
  // Phase 4.2 tournaments: profile migration, prizes, live-flag elimination
  {
    const rk = ISO.Cup.cupById('rookie'), me = 'cheadams', good = ISO.Cup.newState(rk, me, 99);
    const pro = (c) => JSON.parse(JSON.stringify(c));
    const load = (c, extra) => loadProfile({ ...old, owned: ['cheadams', 'armstrong'], cup: c, ...(extra || {}) }).data;
    if (!load(pro(good)).cup || load(pro(good)).cup.seed !== 99) fail('cup: a valid cup was dropped by migrate');
    for (const [what, mut] of [['unknown id', (c) => { c.id = 'nope'; }], ['unknown player', (c) => { c.field[3] = 'ghost'; }], ['duplicate entrant', (c) => { c.field[1] = c.field[0]; }], ['short field', (c) => { c.field.pop(); }],
      ['me not in field', (c) => { c.me = 'messi'; }], ['bad round', (c) => { c.round = 7; }], ['not an object', () => 0], ['res garbage', (c) => { c.res = 'x'; }], ['fixture result for the wrong pair', (c) => { c.res = [[{ a: c.field[2], b: c.field[3], w: c.field[2], sa: 1, sb: 0 }]]; }]]) {
      const c = pro(good); const r = mut(c); const D2 = load(r === undefined ? c : r);
      if (D2.cup !== null) fail('cup: corrupt cup kept (' + what + ')');
    }
    if (load({ ...pro(good), live: true }).cup !== null) fail('cup: a cup with live=true survived a reload (retry scumming)');
    let D2 = load(pro(good), { cups: { rookie: { won: 2, best: 3 }, gone: { won: 9 } , pro: 5 } });
    if (D2.cups.rookie.won !== 2 || D2.cups.gone || D2.cups.pro) fail('cup: cups record not repaired');
    // play a cup through the profile: kickoff flag, prizes, champion
    PR = loadProfile({ ...old, owned: ['cheadams', 'armstrong'], credits: 100 }); D = PR.data;
    if (PR.cupCan('pro', me) !== 'locked' || PR.cupCan('rookie', 'messi') !== 'noplayer' || PR.cupCan('rookie', 'armstrong') === 'unknown') fail('cup: cupCan');
    if (!PR.cupEnter('rookie', me, 7) || !D.cup || D.cup.live) fail('cup: enter');
    PR.cupKickoff(); if (!D.cup.live) fail('cup: kickoff did not set live');
    const prizes = []; let last;
    for (let r = 0; r < 3; r++) {
      if (r) { PR.cupKickoff(); }
      last = PR.recordCup(true, 3, 1); prizes.push(last.prize);
      while (D.cup && PR.cupSimNext().left > 0);
      if (r < 2 && (!D.cup || D.cup.round !== r + 1)) fail('cup: round did not advance after the sims (' + r + ')');
    }
    if (last.status !== 'champion' || D.cup !== null || D.cups.rookie.won !== 1 || D.stats.cupWins !== 1 || D.cups.rookie.best !== 3 || prizes.join() !== rk.prize.join() || D.credits !== 100 + rk.prize.reduce((a, b) => a + b, 0)) fail('cup: champion bookkeeping ' + JSON.stringify([last.status, prizes, D.credits, D.stats.cupWins]));
    if (PR.cupCan('pro', 'ings') === 'locked') fail('cup: winning the Rookie Cup did not unlock the Pro Cup');
    if (!PR.ACH.find((a) => a.id === 'cup_1') || PR.statOf(PR.ACH.find((a) => a.id === 'cup_1')) < 1 || !PR.ACH.find((a) => a.id === 'cup_5').player) fail('cup: achievements');
    PR.cupEnter('rookie', me, 8); PR.cupKickoff(); const lost = PR.recordCup(false, 0, 2);
    if (lost.status !== 'out' || D.cup !== null || lost.prize !== 0 || D.stats.cupWins !== 1) fail('cup: elimination');
  }
  delete globalThis.localStorage; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile;
}
// Phase 4.2 tournaments: bracket determinism and shape (pure, no profile)
{
  const CU = ISO.Cup, rk = CU.cupById('rookie');
  const a = CU.seedField(rk, 'cheadams', 12345), b = CU.seedField(rk, 'cheadams', 12345), c = CU.seedField(rk, 'cheadams', 54321);
  if (a.join() !== b.join()) fail('cup: the same seed gave a different bracket');
  if (a.join() === c.join()) fail('cup: different seeds gave the same bracket');
  for (const cup of ISO.CUPS) {
    const pool = ISO.PLAYERS.filter((d) => CU.eligible(cup, d)), meId = pool[0].id;
    for (let sd = 1; sd <= 25; sd++) {
      const f = CU.seedField(cup, meId, sd);
      if (f.length !== cup.size || new Set(f).size !== cup.size || !f.includes(meId) || !f.every((id) => CU.eligible(cup, ISO.playerById(id)))) fail('cup: ' + cup.id + ' field not eight unique eligible entrants (seed ' + sd + ')');
    }
    if (cup.rounds.length !== 3 || cup.prize.length !== 3 || Math.pow(2, cup.rounds.length) !== cup.size) fail('cup: ' + cup.id + ' table shape');
  }
  const st = CU.newState(rk, 'cheadams', 777), rounds = [];
  for (let r = 0; r < 3; r++) { rounds.push(CU.advance(st, { won: true, gf: 3, ga: 0 })); }
  if (rounds.join() !== 'next,next,champion' || !CU.isChampion(st) || st.res[2][0].w !== 'cheadams' || st.res.map((x) => x.length).join() !== '4,2,1') fail('cup: three wins did not make a champion in three rounds (' + rounds + ')');
  const st2 = CU.newState(rk, 'cheadams', 778); if (CU.advance(st2, { won: false, gf: 0, ga: 3 }) !== 'out') fail('cup: a loss did not eliminate');
  const fx = CU.simMatch(ISO.playerById('vardy'), ISO.playerById('wood'), 31337, 'normal'), fx2 = CU.simMatch(ISO.playerById('vardy'), ISO.playerById('wood'), 31337, 'normal');
  if (JSON.stringify([fx.sa, fx.sb, fx.w]) !== JSON.stringify([fx2.sa, fx2.sb, fx2.w]) || (fx.w !== 0 && fx.w !== 1)) fail('cup: simMatch not deterministic');
  const rf = CU.simMatch(ISO.playerById('vardy'), ISO.playerById('wood'), 5, 'normal'); ISO.CupFast = true; const rf2 = CU.simMatch(ISO.playerById('vardy'), ISO.playerById('wood'), 5, 'normal'); delete ISO.CupFast;
  if (rf2.how !== 'roll' || rf.how !== 'sim') fail('cup: CupFast fallback');
}
// Phase 5.1 career seasons: legacy migration, corrupt states, live-flag loss, bookkeeping, the table and the season end
{
  const CA = ISO.Career, store = {}, KEY = 'isofootball.profile.v1';
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const loadProfile = (obj) => { store[KEY] = JSON.stringify(obj); delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
  const base = { credits: 5000, owned: ['messi'], claimed: {}, pity: 0, skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium', balls: [], ball: 'classic', settings: { volume: 0.5 }, stats: { matches: 4 }, drills: {} };
  const attr = Object.fromEntries(ISO.ATTRS.map(([k], i) => [k, 50 + (i % 7)]));
  const legacy = (stage, extra) => ({ ...base, schema: 3, career: { attr, base: attr, points: 9, stage, ladder: Array.from({ length: 30 }, (_, i) => ISO.PLAYERS[i].id), look: 2, kit: 1, name: 'ACE', foot: 'L', ...(extra || {}) } });
  // legacy stages -> seasons, nothing else touched, no retroactive prizes
  [[0, 0], [7, 1], [13, 2], [17, 3], [20, 4], [30, 4]].forEach(([stage, want]) => {
    const PR = loadProfile(legacy(stage)), c = PR.data.career;
    if (c.sn.i !== want || !CA.valid(c.sn) || c.hist.length !== want || c.hist.some((h, k) => !h.legacy || h.i !== k) || PR.data.credits !== 5000) fail('career: legacy stage ' + stage + ' -> season ' + c.sn.i + ' (want ' + want + ')');
    if (c.stage !== stage || c.ladder.length !== 30 || c.points !== 9 || c.name !== 'ACE' || c.look !== 2 || c.attr.pac !== attr.pac || c.foot !== 'L' || c.best.join() !== '0,0,0,0,0') fail('career: legacy fields changed at stage ' + stage);
  });
  // corrupt season states are rebuilt at the same season; nothing else is lost
  for (const [what, sn] of [['unknown id', { ...CA.newSeason(5, 2, 1), field: ['nope', ...CA.newSeason(5, 2, 1).field.slice(1)] }], ['md 9', { ...CA.newSeason(5, 2, 1), md: 9 }], ['res not an array', { ...CA.newSeason(5, 2, 1), md: 1, res: 'x' }], ['duplicate ids', { ...CA.newSeason(5, 2, 1), field: Array(7).fill(CA.newSeason(5, 2, 1).field[0]) }], ['bad score', { ...CA.newSeason(5, 2, 1), md: 1, res: [{ w: true, gf: NaN, ga: 0 }] }], ['not an object', 7]]) {
    const c = loadProfile(legacy(2, { seed: 5, sn, hist: [], best: [0, 0, 0, 0, 0] })).data.career;
    if (!CA.valid(c.sn) || (typeof sn === 'object' && c.sn.i !== 2) || c.points !== 9 || c.name !== 'ACE' || c.attr.pac !== attr.pac || c.look !== 2) fail('career: corrupt season state kept or progress lost (' + what + ')');
  }
  // a fixture that was live at reload is a 0-3 loss, once
  { const sn = CA.newSeason(5, 1, 0); sn.live = true;
    const c = loadProfile(legacy(8, { seed: 5, sn, hist: [{ i: 0, legacy: true }], best: [0, 0, 0, 0, 0] })).data.career;
    if (c.sn.live || c.sn.md !== 1 || c.sn.res[0].w || c.sn.res[0].gf !== 0 || c.sn.res[0].ga !== 3) fail('career: live=true was not turned into a 0-3 loss');
    const again = loadProfile(JSON.parse(store[KEY])).data.career; if (again.sn.md !== 1) fail('career: a reload counted the forfeit twice'); }
  if (loadProfile({ ...legacy(0), schema: 99 }).data.schema !== 99) fail('career: schema 99 was lowered');
  // bookkeeping through the profile
  let PR = loadProfile({ ...base, career: null }), D = PR.data, c0 = D.career;
  if (D.schema !== PR.SCHEMA || !c0.sn || c0.sn.md !== 0 || c0.stage !== 0 || c0.ladder.length !== 30) fail('career: fresh career shape');
  if (!PR.careerBegin(1234) || c0.seed !== 1234 || PR.careerBegin(99) || c0.seed !== 1234) fail('career: careerBegin must reseed exactly once');
  const sea = PR.data.career, opp0 = PR.careerOpponent();
  if (PR.careerDiff() !== 'easy' || !opp0 || opp0.id !== CA.opponentId(sea.sn)) fail('career: opponent / diff');
  PR.careerKickoff(); if (!sea.sn.live) fail('career: kickoff did not set live');
  const mk = (won, gf, ga) => ({ mode: 'career', won, gf, ga, diff: 'easy', opp: opp0, skills: 0, clears: 0, powerGoals: 0 });
  let r = PR.recordMatch(mk(true, 3, 1));
  if (r.points !== 10 || sea.sn.md !== 1 || sea.sn.live || r.season.md !== 1 || r.season.done || D.stats.careerWins !== 1 || D.career.stage !== 0 || D.career.points !== 5 + 10) fail('career: win bookkeeping ' + JSON.stringify([r.points, r.season, D.career.points]));
  r = PR.recordMatch(mk(false, 0, 3)); if (r.points !== 3 || sea.sn.md !== 2 || sea.sn.res[1].w) fail('career: loss bookkeeping');
  PR.careerKickoff(); const ff = PR.careerForfeit(); if (!ff || sea.sn.md !== 3 || sea.sn.res[2].w || PR.careerForfeit() !== null) fail('career: forfeit');
  if (PR.seasonEnd() !== null) fail('career: seasonEnd before matchday 7');
  const tb = PR.seasonTable(); if (tb.length !== 8 || tb.some((x) => x.p !== 3)) fail('career: table size / games played');
  // seasonEnd: champion / up / stay / down, by forcing results through the model (seed search keeps it deterministic)
  const played = (seed, i, wins) => { const sn = CA.newSeason(seed, i, 0); for (let m = 0; m < 7; m++) CA.playMine(sn, { won: wins[m], gf: wins[m] ? 3 : 0, ga: wins[m] ? 0 : 3 }); return sn; };
  const want = {};
  for (let seed = 1; seed < 4000 && Object.keys(want).length < 4; seed++) for (const w of [7, 5, 3, 0]) {
    const wins = Array.from({ length: 7 }, (_, m) => m < w), sn = played(seed, 1, wins), f = CA.finish(seed, sn, 70);
    if (!want[f.move]) want[f.move] = { seed, wins, f };
  }
  if (Object.keys(want).length < 4) fail('career: could not produce champion/up/stay/down (' + Object.keys(want) + ')');
  for (const mv of ['champion', 'up', 'stay', 'down']) {
    const w = want[mv]; PR = loadProfile({ ...base, career: null }); D = PR.data; const cc = D.career;
    cc.seed = w.seed; cc.sn = played(w.seed, 1, w.wins); const cr0 = D.credits, pts0 = cc.points, def = ISO.SEASONS[1];
    const x = PR.seasonEnd(), exp = Math.round(def.prize * CA.PRIZE_PCT(w.f.pos));
    const bonus = mv === 'champion' ? 2 * def.win : mv === 'up' ? def.win : 0;
    if (!x || x.move !== mv || x.pos !== w.f.pos || x.prize !== exp || D.credits !== cr0 + exp || cc.points !== pts0 + bonus) fail('career: seasonEnd ' + mv + ' ' + JSON.stringify(x && [x.move, x.pos, x.prize, exp, bonus]));
    const ni = mv === 'champion' || mv === 'up' ? 2 : mv === 'down' ? 0 : 1;
    if (cc.sn.i !== ni || cc.sn.md !== 0 || cc.sn.n !== 1 || cc.hist.length !== 1 || cc.hist[0].pos !== w.f.pos || cc.best[1] !== w.f.pos) fail('career: ' + mv + ' next season / hist / best');
    if (D.stats.seasonsWon !== (mv === 'champion' ? 1 : 0) || D.stats.promotions !== (ni > 1 ? 1 : 0)) fail('career: ' + mv + ' stats');
    if (mv === 'champion') {      // the same title again pays half
      cc.sn = played(w.seed, 1, w.wins); cc.sn.n = 0; cc.seed = w.seed; cc.sn.i = 1; const c1 = D.credits, y = PR.seasonEnd();
      if (y.move !== 'champion' || y.prize !== exp / 2 || D.credits !== c1 + exp / 2) fail('career: repeat title not halved ' + y.prize);
    }
  }
  // Season 1 has no relegation, Season 5 champion stays and finishes the career
  { const sn = played(11, 0, Array(7).fill(false)), f = CA.finish(11, sn, 70); if (f.move === 'down' || f.next.i !== 0) fail('career: relegation in season 1');
    PR = loadProfile({ ...base, career: null }); D = PR.data; D.career.seed = 3; D.career.sn = played(3, 4, Array(7).fill(true));
    const rows = CA.table(3, D.career.sn, 70);
    if (rows[0].id === 'me') { const x = PR.seasonEnd(); if (x.next.i !== 4 || D.career.sn.i !== 4 || D.stats.careerDone !== 1 || D.stats.seasonsWon !== 1) fail('career: season 5 title'); } }
  // same seed same field and table, different seed differs
  { const a = CA.newSeason(77, 2, 0), b = CA.newSeason(77, 2, 0), c = CA.newSeason(78, 2, 0), d = CA.newSeason(77, 2, 1);
    for (const sn of [a, c]) { sn.md = 5; sn.res = Array.from({ length: 5 }, (_, m) => ({ w: m % 2 === 0, gf: 3, ga: 1 })); }
    b.md = 5; b.res = a.res;
    if (JSON.stringify(a.field) !== JSON.stringify(b.field) || JSON.stringify(a.field) === JSON.stringify(c.field) || JSON.stringify(a.field) === JSON.stringify(d.field)) fail('career: seed / attempt did not decide the field');
    if (JSON.stringify(CA.table(77, a, 70)) !== JSON.stringify(CA.table(77, b, 70)) || JSON.stringify(CA.table(77, a, 70).map((x) => x.id)) === JSON.stringify(CA.table(78, c, 70).map((x) => x.id))) fail('career: table seed determinism'); }
  // table invariants: every team has played md games, points = 3 x wins (no draws) and sum to 12 x md, goals balance, every pairing exactly once over seven matchdays
  for (let i = 0; i < 5; i++) for (let seed = 1; seed <= 20; seed++) {
    const sn = CA.newSeason(seed * 7919, i, seed % 3), ovr = CA.pool(i).map((d) => d.ovr);
    if (sn.field.length !== 7 || new Set(sn.field).size !== 7 || !CA.valid(sn)) fail('career: season field ' + i);
    const sorted = [...Array(7).keys()].map((r) => ISO.playerById(CA.opponentId({ ...sn, md: r })).ovr);
    if (sorted.some((o, k) => k && o < sorted[k - 1])) fail('career: rivals do not get stronger by matchday (season ' + i + ')');
    if (!sn.field.every((id) => { const d = ISO.playerById(id), b = ISO.SEASONS[i].band; return (b.minOvr == null || d.ovr >= b.minOvr) && (b.maxOvr == null || d.ovr <= b.maxOvr) && (!b.era || d.era === b.era); })) fail('career: rival outside the band (season ' + i + ')');
    const seen = new Set();
    for (let m = 0; m < 7; m++) { const fx = CA.schedule(m); if (fx.length !== 4 || new Set(fx.flat()).size !== 8) fail('career: schedule md ' + m); for (const [a, b] of fx) seen.add(Math.min(a, b) * 8 + Math.max(a, b)); if (CA.schedule(m).find(([a, b]) => a === 0 || b === 0).includes(CA.slotOf(m)) === false) fail('career: slot of my opponent md ' + m); }
    if (seen.size !== 28) fail('career: round robin does not pair everyone once');
    for (let md = 0; md <= 7; md++) {
      sn.md = md; sn.res = Array.from({ length: md }, (_, m) => ({ w: (seed + m) % 3 !== 0, gf: 2, ga: 1 }));
      const t = CA.table(seed, sn, 70);
      if (t.length !== 8 || t.some((x) => x.p !== md || x.pts !== 3 * x.w || x.w + x.l !== md) || t.reduce((n, x) => n + x.pts, 0) !== 12 * md || t.reduce((n, x) => n + x.gf, 0) !== t.reduce((n, x) => n + x.ga, 0)) fail('career: table invariants (season ' + i + ' md ' + md + ')');
      for (let k = 1; k < 8; k++) if (t[k].pts > t[k - 1].pts) fail('career: table not sorted');
    }
  }
  if (CA.seedOf({ name: 'A', stage: 1 }) === CA.seedOf({ name: 'B', stage: 1 }) || CA.seedOf({ name: 'A' }) !== CA.seedOf({ name: 'A' })) fail('career: seedOf');
  delete globalThis.localStorage; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile;
}
// Phase 5.2-5.4 career objectives, training and reputation: tracker on scripted events, the objective table, the draw, XP -> attributes, reputation, migration, forfeit
{
  const CA = ISO.Career, TR = CA.Tracker, CC = ISO.C, store = {}, KEY = 'isofootball.profile.v1';
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const loadProfile = (obj) => { store[KEY] = JSON.stringify(obj); delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
  const stub = (score, winner) => ({ stats: { poss: [30, 20], shots: [6, 4], onTarget: [4, 2], saves: [1, 1], clears: [0, 0], tackles: [3, 2], skills: [5, 0], powerGoals: [0, 0] }, score, winner, time: 70, ball: { shot: null } });
  const me = (x, y) => ({ team: 0, x, y }), cpu = { team: 1, x: 100, y: 300 };
  const run = (G, evs, gap) => { const tr = TR.create(0), snap = JSON.stringify(G); for (const e of evs) TR.onEvent(tr, G, e); if (JSON.stringify(G) !== snap) fail('tracker: onEvent changed G'); return TR.finish(tr, G, { gap }); };
  const ins = me(CC.FW - 60, 360), far = me(CC.FW - 330, 360), wide = me(CC.FW - 60, 40);
  // goals by foot and place: a weak-foot goal from outside the box, a strong-foot goal from inside, one from a wide angle (outside the box by y), the opponent's goals, an own goal
  let m = run(stub([3, 1], 0), [{ type: 'kick', p: far, shot: 'normal', weak: true }, { type: 'goal', team: 0, own: false }, { type: 'kick', p: ins, shot: 'power', weak: false }, { type: 'goal', team: 0, own: false },
    { type: 'kick', p: cpu, shot: 'normal', weak: false }, { type: 'goal', team: 1, own: false }, { type: 'kick', p: wide, shot: 'normal' }, { type: 'goal', team: 0, own: false }], 5);
  if (m.gf !== 3 || m.ga !== 1 || m.goalsOut !== 2 || m.goalsWeak !== 1 || m.goalsByType.power !== 1 || m.goalsByType.normal !== 2 || !m.won || m.ovrGap !== 5) fail('tracker: goals ' + JSON.stringify(m));
  m = run(stub([1, 3], 1), [{ type: 'kick', p: me(CC.FW - 400, 300), shot: 'normal' }, { type: 'goal', team: 0, own: true }, { type: 'goal', team: 1, own: false }], 0);
  if (m.goalsOut !== 0) fail('tracker: own goal counted as a shot goal');
  m = run(stub([2, 1], 0), [{ type: 'goal', team: 1, own: false }, { type: 'kick', p: ins, shot: 'normal' }, { type: 'goal', team: 0, own: false }, { type: 'goal', team: 0, own: false }], 0);
  if (!m.comeback || !m.won) fail('tracker: comeback (went behind, then won)');
  m = run(stub([2, 0], 0), [{ type: 'goal', team: 0, own: false }, { type: 'goal', team: 0, own: false }], 0);
  if (m.comeback) fail('tracker: comeback without trailing');
  // possession losses: a tackle or steal on me counts, my own tackles and the other team's skills do not
  m = run(stub([0, 0], -1), [{ type: 'tackle', p: cpu, on: me(1, 1) }, { type: 'steal', p: cpu, on: me(1, 1) }, { type: 'tackle', p: me(1, 1), on: cpu }, { type: 'steal', p: me(1, 1), on: cpu }, { type: 'tackle', p: cpu, loose: true },
    { type: 'skill', p: me(1, 1) }, { type: 'skill', p: cpu }, { type: 'botch', p: me(1, 1) }, { type: 'beaten', p: cpu, by: me(1, 1) }, { type: 'burst', p: me(1, 1) }, { type: 'burst', p: cpu }, { type: 'bump', p: me(1, 1), on: cpu }], 0);
  if (m.lost !== 2 || m.botches !== 1 || m.beats !== 1 || m.bursts !== 1 || m.bumps !== 1 || m.skills !== 5) fail('tracker: events ' + JSON.stringify([m.lost, m.botches, m.beats, m.bursts, m.bumps, m.skills]));
  if (m.skillsOk !== 4) fail('tracker: successful skill moves = skills - botches');
  if (TR.create(0) === TR.create(0)) fail('tracker: create must return a fresh object');
  // every objective fires on a summary that meets it and not on one that does not
  const zero = { won: false, gf: 0, ga: 0, time: 60, poss: 50, shots: 0, sot: 0, saves: 0, clears: 0, power: 0, skills: 0, skillsOk: 0, tackles: 0, goalsOut: 0, goalsWeak: 0, goalsByType: {}, lost: 9, botches: 0, bursts: 0, bumps: 0, beats: 0, ankles: 0, comeback: false, ovrGap: 0, rating: 5 };
  const pos = { o_goal: { gf: 1 }, o_skill3: { skills: 3 }, o_tackle2: { tackles: 2 }, o_sot3: { sot: 3 }, o_poss45: { poss: 45 }, o_win: { won: true }, o_two: { gf: 2 }, o_skill5: { skillsOk: 5 }, o_out: { goalsOut: 1 }, o_weak: { goalsWeak: 1 }, o_poss55: { poss: 55 },
    o_tackle5: { tackles: 5 }, o_power: { power: 1 }, o_beats8: { beats: 8 }, o_clean: { won: true, ga: 0 }, o_keep: { lost: 5 }, o_never: { lost: 0 }, o_stronger: { won: true, ovrGap: 3 }, o_comeback: { comeback: true },
    o_double: { goalsOut: 1, goalsWeak: 1 }, o_master: { won: true, poss: 60, skillsOk: 5 }, o_dominant: { won: true, gf: 3, ga: 0, poss: 55 }, o_rating: { rating: 9 } };
  const neg = { o_goal: { gf: 0 }, o_skill3: { skills: 2 }, o_tackle2: { tackles: 1 }, o_sot3: { sot: 2 }, o_poss45: { poss: 44 }, o_win: { won: false }, o_two: { gf: 1 }, o_skill5: { skillsOk: 4 }, o_out: { goalsOut: 0 }, o_weak: { goalsWeak: 0 }, o_poss55: { poss: 54 },
    o_tackle5: { tackles: 4 }, o_power: { power: 0 }, o_beats8: { beats: 7 }, o_clean: { won: true, ga: 1 }, o_keep: { lost: 6 }, o_never: { lost: 1 }, o_stronger: { won: true, ovrGap: 0 }, o_comeback: { comeback: false },
    o_double: { goalsOut: 1, goalsWeak: 0 }, o_master: { won: true, poss: 59, skillsOk: 5 }, o_dominant: { won: true, gf: 3, ga: 1, poss: 55 }, o_rating: { rating: 8.9 } };
  for (const o of CA.OBJ) {
    if (!pos[o.id]) { fail('objective without a scripted case: ' + o.id); continue; }
    if (!o.test({ ...zero, ...pos[o.id] })) fail('objective ' + o.id + ' did not fire on a qualifying match');
    if (o.test({ ...zero, ...neg[o.id] })) fail('objective ' + o.id + ' fired on a match that does not qualify');
    if (![0, 1, 2].includes(o.tier) || !(o.n >= 1) || typeof o.desc !== 'string') fail('objective shape ' + o.id);
  }
  // the roadmap's seven are all there
  for (const id of ['o_two', 'o_skill5', 'o_out', 'o_weak', 'o_clean', 'o_keep', 'o_stronger']) if (!CA.OBJ_BY[id]) fail('roadmap objective missing ' + id);
  if (CA.OBJ.some((o) => !CA.OBJ.some((p) => p.tier === o.tier && p.minRep === 0 && p.minSeason === 0 && !p.can))) fail('objective pool: a tier has no always-available objective');
  // the draw: deterministic per seed, season, attempt, matchday; one of each tier; gated by rep tier and season; "stronger" needs a stronger opponent; n per season
  const dr = (seed, i, n, md, ctx, used) => CA.draw(seed, i, n, md, ctx, used);
  if (JSON.stringify(dr(7, 1, 0, 3, { gap: 4, rep: 0 })) !== JSON.stringify(dr(7, 1, 0, 3, { gap: 4, rep: 0 }))) fail('draw: not deterministic');
  { const seen = new Set(); for (let md = 0; md < 7; md++) for (let s = 1; s < 9; s++) seen.add(dr(s * 31, 1, 0, md, { gap: 3, rep: 0 }).join()); if (seen.size < 20) fail('draw: too few distinct triples (' + seen.size + ')'); }
  for (let s = 0; s < 200; s++) {
    const i = s % 5, rep = [0, 100, 300, 700, 1500, 5000][s % 6], gap = s % 4 === 0 ? -6 : 5, ids = dr(s * 17 + 1, i, s % 3, s % 7, { gap, rep }), os = ids.map((id) => CA.OBJ_BY[id]);
    if (os.some((o, t) => !o || o.tier !== t || o.minSeason > i || (o.minRep > 0 && CA.tierOf(o.minRep) > CA.tierOf(rep)) || (o.can && !o.can({ gap })))) fail('draw: ' + ids + ' breaks a gate (season ' + i + ' rep ' + rep + ' gap ' + gap + ')');
  }
  { const u = {}; let ok = true; for (let md = 0; md < 7; md++) for (const id of dr(5, 0, 0, md, { gap: 3, rep: 0 }, u)) { u[id] = (u[id] || 0) + 1; if (u[id] > CA.OBJ_BY[id].n) ok = false; } if (!ok) fail('draw: n per season exceeded'); }
  { const a = CA.seasonObjs(9, 2, 0), b = CA.seasonObjs(9, 2, 0), c = CA.seasonObjs(9, 2, 1); if (a.join() !== b.join() || a.some((id, t) => CA.SEASON_BY[id].tier !== t) || a.length !== 3) fail('season objectives: shape / determinism'); void c; }
  // rewards: 40/80/150 x (1 + 0.25 i), rep 5/10/20, points 0/1/2
  { const r0 = CA.objReward(0, 0), r1 = CA.objReward(1, 2), r2 = CA.objReward(2, 4); if (r0.credits !== 40 || r1.credits !== 120 || r2.credits !== 300 || r0.rep !== 5 || r1.rep !== 10 || r2.rep !== 20 || r0.points !== 0 || r1.points !== 1 || r2.points !== 2) fail('objective rewards ' + JSON.stringify([r0, r1, r2])); }
  // tiers 0/100/300/700/1500/3000/5000, monotonic rep (every source adds, none subtracts)
  { const th = [[0, 0], [99, 0], [100, 1], [299, 1], [300, 2], [699, 2], [700, 3], [1499, 3], [1500, 4], [2999, 4], [3000, 5], [4999, 5], [5000, 6], [99999, 6]]; for (const [r, t] of th) if (CA.tierOf(r) !== t) fail('rep tier of ' + r + ' = ' + CA.tierOf(r) + ' (want ' + t + ')'); if (CA.REP_TIERS.length !== 7) fail('rep tiers'); }
  for (let s = 0; s < 300; s++) { const w = s % 3 !== 0, mm = { ...zero, won: w, gf: w ? 3 : s % 3, ga: w ? s % 3 : 3, poss: 20 + (s % 60), skillsOk: s % 9, rating: CA.rating({ ...zero, won: w, gf: w ? 3 : 0, ga: w ? 0 : 3 }), ovrGap: (s % 21) - 10 }; const p = CA.matchRep(mm, 1 + (s % 8)); for (const v of Object.values(p)) if (!(v >= 0)) fail('rep: a negative source ' + JSON.stringify(p)); }
  for (const mv of ['champion', 'up', 'stay', 'down']) for (let i = 0; i < 5; i++) if (!(CA.seasonRep(mv, i) >= 0)) fail('rep: season rep');
  for (let k = 0; k < 40; k++) { const a = { won: true, gf: 3, ga: 0, poss: 60, skillsOk: 6, ovrGap: 4, rating: 9 }, lo = { won: false, gf: 0, ga: 3, poss: 30, skillsOk: 0, ovrGap: 4, rating: 3 }; if (CA.rating({ ...zero, ...a }) < CA.rating({ ...zero, ...lo }) || CA.rating({ ...zero, ...a }) > 10 || CA.rating({ ...zero, ...lo }) < 0) fail('rating range / order'); }
  if (CA.KIT_REQ.length !== 10 || CA.LOOK_REQ.length !== 10 || CA.KIT_REQ.slice(0, 6).some((x) => x) || CA.LOOK_REQ.slice(0, 6).some((x) => x)) fail('rep unlocks: the first six kits and looks must stay free');
  // training: XP needs 100 x upgradeCost per point, the lowest attribute first, never above the season cap, the focus doubles, XP is banked when capped
  { const attr = Object.fromEntries(ISO.ATTRS.map(([k]) => [k, 60])), C0 = { attr, xp: Object.fromEntries(CA.TRAIN.map((t) => [t.id, 0])), trained: {}, focus: 'finishing' };
    attr.fin = 61; let g = CA.addXp(C0, 'finishing', 60, 75);
    if (g.x !== 120 || g.gains.length !== 1 || g.gains[0].k !== 'sho' || attr.sho !== 61 || C0.xp.finishing !== 20 || C0.trained.sho !== 1) fail('training: focus x2, lowest first ' + JSON.stringify([g, C0.xp.finishing]));
    g = CA.addXp(C0, 'sprint', 100, 75); if (g.x !== 100 || g.gains.length !== 1 || attr.pac !== 61) fail('training: no focus = x1');
    C0.xp.strength = 0; attr.str = 69; attr.bal = 69; g = CA.addXp(C0, 'strength', 100, 75); if (g.gains.length !== 1 || attr.str !== 70 || C0.xp.strength !== 0) fail('training: 100 XP at cost 1'); g = CA.addXp(C0, 'strength', 100, 75); if (g.gains.length !== 1 || attr.bal !== 70 || C0.xp.strength !== 0) fail('training: second attribute second');
    C0.xp.strength = 0; g = CA.addXp(C0, 'strength', 100, 75); if (g.gains.length !== 0 || C0.xp.strength !== 100) fail('training: cost 2 at 70 needs 200 XP');
    attr.sta = 75; C0.xp.endurance = 0; g = CA.addXp(C0, 'endurance', 100, 75); if (g.gains.length || attr.sta !== 75 || C0.xp.endurance !== 100) fail('training: gain above the season cap'); for (let k = 0; k < 20; k++) CA.addXp(C0, 'endurance', 100, 75); if (C0.xp.endurance > CA.XP_BANK + 200 || attr.sta !== 75) fail('training: capped XP not bounded');
    g = CA.addXp(C0, 'endurance', 100, 76); if (g.gains.length !== 1 || attr.sta !== 76) fail('training: the next season raises the cap and releases the XP');
    if (CA.TRAIN.length !== 6 || CA.TRAIN.some((t) => !t.attrs.length || !Array.isArray(t.drills) || t.drills.some((d) => !ISO.DRILLS[d]))) fail('training: programme table');
    if (CA.TRAIN_BY.sprint.drills.length || CA.TRAIN_BY.strength.drills.length || CA.TRAIN_BY.endurance.drills.length) fail('training: sprint/strength/endurance are match-only');
    if (CA.drillRaw(10, 30) !== 33 || CA.drillRaw(99, 30) !== 100 || CA.drillRaw(-1, 30) !== 0) fail('training: drill XP');
    for (const T of CA.TRAIN) for (const mm of [zero, { ...zero, bursts: 99, beats: 99, skillsOk: 99, sot: 99, gf: 9, bumps: 99, tackles: 99, goalsWeak: 9, time: 999 }]) { const v = Math.min(100, T.measure(mm)); if (!(v >= 0 && v <= 100)) fail('training: measure range ' + T.id); } }
  // the profile: migration of a session-1 career, setAttr floor, kits by tier, forfeit pays nothing, objectives and training through recordMatch
  const base = { credits: 5000, owned: ['messi'], claimed: {}, pity: 0, skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium', balls: [], ball: 'classic', settings: { volume: 0.5 }, stats: { matches: 4 }, drills: {} };
  const attr0 = Object.fromEntries(ISO.ATTRS.map(([k], i) => [k, 50 + (i % 7)]));
  const s1 = (extra) => ({ ...base, schema: 4, career: { attr: attr0, base: attr0, points: 9, stage: 8, ladder: Array.from({ length: 30 }, (_, i) => ISO.PLAYERS[i].id), look: 2, kit: 1, name: 'ACE', foot: 'L', seed: 5, sn: CA.newSeason(5, 1, 0), hist: [{ i: 0, legacy: true }], best: [0, 0, 0, 0, 0], ...(extra || {}) } });
  let PR = loadProfile(s1()), D = PR.data, c = D.career;
  if (c.rep !== 0 || c.tokens !== 1 || c.focus !== 'finishing' || Object.keys(c.trained).length || CA.TRAIN.some((t) => c.xp[t.id] !== 0) || c.obj !== null || c.streak !== 0 || !c.sn.tally || c.sn.tally.p !== 0 || D.stats.objDone !== 0 || D.schema !== PR.SCHEMA) fail('migration: a session-1 career was not back-filled ' + JSON.stringify([c.rep, c.tokens, c.focus, c.obj, c.streak, c.sn.tally]));
  if (c.points !== 9 || c.name !== 'ACE' || c.look !== 2 || c.kit !== 1 || c.attr.pac !== attr0.pac || c.sn.i !== 1 || c.hist.length !== 1) fail('migration: session-1 progress changed');
  PR = loadProfile(s1({ rep: -5, xp: { finishing: 'x', bogus: 9, sprint: 250 }, trained: { pac: 4, nope: 2 }, tokens: 9, focus: 'bogus', traits: ['nope'], obj: { sk: 'x', ids: ['nope'] } })); c = PR.data.career;
  if (c.rep !== 0 || c.tokens !== 2 || c.focus !== 'finishing' || c.xp.finishing !== 0 || c.xp.sprint !== 250 || 'bogus' in c.xp || c.trained.pac !== 4 || 'nope' in c.trained || c.traits.length || c.obj !== null) fail('migration: corrupt new fields not repaired ' + JSON.stringify([c.rep, c.tokens, c.focus, c.xp, c.trained, c.traits, c.obj]));
  PR = loadProfile(s1({ rep: 640, xp: { sprint: 40 }, trained: { pac: 2 }, tokens: 0, focus: 'sprint' })); c = PR.data.career;
  if (c.rep !== 640 || c.xp.sprint !== 40 || c.trained.pac !== 2 || c.tokens !== 0 || c.focus !== 'sprint') fail('migration: valid new fields were changed');
  { const s = JSON.parse(JSON.stringify(PR.data)); PR = loadProfile(s); if (JSON.stringify(PR.data.career.xp) !== JSON.stringify(s.career.xp) || PR.data.career.rep !== 640) fail('migration: not idempotent'); }
  // floor: trained points are not refundable
  PR = loadProfile(s1({ trained: { pac: 3 } })); c = PR.data.career; c.attr.pac = 60; PR.save();
  if (PR.setAttr('pac', 0) !== 33) fail('setAttr: the floor is ATTR_MIN + trained (' + c.attr.pac + ')');
  { const k = 'str'; if (PR.setAttr(k, 0) !== 30) fail('setAttr: untrained attributes still go down to ATTR_MIN'); }
  // kits and looks by reputation tier (appended, indices stable)
  PR = loadProfile(s1({ kit: 0, rep: 0 })); c = PR.data.career; for (let k = 0; k < 12; k++) PR.cycleKit(1); if (c.kit >= 6) fail('kits: a locked kit was reachable at rep 0 (' + c.kit + ')');
  c.rep = 300; for (let k = 0; k < 12; k++) { PR.cycleKit(1); if (c.kit === 6) break; } if (c.kit !== 6) fail('kits: the tier-2 kit did not unlock at 300');
  c.look = 0; c.rep = 0; for (let k = 0; k < 12; k++) PR.cycleLook(1); if (c.look >= 6) fail('looks: a locked look was reachable');
  if (PR.careerDef().kit.a !== '#b06bff' && c.kit === 6) fail('kits: appended kit 6 colours');
  // forfeit pays nothing; a result without a tracker summary pays no objectives, XP or reputation; a result with one pays all of them
  PR = loadProfile(s1()); D = PR.data; c = D.career; const snap0 = JSON.stringify([c.rep, c.xp, c.tokens, c.trained, c.streak, D.credits, c.points, D.stats.objDone]);
  PR.careerKickoff(); const ff = PR.careerForfeit(); if (!ff || JSON.stringify([c.rep, c.xp, c.tokens, c.trained, c.streak, D.credits, c.points, D.stats.objDone]) !== snap0) fail('forfeit: paid something');
  let opp = PR.careerOpponent(); PR.careerKickoff();
  let res = PR.recordMatch({ mode: 'career', won: true, gf: 3, ga: 0, diff: 'easy', opp, skills: 0, clears: 0, powerGoals: 0 });
  if (res.obj !== null || c.rep !== 0 || c.tokens !== 1 || CA.TRAIN.some((t) => c.xp[t.id])) fail('recordMatch: no tracker summary must pay no objectives / XP / rep');
  const objs = PR.careerObjectives(); if (objs.length !== 3 || objs.some((o, t) => o.tier !== t) || JSON.stringify(PR.careerObjectives()) !== JSON.stringify(objs)) fail('careerObjectives: three, stable between calls');
  const cr0 = D.credits, pts0 = c.points; PR.careerKickoff(); opp = PR.careerOpponent();
  const mm = { ...zero, won: true, gf: 3, ga: 0, poss: 60, sot: 5, skills: 6, skillsOk: 6, tackles: 6, goalsOut: 1, goalsWeak: 1, lost: 0, beats: 9, bursts: 3, bumps: 2, time: 75, ovrGap: 3 }; mm.rating = CA.rating(mm);
  res = PR.recordMatch({ mode: 'career', won: true, gf: 3, ga: 0, diff: 'easy', opp, skills: 6, clears: 0, powerGoals: 0, m: mm });
  const ob = res.obj; if (!ob || ob.objs.length !== 3 || c.streak !== 1 || ob.tokens !== 2 || c.tokens !== 2 || !(c.rep > 0) || c.rep !== ob.rep || ob.xp.finishing !== 2 * Math.min(100, CA.TRAIN_BY.finishing.measure(mm))) fail('recordMatch: objective payout ' + JSON.stringify(ob && [ob.rep, ob.tokens, ob.xp, c.streak]));
  { const done = ob.objs.filter((o) => o.done); if (D.credits !== cr0 + res.credits + done.reduce((n, o) => n + o.credits, 0) || c.points !== pts0 + res.points + done.reduce((n, o) => n + o.points, 0) || D.stats.objDone !== done.length) fail('recordMatch: objective credits / points / objDone'); }
  if (c.sn.tally.p !== 1 || c.sn.tally.w !== 1 || c.sn.tally.goalsOut !== 1) fail('season tally not updated');
  const trained = Object.values(c.trained).reduce((a, b) => a + b, 0); if (trained !== ob.gains.reduce((n, g) => n + g.to - g.from, 0)) fail('recordMatch: trained[] and the gain list disagree');
  // tokens: bank of two, spent by a drill that trains the chosen programme only; XP only on completion
  c.tokens = 2; if (PR.trainStart('sprint', 'target') || PR.trainStart('finishing', 'finesse') || c.tokens !== 2) fail('tokens: a drill that does not train the programme took a token');
  { const rep0 = JSON.stringify(c.xp); if (!PR.trainStart('finishing', 'target') || c.tokens !== 1 || !PR.trainActive()) fail('tokens: spend'); const x = PR.trainFinish('target', 15); if (!x || x.xp !== 2 * 50 || c.xp.finishing === JSON.parse(rep0).finishing && !x.gains.length) fail('tokens: drill XP (focus doubles)'); if (PR.trainFinish('target', 15) !== null) fail('tokens: a drill paid twice'); }
  c.tokens = 0; if (PR.trainStart('finishing', 'target')) fail('tokens: started with none');
  // objectives are drawn per matchday and survive a reload
  { const ids = PR.careerObjectives().map((o) => o.id); PR = loadProfile(JSON.parse(store[KEY])); if (PR.careerObjectives().map((o) => o.id).join() !== ids.join()) fail('objectives changed across a reload'); }
  // a traits unlock is reported once
  { PR = loadProfile(s1({ traits: [] })); c = PR.data.career; const t = ISO.styleOf(PR.careerDef()).traits; const r1 = PR.careerSettle({ ...zero }, { opp: PR.careerOpponent() }); if (r1.traitsNew.join() !== t.join()) fail('traits: first settle must report the current traits as new'); const r2 = PR.careerSettle({ ...zero }, { opp: PR.careerOpponent() }); if (r2.traitsNew.length) fail('traits: reported twice'); }
  // achievements for the new families exist
  for (const id of ['obj_1', 'obj_100', 'rep_300', 'rep_5000']) if (!PR.ACH.some((a) => a.id === id)) fail('achievement missing ' + id);
  // upgradeCost in profile matches the table career-obj uses
  for (const v of [30, 69, 70, 79, 80, 89, 90, 98]) if (PR.upgradeCost(v) !== CA.xpCost(v) / 100) fail('xpCost vs upgradeCost at ' + v);
  delete globalThis.localStorage; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile;
}
// Phase 5.5 rivals and the season finale, Phase 5.6 collection: rivalDef purity, ledgers, the finale's win / loss / forfeit / skip paths, session-2 migration, sets, favourites, duplicate stars, custom kit
{
  const CA = ISO.Career, RV = ISO.Rivals, CO = ISO.Collection, store = {}, KEY = 'isofootball.profile.v1';
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const loadProfile = (obj) => { store[KEY] = JSON.stringify(obj); delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
  const reload = () => loadProfile(JSON.parse(store[KEY]));
  const fresh = (seed) => { delete store[KEY]; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js'); const P = ISO.Profile; P.resetCareer(seed); P.data.credits = 0; P.save(); return P; };
  // ---- rivalDef: pure, deterministic, a def clone with base, strictly harder per level up to the cap
  const snap = JSON.stringify(RV.RIVALS.map((r) => [r.look, r.kit, r.base]));
  for (const r of RV.RIVALS) {
    let prev = 0;
    for (let lv = 0; lv < 9; lv++) {
      const a = RV.rivalDef(r, lv), b = RV.rivalDef(r.id, lv);
      if (JSON.stringify(a) !== JSON.stringify(b)) fail('rivalDef not deterministic ' + r.id + ' ' + lv);
      if (a === b || a.base === a || a.base.base) fail('rivalDef must be a fresh clone with a plain base');
      if (!(a.ovr >= prev) || (a.ovr === prev && a.ovr < 97) || a.ovr > 97) fail('rivalDef ovr not rising to the cap: ' + r.id + ' ' + lv + ' ' + a.ovr);
      prev = a.ovr;
      for (const k of ISO.ATTRS.map((x) => x[0])) if (!(a.attr[k] >= 25 && a.attr[k] <= 99) || !Number.isInteger(a.attr[k])) fail('rivalDef attr range ' + r.id + ' ' + k);
      if (ISO.roleOf(a) !== r.prof || !ISO.styleOf(a).traits.length || ISO.playerById(a.id)) fail('rivalDef role / traits / id clash ' + r.id);
    }
    if (!ISO.AI.archProfile(r.arch) || !ISO.AI.ARCH[r.arch]) fail('rival archetype unknown ' + r.arch);
    if (!/^[A-Za-z' ]+$/.test(r.name) || !r.lines.first || !r.obj.desc) fail('rival text ' + r.id);
  }
  if (snap !== JSON.stringify(RV.RIVALS.map((r) => [r.look, r.kit, r.base]))) fail('rivalDef mutated the table');
  if (RV.rivalDef('calder', 0).ovr >= RV.rivalDef('calder', 1).ovr) fail('rival level 1 not harder');
  // which rival closes a season: pure and in range; every rival is reachable
  { const seen = new Set(); for (let s = 1; s < 60; s++) for (let i = 0; i < 5; i++) { const r = RV.rivalFor(s, i, i); if (r !== RV.rivalFor(s, i, i) || !RV.BY[r.id]) fail('rivalFor'); seen.add(r.id); } if (seen.size !== RV.RIVALS.length) fail('rivalFor: not every rival is drawn'); }
  for (let i = 0; i < 5; i++) { const last = ISO.SEASONS[i].lv[6], want = { easy: 'normal', normal: 'hard', hard: 'hard' }[last]; if (RV.bossDiff(i) !== want) fail('bossDiff steps up one level at season ' + i); }
  // ---- economy: the ceiling the notes document, asserted
  if (RV.BOSS_CREDIT_CAP !== 6910 || ISO.SEASONS.some((_, i) => RV.bossCreditMax(i) !== RV.prizeOf(i, RV.REMATCH_MAX) + Math.round(260 * (1 + 0.25 * i)))) fail('boss credit cap ' + RV.BOSS_CREDIT_CAP);
  if (CO.creditTotal() > CO.SET_CREDIT_CAP) fail('set credits ' + CO.creditTotal() + ' over the cap ' + CO.SET_CREDIT_CAP);
  if (RV.rematchMult(0) !== 1 || RV.rematchMult(99) !== 1.6) fail('rematch multiplier bounds');
  // ---- the finale through the profile
  let PR = fresh(777), D = PR.data, c = D.career;
  if (!c.sn.boss || c.sn.boss.done || c.sn.boss.live || !RV.BY[c.sn.boss.id] || c.sn.boss.id !== RV.rivalFor(c.seed, 0, 0).id || RV.RIVALS.some((r) => !c.rivals[r.id] || c.rivals[r.id].met)) fail('finale: fresh career has no boss / ledger');
  if (PR.bossReady() || PR.bossMatch() || PR.bossKickoff()) fail('finale: available before matchday 7');
  const play = (won, gf, ga, m) => { const opp = PR.careerOpponent(); PR.careerKickoff(); return PR.recordMatch({ mode: 'career', won, gf, ga, diff: PR.careerDiff(), opp, skills: 0, clears: 0, powerGoals: 0, m }); };
  for (let k = 0; k < 7; k++) play(k % 2 === 0, k % 2 === 0 ? 3 : 0, k % 2 === 0 ? 1 : 3);
  const h2n = Object.keys(c.h2h).length; if (h2n < 1 || h2n > RV.REC_CAP || Object.values(c.h2h).reduce((n, x) => n + x.w + x.l, 0) !== 7) fail('h2h bookkeeping');
  if (c.sn.md !== 7 || !PR.bossReady()) fail('finale: not ready after matchday 7');
  const fin = PR.bossMatch(); if (!fin || fin.win !== 5 || fin.def.level !== 0 || fin.def.rival !== c.sn.boss.id || fin.diff !== 'hard' || fin.arch !== RV.BY[c.sn.boss.id].arch) fail('finale: match info');
  const lg0 = JSON.stringify([c.sn.md, c.sn.res, c.points, D.stats.careerWins, c.tokens, c.xp]), cr0 = D.credits, rep0 = c.rep, pos0 = PR.seasonTable().findIndex((x) => x.id === 'me');
  if (!PR.bossKickoff() || !c.sn.boss.live || PR.seasonEnd() !== null || PR.bossReady()) fail('finale: kickoff / live rules');
  // a reload while live is a forfeited loss: ledger +1 loss, nothing paid, the league untouched
  { const P2 = reload(), c2 = P2.data.career, x = c2.rivals[c2.sn.boss.id]; if (!c2.sn.boss.done || c2.sn.boss.live || c2.sn.boss.res.w || x.met !== 1 || x.l !== 1 || x.ga !== 3 || P2.data.credits !== cr0 || c2.rep !== rep0 || JSON.stringify([c2.sn.md, c2.sn.res, c2.points, P2.data.stats.careerWins, c2.tokens, c2.xp]) !== lg0) fail('finale: live reload is not a clean forfeited loss'); if (P2.bossReady()) fail('finale: ready after the forfeit'); const keep = store[KEY], e = P2.seasonEnd(); if (!e || e.finale.w !== false) fail('finale: season would not close after a forfeit'); store[KEY] = keep; }
  // the same path through careerForfeit
  PR = reload(); PR.data.career.sn.boss = { id: RV.rivalFor(PR.data.career.seed, 0, 0).id, done: false, live: false, res: null }; PR.data.career.rivals[PR.data.career.sn.boss.id] = RV.blank(); PR.bossKickoff();
  { const f = PR.careerForfeit(); if (!f || !f.boss || !PR.data.career.sn.boss.done || PR.data.career.rivals[PR.data.career.sn.boss.id].l !== 1 || PR.careerForfeit() !== null) fail('finale: careerForfeit'); }
  // a win: prize + objectives + reputation, no matchday / points / token / XP, the league table unchanged, promotion unaffected
  PR = reload(); c = PR.data.career; c.sn.boss = { id: RV.rivalFor(c.seed, 0, 0).id, done: false, live: false, res: null }; c.rivals[c.sn.boss.id] = RV.blank(); D = PR.data; D.credits = 0; const crW = D.credits, repW = c.rep, wins0 = D.stats.wins;
  PR.bossKickoff();
  const mW = { won: true, gf: 5, ga: 1, goalsOut: 1, poss: 60, comeback: true, rating: 8, ovrGap: 0 }, rw = PR.recordMatch({ mode: 'boss', won: true, gf: 5, ga: 1, diff: 'normal', opp: fin.def, skills: 0, clears: 0, powerGoals: 0, m: mW });
  { const b = rw.boss, bossCr = b.prize + b.objs.reduce((n, o) => n + (o.done ? o.credits : 0), 0);
    if (!b || !b.won || b.prize !== RV.BOSS_PRIZE[0] || b.level !== 0 || b.mult !== 1 || b.credits !== bossCr || D.credits !== crW + rw.credits || rw.credits < b.credits) fail('finale win: payout ' + JSON.stringify(b));
    const want = RV.BY[c.sn.boss.id].obj.test(mW) ? 3 : 2; if (b.objs.filter((o) => o.done).length < want || c.rep !== repW + b.rep || b.rep < RV.bossRepOf(0, 0)) fail('finale win: objectives / reputation');
    if (JSON.stringify([c.sn.md, c.sn.res, c.points, D.stats.careerWins, c.tokens, c.xp]) !== lg0 || D.stats.wins !== wins0 + 1) fail('finale win touched the league state ' + D.stats.wins);
    if (c.rivals[c.sn.boss.id].w !== 1 || c.rivals[c.sn.boss.id].met !== 1 || c.rivals[c.sn.boss.id].gf !== 5 || !c.sn.boss.done || !c.sn.boss.res.w) fail('finale win: ledger');
    if (PR.seasonTable().findIndex((x) => x.id === 'me') !== pos0) fail('finale changed the league position'); }
  // the next meeting is a harder rival (same rival, level up) and pays a rematch bonus
  { const r1 = RV.rivalDef(c.sn.boss.id, RV.levelOf(c.sn.i, c.rivals[c.sn.boss.id].met)); if (r1.ovr <= fin.def.ovr) fail('rematch not harder'); }
  { const e = PR.seasonEnd(); if (!e || !e.finale || !e.finale.w || !CA.valid(PR.data.career.sn) || !PR.data.career.sn.boss || PR.data.career.sn.boss.done || e.next.n !== 1) fail('finale: season end / next boss'); if (PR.data.career.rivals[e.finale.id].w !== 1) fail('ledger lost at season end'); }
  // a loss pays nothing extra and never blocks the season; a skipped finale leaves no record
  PR = fresh(778); for (let k = 0; k < 7; k++) { const opp = PR.careerOpponent(); PR.careerKickoff(); PR.recordMatch({ mode: 'career', won: true, gf: 3, ga: 0, diff: PR.careerDiff(), opp, skills: 0, clears: 0, powerGoals: 0 }); }
  { const cc = PR.data.career, id = cc.sn.boss.id, pts = cc.points, cred = PR.data.credits, rep = cc.rep; PR.bossKickoff();
    const rl = PR.recordMatch({ mode: 'boss', won: false, gf: 2, ga: 5, diff: 'normal', opp: fin.def, skills: 0, clears: 0, powerGoals: 0, m: { won: false, gf: 2, ga: 5, rating: 5 } });
    if (!rl.boss || rl.boss.won || rl.boss.credits || rl.boss.rep || cc.rep !== rep || cc.points !== pts || cc.rivals[id].l !== 1 || cc.rivals[id].met !== 1 || cc.rivals[id].ga !== 5 || PR.data.credits !== cred + rl.credits) fail('finale loss: ' + JSON.stringify(rl.boss));
    if (PR.recordMatch({ mode: 'boss', won: true, gf: 5, ga: 0, diff: 'normal', opp: fin.def, skills: 0, clears: 0, powerGoals: 0 }).boss !== null) fail('finale paid twice');
    const e = PR.seasonEnd(); if (!e || e.move !== 'champion' || e.finale.w !== false) fail('finale loss blocked or changed the season (' + (e && e.move) + ')'); }
  PR = fresh(779); for (let k = 0; k < 7; k++) { const opp = PR.careerOpponent(); PR.careerKickoff(); PR.recordMatch({ mode: 'career', won: true, gf: 3, ga: 0, diff: PR.careerDiff(), opp, skills: 0, clears: 0, powerGoals: 0 }); }
  { const e = PR.seasonEnd(); if (!e || e.finale !== null || Object.values(PR.data.career.rivals).some((x) => x.met)) fail('skipped finale left a record'); }
  // the level rises with the season and the meetings: level = season index + earlier meetings, on the real ledger
  { const cc = fresh(780).data.career; cc.rivals.calder.met = 2; cc.sn.i = 3; cc.sn.boss = { id: 'calder', done: false, live: false, res: null }; if (RV.bossLevel(cc) !== 5 || RV.rivalDef('calder', 5).ovr !== 97) fail('boss level = season + meetings'); }
  // reward bounds: the biggest possible finale never exceeds the documented per-season cap
  for (let i = 0; i < 5; i++) { const cc = fresh(781).data.career; cc.sn.i = i; cc.sn.md = 7; cc.sn.boss = { id: 'kessler', done: false, live: false, res: null }; cc.rivals.kessler = { w: 9, l: 0, gf: 0, ga: 0, met: 9 }; const x = RV.bossSettle(cc, { won: true, gf: 5, ga: 0, m: { won: true, gf: 5, ga: 0, poss: 70, comeback: true, rating: 10 } }); if (x.credits > RV.bossCreditMax(i) || x.credits !== RV.bossCreditMax(i)) fail('boss credits at season ' + i + ': ' + x.credits + ' vs ' + RV.bossCreditMax(i)); }
  // ---- migration: a session-2 career (no rivals, no h2h, no boss) back-fills and keeps everything; with seven matchdays played the finale is open
  { const s2 = fresh(782); const o = JSON.parse(store[KEY]); delete o.career.rivals; delete o.career.h2h; delete o.career.sn.boss; o.schema = 5; delete o.favs; delete o.sets; delete o.dups; o.career.points = 33; o.career.rep = 120;
    PR = loadProfile(o); const cc = PR.data.career;
    if (!cc.sn.boss || cc.points !== 33 || cc.rep !== 120 || !cc.h2h || !cc.rivals.calder || PR.data.favs.length || Object.keys(PR.data.sets).length || Object.keys(PR.data.dups).length) fail('migration: session-2 career not back-filled');
    const o2 = JSON.parse(store[KEY]); o2.career.sn.md = 7; o2.career.sn.res = Array.from({ length: 7 }, () => ({ w: true, gf: 3, ga: 0 })); delete o2.career.sn.boss; delete o2.career.rivals;
    PR = loadProfile(o2); if (!PR.bossReady() || PR.data.career.sn.md !== 7) fail('migration: a season-over save has no finale'); void s2; }
  // corrupt fields are repaired, never trusted
  { const o = JSON.parse(store[KEY]); o.career.rivals = { calder: { w: -4, l: 'x', gf: 1e9, ga: NaN, met: 2.7 }, ghost: { w: 1 } }; o.career.h2h = { messi: { w: 2, l: 1, gf: 5, ga: 3 }, nobody: { w: 1 }, ronaldo: 7 }; o.career.sn.boss = { id: 'ghost', done: 1, live: 'y' };
    PR = loadProfile(o); const cc = PR.data.career; if (cc.rivals.ghost || cc.rivals.calder.w !== 0 || cc.rivals.calder.l !== 0 || cc.rivals.calder.ga !== 0 || cc.rivals.calder.met !== 2 || !RV.BY[cc.sn.boss.id] || cc.sn.boss.done || Object.keys(cc.h2h).join() !== 'messi') fail('migration: corrupt rival fields: ' + JSON.stringify([cc.rivals, cc.h2h, cc.sn.boss])); }
  // head-to-head cap: only the most recent REC_CAP opponents are kept
  { const cc = fresh(783).data.career; for (let k = 0; k < ISO.PLAYERS.length; k++) RV.h2hAdd(cc, ISO.PLAYERS[k].id, k % 2 === 0, 2, 1); const ks = Object.keys(cc.h2h); if (ks.length !== RV.REC_CAP || ks[ks.length - 1] !== ISO.PLAYERS[ISO.PLAYERS.length - 1].id) fail('h2h cap / recency'); RV.h2hAdd(cc, 'nope', true, 1, 0); if (cc.h2h.nope) fail('h2h unknown id'); }
  // a rival fixture on the real sim: first to 5, the forced archetype, a finished match and finite numbers
  { const me = fresh(784).careerDef(), rv = RV.rivalDef('vantelli', 3), G = ISO.Game.create({ home: me, away: rv, seed: 9, kickoff: 0, win: 5 }), ai = [ISO.AI.create('hard', { pers: ISO.AI.profileOf(me) }), ISO.AI.create('hard', { pers: ISO.AI.archProfile('clinical') })];
    while (G.phase !== 'end' && G.time < 1500) ISO.Game.step(G, [ISO.AI.update(G, G.players[0], ai[0], ISO.C.STEP), ISO.AI.update(G, G.players[1], ai[1], ISO.C.STEP)]);
    if (G.phase !== 'end' || Math.max(G.score[0], G.score[1]) !== 5 || G.winner < 0) fail('rival fixture did not finish first-to-5 ' + G.score); for (const o of [G.ball, ...G.players]) if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) fail('rival fixture: NaN'); }

  // ---- collection (5.6)
  const sets = CO.SETS(), kinds = new Set(sets.map((s) => s.kind));
  if (['club', 'nation', 'rarity', 'era'].some((k) => !kinds.has(k)) || new Set(sets.map((s) => s.id)).size !== sets.length) fail('sets: kinds / unique ids');
  for (const s of sets) { if (!s.ids.length || s.ids.some((id) => !ISO.playerById(id)) || s.credit <= 0) fail('set contents ' + s.id); if (s.kind === 'club' && s.ids.some((id) => ISO.playerById(id).club !== s.key)) fail('club set membership ' + s.id); if (s.kind === 'nation' && s.ids.some((id) => ISO.playerById(id).nat !== s.key)) fail('nation set membership'); if (s.kind === 'rarity' && s.ids.some((id) => ISO.rarityOf(ISO.playerById(id)) !== s.key)) fail('rarity set membership'); if (s.kind === 'era' && s.ids.some((id) => ISO.playerById(id).era !== s.key)) fail('era set membership'); }
  for (const kind of ['club', 'nation', 'rarity', 'era']) if (new Set(sets.filter((s) => s.kind === kind).flatMap((s) => s.ids)).size > ISO.PLAYERS.length) fail('sets overlap inside a kind');
  { const total = ISO.PLAYERS.length; for (const kind of ['rarity', 'era']) if (sets.filter((s) => s.kind === kind).reduce((n, s) => n + s.ids.length, 0) !== total) fail(kind + ' sets must partition the roster'); }
  for (const d of ISO.PLAYERS.slice(0, 20)) { const ss = CO.setsOf(d.id); if (!ss.every((s) => s.ids.includes(d.id)) || !ss.some((s) => s.kind === 'rarity') || !ss.some((s) => s.kind === 'era')) fail('setsOf ' + d.id); }
  // claim: complete sets pay once; an incomplete set pays nothing; repeated claims and a reload do not pay again
  { PR = fresh(785); D = PR.data; const s = sets.find((x) => x.kind === 'club' && x.ids.length <= 4); if (PR.claimSet(s.id) !== 0 || D.sets[s.id]) fail('set claimed while incomplete');
    for (const id of s.ids) if (!D.owned.includes(id)) D.owned.push(id);
    const cr1 = D.credits; if (PR.claimSet(s.id) !== s.credit || D.credits !== cr1 + s.credit || PR.claimSet(s.id) !== 0 || D.credits !== cr1 + s.credit) fail('set claim not once');
    PR = reload(); if (!PR.data.sets[s.id] || PR.claimSet(s.id) !== 0) fail('set claim not idempotent across a reload'); if (PR.claimSet('club:Nowhere') !== 0) fail('unknown set'); }
  // set bonus: +5% per completed set containing the fielded player, capped +15%, in the real match payout
  { PR = fresh(786); D = PR.data; const d = ISO.PLAYERS.find((p) => p.id === 'cheadams') || ISO.playerById(D.owned[0]); D.owned = [d.id];
    if (CO.setBonus(D.owned, d.id) !== 0) fail('set bonus with nothing complete');
    const mine = CO.setsOf(d.id).filter((s) => s.kind === 'club' || s.kind === 'nation').sort((a, b) => a.ids.length - b.ids.length);
    for (let n = 1; n <= 4 && n <= mine.length; n++) { for (const id of mine[n - 1].ids) if (!D.owned.includes(id)) D.owned.push(id); const b = CO.setBonus(D.owned, d.id); if (b !== Math.min(0.15, 0.05 * CO.setsOf(d.id).filter((s) => CO.complete(s, D.owned)).length) || b > 0.15) fail('set bonus value ' + b); }
    const wm0 = PR.winMult('normal', d, d), wm1 = PR.winMult('normal', d, d, undefined, 0.15), wm9 = PR.winMult('normal', d, d, undefined, 9);
    if (wm0.total !== 0.7 || wm1.total !== Math.round(0.7 * 1.15 * 100) / 100 || wm1.set !== 0.15 || wm9.set !== 9 && wm9.total < wm1.total) fail('winMult set factor ' + JSON.stringify([wm0, wm1]));
    if (CO.setBonus(D.owned, d.id) > 0.15) fail('set bonus above the cap');
    const before = D.credits; PR.recordMatch({ mode: 'cpu', won: true, gf: 1, ga: 0, diff: 'normal', me: d, opp: d, skills: 0, clears: 0, powerGoals: 0 }); const bonus = CO.setBonus(D.owned, d.id), got = D.credits - before;
    if (bonus <= 0 || got !== 40 + 15 + Math.round(150 * Math.round(0.7 * (1 + bonus) * 100) / 100)) fail('set bonus not in the payout: ' + got + ' bonus ' + bonus); }
  // favourites: capped, deduped, unknown ids rejected, repaired on load
  { PR = fresh(787); D = PR.data; for (let k = 0; k < CO.FAV_CAP + 5; k++) PR.toggleFav(ISO.PLAYERS[k].id); if (D.favs.length !== CO.FAV_CAP || PR.toggleFav(ISO.PLAYERS[CO.FAV_CAP].id) || PR.toggleFav('nobody')) fail('favourites cap / unknown'); if (!PR.toggleFav(D.favs[0]) || D.favs.length !== CO.FAV_CAP - 1) fail('favourite toggle off');
    const o = JSON.parse(store[KEY]); o.favs = ['messi', 'messi', 'ghost', 7, ...ISO.PLAYERS.slice(0, 30).map((p) => p.id)]; o.sets = { 'club:Real Madrid': true, 'club:Nope': true, 'era:legend': 1 }; o.dups = { messi: 9, ghost: 2, ronaldo: 0, haaland: 'x' };
    PR = loadProfile(o); if (PR.data.favs.length !== CO.FAV_CAP || new Set(PR.data.favs).size !== PR.data.favs.length || PR.data.favs.includes('ghost') || Object.keys(PR.data.sets).join() !== 'club:Real Madrid' || JSON.stringify(PR.data.dups) !== '{"messi":3}') fail('favs / sets / dups not repaired on load: ' + JSON.stringify([PR.data.favs.length, PR.data.sets, PR.data.dups])); }
  // duplicate stars: a duplicate pull / claim keeps its refund and adds a star (max 3); each star cuts the Prime price by 10%
  { PR = fresh(788); D = PR.data; const id = D.owned[0], d = ISO.playerById(id), base = ISO.primeCost(d); if (PR.primeCost(d) !== base || PR.dupStars(id) !== 0) fail('prime cost with no stars');
    const costs = []; for (let k = 0; k <= 5; k++) { D.dups[id] = k; costs.push(PR.primeCost(d)); } if (costs[1] !== Math.round(base * 0.9) || costs[3] !== Math.round(base * 0.7) || costs[4] !== costs[3] || costs[5] !== costs[3] || costs.some((x, k) => k && x > costs[k - 1])) fail('prime cost stars ' + costs.join());
    D.dups = {}; D.credits = 10 ** 6; const ref = ISO.RARITY[ISO.rarityOf(d)].dup, pity = () => { D.pity = 0; };
    const box = PR.BOXES.find((b) => b.id === 'bronze'), poolOf = ISO.PLAYERS.filter((p) => ISO.rarityOf(p) === ISO.rarityOf(d)); void box; void pity;
    // a deterministic duplicate: open boxes with a rand that always picks the same card until it comes up as the owned one
    D.owned = [id]; D.stats.matches = 1; let dupOpened = 0, cr1 = D.credits; for (let k = 0; k < 6; k++) { const rand = ((n) => () => (n++ === 0 ? { common: 0, rare: 0.75, epic: 0.97, legend: 0.998 }[ISO.rarityOf(d)] : poolOf.indexOf(d) / poolOf.length + 1e-9))(0); const before = D.credits, r = PR.openBox('bronze', rand); if (r && r.dup && r.def.id === id) { dupOpened++; if (D.credits !== before - 150 + r.refund || r.refund <= 0) fail('duplicate refund changed'); } } void cr1; void ref;
    if (dupOpened) { if (PR.dupStars(id) !== Math.min(3, dupOpened)) fail('duplicate stars ' + PR.dupStars(id) + ' after ' + dupOpened); } else fail('dup-star test could not reproduce a duplicate pull');
    D.dups[id] = 2; D.prime = {}; D.credits = 10 ** 6; const c0 = D.credits; if (PR.buyPrime(id) !== 'ok' || c0 - D.credits !== Math.round(base * 0.8)) fail('buyPrime did not use the reduced price'); }
  // custom kit: validated hex strings only; applies in careerDef; a corrupt saved value is dropped
  { PR = fresh(789); D = PR.data; const k0 = JSON.stringify(PR.careerDef().kit);
    for (const bad of [['red', '#000000'], ['#12345', '#000000'], ['#12345g', '#000000'], ['#000000', 5], ['#ffffff', undefined], ['#FFF', '#000'], ['javascript:x', '#000000']]) if (PR.setKitCustom(bad[0], bad[1]) !== false || D.career.kitCustom) fail('custom kit accepted ' + JSON.stringify(bad));
    if (!PR.setKitCustom('#AABBCC', '#112233') || JSON.stringify(D.career.kitCustom) !== '{"a":"#aabbcc","b":"#112233"}') fail('custom kit rejected / not lowercased');
    const cd = PR.careerDef(); if (cd.kit.a !== '#aabbcc' || cd.kit.b !== '#112233' || cd.kit.shorts !== '#112233' || cd.id === 'you0_0') fail('custom kit not applied in careerDef');
    PR = reload(); if (PR.careerDef().kit.a !== '#aabbcc') fail('custom kit lost across a reload');
    if (!PR.setKitCustom(null) || PR.data.career.kitCustom !== null || JSON.stringify(PR.careerDef().kit) !== k0) fail('custom kit not cleared');
    const o = JSON.parse(store[KEY]); o.career.kitCustom = { a: 'blue', b: '#00ff00' }; PR = loadProfile(o); if (PR.data.career.kitCustom !== null || JSON.stringify(PR.careerDef().kit) !== k0) fail('corrupt custom kit kept'); }
  delete globalThis.localStorage; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile;
}
// Phase 4.1 Street Football: the rule set is opt-in and invisible to the default path
{
  const { FW: FW4, FH: FH4, BR: BR4, GY0: GA, GY1: GB } = C, GC4 = (GA + GB) / 2;
  const mkS = (rules) => {
    const G = ISO.Game.create({ home: P[0], away: P[1], seed: 5, kickoff: 0, rules });
    G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false;
    for (const p of G.players) { p.x = 40 + 30 * p.idx; p.y = 80 + 60 * p.idx; }
    return G;
  };
  const dflt = mkS(), st = mkS('street'), R4 = ISO.RULES.street;
  if ('rules' in dflt || 'limit' in dflt || 'sudden' in dflt || 'wallHit' in dflt.ball || dflt.walls || dflt.win !== C.WIN) fail('street: the default match grew rule fields');
  if (st.rules !== 'street' || !st.walls || st.win !== R4.win || st.limit !== R4.limit || Math.abs(st.players[0].top / dflt.players[0].top - R4.top) > 1e-9) fail('street: rules not applied at create');
  if (ISO.Game.create({ home: P[0], away: P[1], seed: 5, rules: 'nope' }).rules !== undefined || ISO.Game.create({ home: P[0], away: P[1], seed: 5, drill: 'penalty', rules: 'street' }).rules !== undefined || ISO.Game.create({ home: P[0], away: P[1], seed: 5, solo: true, rules: 'street' }).rules !== undefined) fail('street: unknown rules, a drill or the arena took the rule set');
  const scoreRun = (G, setup) => { setup(G); const evs = run(G, 200, null, (g) => (g.phase === 'play' ? undefined : false)); return { g: evs.find((e) => e.type === 'goal'), s: G.score.join('-') }; };
  let r = scoreRun(mkS('street'), (G) => loose(G, FW4 - 30, GC4, 0, 500, 0, 0, 0));
  if (!r.g || r.g.pts !== 1 || r.s !== '1-0') fail('street: a plain goal is 1 point (' + r.s + ')');
  r = scoreRun(mkS('street'), (G) => { loose(G, FW4 - 30, GC4, 0, 500, 0, 0, 0); G.ball.wallHit = true; });
  if (!r.g || r.g.pts !== R4.wallGoal || r.s !== '2-0') fail('street: a wall-assisted goal must score 2 (' + r.s + ')');
  r = scoreRun(mkS('street'), (G) => { loose(G, FW4 - 30, GC4, 0, 500, 0, 0, 0); G.ball.shot = { id: 1, team: 0, kind: 'drive', type: 'normal', by: G.players[0], out: true }; G.ball.shotTeam = 0; });
  if (!r.g || r.g.pts !== R4.outBox || r.s !== '2-0') fail('street: a goal from outside the box must score 2 (' + r.s + ')');
  r = scoreRun(mkS(), (G) => { loose(G, FW4 - 30, GC4, 0, 500, 0, 0, 0); G.ball.wallHit = true; });
  if (!r.g || r.g.pts !== undefined || r.s !== '1-0') fail('street: wallHit must mean nothing without the rule set (' + r.s + ')');
  {      // a real wall bounce sets the flag, and the next strike (or a restart) clears it
    const G = mkS('street'); loose(G, 300, FH4 - BR4 - 3, 0, 60, 400, 0, 0); run(G, 20);
    if (!G.ball.wallHit) fail('street: the side wall did not set wallHit');
    G.ball.wallHit = true; ISO.Game.step(G, G.players.map(() => Z)); // flag survives a step with a loose ball
    if (!G.ball.wallHit) fail('street: wallHit cleared without a touch');
  }
  {      // restitution: the same bounce off the wall loses more speed under street rules
    const vy = (rules) => { const G = mkS(rules); G.walls = true; loose(G, 300, FH4 - BR4 - 2, 0, 0, 400, 0, 0); run(G, 6); return Math.abs(G.ball.vy); };
    const a = vy(undefined), b = vy('street');
    if (!(b > 0 && b < a)) fail('street: walls are not softer (' + a + ' vs ' + b + ')');
  }
  {      // the clock: the leader wins at the limit, a level score goes to sudden death and the next goal wins
    let G = mkS('street'); G.time = R4.limit - 0.01; G.score = [1, 2]; run(G, 5);
    if (G.phase !== 'end' || G.winner !== 1 || G.sudden) fail('street: the leader did not win at the time limit');
    G = mkS('street'); G.time = R4.limit - 0.01; G.score = [2, 2]; run(G, 5);
    if (G.phase !== 'play' || !G.sudden || G.winner !== -1) fail('street: a level score at the limit did not go to sudden death');
    loose(G, FW4 - 30, GC4, 0, 500, 0, 0, 0); run(G, 200, null, (g) => (g.phase === 'play' ? undefined : false));
    if (G.winner !== 0 || G.score[0] !== 3) fail('street: the sudden-death goal did not win (' + G.winner + ' ' + G.score + ')');
    G = mkS(); G.time = 2000; G.score = [1, 2]; run(G, 5, null, null, true);
    if (G.phase !== 'play' || G.winner !== -1) fail('street: the default match ended on the clock');
  }
  {      // skill moves: stars + 1 (cap 5), cheaper
    const p = st.players[0], dp = dflt.players[0], need = ISO.stars(p.a.skl);
    void need;
    const cost = (G) => { const pl = G.players[0]; pl.stam = 100; const b = G.ball; b.owner = pl; pl.x = 200; pl.y = 200; ISO.Game.step(G, [{ ...Z, mx: 1, my: 0 }, Z]); return pl; };
    void cost; void dp;
    if (R4.stars !== 1 || R4.skCost >= 1 || R4.skCd >= 1) fail('street: skill table');
  }
}
{      // Phase 4.3 training sandbox (opts.sand): opt-in, solo-like, defenders and a keeper you choose
  const mkSand = (sand, n) => {
    const roster = [P[0]]; for (let i = 0; i < n; i++) roster.push(P[3 + i]); if (roster.length < 2) roster.push(P[0]);
    const G = ISO.Game.create({ home: P[0], away: roster[1], roster, seed: 7, solo: true, sand });
    G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; return G;
  };
  const dG = ISO.Game.create({ home: P[0], away: P[1], seed: 7, solo: true });
  if ('sand' in dG || 'sandT' in dG) fail('sand: the default arena grew sand fields');
  if ('sand' in ISO.Game.create({ home: P[0], away: P[1], seed: 7, sand: { defenders: 3 } }) || 'sand' in ISO.Game.create({ home: P[0], away: P[1], seed: 7, drill: 'penalty', solo: true, sand: { defenders: 3 } })) fail('sand: a match or a drill took the sand opts');
  {      // a defender who holds the ball for more than 0.5 s ends the rep, back to you at your spot
    const G = mkSand({ defenders: 1, spot: { x: 100, y: 300 } }, 1), D = G.players[1], r0 = G.rep;
    D.x = 160; D.y = 300; G.ball.owner = D; G.ball.x = 165; G.ball.y = 300; G.ball.lastTouch = 1;
    const evs = run(G, 40, (g) => g.players.map(() => Z), null, true);      // 0.33 s: still live
    if (G.phase !== 'play') fail('sand: the rep ended before 0.5 s of defender possession');
    const ev2 = run(G, 100, (g) => g.players.map(() => Z), (g) => (g.phase === 'play' ? undefined : false), true);
    if (G.phase !== 'out' || !ev2.some((e) => e.type === 'out' && e.kind === 'lost')) fail('sand: a defender holding the ball did not end the rep');
    run(G, 600, null, (g) => (g.rep > r0 ? false : undefined), true);
    if (G.rep !== r0 + 1 || Math.abs(G.players[0].x - 100) > 1 || Math.abs(G.players[0].y - 300) > 1 || G.players[0].team !== 0 || G.ball.owner !== G.players[0]) fail('sand: the next rep did not start from your spot with the ball');
    void evs;
  }
  {      // an out ends the rep too, and only you score (a ball a defender last touched is still your goal)
    const G = mkSand({ defenders: 2 }, 2); loose(G, C.FW - 30, C.GY0 + 10, 0, 500, 0, 0, 1); G.ball.shotTeam = 1;
    const evs = run(G, 200, null, (g) => (g.phase === 'play' ? undefined : false), true);
    if (G.score[1] !== 0 || (goals0(evs) && G.score[0] !== 1)) fail('sand: only you score');
    const H = mkSand({ defenders: 1 }, 1); loose(H, 100, -20, 0, 0, -300, 0, 0); run(H, 30, null, null, true);
    if (H.phase !== 'out') fail('sand: an out did not end the rep');
  }
  {      // infinite stamina, off by default
    const G = mkSand({ defenders: 0, infStam: true }, 0), H = mkSand({ defenders: 0 }, 0);
    for (const g of [G, H]) { g.ball.owner = null; g.ball.x = 300; g.ball.y = 100; g.ball.vx = g.ball.vy = 0; }
    run(G, 600, (g) => [{ ...Z, mx: 1, sprint: true }, Z], null, true); run(H, 600, (g) => [{ ...Z, mx: 1, sprint: true }, Z], null, true);
    if (G.players[0].stam < 99.99 || G.players[0].exhausted) fail('sand: infinite stamina did not hold (' + G.players[0].stam + ')');
    if (!(H.players[0].stam < 99)) fail('sand: stamina did not drain without infStam (' + H.players[0].stam + ')');
  }
  {      // keeper none: nothing stops a shot at the line, the keeper is parked away; dummy: stands and blocks; the level is applied
    const G = mkSand({ defenders: 0, keeper: 'none' }, 0); loose(G, C.FW - 60, 360, 0, 520, 0, 0, 0);
    const evs = run(G, 200, null, (g) => (g.phase === 'play' ? undefined : false), true);
    if (!goals0(evs) || evs.some((e) => e.type === 'save') || G.keeper.x > 0) fail('sand: keeper none still saved or stayed on the pitch');
    const Dm = mkSand({ defenders: 0, keeper: 'dummy' }, 0); if (!Dm.keeper.dummy) fail('sand: dummy keeper not set');
    const N = mkSand({ defenders: 0, nerf: 20 }, 0), N0 = mkSand({ defenders: 0, nerf: 0 }, 0);
    if (!(N.keeper.a.div < N0.keeper.a.div)) fail('sand: the keeper level (nerf) was not applied');
  }
  {      // the spot, the ball option, weather and pitch type
    const G = mkSand({ defenders: 0, spot: { x: 120, y: 200 }, ball: 'rolling', rain: true, turf: 'astro' }, 0);
    if (Math.abs(G.players[0].x - 120) > 0.01 || Math.abs(G.players[0].y - 200) > 0.01 || !(G.ball.vx > 0) || G.weather !== 'rain' || G.turf !== 'astro') fail('sand: spot / ball / weather / turf not applied');
    const bad = mkSand({ defenders: 99, defMode: 'x', keeper: 'zz', nerf: NaN, spot: { x: NaN, y: -5 }, turf: 'lava' }, 0);
    if (bad.sand.defenders !== 3 || bad.sand.defMode !== 'static' || bad.sand.keeper !== 'live' || bad.sand.nerf !== 0 || !Number.isFinite(bad.sand.spot.x) || bad.sand.spot.y < 60 || bad.sand.turf !== 'grass') fail('sand: hostile opts not clamped');
  }
  {      // CPU defenders driven by the AI for 90 simulated seconds: no NaN, reps keep turning over
    const G = mkSand({ defenders: 3, defMode: 'cpu' }, 3), ai = {}; let nan = 0;
    run(G, 90 * 120, (g) => g.players.map((p, i) => (i === 0 ? { ...Z, mx: 1, sprint: true } : { ...ISO.AI.update(g, p, ai[i] || (ai[i] = ISO.AI.create('normal')), C.STEP) })), (g) => { for (const o of [g.ball, ...g.players]) if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) nan++; }, true);
    if (nan || G.rep < 3) fail('sand: CPU defender soak (NaN ' + nan + ', reps ' + G.rep + ')');
  }
  {      // the profile tally: back-filled by shape, clamped, folded
    const DS = ISO.DrillSpec;
    if (!DS) fail('sand: ISO.DrillSpec missing'); else {
      const n = DS.normArena({ shots: 5, goals: 99, onTarget: -3, bestStreak: 'x', byType: { power: { s: 4, g: 9 }, zzz: { s: 1, g: 1 } } });
      if (n.goals !== 5 || n.onTarget !== 0 || n.bestStreak !== 0 || n.byType.zzz || n.byType.power.g !== 4) fail('sand: arena tally not clamped');
      const a = DS.addArena(DS.normArena(null), { shots: 3, goals: 2, onTarget: 3, bestStreak: 2, byType: { normal: { s: 3, g: 2 } } });
      if (a.shots !== 3 || a.goals !== 2 || DS.addArena(a, a).shots !== 6 || DS.addArena(a, a).bestStreak !== 2) fail('sand: arena tally fold');
    }
  }
}
console.log('scripted scenarios, violations:', bad2);
if (Object.keys(bad2).length) process.exitCode = 1;
