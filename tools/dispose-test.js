#!/usr/bin/env node
/* GPU resource leak test (roadmap 9.4). node tools/dispose-test.js
   Wraps every THREE geometry / material / texture constructor (a Proxy construct trap on the exported class) and every dispose(), then builds and
   disposes the 3D stadium (each map, quality 0 and 2), a full cast of players (+ Player.clearCache()) and the ball, three times each.
   created - disposed must be 0 after each round: anything left is a leak. Headless, vm + document stub as tools/stadium-test.js. Exit 1 on a leak. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), noop = () => {};
const mkCtx = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? (a, b, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w || a || 1) * (h || b || 1) * 4)), width: w || a || 1, height: h || b || 1 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
const mkCanvas = () => ({ width: 1, height: 1, style: {}, getContext: () => mkCtx(), addEventListener: noop });
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild: noop, setAttribute: noop }), createElementNS: () => mkCanvas(), getElementById: () => null, head: { appendChild: noop }, body: { appendChild: noop }, addEventListener: noop };
globalThis.window = globalThis.window || globalThis;
const warn = console.warn; console.warn = noop;
let renderOk = true;
for (const f of ['js/vendor/three.min.js', 'js/data.js', 'js/game.js', 'js/3d/coords.js', 'js/sprites.js', 'js/render.js', 'js/3d/animkit.js', 'js/3d/player3d.js', 'js/3d/ball3d.js', 'js/3d/stadium.js']) {
  const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  try { vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p }); }
  catch (e) { if (f === 'js/render.js') { renderOk = false; continue; } console.log('LOAD FAIL', f, String(e.stack).split('\n').slice(0, 3).join(' | ')); process.exit(2); }
}
console.warn = warn;
const THREE = globalThis.THREE, ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K;
const live = new Set(), kinds = new Map();
for (const n of Object.keys(THREE)) {
  const k = THREE[n]; if (typeof k !== 'function' || !/(Geometry|Material|Texture)$/.test(n) || !k.prototype) continue;
  const P = new Proxy(k, { construct(t, a, nt) { const o = Reflect.construct(t, a, nt === P ? t : nt); if (typeof o.dispose === 'function') { live.add(o); kinds.set(o, n); } return o; } });
  try { THREE[n] = P; } catch (e) { /* read-only export: not tracked */ }
}
for (const B of [THREE.BufferGeometry, THREE.Material, THREE.Texture]) { const d = B.prototype.dispose; B.prototype.dispose = function () { live.delete(this); return d.apply(this, arguments); }; }
const fails = [];
const synth = (m) => ({ bg: '#0c1016', around: m.walls ? (m.id === 'fs_roof' ? 'bricks' : 'crowd') : 'crowd', crowd: ['#3a4658', '#566377', '#7a2f3a'], wall: '#131a22', base: '#2c7a3d', bands: ['#2a7a3c', '#2f8443'], line: '#fff', mark: '#ffe678', net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.28, ads: [[m.name, '#0f1a14', '#35e08a']], cage: m.id === 'fs_roof' ? '#c8d2e0' : undefined });
const theme = (m) => { if (renderOk && ISO.Render && ISO.Render.setMap && ISO.Render.theme) { ISO.Render.setMap(m.id); return ISO.Render.theme(); } return synth(m); };
const report = (what, before) => {
  const left = live.size - before; if (left === 0) return;
  const by = {}; let i = 0; for (const o of live) { if (i++ < before) continue; const n = kinds.get(o); by[n] = (by[n] || 0) + 1; }
  fails.push(what + ': ' + left + ' not disposed ' + JSON.stringify(by));
};
// stadium
for (const m of ISO.MAPS) for (const q of [0, 2]) {
  const th = theme(m), base = live.size;
  for (let r = 0; r < 3; r++) { try { const st = R3D.Stadium.build(THREE, th, K, { walls: !!m.walls, quality: q, id: m.id, kitCols: ['#d33', '#fc3'] }); st.update(0.016, 1); st.dispose(); } catch (e) { fails.push('stadium ' + m.id + ' threw ' + e.message); break; } }
  report('stadium ' + m.id + ' q' + q + ' (x3)', base);
}
// players (a full cast plus both keepers), then the shared cache
if (R3D.Player) {
  const cast = ISO.PLAYERS.slice(0, 10), base = live.size;
  for (let r = 0; r < 3; r++) {
    const actors = [];
    try {
      cast.forEach((d, i) => actors.push(R3D.Player.create(THREE, { def: d, kit: d.kit, keeper: false, slot: i })));
      for (const k of [ISO.KEEPERS[0], ISO.KEEPERS[1]]) actors.push(R3D.Player.create(THREE, { def: k, kit: k.kit, keeper: true, slot: 9 }));
    } catch (e) { fails.push('players threw ' + e.message); break; }
    for (const a of actors) a.dispose();
    R3D.Player.clearCache();
  }
  report('players + clearCache (x3)', base);
}
// ball
if (R3D.Ball) {
  const base = live.size, skin = ISO.BALLS[0];
  for (let r = 0; r < 3; r++) { try { R3D.Ball.create(THREE, skin, { walls: r === 1 }).dispose(); } catch (e) { fails.push('ball threw ' + e.stack.split('\n').slice(0, 3).join(' | ')); break; } }
  report('ball (x3)', base);
}
if (fails.length) { console.log('FAIL (' + fails.length + ')'); fails.forEach((f) => console.log(' ', f)); process.exit(1); }
console.log('dispose-test OK (' + ISO.MAPS.length + ' maps x2 qualities, players, ball: created - disposed = 0 after 3 rounds each)');
