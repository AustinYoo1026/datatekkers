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
  const viewP = (p) => Object.assign(Object.create(p), { x: p.y, y: FW - p.x, vx: p.vy, vy: -p.vx, face: faceS(p.face) });
  const hyp = Math.hypot, TAU = Math.PI * 2;
  const TEAM_COL = ['#35e08a', '#ffb23d'];

  // ---- maps: every pitch is painted from a theme (ISO.MAPS lists them for the store) ----
  const ADS = [['ISO FOOTBALL', '#0f1a14', '#35e08a'], ['FIRST TO FIVE', '#f4f4f4', '#10151c'], ['DATATEKKERS', '#132033', '#7fc4ff'],
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
  let mapId = 'stadium', TH = THEMES.stadium, pitch = null;
  const thumbs = new Map();
  const fx = { parts: [], texts: [], shake: 0, trail: [], flash: 0, t: 0 };
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
  function drawPosts(c) {
    for (const x of [GY0, GY1]) { c.fillStyle = TH.post; c.beginPath(); c.arc(x, 0, 4.6, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.stroke(); }
  }

  function dirOf(face) {
    const cx = Math.cos(face), sy = Math.sin(face);
    if (Math.abs(cx) >= 0.5) return { dir: 'side', flip: cx < 0 };
    return { dir: sy > 0 ? 'down' : 'up', flip: false };
  }

  const SKILL_FRAMES = { stepover: [0, 1, 2, 1, 0, 1], feint: [2, 2, 0, 0], roll: [0, 0, 1, 1], croqueta: [2, 1, 0], roulette: null,
    elastico: [0, 0, 0, 2, 2], heel: [3, 3, 1], rainbow: [3, 3, 1, 1, 1], dragback: [3, 3, 1], nutmeg: null };

  function drawPlayer(c, G, p, sheet, label) {
    const sp = hyp(p.vx, p.vy);
    let anim = 'idle', frame = 0, d = dirOf(p.face), angle = null, dx = 0, dy = 0;
    const runFrame = Math.floor(p.animDist / 7) % 6;
    if (p.state === 'celebrate') { anim = 'celebrate'; frame = Math.floor(fx.t * 9) % 4; d = { dir: 'down', flip: false }; }
    else if (p.state === 'slide' || p.state === 'down') { anim = 'slide'; d = { dir: 'side', flip: false }; angle = p.face; }
    else if (p.state === 'stumble') anim = 'stumble';
    else if (p.state === 'tackle' || p.state === 'recover') { anim = 'tackle'; frame = p.state === 'tackle' && p.stT < 0.08 ? 0 : 1; if (p.state === 'recover' && p.stT > 0.15) { anim = 'idle'; frame = 0; } }
    else if (p.state === 'skill' && p.skill) {
      const fr = SKILL_FRAMES[p.skill.id], u = Math.min(0.999, p.skill.t / p.skill.dur);
      if (fr) { anim = 'skill'; frame = fr[Math.floor(u * fr.length)]; } else { anim = 'run'; frame = runFrame; }
      const perpX = -Math.sin(p.skill.a0), perpY = Math.cos(p.skill.a0);
      dx = perpY * p.skill.lean * 2.5; dy = -perpX * p.skill.lean * 2.5;
      if (p.skill.id === 'rainbow') dy -= Math.sin(Math.PI * Math.max(0, (u - 0.28) / 0.72)) * 6;
    }
    else if (p.kickT > 0) { anim = 'kick'; frame = p.kickT > 0.24 ? 0 : p.kickT > 0.12 ? 1 : 2; }
    else if (p.charge && !p.charge.ft && sp < 40) { anim = 'kick'; frame = 0; }
    else if (sp > 22) { anim = sp > p.jog * 1.08 ? 'sprint' : 'run'; frame = runFrame; }
    else frame = Math.floor(fx.t * 2.2) % 2;

    // ground marker
    const col = TEAM_COL[p.team];
    c.save(); c.translate(p.x, p.y);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 2, 12, 5.5, 0, 0, TAU); c.fill();
    c.strokeStyle = col; c.globalAlpha = G.ball.owner === Object.getPrototypeOf(p) ? 0.95 : 0.5; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 2, 14.5, 7, 0, 0, TAU); c.stroke();
    c.restore();

    if (p.state === 'skill' && p.skill) {      // motion ghost
      c.globalAlpha = 0.22; ISO.Sprites.draw(c, sheet, anim, frame, d.dir, p.x + dx - p.vx * 0.05, p.y + dy + 3 - p.vy * 0.05, d.flip, angle); c.globalAlpha = 1;
    }
    ISO.Sprites.draw(c, sheet, anim, frame, d.dir, p.x + dx, p.y + dy + 3, d.flip, angle);

    // label + arrow
    const top = p.y - 57 * (p.def.look.h || 1);
    c.fillStyle = col; c.beginPath(); c.moveTo(p.x - 5, top - 5); c.lineTo(p.x + 5, top - 5); c.lineTo(p.x, top + 1); c.closePath(); c.fill();
    c.font = '800 10px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(label, p.x, top - 6); c.fillText(label, p.x, top - 6);

    // shot power meter
    if (p.charge) {
      const f = p.charge.ft ? Math.min(1, 0.5 + p.charge.t * 0.5) : Math.max(0.3, Math.min(1, p.charge.t / (p.charge.type === 'power' ? 1.3 : 0.75))), w = 38, x = p.x - w / 2, y = p.y + 13;
      c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x - 1.5, y - 1.5, w + 3, 8);
      const lim = p.charge.type === 'power' ? 1.6 : 1.0, cooked = !p.charge.ft && p.charge.t > lim;
      c.fillStyle = cooked ? '#ff4d4d' : f > 0.95 ? '#ffb23d' : '#35e08a'; c.fillRect(x, y, w * f, 5);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x + w * 0.78, y - 1.5, 1.2, 8);
      c.font = '800 8px Arial'; c.fillStyle = '#fff'; c.textBaseline = 'top';
      c.fillText(p.charge.ft ? 'FIRST TIME' : cooked ? 'TOO LONG!' : p.charge.type === 'normal' ? '' : p.charge.type.toUpperCase(), p.x, y + 8);
    }
    if (p.exhausted) { c.font = '800 9px Arial'; c.fillStyle = '#ff6b6b'; c.textBaseline = 'top'; c.fillText('TIRED', p.x, p.y + 12); }
  }

  function drawKeeper(c, G, k, sheet) {
    if (k.state === 'slide' || (k.state === 'ground' && k.slid)) {      // same sliding-tackle animation the outfield players use
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(k.x, k.y + 3, 15, 6, 0, 0, TAU); c.fill();
      ISO.Sprites.draw(c, sheet, 'slide', 0, 'side', k.x, k.y + 3, false, k.face);
      return;
    }
    if (k.state === 'dive' || k.state === 'ground') {
      // The dive runs along the goal line, i.e. sideways on screen: the body rises, then lies flat.
      const air = k.state === 'dive', u = air ? Math.min(1, k.stT / (k.diveT || 0.4)) : 1;
      const lift = air ? Math.sin(u * Math.PI) * 10 : 0, tilt = air ? -0.7 * (1 - u) : 0, toRight = k.diveDir > 0;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(k.x, k.y + 3, 12 + 4 * u, 6, 0, 0, TAU); c.fill();
      ISO.Sprites.draw(c, sheet, 'dive', 0, 'side', k.x, k.y + 4 - lift, !toRight, toRight ? tilt : -tilt);
      return;
    }
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(k.x, k.y + 2, 12, 5.5, 0, 0, TAU); c.fill();
    const d = dirOf(k.face), sp = hyp(k.vx, k.vy);
    ISO.Sprites.draw(c, sheet, sp > 25 ? 'run' : 'idle', sp > 25 ? Math.floor(k.animDist / 7) % 6 : Math.floor(fx.t * 2) % 2, d.dir, k.x, k.y + 3, d.flip);
  }

  function drawBall(c, b) {
    const img = ISO.Sprites.ball(), P = ISO.Sprites.BALL_PX, f = Math.floor(b.rot) % ISO.Sprites.BALL_FRAMES;
    const size = 13 + b.z * 0.07, by = b.y - b.z * 0.55;
    c.drawImage(img, f * P, 0, P, P, b.x - size / 2, by - size / 2 - 1, size, size);
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
      case 'botch': text(P.x, P.y - 58, 'HEAVY TOUCH', '#ff8a8a'); break;
      case 'steal': text(P.x, P.y - 52, 'NICKED', TEAM_COL[e.p.team]); break;
      case 'block': burst(b.x, b.y, 6, ['#ffffff'], 100, 0.25); text(P.x, P.y - 52, 'BLOCK', TEAM_COL[e.p.team]); break;
      case 'clear': text(b.x, b.y - 30, 'CLEARED', TEAM_COL[e.team]); break;
      case 'bump': text(P.x, P.y - 52, 'SHOULDER', TEAM_COL[e.p.team]); break;
    }
  }

  function banner(c, str, sub, col, t, y) {
    const k = Math.min(1, t * 5), s = (1 + (1 - k) * 0.6) * (y ? 0.72 : 1);
    c.save(); c.translate(VW / 2, y || VH / 2 - 10); c.scale(s, s); c.globalAlpha = k;
    c.font = '900 italic 120px "Avenir Next Condensed","Arial Narrow",Impact,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 12; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(str, 0, 0);
    c.fillStyle = col; c.fillText(str, 0, 0);
    if (sub) { c.font = '800 30px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.lineWidth = 6; c.strokeText(sub, 0, 78); c.fillStyle = '#fff'; c.fillText(sub, 0, 78); }
    c.restore();
  }

  // ------------------------------------------------------------------ frame
  function draw(c, G, V, dt) {
    if (!pitch) pitch = buildPitch(TH);
    fx.t += dt;
    c.save();
    if (fx.shake > 0.2) { c.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake); fx.shake *= Math.pow(0.004, dt); } else fx.shake = 0;
    c.drawImage(pitch, 0, 0, VW, VH);
    c.translate(OX, OY); c.scale(Z, Z);

    const b = Object.assign(Object.create(G.ball), { x: G.ball.y, y: FW - G.ball.x }), sp = hyp(b.vx, b.vy);
    // ball trail
    if (sp > 430 && !b.holder) fx.trail.push({ x: b.x, y: b.y - b.z * 0.55, life: 0.22 });
    for (const t of fx.trail) { t.life -= dt; if (t.life > 0) { c.fillStyle = 'rgba(255,255,255,' + t.life * 1.6 + ')'; c.beginPath(); c.arc(t.x, t.y, 5 * (t.life / 0.22), 0, TAU); c.fill(); } }
    fx.trail = fx.trail.filter((t) => t.life > 0);

    drawNets(c);          // the net sits behind everything, so the keeper stands in front of the goal
    drawBallShadow(c, b);
    const ents = [];
    G.players.forEach((p0, i) => { const p = viewP(p0); ents.push({ y: p.y, f: () => drawPlayer(c, G, p, V.sheets[i], V.labels[i]) }); });
    { const k = viewP(G.keeper); ents.push({ y: k.y, f: () => drawKeeper(c, G, k, V.keeperSheet) }); }
    ents.push({ y: b.y + (b.z > 20 ? 400 : 0.5), f: () => drawBall(c, b) });
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

    if (fx.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + fx.flash * 0.35 + ')'; c.fillRect(0, 0, VW, VH); fx.flash -= dt * 3; }
    if (V.quiet) return;
    drawAim(c, G, V);
    // overlays
    if (G.phase === 'countdown') {
      const n = Math.ceil(G.phaseT / G.cdTick), frac = (G.phaseT / G.cdTick) % 1;
      if (n > 0) banner(c, String(n), V.labels[G.attacker] + ' ATTACKS', '#ffffff', 1 - frac, OY + 120);
    } else if (G.phase === 'goal') {
      const t = C.GOAL_T - G.phaseT, name = G.players[1 - G.concede].def.short;
      banner(c, 'GOAL!', (G.own ? 'OWN GOAL · ' : '') + name + '  ' + G.score[0] + ' – ' + G.score[1], TEAM_COL[1 - G.concede], t);
    } else if ((G.phase === 'ready' || G.phase === 'out') && (G.msg || G.outInfo)) {
      const str = G.phase === 'ready' ? G.msg : { clear: 'CLEARED!', saved: 'SAVED', out: 'OUT' }[G.outInfo.kind];
      c.font = '800 italic 34px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(str, VW / 2, OY + 60); c.fillStyle = '#fff'; c.fillText(str, VW / 2, OY + 60);
    } else if (G.phase === 'play' && (G.armed || (G.ball.owner && G.ball.owner.team !== G.attacker))) {
      c.font = '800 italic 18px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)'; const t = G.ball.owner && G.ball.owner.team !== G.attacker ? 'CLEAR IT OUTSIDE THE BOX BEFORE YOU SHOOT' : 'REBOUND — CLEAR IT OUTSIDE THE BOX';
      c.strokeText(t, VW / 2, OY + 24); c.fillStyle = '#ffe066'; c.fillText(t, VW / 2, OY + 24);
    } else if (G.phase === 'play' && G.t - G.time < 4 && G.time < 0.9 && G.score[0] + G.score[1] === 0) {
      c.globalAlpha = Math.min(1, (0.9 - G.time) * 4);
      c.font = '900 italic 54px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText('GO!', VW / 2, OY + 70); c.fillStyle = '#35e08a'; c.fillText('GO!', VW / 2, OY + 70);
      c.globalAlpha = 1;
    }
  }

  function reset() { fx.parts = []; fx.texts = []; fx.trail = []; fx.shake = 0; fx.flash = 0; }

  // mouse aim reticle (screen coords) with a guide from the human player
  function drawAim(c, G, V) {
    if (!V.aim || G.phase !== 'play') return;
    const p = G.players[0], px = OX + Z * p.y, py = OY + Z * (FW - p.x), live = !!p.charge;
    c.save();
    c.strokeStyle = live ? 'rgba(241,115,95,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = live ? 2 : 1.2; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(px, py - 10); c.lineTo(V.aim.x, V.aim.y); c.stroke(); c.setLineDash([]);
    c.strokeStyle = live ? '#f1735f' : 'rgba(255,255,255,.85)'; c.lineWidth = 2;
    c.beginPath(); c.arc(V.aim.x, V.aim.y, 9, 0, TAU); c.stroke();
    c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(V.aim.x + dx * 5, V.aim.y + dy * 5); c.lineTo(V.aim.x + dx * 14, V.aim.y + dy * 14); } c.stroke();
    c.restore();
  }
  ISO.Render = { draw, onEvent, reset, VW, VH, TEAM_COL, Z, OX, OY, drawAim, setMap, thumb };
})();
