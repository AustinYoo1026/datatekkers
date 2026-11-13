#!/usr/bin/env node
/* Performance benchmark (roadmap 9.4). node tools/bench.js [--update]
   TIMINGS (informational, never fail, printed next to tools/bench-baseline.json; machines differ):
     sim step, AI update, a Predictor rewind (MAXPRED steps replayed), anim3d update per actor, stadium build per map (quality 0).
   BLOCKING deterministic metrics (compared with tools/bench-baseline.json, which --update rewrites):
     profile bytes of ISO.Profile.maxAll() (hard budget 64 KB), challenge state bytes (budget 4 KB), and per map at quality 0 and 2 the draw calls and
     triangles of the built stadium (the measure() of tools/stadium-test.js): fail if above the baseline.
   Documented targets at 60 Hz (16.7 ms frame): sim step <= 1 ms, 2D draw <= 6 ms, 3D CPU <= 5 ms (the 2D and 3D draw need a browser: see Debug HUD PERF). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), BASE = path.join(__dirname, 'bench-baseline.json'), UPDATE = process.argv.includes('--update');
const noop = () => {};
const mkCtx = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'getImageData' ? (a, b, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4 || 4)) }) : noop), set: () => true });
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => mkCtx(), addEventListener: noop });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(), getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
globalThis.window = globalThis; globalThis.addEventListener = noop; globalThis.navigator = { getGamepads: () => [] };
const store = {}; globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const warn = console.warn; console.warn = noop;
let renderOk = true;
const FILES = ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/ai.js', 'js/net.js', 'js/cup.js', 'js/career.js', 'js/career-obj.js', 'js/challenges.js', 'js/smooth.js', 'js/input.js', 'js/access.js', 'js/profile.js', 'js/sprites.js', 'js/render.js',
  'js/3d/coords.js', 'js/3d/adapter.js', 'js/3d/player3d.js', 'js/3d/animkit.js', 'js/3d/clips-action.js', 'js/3d/clips-skill.js', 'js/3d/clips-keeper.js', 'js/3d/anim3d.js', 'js/3d/stadium.js'];
for (const f of FILES) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); } catch (e) { if (f === 'js/render.js') { renderOk = false; continue; } console.log('LOAD FAIL', f, String(e.stack).split('\n').slice(0, 3).join(' | ')); process.exit(2); }
}
console.warn = warn;
const ISO = globalThis.ISO, THREE = globalThis.THREE, R3D = ISO.R3D, K = R3D.K, St = R3D.Stadium;
const now = () => Number(process.hrtime.bigint()) / 1e3;      // microseconds
const T = {}, D = {}, fails = [];

// ---- timings
{
  const G = ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[3], seed: 7, kickoff: 0 }), ai = [ISO.AI.create('normal'), ISO.AI.create('normal')];
  let tSim = 0, tAi = 0, n = 0; const snaps = [];
  for (let i = 0; i < 3000 && G.phase !== 'end'; i++) {
    const a0 = now(); const inp = [ISO.AI.update(G, G.players[0], ai[0], ISO.C.STEP), ISO.AI.update(G, G.players[1], ai[1], ISO.C.STEP)]; const a1 = now();
    ISO.Game.step(G, [{ ...inp[0] }, { ...inp[1] }]); const a2 = now(); G.events.length = 0;
    if (i >= 200) { tAi += (a1 - a0) / 2; tSim += a2 - a1; n++; }
  }
  T.simStepUs = +(tSim / n).toFixed(1); T.aiUpdateUs = +(tAi / n).toFixed(1);
  // a rewind replays up to MAXPRED steps: measured as that many steps from a copy of the live state
  const MP = ISO.Net && ISO.Net.MAXPRED || 30; let best = 1e9;
  for (let r = 0; r < 5; r++) { const H = ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[3], seed: 9, kickoff: 0 }); for (let i = 0; i < 400; i++) ISO.Game.step(H, [{}, {}]); const s0 = now(); for (let i = 0; i < MP; i++) ISO.Game.step(H, [{}, {}]); best = Math.min(best, now() - s0); }
  T.predictorResimUs = +best.toFixed(0);
  // anim3d: one update per actor over a real match
  try {
    const G2 = ISO.Game.create({ home: ISO.PLAYERS[0], away: ISO.PLAYERS[3], seed: 5, kickoff: 0 }), actors = G2.players.map((p, i) => { const a = R3D.Player.create(THREE, { def: p.def, kit: p.def.kit, keeper: false, slot: i }); a.anim = R3D.Anim.create(a); return a; });
    let tA = 0, nA = 0; const V = { me: 0, myTeam: 0 };
    for (let i = 0; i < 600; i++) {
      for (let k = 0; k < 4; k++) ISO.Game.step(G2, [{}, {}]);
      const vf = R3D.Adapter.snapshot(G2, V), bv = vf.ball;
      const s0 = now(); for (let j = 0; j < actors.length; j++) actors[j].anim.update(vf.players[j], 1 / 60, bv); const e = now() - s0; if (i >= 60) { tA += e / actors.length; nA++; }
    }
    T.anim3dUsPerActor = +(tA / nA).toFixed(1);
  } catch (e) { T.anim3dUsPerActor = null; console.log('note: anim3d timing skipped (' + String(e.message).slice(0, 80) + ')'); }
}

// ---- stadium builds
const synth = (m) => ({ bg: '#0c1016', around: m.walls ? (m.id === 'fs_roof' ? 'bricks' : 'crowd') : 'crowd', crowd: ['#3a4658', '#566377', '#7a2f3a'], wall: '#131a22', base: '#2c7a3d', bands: ['#2a7a3c', '#2f8443'], line: '#fff', mark: '#ffe678', net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.28, ads: [[m.name, '#0f1a14', '#35e08a']], cage: m.id === 'fs_roof' ? '#c8d2e0' : undefined });
const theme = (m) => { if (renderOk && ISO.Render && ISO.Render.setMap && ISO.Render.theme) { ISO.Render.setMap(m.id); return ISO.Render.theme(); } return synth(m); };
function measure(g) {
  const r = { calls: 0, tris: 0 };
  g.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine) || o.visible === false) return; r.calls++;
    const geo = o.geometry; if (!geo || !o.isMesh) return;
    const idx = geo.index ? geo.index.count : geo.attributes.position.count, dr = geo.drawRange, cnt = Math.min(idx - dr.start, dr.count === Infinity ? idx : dr.count);
    r.tris += (cnt / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return r;
}
const maps = {}; let buildSum = 0, buildN = 0;
for (const m of ISO.MAPS) for (const q of [0, 2]) {
  const th = theme(m); const s0 = now();
  try { const st = St.build(THREE, th, K, { walls: !!m.walls, quality: q, id: m.id, kitCols: ['#d33', '#fc3'] }); if (q === 0) { buildSum += now() - s0; buildN++; } maps[m.id + '|q' + q] = measure(st.group); st.dispose(); } catch (e) { fails.push(m.id + ' q' + q + ' build threw ' + e.message); }
}
T.stadiumBuildMsPerMap = +(buildSum / buildN / 1000).toFixed(1);

// ---- deterministic metrics
{
  const P = ISO.Profile; P.maxAll(); D.profileBytesMaxAll = P.bytes(); D.profileBudget = 65536;
  const CH = ISO.Challenges; let S = CH.fresh(); CH.roll(S, Date.UTC(2026, 0, 5, 12)); for (let d = 0; d < 30; d++) { CH.roll(S, Date.UTC(2026, 0, 5 + d, 12)); }
  D.challengeBytes = JSON.stringify(S).length; D.challengeBudget = 4096;
}
D.maps = maps;
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
if (D.profileBytesMaxAll > D.profileBudget) fails.push('profile maxAll ' + D.profileBytesMaxAll + ' bytes over the ' + D.profileBudget + ' budget');
if (D.challengeBytes > D.challengeBudget) fails.push('challenge state ' + D.challengeBytes + ' bytes over the ' + D.challengeBudget + ' budget');
if (UPDATE) { fs.writeFileSync(BASE, JSON.stringify({ note: 'timings are from the machine that ran --update (informational); the rest is blocking', timings: T, deterministic: D }, null, 1) + '\n'); console.log('baseline written'); }
else if (!base) fails.push('no tools/bench-baseline.json: run with --update');
else {
  const b = base.deterministic;
  if (D.profileBytesMaxAll > b.profileBytesMaxAll * 1.05) fails.push('profile bytes ' + D.profileBytesMaxAll + ' > baseline ' + b.profileBytesMaxAll + ' +5%');
  if (D.challengeBytes > b.challengeBytes * 1.05) fails.push('challenge bytes ' + D.challengeBytes + ' > baseline ' + b.challengeBytes + ' +5%');
  for (const k of Object.keys(maps)) { const o = b.maps[k]; if (!o) { fails.push(k + ' not in baseline'); continue; } if (maps[k].calls > o.calls) fails.push(k + ' draw calls ' + o.calls + ' -> ' + maps[k].calls); if (maps[k].tris > o.tris * 1.01) fails.push(k + ' triangles ' + o.tris + ' -> ' + maps[k].tris); }
  console.log('timings (informational; baseline from another run/machine in brackets):');
  for (const k of Object.keys(T)) console.log('  ' + k + ' = ' + T[k] + (base.timings && base.timings[k] != null ? '   [' + base.timings[k] + ']' : ''));
  console.log('targets at 60 Hz: sim <= 1 ms/step (now ' + (T.simStepUs / 1000).toFixed(3) + ' ms), 2D draw <= 6 ms and 3D CPU <= 5 ms (browser only, Debug HUD PERF)');
  console.log('profile maxAll ' + D.profileBytesMaxAll + ' / ' + D.profileBudget + ' bytes, challenge state ' + D.challengeBytes + ' / ' + D.challengeBudget + ' bytes, ' + Object.keys(maps).length + ' map builds checked');
}
if (fails.length) { console.log('FAIL (' + fails.length + ')'); fails.slice(0, 30).forEach((f) => console.log(' ', f)); process.exit(1); }
console.log('bench OK');
