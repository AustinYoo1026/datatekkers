// Trait balance harness (Phase 2.2): node tools/balance.js [bases=30] [difficulty=normal] [--smoke] [--json]
// Mirrored CPU-vs-CPU matches: the same base character on both sides, one with ONE trait ("holder"), the other with no traits.
// Both sides and both kickoffs, so side and kickoff bias cancel. Guardrail: the holder wins 50-58% of its matches; a trait is OUT only when its
// 95% confidence interval (binomial, +-1.96 SE) misses that band, so sampling noise alone does not trip it. --traits=a,b limits the run.
// --smoke: 6 matches in total (CI). Exit code 1 only on NaN / stuck / unfinished matches, or (full run) a holder outside the guardrail.
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js');
const ISO = globalThis.ISO, C = ISO.C, FL = process.argv.slice(2).filter((a) => a.startsWith('--')), POS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const smoke = FL.includes('--smoke'), BASES = smoke ? 1 : +POS[0] || 30, diff = POS[1] || 'normal', LO = 0.5, HI = 0.58;
const P = ISO.PLAYERS;
const only = (FL.find((a) => a.startsWith('--traits=')) || '').slice(9).split(',').filter(Boolean);
const traits = smoke ? ['quickstep', 'trickster'] : only.length ? only : ISO.TRAIT_ORDER;      // smoke: 2 traits, 6 matches in total
let bad = 0, total = 0;
function play(def0, def1, seed, kickoff) {
  const G = ISO.Game.create({ home: def0, away: def1, seed, kickoff });
  const ai = [ISO.AI.create(diff), ISO.AI.create(diff)];
  let n = 0;
  while (G.phase !== 'end' && G.time < 900) {
    const inp = [ISO.AI.update(G, G.players[0], ai[0], C.STEP), ISO.AI.update(G, G.players[1], ai[1], C.STEP)];
    ISO.Game.step(G, [{ ...inp[0] }, { ...inp[1] }]); G.events.length = 0;
    for (const o of G.players) if (!Number.isFinite(o.x + o.y + o.vx + o.vy)) { bad++; return null; }
  }
  if (G.phase !== 'end') { bad++; return null; }
  return G.winner;
}
const rows = [];
let budget = smoke ? 6 : Infinity;
for (const t of traits) {
  let w = 0, n = 0, g = 0;
  for (let i = 0; i < BASES && budget > 0; i++) {
    const base = P[(i * 7 + 3) % P.length];
    const on = Object.assign({}, base, { traits: [t] }), off = Object.assign({}, base, { traits: [] });
    for (const side of [0, 1]) for (const ko of [0, 1]) {
      if (budget-- <= 0) break;
      const win = play(side === 0 ? on : off, side === 0 ? off : on, 5000 + i * 3 + side * 17 + ko * 101, ko);
      if (win === null) continue;
      n++; total++; if (win === side) w++;
    }
  }
  const rate = n ? w / n : NaN, se = Math.sqrt(rate * (1 - rate) / Math.max(n, 1));
  rows.push({ trait: t, n, wins: w, rate, out: n > 0 && (rate + 1.96 * se < LO || rate - 1.96 * se > HI), over: rate - 1.96 * se > HI, under: rate + 1.96 * se < LO });
}
for (const r of rows) console.log(r.trait.padEnd(11), (r.rate * 100).toFixed(1).padStart(5) + '%', r.wins + '/' + r.n, (r.rate < LO || r.rate > HI ? '(point estimate outside 50-58%)' : '') + (!smoke && r.over ? ' OVERPOWERED: halve its mods' : '') + (!smoke && r.under ? ' BELOW 50%: no benefit' : ''));
console.log('matches', total, 'bad', bad);
if (bad) process.exitCode = 1;
if (!smoke && rows.some((r) => r.out)) process.exitCode = 1;
if (FL.includes('--json')) console.log(JSON.stringify(rows));
