// Headless CPU-vs-CPU soak test: node tools/sim.js [matches] [difficulty] [--turf=grass|firm|lush|astro] [--rain] [--pers]
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js');
const ISO = globalThis.ISO, FL = process.argv.slice(2).filter((a) => a.startsWith('--')), POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (process.env.STYLE === 'off') ISO.STYLE_OFF = true;      // Phase 2 kill switch: traits, roles, body factors and weak foot off (the pre-Phase-2 sim)
const N = +POS[0] || 40, diff = POS[1] || 'normal', turf = (FL.find((a) => a.startsWith('--turf=')) || '').slice(7) || undefined, rain = FL.includes('--rain'), rules = (FL.find((a) => a.startsWith('--rules=')) || '').slice(8) || undefined;      // --rules=street: the Phase 4.1 rule set
const tot = { goals: 0, time: 0, shots: 0, onT: 0, saves: 0, tackles: 0, skills: 0, unfinished: 0, own: 0 };
const evc = {}, shotTypes = {}, wins = {}, byTrait = {}, byRole = {};      // [matches played, wins] per trait and per role
let nan = 0, stuck = 0;
for (let m = 0; m < N; m++) {
  const P = ISO.PLAYERS, h = P[(m * 7) % P.length], a = P[(m * 3 + 5) % P.length];
  const G = ISO.Game.create({ home: h, away: a, seed: 1000 + m, kickoff: m % 2, turf, rain, rules });
  const ai = FL.includes('--pers') ? [ISO.AI.create(diff, { pers: ISO.AI.profileOf(h) }), ISO.AI.create(diff, { pers: ISO.AI.profileOf(a) })] : [ISO.AI.create(diff), ISO.AI.create(diff)];      // --pers: each side plays its derived Phase 3 personality
  let still = 0;
  while (G.phase !== 'end' && G.time < 900) {
    const inp = [ISO.AI.update(G, G.players[0], ai[0], ISO.C.STEP), ISO.AI.update(G, G.players[1], ai[1], ISO.C.STEP)];
    ISO.Game.step(G, [{ ...inp[0] }, { ...inp[1] }]);
    for (const e of G.events) { evc[e.type] = (evc[e.type] || 0) + 1; if (e.type === 'kick' && e.shot) { shotTypes[e.shot] = (shotTypes[e.shot] || 0) + 1; shotTypes['kind:' + e.kind] = (shotTypes['kind:' + e.kind] || 0) + 1; } if (e.type==='skill') shotTypes['sk:'+e.id]=(shotTypes['sk:'+e.id]||0)+1; }
    G.events.length = 0;
    const b = G.ball;
    for (const o of [b, ...G.players, ...G.keepers]) if (!(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.vx) && Number.isFinite(o.vy))) nan++;
    if (!(Number.isFinite(b.z) && Number.isFinite(b.vz) && Number.isFinite(b.spin) && Number.isFinite(b.tsp))) nan++;
    if (G.phase === 'play' && !b.owner && !b.holder && Math.hypot(b.vx, b.vy) < 1) { if (++still > 120 * 8) { stuck++; still = 0; console.log('stuck', b.x, b.y, G.players.map(p => p.state + ' ' + p.x.toFixed(0) + ',' + p.y.toFixed(0))); } } else still = 0;
  }
  if (G.phase !== 'end') tot.unfinished++; else { const w = G.players[G.winner].def.id; wins[w] = (wins[w] || 0) + 1; }
  if (G.phase === 'end') for (const p of G.players) {
    const st = ISO.styleOf(p.def), win = G.winner === p.team ? 1 : 0;
    for (const k of st.traits) { const e = byTrait[k] = byTrait[k] || [0, 0]; e[0]++; e[1] += win; }
    const e = byRole[st.role] = byRole[st.role] || [0, 0]; e[0]++; e[1] += win;
  }
  tot.goals += G.score[0] + G.score[1]; tot.time += G.time; tot.own += G.goals.filter(g => g.own).length;
  for (const k of ['shots', 'saves', 'tackles', 'skills']) tot[k] += G.stats[k][0] + G.stats[k][1];
  tot.onT += G.stats.onTarget[0] + G.stats.onTarget[1];
  if (m < 6) console.log(h.short, G.score.join('-'), a.short, (G.time / 60).toFixed(1) + 'min', 'poss', G.stats.poss.map(x => x.toFixed(0)).join('/'));
}
console.log(tot, 'avg match min', (tot.time / N / 60).toFixed(2), 'NaN', nan, 'stuck', stuck);
console.log(evc); console.log('stop', evc.stop || 0, 'burst', evc.burst || 0); console.log(shotTypes);
const fmt = (o) => Object.keys(o).sort().map((k) => k + ' ' + o[k][1] + '/' + o[k][0]).join('  ');
console.log('wins per trait (wins/played):', fmt(byTrait)); console.log('wins per role:', fmt(byRole));
if (nan || stuck || tot.unfinished) { console.log('FAIL: nan', nan, 'stuck', stuck, 'unfinished', tot.unfinished); process.exitCode = 1; }
