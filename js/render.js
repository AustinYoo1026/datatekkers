/* ISO FOOTBALL — 2D canvas renderer. Reads game state, never mutates it. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const C = ISO.C, { FW, FH, GY0, GY1, GD, BOXD, BOXY0, BOXY1, SIXD, SIXY0, SIXY1, CR, PEN } = C;
  const GCY = (GY0 + GY1) / 2;
  const VW = 1280, VH = 720, Z = 1.6, OX = (1280 - FH * Z) / 2, OY = 135;      // Z zooms the whole pitch, characters included
  // The sim has the goal on +x; the screen has it at the top. Sim (x, y) -> screen (y, FW - x): a pure rotation.
  const faceS = (f) => Math.atan2(-Math.cos(f), Math.sin(f));
  const T = (o) => ({ x: o.y, y: FW - o.x });
  const viewP = (p) => Object.assign(Object.create(p), { x: p.y, y: FW - p.x, vx: p.vy, vy: -p.vx, face: faceS(p.face), fallDir: p.fallDir !== undefined ? faceS(p.fallDir) : undefined });
  const hyp = Math.hypot, TAU = Math.PI * 2;
  const TEAM_COL = ['#35e08a', '#ffb23d'];

  // ---- maps: every pitch is painted from a theme (ISO.MAPS lists them for the store) ----
  const ADS = [['ISO FOOTBALL', '#0f1a14', '#35e08a'], ['FIRST TO THREE', '#f4f4f4', '#10151c'], ['DATATEKKERS', '#132033', '#7fc4ff'],
    ['ONE BALL · ONE GOAL', '#35e08a', '#06140c'], ['1 v 1', '#1b1b22', '#ffb23d'], ['ISO FOOTBALL', '#0f1a14', '#35e08a'], ['PLAY THE ISO', '#f4f4f4', '#10151c']];
  const THEMES = {
    stadium: { bg: '#0c1016', around: 'crowd', crowd: ['#2b3442', '#3a4658', '#566377', '#7a2f3a', '#2f5d7a', '#8a7a3a', '#444c5c', '#30394a', '#9aa3b2'],
      wall: '#131a22', base: '#2c7a3d', bands: ['#2a7a3c', '#2f8443'], line: 'rgba(255,255,255,.86)', mark: 'rgba(255,230,120,.9)',
      net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.28, turf: ['#bfe8cb', '#4a9c5d', '#3b8a4d'], ads: ADS },
    street: { bg: '#14161b', around: 'bricks', crowd: ['#5a2f28', '#6b382e', '#4d2a25', '#63352c', '#57302a'],
      wall: '#2a2d34', base: '#3d4149', bands: ['#41454e', '#474b55'], line: 'rgba(255,210,61,.9)', mark: 'rgba(255,255,255,.9)',
      net: 'rgba(10,12,16,.55)', post: '#d9dde3', vig: 0.34, turf: ['#8b9099', '#5c616b', '#c9ced6'],
      ads: [['STREET CAGE', '#17171b', '#ffd23d'], ['NO REF · NO RULES', '#ffd23d', '#17171b'], ['DATATEKKERS', '#f1735f', '#17171b'], ['WINNER STAYS ON', '#17171b', '#f4f4f4']] },
    beach: { bg: '#c9a565', around: 'beach', crowd: ['#f1735f', '#ffcf4d', '#4fa3ff', '#f4f4f4', '#35e08a', '#ff8ac0'],
      wall: '#b08f55', base: '#dcbb7c', bands: ['#dfc084', '#e6c98f'], line: 'rgba(29,78,137,.9)', mark: 'rgba(241,115,95,.95)',
      net: 'rgba(90,70,40,.35)', post: '#f4f6f8', vig: 0.12, turf: ['#f1dcae', '#c9a565', '#e6c98f'],
      ads: [['COPA BEACH', '#1d4e89', '#ffcf4d'], ['SUN · SAND · SKILLS', '#f4f4f4', '#1d4e89'], ['DATATEKKERS', '#f1735f', '#ffffff'], ['ISO FOOTBALL', '#ffcf4d', '#1d4e89']] },
    snow: { bg: '#1a2230', around: 'crowd', crowd: ['#3a4658', '#566377', '#7c8a9e', '#a9b6c8', '#dfe7f0', '#8a3a3a', '#2f5d7a'],
      wall: '#2a3546', base: '#cfdbe7', bands: ['#d3dfea', '#dee8f1'], line: 'rgba(241,115,95,.92)', mark: 'rgba(29,78,137,.95)',
      net: 'rgba(60,80,105,.4)', post: '#f1735f', vig: 0.16, turf: ['#ffffff', '#dfe7f0', '#b9c7d6'], snow: true,
      ads: [['WINTER CUP', '#f4f4f4', '#1d4e89'], ['COLD FEET?', '#1d4e89', '#f4f4f4'], ['DATATEKKERS', '#f1735f', '#ffffff'], ['ISO FOOTBALL', '#132033', '#7fc4ff']] },
    neon: { bg: '#07060f', around: 'crowd', crowd: ['#2a1b4d', '#3b2470', '#5a2a8a', '#ff3dd0', '#3df5ff', '#1a1436', '#241a47'],
      wall: '#120e24', base: '#0d1326', bands: ['#0e152b', '#121b36'], line: 'rgba(61,245,255,.95)', mark: 'rgba(255,61,208,.95)',
      net: 'rgba(40,10,60,.55)', post: '#ff3dd0', vig: 0.4, turf: ['#3df5ff', '#ff3dd0', '#2a1b4d'], glow: '#3df5ff',
      ads: [['NEON NIGHT', '#120e24', '#ff3dd0'], ['AFTER HOURS', '#120e24', '#3df5ff'], ['DATATEKKERS', '#ff3dd0', '#120e24'], ['ISO FOOTBALL', '#3df5ff', '#07060f']] },
  };
  // compact theme builder for the extra maps
  const mkTheme = (name, o) => Object.assign({ around: 'crowd', mark: 'rgba(255,230,120,.9)', net: 'rgba(10,30,18,.55)', post: '#f4f6f8', vig: 0.26,
    turf: [o.bands[0], o.bands[1], o.base], ads: [[name, o.wall, o.line], ['DATATEKKERS', o.line, o.wall], ['ISO FOOTBALL', o.bands[1], o.post || '#f4f6f8'], ['FIRST TO THREE', '#f4f4f4', '#10151c']] }, o);
  Object.assign(THEMES, {
    sunset: mkTheme('GOLDEN HOUR', { bg: '#2a1a14', crowd: ['#8a4a2a', '#b8683a', '#d98c4a', '#7a3a2a', '#e8b06a'], wall: '#3a2218', base: '#c8863a', bands: ['#c9883c', '#d6954a'], line: 'rgba(255,248,230,.92)', mark: 'rgba(120,40,20,.9)', vig: 0.3 }),
    monsoon: mkTheme('MONSOON', { bg: '#0a1118', crowd: ['#1d2a38', '#2a3a4c', '#3a4c60', '#4c6078', '#26323f'], wall: '#101a24', base: '#27503a', bands: ['#264b38', '#2b563f'], line: 'rgba(210,230,245,.85)', vig: 0.42, snow: true }),
    jungle: mkTheme('AMAZON CUP', { bg: '#07140b', around: 'beach', crowd: ['#1f6b34', '#2a8a44', '#ffcf4d', '#f1735f', '#4fd0a0'], wall: '#0d2a14', base: '#1f6a30', bands: ['#1d6430', '#227238'], line: 'rgba(255,255,225,.88)', mark: 'rgba(255,207,77,.95)', vig: 0.34 }),
    moon: mkTheme('LUNAR LEAGUE', { bg: '#05060a', crowd: ['#222633', '#303646', '#4a5266', '#d8dde8', '#8a93a8'], wall: '#14161e', base: '#8c919c', bands: ['#8a8f9a', '#969ba6'], line: 'rgba(30,36,60,.9)', mark: 'rgba(241,115,95,.95)', vig: 0.4, post: '#d8dde8' }),
    desert: mkTheme('DUNE DERBY', { bg: '#3a2412', around: 'beach', crowd: ['#c9833a', '#e0a050', '#8a4a22', '#f1d49a', '#a85a28'], wall: '#7a4a24', base: '#d89a4a', bands: ['#d99c4c', '#e2a85a'], line: 'rgba(110,50,20,.9)', mark: 'rgba(255,255,255,.9)', vig: 0.2 }),
    retro: mkTheme('RETRO 8-BIT', { bg: '#000000', crowd: ['#003a14', '#005a20', '#00aa3a', '#00ff66', '#002a0e'], wall: '#001a08', base: '#04180a', bands: ['#05200c', '#072a10'], line: 'rgba(0,255,102,.95)', mark: 'rgba(0,255,102,.95)', glow: '#00ff66', vig: 0.4, post: '#00ff66', net: 'rgba(0,80,30,.5)' }),
    sakura: mkTheme('CHERRY PARK', { bg: '#2a1620', crowd: ['#f5b8d0', '#ee88b0', '#fbd6e4', '#a85a7a', '#7a3a58'], wall: '#4a2634', base: '#5aa860', bands: ['#58a45e', '#62b068'], line: 'rgba(255,255,255,.9)', mark: 'rgba(238,136,176,.95)', vig: 0.2, snow: true }),
    dock: mkTheme('DOCKYARD', { bg: '#10161c', around: 'bricks', crowd: ['#a8442e', '#2e5ea8', '#d9a02e', '#3a8a5a', '#8a2e2e'], wall: '#1d252e', base: '#5a6672', bands: ['#5c6874', '#64707c'], line: 'rgba(255,205,60,.92)', mark: 'rgba(255,255,255,.9)', vig: 0.32 }),
    gold: mkTheme('GOLD CUP', { bg: '#120d04', crowd: ['#4a3a14', '#7a6020', '#c9a22e', '#ffe27a', '#2a200a'], wall: '#201808', base: '#9a7a22', bands: ['#a07e24', '#ad8a2c'], line: 'rgba(255,248,210,.95)', mark: 'rgba(60,40,0,.9)', vig: 0.3, post: '#ffe27a', glow: '#ffd23d' }),
    mud: mkTheme('MUDBATH', { bg: '#1a120a', crowd: ['#4a3a2a', '#5a4630', '#6a5238', '#3a2c1e', '#7a5a3a'], wall: '#2a1e14', base: '#6a4c2a', bands: ['#6a4a2a', '#745430'], line: 'rgba(235,225,200,.85)', mark: 'rgba(255,255,255,.8)', vig: 0.34 }),
    // futsal courts: walled, no crowd round the pitch
    fs_wood: mkTheme('HARDWOOD ARENA', { bg: '#14100c', crowd: ['#2a2018', '#3a2c20', '#4a3828'], wall: '#2a1c10', base: '#c58a4a', bands: ['#c88c4c', '#d29a5a'], line: 'rgba(255,255,255,.95)', mark: 'rgba(40,90,170,.9)', vig: 0.22, cage: '#e8d8b8' }),
    fs_blue: mkTheme('BLUE COURT', { bg: '#0a1020', crowd: ['#1a2848', '#243660', '#2e4478'], wall: '#101a36', base: '#2a5ec0', bands: ['#2c62c6', '#3269d0'], line: 'rgba(255,255,255,.95)', mark: 'rgba(255,207,77,.95)', vig: 0.24, cage: '#9ab8f0' }),
    fs_red: mkTheme('CRIMSON DOME', { bg: '#1a0808', crowd: ['#3a1414', '#521c1c', '#6a2424'], wall: '#2a0e0e', base: '#b02828', bands: ['#b42a2a', '#c03232'], line: 'rgba(255,255,255,.95)', mark: 'rgba(255,230,120,.95)', vig: 0.26, cage: '#f0a0a0' }),
    fs_roof: mkTheme('ROOFTOP CAGE', { bg: '#0c1220', around: 'bricks', crowd: ['#2a3448', '#36425a', '#1e2638', '#445068'], wall: '#1a2232', base: '#3a8a52', bands: ['#3a8a52', '#40965a'], line: 'rgba(255,255,255,.92)', mark: 'rgba(255,210,61,.95)', vig: 0.3, cage: '#c8d2e0' }),
    fs_glass: mkTheme('GLASS CUBE', { bg: '#060a14', crowd: ['#142038', '#1c2e50', '#3df5ff', '#ff3dd0', '#0e1830'], wall: '#0a1226', base: '#101c34', bands: ['#101e38', '#14244a'], line: 'rgba(61,245,255,.95)', mark: 'rgba(255,61,208,.95)', glow: '#3df5ff', vig: 0.36, post: '#3df5ff', cage: '#7ff0ff' }),
  });
  let mapId = 'stadium', TH = THEMES.stadium, pitch = null;
  const thumbs = new Map();
  const fx = { parts: [], texts: [], shake: 0, trail: [], flash: 0, t: 0 };
  let ballSkin = 'classic';
  function setBall(id) { ballSkin = ISO.ballById(id).id; }
  function setMap(id) { if (!THEMES[id] || id === mapId) return; mapId = id; TH = THEMES[id]; pitch = null; }
  // a small picture of a map for the store
  function thumb(id) {
    if (!thumbs.has(id)) thumbs.set(id, buildPitch(THEMES[id] || THEMES.stadium, 0.3));
    return thumbs.get(id);
  }

  function buildPitch(th, res) {
    res = res || 2;
    const cv = document.createElement('canvas'); cv.width = VW * res; cv.height = VH * res;
    const c = cv.getContext('2d'); c.scale(res, res);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // surroundings
    c.fillStyle = th.bg; c.fillRect(0, 0, VW, VH);
    const crowd = th.crowd;
    const dots = (x0, y0, x1, y1) => {
      for (let y = y0; y < y1; y += 7) for (let x = x0 + ((y / 7) % 2) * 3.5; x < x1; x += 7) {
        c.fillStyle = crowd[(rnd() * crowd.length) | 0]; c.globalAlpha = 0.55 + rnd() * 0.4;
        c.beginPath(); c.arc(x + rnd() * 2, y + rnd() * 2, 2.4, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    };
    const bricks = (x0, y0, x1, y1) => {
      for (let y = y0, r = 0; y < y1; y += 10, r++) for (let x = x0 - (r % 2) * 12; x < x1; x += 24) {
        c.fillStyle = crowd[(rnd() * crowd.length) | 0]; c.globalAlpha = 0.75 + rnd() * 0.25;
        c.fillRect(Math.max(x0, x + 1), y + 1, Math.min(22, x1 - x - 1), 8);
      }
      c.globalAlpha = 1;
    };
    const sand = (x0, y0, x1, y1) => {       // towels and parasols
      for (let i = 0, n = ((x1 - x0) * (y1 - y0)) / 2600; i < n; i++) {
        const x = x0 + 8 + rnd() * (x1 - x0 - 16), y = y0 + 8 + rnd() * (y1 - y0 - 16), col = crowd[(rnd() * crowd.length) | 0];
        if (rnd() < 0.5) { c.fillStyle = col; c.fillRect(x - 3, y - 6, 6, 12); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 3, y - 1, 6, 2); }
        else { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 2, y + 2, 8, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.fill();
          c.fillStyle = '#ffffff'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x, y); c.arc(x, y, 8, k * 1.571, k * 1.571 + 0.785); c.fill(); } }
      }
    };
    const fill = th.around === 'bricks' ? bricks : th.around === 'beach' ? sand : dots;
    if (th.around === 'beach') {      // the sea behind the goal
      const g = c.createLinearGradient(0, 0, 0, 70); g.addColorStop(0, '#1d6fa5'); g.addColorStop(0.75, '#4fb6d6'); g.addColorStop(1, '#e9f7f4');
      c.fillStyle = g; c.fillRect(0, 0, VW, 70);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.4;
      for (let i = 0; i < 90; i++) { const x = rnd() * VW, y = 6 + rnd() * 54, w = 10 + rnd() * 26; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 3, x + w, y); c.stroke(); }
    } else { fill(0, 2, VW, 70); c.fillStyle = 'rgba(8,10,14,.45)'; c.fillRect(0, 0, VW, 70); }
    fill(0, VH - 14, VW, VH); fill(2, 70, 50, VH - 14); fill(VW - 48, 70, VW, VH - 14);
    if (th.around === 'bricks') {     // chain-link over the walls
      c.strokeStyle = 'rgba(200,210,225,.13)'; c.lineWidth = 0.8; c.beginPath();
      for (let i = -VH; i < VW; i += 9) { c.moveTo(i, 0); c.lineTo(i + VH, VH); c.moveTo(i + VH, 0); c.lineTo(i, VH); }
      c.stroke();
    }
    // ad boards
    const ads = th.ads;
    const board = (x, y, w, h, i) => {
      const a = ads[i % ads.length];
      c.fillStyle = a[1]; c.fillRect(x, y, w, h);
      c.fillStyle = a[2]; c.font = '800 ' + Math.min(13, h - 6) + 'px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(a[0], x + w / 2, y + h / 2 + 1);
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    for (let i = 0; i < 7; i++) { board(64 + i * 164.6, 72, 164.6, 20, i); board(64 + i * 164.6, VH - 34, 164.6, 20, i + 3); }
    c.fillStyle = th.wall; c.fillRect(50, 72, 14, VH - 86); c.fillRect(VW - 64, 72, 14, VH - 86);
    // playing surface
    c.fillStyle = th.base; c.fillRect(64, 92, VW - 128, VH - 126);
    const bands = 10, bh = FW / bands;
    for (let i = 0; i < bands; i++) { c.fillStyle = th.bands[i % 2 ? 1 : 0]; c.fillRect(OX, OY + i * bh * Z, FH * Z, bh * Z + 0.5); }
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)';
      c.fillRect(64 + rnd() * (VW - 128), 92 + rnd() * (VH - 126), 1.2, 2.4);
    }
    if (th.snow) {      // drifts on the pitch, flakes over everything
      c.save(); c.beginPath(); c.rect(64, 92, VW - 128, VH - 126); c.clip();
      for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.1 + rnd() * 0.16) + ')'; c.beginPath(); c.ellipse(64 + rnd() * (VW - 128), 92 + rnd() * (VH - 126), 20 + rnd() * 50, 6 + rnd() * 12, 0, 0, TAU); c.fill(); }
      c.restore();
      for (let i = 0; i < 500; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.35 + rnd() * 0.5) + ')'; c.beginPath(); c.arc(rnd() * VW, rnd() * VH, 0.6 + rnd() * 1.5, 0, TAU); c.fill(); }
    }
    const vg = c.createRadialGradient(VW / 2, OY + FW * Z / 2, 200, VW / 2, OY + FW * Z / 2, 860);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + th.vig + ')');
    c.fillStyle = vg; c.fillRect(64, 92, VW - 128, VH - 126);
    // markings
    c.save(); c.translate(OX, OY); c.scale(Z, Z);
    if (th.glow) { c.shadowColor = th.glow; c.shadowBlur = 10 * res; }
    c.strokeStyle = th.line; c.lineWidth = 2.5; c.lineJoin = 'round';
    const GC = (GY0 + GY1) / 2;
    c.strokeRect(0, 0, FH, FW);
    if (th.cage) {      // futsal: walls round the court (the goal mouth stays open)
      c.save(); c.shadowBlur = 0; c.strokeStyle = th.cage; c.globalAlpha = 0.85; c.lineWidth = 7; c.lineJoin = 'miter';
      c.beginPath(); c.moveTo(GY0, 0); c.lineTo(0, 0); c.lineTo(0, FW); c.lineTo(FH, FW); c.lineTo(FH, 0); c.lineTo(GY1, 0); c.stroke();
      c.globalAlpha = 0.18; c.lineWidth = 22; c.stroke(); c.restore();
    }
    c.strokeRect(BOXY0, 0, BOXY1 - BOXY0, BOXD);
    c.strokeRect(SIXY0, 0, SIXY1 - SIXY0, SIXD);
    c.fillStyle = th.line; c.beginPath(); c.arc(GC, PEN, 3, 0, TAU); c.fill();
    const da = Math.acos((BOXD - PEN) / CR);
    c.beginPath(); c.arc(GC, PEN, CR, Math.PI / 2 - da, Math.PI / 2 + da); c.stroke();
    c.beginPath(); c.arc(0, 0, 11, 0, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(FH, 0, 11, Math.PI / 2, Math.PI); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = th.net; c.fillRect(GY0, -GD, GY1 - GY0, GD);
    // start spot: 10 yards outside the box, in the centre
    const sy = BOXD + C.TEN;
    c.strokeStyle = th.mark; c.lineWidth = 2; c.setLineDash([5, 5]);
    c.beginPath(); c.moveTo(GC - 40, sy); c.lineTo(GC + 40, sy); c.stroke();
    c.setLineDash([]);
    c.fillStyle = th.mark; c.beginPath(); c.arc(GC, sy, 3.5, 0, TAU); c.fill();
    c.restore();
    return cv;
  }

  function drawNets(c) {
    const w = GY1 - GY0;
    c.save(); c.beginPath(); c.rect(GY0, -GD, w, GD); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 0.8; c.beginPath();
    for (let i = -GD; i < w + GD; i += 7) { c.moveTo(GY0 + i, -GD); c.lineTo(GY0 + i + GD, 0); c.moveTo(GY0 + i + GD, -GD); c.lineTo(GY0 + i, 0); }
    c.stroke(); c.restore();
    c.strokeStyle = TH.post; c.lineWidth = 3.2; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(GY0, 0); c.lineTo(GY0, -GD); c.lineTo(GY1, -GD); c.lineTo(GY1, 0); c.stroke();
  }
  // Target Practice: four boxes in the goal mouth, the lit one is worth 3 points
  function drawTargets(c, G) {
    const lit = G.drill.target, pulse = 0.5 + 0.5 * Math.sin(fx.t * 7);
    ISO.TARGETS.forEach((t, i) => {
      const x = t.y0, w = t.y1 - t.y0, y = -t.z1 * 0.55, h = (t.z1 - t.z0) * 0.55;
      if (i === lit) {
        c.fillStyle = 'rgba(255,207,77,' + (0.28 + 0.3 * pulse) + ')'; c.fillRect(x, y, w, h);
        c.strokeStyle = '#ffcf4d'; c.lineWidth = 1.6; c.strokeRect(x, y, w, h);
        c.beginPath(); c.moveTo(x + w / 2 - 5, y + h / 2); c.lineTo(x + w / 2 + 5, y + h / 2); c.moveTo(x + w / 2, y + h / 2 - 5); c.lineTo(x + w / 2, y + h / 2 + 5); c.stroke();
      } else { c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.strokeRect(x, y, w, h); }
    });
  }
  function drawPosts(c) {
    for (const x of [GY0, GY1]) { c.fillStyle = TH.post; c.beginPath(); c.arc(x, 0, 4.6, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.stroke(); }
  }

  // Figures are only ever drawn facing the camera or away from it: turning left/right is shown with the body and
  // feet (a foot rolling the ball out to that side), never by swinging the whole figure into side profile.
  function dirOf(face) { return { dir: Math.sin(face) < 0 ? 'up' : 'down', flip: false }; }

  // ------------------------------------------------------------ animation
  // Every figure keeps a blended pose. Each frame the state of the player gives a target pose and the drawn pose
  // eases toward it, so running flows into a strike, a skill move back into a run, a fall into getting up, with no
  // frame-to-frame jumps. Nothing here feeds back into the simulation.
  const SP = ISO.Sprites, REST = SP.REST, KEYS = SP.POSE_KEYS;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const anims = new WeakMap();
  let fdt = 0;          // seconds of animation time this frame
  function animOf(key) {
    let A = anims.get(key);
    if (!A) { A = { P: Object.assign({}, REST), dir: 'down', flip: false, pop: 0, pvx: 0, pvy: 0, ax: 0, ay: 0, init: false, ang: null, lie: false }; anims.set(key, A); }
    return A;
  }
  function ease(A, T, rate) {
    const k = A.init ? 1 - Math.exp(-rate * fdt) : 1;
    for (const key of KEYS) { const t = T[key] === undefined ? REST[key] : T[key]; A.P[key] += (t - A.P[key]) * k; }
    A.init = true;
  }
  // which of the three drawn views shows this facing; a little hysteresis stops it flickering on the boundary
  function viewDir(A, face) {
    const sy = Math.sin(face), was = A.dir;
    let d = was === 'up' || was === 'down' ? was : 'down';
    if (sy > 0.25) d = 'down'; else if (sy < -0.25) d = 'up';
    A.dir = d; A.flip = false;
    if (A.init && A.dir !== was) A.pop = 1;
  }
  // the stride: thighs swing, the knee folds as the leg comes through, arms counter-swing. amp 0..1.2, k = sprint 0..1
  function stride(T, ph, amp, k) {
    const leg = (a, t, kn) => { T[t] = Math.sin(a) * (0.6 + 0.28 * k) * amp + 0.06 * amp; T[kn] = 0.1 + (1.0 + 0.4 * k) * amp * Math.max(0, Math.cos(a - 0.35)); };
    leg(ph, 't1', 'k1'); leg(ph + Math.PI, 't2', 'k2');
    T.s1 = -Math.sin(ph) * 0.85 * amp; T.s2 = Math.sin(ph) * 0.85 * amp; T.e1 = T.e2 = 0.3 + 0.8 * amp;
    T.lean = 0.04 + 0.11 * amp + 0.1 * k;
  }

  // target pose (and how it should be shown) for an outfield player
  function playerPose(p, A) {
    const sp = hyp(p.vx, p.vy), st = p.state, T = {}, o = { T, rate: 24, dir: null, flip: null, angle: null, dx: 0, dy: 0 };
    if (st === 'celebrate') {
      const t = fx.t * 6.5;
      T.armsUp = 1; T.air = Math.abs(Math.sin(t)) * 6.5; T.t1 = 0.2 + 0.25 * Math.sin(t * 2); T.k1 = 0.5; T.t2 = 0.2 - 0.25 * Math.sin(t * 2); T.k2 = 0.5; T.ab = 0.25;
      o.dir = 'down';
    } else if (st === 'ankle') {            // ankles broken: stagger, go down, sit there, scramble up
      const u = p.stT / (p.stDur || 0.8), fd = p.fallDir !== undefined ? p.fallDir : p.face + Math.PI;
      o.dir = 'side'; o.flip = Math.cos(fd) > 0; o.rate = 15;
      if (u < 0.2) Object.assign(T, { t1: 1.0, k1: 0.25, t2: -0.8, k2: 0.95, lean: -0.3, s1: -1.5, s2: 1.7, ab: 0.6, e1: 0.3, e2: 0.3 });
      else if (u < 0.8) Object.assign(T, { rot: -1.32, t1: 1.3, k1: 0.55, t2: 0.95, k2: 1.15, s1: -1.0, s2: -0.5, e1: 0.5, e2: 0.7, lean: 0.1 });
      else Object.assign(T, { rot: -0.3, t1: 1.0, k1: 1.6, t2: 0.3, k2: 1.3, lean: 0.3, s1: 0.5, s2: -0.3, e1: 0.8, e2: 0.8 });
    } else if (st === 'slide' || st === 'down') {
      const up = st === 'down' && p.stDur - p.stT < 0.13;         // the last moment on the ground is the get-up
      o.dir = 'side'; o.flip = false; o.angle = p.face; o.rate = up ? 20 : 30;
      if (up) Object.assign(T, { rot: -0.25, t1: 1.0, k1: 1.5, t2: 0.3, k2: 1.3, lean: 0.25, s1: 0.4, s2: -0.3 });
      else Object.assign(T, { rot: -1.15, t1: 1.3, k1: 0.06, t2: 0.6, k2: 0.75, s1: -1.2, s2: 0.4, e1: 0.3, e2: 0.5 });
    } else if (st === 'stumble') {
      const w = Math.sin(fx.t * 26);
      Object.assign(T, { lean: -0.26 + 0.08 * w, t1: 0.75, k1: 0.3, t2: -0.5, k2: 0.7, s1: 1.2 + 0.3 * w, s2: -1.2 - 0.3 * w, ab: 0.7, e1: 0.3, e2: 0.3 });
      o.rate = 30;
    } else if (st === 'tackle' || (st === 'recover' && p.stT < p.stDur * 0.5)) {
      const k = st === 'tackle' ? 1 : 0.45;
      Object.assign(T, { t1: 1.3 * k, k1: 0.05 + 0.3 * (1 - k), t2: -0.75 * k, k2: 0.95 * k + 0.2, lean: 0.3 * k, s1: -0.8 * k, s2: 0.9 * k, e1: 0.5, e2: 0.5 });
      o.rate = st === 'tackle' ? 42 : 20;
    } else if (st === 'skill' && p.skill) {
      const s = p.skill, u = Math.min(0.999, s.t / s.dur), id = s.id;
      const lx = s.sy || 0, ly = -(s.sx || 0), ls = Math.abs(lx) > 0.3 ? Math.sign(lx) : 0;      // the move's sideways direction, on screen
      o.rate = 32;
      stride(T, p.runPh || 0, 0.35, 0);
      if (id === 'stepover') { const w = Math.sin(u * Math.PI * 4); Object.assign(T, { t1: 0.15 + 0.6 * Math.max(0, w), k1: 0.2 + 0.4 * Math.max(0, w), t2: 0.15 + 0.6 * Math.max(0, -w), k2: 0.2 + 0.4 * Math.max(0, -w), spread: 1.4 + 1.8 * Math.abs(w), lean: 0.1, s1: -0.5 * w, s2: 0.5 * w, tilt: 0.08 * w * ls }); }
      else if (id === 'feint') { const d = u < 0.45 ? -1 : 1; Object.assign(T, { tilt: d * ls * 0.24, spread: 2.5, t1: 0.3, k1: 0.6, t2: 0.3, k2: 0.6, ab: 0.45, lean: 0.12 }); }
      else if (id === 'roll') Object.assign(T, { spread: 1.8 + 2.4 * Math.sin(u * Math.PI), t1: 0.4, k1: 0.55, t2: 0.1, k2: 0.3, tilt: ls * 0.1, ab: 0.3 });
      else if (id === 'croqueta') Object.assign(T, { spread: 3.4 * Math.sin(u * Math.PI), tilt: ls * 0.2, t1: 0.25, k1: 0.45, t2: 0.25, k2: 0.45, ab: 0.35 });
      else if (id === 'roulette') Object.assign(T, { t1: 0.6, k1: 0.4, t2: -0.2, k2: 0.55, ab: 0.95, e1: 0.2, e2: 0.2, lean: 0.06 });
      else if (id === 'elastico') { const d = u < 0.45 ? -1 : 1; Object.assign(T, { spread: 3, tilt: d * ls * 0.22, t1: 0.55, k1: 0.3, t2: 0.1, k2: 0.5, ab: 0.4 }); }
      else if (id === 'heel') Object.assign(T, { t1: -0.7, k1: 1.25, t2: 0.5, k2: 0.2, lean: 0.2 });
      else if (id === 'rainbow') { const w = (u - 0.28) / 0.72; if (u < 0.28) Object.assign(T, { t1: 0.45, k1: 0.95, t2: 0.45, k2: 0.95, lean: 0.15 }); else Object.assign(T, { air: Math.sin(Math.PI * w) * 7, t1: -0.5, k1: 1.5, t2: -0.35, k2: 1.4, lean: 0.3, s1: -0.8, s2: -0.8 }); }
      else if (id === 'dragback') { const v = sm(u / 0.6); Object.assign(T, { t1: lerp(0.95, -0.1, v), k1: 0.15, t2: -0.1, k2: 0.35, lean: -0.14 }); }
      else if (id === 'knock') { stride(T, p.runPh || 0, 1, 0); Object.assign(T, { lean: 0.26 }); }
      else if (id === 'nutmeg' && u < 0.35) Object.assign(T, { t1: 1.1, k1: 0.1, t2: -0.4, k2: 0.5, lean: 0.1 });
      else stride(T, p.runPh || 0, 0.9, 0);
      o.dx = lx * (s.lean || 0) * 2.5; o.dy = ly * (s.lean || 0) * 2.5;
    } else if (p.fakeT > 0) {               // fake shot: the foot on the ball's side drags it across to the other side
      const u = sm(1 - p.fakeT / ISO.C.FAKE_T), dg = p.fakeDrag || 1, dl = dg > 0 ? '1' : '2', pl = dg > 0 ? '2' : '1';
      Object.assign(T, { t1: 0.1, k1: 0.2, t2: 0.1, k2: 0.2, s1: 0.2, s2: -0.2, ab: 0.3, lean: 0.06, tilt: dg * 0.1 * Math.sin(u * Math.PI) });
      T['sw' + dl] = dg * 7 * lerp(-1, 1, u); T['sw' + pl] = 0; T['k' + dl] = 0.45 * Math.sin(u * Math.PI);
      o.rate = 40;
    } else if (p.kickT > 0) {               // the strike: back-swing through the ball into the follow-through
      const k = 1 - p.kickT / 0.3, a = k / 0.3;
      Object.assign(T, k < 0.3 ? { t1: lerp(-0.95, 1.4, sm(a)), k1: lerp(1.3, 0.05, a), lean: 0.1 } : { t1: lerp(1.4, 0.5, (k - 0.3) / 0.7), k1: 0.15, lean: -0.12 });
      Object.assign(T, { t2: -0.12, k2: 0.28, s1: -0.9, s2: 1.0, ab: 0.45, e1: 0.4, e2: 0.4 });
      o.rate = 60;
    } else if (p.charge && !p.charge.ft && sp < 60) {        // winding up: the further back the leg, the harder the shot
      const f = clamp(p.charge.t / C.CHG[p.charge.type].full, 0, 1);
      Object.assign(T, { t1: -0.3 - 0.65 * f, k1: 0.5 + 0.8 * f, t2: 0.2, k2: 0.2 + 0.2 * f, lean: 0.06, s1: 0.5, s2: -0.6, ab: 0.3 * f });
      o.rate = 30;
    } else if (st === 'shoulder') {          // shoulder barge: body turned in, near arm tucked, leaning through the contact
      Object.assign(T, { t1: 0.7, k1: 0.5, t2: -0.5, k2: 0.5, lean: 0.4, tilt: 0.12, ab: 0.8, e1: 0.8, e2: 0.2, spread: 1.6 });
      o.rate = 40;
    } else if (p.focus) {                   // focus: a low side-on defending stance, shuffling sideways, eyes on the ball
      const w = Math.sin((p.runPh || 0) * 1.5), m = clamp(sp / 50, 0, 1);
      Object.assign(T, { t1: 0.45 + 0.2 * w * m, k1: 0.9, t2: 0.1 - 0.2 * w * m, k2: 0.9, spread: 2.8 + 1.4 * Math.abs(w) * m, ab: 0.7, e1: 0.8, e2: 0.8, lean: 0.2, tilt: 0.1, bob: -0.4 });
      o.rate = 28;
    } else if (p.jock || p.shield) {        // jockey / shield: low, wide, shuffling
      const w = Math.sin(p.runPh || 0), m = clamp(sp / 60, 0, 1);
      Object.assign(T, { t1: 0.3 + 0.15 * w * m, k1: 0.6, t2: 0.3 - 0.15 * w * m, k2: 0.6, spread: 2.2 + 1.2 * w * m, ab: 0.55, e1: 0.5, e2: 0.5, lean: 0.14 });
    } else if (sp > 18) {
      const amp = clamp(sp / (p.jog || 150), 0.3, 1.2), k = clamp((sp - (p.jog || 150)) / ((p.top || 250) - (p.jog || 150) || 1), 0, 1);
      stride(T, p.runPh || 0, amp, k);
      // moving left/right: no side-on stride. The body stays square to the camera; the ball sits on the far side and the
      // opposite foot drags it across, while the other leg stays planted
      const lat = p.vx / sp, m = clamp((Math.abs(lat) - 0.3) / 0.4, 0, 1);
      if (m > 0) {
        const sg = Math.sign(lat), dl = sg > 0 ? '1' : '2', pl = sg > 0 ? '2' : '1', ph = p.runPh || 0;
        for (const key of ['t1', 'k1', 't2', 'k2', 's1', 's2']) T[key] *= 1 - 0.7 * m;
        T['sw' + dl] = sg * (-4 + 2.2 * (1 + Math.sin(ph))) * m; T['sw' + pl] = 0;
        T['k' + dl] += 0.4 * Math.max(0, Math.cos(ph)) * m; T.tilt = sg * 0.09 * m; T.lean = (T.lean || 0) * (1 - 0.6 * m);
      }
      o.rate = 34;
    } else {
      const br = Math.sin(fx.t * 2.4);
      Object.assign(T, { bob: 0.35 + 0.35 * br, t1: 0.05, t2: -0.05, k1: 0.08, k2: 0.08, s1: 0.06, s2: -0.06, e1: 0.25, e2: 0.25 });
      o.rate = 18;
    }
    return o;
  }
  function keeperPose(k, A) {
    const sp = hyp(k.vx, k.vy), T = {}, o = { T, rate: 24, dir: null, flip: null, angle: null, dx: 0, dy: 0 };
    if (k.state === 'slide' || (k.state === 'ground' && k.slid)) {
      o.dir = 'side'; o.flip = false; o.angle = k.face; o.rate = 30;
      Object.assign(T, { rot: -1.15, t1: 1.3, k1: 0.06, t2: 0.6, k2: 0.75, s1: -1.2, s2: 0.4 });
    } else if (k.state === 'dive' || k.state === 'ground') {
      // The dive runs along the goal line, i.e. sideways on screen: the body launches, stretches out, and lands flat.
      const air = k.state === 'dive', u = air ? Math.min(1, k.stT / (k.diveT || 0.4)) : 1;
      o.dir = 'side'; o.flip = k.diveDir < 0; o.rate = 34;
      o.dy = air ? -Math.sin(u * Math.PI) * (k.high ? 19 : 10) : 0;
      Object.assign(T, { rot: 1.5 * sm(u / 0.5), armsUp: 1, t1: 0.45, k1: 0.3, t2: -0.35, k2: 0.25, e1: 0.1, e2: 0.1 });
    } else if (k.state === 'hold') Object.assign(T, { s1: 0.95, s2: 0.95, e1: 1.35, e2: 1.35, t1: 0.05, t2: -0.05, k1: 0.1, k2: 0.1 });
    else {                                   // set: knees bent, hands out, shuffling across the line
      const w = Math.sin((k.animDist || 0) * 0.16), m = clamp(sp / 80, 0, 1), br = Math.sin(fx.t * 3);
      Object.assign(T, { t1: 0.32, k1: 0.62, t2: 0.32, k2: 0.62, spread: 2.4 + 1.6 * w * m, ab: 0.75, s1: 0.3, s2: 0.3, e1: 0.55, e2: 0.55, lean: 0.14, bob: 0.3 * br });
    }
    return o;
  }

  // frame of a replacement PNG sheet (ISO.SPRITE_OVERRIDES) for a player
  const SKILL_FRAMES = { stepover: [0, 1, 2, 1, 0, 1], feint: [2, 2, 0, 0], knock: [3, 1], roll: [0, 0, 1, 1], croqueta: [2, 1, 0], roulette: null,
    elastico: [0, 0, 0, 2, 2], heel: [3, 3, 1], rainbow: [3, 3, 1, 1, 1], dragback: [3, 3, 1], nutmeg: null };
  function drawSheet(c, p, sheet) {
    const sp = hyp(p.vx, p.vy);
    let anim = 'idle', frame = 0, d = dirOf(p.face), angle = null;
    const runFrame = Math.floor(p.animDist / 7) % 6;
    if (p.state === 'celebrate') { anim = 'celebrate'; frame = Math.floor(fx.t * 9) % 4; d = { dir: 'down', flip: false }; }
    else if (p.state === 'ankle' || p.state === 'slide' || p.state === 'down') { anim = 'slide'; d = { dir: 'side', flip: false }; angle = p.state === 'ankle' && p.fallDir !== undefined ? p.fallDir + Math.PI : p.face; }
    else if (p.state === 'stumble') anim = 'stumble';
    else if (p.state === 'tackle' || p.state === 'shoulder') { anim = 'tackle'; frame = p.stT < 0.08 ? 0 : 1; }
    else if (p.state === 'skill' && p.skill) { const fr = SKILL_FRAMES[p.skill.id]; if (fr) { anim = 'skill'; frame = fr[Math.floor(Math.min(0.999, p.skill.t / p.skill.dur) * fr.length)]; } else { anim = 'run'; frame = runFrame; } }
    else if (p.kickT > 0) { anim = 'kick'; frame = p.kickT > 0.24 ? 0 : p.kickT > 0.12 ? 1 : 2; }
    else if (sp > 22) { anim = sp > p.jog * 1.08 ? 'sprint' : 'run'; frame = runFrame; }
    else frame = Math.floor(fx.t * 2.2) % 2;
    SP.draw(c, sheet, anim, frame, d.dir, p.x, p.y + 3, d.flip, angle);
  }

  // Draw a figure from its blended pose. `key` identifies it between frames.
  function drawFigure(c, p, sheet, key, keeper) {
    const A = animOf(key), o = keeper ? keeperPose(p, A) : playerPose(p, A);
    const T = o.T;
    // lean into acceleration and into turns: the body shows the change of direction, nothing waits for it
    if (fdt > 0) {
      const k = 1 - Math.exp(-9 * fdt);
      A.ax += ((p.vx - A.pvx) / fdt - A.ax) * k; A.ay += ((p.vy - A.pvy) / fdt - A.ay) * k;
      A.pvx = p.vx; A.pvy = p.vy;
    }
    if (o.dir) { if (A.dir !== o.dir || A.flip !== !!o.flip) { A.dir = o.dir; A.flip = !!o.flip; } A.ang = o.angle; A.lie = true; }
    else if (A.lie && Math.abs(A.P.rot) > 0.2) { /* still getting up: keep the lying view until the body is upright */ }
    else { A.lie = false; A.ang = null; viewDir(A, p.face); }
    if (!o.dir && !A.lie && !keeper && (p.state === 'free' || p.state === 'recover')) {
      const fwd = A.ax * Math.cos(p.face) + A.ay * Math.sin(p.face);
      T.lean = (T.lean || 0) + clamp(fwd / 2600, -0.16, 0.2);
      if (A.dir !== 'side') T.tilt = (T.tilt || 0) + clamp(A.ax / 3000, -0.17, 0.17);
    }
    ease(A, T, o.rate);
    A.pop = Math.max(0, A.pop - fdt * 9);
    SP.drawLive(c, sheet, A.P, A.dir, p.x + o.dx, p.y + o.dy + 3, A.flip, A.ang, 1 - 0.14 * A.pop);
    return o;
  }

  // own: this player has the ball.  ls: label scale (the 3D views draw figures much larger than their labels)
  function drawPlayer(c, own, p, sheet, label, key, ls) {
    const col = TEAM_COL[p.team];
    c.save(); c.translate(p.x, p.y);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 2, 12, 5.5, 0, 0, TAU); c.fill();
    c.strokeStyle = col; c.globalAlpha = own ? 0.95 : 0.5; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 2, 14.5, 7, 0, 0, TAU); c.stroke();
    c.restore();

    if (sheet.img) drawSheet(c, p, sheet);
    else {
      if (p.state === 'skill' && p.skill) {      // motion ghost
        const A = animOf(key);
        c.globalAlpha = 0.2; SP.drawLive(c, sheet, A.P, A.dir, p.x - p.vx * 0.05, p.y + 3 - p.vy * 0.05, A.flip, A.ang); c.globalAlpha = 1;
      }
      drawFigure(c, p, sheet, key, false);
    }
    if (p.state === 'ankle') {                    // seeing stars
      const u = p.stT / (p.stDur || 0.8), hy = p.y - 30 - 24 * Math.max(0, 1 - u * 4);
      c.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) { const a = fx.t * 7 + i * 2.1; c.beginPath(); c.arc(p.x + Math.cos(a) * 9, hy + Math.sin(a) * 3.2, 1.7, 0, TAU); c.fill(); }
    }

    c.save(); c.translate(p.x, p.y); if (ls) c.scale(ls, ls);
    // label + arrow
    const top = -57 * (p.def.look.h || 1) / (ls || 1);
    c.fillStyle = col; c.textAlign = 'center';
    if (label) {
      c.beginPath(); c.moveTo(-5, top - 5); c.lineTo(5, top - 5); c.lineTo(0, top + 1); c.closePath(); c.fill();
      c.font = '800 10px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textBaseline = 'bottom';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(label, 0, top - 6); c.fillText(label, 0, top - 6);
    }
    // shot power meter
    if (p.charge) {
      const f = p.charge.ft ? Math.min(1, 0.5 + p.charge.t * 0.5) : Math.max(0.3, Math.min(1, p.charge.t / C.CHG[p.charge.type].full)), w = 38, x = -w / 2, y = 13 / (ls || 1);
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x - 1.5, y - 1.5, w + 3, 8);
      const lim = C.CHG[p.charge.type].over, cooked = !p.charge.ft && p.charge.t > lim;
      c.fillStyle = cooked ? '#ff4d4d' : f > 0.95 ? '#ffb23d' : '#35e08a'; c.fillRect(x, y, w * f, 5);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x + w * 0.78, y - 1.5, 1.2, 8);
      c.font = '800 8px Arial'; c.fillStyle = '#fff'; c.textBaseline = 'top';
      c.fillText(p.charge.ft ? 'FIRST TIME' : cooked ? 'TOO LONG!' : p.charge.type === 'normal' ? '' : p.charge.type === 'chip' ? 'CHIP' : p.charge.type.toUpperCase(), 0, y + 8);
    }
    if (p.exhausted) { c.font = '800 9px Arial'; c.fillStyle = '#ff6b6b'; c.textBaseline = 'top'; c.fillText('TIRED', 0, 12 / (ls || 1)); }
    c.restore();
  }

  function drawKeeper(c, k, sheet, key, ring) {
    const lying = k.state === 'dive' || k.state === 'ground' || k.state === 'slide';
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(k.x, k.y + (lying ? 3 : 2), lying ? 15 : 12, lying ? 6 : 5.5, 0, 0, TAU); c.fill();
    if (ring) { c.strokeStyle = ring; c.globalAlpha = 0.9; c.lineWidth = 2; c.beginPath(); c.ellipse(k.x, k.y + 2, 14.5, 7, 0, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    if (sheet.img) {
      const d = dirOf(k.face), sp = hyp(k.vx, k.vy);
      if (lying) SP.draw(c, sheet, k.state === 'slide' || k.slid ? 'slide' : 'dive', 0, 'side', k.x, k.y + 3, k.state !== 'slide' && !k.slid && k.diveDir < 0, k.state === 'slide' || k.slid ? k.face : null);
      else SP.draw(c, sheet, sp > 25 ? 'run' : 'idle', sp > 25 ? Math.floor(k.animDist / 7) % 6 : Math.floor(fx.t * 2) % 2, d.dir, k.x, k.y + 3, d.flip);
      return;
    }
    drawFigure(c, k, sheet, key, true);
  }

  // The ball spins about the axis it is travelling along, so a sideways touch visibly rolls it sideways.
  let ballAng = 0;
  function drawBall(c, b, x, y, size) {
    const bd = ISO.ballById(ballSkin), img = SP.ball(ballSkin), P = SP.BALL_PX, f = Math.floor(b.rot) % SP.BALL_FRAMES;
    if (hyp(b.vx, b.vy) > 12) ballAng = Math.atan2(b.vy, b.vx);
    if (bd.glow) { c.save(); c.shadowColor = bd.glow; c.shadowBlur = size * 0.9; c.fillStyle = 'rgba(0,0,0,0)'; c.beginPath(); c.arc(x, y, size * 0.45, 0, TAU); c.fillStyle = bd.glow; c.globalAlpha = 0.18; c.fill(); c.restore(); }
    c.save(); c.translate(x, y); c.rotate(ballAng);
    c.drawImage(img, f * P, 0, P, P, -size / 2, -size / 2, size, size);
    c.restore();
  }
  function drawBallShadow(c, b) {
    const k = 1 / (1 + b.z * 0.012);
    c.fillStyle = 'rgba(0,0,0,' + (0.38 * k) + ')'; c.beginPath(); c.ellipse(b.x + b.z * 0.08, b.y + 3, 6.5 * k + 1, 3.2 * k + 0.5, 0, 0, TAU); c.fill();
  }

  // --------------------------------------------------------------- effects
  function burst(x, y, n, cols, sp, life, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (grav ? sp * 0.4 : 0), life: life * (0.5 + Math.random() * 0.5), max: life, col: cols[(Math.random() * cols.length) | 0], g: grav || 0, s: 1.5 + Math.random() * 2.5 });
    }
  }
  function text(x, y, str, col, big) { fx.texts.push({ x, y, str, col: col || '#fff', life: 1.1, big }); }

  function onEvent(G, e) {
    const b = T(G.ball);
    const P = e.p && T(e.p), K = e.k && T(e.k);
    switch (e.type) {
      case 'kick': if (e.shot) burst(b.x, b.y, 6, ['#e9f7ee', '#bfe8cb'], 90, 0.3); break;
      case 'post': fx.shake = Math.max(fx.shake, 5 * e.power); burst(b.x, b.y, 8, ['#ffffff'], 120, 0.3); text(b.x, b.y + 24, 'WOODWORK!', '#fff'); break;
      case 'goal': fx.shake = 12; fx.flash = 1;
        burst(b.x, b.y, 30, ['#ffffff', '#35e08a'], 240, 0.6);
        for (let i = 0; i < 90; i++) fx.parts.push({ x: Math.random() * FH, y: -40 - Math.random() * 160, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 140, life: 2.6, max: 2.6, col: [TEAM_COL[e.team], '#ffffff', '#ffe066'][i % 3], g: 0, s: 3 + Math.random() * 3, conf: Math.random() * TAU });
        break;
      case 'save': fx.shake = Math.max(fx.shake, 3); burst(b.x, b.y, 8, ['#ffffff', '#ffe066'], 130, 0.35); text(K.x, K.y + 46, e.slide ? 'SLID IN' : e.smother ? 'SMOTHERED' : e.weak ? 'SPILLED!' : e.catch ? 'CAUGHT!' : 'SAVE!', '#ffe066'); break;
      case 'tackle': burst(b.x, b.y, 7, TH.turf, 110, 0.35); if (e.on) text(P.x, P.y - 52, 'TACKLE', TEAM_COL[e.p.team]); break;
      case 'lunge': if (e.slide) burst(P.x, P.y, 10, TH.turf, 90, 0.45); break;
      case 'beaten': text(P.x, P.y - 52, 'BEATEN', '#ff8a8a'); break;
      case 'skill': text(P.x, P.y - 58, e.name.toUpperCase(), '#ffffff'); break;
      case 'fake': text(P.x, P.y - 58, 'FAKE SHOT', '#ffffff'); break;
      case 'ankles': fx.shake = Math.max(fx.shake, 4); burst(T(e.on).x, T(e.on).y, 10, ['#ffffff', '#ffe066'], 120, 0.35); text(T(e.on).x, T(e.on).y - 58, 'ANKLES BROKEN!', '#ffe066', true); break;
      case 'botch': text(P.x, P.y - 58, 'HEAVY TOUCH', '#ff8a8a'); break;
      case 'steal': text(P.x, P.y - 52, 'NICKED', TEAM_COL[e.p.team]); break;
      case 'block': burst(b.x, b.y, 6, ['#ffffff'], 100, 0.25); text(P.x, P.y - 52, 'BLOCK', TEAM_COL[e.p.team]); break;
      case 'clear': text(b.x, b.y - 30, 'CLEARED', TEAM_COL[e.team]); break;
      case 'bump': text(P.x, P.y - 52, 'SHOULDER', TEAM_COL[e.p.team]); break;
    }
  }

  function banner(c, str, sub, col, t, y, x) {
    const k = Math.min(1, t * 5), s = (1 + (1 - k) * 0.6) * (y ? 0.72 : 1);
    c.save(); c.translate(x || VW / 2, y || VH / 2 - 10); c.scale(x ? s * 0.62 : s, x ? s * 0.62 : s); c.globalAlpha = k;
    c.font = '900 italic 120px "Avenir Next Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 12; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(str, 0, 0);
    c.fillStyle = col; c.fillText(str, 0, 0);
    if (sub) { c.font = '800 30px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.lineWidth = 6; c.strokeText(sub, 0, 78); c.fillStyle = '#fff'; c.fillText(sub, 0, 78); }
    c.restore();
  }

  // ------------------------------------------------------------ 3D camera
  // A second way of looking at the same pitch: a low camera behind the play with real perspective. It is used only
  // for goal replays and the penalty shootout; the match itself is always drawn top-down by draw2D below.
  // World: X across the pitch (sim y), D out from the goal line (FW - sim x), H up.
  function mkCam(o) { o.ct = Math.cos(o.th); o.st = Math.sin(o.th); o.cx = VW / 2; if (o.cy == null) o.cy = VH / 2; return o; }
  function pr(cam, X, D, H) {
    const g = cam.D - D, v = (H || 0) - cam.H, dep = Math.max(6, g * cam.ct - v * cam.st), k = cam.f / dep;
    return { x: cam.cx + (X - cam.X) * k, y: cam.cy - (g * cam.st + v * cam.ct) * k, s: k };
  }
  const PEN_CAM = mkCam({ X: GCY, D: PEN + 300, H: 260, th: 0.6, f: 1450, cy: 400 });      // high enough that the taker never hides the keeper
  // where a screen point lies on the plane of the goal line (penalty shootout mouse aim)
  function unprojectGoal(sx, sy) {
    const cam = PEN_CAM, a = (sx - cam.cx) / cam.f, b = (cam.cy - sy) / cam.f, g = cam.D;
    const v = (g * (b * cam.ct - cam.st)) / (cam.ct + b * cam.st), dep = g * cam.ct - v * cam.st;
    return { X: cam.X + a * dep, H: v + cam.H };
  }
  // The match camera ("Cinematic" in Camera settings): the goal-replay angle, held for the whole match. It follows the
  // ball and your own players sideways and keeps the deepest figure in frame. Render-only: the sim never sees it.
  const CINE = { off: 625, H: 340, th: 0.47, f: 2200, cy: 340 };
  const LIVE = { X: 0, Dd: 0, init: false, cam: null };
  function liveCam(G, V, dt) {
    const me = G.players[V.me || 0], b = G.ball;
    let td = FW - b.x, sx = b.y;
    if (me && me.state !== 'away') { td = Math.max(td, FW - me.x); sx = (sx + me.y) / 2; }
    for (const p of G.players) if (p.state !== 'away') td = Math.max(td, FW - p.x);
    const tx = clamp(GCY + (sx - GCY) * 0.85, GCY - 170, GCY + 170); td = clamp(td, 45, FW);
    if (!LIVE.init || G.phase === 'countdown' || G.phase === 'ready') { LIVE.X = tx; LIVE.Dd = td; LIVE.init = true; }
    else { const k = 1 - Math.exp(-3.2 * dt); LIVE.X += (tx - LIVE.X) * k; LIVE.Dd += (td - LIVE.Dd) * k; }
    return (LIVE.cam = mkCam({ X: LIVE.X, D: LIVE.Dd + CINE.off, H: CINE.H, th: CINE.th, f: CINE.f, cy: CINE.cy }));
  }
  // where a screen point lies in the sim, through the live camera (mouse aim); null when that camera is not active
  function unprojectLive(sx, sy) {
    const cam = LIVE.cam; if (!cam) return null;
    const a = (sx - cam.cx) / cam.f, b = (cam.cy - sy) / cam.f;
    // the goal mouth: a cursor on the frame or net aims at that spot in the goal
    { const g = cam.D, den = cam.ct + b * cam.st, v = (g * (b * cam.ct - cam.st)) / (den || 1e-6), dep = g * cam.ct - v * cam.st, X = cam.X + a * dep, H = v + cam.H;
      if (den > 0 && dep > 0 && H >= 0 && H <= C.BAR * 1.3 && X >= GY0 - 30 && X <= GY1 + 30) return { x: FW, y: X }; }
    const den = Math.max(0.02, cam.st - b * cam.ct), g = cam.H * (cam.ct + b * cam.st) / den, dep = g * cam.ct + cam.H * cam.st;
    return { x: FW - (cam.D - g), y: cam.X + a * dep };
  }
  function quad(c, cam, pts, fill) {
    c.beginPath();
    pts.forEach((q, i) => { const a = pr(cam, q[0], q[1], q[2]); if (i) c.lineTo(a.x, a.y); else c.moveTo(a.x, a.y); });
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  // a painted line on the grass: cut into short pieces so its width follows the perspective
  function gline(c, cam, pts, w) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, d0] = pts[i], [x1, d1] = pts[i + 1], n = Math.max(1, Math.ceil(hyp(x1 - x0, d1 - d0) / 45));
      for (let j = 0; j < n; j++) {
        const a = pr(cam, x0 + ((x1 - x0) * j) / n, d0 + ((d1 - d0) * j) / n, 0), b = pr(cam, x0 + ((x1 - x0) * (j + 1)) / n, d0 + ((d1 - d0) * (j + 1)) / n, 0);
        c.lineWidth = Math.max(1, w * (a.s + b.s) / 2); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
  }
  let crowdTex = null, crowdFor = null;
  function crowdTexture() {
    if (crowdTex && crowdFor === TH) return crowdTex;
    crowdFor = TH; crowdTex = document.createElement('canvas'); crowdTex.width = 512; crowdTex.height = 256;
    const c = crowdTex.getContext('2d'); let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = TH.bg; c.fillRect(0, 0, 512, 256);
    for (let y = 4; y < 256; y += 9) for (let x = ((y / 9) % 2) * 4.5; x < 512; x += 9) {
      c.fillStyle = TH.crowd[(rnd() * TH.crowd.length) | 0]; c.globalAlpha = 0.55 + rnd() * 0.4;
      c.beginPath(); c.arc(x + rnd() * 2, y + rnd() * 2, 3.1, 0, TAU); c.fill();
    }
    return crowdTex;
  }
  function drawGround3D(c, cam) {
    c.fillStyle = TH.bg; c.fillRect(0, 0, VW, VH);
    // the stand behind the goal, and the boards in front of it
    const wall = pr(cam, GCY, -84, 0), tex = crowdTexture(), tw = 512 * wall.s * 0.55, th = 256 * wall.s * 0.55;
    if (wall.y > 0) {
      for (let y = wall.y - th; y > -th; y -= th) for (let x = ((wall.x % tw) + tw) % tw - tw; x < VW; x += tw) c.drawImage(tex, x, y, tw + 1, th + 1);
      const g = c.createLinearGradient(0, 0, 0, wall.y); g.addColorStop(0, 'rgba(6,8,12,.86)'); g.addColorStop(1, 'rgba(6,8,12,.3)');
      c.fillStyle = g; c.fillRect(0, 0, VW, wall.y);
    }
    const far = Math.min(cam.D + (cam.H * cam.st) / cam.ct * 0.85, FW + 420);
    quad(c, cam, [[-900, -84, 0], [FH + 900, -84, 0], [FH + 900, far, 0], [-900, far, 0]], TH.wall);
    quad(c, cam, [[-70, -60, 0], [FH + 70, -60, 0], [FH + 70, far, 0], [-70, far, 0]], TH.base);
    const bh = FW / 10;
    for (let i = 0; i * bh < far; i++) quad(c, cam, [[0, i * bh, 0], [FH, i * bh, 0], [FH, Math.min(far, (i + 1) * bh), 0], [0, Math.min(far, (i + 1) * bh), 0]], TH.bands[i % 2]);
    const ads = TH.ads, bw = 150;
    for (let i = -3; i < 8; i++) {
      const a = pr(cam, i * bw, -62, 18), b = pr(cam, (i + 1) * bw, -62, 0), ad = ads[((i % ads.length) + ads.length) % ads.length];
      c.fillStyle = ad[1]; c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.fillStyle = ad[2]; c.font = '800 ' + Math.max(6, 11.5 * a.s) + 'px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ad[0], (a.x + b.x) / 2, (a.y + b.y) / 2 + 1);
    }
    // markings
    c.strokeStyle = TH.line; c.lineCap = 'butt';
    if (TH.glow) { c.shadowColor = TH.glow; c.shadowBlur = 8; }
    const fl = Math.min(far, FW);
    if (TH.cage) {      // futsal: low glass-and-board walls along both sides
      for (const x of [0, FH]) quad(c, cam, [[x, 0, 0], [x, fl, 0], [x, fl, 34], [x, 0, 34]], 'rgba(255,255,255,.12)');
      c.strokeStyle = TH.cage; c.lineWidth = 2;
      for (const x of [0, FH]) { const a = pr(cam, x, 0, 34), b = pr(cam, x, fl, 34); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    }
    gline(c, cam, [[0, fl], [0, 0], [FH, 0], [FH, fl]], 3.2);
    if (far >= FW) gline(c, cam, [[0, FW], [FH, FW]], 3.2);      // the far end line, so the whole boundary reads
    gline(c, cam, [[BOXY0, 0], [BOXY0, BOXD], [BOXY1, BOXD], [BOXY1, 0]], 2.5);
    gline(c, cam, [[SIXY0, 0], [SIXY0, SIXD], [SIXY1, SIXD], [SIXY1, 0]], 2.5);
    const da = Math.acos((BOXD - PEN) / CR), arc = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI / 2 - da + (2 * da * i) / 14; arc.push([GCY + Math.cos(a) * CR, PEN + Math.sin(a) * CR]); }
    gline(c, cam, arc, 2.5);
    c.shadowBlur = 0;
    const spot = pr(cam, GCY, PEN, 0);
    c.fillStyle = TH.line; c.beginPath(); c.ellipse(spot.x, spot.y, 3.4 * spot.s, 3.4 * spot.s * 0.5, 0, 0, TAU); c.fill();
    // vignette
    const vg = c.createRadialGradient(VW / 2, VH * 0.55, 260, VW / 2, VH * 0.55, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (TH.vig + 0.12) + ')');
    c.fillStyle = vg; c.fillRect(0, 0, VW, VH);
  }
  // the goal as a box: netting first (everything in the goal is drawn over it), the frame later, in depth order
  function drawNet3D(c, cam) {
    const P = (x, d, h) => pr(cam, x, d, h);
    const mesh = (a, b, cc, d, n, m) => {         // a quad a-b-cc-d with n x m netting
      c.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n; c.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); c.lineTo(d.x + (cc.x - d.x) * t, d.y + (cc.y - d.y) * t); }
      for (let i = 0; i <= m; i++) { const t = i / m; c.moveTo(a.x + (d.x - a.x) * t, a.y + (d.y - a.y) * t); c.lineTo(b.x + (cc.x - b.x) * t, b.y + (cc.y - b.y) * t); }
      c.stroke();
    };
    const b0 = P(GY0, -GD, 0), b1 = P(GY1, -GD, 0), b2 = P(GY1, -GD, C.BAR), b3 = P(GY0, -GD, C.BAR);
    const f0 = P(GY0, 0, 0), f1 = P(GY1, 0, 0), f2 = P(GY1, 0, C.BAR), f3 = P(GY0, 0, C.BAR);
    c.fillStyle = TH.net; c.beginPath(); c.moveTo(b0.x, b0.y); c.lineTo(b1.x, b1.y); c.lineTo(b2.x, b2.y); c.lineTo(b3.x, b3.y); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(f0.x, f0.y); c.lineTo(f1.x, f1.y); c.lineTo(b1.x, b1.y); c.lineTo(b0.x, b0.y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = Math.max(0.6, 0.35 * b0.s);
    mesh(b3, b2, b1, b0, 19, 8); mesh(f3, b3, b0, f0, 4, 8); mesh(b2, f2, f1, b1, 4, 8); mesh(f3, f2, b2, b3, 19, 4);
    c.strokeStyle = TH.post; c.lineWidth = Math.max(1, 1.4 * b0.s); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(b0.x, b0.y); c.lineTo(b3.x, b3.y); c.lineTo(b2.x, b2.y); c.lineTo(b1.x, b1.y); c.moveTo(b3.x, b3.y); c.lineTo(f3.x, f3.y); c.moveTo(b2.x, b2.y); c.lineTo(f2.x, f2.y); c.stroke();
  }
  function drawFrame3D(c, cam) {
    const f0 = pr(cam, GY0, 0, 0), f1 = pr(cam, GY1, 0, 0), f2 = pr(cam, GY1, 0, C.BAR), f3 = pr(cam, GY0, 0, C.BAR);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [col, w] of [['rgba(0,0,0,.45)', 4.6], [TH.post, 3.4]]) {
      c.strokeStyle = col; c.lineWidth = Math.max(2, w * f0.s);
      c.beginPath(); c.moveTo(f0.x, f0.y); c.lineTo(f3.x, f3.y); c.lineTo(f2.x, f2.y); c.lineTo(f1.x, f1.y); c.stroke();
    }
  }

  // Draw a scene (players, keeper and ball in view coordinates) through a 3D camera.
  // S: { players: [{ v, sheet, label, key, own }], keeper: { v, sheet, key, ring }, ball }
  function drawScene3D(c, S, cam, G) {
    drawGround3D(c, cam);
    drawNet3D(c, cam);
    if (G && G.drill && G.drill.kind === 'target') { /* targets are a top-down drill */ }
    const b = S.ball, ents = [];
    const behind = (v) => (cam.D - v.y) * cam.ct + cam.H * cam.st < 40;      // at or behind the lens: skip rather than draw it huge
    const fig = (v, f) => { if (behind(v)) return; const q = pr(cam, v.x, v.y, 0), o = Object.assign(Object.create(v), { x: 0, y: 0 }); ents.push({ d: v.y, f: () => { c.save(); c.translate(q.x, q.y); c.scale(q.s, q.s); f(o, 1.7 / q.s); c.restore(); } }); };
    for (const e of S.players) if (e.v.state !== 'away') fig(e.v, (o, ls) => drawPlayer(c, e.own, o, e.sheet, e.label, e.key, ls));
    fig(S.keeper.v, (o) => drawKeeper(c, o, S.keeper.sheet, S.keeper.key, S.keeper.ring));
    ents.push({ d: 0.5, f: () => drawFrame3D(c, cam) });
    const bs = pr(cam, b.x, b.y, 0), bq = pr(cam, b.x, b.y, b.z);
    if (!behind(b)) ents.push({ d: b.y + 0.6, f: () => {
      const k = 1 / (1 + b.z * 0.012);
      c.fillStyle = 'rgba(0,0,0,' + 0.38 * k + ')'; c.beginPath(); c.ellipse(bs.x, bs.y + 2 * bs.s, (6.5 * k + 1) * bs.s, (3 * k + 0.5) * bs.s, 0, 0, TAU); c.fill();
      drawBall(c, b, bq.x, bq.y - 5 * bq.s, 13 * bq.s);
      if (bq.y - 5 * bq.s < 26) {      // punted out of the top of the frame: keep it in sight at the edge, with a line down to its shadow
        const mx = clamp(bq.x, 24, VW - 24);
        c.save(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; c.setLineDash([4, 5]);
        c.beginPath(); c.moveTo(mx, 44); c.lineTo(bs.x, bs.y); c.stroke(); c.setLineDash([]);
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.ellipse(bs.x, bs.y, 9 * bs.s + 4, 4.5 * bs.s + 2, 0, 0, TAU); c.stroke();
        c.restore();
        drawBall(c, b, mx, 30, 15);
        c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.moveTo(mx - 6, 50); c.lineTo(mx + 6, 50); c.lineTo(mx, 58); c.closePath(); c.fill();
      }
    } });
    ents.sort((a, z) => a.d - z.d);
    for (const e of ents) e.f();
  }
  // particles and floating text live on the ground plane of the top-down view; show them through the camera
  function drawFx3D(c, cam, dt) {
    for (const p of fx.parts) {
      p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0 || p.conf !== undefined) continue;
      const q = pr(cam, p.x, p.y, 4);
      c.globalAlpha = Math.min(1, p.life / (p.max * 0.5)); c.fillStyle = p.col; c.fillRect(q.x - p.s * q.s / 2, q.y - p.s * q.s / 2, p.s * q.s, p.s * q.s);
    }
    c.globalAlpha = 1; fx.parts = fx.parts.filter((p) => p.life > 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of fx.texts) {
      t.life -= dt; t.h = (t.h || 0) + 14 * dt;
      if (t.life <= 0) continue;
      const q = pr(cam, t.x, t.y + 40, 58 + t.h);
      c.globalAlpha = Math.min(1, t.life * 2.5);
      c.font = '800 italic 24px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
      c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.8)'; c.strokeText(t.str, q.x, q.y); c.fillStyle = t.col; c.fillText(t.str, q.x, q.y);
    }
    c.globalAlpha = 1; fx.texts = fx.texts.filter((t) => t.life > 0);
  }

  // ------------------------------------------------------------ goal replay
  // While a match is in play the renderer keeps the last few seconds of what it drew (positions and the handful of
  // fields the figures are posed from). A goal plays that tape back through the cinematic camera. The tape is a copy:
  // playing it reads nothing from, and writes nothing to, the match.
  const TAPE_S = 7.5, RP = { tape: [], clock: 0, goalAt: -1, on: false, ents: null, cam: null, seenGoal: false };
  const snapP = (p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face, state: p.state, stT: p.stT, stDur: p.stDur, kickT: p.kickT, runPh: p.runPh, animDist: p.animDist,
    fallDir: p.fallDir, jock: p.jock, shield: p.shield, exhausted: false, jog: p.jog, top: p.top,
    charge: p.charge ? { t: p.charge.t, type: p.charge.type, ft: p.charge.ft } : null,
    skill: p.skill ? { id: p.skill.id, t: p.skill.t, dur: p.skill.dur, sx: p.skill.sx, sy: p.skill.sy, lean: p.skill.lean } : null });
  const snapK = (k) => ({ x: k.x, y: k.y, vx: k.vx, vy: k.vy, face: k.face, state: k.state, stT: k.stT, diveT: k.diveT, diveDir: k.diveDir, slid: k.slid, animDist: k.animDist, high: k.high });
  function record(G, dt) {
    RP.clock += dt;
    const b = G.ball;
    RP.tape.push({ t: RP.clock, pl: G.players.map(snapP), k: snapK(G.keeper), b: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, rot: b.rot }, own: b.owner ? b.owner.idx : -1 });
    while (RP.tape.length && RP.tape[0].t < RP.clock - TAPE_S) RP.tape.shift();
  }
  const NUM = ['x', 'y', 'vx', 'vy', 'stT', 'kickT', 'runPh', 'animDist', 'z', 'rot'];
  function mixInto(dst, a, b, f) {
    for (const k in a) dst[k] = a[k];
    if (!b) return;
    for (const k of NUM) if (typeof a[k] === 'number' && typeof b[k] === 'number' && a.state === b.state) dst[k] = a[k] + (b[k] - a[k]) * f;
    if (typeof a.face === 'number' && typeof b.face === 'number') { let d = b.face - a.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; dst.face = a.face + d * f; }
  }
  // tape time -> the replay's own copies of the players, keeper and ball
  function seek(G, t) {
    const tape = RP.tape;
    let i = 0;
    while (i + 1 < tape.length && tape[i + 1].t <= t) i++;
    const a = tape[i], b = tape[i + 1], f = b ? clamp((t - a.t) / (b.t - a.t || 1), 0, 1) : 0;
    if (!RP.ents) RP.ents = { pl: G.players.map((p) => ({ def: p.def, team: p.team, idx: p.idx })), k: {}, b: {} };
    RP.ents.pl.forEach((e, j) => mixInto(e, a.pl[j], b && b.pl[j], f));
    mixInto(RP.ents.k, a.k, b && b.k, f); mixInto(RP.ents.b, a.b, b && b.b, f);
    RP.ents.own = a.own;
    return RP.ents;
  }
  // Timeline of the goal pause, in real seconds since the ball went in:
  //   celebration (live) -> cut to the replay -> build-up at full speed -> the finish in slow motion -> back to the match
  const RT = { celeb: 1.25, fade: 0.45, lead: 3.3, slowFrom: 0.9, tail: 0.85, slow: 0.52, out: 0.4 };
  function replayState(G, V) {
    if (!G.replay || V.quiet || G.phase !== 'goal' || !RP.tape.length || RP.goalAt < 0) return null;
    const e = (G.goalDur - G.phaseT) / C.SPEED, total = G.goalDur / C.SPEED, end = total - 0.1;
    if (e < RT.celeb || e > end) return null;
    const u = e - RT.celeb, t0 = Math.max(RP.goalAt - RT.lead, RP.tape[0].t), tSlow = Math.max(t0, RP.goalAt - RT.slowFrom), full = tSlow - t0;
    const t = u < full ? t0 + u : Math.min(tSlow + (u - full) * RT.slow, RP.goalAt + RT.tail);
    const mix = Math.min(sm(u / RT.fade), sm((end - e) / RT.out));          // 0 = match view, 1 = fully in the replay
    return { t, mix, u, slowmo: u >= full };
  }
  function replayCam(E, st, dt) {
    const bx = E.b.y, bd = FW - E.b.x;               // view coordinates of the ball
    const tx = clamp(GCY + (bx - GCY) * 0.7, GCY - 190, GCY + 190), td = clamp(bd, 45, FW);
    const cine = !!LIVE.cam;
    if (!RP.cam) RP.cam = cine ? { X: LIVE.X, Dd: LIVE.Dd, zoom: 0 } : { X: tx, Dd: td, zoom: 0 };
    const k = 1 - Math.exp(-3.2 * dt);
    RP.cam.X += (tx - RP.cam.X) * k; RP.cam.Dd += (td - RP.cam.Dd) * k;
    RP.cam.zoom += ((st.slowmo ? 1 : 0) - RP.cam.zoom) * (1 - Math.exp(-1.6 * dt));
    const m = cine ? 1 : st.mix, z = RP.cam.zoom;
    // from a high, steep look (close to the match view) down to the low broadcast angle; a slow push-in on the finish
    return mkCam({ X: RP.cam.X, D: RP.cam.Dd + lerp(640, CINE.off - 40 * z, m), H: lerp(620, CINE.H - 20 * z, m), th: lerp(0.98, CINE.th, m), f: lerp(1250, CINE.f + 80 * z, m), cy: lerp(360, CINE.cy, m) });
  }
  function drawReplay(c, G, V, st, dt) {
    const E = seek(G, st.t), cam = replayCam(E, st, dt);
    const S = {
      players: E.pl.map((e, i) => ({ v: viewP(e), sheet: V.sheets[i], label: V.labels[i], key: e, own: E.own === i })),
      keeper: { v: viewP(E.k), sheet: V.keeperSheet, key: E.k },
      ball: Object.assign({}, E.b, { x: E.b.y, y: FW - E.b.x, vx: E.b.vy, vy: -E.b.vx }),
    };
    c.save(); c.globalAlpha = st.mix;
    drawScene3D(c, S, cam, G);
    c.restore();
    // broadcast dressing
    const bar = 46 * st.mix;
    c.fillStyle = '#05070a'; c.fillRect(0, 0, VW, bar); c.fillRect(0, VH - bar, VW, bar);
    c.globalAlpha = st.mix;
    const lg = G.goals[G.goals.length - 1], who = lg ? G.players[lg.by].def.short.toUpperCase() : '';
    c.font = '900 italic 30px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const bx = 86, by = VH - bar - 34;
    c.fillStyle = 'rgba(6,10,14,.82)'; c.fillRect(bx - 16, by - 22, 190 + c.measureText(who).width, 44);
    c.fillStyle = TEAM_COL[1 - G.concede]; c.fillRect(bx - 16, by - 22, 6, 44);
    if (Math.sin(fx.t * 6) > -0.3) { c.fillStyle = '#ff4d4d'; c.beginPath(); c.arc(bx + 6, by, 6, 0, TAU); c.fill(); }
    c.fillStyle = '#fff'; c.fillText('REPLAY', bx + 22, by + 1);
    c.fillStyle = TEAM_COL[1 - G.concede]; c.fillText(who, bx + 140, by + 1);
    c.textAlign = 'right'; c.font = '800 20px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.fillStyle = 'rgba(255,255,255,.8)';
    c.fillText(G.score[0] + ' – ' + G.score[1] + (st.slowmo ? '   ·   SLOW MOTION' : '') + (V.canSkip ? '   ·   ' + ISO.Input.keyLabel('shoot').toUpperCase() + ' TO SKIP' : ''), VW - 86, by + 1);
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ frame
  function draw2D(c, G, V, dt) {
    c.save();
    if (fx.shake > 0.2) { c.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake); fx.shake *= Math.pow(0.004, dt); } else fx.shake = 0;
    c.drawImage(pitch, 0, 0, VW, VH);
    c.translate(OX, OY); c.scale(Z, Z);

    const b = Object.assign(Object.create(G.ball), { x: G.ball.y, y: FW - G.ball.x, vx: G.ball.vy, vy: -G.ball.vx }), sp = hyp(b.vx, b.vy);
    // ball trail
    if (sp > 430 && !b.holder && dt > 0) fx.trail.push({ x: b.x, y: b.y - b.z * 0.55, life: 0.22 });
    for (const t of fx.trail) { t.life -= dt; if (t.life > 0) { c.fillStyle = 'rgba(255,255,255,' + t.life * 1.6 + ')'; c.beginPath(); c.arc(t.x, t.y, 5 * (t.life / 0.22), 0, TAU); c.fill(); } }
    fx.trail = fx.trail.filter((t) => t.life > 0);

    drawNets(c);          // the net sits behind everything, so the keeper stands in front of the goal
    if (G.drill && G.drill.kind === 'target') drawTargets(c, G);
    drawBallShadow(c, b);
    const ents = [];
    G.players.forEach((p0, i) => { const p = viewP(p0); ents.push({ y: p.y, f: () => drawPlayer(c, G.ball.owner === p0, p, V.sheets[i], V.labels[i], p0) }); });
    { const k = viewP(G.keeper); ents.push({ y: k.y, f: () => drawKeeper(c, k, V.keeperSheet, G.keeper) }); }
    ents.push({ y: b.y + (b.z > 20 ? 400 : 0.5), f: () => { const size = 13 + b.z * 0.07; drawBall(c, b, b.x, b.y - b.z * 0.55 - 1, size); } });
    ents.sort((a, z) => a.y - z.y);
    for (const e of ents) e.f();
    drawPosts(c);

    // particles + floating text
    for (const p of fx.parts) {
      p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) continue;
      c.globalAlpha = Math.min(1, p.life / (p.max * 0.5)); c.fillStyle = p.col;
      if (p.conf !== undefined) { c.save(); c.translate(p.x, p.y); c.rotate(p.conf + p.life * 6); c.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); c.restore(); }
      else c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    c.globalAlpha = 1;
    fx.parts = fx.parts.filter((p) => p.life > 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of fx.texts) {
      t.life -= dt; t.y -= 22 * dt;
      if (t.life <= 0) continue;
      c.globalAlpha = Math.min(1, t.life * 2.5);
      c.font = '800 italic 13px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(6,10,14,.8)'; c.strokeText(t.str, t.x, t.y); c.fillStyle = t.col; c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;
    fx.texts = fx.texts.filter((t) => t.life > 0);
    c.restore();
  }

  // the penalty shootout, seen from behind the taker
  function drawPenalty(c, G, V, dt) {
    const so = G.drill.so, mine = so.turn === 'shoot';
    const S = {
      players: G.players.map((p0, i) => ({ v: viewP(p0), sheet: V.sheets[i], label: i ? (p0.def.short || 'CPU').toUpperCase() : '', key: p0, own: G.ball.owner === p0 })),
      keeper: { v: viewP(G.keeper), sheet: mine ? V.keeperSheet : V.myKeeperSheet || V.keeperSheet, key: G.keeper, ring: mine ? null : TEAM_COL[0] },
      ball: Object.assign(Object.create(G.ball), { x: G.ball.y, y: FW - G.ball.x, vx: G.ball.vy, vy: -G.ball.vx }),
    };
    c.save();
    if (fx.shake > 0.2) { c.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake); fx.shake *= Math.pow(0.004, dt); } else fx.shake = 0;
    drawScene3D(c, S, PEN_CAM, G);
    drawFx3D(c, PEN_CAM, dt);
    c.restore();
    fx.trail.length = 0;
  }
  // the match through the replay camera (Camera settings: Cinematic)
  function drawLive3D(c, G, V, cam, dt) {
    const S = {
      players: G.players.map((p0, i) => ({ v: viewP(p0), sheet: V.sheets[i], label: V.labels[i], key: p0, own: G.ball.owner === p0 })),
      keeper: { v: viewP(G.keeper), sheet: V.keeperSheet, key: G.keeper },
      ball: Object.assign(Object.create(G.ball), { x: G.ball.y, y: FW - G.ball.x, vx: G.ball.vy, vy: -G.ball.vx }),
    };
    c.save();
    if (fx.shake > 0.2) { c.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake); fx.shake *= Math.pow(0.004, dt); } else fx.shake = 0;
    drawScene3D(c, S, cam, G);
    drawFx3D(c, cam, dt);
    c.restore();
    fx.trail.length = 0;
  }
  function penaltyOverlay(c, G, V) {
    const D = G.drill, so = D.so, mine = so.turn === 'shoot', N = D.total;
    // the shootout so far: a row of kicks for each side
    const rows = [[V.labels[0] || 'YOU', so.kicks[0], TEAM_COL[0]], ['OPPONENTS', so.kicks[1], TEAM_COL[1]]];
    const n = Math.max(N, so.kicks[0].length, so.kicks[1].length + (mine ? 0 : 1)), x0 = VW / 2 - (n * 26) / 2 + 40, y0 = 100;
    c.fillStyle = 'rgba(6,10,14,.72)'; c.fillRect(x0 - 150, y0 - 16, n * 26 + 170, 58);
    rows.forEach(([name, kicks, col], r) => {
      const y = y0 + r * 26;
      c.font = '800 14px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(name, x0 - 16, y + 1);
      for (let i = 0; i < n; i++) {
        const res = kicks[i], cx = x0 + i * 26 + 4, now = !res && i === kicks.length && (r === 0) === mine && G.phase !== 'end';
        c.beginPath(); c.arc(cx, y, 8, 0, TAU);
        c.fillStyle = res === 'goal' ? '#35e08a' : res ? '#f1735f' : 'rgba(255,255,255,.08)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = now ? '#ffffff' : res ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.3)'; c.stroke();
        if (res && res !== 'goal') { c.strokeStyle = '#1f2433'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 3.5, y - 3.5); c.lineTo(cx + 3.5, y + 3.5); c.moveTo(cx + 3.5, y - 3.5); c.lineTo(cx - 3.5, y + 3.5); c.stroke(); }
      }
    });
    if (G.phase === 'countdown' || (G.phase === 'play' && !D.shot)) {
      const K = (a) => ISO.Input.keyLabel(a).toUpperCase();
      const t = mine ? 'YOUR KICK  ·  AIM WITH ' + K('left') + ' / ' + K('right') + ', HOLD ' + K('shoot') + ' FOR POWER'
        : 'YOU ARE IN GOAL  ·  ' + K('left') + ' / ' + K('right') + ' TO MOVE,  HOLD A SIDE + ' + K('shoot') + ' TO DIVE  (+ ' + K('up') + ' GOES HIGH)';
      c.font = '800 italic 19px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(t, VW / 2, VH - 38); c.fillStyle = mine ? '#35e08a' : '#ffe066'; c.fillText(t, VW / 2, VH - 38);
    }
  }

  function draw(c, G, V, dt) {
    if (!pitch) pitch = buildPitch(TH);
    fx.t += dt; fdt = dt;
    const pen = !!(G.drill && G.drill.so);
    // the tape runs whenever a replay-able match is live; a new rep, a new match or the end of the goal pause resets the replay
    if (G.phase !== 'goal') { RP.goalAt = -1; RP.ents = null; RP.cam = null; }
    else if (RP.goalAt < 0) RP.goalAt = RP.clock;
    const rs = replayState(G, V);
    // the cinematic match camera: never in the shootout, the menu demo or the target drill (those are drawn top-down)
    const cine = V.cam === 'cinematic' && !V.quiet && !pen && !(G.drill && G.drill.kind === 'target');
    const lcam = cine ? liveCam(G, V, dt) : ((LIVE.cam = null), (LIVE.init = false), null);
    if (G.replay && !V.quiet && dt > 0 && !rs && (G.phase === 'play' || G.phase === 'goal')) record(G, dt);
    if (G.phase === 'countdown' && RP.tape.length && RP.goalAt < 0) RP.tape.length = 0;

    if (pen) drawPenalty(c, G, V, dt);
    else if (rs && rs.mix >= 0.999) {            // fully in the replay: the match view is not drawn at all
      for (const p of fx.parts) p.life -= dt; for (const t of fx.texts) t.life -= dt;
      fx.parts = fx.parts.filter((p) => p.life > 0); fx.texts = fx.texts.filter((t) => t.life > 0); fx.shake = 0;
    } else if (cine) drawLive3D(c, G, V, lcam, dt);
    else draw2D(c, G, V, dt);
    if (rs) { fdt = dt * (rs.slowmo ? RT.slow : 1); drawReplay(c, G, V, rs, dt); fdt = dt; }

    if (fx.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + fx.flash * 0.35 + ')'; c.fillRect(0, 0, VW, VH); fx.flash -= dt * 3; }
    if (V.quiet) return;
    if (pen) penaltyOverlay(c, G, V);
    drawAim(c, G, V);
    overlays(c, G, V, rs, pen);
  }

  // countdown / GOAL / SAVED / rebound-hint banners: shared by the 2D views and the 3D mode
  function overlays(c, G, V, rs, pen) {
    if (G.phase === 'countdown') {
      const n = Math.ceil(G.phaseT / G.cdTick), frac = (G.phaseT / G.cdTick) % 1;
      const sub = pen ? (G.drill.so.sudden ? 'SUDDEN DEATH · ' : '') + (G.drill.so.turn === 'shoot' ? 'YOUR KICK' : (G.players[1].def.short || 'CPU').toUpperCase() + ' TO SHOOT — SAVE IT')
        : G.drill ? G.drill.name + ' · ' + (G.drill.tip ? G.drill.tip + ' · ' + (G.drill.n + 1) + ' OF ' + G.drill.total : G.drill.kind === 'target' ? 'HIT ' + ISO.TARGETS[G.drill.target].name : G.drill.kind === 'chip' ? 'LOB THE KEEPER' : 'KICK ' + (G.drill.n + 1) + ' OF ' + G.drill.total) : (V.teams || V.labels)[G.attacker] + ' ATTACKS';
      if (n > 0) banner(c, String(n), sub, '#ffffff', 1 - frac, pen ? 400 : OY + 120, pen ? 215 : 0);
    } else if (G.phase === 'goal') {
      const t = (G.goalDur || C.GOAL_T) - G.phaseT, lg = G.goals[G.goals.length - 1], name = G.players[lg && lg.by != null ? lg.by : 1 - G.concede].def.short;
      if (G.drill) banner(c, G.drill.msg, G.drill.sub, pen && G.drill.so.turn !== 'shoot' ? '#f1735f' : '#35e08a', t, pen ? 400 : OY + 130, pen ? 215 : 0);
      else if (!rs || rs.mix < 0.5) banner(c, 'GOAL!', (G.own ? 'OWN GOAL · ' : '') + name + '  ' + G.score[0] + ' – ' + G.score[1], TEAM_COL[1 - G.concede], t);
    } else if ((G.phase === 'ready' || G.phase === 'out') && (G.msg || G.outInfo || G.drill)) {
      const str = G.drill ? G.drill.msg : G.phase === 'ready' ? G.msg : { clear: 'CLEARED!', saved: 'SAVED', out: 'OUT' }[G.outInfo.kind];
      if (pen) banner(c, str, '', G.drill.so.turn === 'shoot' ? '#f1735f' : '#35e08a', 1.0 - G.phaseT, 400, 215);
      else {
        c.font = '800 italic 34px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 7; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(str, VW / 2, OY + 60); c.fillStyle = '#fff'; c.fillText(str, VW / 2, OY + 60);
      }
    } else if (G.phase === 'play' && (G.armed || (G.ball.owner && G.ball.owner.team !== G.attacker))) {
      c.font = '800 italic 18px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)'; const t = G.ball.owner && G.ball.owner.team !== G.attacker ? 'CLEAR IT OUTSIDE THE BOX BEFORE YOU SHOOT' : 'REBOUND — CLEAR IT OUTSIDE THE BOX';
      c.strokeText(t, VW / 2, OY + 24); c.fillStyle = '#ffe066'; c.fillText(t, VW / 2, OY + 24);
    } else if (G.phase === 'play' && !pen && G.t - G.time < 4 && G.time < 0.9 && G.score[0] + G.score[1] === 0) {
      c.globalAlpha = Math.min(1, (0.9 - G.time) * 4);
      c.font = '900 italic 54px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText('GO!', VW / 2, OY + 70); c.fillStyle = '#35e08a'; c.fillText('GO!', VW / 2, OY + 70);
      c.globalAlpha = 1;
    }
  }

  function reset() { fx.parts = []; fx.texts = []; fx.trail = []; fx.shake = 0; fx.flash = 0; RP.tape.length = 0; RP.goalAt = -1; RP.ents = null; RP.cam = null; LIVE.init = false; LIVE.cam = null; }

  // mouse aim reticle (screen coords) with a guide from the human player
  function drawAim(c, G, V) {
    if (!V.aim || G.phase !== 'play') return;
    const pen = G.drill && G.drill.so;
    if (pen && pen.turn !== 'shoot') return;
    const p = G.players[V.me || 0], foot = pen ? pr(PEN_CAM, p.y, FW - p.x, 30) : LIVE.cam ? pr(LIVE.cam, p.y, FW - p.x, 30) : { x: OX + Z * p.y, y: OY + Z * (FW - p.x) - 10 }, live = !!p.charge;
    c.save();
    c.strokeStyle = live ? 'rgba(241,115,95,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = live ? 2 : 1.2; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(foot.x, foot.y); c.lineTo(V.aim.x, V.aim.y); c.stroke(); c.setLineDash([]);
    c.strokeStyle = live ? '#f1735f' : 'rgba(255,255,255,.85)'; c.lineWidth = 2;
    c.beginPath(); c.arc(V.aim.x, V.aim.y, 9, 0, TAU); c.stroke();
    c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(V.aim.x + dx * 5, V.aim.y + dy * 5); c.lineTo(V.aim.x + dx * 14, V.aim.y + dy * 14); } c.stroke();
    c.restore();
  }
  // is the goal replay on screen right now? (the match underneath is paused in its goal phase)
  const inReplay = (G, V) => !!replayState(G, V);
  ISO.Render = { draw, onEvent, reset, VW, VH, TEAM_COL, Z, OX, OY, drawAim, setMap, thumb, unprojectGoal, unprojectLive, inReplay, setBall, overlays, theme: () => TH, mapId: () => mapId };
})();
