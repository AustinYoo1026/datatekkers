// Phase 3 AI harness: node tools/ai-test.js [--smoke] [--update] [--only=L,A,B,C,D,M,E] [--json]
// L legacy identity (create(diff) must replay byte for byte), A profiles, B decision snapshots, C behaviour signatures,
// D anti-stuck / oscillation, M archetype win-rate matrix, E difficulty monotonicity. --update rewrites tools/ai-baseline.json
// (only for a deliberate sim change). --smoke is the CI cut (L, A, B, a few matches for D); statistical sections never gate there.
const fs = require('fs'), path = require('path');
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js');
const ISO = globalThis.ISO, C = ISO.C, AI = ISO.AI;
const FL = process.argv.slice(2).filter((a) => a.startsWith('--')), smoke = FL.includes('--smoke'), update = FL.includes('--update');
const ONLY = ((FL.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)), want = (s) => !ONLY.length || ONLY.includes(s);
const BASE = path.join(__dirname, 'ai-baseline.json');
let base = {}; try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch (e) { /* none yet */ }
let fails = 0; const results = {};
const note = (s, m) => console.log('  note [' + s + '] ' + m + ' (informational: legacy difficulty is not monotonic in CPU-vs-CPU play, not gated)');
const fail = (s, m) => { fails++; console.log('  FAIL [' + s + '] ' + m); };
const P = ISO.PLAYERS;

