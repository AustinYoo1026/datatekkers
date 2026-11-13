/* ISO FOOTBALL 3D — stadium: pitch + markings, goal frame + deformable net, ad boards, stands + crowd, roof, floodlights,
   trees, sky dome, fog and the light rig. Built once per match from the 2D map theme (ISO.Render.theme()); never reads the sim.
   ISO.R3D.Stadium.build(THREE, theme, dims, { walls, quality, id }) -> { group, update(dt, t), netHit(wx, wy, wz, speed),
     setTargets(list, lit), sun, hemi, cheer(k), fog, background, applyTo(scene), colliders, kind, night, dispose() }
   THREE is only touched inside build() (three.js loads lazily). World space: metres, goal line at z = 0, play at z > 0. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rng = (seed) => { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

  // ---------------------------------------------------------------- colours (CSS strings from the 2D themes, incl. rgba)
  function parse(str) {
    if (str && typeof str === 'object') return str;
    str = String(str || '#888888').trim();
    if (str[0] === '#') {
      let h = str.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16) || 0;
      return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (m) { const p = m[1].split(',').map(parseFloat); return { r: (p[0] || 0) / 255, g: (p[1] || 0) / 255, b: (p[2] || 0) / 255, a: p.length > 3 ? p[3] : 1 }; }
    return { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  }
  const mixc = (a, b, t) => { a = parse(a); b = parse(b); return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t }; };
  const scl = (a, k) => { a = parse(a); return { r: clamp(a.r * k, 0, 1), g: clamp(a.g * k, 0, 1), b: clamp(a.b * k, 0, 1), a: a.a }; };
  const css = (c, a) => { c = parse(c); return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + (a == null ? c.a : a) + ')'; };
  const lum = (c) => { c = parse(c); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

  // ---------------------------------------------------------------- per-map flavour (palette-driven; unknown ids fall back to heuristics)
  const FLAV = {
    stadium: { sky: ['#02050a', '#18222f'], night: 1, tree: 'pine', sunDir: [-50, 62], crowd: 1, roof: 'full', flags: 24, tifo: 1, flash: 1, wave: 1 },
    street: { sky: ['#04060a', '#252a36'], night: 1, tree: 'round', treeCol: '#2a4a2a', city: 1, sunDir: [-30, 62], crowd: 0.8, led: 1, flash: 1 },
    beach: { sky: ['#2a78cc', '#cfeaf6'], night: 0, sun: '#fff3dc', tree: 'palm', sea: '#1d6fa5', clouds: 1, sunDir: [20, 56], crowd: 0.85, flags: 12, wave: 1 },
    snow: { sky: ['#0b1424', '#44566e'], night: 1, tree: 'pine', snowy: 1, weather: 'snow', sunDir: [-60, 62], crowd: 0.8, roof: 'full', flags: 16, tifo: 1, flash: 1, wave: 1 },
    neon: { sky: ['#030209', '#2c1454'], night: 1, tree: 'pine', treeCol: '#241a47', city: 1, sunDir: [-40, 62], crowd: 0.9, roof: 'full', led: 1, flash: 1, wave: 1 },
    sunset: { sky: ['#272a5c', '#ff9a52'], night: 0, dusk: 1, sun: '#ffb070', tree: 'round', treeCol: '#4a5a24', clouds: 1, sunDir: [160, 24], crowd: 0.7, roof: 'none', flags: 12 },
    monsoon: { sky: ['#03070c', '#1c2a36'], night: 1, tree: 'round', treeCol: '#1a3a26', weather: 'rain', sunDir: [-50, 62], crowd: 0.6, roof: 'full', flash: 1 },
    jungle: { sky: ['#3d7aa0', '#d4ead2'], night: 0, sun: '#fff0d0', tree: 'palm', sea: '#2a6a5a', ground: '#173f1f', clouds: 1, sunDir: [35, 58], crowd: 0.5, flags: 8 },
    moon: { sky: ['#000000', '#0b0d16'], night: 1, tree: 'rock', earth: 1, ground: '#3a3d44', sunDir: [-110, 62], crowd: 0.25, roof: 'none' },
    desert: { sky: ['#3f7fc6', '#f6d6a0'], night: 0, sun: '#fff0c8', tree: 'palm', dunes: 1, sea: null, ground: '#c98a42', sunDir: [-20, 60], crowd: 0.4, flags: 8 },
    retro: { sky: ['#000000', '#002a0c'], night: 1, tree: 'pine', treeCol: '#00aa3a', sunDir: [-50, 62], crowd: 0.5, roof: 'full', led: 1, flash: 1 },
    sakura: { sky: ['#2c2148', '#f2aac6'], night: 0, dusk: 1, sun: '#ffd8e0', tree: 'round', treeCol: '#f5b8d0', weather: 'petals', clouds: 1, sunDir: [-140, 24], crowd: 0.7, roof: 'none', flags: 12, wave: 1 },
    dock: { sky: ['#04070b', '#232d3a'], night: 1, tree: 'none', city: 1, dock: 1, sunDir: [-70, 62], crowd: 0.5, flash: 1 },
    gold: { sky: ['#050301', '#3a2a0a'], night: 1, tree: 'pine', sunDir: [-50, 62], crowd: 1, roof: 'full', flags: 24, tifo: 1, flash: 1, wave: 1 },
    mud: { sky: ['#24221e', '#6a6252'], night: 0, dusk: 1, sun: '#e8dcc8', tree: 'round', treeCol: '#3a3a22', clouds: 1, sunDir: [125, 24], crowd: 0.35, roof: 'none', flags: 6 },
    fs_wood: { indoor: 1, wood: 1, crowd: 0.7, flags: 8, wave: 1 }, fs_blue: { indoor: 1, crowd: 0.7, led: 1, wave: 1 }, fs_red: { indoor: 1, crowd: 0.9, flags: 12, wave: 1 },
    fs_glass: { indoor: 1, glass: 1, crowd: 0.6, led: 1 },
    fs_roof: { sky: ['#030712', '#28344e'], night: 1, city: 1, rooftop: 1, sunDir: [-50, 62], crowd: 0.5, flash: 1 },
  };
  // Phase 6.3 row fields (all optional): sunDir [azimuth, elevation] degrees (the light sits at that bearing from the pitch, 0 = beyond the far end,
  // 180 = behind the goal; elevation 22..90: day 55, dusk 24, night 62), crowd 0.25..1 (density of the instanced fans and of the seat painting),
  // roof 'full' | 'none' (cantilever roof on the big stands), flags n <= 24 (waving flags), tifo (banner hung under the roof, kit colours),
  // flash (camera flashes on a goal, night maps), led (scrolling ad boards), wave (the sections of the crowd sway out of step).
  const DEF_THEME = { bg: '#0c1016', around: 'crowd', crowd: ['#3a4658', '#566377', '#7a2f3a'], wall: '#131a22', base: '#2c7a3d',
    bands: ['#2a7a3c', '#2f8443'], line: 'rgba(255,255,255,.86)', mark: 'rgba(255,230,120,.9)', net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.28,
    ads: [['ISO FOOTBALL', '#0f1a14', '#35e08a'], ['DATATEKKERS', '#132033', '#7fc4ff']] };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function normTheme(t) {
    const o = Object.assign({}, DEF_THEME, t || {});
    if (!Array.isArray(o.bands) || o.bands.length < 2) o.bands = [o.base, o.base];
    if (!Array.isArray(o.crowd) || !o.crowd.length) o.crowd = DEF_THEME.crowd;
    if (!Array.isArray(o.ads) || !o.ads.length) o.ads = DEF_THEME.ads;
    return o;
  }
  function resolveId(theme, opts) {
    if (opts.id || opts.mapId) return opts.id || opts.mapId;
    const R = ISO.Render;
    try { if (R && R.theme && R.mapId && R.theme() === theme) return R.mapId(); } catch (e) { /* older render.js */ }
    const name = theme && theme.ads && theme.ads[0] && theme.ads[0][0], m = ISO.MAPS && ISO.MAPS.find((x) => x.name === name);
    return m ? m.id : null;
  }
  function flavour(id, th) {
    const f = Object.assign({}, FLAV[id] || {});
    const bg = parse(th.bg);
    if (!has(f, 'night')) f.night = lum(bg) < 0.12 ? 1 : 0;
    if (!f.sky) f.sky = f.night ? [css(scl(bg, 0.35), 1), css(mixc(bg, th.crowd[0], 0.5), 1)] : ['#3d7fc4', '#cfe3ee'];
    if (!f.tree) f.tree = th.around === 'beach' ? 'palm' : 'pine';
    if (!has(f, 'weather')) f.weather = th.snow ? 'snow' : null;
    if (!has(f, 'sea')) f.sea = th.around === 'beach' ? '#1d6fa5' : null;
    return f;
  }

  // ---------------------------------------------------------------- canvases
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const FONT = '"Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
  // Pitch plane: 70 m wide, x in [-35, 35], z in [-18, 42 + back]; `back` is the extra playable depth behind the old far edge.
  // Canvas top row = z = -18 (texture flipY).
  const PX0 = -35, PZ0 = -18, PW = 70, PH0 = 60;
  function paintPitch(th, fl, D, size, futsal, turf) {
    const BK = D.back || 0, PH = PH0 + BK, DEPA = D.depth + BK;
    const cv = canvas(size, size), c = cv.getContext('2d'), R = rng(7);
    const sx = size / PW, sz = size / PH;
    c.setTransform(sx, 0, 0, sz, -PX0 * sx, -PZ0 * sz);       // draw in world metres (x, z)
    const HX = D.half, DEP = D.depth, C = ISO.C || {}, S = D.S;
    c.fillStyle = th.base; c.fillRect(PX0, PZ0, PW, PH);
    // mowing bands every 2.5 m, parallel to the goal line (a boundary on the line itself)
    for (let z = Math.floor(PZ0 / 2.5) * 2.5; z < PZ0 + PH; z += 2.5) {
      const i = Math.round(z / 2.5); c.fillStyle = th.bands[((i % 2) + 2) % 2]; c.fillRect(PX0, z, PW, 2.52);
    }
    if (fl.wood) {        // parquet: plank seams and per-plank tint
      for (let x = PX0; x < PX0 + PW; x += 0.3) {
        for (let z = PZ0 + R() * 3; z < PZ0 + PH; z += 2 + R() * 3) { c.fillStyle = R() < 0.5 ? 'rgba(255,240,210,.05)' : 'rgba(60,30,0,.07)'; c.fillRect(x, z, 0.3, 2 + R() * 2); }
        c.fillStyle = 'rgba(40,20,0,.16)'; c.fillRect(x, PZ0, 0.025, PH);
      }
    } else if (!futsal) {  // cross-cut: faint lengthways stripes every 5 m
      for (let x = -HX - 25; x < 40; x += 10) { c.fillStyle = 'rgba(255,255,255,.028)'; c.fillRect(x, PZ0, 5, PH); }
    }
    // pitch type (3D only: the 2D view keeps its text label): lush = darker with stronger stripes, firm = paler and worn, astro = flat with crumb
    if (!futsal && turf === 'lush') {
      c.fillStyle = 'rgba(0,28,6,.16)'; c.fillRect(PX0, PZ0, PW, PH);
      for (let z = Math.floor(PZ0 / 2.5) * 2.5; z < PZ0 + PH; z += 5) { c.fillStyle = 'rgba(0,40,8,.13)'; c.fillRect(PX0, z, PW, 2.52); c.fillStyle = 'rgba(200,255,170,.045)'; c.fillRect(PX0, z + 2.5, PW, 2.52); }
    } else if (!futsal && turf === 'firm') {
      c.fillStyle = 'rgba(214,196,120,.2)'; c.fillRect(PX0, PZ0, PW, PH);
    } else if (!futsal && turf === 'astro') {
      c.fillStyle = css(mixc(th.bands[0], th.bands[1], 0.5), 0.72); c.fillRect(PX0, PZ0, PW, PH);
      for (let i = 0, n = (size * size) / 90; i < n; i++) { c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.07)'; c.fillRect(PX0 + R() * PW, PZ0 + R() * PH, 0.06, 0.06); }
    }
    // grain
    for (let i = 0, n = (size * size) / 140; i < n; i++) {
      c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)';
      c.fillRect(PX0 + R() * PW, PZ0 + R() * PH, 0.05, fl.wood ? 0.05 : 0.17);
    }
    // goalmouth + spot wear on grass
    const grass = !futsal && th.around !== 'beach' && !fl.snowy && parse(th.base).g > parse(th.base).r && turf !== 'astro';
    if (grass) {
      const wk = turf === 'firm' ? 1.7 : turf === 'lush' ? 0.4 : 1;      // firm: a worn goal mouth, lush: hardly any wear
      const wear = (x, z, r, a) => { a *= wk; r *= turf === 'firm' ? 1.25 : 1; const g = c.createRadialGradient(x, z, 0, x, z, r); g.addColorStop(0, 'rgba(140,115,70,' + a + ')'); g.addColorStop(1, 'rgba(140,115,70,0)'); c.fillStyle = g; c.fillRect(x - r, z - r, 2 * r, 2 * r); };
      wear(0, 1.1, 3.4, 0.32); wear(0, D.penD, 1.0, 0.22); wear(0, 5.5, 5, 0.1);
    }
    if (fl.snowy) {        // drifts
      for (let i = 0; i < 90; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.1 + R() * 0.16) + ')'; c.beginPath(); c.ellipse(PX0 + R() * PW, PZ0 + R() * PH, 1 + R() * 3, 0.4 + R() * 0.8, 0, 0, TAU); c.fill(); }
    }
    // surround
    if (futsal) {
      c.fillStyle = css(mixc(th.base, th.wall, 0.55), 1);
      c.fillRect(PX0, PZ0, PW, -PZ0); c.fillRect(PX0, DEPA, PW, PZ0 + PH - DEPA);
      c.fillRect(PX0, 0, -PX0 - HX, DEPA); c.fillRect(HX, 0, PX0 + PW - HX, DEPA);
    } else {
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.fillRect(PX0, PZ0, PW, -3 - PZ0); c.fillRect(PX0, -3, -PX0 - HX - 2, PZ0 + PH + 3); c.fillRect(HX + 2, -3, PX0 + PW - HX - 2, PZ0 + PH + 3);
    }
    const vg = c.createRadialGradient(0, 8, 12, 0, 8, 46);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + clamp((th.vig || 0.25) * 0.7, 0, 0.6) + ')');
    c.fillStyle = vg; c.fillRect(PX0, PZ0, PW, PH);
    // net shadow on the ground inside the goal
    c.fillStyle = th.net; c.fillRect(-D.goalW / 2, -D.goalD, D.goalW, D.goalD);
    // markings, all from ISO.C via dims
    c.save();
    if (th.glow) { c.shadowColor = th.glow; c.shadowBlur = size / 140; }
    c.strokeStyle = th.line; c.fillStyle = th.line; c.lineWidth = 0.13; c.lineJoin = 'miter'; c.lineCap = 'butt';
    const far = PZ0 + PH, half = 30.2 + BK, CR = (C.CR || 100) * S;
    c.beginPath();
    c.moveTo(-HX, 0); c.lineTo(HX, 0);                                   // goal line
    c.moveTo(-HX, 0); c.lineTo(-HX, far); c.moveTo(HX, 0); c.lineTo(HX, far);   // touchlines (run on through the far half)
    c.moveTo(-HX, half); c.lineTo(HX, half);                               // decorative halfway line
    c.rect(-D.boxHalf, 0, D.boxHalf * 2, D.boxD);                         // 18-yard box
    c.rect(-D.sixHalf, 0, D.sixHalf * 2, D.sixD);                         // six-yard box
    c.stroke();
    const da = Math.acos(clamp((D.boxD - D.penD) / CR, -1, 1));           // the D
    c.beginPath(); c.arc(0, D.penD, CR, Math.PI / 2 - da, Math.PI / 2 + da); c.stroke();
    const cr = 11 * S;                                                    // corner arcs
    c.beginPath(); c.arc(-HX, 0, cr, 0, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(HX, 0, cr, Math.PI / 2, Math.PI); c.stroke();
    c.beginPath(); c.arc(0, half, CR * 1.06, 0, TAU); c.stroke();           // centre circle
    c.beginPath(); c.arc(0, D.penD, 0.12, 0, TAU); c.fill();                // penalty spot
    c.beginPath(); c.arc(0, half, 0.14, 0, TAU); c.fill();                  // centre spot
    // the back line (the end of the playable pitch, at the back board) and the start spot, in `mark`
    c.strokeStyle = th.mark; c.fillStyle = th.mark;
    c.beginPath(); c.moveTo(-HX, DEPA - 0.07); c.lineTo(HX, DEPA - 0.07); c.stroke();
    const sz0 = ISO.SPOTX != null ? (D.FW - ISO.SPOTX) * S : 14.75;
    c.lineWidth = 0.1; c.setLineDash([0.25, 0.25]); c.beginPath(); c.moveTo(-2, sz0); c.lineTo(2, sz0); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(0, sz0, 0.175, 0, TAU); c.fill();
    c.restore();
    return cv;
  }
  // seated crowd: 4 rows of 128 px, each row = one tier. Bottom 40% of a row maps onto the riser (torsos + heads of the row
  // in front), the top 60% onto the tread (laps, seats). 1024 px = 16 m of seating.
  function paintCrowd(th, fl) {
    const dens = fl.crowd == null ? 1 : clamp(fl.crowd, 0.25, 1);
    const cv = canvas(1024, 512), c = cv.getContext('2d'), R = rng(11), cols = th.crowd;
    const seat = mixc(th.wall, th.bg, 0.4), skins = ['#f1c9a5', '#d9a07a', '#a8714a', '#6e4a32', '#e8b896'];
    c.fillStyle = css(seat, 1); c.fillRect(0, 0, 1024, 512);
    for (let r = 0; r < 4; r++) {
      const top = r * 128, bot = top + 128, rs = bot - 51;
      const g = c.createLinearGradient(0, top, 0, rs); g.addColorStop(0, css(scl(seat, 0.55), 1)); g.addColorStop(1, css(scl(seat, 1.15), 1));
      c.fillStyle = g; c.fillRect(0, top, 1024, rs - top);
      c.fillStyle = css(scl(seat, 0.7), 1); c.fillRect(0, rs, 1024, bot - rs);
      for (let x = 0; x < 1024; x += 35) { c.fillStyle = css(scl(seat, 1.35), 1); c.fillRect(x + 4, top + 14, 27, 16); }   // seat backs
      // banners every so often
      if (R() < 0.8) { const bx = R() * 900, bw = 90 + R() * 120, a = cols[(R() * cols.length) | 0], b = cols[(R() * cols.length) | 0];
        c.fillStyle = a; c.fillRect(bx, rs + 4, bw, 44); c.fillStyle = b; c.fillRect(bx, rs + 18, bw, 12); }
      for (let x = R() * 12; x < 1024 + 30; x += 29 + R() * 9) {
        if (R() < 0.1 + (1 - dens) * 0.6) continue;     // empty seats: a thin crowd leaves more of them
        const col = cols[(R() * cols.length) | 0];
        c.fillStyle = css(scl(col, 0.55), 1); c.fillRect(x - 11, top + 30 + R() * 10, 22, rs - top - 34);       // lap / legs
        c.fillStyle = col; c.beginPath(); c.moveTo(x - 13, bot); c.lineTo(x - 12, rs + 14); c.quadraticCurveTo(x, rs + 6, x + 12, rs + 14); c.lineTo(x + 13, bot); c.fill();
        if (R() < 0.18) { c.strokeStyle = col; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 10, rs + 16); c.lineTo(x - 15, rs - 18); c.moveTo(x + 10, rs + 16); c.lineTo(x + 15, rs - 18); c.stroke(); }
        if (R() < 0.25) { c.fillStyle = cols[(R() * cols.length) | 0]; c.fillRect(x - 12, rs + 15, 24, 5); }      // scarf
        c.fillStyle = skins[(R() * 5) | 0]; c.beginPath(); c.arc(x, rs + 4, 8.5, 0, TAU); c.fill();
        c.fillStyle = R() < 0.3 ? cols[(R() * cols.length) | 0] : '#1c1612'; c.beginPath(); c.arc(x, rs + 2, 8.8, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, bot - 6, 1024, 6);
    }
    return cv;
  }
  // instanced fans: 8 cells of 64 x 128 (head + torso, some arms up)
  function paintFigures(th) {
    const cv = canvas(512, 128), c = cv.getContext('2d'), cols = th.crowd;
    const skins = ['#f1c9a5', '#d9a07a', '#a8714a', '#6e4a32', '#e8b896'], hair = ['#1a1410', '#3a2414', '#6a4a2a', '#111111', '#c8a060'];
    c.clearRect(0, 0, 512, 128);
    for (let i = 0; i < 8; i++) {
      const x = i * 64 + 32, shirt = cols[(i * 3) % cols.length], sk = skins[i % 5], up = i >= 5;
      c.fillStyle = shirt; c.beginPath(); c.moveTo(x - 19, 128); c.lineTo(x - 17, 62); c.quadraticCurveTo(x - 16, 52, x - 6, 50);
      c.lineTo(x + 6, 50); c.quadraticCurveTo(x + 16, 52, x + 17, 62); c.lineTo(x + 19, 128); c.closePath(); c.fill();
      c.lineWidth = 9; c.lineCap = 'round'; c.strokeStyle = shirt; c.beginPath();
      if (up) { c.moveTo(x - 14, 58); c.lineTo(x - 23, 22); c.moveTo(x + 14, 58); c.lineTo(x + 23, 20); }
      else { c.moveTo(x - 16, 60); c.lineTo(x - 21, 104); c.moveTo(x + 16, 60); c.lineTo(x + 21, 104); }
      c.stroke();
      c.fillStyle = sk;
      if (up) { c.beginPath(); c.arc(x - 23, 17, 5, 0, TAU); c.arc(x + 23, 15, 5, 0, TAU); c.fill(); }
      if (i % 3 === 0) { c.fillStyle = cols[(i + 1) % cols.length]; c.fillRect(x - 15, 52, 30, 8); }
      c.fillStyle = sk; c.fillRect(x - 4, 44, 8, 8); c.beginPath(); c.arc(x, 36, 12.5, 0, TAU); c.fill();
      c.fillStyle = hair[i % 5]; c.beginPath(); c.arc(x, 33, 13, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      const g = c.createLinearGradient(0, 70, 0, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(x - 32, 60, 64, 68); c.globalCompositeOperation = 'source-over';
    }
    return cv;
  }
  // LED ad strip atlas: one 1024 x 128 row per ad, plus a dark last row for the board backs/tops
  function paintAds(th, tifo) {
    const ads = th.ads.slice(0, 7), rows = ads.length + 1 + (tifo ? 1 : 0), cv = canvas(1024, 128 * rows), c = cv.getContext('2d');
    ads.forEach((a, i) => {
      const y = i * 128;
      c.fillStyle = a[1]; c.fillRect(0, y, 1024, 128);
      let px = 82; c.font = '800 ' + px + 'px ' + FONT;
      const w = c.measureText(a[0]).width; if (w > 940) { px = Math.floor(px * 940 / w); c.font = '800 ' + px + 'px ' + FONT; }
      c.fillStyle = a[2]; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(a[0], 512, y + 68);
      c.fillStyle = 'rgba(0,0,0,.12)'; for (let s = 0; s < 128; s += 4) c.fillRect(0, y + s, 1024, 1);   // LED scanlines
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, y, 1024, 5); c.fillRect(0, y + 123, 1024, 5);
    });
    const dy = ads.length * 128;
    c.fillStyle = css(scl(th.wall, 0.8), 1); c.fillRect(0, dy, 1024, 128);
    if (tifo) {          // the supporters' banner: diagonal bands in the home colours, one extra 1024 x 128 row under the dark one
      const y = dy + 128; c.fillStyle = tifo[0]; c.fillRect(0, y, 1024, 128); c.fillStyle = tifo[1];
      for (let x = -128; x < 1088; x += 128) { c.beginPath(); c.moveTo(x, y + 128); c.lineTo(x + 64, y + 128); c.lineTo(x + 128, y); c.lineTo(x + 64, y); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y, 1024, 8); c.fillRect(0, y + 120, 1024, 8);
    }
    return { cv, rows, tifo: !!tifo };
  }
  function paintNet() {
    const cv = canvas(128, 128), c = cv.getContext('2d');
    c.clearRect(0, 0, 128, 128); c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i < 4; i++) { const p = i * 32 + 16; c.moveTo(p, 0); c.lineTo(p, 128); c.moveTo(0, p); c.lineTo(128, p); }
    c.stroke(); return cv;
  }
  function paintBricks(th) {
    const cv = canvas(512, 256), c = cv.getContext('2d'), R = rng(3), cols = th.crowd;
    c.fillStyle = css(scl(th.wall, 0.8), 1); c.fillRect(0, 0, 512, 256);
    for (let y = 0, r = 0; y < 256; y += 16, r++) for (let x = -(r % 2) * 24; x < 512; x += 48) {
      c.fillStyle = cols[(R() * cols.length) | 0]; c.globalAlpha = 0.75 + R() * 0.25; c.fillRect(x + 2, y + 2, 44, 12);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {        // tags
      c.strokeStyle = ['#ffd23d', '#f1735f', '#3df5ff', '#35e08a', '#ff3dd0', '#f4f4f4'][(R() * 6) | 0]; c.lineWidth = 6 + R() * 8; c.lineCap = 'round'; c.globalAlpha = 0.8;
      const x = R() * 420, y = 70 + R() * 120; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 5; k++) c.quadraticCurveTo(x + k * 18 + R() * 30, y - 40 + R() * 80, x + (k + 1) * 20, y + R() * 30 - 15);
      c.stroke();
    }
    c.globalAlpha = 1;
    const g = c.createLinearGradient(0, 160, 0, 256); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = g; c.fillRect(0, 0, 512, 256);
    return cv;
  }
  function paintFence() {
    const cv = canvas(64, 64), c = cv.getContext('2d');
    c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(205,215,228,.9)'; c.lineWidth = 2; c.beginPath();
    for (let i = -64; i <= 64; i += 32) { c.moveTo(i, 0); c.lineTo(i + 64, 64); c.moveTo(i + 64, 0); c.lineTo(i, 64); }
    c.stroke(); return cv;
  }
  function paintStopNet() {   // one square of a fine knotted mesh; mipmaps average it to an even haze at range
    const cv = canvas(64, 64), c = cv.getContext('2d');
    c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 3; c.beginPath();
    c.moveTo(32, 0); c.lineTo(32, 64); c.moveTo(0, 32); c.lineTo(64, 32); c.stroke(); return cv;
  }
  function paintWindows(night) {
    const a = canvas(256, 256), e = canvas(256, 256), c = a.getContext('2d'), ce = e.getContext('2d'), R = rng(21);
    c.fillStyle = '#9aa0aa'; c.fillRect(0, 0, 256, 256); ce.fillStyle = '#000000'; ce.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row++) for (let col = 0; col < 8; col++) {
      if (row === 0 && col === 0) continue;     // the corner stays plain: rooftops sample it
      const x = col * 32 + 6, y = row * 16 + 4, lit = night && R() < 0.38;
      c.fillStyle = lit ? '#e8d8a0' : R() < 0.5 ? '#3a4452' : '#4a5462'; c.fillRect(x, y, 20, 9);
      if (lit) { ce.fillStyle = R() < 0.7 ? '#ffd890' : '#bfe0ff'; ce.fillRect(x, y, 20, 9); }
    }
    return { map: a, emi: e };
  }
  function paintSea() {
    const cv = canvas(256, 256), c = cv.getContext('2d'), R = rng(9);
    c.fillStyle = '#c8d8e0'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(0,30,60,.12)'; c.fillRect(R() * 256, R() * 256, 6 + R() * 30, 2); }
    return cv;
  }
  function paintGlow() {
    const cv = canvas(64, 64), c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); return cv;
  }
  function paintEarth() {
    const cv = canvas(256, 128), c = cv.getContext('2d'), R = rng(4);
    c.fillStyle = '#1f5fa8'; c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) { c.fillStyle = R() < 0.6 ? '#3f8a4a' : '#9a8a5a'; c.beginPath(); c.ellipse(R() * 256, 20 + R() * 88, 8 + R() * 22, 5 + R() * 14, R() * 3, 0, TAU); c.fill(); }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(R() * 256, R() * 128, 6 + R() * 20, 2 + R() * 4, 0, 0, TAU); c.fill(); }
    return cv;
  }

  // ---------------------------------------------------------------- geometry builder (merged meshes -> few draw calls)
  function Builder() { this.p = []; this.n = []; this.u = []; this.c = []; this.ix = []; this.nv = 0; }
  Builder.prototype.vert = function (x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(col[0], col[1], col[2]); return this.nv++;
  };
  // a, b, c, d = bottom-left, bottom-right, top-right, top-left seen from the front; uv = [u0, v0, u1, v1]
  Builder.prototype.quad = function (a, b, c, d, uv, col) {
    col = col || WHITE; uv = uv || ZUV;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i = this.nv;
    this.vert(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], col); this.vert(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[1], col);
    this.vert(c[0], c[1], c[2], nx, ny, nz, uv[2], uv[3], col); this.vert(d[0], d[1], d[2], nx, ny, nz, uv[0], uv[3], col);
    this.ix.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  // merge a THREE geometry (consumed + disposed). col: [r,g,b] or (x, y, z) => [r,g,b]
  Builder.prototype.geo = function (g, m4, col) {
    if (m4) g.applyMatrix4(m4);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, base = this.nv, f = typeof col === 'function';
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      this.vert(x, y, z, N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0, U ? U.getX(i) : 0, U ? U.getY(i) : 0, f ? col(x, y, z) : col || WHITE);
    }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) this.ix.push(a[i] + base); }
    else for (let i = 0; i < P.count; i++) this.ix.push(base + i);
    g.dispose();
  };
  Builder.prototype.build = function (THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
    g.computeBoundingSphere();
    return g;
  };
  const WHITE = [1, 1, 1], ZUV = [0, 0, 0, 0];
  // local frame on the ground: along = a (the viewer's right when facing away from the pitch), out = away from the pitch
  const frame = (ox, oz, ax, az) => (al, out, h) => [ox + ax * al + az * out, h, oz + az * al - ax * out];
  const WF = frame(0, 0, 1, 0);       // world: P(x, -z, y)
  function lbox(B, P, a0, a1, o0, o1, h0, h1, col, uvF, uvR) {
    B.quad(P(a0, o0, h0), P(a1, o0, h0), P(a1, o0, h1), P(a0, o0, h1), uvF, col);
    B.quad(P(a1, o1, h0), P(a0, o1, h0), P(a0, o1, h1), P(a1, o1, h1), uvR, col);
    B.quad(P(a0, o0, h1), P(a1, o0, h1), P(a1, o1, h1), P(a0, o1, h1), uvR, col);
    B.quad(P(a0, o1, h0), P(a0, o0, h0), P(a0, o0, h1), P(a0, o1, h1), uvR, col);
    B.quad(P(a1, o0, h0), P(a1, o1, h0), P(a1, o1, h1), P(a1, o0, h1), uvR, col);
  }
  const wbox = (B, x0, x1, y0, y1, z0, z1, col, uvF, uvR) => lbox(B, WF, x0, x1, -z1, -z0, y0, y1, col, uvF, uvR);

  // ---------------------------------------------------------------- build
  function build(THREE, theme, dims, opts) {
    opts = opts || {};
    const D = dims || R3D.K, q = clamp(opts.quality | 0, 0, 2);
    const th = normTheme(theme), id = resolveId(theme || {}, opts), fl = flavour(id, th);
    const futsal = !!(th.cage || opts.walls), around = th.around;
    if (!futsal && around !== 'crowd' && around !== 'bricks' && around !== 'beach' && !build.warned) { build.warned = 1; console.warn('[stadium] unmapped around "' + around + '": using stands'); }
    const kind = futsal ? (around === 'bricks' || fl.rooftop ? 'rooftop' : 'hall') : around === 'bricks' ? 'bricks' : around === 'beach' ? 'beach' : 'crowd';
    const indoor = kind === 'hall', night = indoor ? 1 : fl.night;
    const BK = D.back || 0, HX = D.half, DEP = D.depth, DEPA = DEP + BK, W2 = D.goalW / 2, GH = D.goalH, GDp = D.goalD, PR = D.postR || 0.06;
    const R = rng(1234);
    const roofFull = fl.roof ? fl.roof === 'full' : true;                       // 'none' drops the cantilever roof of the big stands
    const kc = opts.kitCols && opts.kitCols.length > 1 ? opts.kitCols : [th.crowd[Math.min(3, th.crowd.length - 1)], th.crowd[Math.min(1, th.crowd.length - 1)]];
    const tifoOn = !!fl.tifo && kind === 'crowd' && roofFull;

    const keep = { geo: [], mat: [], tex: [] };
    const G = (g) => (keep.geo.push(g), g), M = (m) => (keep.mat.push(m), m);
    const group = new THREE.Group(); group.name = 'stadium';
    const add = (o, name) => { o.name = name; group.add(o); return o; };
    const color = (s) => { const p = parse(s); return new THREE.Color().setRGB(p.r, p.g, p.b, THREE.SRGBColorSpace); };
    const lin = (s, k) => { const c = color(s); if (k != null) c.multiplyScalar(k); return [c.r, c.g, c.b]; };
    const tex = (cv, o) => {
      o = o || {}; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.aniso || 4;
      if (o.ws) t.wrapS = THREE.RepeatWrapping; if (o.wt) t.wrapT = THREE.RepeatWrapping; keep.tex.push(t); return t;
    };
    const U = { uT: { value: 0 }, uJump: { value: 0 } };

    // palette
    const skyTop = fl.sky[0], skyHor = fl.sky[1];
    const cConc = lin(mixc(th.wall, '#8a9099', 0.45)), cWallFront = lin(mixc(th.wall, '#5a6068', 0.3)), cDark = lin(scl(th.bg, 0.7));
    const cRoofTop = lin(mixc(th.wall, '#a0a6ae', 0.5)), cRoofUnder = lin(scl(mixc(th.wall, th.bg, 0.5), 0.8)), cSteel = lin('#7d848e');
    const lampCol = night ? lin('#fff6e0') : lin('#9aa0a8');

    // ---- pitch
    const pitchTex = tex(paintPitch(th, fl, D, q >= 2 ? 1024 : 2048, futsal, opts.turf), { aniso: 16 });
    const PH = PH0 + BK;
    const pg = G(new THREE.PlaneGeometry(PW, PH)); pg.rotateX(-Math.PI / 2); pg.translate(PX0 + PW / 2, 0, PZ0 + PH / 2);
    const pitch = add(new THREE.Mesh(pg, M(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: fl.wood ? 0.55 : fl.glass ? 0.45 : 0.93, metalness: 0 }))), 'pitch');
    pitch.receiveShadow = true;
    // ---- surrounding ground
    if (!indoor) {
      const gcol = fl.ground || (kind === 'bricks' ? css(scl(th.wall, 1.25), 1) : kind === 'rooftop' ? '#14181e' : css(scl(th.base, 0.55), 1));
      const gg = G(new THREE.PlaneGeometry(900, 900)); gg.rotateX(-Math.PI / 2);
      const ground = add(new THREE.Mesh(gg, M(new THREE.MeshLambertMaterial({ color: color(gcol) }))), 'ground');
      ground.position.y = kind === 'rooftop' ? -48 : -0.04;
    }

    const Bs = new Builder();          // structure (vertex colours, lit, double sided)
    const Bc = new Builder();          // seated crowd (crowd texture)
    const Bb = new Builder();          // ad boards / banners (LED, unlit)
    const Bl = new Builder();          // lamps, light strips (unlit)
    const Bg = new Builder();          // glass (transparent)
    const Bk = new Builder();          // brick walls
    const Bq = new Builder();          // ball-stop net (transparent)
    const Bbb = new Builder(), Bgb = new Builder(), BnS = new Builder(), BnL = new Builder();      // the back end's own meshes (low board, glass, lit / unlit rail + posts): they fade out when the chase camera stands behind them
    const Bf = new Builder();          // chain-link fence (transparent)
    const Bw = new Builder();          // buildings (window texture)
    const fans = [];                   // instanced spectators: x, y, z, yaw
    const flagSpots = [];              // flag candidates: x, y, z, yaw
    const glows = [], lamps = [];      // glow sprite points / point light positions
    const colliders = { backZ: DEPA, backH: futsal ? 1.2 : 0.6, boardZ: -3, boardX: HX + 2, boardH: 0.95, standZ: -5, standX: HX + 5, walls: futsal, wallH: 1.2 };

    // ---- goal frame: round posts + bar, back stanchions (one mesh, casts shadows)
    {
      const B = new Builder(), cPost = lin(th.post), cSup = lin(mixc(th.post, '#50565e', 0.35));
      const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), qt = new THREE.Quaternion(), dv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      const cyl = (r, x0, y0, z0, x1, y1, z1, seg, col, ext = 0.02) => {      // ext: end caps 2 cm beyond the ends, clear of the pitch and the net planes
        dv.set(x1 - x0, y1 - y0, z1 - z0); const len = dv.length() + 2 * ext; dv.normalize(); qt.setFromUnitVectors(up, dv);
        m.compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), qt, one);
        B.geo(new THREE.CylinderGeometry(r, r, len, seg, 1, false), m, col);
      };
      cyl(PR, -W2, 0, 0, -W2, GH + PR, 0, 20, cPost); cyl(PR, W2, 0, 0, W2, GH + PR, 0, 20, cPost);
      cyl(PR, -W2 - PR, GH, 0, W2 + PR, GH, 0, 20, cPost);
      const r2 = 0.03, zb = -GDp;
      for (const x of [-W2, W2]) { cyl(r2, x, GH, 0, x, GH, zb, 8, cSup); cyl(r2, x, 0, zb, x, GH, zb, 8, cSup); cyl(r2, x, r2, 0, x, r2, zb, 8, cSup); }
      cyl(r2, -W2, GH, zb, W2, GH, zb, 8, cSup); cyl(r2, -W2, r2, zb, W2, r2, zb, 8, cSup);
      const gm = M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }));
      if (th.glow) { gm.emissive = color(th.post); gm.emissiveIntensity = 0.6; }
      const goal = add(new THREE.Mesh(G(B.build(THREE)), gm), 'goalFrame'); goal.castShadow = true;
    }

    // ---- deformable net: back 17x11, sides 6x11, roof 17x6 vertices; edges pinned to the frame
    const net = (() => {
      const panels = [
        { o: [-W2, 0, -GDp], du: [D.goalW, 0, 0], dv: [0, GH, 0], n: [0, 0, -1], nu: 17, nv: 11, sag: 0.07 },
        { o: [-W2, 0, 0], du: [0, 0, -GDp], dv: [0, GH, 0], n: [-1, 0, 0], nu: 6, nv: 11, sag: 0.05 },
        { o: [W2, 0, -GDp], du: [0, 0, GDp], dv: [0, GH, 0], n: [1, 0, 0], nu: 6, nv: 11, sag: 0.05 },
        { o: [-W2, GH, 0], du: [D.goalW, 0, 0], dv: [0, 0, -GDp], n: [0, 1, 0], nu: 17, nv: 6, sag: -0.08 },
      ];
      let N = 0; for (const p of panels) N += p.nu * p.nv;
      const base = new Float32Array(N * 3), nrm = new Float32Array(N * 3), pos = new Float32Array(N * 3), uv = new Float32Array(N * 2);
      const d = new Float32Array(N), v = new Float32Array(N), pin = new Uint8Array(N), ix = [];
      let k = 0;
      for (const p of panels) {
        const k0 = k, lu = Math.hypot(...p.du), lv = Math.hypot(...p.dv);
        for (let j = 0; j < p.nv; j++) for (let i = 0; i < p.nu; i++, k++) {
          const s = i / (p.nu - 1), t = j / (p.nv - 1), sag = p.sag * Math.sin(Math.PI * s) * Math.sin(Math.PI * t);
          for (let c = 0; c < 3; c++) { base[k * 3 + c] = p.o[c] + p.du[c] * s + p.dv[c] * t + p.n[c] * sag; nrm[k * 3 + c] = p.n[c]; pos[k * 3 + c] = base[k * 3 + c]; }
          uv[k * 2] = (s * lu) / 0.56; uv[k * 2 + 1] = (t * lv) / 0.56;
          pin[k] = i === 0 || j === 0 || i === p.nu - 1 || j === p.nv - 1 ? 1 : 0;
          if (i < p.nu - 1 && j < p.nv - 1) { const a = k0 + j * p.nu + i; ix.push(a, a + 1, a + p.nu + 1, a, a + p.nu + 1, a + p.nu); }
        }
      }
      const g = G(new THREE.BufferGeometry());
      const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', pa); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(ix);
      g.computeBoundingSphere(); g.boundingSphere.radius += 1;
      const nt = tex(paintNet(), { ws: 1, wt: 1, aniso: 8 });
      const netCol = th.glow ? mixc(th.glow, '#ffffff', 0.4) : mixc(th.post, '#ffffff', 0.6);
      const mesh = add(new THREE.Mesh(g, M(new THREE.MeshBasicMaterial({ map: nt, color: color(netCol), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }))), 'net');
      mesh.renderOrder = 2;
      return { N, base, nrm, pos, d, v, pin, attr: pa, awake: false };
    })();
    const NET_W = TAU * 18, NET_Z = 0.35, NET_R = 1.2, NET_GAIN = 3.6;
    function stepNet(dt) {
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, w2 = NET_W * NET_W, c2 = 2 * NET_Z * NET_W, d = net.d, v = net.v, pin = net.pin;
      let md = 0, mv = 0;
      for (let s = 0; s < n; s++) for (let i = 0; i < net.N; i++) {
        if (pin[i]) continue;
        v[i] += (-w2 * d[i] - c2 * v[i]) * h; d[i] += v[i] * h;
        if (d[i] > 0.6) { d[i] = 0.6; if (v[i] > 0) v[i] = 0; } else if (d[i] < -0.2) { d[i] = -0.2; if (v[i] < 0) v[i] = 0; }
      }
      const P = net.pos, B = net.base, Nn = net.nrm;
      for (let i = 0; i < net.N; i++) {
        const di = d[i]; P[i * 3] = B[i * 3] + Nn[i * 3] * di; P[i * 3 + 1] = B[i * 3 + 1] + Nn[i * 3 + 1] * di; P[i * 3 + 2] = B[i * 3 + 2] + Nn[i * 3 + 2] * di;
        const ad = di < 0 ? -di : di, av = v[i] < 0 ? -v[i] : v[i]; if (ad > md) md = ad; if (av > mv) mv = av;
      }
      net.attr.needsUpdate = true;
      if (md < 1e-4 && mv < 1e-3) { d.fill(0); v.fill(0); P.set(B); net.awake = false; }
    }
    function netHit(wx, wy, wz, speed) {
      const B = net.base, d = net.d, v = net.v, sp = speed > 0 ? speed : 0; let peak = 0;
      for (let i = 0; i < net.N; i++) {
        const dx = B[i * 3] - wx, dy = B[i * 3 + 1] - wy, dz = B[i * 3 + 2] - wz, r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r >= NET_R) continue;
        if (!net.pin[i] && sp > 0) { const f = 1 - r / NET_R; v[i] += sp * NET_GAIN * f * f; if (v[i] > 90) v[i] = 90; }
        if (r < 0.7 && d[i] > peak) peak = d[i];
      }
      if (sp > 0) net.awake = true;
      return peak < 0.35 ? peak : 0.35;      // current bulge near the point (m), for pushing the drawn ball into it
    }

    // ---- ad boards (LED, unlit) behind the goal line and along both touchlines
    const ad = paintAds(th, tifoOn ? kc : null), adTex = tex(ad.cv, { aniso: 8, ws: fl.led ? 1 : 0 }), AR = ad.rows, nAds = AR - 1 - (tifoOn ? 1 : 0);
    const adUV = (i) => { const r = i % nAds, px = 0.6 / (128 * AR); return [0, 1 - (r + 1) / AR + px, 1, 1 - r / AR - px]; };
    const darkUV = [0.1, 1 - (nAds + 0.5) / AR, 0.9, 1 - (nAds + 0.5) / AR], tifoUV = [0, 1 - (nAds + 2) / AR + 0.6 / (128 * AR), 1, 1 - (nAds + 1) / AR - 0.6 / (128 * AR)];
    let adi = 0;
    const boardRun = (P, L, seg, h, t, B) => { const n = Math.max(1, Math.round(L / seg)), sl = L / n; for (let i = 0; i < n; i++) lbox(B || Bb, P, i * sl + 0.03, (i + 1) * sl - 0.03, 0, t, 0, h, WHITE, adUV(adi++), darkUV); };
    if (!futsal) {
      boardRun(frame(-HX - 2, -3, 1, 0), 2 * HX + 4, 8, 0.95, 0.12);
      boardRun(frame(-HX - 2, DEPA + 0.12, 0, -1), DEPA + 3.12, 7, 0.95, 0.12);
      boardRun(frame(HX + 2, -3, 0, 1), DEPA + 3.12, 7, 0.95, 0.12);
      boardRun(frame(HX + 2, DEPA, -1, 0), 2 * HX + 4, 8, 0.6, 0.12, Bbb);       // the low back board the ball bounces off
    } else {
      // futsal: 1.2 m boards on the playable boundary (goal mouth open); the near/far end is glass so it never hides the player
      const glass = !!fl.glass, cage = lin(th.cage || th.line);
      const run = (P, L, see, bk) => {      // bk: the back end (fades with the chase camera)
        if (glass || see) { (bk ? Bgb : Bg).quad(P(0, 0, 0), P(L, 0, 0), P(L, 0, 1.2), P(0, 0, 1.2), null, cage); }
        else boardRun(P, L, 8.5, 1.2, 0.1);
        (bk ? (glass ? BnL : BnS) : glass ? Bl : Bs).quad(P(0, -0.03, 1.2), P(L, -0.03, 1.2), P(L, -0.03, 1.28), P(0, -0.03, 1.28), null, cage);   // rail
        for (let al = 0; al <= L + 0.01; al += L / Math.max(1, Math.round(L / 2.5))) lbox(bk ? BnS : Bs, P, al - 0.03, al + 0.03, 0.12, 0.18, 0, 1.28, cage);   // posts, 2 cm clear of the boards' back faces
      };
      run(frame(-HX, DEPA, 0, -1), DEPA); run(frame(HX, 0, 0, 1), DEPA);
      run(frame(-HX, 0, 1, 0), HX - W2); run(frame(W2, 0, 1, 0), HX - W2);
      run(frame(HX, DEPA, -1, 0), 2 * HX, true, true);
      colliders.boardZ = 0; colliders.boardX = HX; colliders.boardH = 1.2;
    }

    // ---- stands: stepped tiers with the crowd texture, parapet, end caps, back wall, cantilever roof + light strip
    function stand(P, L, cfg) {
      const T = cfg.T, dep = cfg.dep, rise = cfg.rise, fh = cfg.fh, back = T * dep, top = fh + T * rise;
      lbox(Bs, P, 0, L, -0.22, -0.01, 0, fh + 0.1, cWallFront);
      for (let k = 0; k < T; k++) {
        const h0 = fh + k * rise, h1 = h0 + rise, o0 = k * dep, o1 = o0 + dep, r = k % 4, v0 = 1 - (r + 1) / 4, v1 = 1 - r / 4, vs = v0 + 0.1, u0 = R(), u1 = u0 + L / 16;
        Bc.quad(P(0, o0, h0), P(L, o0, h0), P(L, o0, h1), P(0, o0, h1), [u0, v0 + 0.003, u1, vs], WHITE);
        Bc.quad(P(0, o0, h1), P(L, o0, h1), P(L, o1, h1), P(0, o1, h1), [u0, vs, u1, v1 - 0.003], WHITE);
      }
      for (let al = 10; al < L - 4; al += 10) lbox(Bs, P, al, al + 1.1, 0.02, back, fh, fh + 0.06, cConc);     // aisles (front 2 cm behind the first riser: coplanar faces flicker)
      for (const a of [0, L]) Bs.quad(P(a, 0, 0), P(a, back, 0), P(a, back, top + 0.1), P(a, 0, fh + rise + 0.1), null, cConc);
      const hb = cfg.roof ? cfg.roofH + 0.9 : top + 1.4;
      Bs.quad(P(0, back, top), P(L, back, top), P(L, back, hb), P(0, back, hb), null, cDark);
      lbox(Bs, P, -0.3, L + 0.3, back + 0.06, back + 0.4, 0, hb, cConc);      // set back from the dark panel above the top tier: coplanar faces flicker
      if (cfg.roof) {
        const rf = -2.2, rh = cfg.roofH;
        Bs.quad(P(-0.3, rf, rh), P(L + 0.3, rf, rh), P(L + 0.3, back + 0.4, hb), P(-0.3, back + 0.4, hb), null, cRoofUnder);
        Bs.quad(P(-0.3, rf, rh + 0.5), P(L + 0.3, rf, rh + 0.5), P(L + 0.3, back + 0.4, hb + 0.5), P(-0.3, back + 0.4, hb + 0.5), null, cRoofTop);
        Bs.quad(P(-0.3, rf, rh), P(L + 0.3, rf, rh), P(L + 0.3, rf, rh + 0.5), P(-0.3, rf, rh + 0.5), null, cWallFront);
        Bl.quad(P(0.4, rf - 0.02, rh + 0.06), P(L - 0.4, rf - 0.02, rh + 0.06), P(L - 0.4, rf - 0.02, rh + 0.2), P(0.4, rf - 0.02, rh + 0.2), null, lampCol);
        for (let al = 4; al < L; al += 9) {         // cantilever masts + stays over the roof
          const mt = P(al, back * 0.55, hb + 3.6), fr = P(al, rf, rh + 0.5), bk = P(al, back + 0.3, hb + 0.5);
          strut(Bs, fr, mt, 0.07, cSteel); strut(Bs, bk, mt, 0.09, cSteel);
        }
      }
      if (cfg.roof && cfg.tifo) {          // the supporters' banner hangs under the front edge of the roof (the end stand only)
        const w = Math.min(26, L - 8), a0 = (L - w) / 2;
        Bb.quad(P(a0, -2.25, cfg.roofH - 3.2), P(a0 + w, -2.25, cfg.roofH - 3.2), P(a0 + w, -2.25, cfg.roofH - 0.05), P(a0, -2.25, cfg.roofH - 0.05), tifoUV, WHITE);
      }
      if (fl.flags && !(q >= 2)) for (let al = 4; al < L - 3; al += 5) {      // candidate flag spots on the upper rows
        const k = T - 2 - ((al / 5) | 0) % 3, o = k * dep + 0.5, h = fh + (k + 1) * rise, p = P(al + R() * 2, o, h); flagSpots.push(p[0], p[1], p[2], P.yaw);
      }
      if (cfg.fans) for (let k = 0; k < cfg.fans; k++) {
        const h = fh + (k + 1) * rise, o = k * dep + 0.32;
        for (let al = 0.5 + R() * 0.3; al < L - 0.4; al += 0.6 + R() * 0.12) { if (R() < 0.12) continue; const p = P(al, o, h); fans.push(p[0], p[1], p[2], P.yaw); }
      }
      return { back, top };
    }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
    function strut(B, a, b, r, col) {
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _d.length(); _d.normalize(); _q.setFromUnitVectors(_up, _d);
      _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _one); B.geo(new THREE.CylinderGeometry(r, r, len, 6, 1, true), _m, col);
    }
    const yawed = (P, ax, az) => { P.yaw = Math.atan2(-az, ax); return P; };   // fans face the pitch (-out)
    const FR = (ox, oz, ax, az) => yawed(frame(ox, oz, ax, az), ax, az);

    // ---- floodlight towers / poles
    function tower(x, z, h, big) {
      Bs.geo(new THREE.CylinderGeometry(big ? 0.35 : 0.16, big ? 0.65 : 0.24, h, 8, 1, true), _m.makeTranslation(x, h / 2, z), cSteel);
      const yaw = Math.atan2(-x, 8 - z), e = new THREE.Euler(0.38, yaw, 0, 'YXZ'); _q.setFromEuler(e);
      const hw = big ? 5.5 : 2.2, hh = big ? 3.2 : 1.1;
      _m.compose(_p.set(x, h + hh * 0.4, z), _q, _one); Bs.geo(new THREE.BoxGeometry(hw, hh, 0.45), _m, cSteel);
      const off = new THREE.Vector3(0, 0, 0.24).applyQuaternion(_q);
      _m.compose(_p.set(x + off.x, h + hh * 0.4 + off.y, z + off.z), _q, _one); Bl.geo(new THREE.PlaneGeometry(hw * 0.92, hh * 0.85), _m, lampCol);
      glows.push(x + off.x * 3, h + hh * 0.4 + off.y * 3, z + off.z * 3); lamps.push(x, h, z);
    }

    // ---------------------------------------------------------------- surround by kind
    let fanCap = 0;
    if (kind === 'crowd') {
      const cfg = { T: 10, dep: 0.85, rise: 0.55, fh: 1.3, roof: roofFull, roofH: 9.8, fans: 3 };
      stand(FR(-31, -5, 1, 0), 62, Object.assign({ tifo: tifoOn }, cfg));
      stand(FR(-HX - 5, 26 + BK, 0, -1), 30.6 + BK, cfg);
      stand(FR(HX + 5, -4.6, 0, 1), 30.6 + BK, cfg);
      for (const [x, z] of [[-34, -15], [34, -15], [-34, 33 + BK], [34, 33 + BK]]) tower(x, z, 30, true);
      colliders.standZ = -5; colliders.standX = HX + 5;
    } else if (kind === 'beach') {
      const cfg = { T: 5, dep: 0.8, rise: 0.45, fh: 0.7, roof: false, fans: 2 };
      stand(FR(-HX - 4, 22 + BK, 0, -1), 24 + BK, cfg);
      stand(FR(HX + 4, -2, 0, 1), 24 + BK, cfg);
      const P = FR(-HX - 2, -4.3, 1, 0);
      for (let al = 0.6; al < 2 * HX + 4; al += 0.75 + R() * 0.3) { if (R() < 0.25) continue; const p = P(al, R() * 0.6, 0); fans.push(p[0], p[1], p[2], P.yaw); }
      for (let i = 0; i < 12; i++) {           // parasols
        const side = i < 6, x = side ? (R() * 2 - 1) * 16 : (i % 2 ? 1 : -1) * (27 + R() * 5), z = side ? -6 - R() * 4 : -2 + R() * (30 + BK), c = lin(th.crowd[i % th.crowd.length]);
        Bs.geo(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5, 1, true), _m.makeTranslation(x, 1.1, z), lin('#e8e8e8'));
        Bs.geo(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), _m.makeTranslation(x, 2.3, z), (px, py, pz) => (Math.floor((Math.atan2(pz - z, px - x) + Math.PI) / (Math.PI / 4)) % 2 ? c : WHITE));
      }
      for (const [x, z] of [[-27, -6], [27, -6], [-27, 26 + BK], [27, 26 + BK]]) tower(x, z, 14, false);
      colliders.standZ = -12; colliders.standX = HX + 4;
    } else if (kind === 'bricks') {
      const wall = (P, L) => {
        lbox(Bk, P, 0, L, 0, 0.4, 0, 4.2, WHITE, [0, 0, L / 4, 4.2 / 2], [0, 0, L / 4, 0.2]);
        lbox(Bs, P, -0.07, L + 0.07, -0.07, 0.45, 4.2, 4.35, cConc);
        Bf.quad(P(0, 0.2, 4.35), P(L, 0.2, 4.35), P(L, 0.2, 9), P(0, 0.2, 9), [0, 0, L / 0.6, 4.65 / 0.6], WHITE);
        for (let al = 0; al <= L; al += 3.5) lbox(Bs, P, al - 0.05, al + 0.05, 0.15, 0.25, 4.2, 9.1, cSteel);
        lbox(Bs, P, 0, L, 0.15, 0.25, 8.95, 9.05, cSteel);
      };
      wall(FR(-31, -5.5, 1, 0), 62); wall(FR(-HX - 5, 30 + BK, 0, -1), 35.5 + BK); wall(FR(HX + 5, -5.5, 0, 1), 35.5 + BK);
      for (const [P, L] of [[FR(-HX - 2, -4.7, 1, 0), 2 * HX + 4], [FR(-HX - 4.3, 25 + BK, 0, -1), 28 + BK], [FR(HX + 4.3, -3, 0, 1), 28 + BK]])
        for (let al = 0.5; al < L; al += 0.7 + R() * 0.5) { if (R() < 0.3) continue; const p = P(al, 0, 0); fans.push(p[0], p[1], p[2], P.yaw); }
      for (const [x, z] of [[-24.5, -7], [24.5, -7], [-24.5, 28 + BK], [24.5, 28 + BK]]) tower(x, z, 15, false);
      colliders.standZ = -5.5; colliders.standX = HX + 5;
    } else if (kind === 'hall') {
      const cfg = { T: 6, dep: 0.8, rise: 0.5, fh: 1.1, roof: false, fans: 2 };
      stand(FR(-25, -4.5, 1, 0), 50, cfg);
      stand(FR(-21.5, 24 + BK, 0, -1), 28.1 + BK, cfg);
      stand(FR(21.5, -4.1, 0, 1), 28.1 + BK, cfg);
      const hx = 27.1, hz0 = -10.1, hz1 = 40 + BK, hy = 12.5, cH = lin(mixc(th.wall, th.bg, 0.3)), cCeil = lin(scl(th.bg, 0.8));
      Bs.quad([-hx, 0, hz0], [hx, 0, hz0], [hx, hy, hz0], [-hx, hy, hz0], null, cH);
      Bs.quad([hx, 0, hz1], [-hx, 0, hz1], [-hx, hy, hz1], [hx, hy, hz1], null, cH);
      Bs.quad([-hx, 0, hz1], [-hx, 0, hz0], [-hx, hy, hz0], [-hx, hy, hz1], null, cH);
      Bs.quad([hx, 0, hz0], [hx, 0, hz1], [hx, hy, hz1], [hx, hy, hz0], null, cH);
      Bs.quad([-hx, hy, hz1], [hx, hy, hz1], [hx, hy, hz0], [-hx, hy, hz0], null, cCeil);
      for (let z = -6; z < hz1; z += 8) wbox(Bs, -hx - 0.02, hx + 0.02, hy - 0.7, hy - 0.4, z, z + 0.3, cSteel);
      for (const x of [-12, 0, 12]) for (let z = -2; z < 36 + BK; z += 9.5) Bl.quad([x - 1.6, hy - 0.75, z + 1.2], [x + 1.6, hy - 0.75, z + 1.2], [x + 1.6, hy - 0.75, z], [x - 1.6, hy - 0.75, z], null, lin('#ffffff'));
      lbox(Bb, frame(-20, hz0 + 0.05, 1, 0), 0, 40, -0.02, 0, 7.6, 9.6, WHITE, adUV(0), darkUV);   // banner over the end stand
      colliders.standZ = -4.5; colliders.standX = 21.5;
    } else {   // rooftop cage
      const fence = (P, L) => {
        Bf.quad(P(0, -0.02, 0), P(L, -0.02, 0), P(L, -0.02, 4), P(0, -0.02, 4), [0, 0, L / 0.6, 4 / 0.6], WHITE);
        for (let al = 0; al <= L; al += 3) lbox(Bs, P, al - 0.05, al + 0.05, 0, 0.1, 0, 4.1, cSteel);
        lbox(Bs, P, 0, L, 0, 0.1, 3.95, 4.05, cSteel);
        lbox(Bs, P, 0, L, 0.5, 0.9, 0, 0.9, cConc);
      };
      fence(FR(-HX - 3, -4, 1, 0), 2 * HX + 6); fence(FR(-HX - 3, 32 + BK, 0, -1), 36 + BK); fence(FR(HX + 3, -4, 0, 1), 36 + BK); fence(FR(HX + 3, 32 + BK, -1, 0), 2 * HX + 6);
      for (const [P, L] of [[FR(-HX - 2.6, -3.6, 1, 0), 2 * HX + 5], [FR(-HX - 2.6, 24 + BK, 0, -1), 27 + BK], [FR(HX + 2.6, -3, 0, 1), 27 + BK]])
        for (let al = 0.5; al < L; al += 0.8 + R() * 0.6) { if (R() < 0.4) continue; const p = P(al, 0, 0); fans.push(p[0], p[1], p[2], P.yaw); }
      for (const [x, z] of [[-HX - 2.5, -3.5], [HX + 2.5, -3.5], [-HX - 2.5, 22 + BK], [HX + 2.5, 22 + BK]]) tower(x, z, 10, false);
      colliders.standZ = -4; colliders.standX = HX + 3;
    }

    // ---- buildings: city skylines, dock containers + cranes
    const wantCity = (fl.city || kind === 'bricks' || kind === 'rooftop') && !indoor;
    if (wantCity) {
      const cityCol = (k) => lin(mixc(th.wall, '#8a8f98', 0.2 + 0.5 * k));
      const bld = (cx, cz, w, d, y0, y1) => {
        const col = cityCol(R()), uw = w / 12, ud = d / 12, vh = (y1 - y0) / 48, ru = [0.001, 0.999, 0.002, 0.9995];
        const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
        Bw.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, uw, vh], col);
        Bw.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, uw, vh], col);
        Bw.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [0, 0, ud, vh], col);
        Bw.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [0, 0, ud, vh], col);
        Bw.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], ru, col);
      };
      if (kind === 'rooftop') {
        for (let i = 0; i < 44; i++) {
          const a = R() * TAU, r = 45 + R() * 110, cx = Math.sin(a) * r, cz = 10 - Math.cos(a) * r;
          bld(cx, cz, 10 + R() * 18, 10 + R() * 18, -48, -20 + R() * (i % 4 === 0 ? 70 : 35));
        }
      } else {
        const behind = fl.dock ? 0 : 11;
        for (let i = 0; i < behind; i++) bld(-60 + i * 12 + R() * 4, -20 - R() * 26, 9 + R() * 8, 9 + R() * 10, -0.05, 12 + R() * 26);
        for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 7; i++) bld(s * (36 + R() * 18), -8 + i * 9 + R() * 3, 8 + R() * 8, 7 + R() * 4, -0.05, 9 + R() * 22);
        for (let i = 0; i < 6; i++) bld(-50 + i * 20 + R() * 5, 72 + BK + R() * 20, 12 + R() * 8, 10, -0.05, 12 + R() * 20);
      }
      if (fl.dock) {        // container stacks + two gantry cranes behind the goal
        for (let i = 0; i < 22; i++) {
          const x = -46 + (i % 11) * 8.6, z = -12 - Math.floor(i / 11) * 7 - R() * 2, hN = 1 + ((R() * 4) | 0);
          for (let k = 0; k < hN; k++) wbox(Bs, x - 3, x + 3, k * 2.6, k * 2.6 + 2.5, z - 1.2, z + 1.2, lin(th.crowd[(i * 3 + k) % th.crowd.length], 0.85));
        }
        const crane = lin('#d9a02e');
        for (const cx of [-20, 18]) {
          const z0 = -36, z1 = -28;
          for (const [x, z] of [[cx - 5, z0], [cx + 5, z0], [cx - 5, z1], [cx + 5, z1]]) wbox(Bs, x - 0.5, x + 0.5, 0, 30, z - 0.5, z + 0.5, crane);
          wbox(Bs, cx - 6, cx + 6, 29, 31, z0 - 0.6, z1 + 0.6, crane);
          wbox(Bs, cx - 1, cx + 1, 30, 31.6, z0 - 22, z1 + 26, crane);
          wbox(Bs, cx - 1.5, cx + 1.5, 31, 35, z1 - 4, z1, lin('#3a4048'));
        }
      }
    }
    if (fl.dunes) for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + R() * 0.3, r = 70 + R() * 60, x = Math.sin(a) * r, z = 10 - Math.cos(a) * r;
      if (z > -14 && Math.abs(x) < 40) continue;
      _q.set(0, 0, 0, 1); _m.compose(_p.set(x, -0.5, z), _q, new THREE.Vector3(30 + R() * 30, 5 + R() * 9, 18 + R() * 20));
      Bs.geo(new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2), _m, lin(mixc(th.base, '#e8b070', 0.3 + R() * 0.3)));
    }

    // ---- ball-stop net: the sim keeps the ball in at the back edge with a full-height wall, so show it. Slim posts and a
    // light mesh, 5 m tall (the highest measured contact is 3.8 m), above the low board / glass; depthWrite off so it never hides play.
    {
      const NET_H = 5, NET_Z = DEPA + 0.2, NET_B = colliders.backH - 0.1, NET_C = 0.25, cPole = lin('#3b4048');
      const nPost = Math.max(2, Math.round(2 * HX / 6) + 1);
      for (let i = 0; i < nPost; i++) {
        const x = -HX + 2 * HX * i / (nPost - 1);
        BnS.geo(new THREE.CylinderGeometry(0.04, 0.05, NET_H + 0.1, 8, 1, false), _m.makeTranslation(x, NET_H / 2, NET_Z + 0.07), cPole);
      }
      Bq.quad([-HX, NET_B, NET_Z], [HX, NET_B, NET_Z], [HX, NET_H, NET_Z], [-HX, NET_H, NET_Z], [0, 0, 2 * HX / NET_C, (NET_H - NET_B) / NET_C], WHITE);
      wbox(BnS, -HX, HX, NET_H - 0.02, NET_H + 0.02, NET_Z + 0.05, NET_Z + 0.09, cPole);   // top cable
    }

    // ---- merge into meshes
    const lambertVC = () => M(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const meshOf = (B, mat, name) => (B.nv ? add(new THREE.Mesh(G(B.build(THREE)), mat), name) : null);
    meshOf(Bs, lambertVC(), 'structure');
    if (Bc.nv) {
      const ct = tex(paintCrowd(th, fl), { ws: 1, aniso: 8 });
      meshOf(Bc, M(new THREE.MeshLambertMaterial({ map: ct, emissive: new THREE.Color(night ? 0.32 : 0.18, night ? 0.32 : 0.18, night ? 0.32 : 0.18), emissiveMap: ct })), 'stands');
    }
    meshOf(Bb, M(new THREE.MeshBasicMaterial({ map: adTex })), 'boards');
    // the back end (low board, glass, rail + posts, ball-stop net with its posts and cable) fades out while the chase camera is behind it
    const backFade = [];
    const backMesh = (B, mat, name, order) => { const m = meshOf(B, mat, name); if (m) { if (order != null) m.renderOrder = order; backFade.push({ m, mat, op: mat.opacity, tr: mat.transparent }); } return m; };
    backMesh(Bbb, M(new THREE.MeshBasicMaterial({ map: adTex })), 'backBoard');
    backMesh(BnS, lambertVC(), 'backPosts');
    backMesh(BnL, M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })), 'backRail');
    backMesh(Bgb, M(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })), 'backGlass', 3);
    meshOf(Bl, M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })), 'lamps');
    if (Bg.nv) { const gm = meshOf(Bg, M(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })), 'glass'); gm.renderOrder = 3; }
    if (Bk.nv) meshOf(Bk, M(new THREE.MeshLambertMaterial({ map: tex(paintBricks(th), { ws: 1, wt: 1, aniso: 8 }) })), 'brickWalls');
    if (Bf.nv) { const fm = meshOf(Bf, M(new THREE.MeshBasicMaterial({ map: tex(paintFence(), { ws: 1, wt: 1, aniso: 8 }), color: color(mixc(th.cage || '#c8d2e0', '#ffffff', 0.2)), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })), 'fence'); fm.renderOrder = 1; }
    if (Bq.nv) { const nm = meshOf(Bq, M(new THREE.MeshBasicMaterial({ map: tex(paintStopNet(), { ws: 1, wt: 1, aniso: 8 }), color: color(mixc(th.cage || '#c8d2e0', '#ffffff', 0.2)).multiplyScalar(night ? 0.6 : 1), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })), 'ballNet'); nm.renderOrder = 1; backFade.push({ m: nm, mat: nm.material, op: nm.material.opacity, tr: true }); }
    if (Bw.nv) {
      const w = paintWindows(night), wm = tex(w.map, { ws: 1, wt: 1 }), we = tex(w.emi, { ws: 1, wt: 1 });
      meshOf(Bw, M(new THREE.MeshLambertMaterial({ vertexColors: true, map: wm, emissive: new THREE.Color(night ? 1 : 0, night ? 1 : 0, night ? 1 : 0), emissiveMap: we })), 'buildings');
    }

    // ---- instanced fans (bounce on cheer() in the vertex shader: zero CPU per frame)
    const fanN0 = fans.length / 4, keepFrac = (q === 0 ? 1 : q === 1 ? 0.75 : 0.3) * (fl.crowd == null ? 1 : clamp(fl.crowd, 0.25, 1));
    const fanN = Math.floor(fanN0 * keepFrac);
    const animFans = q < 2;
    if (fanN > 0) {
      const fg = G(new THREE.PlaneGeometry(0.56, 1.0)); fg.translate(0, 0.5, 0);
      const fmat = M(new THREE.MeshLambertMaterial({ map: tex(paintFigures(th)), alphaTest: 0.5, emissive: new THREE.Color(0.25, 0.25, 0.25) }));
      fmat.emissiveMap = fmat.map;
      fmat.onBeforeCompile = (sh) => {
        sh.uniforms.uT = U.uT; sh.uniforms.uJump = U.uJump;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aCr;\nattribute float aSec;\nuniform float uT;\nuniform float uJump;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + aCr.y) * 0.125;\n#endif')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fph = aCr.x * 6.2831853;\ntransformed.y += uJump * 0.42 * max(0.0, sin(uT * 7.5 + fph)) + 0.02 * sin(uT * 1.9 + fph * 7.0);' + (fl.wave ? '\ntransformed.x += 0.035 * sin(uT * (0.9 + aSec * 0.37) + aSec * 2.1 + fph);\ntransformed.y += 0.03 * max(0.0, sin(uT * (1.1 + aSec * 0.21) - aSec * 1.7));' : '') + '\ntransformed.x += uJump * 0.05 * sin(uT * 5.0 + fph);');
      };
      fmat.customProgramCacheKey = () => 'r3d-fans' + (fl.wave ? 'w' : '');
      const im = new THREE.InstancedMesh(fg, fmat, fanN), cr = new Float32Array(fanN * 2), secA = new Float32Array(fanN), e = new THREE.Euler(), sc = new THREE.Vector3();
      const step = fanN0 / fanN;
      for (let i = 0; i < fanN; i++) {
        const j = Math.floor(i * step) * 4, s = 0.9 + R() * 0.2;
        e.set(0, fans[j + 3], 0); _q.setFromEuler(e); _m.compose(_p.set(fans[j], fans[j + 1], fans[j + 2]), _q, sc.set(s, s, s)); im.setMatrixAt(i, _m);
        cr[i * 2] = R(); cr[i * 2 + 1] = Math.floor(R() * 8);
        secA[i] = Math.floor((fans[j] + 40) / 14) + (fans[j + 2] > 2 ? 6 : 0);          // the stand section: every one sways at its own pace
      }
      fg.setAttribute('aCr', new THREE.InstancedBufferAttribute(cr, 2)); fg.setAttribute('aSec', new THREE.InstancedBufferAttribute(secA, 1));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      fanCap = fanN; add(im, 'fans');
    }

    // ---- flags (one instanced mesh, +1 draw call, quality 0 and 1): a pole and a waving cloth in the home colours, only on the stands
    const flagN = fl.flags && !(q >= 2) ? Math.min(24, fl.flags, flagSpots.length / 4) >> (q ? 1 : 0) : 0;
    if (flagN > 0) {
      const Bfl = new Builder(), nx = 4, FW = 0.9, FHt = 0.55, ph = 1.35;
      Bfl.quad([-0.02, 0, 0], [0.02, 0, 0], [0.02, ph + FHt, 0], [-0.02, ph + FHt, 0], null, [0.62, 0.62, 0.66]);              // pole
      for (let i = 0; i < nx; i++) Bfl.quad([0.02 + i * FW / nx, ph, 0], [0.02 + (i + 1) * FW / nx, ph, 0], [0.02 + (i + 1) * FW / nx, ph + FHt, 0], [0.02 + i * FW / nx, ph + FHt, 0], null, WHITE);   // cloth
      const flg = G(Bfl.build(THREE)), fm = M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      fm.onBeforeCompile = (sh) => {
        sh.uniforms.uT = U.uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFl;\nuniform float uT;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fw = max(0.0, position.x - 0.03);\ntransformed.z += fw * 0.35 * sin(uT * 6.0 + position.x * 7.0 + aFl * 6.2831);\ntransformed.y += fw * 0.08 * sin(uT * 4.3 + position.x * 5.0 + aFl * 9.0);');
      };
      fm.customProgramCacheKey = () => 'r3d-flags';
      const fim = new THREE.InstancedMesh(flg, fm, flagN), fph = new Float32Array(flagN), ca = color(kc[0]), cb = color(kc[1]), e = new THREE.Euler(), sc = new THREE.Vector3(), stp = flagSpots.length / 4 / flagN;
      for (let i = 0; i < flagN; i++) {
        const j = Math.floor(i * stp) * 4, s = 0.9 + R() * 0.3; e.set(0, flagSpots[j + 3], 0); _q.setFromEuler(e);
        _m.compose(_p.set(flagSpots[j], flagSpots[j + 1], flagSpots[j + 2]), _q, sc.set(s, s, s)); fim.setMatrixAt(i, _m);
        fim.setColorAt(i, i % 2 ? cb : ca); fph[i] = R();
      }
      flg.setAttribute('aFl', new THREE.InstancedBufferAttribute(fph, 1));
      fim.instanceMatrix.needsUpdate = true; if (fim.instanceColor) fim.instanceColor.needsUpdate = true; fim.frustumCulled = false; add(fim, 'flags');
    }
    // ---- camera flashes on a goal (night maps, quality 0 and 1): up to 160 sparkling points in the stands, driven by the cheer uniform
    if (fl.flash && night && !(q >= 2) && !opts.noFlash && fanN0 > 0) {      // Phase 9.1: Settings › reduce flashes skips the goal camera flashes
      const nF = Math.min(160, Math.floor(fanN0)), fp = new Float32Array(nF * 3), stp = fanN0 / nF;
      for (let i = 0; i < nF; i++) { const j = Math.floor(i * stp) * 4; fp[i * 3] = fans[j]; fp[i * 3 + 1] = fans[j + 1] + 1.15; fp[i * 3 + 2] = fans[j + 2]; }
      const fg2 = G(new THREE.BufferGeometry()); fg2.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      const flm = M(new THREE.PointsMaterial({ map: tex(paintGlow()), color: color('#ffffff'), size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      flm.onBeforeCompile = (sh) => {
        sh.uniforms.uT = U.uT; sh.uniforms.uJump = U.uJump;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;\nuniform float uJump;')
          .replace('gl_PointSize = size;', 'gl_PointSize = size * step(0.99, uJump) * step(0.82, fract(uT * 3.1 + position.x * 7.3 + position.z * 3.7));');
      };
      flm.customProgramCacheKey = () => 'r3d-flash';
      const fpts = add(new THREE.Points(fg2, flm), 'flashes'); fpts.frustumCulled = false; fpts.renderOrder = 4;
    }

    // ---- trees (24 instanced: pine / round / palm / rock) behind the open far end
    if (!indoor && kind !== 'rooftop' && fl.tree !== 'none') {
      const kindT = fl.tree, tc = fl.treeCol || (kindT === 'palm' ? '#3f8a3a' : '#2a5a2e');
      const Bt = new Builder(), Bn = new Builder(), trunkC = lin(kindT === 'palm' ? '#8a6a42' : '#4a3222');
      if (kindT === 'pine') {
        Bt.geo(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6, 1, true), _m.makeTranslation(0, 1.2, 0), trunkC);
        const cc = lin(tc), cw = lin('#eef3f8'), snow = fl.snowy;
        const cf = (x, y) => { const t = clamp((y - 1.8) / 6, 0, 1), k = 0.7 + 0.5 * t; return snow && t > 0.55 ? cw : [cc[0] * k, cc[1] * k, cc[2] * k]; };
        Bn.geo(new THREE.ConeGeometry(2.2, 4.2, 9), _m.makeTranslation(0, 3.9, 0), cf);
        Bn.geo(new THREE.ConeGeometry(1.6, 3.4, 9), _m.makeTranslation(0, 5.9, 0), cf);
      } else if (kindT === 'round') {
        Bt.geo(new THREE.CylinderGeometry(0.15, 0.26, 4, 6, 1, true), _m.makeTranslation(0, 2, 0), trunkC);
        const cc = lin(tc), cf = (x, y) => { const k = 0.65 + 0.12 * (y - 3); return [cc[0] * k, cc[1] * k, cc[2] * k]; };
        _m.compose(_p.set(0, 4.6, 0), _q.set(0, 0, 0, 1), new THREE.Vector3(1, 0.85, 1)); Bn.geo(new THREE.IcosahedronGeometry(2.3, 1), _m, cf);
        Bn.geo(new THREE.IcosahedronGeometry(1.5, 1), _m.makeTranslation(1.1, 5.7, 0.5), cf);
      } else if (kindT === 'palm') {
        const tg = new THREE.CylinderGeometry(0.13, 0.22, 7, 6, 6, true), pa = tg.attributes.position;
        for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) + 3.5; pa.setX(i, pa.getX(i) + 0.035 * y * y); pa.setY(i, y); }
        Bt.geo(tg, null, trunkC);
        const top = [0.035 * 49, 7, 0], cc = lin(tc);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a), pts = [];
          for (let s = 0; s <= 3; s++) { const r = s * 1.05, y = top[1] + 0.5 * r - 0.32 * r * r, w = 0.12 + 0.42 * Math.sin((Math.PI * s) / 3.2); pts.push([top[0] + ca * r, y, sa * r, w]); }
          for (let s = 0; s < 3; s++) {
            const p0 = pts[s], p1 = pts[s + 1], k0 = 0.8 + 0.1 * s;
            Bn.quad([p0[0] - sa * p0[3], p0[1], p0[2] + ca * p0[3]], [p0[0] + sa * p0[3], p0[1], p0[2] - ca * p0[3]],
              [p1[0] + sa * p1[3], p1[1], p1[2] - ca * p1[3]], [p1[0] - sa * p1[3], p1[1], p1[2] + ca * p1[3]], null, [cc[0] * k0, cc[1] * k0, cc[2] * k0]);
          }
        }
      } else {  // rock (lunar boulders)
        _m.compose(_p.set(0, 0.4, 0), _q.set(0, 0, 0, 1), new THREE.Vector3(1.3, 0.6, 1)); Bn.geo(new THREE.IcosahedronGeometry(1.5, 1), _m, lin('#8a8f98'));
      }
      const pos = [];
      const tryPut = (x, z) => { for (let i = 0; i < pos.length; i += 2) if (Math.hypot(pos[i] - x, pos[i + 1] - z) < 4.5) return; pos.push(x, z); };
      for (let g = 0; g < 400 && pos.length < 48; g++) {
        if (kindT === 'palm') { const r = R(); if (r < 0.6) tryPut((R() < 0.5 ? -1 : 1) * (27.5 + R() * 9), -4 + R() * (44 + BK)); else tryPut((R() * 2 - 1) * 42, 42 + BK + R() * 16); }
        else tryPut((R() * 2 - 1) * 46, 44 + BK + R() * 24);
      }
      const n = pos.length / 2, tm = Bt.nv ? new THREE.InstancedMesh(G(Bt.build(THREE)), lambertVC(), n) : null;
      const cm = new THREE.InstancedMesh(G(Bn.build(THREE)), lambertVC(), n), cl = new THREE.Color(), e = new THREE.Euler(), sc = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const s = 0.85 + R() * 0.65; e.set(0, R() * TAU, 0); _q.setFromEuler(e);
        _m.compose(_p.set(pos[i * 2], 0, pos[i * 2 + 1]), _q, sc.set(s, s * (0.9 + R() * 0.25), s));
        cm.setMatrixAt(i, _m); if (tm) tm.setMatrixAt(i, _m);
        const k = 0.8 + R() * 0.35; cm.setColorAt(i, cl.setRGB(k, k * (0.95 + R() * 0.1), k));
      }
      cm.frustumCulled = false; add(cm, 'treeCrowns'); if (tm) { tm.frustumCulled = false; add(tm, 'treeTrunks'); }
    }

    // ---- sea behind the goal (beach), lunar earth, sky dome, stars, clouds, weather
    let seaTex = null;
    if (kind === 'beach' && fl.sea) {
      seaTex = tex(paintSea(), { ws: 1, wt: 1, aniso: 8 }); seaTex.repeat.set(60, 30);
      const sg = G(new THREE.PlaneGeometry(900, 420)); sg.rotateX(-Math.PI / 2); sg.translate(0, 0, -12 - 210);
      const sea = add(new THREE.Mesh(sg, M(new THREE.MeshStandardMaterial({ color: color(fl.sea), map: seaTex, roughness: 0.25, metalness: 0.1 }))), 'sea');
      sea.position.y = 0.02;
      const shore = G(new THREE.PlaneGeometry(900, 3)); shore.rotateX(-Math.PI / 2); shore.translate(0, 0.03, -12);
      add(new THREE.Mesh(shore, M(new THREE.MeshBasicMaterial({ color: color('#f4fbfa'), transparent: true, opacity: 0.55, depthWrite: false }))), 'surf');
    }
    if (fl.earth) {
      const eg = G(new THREE.SphereGeometry(22, 24, 12)), em = add(new THREE.Mesh(eg, M(new THREE.MeshBasicMaterial({ map: tex(paintEarth()), fog: false }))), 'earth');
      em.position.set(-70, 80, -240); em.rotation.set(0.3, 1.2, 0.2);
    }
    if (!indoor) {
      const dg = G(new THREE.SphereGeometry(330, 32, 16)), pa = dg.attributes.position, cols = new Float32Array(pa.count * 3);
      const top = color(skyTop), hor = color(skyHor), low = color(css(scl(skyHor, 0.55), 1)), tmp = new THREE.Color();
      for (let i = 0; i < pa.count; i++) {
        const t = pa.getY(i) / 330;
        if (t >= 0) tmp.copy(hor).lerp(top, Math.pow(t, 0.55)); else tmp.copy(hor).lerp(low, Math.min(1, -t * 5));
        cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
      }
      dg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const dome = add(new THREE.Mesh(dg, M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }))), 'sky');
      dome.position.set(0, kind === 'rooftop' ? -30 : -10, 10); dome.renderOrder = -10; dome.frustumCulled = false;
      if (night) {
        const n = 600, sp = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const a = R() * TAU, y = 0.12 + R() * 0.88, r = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(a) * r * 300; sp[i * 3 + 1] = y * 300; sp[i * 3 + 2] = Math.sin(a) * r * 300 + 10; }
        const sg = G(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        add(new THREE.Points(sg, M(new THREE.PointsMaterial({ color: 0xffffff, size: fl.earth ? 1.8 : 1.3, sizeAttenuation: false, transparent: true, opacity: fl.earth ? 0.95 : 0.6, fog: false, depthWrite: false }))), 'stars').renderOrder = -9;
      } else if (fl.clouds) {
        const n = 26, cp = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() * 2 - 1) * 1.4, r = 240 + R() * 50; cp[i * 3] = Math.cos(a) * r; cp[i * 3 + 1] = 30 + R() * 60; cp[i * 3 + 2] = Math.sin(a) * r + 10; }
        const cg = G(new THREE.BufferGeometry()); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
        add(new THREE.Points(cg, M(new THREE.PointsMaterial({ map: tex(paintGlow()), color: color(mixc(skyHor, '#ffffff', 0.7)), size: 90, sizeAttenuation: true, transparent: true, opacity: 0.45, fog: false, depthWrite: false }))), 'clouds').renderOrder = -9;
      }
    }
    if (night && glows.length) {
      const gg = G(new THREE.BufferGeometry()); gg.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
      add(new THREE.Points(gg, M(new THREE.PointsMaterial({ map: tex(paintGlow()), color: color('#fff4d8'), size: kind === 'crowd' ? 9 : 4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))), 'lampGlow').renderOrder = 4;
    }
    if (fl.weather) {
      const w = fl.weather, n = w === 'rain' ? [2200, 1400, 600][q] : [1600, 1000, 400][q], wp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { wp[i * 3] = (R() * 2 - 1) * 26; wp[i * 3 + 1] = R() * 22; wp[i * 3 + 2] = -6 + R() * 40; }
      const wg = G(new THREE.BufferGeometry()); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
      const fall = w === 'rain' ? 14 : w === 'petals' ? 0.9 : 1.4, sway = w === 'rain' ? 0.05 : w === 'petals' ? 1.4 : 0.6;
      const wm = M(new THREE.PointsMaterial({ map: tex(paintGlow()), color: color(w === 'rain' ? '#9fb8d0' : w === 'petals' ? '#ffc0d8' : '#ffffff'),
        size: w === 'rain' ? 0.07 : w === 'petals' ? 0.12 : 0.1, sizeAttenuation: true, transparent: true, opacity: w === 'rain' ? 0.55 : 0.9, depthWrite: false }));
      wm.onBeforeCompile = (sh) => {
        sh.uniforms.uT = U.uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed.y = mod(position.y - uT * ' + fall.toFixed(2) + ', 22.0);\ntransformed.x += sin(uT * 0.8 + position.z * 1.7) * ' + sway.toFixed(2) + ';\ntransformed.z += cos(uT * 0.6 + position.x * 1.3) * ' + sway.toFixed(2) + ';');
      };
      wm.customProgramCacheKey = () => 'r3d-wx-' + w;
      const pts = add(new THREE.Points(wg, wm), 'weather'); pts.frustumCulled = false; pts.renderOrder = 5;
    }

    // ---- target boxes (Target Practice): preallocated, no allocation in setTargets/update
    const TQ = 8 * 4, tPos = new Float32Array(TQ * 12), tIx = [];
    for (let i = 0; i < TQ; i++) tIx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    const tg = G(new THREE.BufferGeometry()); const tPA = new THREE.BufferAttribute(tPos, 3); tPA.setUsage(THREE.DynamicDrawUsage);
    tg.setAttribute('position', tPA); tg.setIndex(tIx); tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, GH / 2, 0), 6);
    const tMesh = add(new THREE.Mesh(tg, M(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }))), 'targets');
    tMesh.visible = false; tMesh.renderOrder = 3;
    const LQ = 7, lPos = new Float32Array(LQ * 12), lCol = new Float32Array(LQ * 16), lIx = [];
    for (let i = 0; i < LQ; i++) lIx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    const lg = G(new THREE.BufferGeometry()); const lPA = new THREE.BufferAttribute(lPos, 3); lPA.setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', lPA); lg.setAttribute('color', new THREE.BufferAttribute(lCol, 4)); lg.setIndex(lIx); lg.boundingSphere = tg.boundingSphere.clone();
    const litMat = M(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }));
    const lMesh = add(new THREE.Mesh(lg, litMat), 'targetLit'); lMesh.visible = false; lMesh.renderOrder = 3;
    const yellow = color('#ffcf4d');
    const TZ = -0.03, SW = 0.04;
    const wq = (arr, qi, x0, y0, x1, y1) => { const o = qi * 12; arr[o] = x0; arr[o + 1] = y0; arr[o + 2] = TZ; arr[o + 3] = x1; arr[o + 4] = y0; arr[o + 5] = TZ; arr[o + 6] = x1; arr[o + 7] = y1; arr[o + 8] = TZ; arr[o + 9] = x0; arr[o + 10] = y1; arr[o + 11] = TZ; };
    const outline = (arr, qi, x0, y0, x1, y1) => { wq(arr, qi, x0, y0, x1, y0 + SW); wq(arr, qi + 1, x0, y1 - SW, x1, y1); wq(arr, qi + 2, x0, y0, x0 + SW, y1); wq(arr, qi + 3, x1 - SW, y0, x1, y1); return qi + 4; };
    const lc = (qi, a) => { for (let v = 0; v < 4; v++) { const o = (qi * 4 + v) * 4; lCol[o] = yellow.r; lCol[o + 1] = yellow.g; lCol[o + 2] = yellow.b; lCol[o + 3] = a; } };
    let tList = null, tLit = -2;
    function setTargets(list, lit) {
      lit = lit == null ? -1 : lit;
      if (list === tList && lit === tLit) return; tList = list; tLit = lit;
      const n = list ? Math.min(list.length, 8) : 0, S = D.S, gc = D.GCY; let qn = 0;
      for (let i = 0; i < n; i++) { if (i === lit) continue; const t = list[i]; qn = outline(tPos, qn, (t.y0 - gc) * S, t.z0 * S, (t.y1 - gc) * S, t.z1 * S); }
      tg.setDrawRange(0, qn * 6); tPA.needsUpdate = true; tMesh.visible = qn > 0;
      if (lit >= 0 && lit < n) {
        const t = list[lit], x0 = (t.y0 - gc) * S, x1 = (t.y1 - gc) * S, y0 = t.z0 * S, y1 = t.z1 * S, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        wq(lPos, 0, x0, y0, x1, y1); lc(0, 0.5);
        outline(lPos, 1, x0, y0, x1, y1); for (let k = 1; k < 5; k++) lc(k, 1);
        wq(lPos, 5, cx - 0.25, cy - 0.025, cx + 0.25, cy + 0.025); wq(lPos, 6, cx - 0.025, cy - 0.25, cx + 0.025, cy + 0.25); lc(5, 1); lc(6, 1);
        lPA.needsUpdate = true; lg.attributes.color.needsUpdate = true; lMesh.visible = true;
      } else lMesh.visible = false;
    }

    // ---- lights: hemisphere + one shadow-casting directional (the `sun`), night point lights at the towers
    // Intensities are r160 physical units (spec 0.7 / 1.6 were legacy-scale): tune via st.hemi / st.sun.
    const sunCol = indoor ? '#fffaf0' : fl.sun || (night ? '#eef3ff' : '#fff4e0');
    const hemiSky = indoor ? '#e8eef8' : night ? mixc(skyHor, '#b8c8e0', 0.6) : mixc(skyTop, '#ffffff', 0.45);
    const hemi = add(new THREE.HemisphereLight(color(hemiSky), color(css(scl(th.base, 0.6), 1)), indoor ? 1.3 : night ? 1.0 : 1.15), 'hemi');
    // the sun's bearing and height per map (FLAV.sunDir; the old fixed light was az -50.6, el 55): a low dusk sun throws long shadows. The
    // shadow frustum is fitted to the playable area in light space for any direction (minimum elevation 22 degrees), and the intensity
    // is scaled so the ground keeps about the same light (sun * sin el), within 0.9..1.5.
    const sd = fl.sunDir || [-50.6, night ? 62 : fl.dusk ? 24 : 55], sAz = sd[0] * Math.PI / 180, sEl = clamp(sd[1], 22, 90) * Math.PI / 180;
    const sunK = indoor ? 1 : clamp(0.819 / Math.sin(sEl), 0.9, 1.5);
    const sun = new THREE.DirectionalLight(color(sunCol), (indoor ? 1.9 : night ? 2.4 : fl.dusk ? 2.5 : 2.8) * sunK);
    const SUN_TZ = 8.5, SUN_D = 40, sdx = Math.cos(sEl) * Math.sin(sAz), sdy = Math.sin(sEl), sdz = Math.cos(sEl) * Math.cos(sAz);
    sun.name = 'sun'; sun.position.set(sdx * SUN_D, sdy * SUN_D, SUN_TZ + sdz * SUN_D); sun.target.position.set(0, 0, SUN_TZ); group.add(sun); group.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    {   // fit: project the corners of the playable box (x +-(HX+1), z -2..DEPA+1, height 0..3) on the light's right and up axes and its depth
      const sc = sun.shadow.camera, zx = sdx, zy = sdy, zz = sdz;
      let rx = zz, rz = -zx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;          // right = up x z (up = +y)
      const ux = zy * rz, uy = zz * rx - zx * rz, uz = -zy * rx;                              // up = z x right
      let l = 1e9, r = -1e9, b = 1e9, t = -1e9, nr = 1e9, fr = -1e9;
      for (const cx of [-HX - 1, HX + 1]) for (const cz of [-2, DEPA + 1]) for (const cy of [0, 3]) {
        const px = cx, py = cy, pz = cz - SUN_TZ, a = px * rx + pz * rz, u = px * ux + py * uy + pz * uz, d = SUN_D - (px * zx + py * zy + pz * zz);
        if (a < l) l = a; if (a > r) r = a; if (u < b) b = u; if (u > t) t = u; if (d < nr) nr = d; if (d > fr) fr = d;
      }
      sc.left = l - 1; sc.right = r + 1; sc.bottom = b - 1; sc.top = t + 1; sc.near = Math.max(0.5, nr - 14); sc.far = fr + 6; sc.updateProjectionMatrix();
    }
    if (night && q < 2 && !indoor) for (let i = 0; i < lamps.length; i += 3) {
      const pl = new THREE.PointLight(color('#fff2dc'), kind === 'crowd' ? 60 : 25, kind === 'crowd' ? 110 : 60, 1);
      pl.position.set(lamps[i] * 0.85, lamps[i + 1], lamps[i + 2] * 0.85 + 1.2); add(pl, 'floodPoint');
    }

    // ---- fog / background (the caller owns the scene: st.applyTo(scene))
    const fogCol = indoor ? color(css(scl(th.bg, 0.9), 1)) : color(skyHor);
    const fog = new THREE.Fog(fogCol, indoor ? 60 : night ? 70 : 90, indoor ? 220 : night ? 330 : 380);
    const background = fogCol.clone();

    // ---------------------------------------------------------------- per frame (no allocation)
    let cheerJ = 0;
    function update(dt, t) {
      if (!(dt > 0)) dt = 0; else if (dt > 0.05) dt = 0.05;
      U.uT.value = t || 0;
      if (cheerJ > 0) cheerJ = cheerJ - dt * 0.3 > 0 ? cheerJ - dt * 0.3 : 0;
      U.uJump.value = animFans ? (cheerJ > 0.7 ? 1 : cheerJ / 0.7) : 0;
      if (net.awake && dt > 0) stepNet(dt);
      if (fl.led) adTex.offset.x = (U.uT.value * 0.03) % 1;                  // the LED boards scroll
      if (seaTex) { seaTex.offset.x = (U.uT.value * 0.004) % 1; seaTex.offset.y = (U.uT.value * 0.012) % 1; }
      if (lMesh.visible) litMat.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(U.uT.value * 7));
    }
    // The chase camera may stand behind the back end (camera3d place()): its pieces are gone by the time the lens is level with the board
    // (before that they are behind the lens, so the fade is never seen) and nothing of it can sit between the lens and the player
    function setView(camZ, camY) {
      // the back end only fades when the lens is low enough to be behind it (a high camera sees over the board)
      const u = clamp((camZ - (DEPA - 0.5)) / 0.9, 0, 1), hi = camY === undefined ? 0 : clamp((camY - 5) / 3, 0, 1), f = 1 - (u * u * (3 - 2 * u)) * (1 - hi * hi * (3 - 2 * hi));
      for (const b of backFade) {
        const tr = b.tr || f < 0.999;
        b.m.visible = f > 0.01; b.mat.opacity = b.op * f;
        if (b.mat.transparent !== tr) { b.mat.transparent = tr; b.mat.needsUpdate = true; }
      }
    }
    function cheer(k) { cheerJ = Math.max(cheerJ, k == null ? 1.6 : k); }
    function applyTo(scene) { scene.fog = fog; scene.background = background; }
    function dispose() {
      if (group.parent) group.parent.remove(group);
      for (const g of keep.geo) g.dispose();
      for (const m of keep.mat) m.dispose();
      for (const t of keep.tex) t.dispose();
      group.traverse((o) => { if (o.isInstancedMesh && o.dispose) o.dispose(); if (o.isLight && o.dispose) o.dispose(); });
      keep.geo.length = keep.mat.length = keep.tex.length = 0;
    }
    group.traverse((o) => { if (o.isMesh && o.geometry && keep.geo.indexOf(o.geometry) < 0) keep.geo.push(o.geometry); });
    return { group, update, setView, netHit, setTargets, sun, hemi, cheer, fog, background, applyTo, dispose, colliders, kind, night: !!night, id, fans: fanCap };
  }

  R3D.Stadium = { build, flavours: FLAV, FLAV, parseColor: parse };
})();
