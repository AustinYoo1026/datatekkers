/* ISO FOOTBALL — 2D character sprites.
   Every footballer gets a sprite sheet generated at runtime on an offscreen
   canvas from their look + kit. The sheet layout is fixed (ISO.Sprites.LAYOUT),
   so a hand-drawn PNG with the same layout can replace any generated sheet via
   ISO.SPRITE_OVERRIDES — a missing or broken image simply keeps the generated one. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const CW = 64, CH = 62, S = 2, FOOT_X = 32, FOOT_Y = 52, DRAW_SCALE = 1.15;
  const ANIMS = [['idle', 2], ['run', 6], ['sprint', 6], ['kick', 3], ['tackle', 2], ['slide', 1],
    ['celebrate', 4], ['skill', 4], ['stumble', 1], ['dive', 1]];
  const DIRS = ['down', 'up', 'side'];       // 'side' faces right; the renderer mirrors it for left
  const COL = {};
  let NCOL = 0;
  for (const [a, f] of ANIMS) { COL[a] = { start: NCOL, frames: f }; NCOL += f; }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return 'rgb(' + c((n >> 16) & 255) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
  }
  function limb(c, x1, y1, x2, y2, w, col) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function ell(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }

  function shirt(c, kit, x, y, w, h, r) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    c.fillStyle = kit.a; c.fillRect(x, y, w, h);
    c.fillStyle = kit.b;
    if (kit.pat === 'vstripes') { for (let i = 0, sx = x - 0.4; sx < x + w; sx += 2.5, i++) if (i % 2) c.fillRect(sx, y, 2.5, h); }
    else if (kit.pat === 'hoops') { for (let i = 0, sy = y; sy < y + h; sy += 2.4, i++) if (i % 2) c.fillRect(x, sy, w, 2.4); }
    else if (kit.pat === 'cstripe') c.fillRect(x + w / 2 - w * 0.17, y, w * 0.34, h);
    else c.fillRect(x, y, w, 1.5);     // collar trim
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 0.7; rr(c, x, y, w, h, r); c.stroke();
  }

  // ---- hair ---------------------------------------------------------------
  const HAIR = {
    bald: { none: true }, buzz: { ex: 0.3, line: 0.45, alpha: 0.62 }, short: { ex: 0.9, line: 0.36 },
    fade: { ex: 0.7, line: 0.5 }, quiff: { ex: 0.9, line: 0.4, top: 'quiff' }, curly: { ex: 1.5, line: 0.42, bumps: 1 },
    afro: { ex: 3.2, line: 0.55, bumps: 1 }, long: { ex: 1.2, line: 0.3, locks: 9 }, bun: { ex: 0.9, line: 0.42, top: 'bun' },
    mohawk: { ex: 0.3, line: 0.5, alpha: 0.5, top: 'mohawk' }, tuft: { ex: 0.2, line: 0.62, alpha: 0.35, top: 'tuft' },
    balding: { ex: 0.8, ring: true }, mop: { ex: 1.7, line: 0.12, locks: 3 },
  };
  const R = 7.2;

  function head(c, L, dir, hx, hy) {
    const H = HAIR[L.hair] || HAIR.short, col = L.hairColor, col2 = L.hair2 || col;
    const Rh = R + (H.ex || 0), skinD = shade(L.skin, -30);
    const up = dir === 'up', side = dir === 'side';
    // hair that sits behind the head
    if (!H.none && !up) {
      if (H.ex > 2) ell(c, hx - (side ? 1 : 0), hy - 0.8, Rh, Rh, col2);
      if (H.locks) { c.fillStyle = col2; if (side) { rr(c, hx - Rh, hy - 2, 5.5, H.locks + 3, 2); c.fill(); } else { rr(c, hx - Rh, hy - 2, Rh * 2, H.locks + 2, 3); c.fill(); } }
    }
    if (!side) { ell(c, hx - R, hy + 0.5, 1.4, 1.9, skinD); ell(c, hx + R, hy + 0.5, 1.4, 1.9, skinD); }
    ell(c, hx, hy, R, R, L.skin);
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.6; c.beginPath(); c.arc(hx, hy, R, 0, 7); c.stroke();
    // beard
    if (L.beard && !up) {
      c.save(); c.globalAlpha = L.beard === 'stubble' ? 0.38 : 1; c.fillStyle = L.beardColor || col;
      if (L.beard === 'goatee') ell(c, hx + (side ? 4.2 : 0), hy + 5.6, side ? 1.6 : 2.4, 1.7, c.fillStyle);
      else if (side) { c.beginPath(); c.arc(hx, hy, R, -0.1, Math.PI * 0.55); c.quadraticCurveTo(hx + 2, hy + 2, hx + R, hy - 0.7); c.fill(); }
      else { c.beginPath(); c.arc(hx, hy, R, 0.08, Math.PI - 0.08); c.quadraticCurveTo(hx, hy + 7.5, hx + R, hy + 0.6); c.fill(); }
      c.restore();
    }
    // face
    if (!up) {
      c.fillStyle = '#1c1512';
      if (side) { c.beginPath(); c.arc(hx + 3.6, hy - 0.6, 0.95, 0, 7); c.fill(); ell(c, hx + R + 0.3, hy + 1, 1, 1.2, L.skin); }
      else {
        c.beginPath(); c.arc(hx - 2.7, hy + 0.2, 0.95, 0, 7); c.arc(hx + 2.7, hy + 0.2, 0.95, 0, 7); c.fill();
        c.strokeStyle = 'rgba(60,20,10,.55)'; c.lineWidth = 0.7; c.beginPath(); c.arc(hx, hy + 2.6, 1.9, 0.25, Math.PI - 0.25); c.stroke();
      }
    }
    if (H.none) return;
    c.save();
    c.fillStyle = col; c.globalAlpha = H.alpha || 1;
    if (up) {
      if (H.ring) { c.beginPath(); c.arc(hx, hy, Rh, 0, 7); c.fill(); ell(c, hx, hy - 2.4, R * 0.6, R * 0.52, L.skin); }
      else { c.beginPath(); c.arc(hx, hy, Rh, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      if (H.locks) { c.fillStyle = col; rr(c, hx - Rh, hy - 2, Rh * 2, H.locks + 4, 3); c.fill(); }
      if (H.top === 'bun') ell(c, hx, hy - 3, 3.2, 3.2, shade(col, -25));
      if (H.top === 'mohawk') { c.fillStyle = col; rr(c, hx - 2, hy - Rh - 1, 4, Rh * 2, 2); c.fill(); }
    } else if (side) {
      if (H.ring) { c.beginPath(); c.arc(hx, hy, Rh, Math.PI * 0.6, Math.PI * 1.3); c.quadraticCurveTo(hx - 2, hy - 1, hx - 3, hy + 6); c.fill(); }
      else {
        c.beginPath(); c.arc(hx, hy, Rh, Math.PI * 0.62, Math.PI * 1.86);
        c.quadraticCurveTo(hx + 1.5, hy - R * H.line * 2, hx - 2.4, hy + 3.2); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
      if (H.top === 'bun') ell(c, hx - Rh * 0.85, hy - Rh * 0.55, 3, 3, col);
      if (H.top === 'mohawk') ell(c, hx - 0.5, hy - R - 0.4, 6.2, 2.4, col);
      if (H.top === 'quiff') ell(c, hx + 2.6, hy - R - 0.2, 4.4, 2.5, col);
      if (H.top === 'tuft') ell(c, hx + 4.6, hy - 5.4, 2.6, 2.2, col);
    } else {
      if (H.ring) { ell(c, hx - R + 0.4, hy - 1.5, 1.9, 3.8, col); ell(c, hx + R - 0.4, hy - 1.5, 1.9, 3.8, col); }
      else {
        const sy = hy + Rh * Math.sin(0.3), my = hy - R * H.line;
        c.beginPath(); c.arc(hx, hy, Rh, Math.PI - 0.3, Math.PI * 2 + 0.3);
        c.quadraticCurveTo(hx, 2 * my - sy, hx - Rh * Math.cos(0.3), sy); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
      if (H.top === 'bun') ell(c, hx, hy - Rh - 1.4, 3, 3, col);
      if (H.top === 'mohawk') ell(c, hx, hy - R + 0.6, 2.5, 3.8, col);
      if (H.top === 'quiff') ell(c, hx + 0.8, hy - R + 0.3, 5.2, 2.7, col);
      if (H.top === 'tuft') ell(c, hx, hy - R + 1.6, 4.4, 2.6, col);
    }
    if (H.bumps) {
      c.fillStyle = col; c.globalAlpha = 1;
      const a0 = up ? 0 : side ? Math.PI * 0.7 : Math.PI - 0.2, a1 = up ? Math.PI * 2 : side ? Math.PI * 1.85 : Math.PI * 2 + 0.2;
      const n = up ? 12 : 8;
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; c.beginPath(); c.arc(hx + Math.cos(a) * (Rh - 0.6), hy + Math.sin(a) * (Rh - 0.6), 1.9, 0, 7); c.fill(); }
    }
    if (L.band) {
      c.strokeStyle = L.band; c.lineWidth = 1.5; c.lineCap = 'butt'; c.beginPath();
      const by = hy - R * 0.5;
      if (side) { c.moveTo(hx - R + 0.6, by + 1.5); c.lineTo(hx + R - 1.4, by); } else { c.moveTo(hx - R + 1, by); c.quadraticCurveTo(hx, by - 1.6, hx + R - 1, by); }
      c.stroke();
    }
    c.restore();
  }

  // ---- body ---------------------------------------------------------------
  // Pose: l1/l2 leg swing (-1 back .. +1 forward), a1/a2 arm swing, bob, lean,
  // rot (whole-body rotation, used for slides and dives), armsUp, spread, squash.
  function drawChar(c, L, kit, dir, P, keeper) {
    const w = L.w || 1, h = L.h || 1, skin = L.skin, skinD = shade(skin, -30);
    const sock = kit.socks, sockD = shade(sock.length === 7 ? sock : '#888888', -35), boot = L.boot || '#16161a';
    const sleeve = kit.pat === 'sleeves' ? kit.b : kit.a, glove = '#f4f4f4';
    const l1 = P.l1 || 0, l2 = P.l2 || 0, a1 = P.a1 || 0, a2 = P.a2 || 0, bob = P.bob || 0, lean = P.lean || 0, spr = P.spread || 0;
    const lw = 4.3 * Math.sqrt(w);
    c.save();
    c.scale(h, h);
    if (P.rot) { c.translate(0, -12); c.rotate(P.rot); c.translate(0, 12); }
    if (P.squash) c.scale(1, P.squash);
    const hipY = -15 + bob;
    if (dir === 'side') {
      const tw = 8.8 * w;
      const leg = (sw, far) => {
        const th = sw * 0.72, kx = Math.sin(th) * 7.5, ky = hipY + Math.cos(th) * 7.5;
        const th2 = th - (sw < 0 ? -sw * 0.6 : 0);
        const fx = kx + Math.sin(th2) * 7.5, fy = ky + Math.cos(th2) * 7.5;
        limb(c, 0, hipY, kx, ky, lw, far ? skinD : skin); limb(c, kx, ky, fx, fy, 3.6, far ? sockD : sock);
        ell(c, fx + 1.3, fy + 0.5, 3.1, 1.9, boot);
      };
      const arm = (sw, far) => {
        const sx = 0.5, sy = -12.6;
        let ex, ey;
        if (P.armsUp) { ex = sx + (far ? 1 : 4); ey = sy - 12.5; } else { const an = sw * 0.95; ex = sx + Math.sin(an) * 9; ey = sy + Math.cos(an) * 9; }
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        limb(c, sx, sy, mx, my, 3.5, far ? shade(sleeve.length === 7 ? sleeve : '#888888', -30) : sleeve);
        limb(c, mx, my, ex, ey, 3, far ? skinD : skin);
        if (keeper) ell(c, ex, ey, 2.4, 2.4, glove);
      };
      c.translate(0, hipY); c.rotate(lean); c.translate(0, -hipY);
      arm(a2, true); leg(l2, true); leg(l1, false);
      c.fillStyle = kit.shorts; rr(c, -tw / 2 - 0.3, hipY - 4.5, tw + 0.6, 7, 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.6; c.stroke();
      shirt(c, kit, -tw / 2, hipY - 15, tw, 11.5, 3);
      arm(a1, false);
      head(c, L, 'side', 1.2, hipY - 21.3);
    } else {
      const up = dir === 'up', tw = 12.4 * w;
      const leg = (i, sw) => {
        const s2 = up ? -sw : sw, hx = i * 3.3 * w + i * spr, fx = hx + i * spr * 0.7;
        const fy = s2 >= 0 ? 0.5 + s2 * 1.7 : s2 * 4.4, ky = (hipY + fy) / 2;
        limb(c, hx, hipY, fx, ky, lw, skin); limb(c, fx, ky, fx, fy - 1.6, 3.7, sock);
        ell(c, fx, fy - 0.6, 2.5, s2 >= 0 ? 2.7 : 2, boot);
      };
      if ((up ? -l1 : l1) <= (up ? -l2 : l2)) { leg(-1, l1); leg(1, l2); } else { leg(1, l2); leg(-1, l1); }
      c.fillStyle = kit.shorts; rr(c, -tw / 2, hipY - 5, tw, 7.2, 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.6; c.stroke();
      shirt(c, kit, -tw / 2, hipY - 14.6, tw, 11.6, 3.2);
      if (up && L.num != null) {
        c.fillStyle = ISO.lum(kit.a) > 0.55 ? '#16161a' : '#ffffff';
        c.font = '700 6.6px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(L.num), 0, hipY - 8.6);
      }
      for (const i of [-1, 1]) {
        const sw = (i < 0 ? a1 : a2) * (up ? -1 : 1), sx = i * (tw / 2 + 0.5), sy = hipY - 12.6;
        let ex, ey;
        if (P.armsUp) { ex = i * (tw / 2 + 3.6); ey = hipY - 26; }
        else { ex = i * (tw / 2 + 2 + (P.armsOut ? 4 : 0)); ey = hipY - 4 - Math.abs(sw) * 2.4 + (sw > 0 ? 1.4 : 0) - (P.armsOut ? 4 : 0); }
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        limb(c, sx, sy, mx, my, 3.6, sleeve); limb(c, mx, my, ex, ey, 3, skin);
        if (keeper) ell(c, ex, ey, 2.5, 2.5, glove);
      }
      head(c, L, dir, lean * 4, hipY - 21.2);
    }
    c.restore();
  }

  function poseFor(anim, i, dir) {
    switch (anim) {
      case 'idle': return { bob: i ? 0.7 : 0, a1: 0.1, a2: -0.1 };
      case 'run': case 'sprint': {
        const ph = (i / 6) * Math.PI * 2, s = Math.sin(ph), k = anim === 'sprint' ? 1.3 : 1;
        return { l1: s * k, l2: -s * k, a1: -s * 0.85 * k, a2: s * 0.85 * k, bob: -Math.abs(Math.cos(ph)) * 1.1, lean: anim === 'sprint' ? 0.2 : 0.07 };
      }
      case 'kick': return [{ l1: -1.2, l2: 0.2, a1: 0.9, a2: -0.6, lean: 0.05 }, { l1: 1.55, l2: -0.2, a1: -0.9, a2: 0.8, lean: -0.12 }, { l1: 0.9, l2: -0.1, a1: -0.4, a2: 0.4 }][i];
      case 'tackle': return i ? { l1: 1.55, l2: -0.8, a1: -0.7, a2: 0.9, lean: 0.3, bob: 1.5 } : { l1: 1.2, l2: -0.4, a1: -0.5, a2: 0.6, lean: 0.2, bob: 0.8 };
      case 'slide': return dir === 'side' ? { rot: -1.15, l1: 1.2, l2: 0.5, a1: -1.2, a2: 0.4 } : { squash: 0.72, l1: 1.5, l2: 0.6, armsOut: true };
      case 'celebrate': return { armsUp: true, bob: [0, -3, -5, -3][i], l1: i % 2 ? 0.4 : -0.2, l2: i % 2 ? -0.2 : 0.4 };
      case 'skill': return [{ l1: 0.7, l2: -0.2, spread: 2.6, a1: 0.6, a2: -0.6 }, { l1: 0.9, l2: -0.9, a1: -0.5, a2: 0.5 },
        { l1: -0.2, l2: 0.7, spread: 2.6, a1: -0.6, a2: 0.6 }, { l1: 0.2, l2: -1.5, a1: 0.7, a2: -0.7, lean: 0.12 }][i];
      case 'stumble': return { lean: -0.35, a1: 1.1, a2: -1.1, l1: 0.6, l2: -0.4, armsOut: true, bob: 1 };
      case 'dive': return { rot: 1.5, armsUp: true, l1: 0.4, l2: -0.3 };
    }
    return {};
  }

  function canvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv;
  }

  const cache = new Map();
  function getSheet(key, look, kit, keeper) {
    let sheet = cache.get(key);
    if (sheet) return sheet;
    sheet = canvas(NCOL * CW * S, DIRS.length * CH * S);
    const c = sheet.getContext('2d');
    for (const [anim, frames] of ANIMS) for (let f = 0; f < frames; f++) DIRS.forEach((dir, row) => {
      const col = COL[anim].start + f;
      c.setTransform(S, 0, 0, S, (col * CW + FOOT_X) * S, (row * CH + FOOT_Y) * S);
      drawChar(c, look, kit, anim === 'dive' ? 'side' : dir, poseFor(anim, f, dir), keeper);
    });
    const entry = { img: sheet };
    cache.set(key, entry);
    return entry;
  }

  // Build (or fetch) the sheet for a footballer; optionally swap in a professional PNG.
  function forPlayer(def, kit, slot) {
    const key = def.id + ':' + slot + ':' + kit.a + kit.b + kit.pat;
    const fresh = !cache.has(key);
    const entry = getSheet(key, Object.assign({ num: def.num }, def.look), kit, false);
    const url = fresh && ISO.SPRITE_OVERRIDES && ISO.SPRITE_OVERRIDES[def.id];
    if (url && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { if (img.width >= NCOL * CW && img.height >= DIRS.length * CH) entry.img = img; };
      img.onerror = () => {};       // keep the generated sheet
      img.src = url;
    }
    return entry;
  }
  function forKeeper(def, team) { return getSheet('gk:' + team, def.look, def.kit, true); }

  // draw one cell with its feet anchored at (x, y); angle (optional) rotates lying sprites
  function draw(ctx, entry, anim, frame, dir, x, y, flip, angle) {
    const col = COL[anim].start + (frame % COL[anim].frames), row = DIRS.indexOf(dir);
    const img = entry.img, k = img.width / (NCOL * CW);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(DRAW_SCALE, DRAW_SCALE);
    if (angle != null) { ctx.translate(0, -8); ctx.rotate(angle); ctx.translate(0, 12); }
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, col * CW * k, row * CH * k, CW * k, CH * k, -FOOT_X, -FOOT_Y, CW, CH);
    ctx.restore();
  }

  const portraits = new Map();
  function portrait(def, size, kitOverride) {
    const kit = kitOverride || def.kit, key = def.id + size + kit.a + kit.pat;
    let cv = portraits.get(key);
    if (cv) return cv;
    cv = canvas(size * 2, size * 2);
    const c = cv.getContext('2d'), D = size * 2, k = D / 30;
    c.setTransform(k, 0, 0, k, D / 2, D * 1.62);
    drawChar(c, Object.assign({}, def.look, { h: 1, num: def.num }), kit, 'down', { a1: 0.1, a2: -0.1 }, false);
    portraits.set(key, cv);
    return cv;
  }

  // ---- ball ---------------------------------------------------------------
  let ballSheet = null;
  const BALL_FRAMES = 8, BALL_PX = 32;
  function ball() {
    if (ballSheet) return ballSheet;
    ballSheet = canvas(BALL_PX * BALL_FRAMES, BALL_PX);
    const c = ballSheet.getContext('2d'), r = BALL_PX / 2 - 2;
    for (let f = 0; f < BALL_FRAMES; f++) {
      c.save(); c.translate(f * BALL_PX + BALL_PX / 2, BALL_PX / 2);
      c.beginPath(); c.arc(0, 0, r, 0, 7); c.clip();
      const g = c.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9ced6');
      c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
      c.fillStyle = '#1a1c22';
      const off = (f / BALL_FRAMES) * r * 2.2;
      const pent = (px, py, s) => { c.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + f * 0.25; c.lineTo(px + Math.cos(a) * s, py + Math.sin(a) * s); } c.closePath(); c.fill(); };
      for (let i = -2; i <= 2; i++) { pent(i * r * 1.1 + off - r * 1.1, (i % 2 ? -1 : 1) * r * 0.45, r * 0.36); }
      c.restore();
      c.strokeStyle = '#11131a'; c.lineWidth = 2; c.beginPath(); c.arc(f * BALL_PX + BALL_PX / 2, BALL_PX / 2, r, 0, 7); c.stroke();
    }
    return ballSheet;
  }

  ISO.Sprites = {
    LAYOUT: { cellW: CW, cellH: CH, scale: S, footX: FOOT_X, footY: FOOT_Y, anims: ANIMS, dirs: DIRS },
    forPlayer, forKeeper, draw, portrait, ball, BALL_FRAMES, BALL_PX, drawChar,
  };
})();