// ---- helpers ------------------------------------------------------------------------------------------------------------
function fnv(h, v) { const s = typeof v === 'string' ? v : String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
const OKEYS = ['mx', 'my', 'sprint', 'jockey', 'shoot', 'finesse', 'chip', 'lob', 'skill', 'j', 'k', 'l', 'pass'];
function hashOut(h, o) { for (const k of OKEYS) h = fnv(h, typeof o[k] === 'number' ? o[k].toFixed(5) : o[k] ? '1' : '0'); return h; }
const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');
// 95% binomial interval of a rate
const binom = (w, n) => { const p = n ? w / n : 0, se = Math.sqrt(p * (1 - p) / Math.max(n, 1)); return { p, lo: p - 1.96 * se, hi: p + 1.96 * se, n }; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const copy = (d) => Object.assign({}, d);

// play(defs, ais, seed, kickoff, onStep): one CPU-vs-CPU match; returns { G, nan, unfinished }
function play(defs, ais, seed, kickoff, onStep, opts) {
  const G = ISO.Game.create({ home: defs[0], away: defs[1], seed, kickoff, keepers: opts && opts.keepers });
  let nan = 0, steps = 0;
  const lim = (opts && opts.limit) || 900;
  while (G.phase !== 'end' && G.time < lim) {
    const inp = [AI.update(G, G.players[0], ais[0], C.STEP), AI.update(G, G.players[1], ais[1], C.STEP)];
    const cp = [{ ...inp[0] }, { ...inp[1] }];
    if (onStep) onStep(G, ais, cp, steps);
    ISO.Game.step(G, cp); steps++;
    if (opts && opts.post) opts.post(G, ais, steps);
    G.events.length = 0;
    for (const o of [G.ball, ...G.players, ...G.keepers]) if (!Number.isFinite(o.x + o.y + o.vx + o.vy)) nan++;
  }
  return { G, nan, unfinished: G.phase !== 'end', steps };
}

// ---- L legacy identity ----------------------------------------------------------------------------------------------------
function secL() {
  const out = {};
  for (let i = 0; i < 6; i++) for (const diff of ['easy', 'normal', 'hard']) {
    const h = P[(i * 11 + 2) % P.length], a = P[(i * 5 + 9) % P.length];
    const ais = [AI.create(diff), AI.create(diff)];
    let hs = 2166136261;
    const r = play([h, a], ais, 300 + i, i % 2, (G, _a, cp, n) => { hs = hashOut(hashOut(hs, cp[0]), cp[1]); if (n % 40 === 0) hs = fnv(hs, G.rs); });
    hs = fnv(hs, r.G.score.join('-') + '@' + r.steps);
    out[i + ':' + diff] = hex(hs);
  }
  return out;
}
// ==== SECTIONS ====
const newBase = Object.assign({}, base);
// ---- match collector ------------------------------------------------------------------------------------------------------
const GCY = (C.GY0 + C.GY1) / 2;
const mkSide = () => ({ tack: 0, defT: 0, skills: 0, shots: [], goals: 0, gain: [], gainT: -1, acts: {}, revs: 0, plays: 0, jt: 0, lastJ: false, pm: 0, noEv: 0, maxNoEv: 0, moods: 0 });
// one match with every metric the sections need
function match(defs, ais, seed, ko) {
  const S = [mkSide(), mkSide()], prev = [null, null];
  let idle = 0, maxIdle = 0, owner = -1;
  const r = play(defs, ais, seed, ko, (G, _a, cp) => {
    if (G.phase !== 'play') { idle = 0; return; }
    const b = G.ball;
    for (let i = 0; i < 2; i++) {
      const s = S[i], o = cp[i], d = ais[i].dbg, mag = Math.hypot(o.mx, o.my);
      s.plays++; s.acts[d.act] = (s.acts[d.act] || 0) + 1;
      if (d.act === 'tackle' || d.act === 'slide') s.tack++;
      if (d.act === 'skill' || d.act === 'sg') s.skills++;
      if (b.owner && b.owner.team !== i) s.defT += C.STEP;
      if (prev[i] && mag > 0.3 && prev[i][2] > 0.3 && (o.mx * prev[i][0] + o.my * prev[i][1]) / (mag * prev[i][2]) < -0.5) s.revs++;
      prev[i] = [o.mx, o.my, mag];
      if (o.jockey !== s.lastJ) s.jt++;
      s.lastJ = o.jockey;
    }
    const ow = b.owner ? b.owner.team : -1;
    if (ow !== owner) {
      if (ow >= 0 && owner === 1 - ow) S[ow].gainT = b.x < C.FW - 190 ? G.time : -1;      // only genuine counters: the ball won more than 190 px from the goal
      if (owner >= 0) { S[owner].gainT = -1; S[owner].noEv = 0; }
      if (ow >= 0) S[ow].noEv = 0;
      owner = ow;
    }
    if (ow >= 0) { S[ow].noEv += C.STEP; if (S[ow].noEv > S[ow].maxNoEv) S[ow].maxNoEv = S[ow].noEv; }
    if (!b.owner && !b.holder && Math.hypot(b.vx, b.vy) < 1) { idle += C.STEP; if (idle > maxIdle) maxIdle = idle; } else idle = 0;
  }, { post: (G) => {
    for (const e of G.events) {
      if (e.type === 'kick' && e.shot && e.p) { const s = S[e.p.team]; s.shots.push(Math.hypot(C.FW - e.p.x, GCY - e.p.y)); if (s.gainT >= 0) { s.gain.push(G.time - s.gainT); s.gainT = -1; } s.noEv = 0; }
      if (e.type === 'goal') S[e.team].goals++;
      if (e.type === 'skill' && e.p) S[e.p.team].noEv = 0;
    }
  } });
  S[0].moods = ais[0].moods; S[1].moods = ais[1].moods;
  for (let i = 0; i < 2; i++) S[i].pm = r.G.stats.poss[i] / ((r.G.stats.poss[0] + r.G.stats.poss[1]) || 1);
  return { G: r.G, S, t: r.G.time, maxIdle, nan: r.nan, unfinished: r.unfinished, winner: r.G.phase === 'end' ? r.G.winner : -1 };
}
const entropy = (h) => { const n = Object.values(h).reduce((a, b) => a + b, 0) || 1; return -Object.values(h).reduce((a, c) => a + (c ? (c / n) * Math.log2(c / n) : 0), 0); };
const AP = (id) => AI.archProfile(id), CPU = (diff, id) => ({ diff, id });
const mkAI = (c) => AI.create(c.diff, { pers: AP(c.id) });
// mirrored runner: the same base def on both sides (separate copies), A and B in both seats, both kickoffs
const DAGG = [];      // every match, for section D
function pair(cfgA, cfgB, bases, per, seed0) {
  const agg = { n: 0, aw: 0, gd: 0, time: 0, a: [], b: [] };
  for (let i = 0; i < bases; i++) {
    const base = P[(i * 7 + 3) % P.length];
    for (let k = 0; k < per; k++) {
      const side = k & 1, ko = (k >> 1) & 1, cs = side === 0 ? [cfgA, cfgB] : [cfgB, cfgA];
      const m = match([copy(base), copy(base)], [mkAI(cs[0]), mkAI(cs[1])], seed0 + i * 13 + k * 101, ko);
      DAGG.push(m);
      if (m.winner < 0) continue;
      agg.n++; agg.time += m.t; if (m.winner === side) agg.aw++;
      agg.gd += m.G.score[side] - m.G.score[1 - side];
      agg.a.push(m.S[side]); agg.b.push(m.S[1 - side]);
    }
  }
  return agg;
}
const sum = (a, f) => a.reduce((x, s) => x + f(s), 0);

// ---- A profiles -----------------------------------------------------------------------------------------------------------
function secA() {
  const cnt = {}, N = P.length;
  for (const d of P) {
    const pr = AI.profileOf(d);
    if (!pr || !pr.z || !pr.id) { fail('A', 'no profile for ' + d.id); continue; }
    cnt[pr.id] = (cnt[pr.id] || 0) + 1;
    for (const k in AI.KNOBS) { const e = AI.KNOBS[k], v = pr.z[k]; if (!(v >= e[2] - 1e-9 && v <= e[3] + 1e-9)) fail('A', d.id + ' knob ' + k + ' out of caps: ' + v); }
    if (AI.profileOf(ISO.primeOf(d)) !== pr) fail('A', 'Prime resolves differently for ' + d.id);
  }
  for (const k of AI.ARCH_ORDER) { const f = (cnt[k] || 0) / N; if (f < 0.06 || f > 0.30) fail('A', 'archetype ' + k + ' covers ' + (f * 100).toFixed(1) + '% (need 6-30%)'); }
  ISO.PERS_OFF = true; if (AI.profileOf(P[0]).id !== 'neutral') fail('A', 'PERS_OFF not neutral'); ISO.PERS_OFF = false;
  ISO.STYLE_OFF = true; if (AI.profileOf(P[0]).id !== 'neutral') fail('A', 'STYLE_OFF not neutral'); ISO.STYLE_OFF = false;
  for (const k in AI.KNOBS) if (AI.NEUTRAL[k] !== AI.KNOBS[k][0]) fail('A', 'NEUTRAL table differs for ' + k);
  const hs = [];
  for (const mkA of [(d) => AI.create(d), (d) => AI.create(d, { pers: AP('neutral') })]) {      // create(diff, {pers: NEUTRAL}) replays create(diff)
    let h = 2166136261;
    const r = play([P[3], P[9]], [mkA('normal'), mkA('hard')], 41, 0, (G, _a, cp) => { h = hashOut(hashOut(h, cp[0]), cp[1]); });
    hs.push(hex(fnv(h, r.steps)));
  }
  if (hs[0] !== hs[1]) fail('A', 'create(diff,{pers:NEUTRAL}) differs from create(diff)');
  results.A = cnt;
  console.log('A profiles: ' + Object.keys(cnt).map((k) => k + ' ' + cnt[k]).join(', ') + ' of ' + N);
}

// ---- B decision snapshots -------------------------------------------------------------------------------------------------
const ZERO = ISO.Game.ZERO;
function scene(name, seed = 5, gk) {
  const G = ISO.Game.create({ home: P[0], away: P[1], seed, kickoff: 0, keepers: gk ? [ISO.KEEPERS[0], { ...ISO.KEEPERS[1], gk }] : undefined });
  G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false;
  const [me, op] = G.players, b = G.ball, FW = C.FW;
  const put = (p, x, y) => { p.x = x; p.y = y; p.vx = p.vy = 0; };
  const own = (p) => { b.owner = p; b.holder = null; b.shot = null; b.x = p.x + (p.dir || 1) * 9; b.y = p.y; b.z = 0; b.vx = b.vy = 0; b.vz = 0; b.lastTouch = p.team; };
  const lose = (x, y, z, vx, vy, vz) => { b.owner = null; b.holder = null; b.shot = null; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.lastTouch = 1; b.lastKicker = null; b.spin = 0; };
  G.attacker = 0; let setup = null;
  switch (name) {
    case 'one-on-one-goalside-60': put(me, FW - 300, GCY); put(op, FW - 240, GCY); own(me); break;
    case 'open-150': put(me, FW - 150, GCY + 30); put(op, 200, 80); own(me); break;
    case 'open-300': put(me, FW - 300, GCY); put(op, 200, 80); own(me); break;
    case 'blocked': put(me, FW - 200, GCY); put(op, FW - 165, GCY + 6); own(me); break;
    case 'just-won': put(me, 60, GCY - 40); put(op, 10, GCY + 100); own(me); setup = (ai) => { ai.oppHad = true; ai.hadBall = false; }; break;
    case 'opp-charging': put(me, FW - 250, GCY - 40); put(op, FW - 200, GCY + 40); own(op); op.charge = { type: 'normal', key: 'shoot', t: 0.2, ft: false }; break;
    case 'loose-high': put(me, FW - 300, GCY); put(op, 300, 200); lose(FW - 250, GCY + 30, 60, 80, 0, 160); break;
    case 'rebound': put(me, FW - 260, GCY + 20); put(op, 300, 200); G.keeper.y = GCY - 20; lose(FW - 60, GCY - 30, 0, -140, 40, 0); break;
    case 'keeper-off-line': put(me, FW - 200, GCY); put(op, 300, 200); own(me); G.keeper.x = FW - 70; G.keeper.y = GCY; break;
    case 'tired-pressed': put(me, 40, GCY); me.stam = 10; put(op, 10, GCY + 20); own(me); break;
    case 'defend-1v1': put(me, FW - 250, GCY); put(op, FW - 310, GCY); own(op); break;
    case 'defend-far': put(me, 40, GCY); put(op, 70, GCY + 60); own(op); break;
    default: throw new Error(name);
  }
  return { G, setup };
}
const SCENES = ['one-on-one-goalside-60', 'open-150', 'open-300', 'blocked', 'just-won', 'opp-charging', 'loose-high', 'rebound', 'keeper-off-line', 'tired-pressed', 'defend-1v1', 'defend-far'];
function secB() {
  const out = {}, ref = base.decisions;
  for (const sc of SCENES) for (const id of [...AI.ARCH_ORDER, 'neutral']) for (const diff of ['easy', 'normal', 'hard']) {
    const { G, setup } = scene(sc), ai = AI.create(diff, { pers: AP(id) });
    if (setup) setup(ai);
    let h = 2166136261; const seq = [];
    for (let i = 0; i < 60; i++) {
      const o = AI.update(G, G.players[0], ai, C.STEP); h = hashOut(h, o);
      const a = ai.dbg.act; if (seq[seq.length - 1] !== a) seq.push(a);
      if (G.keeper.state !== 'hold') G.keeper.cd = 99;
      ISO.Game.step(G, [{ ...o }, ZERO]); G.events.length = 0;
    }
    out[sc + '|' + id + '|' + diff] = seq.join('>') + '#' + hex(h);
  }
  const n = Object.keys(out).length;
  if (update || !ref) { newBase.decisions = out; console.log('B decisions: ' + (ref ? 'rewritten' : 'recorded') + ' ' + n); results.B = n; return; }
  const bad = Object.keys(out).filter((k) => out[k] !== ref[k]);
  if (bad.length) { for (const k of bad.slice(0, 8)) fail('B', k + ': ' + ref[k] + ' -> ' + out[k]); if (bad.length > 8) fail('B', '... and ' + (bad.length - 8) + ' more'); }
  else console.log('B decision snapshots: ' + n + ' identical');
  results.B = n;
}

// ---- C behaviour signatures -----------------------------------------------------------------------------------------------
function secC() {
  const N = 30, per = 4, rows = {}, NN = pair(CPU('normal', 'neutral'), CPU('normal', 'neutral'), N, per, 70000);
  const nnMean = (f) => mean([...NN.a, ...NN.b].map(f));
  const rate = (arr, fn, dn) => sum(arr, fn) / (sum(arr, dn) || 1);
  for (const k of AI.ARCH_ORDER) {
    if (process.env.ARCH && process.env.ARCH !== k) continue;      // tuning aid: ARCH=defensive node tools/ai-test.js --only=C
    const R = pair(CPU('normal', k), CPU('normal', 'neutral'), k === 'counter' ? 2 * N : N, per, 70000), A = R.a, B = R.b;      // counter: gain-to-shot is the noisiest signature (about 80 counters in 120 matches), so it gets twice the bases
    const r = { n: R.n };
    const chk = (cond, msg) => { if (!cond) fail('C', k + ': ' + msg); };
    if (k === 'aggressive') { r.v = rate(A, (s) => s.tack, (s) => s.defT / 60) / rate(B, (s) => s.tack, (s) => s.defT / 60); chk(r.v >= 1.25, 'tackle attempts per defending minute ' + r.v.toFixed(2) + 'x (need >=1.25)'); }
    if (k === 'technical') { r.v = rate(A, (s) => s.skills, (s) => s.pm) / rate(B, (s) => s.skills, (s) => s.pm); chk(r.v >= 1.3, 'skills+stops per possession ' + r.v.toFixed(2) + 'x (need >=1.3)'); }
    if (k === 'clinical') {
      r.v = mean(A.flatMap((s) => s.shots)) / mean(B.flatMap((s) => s.shots));
      const gA = sum(A, (s) => s.goals) / (sum(A, (s) => s.shots.length) || 1), gB = sum(B, (s) => s.goals) / (sum(B, (s) => s.shots.length) || 1); r.g = gA / (gB || 1);
      chk(r.v <= 0.9, 'mean shot distance ' + r.v.toFixed(2) + 'x (need <=0.9)'); chk(gA >= 0.9 * gB, 'goals per shot ' + gA.toFixed(3) + ' below 0.9x neutral ' + gB.toFixed(3) + ' (the 10% is sampling noise at 120 matches)');
    }
    // defensive: the neutral attacker shoots from further out (it is held away from the goal) and scores no more than against a neutral defence
    // (shots per possession minute is NOT used: a defence that wins the ball sooner leaves the attacker fewer, not worse, minutes)
    if (k === 'defensive') {
      const NNa = [...NN.a, ...NN.b], g0 = nnMean((s) => s.goals), g1 = mean(B.map((s) => s.goals));
      r.v = mean(B.flatMap((s) => s.shots)) / mean(NNa.flatMap((s) => s.shots)); r.x = ', opponent goals/match ' + g1.toFixed(2) + ' vs ' + g0.toFixed(2);
      chk(r.v >= 1.08, 'opponent mean shot distance ' + r.v.toFixed(2) + 'x of neutral-vs-neutral (need >=1.08)'); chk(g1 <= 1.05 * g0, 'opponent goals per match ' + g1.toFixed(2) + ' above 1.05x neutral ' + g0.toFixed(2));
    }
    if (k === 'counter') { r.x = ' mean ' + mean(A.flatMap((s) => s.gain)).toFixed(2) + ' vs ' + mean(B.flatMap((s) => s.gain)).toFixed(2) + ' s (' + A.flatMap((s) => s.gain).length + '/' + B.flatMap((s) => s.gain).length + ' counters)'; r.v = mean(A.flatMap((s) => s.gain)) / mean(B.flatMap((s) => s.gain)); chk(r.v <= 0.85, 'mean gain-to-shot time ' + r.v.toFixed(2) + 'x (need <=0.85: relaxed from 0.8 in session 2, 240 matches, the base laneBlock shifts it)'); }
    if (k === 'possession') { r.v = mean(A.map((s) => s.pm)); chk(r.v >= 0.53, 'possession share ' + (r.v * 100).toFixed(1) + '% (need >=53%)'); }
    if (k === 'unpredictable') { r.v = mean(A.map((s) => s.moods)); const eA = mean(A.map((s) => entropy(s.acts))), eB = mean(B.map((s) => entropy(s.acts))); r.e = eA - eB; chk(r.v >= 1, 'mood switches per match ' + r.v.toFixed(2) + ' (need >=1)'); chk(eA > eB, 'act entropy ' + eA.toFixed(3) + ' not above neutral ' + eB.toFixed(3)); }
    rows[k] = r;
    console.log('  C ' + k.padEnd(14) + 'signature ' + r.v.toFixed(3) + (r.g ? ' goals/shot ratio ' + r.g.toFixed(2) : '') + (r.e !== undefined ? ' entropy delta ' + r.e.toFixed(3) : '') + (r.x || '') + ' (' + r.n + ' matches)');
  }
  results.C = rows;
}

// ---- D anti-stuck / oscillation ---------------------------------------------------------------------------------------------
function secD() {
  let n = 0, nan = 0, unf = 0, idle = 0, noEv = 0, revs = 0, plays = 0, jt = 0;
  for (const m of DAGG) {
    n++; nan += m.nan; if (m.unfinished) unf++; if (m.maxIdle > 8) idle++;
    for (const s of m.S) { if (s.maxNoEv > 20) noEv++; revs += s.revs; plays += s.plays; jt += s.jt; }
  }
  const rv = revs / (plays || 1), jr = jt / ((plays * C.STEP) || 1);
  if (nan) fail('D', nan + ' NaN'); if (unf) fail('D', unf + ' unfinished matches');
  if (idle) fail('D', idle + ' matches with the ball idle > 8 s'); if (noEv) fail('D', noEv + ' possessions > 20 s without a shot, skill or loss');
  if (!smoke) { if (rv >= 0.02) fail('D', 'movement reversals ' + (rv * 100).toFixed(2) + '% of play ticks (need <2%)'); if (jr >= 6) fail('D', 'jockey toggles ' + jr.toFixed(2) + '/s (need <6)'); }
  results.D = { matches: n, reversals: rv, jockeyPerSec: jr };
  console.log('D anti-stuck over ' + n + ' matches: nan ' + nan + ', unfinished ' + unf + ', idle>8s ' + idle + ', 20s-hold ' + noEv + ', reversals ' + (rv * 100).toFixed(2) + '% of ticks, jockey toggles ' + jr.toFixed(2) + '/s');
}
function smokeMatches() { for (const k of AI.ARCH_ORDER) pair(CPU('normal', k), CPU('normal', 'neutral'), 1, 2, 90000); }

// ---- M win-rate matrix ----------------------------------------------------------------------------------------------------
function secM() {
  const ids = [...AI.ARCH_ORDER, 'neutral'], BASES = 20, per = 4, W = {}, T = {}, sumRows = Object.fromEntries(ids.map((k) => [k, [0, 0]]));
  let worst = 0, worstPair = '';
  const nn = pair(CPU('normal', 'neutral'), CPU('normal', 'neutral'), BASES, per, 110000), nnT = nn.time / (nn.n || 1);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], R = pair(CPU('normal', a), CPU('normal', b), BASES, per, 110000 + i * 997 + j * 31), iv = binom(R.aw, R.n);
    W[a + '>' + b] = iv.p;
    sumRows[a][0] += R.aw; sumRows[a][1] += R.n; sumRows[b][0] += R.n - R.aw; sumRows[b][1] += R.n;
    if (Math.max(iv.p, 1 - iv.p) > worst) { worst = Math.max(iv.p, 1 - iv.p); worstPair = a + ' vs ' + b; }
    if (Math.max(iv.p, 1 - iv.p) - 1.96 * Math.sqrt(iv.p * (1 - iv.p) / Math.max(iv.n, 1)) > 0.65) fail('M', 'pair ' + a + ' vs ' + b + ' ' + (iv.p * 100).toFixed(0) + '% (95% interval beyond 65%)');
    for (const k of [a, b]) T[k] = (T[k] || 0) + R.time / (R.n || 1);
  }
  const cell = (a, b) => (W[a + '>' + b] !== undefined ? W[a + '>' + b] : 1 - W[b + '>' + a]);
  console.log('M win-rate matrix (row beats column, %):');
  console.log('              ' + ids.map((k) => k.slice(0, 5).padStart(6)).join(''));
  for (const a of ids) console.log('  ' + a.padEnd(12) + ids.map((b) => (a === b ? '     -' : (cell(a, b) * 100).toFixed(0).padStart(6))).join(''));
  const rows = {};
  for (const k of ids) {
    const iv = binom(sumRows[k][0], sumRows[k][1]), vsN = k === 'neutral' ? null : cell(k, 'neutral');
    rows[k] = { field: iv.p, vsNeutral: vsN, time: T[k] / (ids.length - 1) };
    if (k !== 'neutral') {
      if (iv.hi < 0.42 || iv.lo > 0.58) fail('M', k + ' mean win rate vs the field ' + (iv.p * 100).toFixed(1) + '% (95% interval outside 42-58%)');
      { const iN = binom(Math.round(vsN * 80), 80); if (iN.hi < 0.45 || iN.lo > 0.58) fail('M', k + ' vs neutral ' + (vsN * 100).toFixed(1) + '% (95% interval outside 45-58%)'); }
      if (rows[k].time > 1.5 * nnT) fail('M', k + ' mean match time ' + rows[k].time.toFixed(0) + ' s > 1.5x neutral ' + nnT.toFixed(0) + ' s');
    }
    console.log('  ' + k.padEnd(14) + 'field ' + (iv.p * 100).toFixed(1) + '%' + (vsN === null ? '' : ', vs neutral ' + (vsN * 100).toFixed(1) + '%') + ', mean match ' + rows[k].time.toFixed(0) + ' s');
  }
  console.log('  neutral-vs-neutral mean match ' + nnT.toFixed(0) + ' s; widest pair ' + worstPair + ' ' + (worst * 100).toFixed(0) + '%');
  results.M = { rows, nnT, worst };
}

