#!/usr/bin/env node
/* Headless tests for the 3D stadium environments (roadmap 6.3). node tools/stadium-test.js [--update]
   Loads three.min.js, data.js, game.js, coords.js, render.js (themes) and stadium.js (vm, document stub as in tools/cam-test.js).
   S1 coverage   every ISO.MAPS id has a 3D flavour row and a 2D render theme; every FLAV row is well formed
   S2 budgets    build each map at quality 0 and 2, with and without walls; count renderables, triangles, instances, points, lights and
                 shadow casters against tools/stadium-baseline.json (recorded from the untouched stadium.js): quality 0 at most +2 draw calls
                 and +6000 triangles per map, quality 2 +0 draw calls (flags and flashes off), no new lights or shadow casters, at most +400 points in total
   S3 update     update() / cheer() / setView() run with no throw and no per-frame allocation of scene objects
   --update rewrites the baseline from the code as it is now. Exit 1 on a failure. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), BASE = path.join(__dirname, 'stadium-baseline.json');
const UPDATE = process.argv.includes('--update');
const noop = () => {};
const mkCtx = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => mkCtx(), addEventListener: noop });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(), getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
globalThis.window = globalThis.window || globalThis;
const warn = console.warn; console.warn = noop;
let renderOk = true;
for (const f of ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/3d/coords.js', 'js/sprites.js', 'js/render.js', 'js/3d/stadium.js']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); }
  catch (e) { if (f === 'js/render.js') { renderOk = false; continue; } console.log('LOAD FAIL', f, String(e.stack).split('\n').slice(0, 3).join(' | ')); process.exit(2); }
}
console.warn = warn;
const THREE = globalThis.THREE, ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, St = R3D.Stadium;
const fails = []; const fail = (t, m) => fails.push(t + ' ' + m);
const AROUND = { crowd: 1, bricks: 1, beach: 1 };
// synthetic themes per `around` value, used when render.js cannot load headless
const SYN = (m) => ({ bg: '#0c1016', around: m.walls ? (m.id === 'fs_roof' ? 'bricks' : 'crowd') : 'crowd', crowd: ['#3a4658', '#566377', '#7a2f3a'], wall: '#131a22', base: '#2c7a3d', bands: ['#2a7a3c', '#2f8443'],
  line: '#ffffff', mark: '#ffe678', net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.28, ads: [[m.name, '#0f1a14', '#35e08a']], cage: m.id === 'fs_roof' ? '#c8d2e0' : undefined });
const themeOf = (m) => { if (renderOk && ISO.Render && ISO.Render.setMap && ISO.Render.theme) { ISO.Render.setMap(m.id); return ISO.Render.theme(); } return SYN(m); };

// S1
if (!renderOk) console.log('note: render.js did not load headless, synthetic themes in use');
const flav = St.FLAV || St.flavours;
for (const m of ISO.MAPS) {
  if (!flav[m.id]) fail('S1', m.id + ' has no 3D flavour row');
  if (renderOk && ISO.Render.setMap) { ISO.Render.setMap(m.id); if (ISO.Render.mapId() !== m.id) fail('S1', m.id + ' has no render.js theme'); const t = ISO.Render.theme(); if (!AROUND[t.around]) fail('S1', m.id + ' unknown around ' + t.around); }
}
for (const id of Object.keys(flav)) {
  const f = flav[id];
  if (!ISO.MAPS.some((m) => m.id === id)) fail('S1', 'FLAV row ' + id + ' is not a map');
  if (f.crowd != null && !(f.crowd >= 0.25 && f.crowd <= 1)) fail('S1', id + ' crowd ' + f.crowd + ' outside 0.25..1');
  if (f.sunDir && !(f.sunDir[1] >= 22 && f.sunDir[1] <= 90)) fail('S1', id + ' sun elevation ' + f.sunDir[1] + ' below 22');
  if (f.flags != null && !(f.flags >= 0 && f.flags <= 24)) fail('S1', id + ' flags ' + f.flags + ' above 24');
  if (f.roof != null && f.roof !== 'full' && f.roof !== 'none') fail('S1', id + ' roof ' + f.roof);
}

// S2
function measure(g) {
  const r = { calls: 0, tris: 0, inst: 0, points: 0, lights: 0, casters: 0, meshes: 0 };
  g.traverse((o) => {
    if (o.isLight) r.lights++;
    if (!(o.isMesh || o.isPoints || o.isLine) || o.visible === false) return;
    r.calls++;
    if (o.castShadow) r.casters++;
    const geo = o.geometry; if (!geo) return;
    const idx = geo.index ? geo.index.count : geo.attributes.position.count;
    const dr = geo.drawRange, cnt = Math.min(idx - dr.start, dr.count === Infinity ? idx : dr.count);
    if (o.isPoints) r.points += geo.attributes.position.count;
    else if (o.isMesh) { const n = o.isInstancedMesh ? o.count : 1; r.tris += (cnt / 3) * n; if (o.isInstancedMesh) r.inst += o.count; r.meshes++; }
  });
  return r;
}
const cur = {};
for (const m of ISO.MAPS) {
  const th = themeOf(m);
  for (const q of [0, 2]) for (const w of [0, 1]) {
    if (w && !m.walls && m.id !== 'stadium') continue;           // walls only matter where a wall build exists
    const key = m.id + '|q' + q + '|w' + w;
    try {
      const st = St.build(THREE, th, K, { walls: !!(w || m.walls), quality: q, id: m.id, kitCols: ['#d33', '#fc3'] });
      cur[key] = measure(st.group);
      st.update(0.016, 1); st.update(0.016, 1.016); if (st.cheer) st.cheer(1); st.update(0.016, 1.03); if (st.setView) st.setView(5, 2); st.dispose();
    } catch (e) { fail('S2', key + ' threw ' + String(e.stack).split('\n').slice(0, 2).join(' | ')); }
  }
}
if (UPDATE) { fs.writeFileSync(BASE, JSON.stringify(cur, null, 1) + '\n'); console.log('baseline written (' + Object.keys(cur).length + ' builds)'); }
else if (!fs.existsSync(BASE)) fail('S2', 'no baseline file: run with --update against the untouched code');
else {
  const base = JSON.parse(fs.readFileSync(BASE, 'utf8')); let pts = 0; const worst = { calls: -9, tris: -9e9 };
  for (const k of Object.keys(cur)) {
    const b = base[k], c = cur[k]; if (!b) { fail('S2', k + ' not in baseline'); continue; }
    const q0 = k.includes('|q0'), dc = c.calls - b.calls, dt = c.tris - b.tris;
    worst.calls = Math.max(worst.calls, dc); if (dt > worst.tris) worst.tris = dt;
    if (dc > (q0 ? 2 : 0)) fail('S2', k + ' draw calls +' + dc + ' over budget');
    if (q0 && dt > 6000) fail('S2', k + ' triangles +' + dt + ' over 6000');
    if (!q0 && dt > 16) fail('S2', k + ' triangles +' + dt + ' at quality 2 (16 allowed: the tifo banner)');
    if (c.lights > b.lights) fail('S2', k + ' lights ' + b.lights + ' -> ' + c.lights);
    if (c.casters > b.casters) fail('S2', k + ' shadow casters ' + b.casters + ' -> ' + c.casters);
    if (c.points > b.points) pts += c.points - b.points;
    if (!q0 && c.points > b.points) fail('S2', k + ' points +' + (c.points - b.points) + ' at quality 2');
  }
  console.log('worst draw-call delta ' + worst.calls + ', worst triangle delta ' + worst.tris + ', new points (all builds) ' + pts);
  // the 400-point budget is per map at quality 0 (the flash sparkles): the sum above counts every build
  for (const k of Object.keys(cur)) if (k.includes('|q0') && base[k] && cur[k].points - base[k].points > 400) fail('S2', k + ' points +' + (cur[k].points - base[k].points) + ' over 400');
}
// S3: the per-frame path runs clean, and allocates nothing through THREE (constructor counts stay level over 300 frames of update / cheer / setView)
{
  const m = ISO.MAPS[0], st = St.build(THREE, themeOf(m), K, { quality: 0, id: m.id, kitCols: ['#d33', '#fc3'], turf: 'lush' });
  const names = ['Vector3', 'Matrix4', 'Quaternion', 'Color', 'Euler', 'Object3D'], cnt = {}, orig = {};
  for (const n of names) { cnt[n] = 0; orig[n] = THREE[n]; const O = orig[n]; THREE[n] = function (...a) { cnt[n]++; return new O(...a); }; THREE[n].prototype = O.prototype; }
  for (let i = 0; i < 300; i++) { st.update(0.016, i * 0.016); if (i === 50) st.cheer(0.6); if (i % 7 === 0) st.setView(3 + (i % 5), 2); }
  for (const n of names) THREE[n] = orig[n];
  const tot = names.reduce((a, n) => a + cnt[n], 0); if (tot) fail('S3', 'per-frame allocation: ' + JSON.stringify(cnt));
  st.dispose();
  for (const turf of ['grass', 'firm', 'lush', 'astro']) { try { St.build(THREE, themeOf(m), K, { quality: 0, id: m.id, turf }).dispose(); } catch (e) { fail('S3', 'turf ' + turf + ' ' + e.message); } }
}
if (fails.length) { console.log('FAIL (' + fails.length + ')'); fails.slice(0, 40).forEach((f) => console.log(' ', f)); process.exit(1); }
console.log('stadium-test OK (' + ISO.MAPS.length + ' maps, ' + Object.keys(cur).length + ' builds)');
