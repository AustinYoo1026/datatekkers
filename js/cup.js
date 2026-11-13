/* ISO FOOTBALL — Tournament mode (roadmap 4.2): cup tables, the seeded bracket and the headless fixtures.
   Pure logic, node-loadable (needs data.js; simMatch also needs game.js and ai.js). No DOM, no Math.random:
   every pick, bracket slot and simulated fixture comes from the cup's seed, so a bracket is reproducible.
   The profile (js/profile.js) stores the state and pays the prizes; the screens live in js/meta-ui.js and js/main.js. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  // A cup is data. `filter` decides who may enter (you and the seven rivals); `rounds` is the CPU level of each round (QF, SF, F);
  // `prize` is the credits for winning that round; `rules` (optional) is an ISO.RULES key; `req` is a cup you must have won first.
  // size is the field (8 here); a 16-entrant cup or a league is a new row plus one more round in rounds/prize, nothing else changes
  // (the bracket code below is written for any power-of-two size).
  ISO.CUPS = [
    { id: 'rookie', name: 'ROOKIE CUP', tag: 'OVR 78 AND UNDER', desc: 'Eight squad players, three knockout rounds.', size: 8, filter: { maxOvr: 78 }, rounds: ['easy', 'normal', 'normal'], prize: [250, 500, 1500], req: null, col: '#35e08a' },
    { id: 'pro', name: 'PRO CUP', tag: 'OVR 76 TO 88', desc: 'The established stars. Win the Rookie Cup first.', size: 8, filter: { minOvr: 76, maxOvr: 88 }, rounds: ['normal', 'normal', 'hard'], prize: [400, 900, 2500], req: 'rookie', col: '#4fa3ff' },
    { id: 'legends', name: 'LEGENDS CUP', tag: 'LEGENDS ONLY', desc: 'Icons of every era. You need a Legend and the Pro Cup.', size: 8, filter: { era: 'legend' }, rounds: ['normal', 'hard', 'hard'], prize: [600, 1500, 4000], req: 'pro', col: '#ffcf4d' },
    { id: 'street', name: 'STREET CUP', tag: 'ANY PLAYER · STREET RULES', desc: 'Walled cage, first to five or three minutes, bonus goals from range or off the wall. Win the Rookie Cup first.', size: 8, filter: {}, rounds: ['normal', 'normal', 'hard'], prize: [350, 800, 2200], req: 'rookie', rules: 'street', col: '#ff7a3d' },
  ];
  const cupById = (id) => ISO.CUPS.find((c) => c.id === id) || null;
  const ROUND_NAMES = ['QUARTERFINAL', 'SEMIFINAL', 'FINAL'];
  const roundCount = (cup) => cup.rounds.length;

  // ------------------------------------------------------------------ seeded PRNG (mulberry32); never Math.random
  function prng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mix = (...n) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; } return h >>> 0; };

  function eligible(cup, def) {
    const f = cup.filter || {}, o = def.ovr;
    return !!def && (f.minOvr == null || o >= f.minOvr) && (f.maxOvr == null || o <= f.maxOvr) && (!f.era || def.era === f.era);
  }

  // eight unique ids: you plus seven seeded picks from everyone who fits the cup. The order is the bracket (0 v 1, 2 v 3 ...).
  function seedField(cup, meId, seed) {
    const rnd = prng(mix(seed, 0x51ed));
    const pool = ISO.PLAYERS.filter((d) => d.id !== meId && eligible(cup, d)).map((d) => d.id);
    const field = [meId];
    while (field.length < cup.size && pool.length) field.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
    for (let i = field.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [field[i], field[j]] = [field[j], field[i]]; }
    return field;
  }

  // the state the profile keeps. res[r][f] = { a, b, w, sa, sb } once fixture f of round r is decided
  function newState(cup, meId, seed) { return { id: cup.id, seed: seed >>> 0, me: meId, field: seedField(cup, meId, seed), round: 0, res: [], live: false }; }

  // who plays in round r: the field, then the winners of the round before (in bracket order)
  function entrants(st, r) {
    if (r === 0) return st.field.slice();
    const prev = st.res[r - 1] || [];
    return prev.map((x) => (x ? x.w : null));
  }
  function fixtures(st, r) {
    const e = entrants(st, r === undefined ? st.round : r), out = [];
    for (let i = 0; i + 1 < e.length; i += 2) out.push({ a: e[i], b: e[i + 1] });
    return out;
  }
  const myFixture = (st) => fixtures(st).findIndex((f) => f.a === st.me || f.b === st.me);
  const opponentOf = (st) => { const f = fixtures(st)[myFixture(st)]; return f ? (f.a === st.me ? f.b : f.a) : null; };

  // ------------------------------------------------------------------ headless fixture
  // CPU against CPU on the real sim, to the end or to 600 s, then the score, then the rating. Measured cost is in PHASE4_NOTES.md; if it
  // is too slow on a device, `ISO.CupFast = true` (or a measured cost over FAST_MS) switches to the rating-weighted seeded roll.
  const MAX_T = 600, FAST_MS = 150;
  function rollMatch(a, b, seed) {
    const rnd = prng(mix(seed, 0x9a11)), pa = 1 / (1 + Math.exp(-(a.ovr - b.ovr) / 6));
    const w = rnd() < pa ? 0 : 1, lo = (rnd() * 3) | 0;
    return { sa: w === 0 ? 3 : lo, sb: w === 1 ? 3 : lo, w, how: 'roll' };
  }
  let slow = 0;      // fixtures that blew the budget; two in a row and the rest use the roll
  function simMatch(a, b, seed, diff, rules) {
    if (ISO.CupFast || slow >= 2 || !ISO.Game || !ISO.AI) return rollMatch(a, b, seed);
    const t0 = Date.now();
    const G = ISO.Game.create({ home: a, away: b, seed: seed >>> 0 || 1, kickoff: seed & 1, rules: rules || undefined });
    const ai = [ISO.AI.create(diff || 'normal'), ISO.AI.create(diff || 'normal')];
    while (G.phase !== 'end' && G.time < MAX_T) ISO.Game.step(G, [ISO.AI.update(G, G.players[0], ai[0], ISO.C.STEP), ISO.AI.update(G, G.players[1], ai[1], ISO.C.STEP)]);
    const ms = Date.now() - t0;
    if (ms > FAST_MS) slow++; else slow = 0;
    let w = G.winner;
    if (w < 0) w = G.score[0] !== G.score[1] ? (G.score[0] > G.score[1] ? 0 : 1) : a.ovr !== b.ovr ? (a.ovr > b.ovr ? 0 : 1) : prng(mix(seed, 7))() < 0.5 ? 0 : 1;
    return { sa: G.score[0], sb: G.score[1], w, how: 'sim', ms };
  }

  // fixture f of round r, resolved from the seed alone (so a half-simulated round resumes identically)
  function simFixture(st, f, r) {
    r = r === undefined ? st.round : r;
    const cup = cupById(st.id), fx = fixtures(st, r)[f];
    if (!fx || !fx.a || !fx.b) return null;
    const a = ISO.playerById(fx.a), b = ISO.playerById(fx.b);
    const m = simMatch(a, b, mix(st.seed, r, f, 0x77), cup.rounds[r], cup.rules);
    return setResult(st, r, f, { a: fx.a, b: fx.b, w: m.w === 0 ? fx.a : fx.b, sa: m.sa, sb: m.sb });
  }
  function setResult(st, r, f, res) { (st.res[r] = st.res[r] || [])[f] = res; return res; }

  const mineDone = (st) => !!(st.res[st.round] && st.res[st.round][myFixture(st)]);
  // the other fixtures of the current round that have no result yet. They are only played once my own match is: before that, nothing is pending
  function pending(st) {
    const mine = myFixture(st), n = fixtures(st).length, out = [];
    if (!mineDone(st)) return out;
    for (let f = 0; f < n; f++) if (f !== mine && !(st.res[st.round] && st.res[st.round][f])) out.push(f);
    return out;
  }
  // record my own result (result: { won, gf, ga }); returns 'out' when I lost, else 'ok'
  function playMine(st, result) {
    const f = myFixture(st), fx = fixtures(st)[f], meA = fx.a === st.me;
    setResult(st, st.round, f, { a: fx.a, b: fx.b, w: result.won ? st.me : meA ? fx.b : fx.a, sa: meA ? result.gf : result.ga, sb: meA ? result.ga : result.gf });
    return result.won ? 'ok' : 'out';
  }
  // all fixtures of the round resolved and I am through: move to the next round. Returns 'next' | 'champion' | 'wait'
  function finishRound(st) {
    if (!mineDone(st) || pending(st).length) return 'wait';
    const cup = cupById(st.id);
    if (st.round + 1 >= roundCount(cup)) { st.round = roundCount(cup); return 'champion'; }
    st.round++; return 'next';
  }
  // everything at once (tests and the non-animated path): my result, then every other fixture of the round
  function advance(st, result) {
    if (playMine(st, result) === 'out') return 'out';
    for (const f of pending(st)) simFixture(st, f);
    return finishRound(st);
  }
  const isChampion = (st) => st.round >= roundCount(cupById(st.id));

  // shape check used by the profile migration: a cup state that cannot be trusted is dropped
  function valid(st) {
    const cup = st && typeof st === 'object' && cupById(st.id);
    if (!cup || !Number.isFinite(st.seed) || typeof st.me !== 'string' || !ISO.playerById(st.me)) return false;
    if (!Array.isArray(st.field) || st.field.length !== cup.size || new Set(st.field).size !== cup.size || !st.field.every((id) => typeof id === 'string' && ISO.playerById(id)) || !st.field.includes(st.me)) return false;
    if (!Number.isInteger(st.round) || st.round < 0 || st.round >= roundCount(cup) || !Array.isArray(st.res) || st.res.length > st.round + 1) return false;
    for (let r = 0; r < st.res.length; r++) {
      if (!Array.isArray(st.res[r])) return false;
      const e = entrants(st, r);
      if (st.res[r].length > e.length / 2) return false;
      for (let f = 0; f < st.res[r].length; f++) {
        const x = st.res[r][f];
        if (x == null) continue;
        if (x.a !== e[2 * f] || x.b !== e[2 * f + 1] || (x.w !== x.a && x.w !== x.b) || !Number.isFinite(x.sa) || !Number.isFinite(x.sb)) return false;
      }
    }
    for (let r = 0; r < st.round; r++) if (!st.res[r] || st.res[r].length !== entrants(st, r).length / 2 || st.res[r].some((x) => !x)) return false;      // finished rounds are complete
    return true;
  }

  ISO.Cup = { cupById, ROUND_NAMES, eligible, seedField, newState, entrants, fixtures, myFixture, opponentOf, simMatch, simFixture, pending, mineDone, playMine, finishRound, advance, isChampion, valid, prng, mix, roundCount };
})();