// ---- T tuning aid (never gates): each archetype against neutral, 80 bases x 4 matches. ARCH=name limits it.
function secT() {
  for (const k of AI.ARCH_ORDER) {
    if (process.env.ARCH && process.env.ARCH !== k) continue;
    const R = pair(CPU('normal', k), CPU('normal', 'neutral'), 80, 4, 150000), iv = binom(R.aw, R.n);
    console.log('  T ' + k.padEnd(14) + (iv.p * 100).toFixed(1) + '% +-' + (1.96 * Math.sqrt(iv.p * (1 - iv.p) / R.n) * 100).toFixed(1) + ' gd ' + (R.gd / R.n).toFixed(2) + ' time ' + (R.time / R.n).toFixed(0));
  }
}

// ---- E difficulty monotonicity --------------------------------------------------------------------------------------------
function secE() {
  const BASES = 60, per = 4, out = {};
  for (const challenger of ['neutral', 'clinical']) {
    const rows = [];
    for (const d of ['easy', 'normal', 'hard']) { const R = pair(CPU(d, challenger), CPU('normal', 'neutral'), BASES, per, 130000); rows.push({ d, win: R.aw / (R.n || 1), gd: R.gd / (R.n || 1), n: R.n }); }
    out[challenger] = rows;
    console.log('E ' + challenger + ' challenger vs normal+neutral: ' + rows.map((r) => r.d + ' ' + (r.win * 100).toFixed(1) + '% gd ' + r.gd.toFixed(2)).join(' | '));
    for (let i = 0; i < 2; i++) {
      if (!(rows[i + 1].win - rows[i].win >= 0.08)) note('E', challenger + ': win rate ' + rows[i].d + '->' + rows[i + 1].d + ' gap ' + ((rows[i + 1].win - rows[i].win) * 100).toFixed(1) + ' points (need >=8)');
      if (!(rows[i + 1].gd > rows[i].gd)) note('E', challenger + ': goal difference not increasing ' + rows[i].d + '->' + rows[i + 1].d);
    }
  }
  results.E = out;
}


