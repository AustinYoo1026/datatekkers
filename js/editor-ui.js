/* ISO FOOTBALL — Custom Drill Creator (Phase 4.4): the #editor screen. A top-down canvas drawn with the render.js pitch transform
   (screen = (OX + Z * simY, OY + Z * (FW - simX))), palette, drag, rotate (handle or R), delete, undo / redo (JSON snapshots, cap 100), 20 save slots in
   their own localStorage key, TEST (plays the drill, then returns here), reset to saved, export / import share codes.
   Everything that leaves the editor (TEST, a slot, a share code) goes through ISO.DrillSpec.validate; the working draft itself may be invalid mid-edit. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const DS = ISO.DrillSpec, C = ISO.C, R = ISO.Render, App = ISO.App, $ = (id) => document.getElementById(id);
  const E = ISO.EditorUI = { d: null, hist: [], hi: 0, sel: null, drag: null, saved: null, msg: '', slots: [], code: '', raf: 0, on: false, cx: 0, cy: 0 };
  const { FW, FH, GY0, GY1, BOXD, BOXY0, BOXY1 } = C, BACK = C.BACK, HIST = 100;
  const ls = () => window.localStorage;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const TAU = Math.PI * 2;
  const newId = () => 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);      // editor-only: never reaches the sim

  // ------------------------------------------------------------- shared drawing (the in-game 2D view calls this too, inside its pitch transform)
  // c is in view space: (u, v) = (simY, FW - simX). Cones, walls and lit target zones only; the game draws players, keeper and ball itself.
  E.drawWorld = (c, def, t) => {
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 7);
    for (const ti of def.targets) {
      const T = ISO.TARGETS[ti], x = T.y0, w = T.y1 - T.y0, y = -T.z1 * 0.55, h = (T.z1 - T.z0) * 0.55;
      c.fillStyle = 'rgba(255,207,77,' + (0.26 + 0.3 * pulse) + ')'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#ffcf4d'; c.lineWidth = 1.6; c.strokeRect(x, y, w, h);
    }
    for (const w of def.walls) {
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 9; c.beginPath(); c.moveTo(w.y0 + 1, FW - w.x0 + 2); c.lineTo(w.y1 + 1, FW - w.x1 + 2); c.stroke();
      c.strokeStyle = w.h > 55 ? '#e9eef5' : w.h > 30 ? '#b9c4d2' : '#8d99a8'; c.lineWidth = 6; c.beginPath(); c.moveTo(w.y0, FW - w.x0); c.lineTo(w.y1, FW - w.x1); c.stroke();
      c.strokeStyle = '#4a5666'; c.lineWidth = 1.2; c.stroke();
    }
    for (const k of def.cones) {
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(k.y + 1, FW - k.x + 2, k.r, 0, TAU); c.fill();
      c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(k.y, FW - k.x, k.r, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(k.y, FW - k.x, k.r * 0.5, 0, TAU); c.fill();
      c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(k.y, FW - k.x, k.r * 0.22, 0, TAU); c.fill();
    }
  };

  // ------------------------------------------------------------- draft and history
  const snap = () => JSON.stringify(E.d);
  function push() {
    const s = snap();
    if (E.hist[E.hi] === s) return;
    E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(s);
    if (E.hist.length > HIST) E.hist.shift();
    E.hi = E.hist.length - 1; E.dirty = true;
  }
  function loadDraft(spec, saved) {
    E.d = JSON.parse(JSON.stringify(spec)); E.sel = null; E.drag = null;
    E.hist = [snap()]; E.hi = 0; E.saved = saved ? JSON.stringify(spec) : null; E.dirty = false; E.msg = '';
  }
  const undo = () => { if (E.hi > 0) { E.hi--; E.d = JSON.parse(E.hist[E.hi]); E.sel = null; } };
  const redo = () => { if (E.hi < E.hist.length - 1) { E.hi++; E.d = JSON.parse(E.hist[E.hi]); E.sel = null; } };
  E.undo = undo; E.redo = redo; E.push = push;
  const blankDraft = () => { const b = DS.blank(newId()); return b; };
  const lim = (k) => DS.LIM[k];

  function add(kind) {
    const d = E.d, s = d.start, L = { cone: 'cones', wall: 'walls', def: 'defenders' }[kind];
    if (d[L].length >= lim(L)) { E.msg = 'THE LIMIT FOR THAT IS ' + lim(L); return; }
    const ox = clamp(s.x + 90, 30, FW - 40), oy = clamp(s.y + (d[L].length % 2 ? 60 : -60) * (1 + (d[L].length >> 1) * 0.4), 40, FH - 40);
    if (kind === 'cone') d.cones.push({ x: ox, y: oy, r: 8 });
    else if (kind === 'wall') d.walls.push({ x0: ox, y0: oy - 40, x1: ox, y1: oy + 40, h: 40 });
    else d.defenders.push({ x: ox, y: oy, mode: 'static', face: Math.PI });
    E.sel = { k: kind, i: d[L].length - 1 }; E.msg = ''; push();
  }
  function remove() {
    const s = E.sel; if (!s) return;
    const L = { cone: 'cones', wall: 'walls', def: 'defenders' }[s.k]; if (!L) return;
    E.d[L].splice(s.i, 1); E.sel = null; push();
  }
  function rotate(dir) {
    const s = E.sel; if (!s) return;
    if (s.k === 'def') { const o = E.d.defenders[s.i]; o.face = ((o.face + dir * Math.PI / 12 + Math.PI) % TAU + TAU) % TAU - Math.PI; }
    else if (s.k === 'wall') {
      const w = E.d.walls[s.i], mx = (w.x0 + w.x1) / 2, my = (w.y0 + w.y1) / 2, a = dir * Math.PI / 12, ca = Math.cos(a), sa = Math.sin(a);
      for (const [kx, ky] of [['x0', 'y0'], ['x1', 'y1']]) { const dx = w[kx] - mx, dy = w[ky] - my; w[kx] = clamp(mx + dx * ca - dy * sa, 20, FW - 20); w[ky] = clamp(my + dx * sa + dy * ca, 20, FH - 20); }
    } else return;
    push();
  }
  E.add = add; E.remove = remove; E.rotate = rotate;

  // ------------------------------------------------------------- pointer
  const toSim = (ev) => {
    const cv = E.cv, r = cv.getBoundingClientRect(), u = ((ev.clientX - r.left) / r.width) * R.VW, v = ((ev.clientY - r.top) / r.height) * R.VH;
    return { x: FW - (v - R.OY) / R.Z, y: (u - R.OX) / R.Z };
  };
  const dd = (a, b, c, d) => Math.hypot(a - c, b - d);
  function segD(px, py, w) { const ex = w.x1 - w.x0, ey = w.y1 - w.y0, l2 = ex * ex + ey * ey, t = l2 ? clamp(((px - w.x0) * ex + (py - w.y0) * ey) / l2, 0, 1) : 0; return dd(px, py, w.x0 + ex * t, w.y0 + ey * t); }
  function hit(p) {
    const d = E.d, tol = 12 / R.Z * 1.2;
    if (E.sel && E.sel.k === 'def') { const o = d.defenders[E.sel.i]; if (o && dd(p.x, p.y, o.x + Math.cos(o.face) * 34, o.y + Math.sin(o.face) * 34) < tol) return { k: 'rot', i: E.sel.i }; }
    if (dd(p.x, p.y, d.start.x, d.start.y) < 16) return { k: 'start' };
    if (d.keeper.mode !== 'none' && dd(p.x, p.y, d.keeper.x, d.keeper.y) < 16) return { k: 'keeper' };
    for (let i = d.defenders.length - 1; i >= 0; i--) if (dd(p.x, p.y, d.defenders[i].x, d.defenders[i].y) < 15) return { k: 'def', i };
    for (let i = d.cones.length - 1; i >= 0; i--) if (dd(p.x, p.y, d.cones[i].x, d.cones[i].y) < d.cones[i].r + 5) return { k: 'cone', i };
    for (let i = d.walls.length - 1; i >= 0; i--) {
      const w = d.walls[i];
      if (dd(p.x, p.y, w.x0, w.y0) < tol) return { k: 'wall', i, end: 0 };
      if (dd(p.x, p.y, w.x1, w.y1) < tol) return { k: 'wall', i, end: 1 };
      if (segD(p.x, p.y, w) < 9) return { k: 'wall', i, end: -1 };
    }
    // a click in the goal mouth toggles a target zone: u = simY across, v above the line = height
    return null;
  }
  function zoneAt(ev) {
    const cv = E.cv, r = cv.getBoundingClientRect(), u = ((ev.clientX - r.left) / r.width) * R.VW, v = ((ev.clientY - r.top) / r.height) * R.VH;
    const y = (u - R.OX) / R.Z, vv = (v - R.OY) / R.Z;
    if (y < GY0 || y > GY1 || vv > 2 || vv < -26) return -1;
    const left = y < (GY0 + GY1) / 2, top = vv < -11;
    return top ? (left ? 0 : 1) : left ? 2 : 3;
  }
  function down(ev) {
    if (ev.button !== 0) return;
    const z = zoneAt(ev);
    if (z >= 0) { const t = E.d.targets, i = t.indexOf(z); if (i >= 0) t.splice(i, 1); else t.push(z); t.sort(); push(); return; }
    const p = toSim(ev), h = hit(p);
    E.sel = h && h.k !== 'rot' ? h : h ? E.sel : null;
    if (h) { E.drag = { h, p0: p, orig: snap(), moved: false }; E.cv.setPointerCapture && E.cv.setPointerCapture(ev.pointerId); }
    E.msg = '';
  }
  function move(ev) {
    const g = E.drag; if (!g) return;
    const p = toSim(ev), d = E.d, h = g.h, o = g.orig && JSON.parse(g.orig), dx = p.x - g.p0.x, dy = p.y - g.p0.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) g.moved = true;
    const X = (v) => Math.round(clamp(v, 20, FW - 20)), Y = (v) => Math.round(clamp(v, 20, FH - 20));
    if (h.k === 'start') { d.start.x = Math.round(clamp(o.start.x + dx, 40, FW - 70)); d.start.y = Math.round(clamp(o.start.y + dy, 60, FH - 60)); }
    else if (h.k === 'keeper') { d.keeper.x = Math.round(clamp(o.keeper.x + dx, FW - BOXD + 10, FW - 8)); d.keeper.y = Math.round(clamp(o.keeper.y + dy, BOXY0 + 10, BOXY1 - 10)); }
    else if (h.k === 'def') { const q = d.defenders[h.i], q0 = o.defenders[h.i]; q.x = X(q0.x + dx); q.y = Y(q0.y + dy); }
    else if (h.k === 'rot') { const q = d.defenders[h.i]; q.face = Math.round(Math.atan2(p.y - q.y, p.x - q.x) * 100) / 100; }
    else if (h.k === 'cone') { const q = d.cones[h.i], q0 = o.cones[h.i]; q.x = X(q0.x + dx); q.y = Y(q0.y + dy); }
    else if (h.k === 'wall') {
      const w = d.walls[h.i], w0 = o.walls[h.i];
      if (h.end === 0) { w.x0 = X(w0.x0 + dx); w.y0 = Y(w0.y0 + dy); } else if (h.end === 1) { w.x1 = X(w0.x1 + dx); w.y1 = Y(w0.y1 + dy); }
      else { const mx = clamp(dx, 20 - Math.min(w0.x0, w0.x1), FW - 20 - Math.max(w0.x0, w0.x1)), my = clamp(dy, 20 - Math.min(w0.y0, w0.y1), FH - 20 - Math.max(w0.y0, w0.y1)); w.x0 = Math.round(w0.x0 + mx); w.x1 = Math.round(w0.x1 + mx); w.y0 = Math.round(w0.y0 + my); w.y1 = Math.round(w0.y1 + my); }
    }
  }
  function up() { const g = E.drag; E.drag = null; if (g && g.moved) push(); }

  // ------------------------------------------------------------- slots, test, share
  function refreshSlots() { E.slots = DS.loadSlots(ls); }
  function check() { const v = DS.validate(E.d); if (!v) E.msg = 'CANNOT USE THIS LAYOUT: KEEP CONES, WALLS, DEFENDERS AND THE KEEPER CLEAR OF YOUR START (AND ITS SPREAD)'; return v; }
  function save(asNew) {
    const v0 = check(); if (!v0) return;
    let spec = v0;
    if (asNew) { spec = Object.assign({}, v0, { id: newId() }); }
    const r = DS.putSlot(ls, spec);
    if (!r.ok) { E.msg = r.reason === 'full' ? 'ALL 20 SLOTS ARE USED: DELETE ONE FIRST' : r.reason === 'storage' ? 'COULD NOT SAVE (BROWSER STORAGE IS FULL OR BLOCKED)' : 'COULD NOT SAVE'; return; }
    E.slots = r.slots; if (asNew) { E.d.id = spec.id; }
    E.saved = JSON.stringify(DS.validate(E.d)); E.dirty = false; E.msg = 'SAVED'; push();
  }
  function resetToSaved() {
    const s = E.slots.find((x) => x.id === E.d.id);
    if (s) loadDraft(s, true); else loadDraft(Object.assign(DS.blank(E.d.id), {}), false);
    E.msg = s ? 'RESET TO THE SAVED VERSION' : 'NOT SAVED YET: RESET TO A BLANK DRILL';
  }
  function play(spec) {
    const P = ISO.Profile;
    App.mode = 'drill'; App.drill = 'custom'; App.drillDef = spec; App.fromEditor = true; App.side = 0; App.touched = true;
    if (!P.owns(App.pick[0].id)) App.pick[0] = ISO.PLAYERS.filter((d) => P.owns(d.id)).sort((a, b) => b.ovr - a.ovr)[0];
    App.startMatch();
  }
  function test() { const v = check(); if (v) play(v); }
  function exportCode() { const v = check(); if (!v) return; E.code = DS.toCode(v); E.msg = 'CODE READY: COPY IT'; const t = $('edCode'); if (t) { t.value = E.code; t.select(); } try { navigator.clipboard && navigator.clipboard.writeText(E.code); } catch (e) { /* the box still holds it */ } }
  function importCode() {
    const t = $('edCode'), v = DS.fromCode(t ? t.value : '');
    if (!v) { E.msg = 'THAT IS NOT A VALID DRILL CODE'; return; }
    const spec = Object.assign({}, v, { id: newId() });      // an imported drill never overwrites one of yours
    loadDraft(spec, false); E.dirty = true; E.msg = 'IMPORTED: SAVE IT TO KEEP IT';
  }
  E.test = test; E.save = save; E.resetToSaved = resetToSaved; E.exportCode = exportCode; E.importCode = importCode;

  // ------------------------------------------------------------- UI
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = '#editor{padding:0!important;display:block}#editor canvas#edCv{position:absolute;inset:0;width:100%;height:100%;z-index:0;touch-action:none;cursor:crosshair}' +
    '#editor .edp{position:absolute;top:64px;bottom:70px;width:176px;z-index:2;background:rgba(8,14,22,.9);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:8px;overflow:auto;font:700 11px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif;color:#dfe8f2;letter-spacing:.04em}' +
    '#editor .edl{left:8px}#editor .edr{right:8px}#editor h4{margin:8px 0 3px;font-size:10px;color:#8fa3b8;letter-spacing:.12em}#editor .row{display:flex;gap:3px;flex-wrap:wrap;align-items:center}' +
    '#editor button.eb{flex:1 1 auto;min-width:28px;padding:5px 6px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:#dfe8f2;border-radius:5px;font:inherit;cursor:pointer}' +
    '#editor button.eb.on{background:#35e08a;color:#06120c;border-color:#35e08a}#editor button.eb:disabled{opacity:.35;cursor:default}#editor button.eb.go{background:#35e08a;color:#06120c;border-color:#35e08a}' +
    '#editor input[type=text]{width:100%;box-sizing:border-box;background:#0b1520;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:5px;font:inherit}#editor input[type=range]{width:100%}' +
    '#editor textarea{width:100%;height:70px;box-sizing:border-box;background:#0b1520;color:#cfe;border:1px solid rgba(255,255,255,.25);border-radius:5px;font:10px monospace}' +
    '#editor .edtop{position:absolute;left:8px;right:8px;top:10px;height:46px;z-index:2;display:flex;align-items:center;gap:12px;color:#fff}#editor .edtop h2{margin:0;font-size:22px}#editor .edmsg{flex:1;font:700 12px Arial,sans-serif;color:#ffcf4d}' +
    '#editor .edbar{position:absolute;left:190px;right:190px;bottom:12px;height:48px;z-index:2;display:flex;gap:6px;align-items:center;justify-content:center}#editor .edbar button{flex:0 0 auto;padding:8px 14px}' +
    '#editor .slot{display:flex;gap:3px;align-items:center;margin:2px 0}#editor .slot span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}#editor .slot.cur span{color:#35e08a}#editor .val{min-width:22px;text-align:center;color:#fff}';
  const b = (a, v, label, on, dis) => '<button class="eb' + (on ? ' on' : '') + '" data-ea="' + a + '" data-v="' + v + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
  const step = (a, label, val) => '<div class="row"><span style="flex:1">' + label + '</span>' + b(a, -1, '−') + '<span class="val">' + val + '</span>' + b(a, 1, '+') + '</div>';
  function build() {
    const sec = $('editor'); if (!sec || E.built) return; E.built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    sec.innerHTML = '<canvas id="edCv" width="1280" height="720"></canvas><div class="edtop"><button class="btn small ghost" data-act="drills-back-ed">‹ DRILLS</button><h2>DRILL CREATOR</h2><div class="edmsg" id="edMsg"></div></div>' +
      '<div class="edp edl" id="edL"></div><div class="edp edr" id="edR"></div><div class="edbar" id="edBar"></div>';
    E.cv = $('edCv'); E.ctx = E.cv.getContext('2d');
    E.cv.addEventListener('pointerdown', down); E.cv.addEventListener('pointermove', move); E.cv.addEventListener('pointerup', up); E.cv.addEventListener('pointercancel', up);
    sec.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-ea]'); if (!t) return;
      ev.stopPropagation(); act(t.dataset.ea, t.dataset.v); if (t.blur) t.blur(); E.ui = true;
    });
    sec.addEventListener('change', (ev) => { const t = ev.target.closest('[data-ei]'); if (t) { input(t.dataset.ei, t.value); if (t.blur) t.blur(); E.ui = true; } });
    sec.addEventListener('input', (ev) => { const t = ev.target.closest('input[type=range]'); if (t) { input(t.dataset.ei, t.value, true); } });
    window.addEventListener('keydown', key);
  }
  function input(k, v, live) {
    const d = E.d, n = +v;
    if (k === 'name') d.name = String(v).slice(0, 24);
    else if (k === 'r' && E.sel && E.sel.k === 'cone') d.cones[E.sel.i].r = clamp(Math.round(n), 4, 14);
    else if (k === 'h' && E.sel && E.sel.k === 'wall') d.walls[E.sel.i].h = clamp(Math.round(n), 10, 80);
    else if (k === 'jx') d.start.jx = clamp(Math.round(n), 0, 80);
    else if (k === 'jy') d.start.jy = clamp(Math.round(n), 0, 200);
    if (!live) push();
    else E.liveEdit = true;
  }
  function act(a, v) {
    const d = E.d; v = +v || v;
    if (a === 'add') add(v);
    else if (a === 'zone') { const i = d.targets.indexOf(v); if (i >= 0) d.targets.splice(i, 1); else d.targets.push(v); d.targets.sort(); push(); }
    else if (a === 'kmode') { d.keeper.mode = v; push(); }
    else if (a === 'knerf') { d.keeper.nerf = v; push(); }
    else if (a === 'total') { d.total = clamp(d.total + v, 1, 20); push(); }
    else if (a === 'time') { d.time = clamp(d.time + v, 3, 30); push(); }
    else if (a === 'goal') { d.score.goal = clamp(d.score.goal + v, 1, 5); push(); }
    else if (a === 'bull') { d.score.bull = clamp(d.score.bull + v, 1, 5); push(); }
    else if (a.startsWith('ty-')) { const t = a.slice(3), cur = d.score.types[t]; if (v === 0) delete d.score.types[t]; else { d.score.types[t] = clamp((cur === undefined ? (t === 'normal' ? 1 : 2) : cur) + v, 0, 5); } push(); }
    else if (a === 'undo') undo(); else if (a === 'redo') redo(); else if (a === 'del') remove();
    else if (a === 'rotL') rotate(-1); else if (a === 'rotR') rotate(1);
    else if (a === 'test') test(); else if (a === 'save') save(false); else if (a === 'saveas') save(true);
    else if (a === 'reset') resetToSaved();
    else if (a === 'new') { loadDraft(blankDraft(), false); E.msg = 'NEW DRILL'; }
    else if (a === 'slot') { const s = E.slots[v]; if (s) { loadDraft(s, true); E.msg = 'LOADED ' + s.name; } }
    else if (a === 'slotplay') { const s = E.slots[v]; if (s) play(s); }
    else if (a === 'slotdel') { const s = E.slots[v]; if (s) { E.slots = DS.delSlot(ls, s.id); E.msg = 'DELETED ' + s.name; } }
    else if (a === 'export') exportCode(); else if (a === 'import') importCode();
    else if (a === 'type') { /* reserved */ }
  }
  function key(ev) {
    if (App.screen !== 'editor') return;
    const tg = ev.target && ev.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    const k = ev.key.toLowerCase(), mod = ev.metaKey || ev.ctrlKey;
    if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { ev.preventDefault(); redo(); }
    else if (k === 'r' && !mod) { ev.preventDefault(); rotate(ev.shiftKey ? -1 : 1); }
    else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); remove(); }
  }
  function panels() {
    const d = E.d, s = E.sel, L = $('edL'), Rr = $('edR'), bar = $('edBar');
    const full = (k) => d[k].length >= lim(k);
    let sel = '';
    if (s && s.k === 'cone') sel = '<h4>SELECTED CONE</h4><div class="row">SIZE <input type="range" min="4" max="14" value="' + d.cones[s.i].r + '" data-ei="r"></div>';
    else if (s && s.k === 'wall') sel = '<h4>SELECTED WALL</h4><div class="row">HEIGHT <input type="range" min="10" max="80" value="' + d.walls[s.i].h + '" data-ei="h"></div><div class="row"><small>DRAG THE ENDS TO RESIZE AND TURN</small></div>';
    else if (s && s.k === 'def') sel = '<h4>SELECTED DEFENDER</h4><div class="row"><small>DRAG THE DOT TO TURN · R ROTATES</small></div>';
    else if (s && s.k === 'start') sel = '<h4>YOUR START</h4><div class="row"><small>DRAG TO MOVE</small></div>';
    L.innerHTML = '<h4>PLACE</h4><div class="row">' + b('add', 'cone', 'CONE ' + d.cones.length + '/' + lim('cones'), false, full('cones')) + b('add', 'wall', 'WALL ' + d.walls.length + '/' + lim('walls'), false, full('walls')) + b('add', 'def', 'DEFENDER ' + d.defenders.length + '/' + lim('defenders'), false, full('defenders')) + '</div>' + sel +
      '<h4>TARGET ZONES (GOAL)</h4><div class="row">' + [['TL', 0], ['TR', 1], ['BL', 2], ['BR', 3]].map(([l, i]) => b('zone', i, l, d.targets.includes(i))).join('') + '</div>' +
      '<h4>KEEPER</h4><div class="row">' + [['live', 'LIVE'], ['dummy', 'DUMMY'], ['none', 'NONE']].map(([v, l]) => b('kmode', v, l, d.keeper.mode === v)).join('') + '</div><div class="row">' + [[16, 'EASY'], [0, 'NORMAL'], [-6, 'HARD']].map(([v, l]) => b('knerf', v, l, d.keeper.nerf === v)).join('') + '</div>' +
      '<h4>DRILL</h4><input type="text" data-ei="name" maxlength="24" value="' + esc(d.name) + '">' + step('total', 'REPS', d.total) + step('time', 'SECONDS / REP', d.time) +
      '<h4>START SPREAD</h4><div class="row">SIDE <input type="range" min="0" max="200" value="' + d.start.jy + '" data-ei="jy"></div><div class="row">DEPTH <input type="range" min="0" max="80" value="' + d.start.jx + '" data-ei="jx"></div>' +
      '<h4>SCORING</h4>' + step('goal', 'GOAL', d.score.goal) + step('bull', 'TARGET', d.score.bull) +
      DS.TYPES.map((t) => { const c = d.score.types[t]; return '<div class="row"><span style="flex:1">' + t.toUpperCase() + '</span>' + (c === undefined ? b('ty-' + t, 1, 'SET') : b('ty-' + t, -1, '−') + '<span class="val">' + c + '</span>' + b('ty-' + t, 1, '+') + b('ty-' + t, 0, '×')) + '</div>'; }).join('') +
      '<div class="row"><small>SHOT TYPES REPLACE A GOAL\'S POINTS (0 = DOES NOT COUNT). MAX ' + DS.maxPoints(Object.assign({}, d, { total: d.total })) + ' PTS.</small></div>';
    Rr.innerHTML = '<h4>SAVED DRILLS ' + E.slots.length + '/' + lim('slots') + '</h4>' + (E.slots.length ? E.slots.map((x, i) => '<div class="slot' + (x.id === d.id ? ' cur' : '') + '"><span data-ea="slot" data-v="' + i + '" title="LOAD">' + esc(x.name) + '</span>' + b('slotplay', i, '▶') + b('slotdel', i, '✕') + '</div>').join('') : '<small>NONE YET: SAVE ONE</small>') +
      '<h4>SHARE</h4><textarea id="edCode" spellcheck="false" placeholder="PASTE A DRILL CODE HERE">' + esc(E.code) + '</textarea><div class="row">' + b('export', 1, 'EXPORT') + b('import', 1, 'IMPORT') + '</div>';
    bar.innerHTML = b('undo', 1, '↶ UNDO', false, E.hi <= 0) + b('redo', 1, '↷ REDO', false, E.hi >= E.hist.length - 1) + b('rotL', 1, '⟲', false, !s || (s.k !== 'def' && s.k !== 'wall')) + b('rotR', 1, '⟳ ROTATE (R)', false, !s || (s.k !== 'def' && s.k !== 'wall')) + b('del', 1, 'DELETE', false, !s || !['cone', 'wall', 'def'].includes(s.k)) +
      b('reset', 1, 'RESET TO SAVED') + b('new', 1, 'NEW') + b('save', 1, 'SAVE') + b('saveas', 1, 'SAVE AS NEW', false, E.slots.length >= lim('slots')) + '<button class="eb go" data-ea="test" data-v="1">▶ TEST</button>';
    E.sig = JSON.stringify([E.d, E.sel, E.hi, E.slots.length, E.slots.map((x) => x.id + x.name).join()]);
  }
  function sigNow() { return JSON.stringify([E.d, E.sel, E.hi, E.slots.length, E.slots.map((x) => x.id + x.name).join()]); }

  // ------------------------------------------------------------- the canvas
  function draw() {
    const c = E.ctx, d = E.d;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, R.VW, R.VH);
    c.fillStyle = '#0b1520'; c.fillRect(0, 0, R.VW, R.VH);
    c.setTransform(1, 0, 0, 1, 0, 0); c.translate(R.OX, R.OY); c.scale(R.Z, R.Z);
    // pitch: u = simY (0..FH), v = FW - simX (0 at the goal line, FW + BACK at the back board)
    c.fillStyle = '#2f8a4b'; c.fillRect(0, 0, FH, FW);
    for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; c.fillRect(0, i * FW / 12, FH, FW / 12); }
    c.fillStyle = '#25703b'; c.fillRect(0, FW, FH, BACK);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2; c.strokeRect(0, 0, FH, FW + BACK);
    c.strokeRect(BOXY0, 0, BOXY1 - BOXY0, BOXD); c.strokeRect(C.SIXY0 || 235, 0, (C.SIXY1 || 485) - (C.SIXY0 || 235), C.SIXD || 70);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(FH, 0); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(GY0, -14, GY1 - GY0, 14); c.strokeRect(GY0, -14, GY1 - GY0, 14);
    // the four target zones, drawn as a 2 x 2 grid on the goal mouth (top row = high shots)
    const zs = [[GY0, -26, 0], [(GY0 + GY1) / 2, -26, 1], [GY0, -13, 2], [(GY0 + GY1) / 2, -13, 3]];
    for (const [zx, zy, i] of zs) { const on = d.targets.includes(i); c.fillStyle = on ? 'rgba(255,207,77,.55)' : 'rgba(255,255,255,.1)'; c.fillRect(zx, zy, (GY1 - GY0) / 2, 13); c.strokeStyle = on ? '#ffcf4d' : 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(zx, zy, (GY1 - GY0) / 2, 13); }
    c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '700 9px Arial'; c.textAlign = 'center'; c.fillText('CLICK A ZONE TO LIGHT IT', (GY0 + GY1) / 2, -30);
    E.drawWorld(c, d, 0);
    const P = (x, y) => [y, FW - x];
    // keeper
    if (d.keeper.mode !== 'none') { const [u, v] = P(d.keeper.x, d.keeper.y); c.fillStyle = d.keeper.mode === 'dummy' ? '#b9c4d2' : '#ffd166'; c.fillRect(u - 10, v - 10, 20, 20); c.fillStyle = '#111'; c.font = '700 12px Arial'; c.textBaseline = 'middle'; c.fillText(d.keeper.mode === 'dummy' ? 'D' : 'K', u, v + 1); }
    // defenders: a red disc with a facing line, and the rotation dot when selected
    d.defenders.forEach((q, i) => {
      const [u, v] = P(q.x, q.y), fu = Math.sin(q.face), fv = -Math.cos(q.face);
      c.fillStyle = '#e8584f'; c.beginPath(); c.arc(u, v, 12, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(u, v); c.lineTo(u + fu * 18, v + fv * 18); c.stroke();
      if (E.sel && E.sel.k === 'def' && E.sel.i === i) { c.fillStyle = '#35e08a'; c.beginPath(); c.arc(u + fu * 34, v + fv * 34, 6, 0, TAU); c.fill(); }
    });
    // the start: your player, the spread box, the ball
    { const s = d.start, [u, v] = P(s.x, s.y);
      if (s.jx || s.jy) { c.strokeStyle = 'rgba(79,163,255,.8)'; c.setLineDash([5, 4]); c.lineWidth = 1.4; c.strokeRect(u - s.jy, v - s.jx, s.jy * 2, s.jx * 2); c.setLineDash([]); }
      c.fillStyle = '#4fa3ff'; c.beginPath(); c.arc(u, v, 12, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(u, v - 16); c.lineTo(u - 5, v - 8); c.lineTo(u + 5, v - 8); c.fill();
      c.beginPath(); c.arc(u, v - 17, 0.1, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(u, v - 24, 5, 0, TAU); c.fill(); }
    // selection
    if (E.sel) {
      c.strokeStyle = '#35e08a'; c.lineWidth = 2; const s = E.sel;
      if (s.k === 'cone') { const o = d.cones[s.i]; if (o) { const [u, v] = P(o.x, o.y); c.beginPath(); c.arc(u, v, o.r + 4, 0, TAU); c.stroke(); } }
      else if (s.k === 'def') { const o = d.defenders[s.i]; if (o) { const [u, v] = P(o.x, o.y); c.beginPath(); c.arc(u, v, 16, 0, TAU); c.stroke(); } }
      else if (s.k === 'wall') { const o = d.walls[s.i]; if (o) for (const [x, y] of [[o.x0, o.y0], [o.x1, o.y1]]) { const [u, v] = P(x, y); c.fillStyle = '#35e08a'; c.beginPath(); c.arc(u, v, 6, 0, TAU); c.fill(); } }
      else if (s.k === 'start' || s.k === 'keeper') { const o = s.k === 'start' ? d.start : d.keeper; const [u, v] = P(o.x, o.y); c.beginPath(); c.arc(u, v, 17, 0, TAU); c.stroke(); }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  function loop() {
    E.raf = 0;
    if (App.screen !== 'editor') { E.on = false; return; }
    draw();
    const sig = sigNow();
    if ((sig !== E.sig && !E.drag && !E.liveEdit) || E.ui) { E.ui = false; const a = document.activeElement; if (!(a && a.tagName === 'INPUT')) panels(); else E.sig = sig; }      // never rebuild under a slider or a text box that is being used
    E.liveEdit = false;
    const m = $('edMsg'); if (m && m.textContent !== (E.msg || (E.dirty ? 'UNSAVED CHANGES' : ''))) m.textContent = E.msg || (E.dirty ? 'UNSAVED CHANGES' : '');
    E.raf = requestAnimationFrame(loop);
  }
  E.show = () => {
    build(); refreshSlots();
    if (!E.d) loadDraft(E.slots.length ? E.slots[0] : blankDraft(), !!E.slots.length);
    E.sig = ''; E.ui = true;
    if (!E.raf) { E.on = true; E.raf = requestAnimationFrame(loop); }
  };

  // ------------------------------------------------------------- wiring: the Drills card, the screen, coming back from a test
  if (App && App.actions) {
    const A = App.actions, back = A['drills-back'], quit = A.quit, quitMenu = A['quit-menu'];
    A.editor = () => { App.mode = 'drill'; App.fromEditor = false; App.show('editor'); };
    A['drills-back-ed'] = () => App.show('drills');
    // after a TEST: CHANGE DRILL / CHANGE PLAYERS go back to the editor, MAIN MENU leaves it
    A['drills-back'] = () => { if (App.fromEditor) { App.paused = false; App.show('editor'); } else back(); };
    A.quit = () => { if (App.fromEditor && App.mode === 'drill' && App.drill === 'custom') { App.paused = false; App.show('editor'); } else quit(); };
    A['quit-menu'] = () => { App.fromEditor = false; quitMenu(); };
    const om = ISO.Meta && ISO.Meta.onShow;
    if (ISO.Meta) ISO.Meta.onShow = (s) => { if (om) om(s); if (s === 'editor') E.show(); };
    // leaving to any other drill (the Drills hub cards) clears the editor flag
    for (const id of ['arena', 'penalty', 'target', 'chip', 'freekick', 'oneonone', 'longshot', 'finesse', 'power']) { const f = A['drill-' + id]; if (f) A['drill-' + id] = () => { App.fromEditor = false; f(); }; }
  }
})();
