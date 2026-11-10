// Invariant checks over CPU-vs-CPU matches: node tools/check.js [matches]
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js');
const ISO = globalThis.ISO, C = ISO.C, N = +process.argv[2] || 40;
const bad = {}, note = (k) => (bad[k] = (bad[k] || 0) + 1);
let clears = 0, quickOuts = 0, outs = 0, goals = 0, time = 0, koTackle = 0, maxNoOwner = 0, own = 0, shots = 0;
for (let m = 0; m < N; m++) {
  const P = ISO.PLAYERS, G = ISO.Game.create({ home: P[(m * 7) % 20], away: P[(m * 3 + 5) % 20], seed: 77 + m, kickoff: m % 2 });
  const ai = [ISO.AI.create(['easy', 'normal', 'hard'][m % 3]), ISO.AI.create(['hard', 'normal', 'easy'][m % 3])];
  let lastOutT = -9, playStart = 0, prevPhase = '', loose = 0;
  while (G.phase !== 'end' && G.time < 1200) {
    const inp = [0, 1].map((i) => ({ ...ISO.AI.update(G, G.players[i], ai[i], C.STEP) }));
    ISO.Game.step(G, inp);
    const b = G.ball;
    if (G.phase === 'play' && prevPhase !== 'play') playStart = G.time;
    prevPhase = G.phase;
    for (const e of G.events) {
      if (e.type === 'out') { outs++; if (G.time - lastOutT < 1.5) quickOuts++; lastOutT = G.time; }
      if (e.type === 'tackle' && e.on && G.time - playStart < 0.8) koTackle++;
      if (e.type === 'goal') { goals++; if (e.own) own++; }
      if (e.type === 'clear') clears++;
      if (e.type === 'kick' && e.shot) shots++;
    }
    G.events.length = 0;
    for (const p of G.players) {
      if (!(p.x === p.x && p.y === p.y && p.vx === p.vx && p.face === p.face && p.stam === p.stam)) note('player NaN');
      if (p.x > C.FW - 4.9 && p.y > C.GY0 - 9.9 && p.y < C.GY1 + 9.9) note('player inside goal');
      if (p.stam < 0 || p.stam > 100) note('stamina range');
      if (Math.hypot(p.vx, p.vy) > 700) note('player speed');
    }
    for (const k of G.keepers) { if (!(k.x === k.x && k.y === k.y)) note('keeper NaN'); if (k.x < C.FW - C.BOXD) note('keeper out of box'); }
    if (!(b.x === b.x && b.y === b.y && b.z === b.z && b.vx === b.vx)) note('ball NaN');
    if (b.z < 0) note('ball below ground');
    if (b.owner && b.holder) note('owner+holder');
    if (G.phase === 'play' && (b.x < -40 || b.x > C.FW + 40 || b.y < -40 || b.y > C.FH + 40)) note('ball far outside in play');
    if (G.phase === 'play' && !b.owner && !b.holder) { loose += C.STEP; maxNoOwner = Math.max(maxNoOwner, loose); } else loose = 0;
  }
  if (G.phase !== 'end') note('unfinished');
  time += G.time;
}
console.log({ matches: N, goals, own, shots, avgMin: +(time / N / 60).toFixed(2), outs, quickOuts, koTackle, clears, maxLooseSec: +maxNoOwner.toFixed(1) });
console.log('violations:', bad);