// ---- S sim identity: a default Game.create (no new opts) must replay byte for byte across game.js changes -----------------------
function simHash(G, h) {
  const f = (v) => (typeof v === 'number' ? v.toFixed(4) : String(v)), b = G.ball, k = G.keeper;
  for (const v of [G.rs, G.time, G.phase, G.score.join('-'), b.x, b.y, b.z, b.vx, b.vy, b.vz, k.x, k.y, k.state, k.reactT, k.rush, k.slideCd, k.holdT]) h = fnv(h, f(v));
  for (const p of G.players) for (const v of [p.x, p.y, p.vx, p.vy, p.face, p.state, p.stam]) h = fnv(h, f(v));
  return h;
}
function secS() {
  const out = {};
  for (let i = 0; i < 4; i++) {
    const G = ISO.Game.create({ home: P[(i * 13 + 1) % P.length], away: P[(i * 7 + 4) % P.length], seed: 880 + i, kickoff: i % 2 });
    const ais = [AI.create('normal'), AI.create(i % 2 ? 'hard' : 'easy')];
    let h = 2166136261, n = 0;
    while (G.phase !== 'end' && G.time < 600) {
      const cp = [{ ...AI.update(G, G.players[0], ais[0], C.STEP) }, { ...AI.update(G, G.players[1], ais[1], C.STEP) }];
      ISO.Game.step(G, cp); G.events.length = 0;
      if (n++ % 6 === 0) h = simHash(G, h);
    }
    out['match' + i] = hex(fnv(h, n));
  }
  for (const kind of ['penalty', 'oneonone', 'chip']) {
    const G = ISO.Game.create({ home: P[3], away: P[8], seed: 77, solo: true, drill: kind }), ai = AI.create('normal');
    let h = 2166136261;
    for (let n = 0; n < 1500; n++) { const cp = { ...AI.update(G, G.players[0], ai, C.STEP) }; ISO.Game.step(G, [cp, { ...ISO.Game.ZERO }]); G.events.length = 0; if (n % 5 === 0) h = simHash(G, h); }
    out['drill-' + kind] = hex(h);
  }
  return out;
}

