/* ISO FOOTBALL — developer debug HUD (roadmap 9.5). Injected by ISO.Access.debugToggle() on first enable and NEVER listed in index.html, so it costs nothing while off
   (main.js reads ISO.Dbg once per frame: null = off). READ-ONLY: it never writes the simulation (ball overlays integrate a COPY of the ball). English only (exempt from i18n).
   Gate: ?debug=1 in the URL, or admin unlocked. Toggle: F2 (or Settings › Admin › debug button). Collapsible sections are remembered in sessionStorage. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const SEC = ['PERF', 'SIM', 'INPUT', 'NET', 'AI', 'CAM', 'I18N'], KEY = 'iso.dbg.open';
  let open = {}, root = null, body = {}, lastUpd = 0, on = false, vis = { circles: true, vel: true, traj: true };
  try { open = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { open = {}; }
  const saveOpen = () => { try { sessionStorage.setItem(KEY, JSON.stringify(open)); } catch (e) { /* storage blocked */ } };

  const frames = [];      // the last 300 frame times (ms)
  let acc = { sim: 0, draw: 0, work: 0, steps: 0, n: 0 }, avg = { sim: 0, draw: 0, work: 0, steps: 0 }, lat = null, lastDown = 0, lastSnaps = 0, lastSnapT = 0, snapRate = 0, pings = [], lastPing = null, last = null, tdraw = 0;

  function frame(App, m) {
    last = { App, m };
    frames.push(m.dt * 1000); if (frames.length > 300) frames.shift();
    acc.sim += m.t1 - m.t0; acc.draw += m.t2 - m.t1; acc.work += m.t3 - m.t0; acc.steps += m.steps; acc.n++;
    const now = m.t3;
    if (now - lastUpd > 250) {
      lastUpd = now;
      if (acc.n) { avg = { sim: acc.sim / acc.n, draw: acc.draw / acc.n, work: acc.work / acc.n, steps: acc.steps / acc.n }; acc = { sim: 0, draw: 0, work: 0, steps: 0, n: 0 }; }
      update(App, m);
    }
  }
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–'), f0 = (v) => (Number.isFinite(v) ? Math.round(v) : '–');
  function perf() {
    const n = frames.length, mean = n ? frames.reduce((a, b) => a + b, 0) / n : 0, sorted = frames.slice().sort((a, b) => a - b), p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] : 0;
    const r3 = ISO.R3D && ISO.R3D.debug ? ISO.R3D.debug() : null, rc = ISO.Render.debugCounts ? ISO.Render.debugCounts() : null, mem = typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    return ['fps ' + f0(mean ? 1000 / mean : 0) + '  1% low ' + f0(p99 ? 1000 / p99 : 0), 'frame ' + f1(avg.work) + ' ms  sim ' + f1(avg.sim) + '  draw ' + f1(avg.draw), 'steps / frame ' + f1(avg.steps),
      'tier ' + (r3 && r3.tier != null ? r3.tier : '–') + '  calls ' + (r3 && r3.info ? r3.info.render.calls : '–') + '  tris ' + (r3 && r3.info ? r3.info.render.triangles : '–'),
      'particles ' + (rc ? rc.parts : '–') + '  texts ' + (rc ? rc.texts : '–') + '  sprite cache ' + (ISO.Sprites && ISO.Sprites.cacheSize ? ISO.Sprites.cacheSize() : '–'),
      'geo ' + (r3 && r3.players ? r3.players.geometries : '–') + ' mat ' + (r3 && r3.players ? r3.players.materials : '–') + ' tex ' + (r3 && r3.players ? r3.players.textures : '–') + '  heap ' + (mem == null ? 'n/a' : f0(mem) + ' MB')];
  }
  function sim(App) {
    const G = App.G; if (!G) return ['no match'];
    const b = G.ball, L = ['phase ' + G.phase + '  t ' + f1(G.time) + '  phaseT ' + f1(G.phaseT) + '  score ' + G.score.join('–'),
      'ball x ' + f0(b.x) + ' y ' + f0(b.y) + ' z ' + f0(b.z) + '  v ' + f0(b.vx) + ',' + f0(b.vy) + ',' + f0(b.vz) + '  spin ' + f1(b.spin) + ' tsp ' + f1(b.tsp || 0) + '  owner ' + (b.owner ? G.players.indexOf(b.owner) : '–')];
    G.players.forEach((p, i) => L.push('P' + i + ' v ' + f0(p.vx) + ',' + f0(p.vy) + '  stam ' + f0(p.stam) + '  charge ' + (p.charge ? f1(p.charge.t) + ' ' + p.charge.type : '–') + '  ' + (p.state || '')));
    return L;
  }
  function input() {
    const IN = ISO.Input, lv = IN.live;
    return ['held ' + (lv.held.join(' ') || '–'), 'latched ' + (lv.latched.join(' ') || '–'), 'pad ' + lv.pad, 'keydown-to-draw ' + (lat == null ? '–' : f1(lat) + ' ms') + ' (estimate: event stamp to the end of the draw)'];
  }
  function net(App) {
    const n = ISO.Online && ISO.Online.net;
    if (App.mode !== 'online' || !n) return ['offline match'];
    const st = n.stats, t = performance.now();
    if (n.ping != null && n.ping !== lastPing) { lastPing = n.ping; pings.push(n.ping); if (pings.length > 10) pings.shift(); }
    if (t - lastSnapT > 1000) { snapRate = (st.snaps - lastSnaps) / ((t - lastSnapT) / 1000); lastSnaps = st.snaps; lastSnapT = t; }
    const mean = pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length : 0, jit = pings.length > 1 ? Math.sqrt(pings.reduce((a, b) => a + (b - mean) * (b - mean), 0) / pings.length) : 0;
    return ['ping ' + (n.ping == null ? '–' : n.ping + ' ms') + '  jitter ' + f1(jit) + ' ms (stddev of the last ' + pings.length + ')', 'snapshots / s ' + f1(snapRate) + '  pending ' + n.pending + '  rate ' + (n.rate == null ? '–' : n.rate),
      'resyncs ' + st.resyncs + '  stalls ' + st.stalls + '  starved ' + st.starved, 'prediction error mean ' + (st.errN ? (st.errSum / st.errN).toFixed(3) : '–') + '  max ' + (st.errMax || 0).toFixed(3), 'replayed steps / snapshot ' + (st.snaps ? (st.replayed / st.snaps).toFixed(2) : '–'), 'packet loss n/a (WebSocket/TCP)'];
  }
  function ai(App) {
    const L = [];
    (App.ai || []).forEach((a, i) => { if (a) L.push('AI' + i + ' ' + ((a.pers && a.pers.name) || 'neutral') + '  lvl ' + f1(a.lvl0) + '  mood ' + (a.mood || '–') + '  act ' + ((a.dbg && a.dbg.act) || '–') + '  q ' + f1(a.dbg && a.dbg.q)); });
    return L.length ? L : ['no CPU player'];
  }
  function cam(App, m) {
    const st = ISO.Profile.data.settings, c = ISO.R3D && ISO.R3D.camState ? ISO.R3D.camState() : null;
    if (!m.cur3d || !c) return ['2D view (classic camera)'];
    return ['preset ' + (st.cam3d || 'chase') + '  mode ' + c.mode, 'D ' + f1(c.D) + '  H ' + f1(c.H) + '  fov ' + f1(c.fov)];
  }
  function i18n() { const I = ISO.I18n; return ['lang ' + I.lang + '  missing ' + I.missing.size, Array.from(I.missing).slice(0, 12).join('  ') || '–']; }

  function build() {
    root = document.createElement('div'); root.id = 'dbgHud';
    root.style.cssText = 'position:fixed;left:6px;top:6px;z-index:9999;font:11px/1.35 ui-monospace,Menlo,monospace;color:#d8f5e0;background:rgba(0,0,0,.72);border:1px solid #35e08a;border-radius:4px;padding:4px 6px;max-width:440px;pointer-events:auto;user-select:none';
    const bar = document.createElement('div'); bar.textContent = 'DEBUG · F2 hides · overlays: '; bar.style.cssText = 'color:#35e08a;font-weight:700';
    for (const k of ['circles', 'vel', 'traj']) { const b = document.createElement('label'); b.style.cssText = 'margin-left:6px;cursor:pointer'; const c = document.createElement('input'); c.type = 'checkbox'; c.checked = vis[k]; c.onchange = () => { vis[k] = c.checked; }; b.appendChild(c); b.appendChild(document.createTextNode(k)); bar.appendChild(b); }
    root.appendChild(bar);
    for (const s of SEC) {
      const h = document.createElement('div'), d = document.createElement('pre');
      h.style.cssText = 'color:#ffcf4d;font-weight:700;cursor:pointer;margin-top:3px'; d.style.cssText = 'margin:0;white-space:pre-wrap';
      h.onclick = () => { open[s] = !open[s]; saveOpen(); d.style.display = open[s] ? '' : 'none'; h.textContent = (open[s] ? '▾ ' : '▸ ') + s; };
      open[s] = open[s] !== false && (open[s] || s === 'PERF'); d.style.display = open[s] ? '' : 'none'; h.textContent = (open[s] ? '▾ ' : '▸ ') + s;
      root.appendChild(h); root.appendChild(d); body[s] = d;
    }
    document.body.appendChild(root);
  }
  function update(App, m) {
    if (!root) return;
    const f = { PERF: () => perf(), SIM: () => sim(App), INPUT: () => input(), NET: () => net(App), AI: () => ai(App), CAM: () => cam(App, m), I18N: () => i18n() };
    for (const s of SEC) if (open[s]) { try { body[s].textContent = f[s]().join('\n'); } catch (e) { body[s].textContent = 'error: ' + e.message; } }
  }

  // overlays on the canvas: collision circles (C.PR, C.BR), velocity vectors, the ball's path (integrating a COPY of the ball; ISO.Phys.ballMotion mutates its argument)
  function draw(ctx, App, cur3d) {
    const t = performance.now(); tdraw = t;
    const dn = ISO.Input.lastDownT; if (dn !== lastDown) { lastDown = dn; lat = t - dn; }
    const G = App.G; if (!G || !G.ball || App.screen !== 'match' && !App.demo) return;
    const C = ISO.C, R = ISO.Render;
    const proj = cur3d && ISO.R3D.ready && ISO.R3D.project ? (x, y, z) => { const K = ISO.R3D.K, w = K.toWorld ? K.toWorld(x, y, z || 0, {}) : null; return w ? ISO.R3D.project(w.x, w.y != null && z ? w.y : (z || 0) * (K.S || 1), w.z) : null; } : (x, y) => R.debugProj(x, y);
    const P = (x, y, z) => { try { return proj(x, y, z); } catch (e) { return null; } };
    ctx.save(); ctx.lineWidth = 1.5;
    if (vis.circles) {
      ctx.strokeStyle = '#ffcf4d';
      for (const p of G.players.concat([G.keeper])) { if (!p || p.state === 'away') continue; ring(ctx, P, p.x, p.y, C.PR); }
      ctx.strokeStyle = '#ffffff'; ring(ctx, P, G.ball.x, G.ball.y, C.BR);
    }
    if (vis.vel) {
      ctx.strokeStyle = '#4da3ff';
      for (const p of G.players) { const a = P(p.x, p.y, 0), b = P(p.x + p.vx * 0.25, p.y + p.vy * 0.25, 0); if (a && b && a.visible !== false && b.visible !== false) line(ctx, a, b); }
      const b0 = G.ball, a = P(b0.x, b0.y, 0), b = P(b0.x + b0.vx * 0.15, b0.y + b0.vy * 0.15, 0); ctx.strokeStyle = '#ff6b5e'; if (a && b) line(ctx, a, b);
    }
    if (vis.traj && ISO.Phys && ISO.Phys.ballMotion) {
      const s = { x: G.ball.x, y: G.ball.y, z: G.ball.z, vx: G.ball.vx, vy: G.ball.vy, vz: G.ball.vz, spin: G.ball.spin, tsp: G.ball.tsp || 0 }, S = ISO.Phys.surf ? ISO.Phys.surf(G) : undefined;
      ctx.strokeStyle = '#35e08a'; ctx.beginPath(); let first = true;
      for (let i = 0; i < 90; i++) { ISO.Phys.ballMotion(s, 1 / 30, 1, S); const q = P(s.x, s.y, s.z); if (!q) break; if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function ring(ctx, P, x, y, r) { const c = P(x, y, 0), e = P(x + r, y, 0), e2 = P(x, y + r, 0); if (!c || !e || !e2) return; ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(1, Math.abs(e2.x - c.x) || Math.abs(e.x - c.x)), Math.max(1, Math.abs(e.y - c.y) || Math.abs(e2.y - c.y)), 0, 0, 6.2832); ctx.stroke(); }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  const impl = { frame, draw };
  function toggle(force) {
    on = force === undefined ? !on : !!force;
    if (!root) build();
    root.style.display = on ? '' : 'none';
    ISO.Dbg = on ? impl : null;      // null again when off: main.js goes back to doing nothing
    return on;
  }
  ISO.DbgToggle = toggle;
  toggle(true);
})();