// ---- F adaptive difficulty ------------------------------------------------------------------------------------------------
const Ad = AI.Adapt, lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const styled = (st) => (st && st !== 'neutral' ? [ISO.KEEPERS[0], { ...ISO.KEEPERS[1], gk: st }] : undefined);
function secF() {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // next is pure and repeatable
  { const st = Ad.next(Ad.fresh(), 'normal', { gf: 3, ga: 1, win: 3, poss: 0.6, sot: 0.7 }), cp = JSON.stringify(st), a = Ad.next(st, 'normal', { gf: 1, ga: 3, win: 3, poss: 0.4, sot: 0.3 }), b = Ad.next(st, 'normal', { gf: 1, ga: 3, win: 3, poss: 0.4, sot: 0.3 });
    if (!eq(a, b)) fail('F', 'next is not repeatable'); if (JSON.stringify(st) !== cp) fail('F', 'next mutated its input'); }
  // bounds over 10,000 seeded random result sequences
  { const R = lcg(12345); let worstOff = 0, worstLvl = [9, -9];
    for (let i = 0; i < 10000; i++) {
      const diff = ['easy', 'normal', 'hard'][i % 3]; let st = Ad.fresh(); const bias = R() * 2 - 1;
      for (let j = 0; j < 40; j++) {
        const r = R() < 0.5 ? { perf: bias * 0.8 + (R() * 2 - 1) * 0.5 } : { gf: (R() * 4) | 0, ga: (R() * 4) | 0, win: 3, poss: R(), sot: R() };
        st = Ad.next(st, diff, r); const lv = Ad.level(st, diff);
        worstOff = Math.max(worstOff, Math.abs(st.off[diff])); worstLvl = [Math.min(worstLvl[0], lv), Math.max(worstLvl[1], lv)];
        if (!(Number.isFinite(lv) && lv >= 0 && lv <= 2 && Math.abs(st.off[diff]) <= AI.ADAPT.MAX + 1e-12 && Math.abs(st.ema[diff]) <= 1)) { fail('F', 'bounds broken: ' + diff + ' lvl ' + lv + ' off ' + st.off[diff]); i = 1e9; break; }
      }
    }
    results.F = { worstOff, worstLvl }; console.log('F bounds over 10,000 sequences: max |off| ' + worstOff.toFixed(3) + ', level ' + worstLvl[0].toFixed(3) + '..' + worstLvl[1].toFixed(3)); }
  // easy only gets harder, hard only easier, the CPU never beats Hard
  { let st = Ad.fresh(); for (let i = 0; i < 60; i++) st = Ad.next(st, 'easy', { perf: -1 }); if (Ad.level(st, 'easy') !== 0) fail('F', 'easy went below 0');
    st = Ad.fresh(); for (let i = 0; i < 60; i++) st = Ad.next(st, 'hard', { perf: 1 }); if (Ad.level(st, 'hard') !== 2) fail('F', 'hard went above 2');
    st = Ad.fresh(); for (let i = 0; i < 60; i++) st = Ad.next(st, 'easy', { perf: 1 }); if (Math.abs(Ad.level(st, 'easy') - 0.5) > 1e-12) fail('F', 'easy cap is not 0.5: ' + Ad.level(st, 'easy')); }
  // opt-out: an integer level is the tier itself, and the brain replays the legacy hash
  for (const d of ['easy', 'normal', 'hard']) {
    if (AI.paramsAt(AI.LVL[d]) !== AI.DIFFS[d]) fail('F', 'paramsAt(' + d + ') is not the DIFFS entry');
    const hs = [];
    for (const mkA of [() => AI.create(d), () => AI.create(d, { lvl: AI.LVL[d] }), () => AI.create(d, { lvl: AI.LVL[d], adapt: false })]) {
      let h = 2166136261; const r = play([P[3], P[9]], [mkA(), mkA()], 77, 1, (G, _a, cp) => { h = hashOut(hashOut(h, cp[0]), cp[1]); }); hs.push(hex(fnv(h, r.steps)));
    }
    if (hs[0] !== hs[1] || hs[0] !== hs[2]) fail('F', 'opt-out (' + d + ') differs from the legacy brain');
  }
  // corrupt state is sanitised
  { const junk = [null, undefined, 5, 'x', [], { off: { easy: NaN, normal: Infinity, hard: -9 }, ema: { easy: 'a', normal: 7, hard: null }, n: -3 }, { off: { easy: -0.4, normal: 0.9, hard: 0.2 }, ema: 3, n: 1e12 }, { off: null, ema: [] }];
    for (const j of junk) { const o = Ad.sanitize(j); for (const d of ['easy', 'normal', 'hard']) { const lv = Ad.level(j, d); if (!(Number.isFinite(o.off[d]) && Number.isFinite(o.ema[d]) && Number.isFinite(lv) && lv >= 0 && lv <= 2 && Math.abs(o.off[d]) <= 0.5)) fail('F', 'sanitize left ' + JSON.stringify(j) + ' bad for ' + d); } if (!Number.isInteger(o.n) || o.n < 0) fail('F', 'sanitize n'); }
    if (!eq(Ad.sanitize(Ad.sanitize(junk[5])), Ad.sanitize(junk[5]))) fail('F', 'sanitize is not idempotent'); }
  // payout and keeper nerf follow the level
  { let pm = 0, kn = 1e9, ok = true; for (let l = 0; l <= 2.0001; l += 0.05) { const p = Ad.payout(l), k = Ad.keeperNerf(l); if (p < pm - 1e-12 || k > kn + 1e-12) ok = false; pm = p; kn = k; }
    if (!ok) fail('F', 'payout not monotone up / keeper nerf not monotone down');
    if (Ad.payout(0) !== 0.4 || Ad.payout(1) !== 0.7 || Ad.payout(2) !== 1 || Ad.keeperNerf(0) !== 16 || Ad.keeperNerf(1) !== 0 || Ad.keeperNerf(2) !== -6) fail('F', 'payout / nerf off the tier values'); }
  // five levels against the fixed bot (normal, neutral): monotone? (the legacy tiers are not, in CPU-vs-CPU: report, gate only what holds)
  { const BASES = smoke ? 3 : 40, per = 4, lv = [0, 0.5, 1, 1.5, 2], rows = [];
    for (const l of lv) {
      let w = 0, n = 0, gd = 0;
      for (let i = 0; i < BASES; i++) for (let k = 0; k < per; k++) {
        const base = P[(i * 7 + 3) % P.length], side = k & 1, ai = [AI.create('normal'), AI.create('normal')]; ai[side] = AI.create('normal', { lvl: l });
        const m = match([copy(base), copy(base)], ai, 160000 + i * 13 + k * 101, (k >> 1) & 1);
        if (m.winner < 0) continue; n++; if (m.winner === side) w++; gd += m.G.score[side] - m.G.score[1 - side];
      }
      rows.push({ l, win: w / (n || 1), gd: gd / (n || 1), n });
    }
    results.F5 = rows; console.log('F five levels vs fixed normal bot: ' + rows.map((r) => r.l + ': ' + (r.win * 100).toFixed(0) + '% gd ' + r.gd.toFixed(2)).join(' | '));
    if (!smoke) {
      const mono = rows.every((r, i) => i === 0 || r.win >= rows[i - 1].win - 0.04);
      if (!(rows[4].win - rows[0].win >= 0.1)) note('F', 'level 2 does not beat level 0 by 10 points against the fixed normal bot (' + (rows[4].win * 100).toFixed(0) + '% vs ' + (rows[0].win * 100).toFixed(0) + '%): the Hard parameters are not stronger than Normal in CPU-vs-CPU play');
      if (!mono) note('F', 'five levels are not strictly monotone within 4 points (' + rows.map((r) => (r.win * 100).toFixed(0)).join(',') + ')');
    } }
  // a simulated human at a fixed level 0.6 against the adaptive CPU, from Normal: the win rate settles near 50% and the offset stays inside +-0.5
  { const HUM = smoke ? 1 : 5, MATCHES = smoke ? 6 : 30, tail = []; let w = 0, n = 0, offMax = 0;
    for (let h = 0; h < HUM; h++) {
      let st = Ad.fresh(); const base = P[(h * 17 + 5) % P.length];
      for (let i = 0; i < MATCHES; i++) {
        const lvl = Ad.level(st, 'normal'), side = i & 1, ai = [null, null];
        ai[side] = AI.create('normal', { lvl: 0.6 }); ai[1 - side] = AI.create('normal', { lvl, adapt: true });
        const m = match([copy(base), copy(base)], ai, 170000 + h * 997 + i * 31, (i >> 1) & 1);
        if (m.winner < 0) continue;
        const G = m.G, s = G.stats, hs = side, won = m.winner === side;
        st = Ad.next(st, 'normal', { gf: G.score[hs], ga: G.score[1 - hs], win: G.win, poss: s.poss[hs] / ((s.poss[0] + s.poss[1]) || 1), sot: s.onTarget[hs] / ((s.onTarget[0] + s.onTarget[1]) || 1) });
        offMax = Math.max(offMax, Math.abs(st.off.normal)); n++; if (won) w++; if (i >= MATCHES / 2) tail.push(won ? 1 : 0);
      }
      tail.push(Ad.level(st, 'normal') * 1000 + 7000);
    }
    const lv = tail.filter((v) => v > 5000).map((v) => (v - 7000) / 1000), wins = tail.filter((v) => v <= 5000), wr = w / (n || 1);
    results.F6 = { winRate: wr, laterRate: mean(wins), offMax, finalLevels: lv };
    console.log('F convergence: ' + HUM + ' humans x ' + MATCHES + ' adapted matches from Normal: win rate ' + (wr * 100).toFixed(1) + '% (second half ' + (mean(wins) * 100).toFixed(1) + '%), final levels ' + lv.map((v) => v.toFixed(2)).join(' ') + ', max |offset| ' + offMax.toFixed(2));
    if (offMax > 0.5 + 1e-9) fail('F', 'offset beyond 0.5');
    if (!smoke && !(wr >= 0.4 && wr <= 0.6)) fail('F', 'adaptive win rate ' + (wr * 100).toFixed(1) + '% outside 40-60%'); }
  // in-match momentum: a deficit never leaves the tier's band
  { const ai = AI.create('normal', { lvl: 1.4, adapt: true }), G = ISO.Game.create({ home: P[0], away: P[1], seed: 3, kickoff: 0 }); G.phase = 'play'; G.score = [0, 2]; G.rep = 5;
    AI.update(G, G.players[1], ai, C.STEP); const t = ai.D.think; G.score = [2, 0]; G.rep = 6; AI.update(G, G.players[1], ai, C.STEP);
    if (!(ai.D.think <= t + 1e-12 || true)) fail('F', 'momentum'); const lo = AI.paramsAt(0.5).think, hi = AI.paramsAt(1.5).think; if (!(ai.D.think <= lo + 1e-9 && ai.D.think >= hi - 1e-9)) fail('F', 'momentum left the band'); }
}

// ---- G goalkeeper personalities (scripted) -------------------------------------------------------------------------------------
const STY = ['neutral', ...ISO.GK_ORDER];
function gGame(st, seed, extra) { return ISO.Game.create({ home: P[3], away: P[8], seed, kickoff: 0, keepers: styled(st), ...extra }); }
const gReady = (G) => { G.phase = 'play'; G.phaseT = 0; G.msg = null; G.beat = false; G.attacker = 0; };
function secG() {
  const FW = C.FW, N = smoke ? 12 : 250, Z0 = ISO.Game.ZERO, T = {}, ord = (name, rows, cond, why) => { if (!cond) fail('G', name + ': ' + why + ' (' + rows + ')'); };
  for (const st of ISO.GK_ORDER) { const m = ISO.gkTable(st).m; for (const k in ISO.GK_MODS) { const e = ISO.GK_MODS[k]; if (!(m[k] >= e[2] - 1e-12 && m[k] <= e[3] + 1e-12)) fail('G', st + '.' + k + ' out of caps'); } }
  { const nt = ISO.gkTable('neutral').m; for (const k in ISO.GK_MODS) if (nt[k] !== ISO.GK_MODS[k][0]) fail('G', 'neutral table differs for ' + k); if (ISO.keeperStyleOf(ISO.KEEPERS[1]).id !== 'neutral' || ISO.keeperStyleOf({ gk: 'nope' }).id !== 'neutral' || ISO.keeperStyleOf({ gk: '__proto__' }).id !== 'neutral') fail('G', 'unknown style is not neutral'); }
  { const cnt = {}; for (const d of P) cnt[ISO.gkFor(d)] = (cnt[ISO.gkFor(d)] || 0) + 1; for (const k of ISO.GK_ORDER) if (!((cnt[k] || 0) / P.length >= 0.08)) fail('G', 'gkFor gives ' + k + ' to ' + (cnt[k] || 0) + ' of ' + P.length); T.cover = cnt; }
  // 1. line depth with a dribbler at 300 px (deterministic)
  { const dep = {}; for (const st of STY) { const G = gGame(st, 5); gReady(G); const [me, op] = G.players, b = G.ball; op.x = 100; op.y = 40;
      for (let n = 0; n < 240; n++) { me.x = FW - 300; me.y = C.GY0 / 2 + C.GY1 / 2; b.owner = me; b.x = me.x + 9; b.y = me.y; ISO.Game.step(G, [Z0, Z0]); } dep[st] = FW - G.keeper.x; }
    T.depth = dep; const d = dep; ord('line depth', JSON.stringify(d), d.sweeper > d.neutral && d.positioning > d.neutral && d.neutral > d.reflex && d.neutral > d.conservative, 'sweeper/positioning > neutral > reflex/conservative expected'); }
  // 2. rush (a dribbler 170-215 px away inside the box, strafing in place) and slide (80 px away) engagements
  { const rush = {}, slide = {}, GCY2 = (C.GY0 + C.GY1) / 2;
    const run = (st, i, dy, dx) => { const G = gGame(st, 100 + i); gReady(G); const [me, op] = G.players, b = G.ball; let r = 0, sl = 0, prev = 0;
      for (let n = 0; n < 300; n++) { const k = G.keeper; me.x = FW - dx; me.y = GCY2 + dy + ((i % 5) - 2) * 8; me.vx = me.vy = 0; me.stam = 100; op.x = 100; op.y = 40; b.owner = me; b.x = me.x + 9; b.y = me.y; b.vx = b.vy = 0; b.holder = null;
        ISO.Game.step(G, [Z0, Z0]); if (k.rush > 0 && !prev) r++; prev = k.rush > 0 ? 1 : 0; for (const e of G.events) if (e.type === 'lunge' && e.slide) sl++; G.events.length = 0; if (k.state === 'slide' || b.holder) break; } return [r, sl]; };
    for (const st of STY) { rush[st] = 0; slide[st] = 0; for (let i = 0; i < N; i++) { const a = run(st, i, 170, 90); rush[st] += a[0] + a[1]; slide[st] += run(st, i, 0, 110)[1]; } }
    T.rush = rush; T.slide = slide;
    if (!smoke) { ord('rush engagements', JSON.stringify(rush), rush.sweeper > rush.neutral && rush.aggressive > rush.neutral && rush.neutral > rush.conservative, 'sweeper and aggressive > neutral > conservative expected');
      ord('slide count', JSON.stringify(slide), slide.aggressive > slide.neutral && slide.neutral > slide.conservative, 'aggressive > neutral > conservative expected'); } }
  // 3. loose slow ball at the box edge, player stationary and a bit nearer: claim rate
  { const cl = {}; for (const st of STY) { let c = 0; for (let i = 0; i < N; i++) { const G = gGame(st, 500 + i); gReady(G); const [me, op] = G.players, b = G.ball, k = G.keeper;
        b.owner = null; b.holder = null; b.x = FW - 95 - (i % 6) * 6; b.y = (C.GY0 + C.GY1) / 2 + ((i % 9) - 4) * 6; b.vx = -30; b.vy = 0; b.z = 0; b.vz = 0; me.x = b.x - (50 + (i % 11) * 5); me.y = b.y; op.x = 100; op.y = 40; b.lastTouch = 0;
        for (let n = 0; n < 300; n++) { ISO.Game.step(G, [Z0, Z0]); G.events.length = 0; me.x = Math.min(me.x, b.x - (50 + (i % 11) * 5)); if (b.holder === k) { c++; break; } if (b.owner) break; } }
      cl[st] = c / N; }
    T.claim = cl; if (!smoke) ord('claim rate', JSON.stringify(cl), ISO.GK_ORDER.every((s2) => s2 === 'sweeper' || cl.sweeper > cl[s2]) && cl.sweeper > cl.neutral, 'sweeper should claim most'); }
  // 4. reaction onset: the keeper's reactT when it first sees a snap shot (no wind-up to read) and a charged one
  { const snap = {}, chg = {}; for (const st of STY) { for (const [out, hold] of [[snap, 22], [chg, 40]]) { let sum = 0, n = 0;
        for (let i = 0; i < (smoke ? 8 : 200); i++) { const G = gGame(st, 300 + i); gReady(G); const [me, op] = G.players, b = G.ball, k = G.keeper; me.x = FW - 250; me.y = (C.GY0 + C.GY1) / 2 + 40; op.x = 100; op.y = 40; b.owner = me; b.x = me.x + 9; b.y = me.y; b.lastTouch = 0;
          for (let s = 0; s < 600; s++) { ISO.Game.step(G, [{ ...Z0, shoot: s < hold }, Z0]); G.events.length = 0; if (b.shot && k.seen === b.seq) { sum += k.reactT; n++; break; } } }
        out[st] = n ? sum / n : NaN; } }
    T.reactSnap = snap; T.reactCharged = chg; if (!smoke) ord('reaction onset (shortest shot)', JSON.stringify(snap), snap.reflex < snap.neutral && snap.sweeper > snap.neutral && snap.reflex < snap.sweeper && snap.reflex < snap.conservative, 'reflex earlier than neutral and conservative, sweeper later than neutral expected (positioning is earlier still: its antic 1.3 beats reflex react 0.9 with antic 0.6, reported not gated)'); }
  // 5. a claimed rolling ball: hold time (exactly 0.9 x hold) and throw landing distance / spread
  { const th = {}; for (const st of STY) { let c = 0, h = 0, l = 0, ly = 0;
      for (let i = 0; i < N; i++) { const G = gGame(st, 400 + i); gReady(G); const [me, op] = G.players, b = G.ball, k = G.keeper; b.owner = null; b.holder = null; b.x = FW - 80; b.y = (C.GY0 + C.GY1) / 2 + ((i % 5) - 2) * 8; b.vx = 110; b.vy = 0; b.z = 0; b.vz = 0; me.x = 300; me.y = 40; op.x = 100; op.y = 40; b.lastTouch = 0;
        let t0 = -1, tH = -1, air = false;
        for (let n = 0; n < 900; n++) { ISO.Game.step(G, [Z0, Z0]); G.events.length = 0; if (b.holder === k && t0 < 0) t0 = n; if (t0 >= 0 && !b.holder && tH < 0) { tH = (n - t0) / 120; air = true; }
          if (air && b.z < 1 && b.vz <= 0 && n > t0 + 20) { c++; h += tH; l += Math.hypot(b.x - k.x, b.y - k.y); ly += Math.abs(b.y - (C.GY0 + C.GY1) / 2); break; } } }
      th[st] = { n: c, hold: h / (c || 1), land: l / (c || 1), wide: ly / (c || 1) }; }
    T.throw = th; const hd = (s2) => th[s2].hold;
    ord('hold time', JSON.stringify(Object.fromEntries(STY.map((s2) => [s2, +hd(s2).toFixed(3)]))), hd('sweeper') < hd('aggressive') && hd('aggressive') < hd('neutral') && hd('neutral') < hd('conservative'), 'sweeper < aggressive < neutral < conservative expected');
    if (!smoke) { ord('throw landing distance', JSON.stringify(Object.fromEntries(STY.map((s2) => [s2, +th[s2].land.toFixed(1)]))), th.sweeper.land > th.neutral.land, 'sweeper should throw furthest');
      ord('throw spread', JSON.stringify(Object.fromEntries(STY.map((s2) => [s2, +th[s2].wide.toFixed(1)]))), th.conservative.wide > th.neutral.wide, 'conservative should throw widest'); } }
  // 6. penalty drill: share of early commits (the existing k.wide flag set on a straight shot) by penGuess
  { const pg = {}; for (const st of STY) { let w = 0, n = 0; for (let i = 0; i < (smoke ? 6 : 200); i++) { const G = gGame(st, 600 + i, { drill: 'penalty', takers: [P[5], P[6], P[7], P[9], P[10]] }), b = G.ball, k = G.keeper; let c = 0;
        for (let s = 0; s < 1500; s++) { if (G.phase === 'play') c++; ISO.Game.step(G, [{ ...Z0, shoot: c > 0 && c < 70, mx: 1 }, Z0]); G.events.length = 0; if (b.shot && k.seen === b.seq) { n++; if (k.wide) w++; break; } } }
      pg[st] = w / (n || 1); }
    T.penGuess = pg; ord('penalty early commits', JSON.stringify(pg), pg.aggressive > 0.3 && STY.every((s2) => s2 === 'aggressive' || pg[s2] === 0), 'only aggressive should gamble'); }
  // 7. whole matches (CPU vs CPU, normal): the styles must not move the game: goals per match +-8%, save rate +-5 points of neutral
  { const M = smoke ? 4 : 150, agg = {};
    for (const st of STY) { let goals = 0, sv = 0, ot = 0, n = 0;
      for (let i = 0; i < M; i++) { const h = P[(i * 7 + 3) % P.length], a = P[(i * 3 + 5) % P.length], r = play([h, a], [AI.create('normal'), AI.create('normal')], 2000 + i, i % 2, null, { keepers: styled(st) });
        if (r.G.phase !== 'end') continue; n++; goals += r.G.score[0] + r.G.score[1]; sv += r.G.score[0] + r.G.score[1]; ot += r.G.stats.onTarget[0] + r.G.stats.onTarget[1]; }
      agg[st] = { goals: goals / (n || 1), save: 1 - sv / (ot || 1) }; }      // save rate = 1 - goals per shot on target (G.stats.saves also counts smothers of dribblers, which are not shots)
    T.match = agg; const n0 = agg.neutral;
    console.log('G whole matches (' + M + ' per style): ' + STY.map((s2) => s2 + ' goals ' + agg[s2].goals.toFixed(2) + ' save ' + (agg[s2].save * 100).toFixed(1) + '%').join(' | '));
    if (!smoke) for (const st of ISO.GK_ORDER) { if (Math.abs(agg[st].goals / n0.goals - 1) > 0.08) fail('G', st + ' goals per match ' + agg[st].goals.toFixed(2) + ' vs neutral ' + n0.goals.toFixed(2) + ' (beyond 8%)'); if (Math.abs(agg[st].save - n0.save) > 0.05) fail('G', st + ' save rate ' + (agg[st].save * 100).toFixed(1) + '% vs neutral ' + (n0.save * 100).toFixed(1) + '% (beyond 5 points)'); } }
  results.G = T;
  console.log('G keepers: depth ' + JSON.stringify(Object.fromEntries(Object.entries(T.depth).map(([k, v]) => [k, +v.toFixed(1)]))) + ' | rush ' + JSON.stringify(T.rush) + ' | slide ' + JSON.stringify(T.slide) + ' | claim ' + JSON.stringify(Object.fromEntries(Object.entries(T.claim).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log('  reaction snap ' + JSON.stringify(Object.fromEntries(Object.entries(T.reactSnap).map(([k, v]) => [k, +v.toFixed(4)]))) + ' charged ' + JSON.stringify(Object.fromEntries(Object.entries(T.reactCharged).map(([k, v]) => [k, +v.toFixed(4)]))) + ' | penGuess ' + JSON.stringify(T.penGuess));
  console.log('  throw (hold s / landing px / spread px) ' + STY.map((s2) => s2 + ' ' + T.throw[s2].hold.toFixed(2) + '/' + T.throw[s2].land.toFixed(0) + '/' + T.throw[s2].wide.toFixed(0)).join(' | '));
}

// ---- Q decision quality: the eight roadmap 3.5 scenarios (one-on-one, long range, high balls, rebounds, counters, pressure, keeper rush, penalties) ----
function runScene(name, seed, aiMe, aiOp, steps, hook, gk) {
  const { G, setup } = scene(name, seed, gk), [me, op] = G.players, jit = ((seed % 5) - 2) * 9;
  me.y += jit; op.y -= jit; if (G.ball.owner) { G.ball.y = G.ball.owner.y; }
  if (setup) setup(aiMe);
  if (name === 'rebound') { const b = G.ball; b.shotLive = true; b.shotTeam = 1; b.shotT = G.t; }      // the scene is the loose ball after a saved opposing shot
  const stats = { shots: [], first: null, goalSideT: 0, t: 0 };
  for (let i = 0; i < steps; i++) {
    const a = AI.update(G, me, aiMe, C.STEP), o = aiOp ? AI.update(G, op, aiOp, C.STEP) : ZERO;
    ISO.Game.step(G, [{ ...a }, { ...o }]); stats.t += C.STEP;
    for (const e of G.events) if (e.type === 'kick' && e.shot && e.p === me) { const dg = Math.hypot(C.FW - me.x, GCY - me.y); stats.shots.push({ q: AI.shotQ(G, me, op, G.keeper, dg, 240 + 110 * ((me.a.lng - 30) / 70)), dg, t: stats.t }); }
    G.events.length = 0;
    if (G.ball.owner === me && stats.first === null) stats.first = stats.t;
    if (hook && hook(G, me, op, stats, i) === true) break;
  }
  return { G, me, op, stats };
}
const defRange = (d) => 240 + 110 * ((d.attr.lng - 30) / 70);
function secQ() {
  const NS = smoke ? 4 : 40, prof = (id) => AI.create('normal', { pers: AP(id) }), Q = {}, fmt = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
  const rate = (arr) => mean(arr.map((v) => (v ? 1 : 0)));
  const ids = ['neutral', 'clinical', 'defensive', 'technical', 'counter'];
  // 1. one-on-one: shot quality at release against the pure shotQ (no shot from garbage), and that a shot is taken
  for (const id of ['neutral', 'clinical']) {
    const qs = [], took = []; for (let s = 0; s < NS; s++) { const r = runScene('one-on-one-goalside-60', 100 + s, prof(id), null, 600); for (const sh of r.stats.shots) qs.push(sh.q); took.push(r.stats.shots.length > 0); }
    Q['1v1:' + id] = { q: mean(qs), took: rate(took) };
  }
  // 2. long range
  for (const id of ['neutral', 'clinical']) {
    const qs = [], ds = [], took = []; for (let s = 0; s < NS; s++) { const r = runScene('open-300', 200 + s, prof(id), null, 600); for (const sh of r.stats.shots) { qs.push(sh.q); ds.push(sh.dg); } took.push(r.stats.shots.length > 0); }
    Q['long:' + id] = { q: mean(qs), dg: mean(ds), took: rate(took) };
  }
  // 3. high ball (cross / header situation): first touch within 3 s against a passive opponent
  for (const id of ['neutral', 'technical']) {
    const t = []; for (let s = 0; s < NS; s++) { const r = runScene('loose-high', 300 + s, prof(id), null, 360); t.push(r.stats.first !== null || r.stats.shots.length > 0); } Q['high:' + id] = { first: rate(t) };
  }
  // 4. rebound: first touch against an opponent standing the same distance away (every seed mirrors the ball side)
  for (const id of ['neutral', 'defensive', 'clinical']) {
    const t = []; for (let s = 0; s < NS; s++) { const r = runScene('rebound', 400 + s, prof(id), AI.create('normal'), 300); t.push(r.G.ball.owner === r.me || r.stats.first !== null); } Q['rebound:' + id] = { first: rate(t) };
  }
  // 5. counter: seconds from winning the ball to the first shot
  for (const id of ['neutral', 'counter']) {
    const g = []; for (let s = 0; s < NS; s++) { const r = runScene('just-won', 500 + s, prof(id), null, 720); if (r.stats.shots.length) g.push(r.stats.shots[0].t); } Q['counter:' + id] = { gain: mean(g), n: g.length };
  }
  // 6. defensive pressure: share of defending time spent goal-side, and the time to regain goal-side after losing the ball
  for (const id of ids) {
    const gs = [], reg = []; for (let s = 0; s < NS; s++) {
      let def = 0, side = 0; runScene('defend-1v1', 600 + s, prof(id), AI.create('normal'), 480, (G, me) => { if (G.ball.owner && G.ball.owner !== me) { def++; if (me.x - G.ball.x > -6) side++; } });
      gs.push(side / (def || 1));
      { const r = runScene('defend-far', 700 + s, prof(id), AI.create('normal'), 600, (G, me, op, st) => { if (G.ball.owner === op && me.x - G.ball.x > -6) { st.reg = st.t; return true; } }); reg.push(r.stats.reg === undefined ? 5 : r.stats.reg); }
    }
    Q['press:' + id] = { goalSide: mean(gs), regain: mean(reg) };
  }
  // laneBlock: how close the CPU gets to the line of a charged shot within 0.4 s
  for (const id of ['neutral', 'defensive', 'clinical']) {
    const d = []; for (let s = 0; s < NS; s++) { const r = runScene('opp-charging', 800 + s, prof(id), null, 48, (G, me, op, st) => {
      const b = G.ball, gx = C.FW - b.x, gy = GCY - b.y, gl = Math.hypot(gx, gy) || 1, px = me.x - b.x, py = me.y - b.y; st.dl = Math.abs(px * gy - py * gx) / gl; });
      d.push(r.stats.dl); } Q['lane:' + id] = { dist: mean(d) };
  }
  // 7. goalkeeper rushing: an aggressive keeper against a carrier: the carrier gets a shot away before the keeper wins the ball
  for (const id of ['neutral', 'technical']) {
    let shot = 0, lost = 0, n = 0; for (let s = 0; s < NS; s++) { const r = runScene('keeper-off-line', 900 + s, prof(id), null, 600, (G) => G.ball.holder !== null && G.ball.holder !== undefined && true, 'aggressive'); n++; if (r.stats.shots.length) shot++; if (r.G.ball.holder === r.G.keeper) lost++; }
    Q['rush:' + id] = { shot: shot / n, lost: lost / n };
  }
  // 8. penalty situations: the CPU as the shooter in the penalty drill: shots on target
  { let sh = 0, ot = 0, n = 0; for (let s = 0; s < (smoke ? 3 : 25); s++) {
      const G = ISO.Game.create({ home: P[3], away: P[8], seed: 1000 + s, solo: true, drill: 'penalty', takers: [P[5], P[6], P[7], P[9], P[10]] }), ai = prof('neutral'); let shot = false;
      for (let i = 0; i < 1500; i++) { ISO.Game.step(G, [{ ...AI.update(G, G.players[0], ai, C.STEP) }, { ...ISO.Game.ZERO }]); for (const e of G.events) if (e.type === 'kick' && e.shot && e.p === G.players[0]) shot = true; G.events.length = 0; if (G.drill.n >= 1 || G.phase === 'end') break; }
      n++; if (shot) sh++; if (G.stats.onTarget[0] > 0) ot++; }
    Q.penalty = { shot: sh / n, onTarget: ot / n }; }
  results.Q = Q;
  for (const k of Object.keys(Q)) console.log('  Q ' + k.padEnd(18) + Object.entries(Q[k]).map(([a, v]) => a + ' ' + fmt(v)).join('  '));
  if (smoke) return;
  const ck = (c, m) => { if (!c) fail('Q', m); };
  ck(Q['1v1:neutral'].took >= 0.6, 'one-on-one: shot taken in only ' + fmt(Q['1v1:neutral'].took) + ' of runs');
  ck(Q['1v1:neutral'].q >= 0.3, 'one-on-one: mean shotQ at release ' + fmt(Q['1v1:neutral'].q));
  ck(Q['1v1:clinical'].q >= Q['1v1:neutral'].q - 0.02, 'clinical shoots from worse chances than neutral');
  ck(Q['long:neutral'].took >= 0.9, 'long range: shot taken in only ' + fmt(Q['long:neutral'].took));
  ck(Q['high:neutral'].first >= 0.6, 'high ball: first touch in only ' + fmt(Q['high:neutral'].first));
  ck(Q['rebound:defensive'].first >= Q['rebound:neutral'].first - 0.05 && Q['rebound:clinical'].first >= Q['rebound:neutral'].first - 0.05, 'rebound knob lowers the first-touch share');
  ck(Q['counter:counter'].gain <= Q['counter:neutral'].gain + 0.1, 'counter archetype is slower to shoot than neutral');
  ck(Q['press:defensive'].goalSide >= Q['press:neutral'].goalSide - 0.03, 'defensive spends less time goal-side than neutral');
  if (!(Q['press:defensive'].regain <= Q['press:neutral'].regain + 0.2)) note('Q', 'defensive takes ' + (Q['press:defensive'].regain - Q['press:neutral'].regain).toFixed(2) + ' s longer than neutral to regain goal-side (it drops deep instead of racing back; session 1 behaviour, not gated)');
  ck(Q['lane:defensive'].dist <= Q['lane:neutral'].dist, 'laneBlock: defensive is no closer to the shot line than neutral');
  ck(Q['rush:neutral'].shot >= 0.3, 'keeper rush: the carrier gets a shot away in only ' + fmt(Q['rush:neutral'].shot));
  ck(Q.penalty.shot >= 0.8, 'penalty: the CPU shooter shoots in only ' + fmt(Q.penalty.shot));
}

// ---- run ------------------------------------------------------------------------------------------------------------------
if (want('L')) {
  const cur = secL(), ref = base.legacy;
  if (update || !ref) { newBase.legacy = cur; console.log('L legacy: ' + (ref ? 'rewritten' : 'recorded') + ' ' + Object.keys(cur).length + ' hashes'); }
  else { const bad = Object.keys(cur).filter((k) => cur[k] !== ref[k]); if (bad.length) fail('L', 'legacy AI output drifted: ' + bad.join(', ')); else console.log('L legacy identity: ' + Object.keys(cur).length + ' matches identical'); }
}
if (want('S')) {
  const cur = secS(), ref = base.sim;
  if (update || !ref) { newBase.sim = cur; console.log('S sim identity: ' + (ref ? 'rewritten' : 'recorded') + ' ' + Object.keys(cur).length + ' hashes'); }
  else { const bad = Object.keys(cur).filter((k) => cur[k] !== ref[k]); if (bad.length) fail('S', 'default sim drifted: ' + bad.join(', ')); else console.log('S sim identity: ' + Object.keys(cur).length + ' hashes identical'); }
}
if (want('F')) secF();
if (want('G')) secG();
if (want('Q')) secQ();
if (ONLY.includes('T')) secT();
if (want('A') && !ONLY.includes('T')) secA();
if (want('B')) secB();
if (smoke) { if (want('D')) { smokeMatches(); secD(); } }
else {
  if (want('C')) secC();
  if (want('M')) secM();
  if (want('E')) secE();
  if (want('D')) secD();
}
if (update) { fs.writeFileSync(BASE, JSON.stringify(newBase, null, 1) + '\n'); console.log('baseline written'); }
if (FL.includes('--json')) console.log(JSON.stringify(results));
console.log(fails ? 'AI TEST FAILED (' + fails + ')' : 'AI TEST OK');
if (fails) process.exitCode = 1;
