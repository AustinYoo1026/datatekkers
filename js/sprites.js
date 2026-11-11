/* ISO FOOTBALL — 2D characters.
   Every footballer is drawn live from their look + kit and a pose (see drawChar), at whatever size the camera asks
   for, so the figures stay sharp and every movement can blend into the next. A hand-drawn PNG sheet in the fixed
   layout (ISO.Sprites.LAYOUT) can still replace a character via ISO.SPRITE_OVERRIDES — a missing or broken image
   simply keeps the live one. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const CW = 64, CH = 62, S = 2, FOOT_X = 32, FOOT_Y = 52, DRAW_SCALE = 1.15;
  const SHADES = new Map();
  function shade(hex, amt) {
    if (typeof hex !== 'string' || hex.length !== 7 || hex[0] !== '#') return hex || '#888888';
    const key = hex + amt;
    let v = SHADES.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const c = (x) => Math.max(0, Math.min(255, x + amt));
    v = 'rgb(' + c((n >> 16) & 255) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
    if (SHADES.size < 4000) SHADES.set(key, v);
    return v;
  }
  const lum = (hex) => (typeof hex === 'string' && hex.length === 7 && ISO.lum ? ISO.lum(hex) : 0.5);
  // Flat, angular "poster" look: everything is a polygon with short straight edges, one hard shading plane on the
  // side away from the light, and a dark navy ink outline. No soft curves, no gradients.
  const INK = '#1f2433', CORAL = '#f1735f', DEF_SKIN = '#e8bd95', DEF_HAIR = '#2a1e16', PLANE = 'rgba(31,36,51,.26)';
  // closed polygon from a flat [x, y, x, y, ...] list, moved to (ox, oy) and scaled (sx mirrors it)
  function path(c, p, ox, oy, sx, sy) {
    ox = ox || 0; oy = oy || 0; sx = sx || 1; sy = sy || 1;
    c.beginPath(); c.moveTo(ox + p[0] * sx, oy + p[1] * sy);
    for (let i = 2; i < p.length; i += 2) c.lineTo(ox + p[i] * sx, oy + p[i + 1] * sy);
    c.closePath();
  }
  // faceted blob: an n-gon whose corners alternate in and out by zig (0 = plain)
  function blob(c, x, y, rx, ry, n, zig) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.26, k = i % 2 ? 1 + zig * 0.16 : 1 - zig * 0.05;
      c.lineTo(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
    }
    c.closePath();
  }
  // diagonal hatching clipped to the current path
  function hatch(c, x, y, w, h, col, gap, lw) {
    c.save(); c.clip(); c.strokeStyle = col; c.lineWidth = lw || 0.8; c.lineCap = 'butt'; c.beginPath();
    for (let i = -h; i < w; i += gap) { c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); }
    c.stroke(); c.restore();
  }

  // the shirt pattern over the box (x, y, w, h); u is the stripe unit. The caller has clipped to the shirt's outline.
  function kitFill(c, kit, x, y, w, h, u) {
    c.fillStyle = kit.a; c.fillRect(x, y, w, h);
    c.fillStyle = kit.b;
    const pat = kit.pat, mx = x + w / 2;
    if (pat === 'vstripes') { for (let sx = mx - u / 2; sx < x + w; sx += u * 2) c.fillRect(sx, y, u, h); for (let sx = mx - u * 2.5; sx > x - u; sx -= u * 2) c.fillRect(sx, y, u, h); }
    else if (pat === 'hoops') { for (let i = 0, sy = y; sy < y + h; sy += u, i++) if (i % 2) c.fillRect(x, sy, w, u); }
    else if (pat === 'cstripe') c.fillRect(mx - w * 0.15, y, w * 0.3, h);
    else if (pat === 'pin') { for (let sx = mx - u * 6; sx < x + w; sx += u) c.fillRect(sx, y, u * 0.22, h); }
    else if (pat === 'halves') c.fillRect(mx, y, w / 2, h);
    else if (pat === 'quarters') { c.fillRect(mx, y, w / 2, h / 2); c.fillRect(x, y + h / 2, w / 2, h / 2); }
    else if (pat === 'sash') { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.3, y); c.lineTo(x + w, y + h * 0.75); c.lineTo(x + w, y + h); c.lineTo(x + w * 0.7, y + h); c.lineTo(x, y + h * 0.25); c.closePath(); c.fill(); }
    else if (pat === 'chevron') { c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(mx, y + h * 0.55); c.lineTo(x + w, y + h * 0.15); c.lineTo(x + w, y + h * 0.42); c.lineTo(mx, y + h * 0.82); c.lineTo(x, y + h * 0.42); c.closePath(); c.fill(); }
  }
  // the torso: a tapered slab with cut shoulders (front / back), or a chest-forward slab (side)
  function torsoPath(c, x, y, w, h, side) {
    c.beginPath();
    if (side) { c.moveTo(x + 1.4, y); c.lineTo(x + w - 1.8, y); c.lineTo(x + w + 0.2, y + 2.6); c.lineTo(x + w - 0.5, y + h); c.lineTo(x + 0.7, y + h); c.lineTo(x - 0.2, y + 2.8); }
    else { c.moveTo(x + 2.6, y); c.lineTo(x + w - 2.6, y); c.lineTo(x + w + 0.6, y + 2.3); c.lineTo(x + w - 1.0, y + h); c.lineTo(x + 1.0, y + h); c.lineTo(x - 0.6, y + 2.3); }
    c.closePath();
  }
  function shirt(c, kit, x, y, w, h, side) {
    c.save(); torsoPath(c, x, y, w, h, side); c.clip();
    kitFill(c, kit, x - 1, y, w + 2, h, 2.5);
    if (kit.pat === 'solid' || !kit.pat) { c.fillStyle = kit.b; c.fillRect(x + w * 0.3, y, w * 0.4, 1.3); }     // collar trim
    // one hard shadow plane and a small hatched panel, like the poster art
    c.fillStyle = PLANE; c.beginPath(); c.moveTo(x + w * 0.64, y); c.lineTo(x + w + 1, y); c.lineTo(x + w + 1, y + h); c.lineTo(x + w * 0.42, y + h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.55; c.lineCap = 'butt'; c.beginPath();
    for (let i = 0; i < 3; i++) { c.moveTo(x + 0.6 + i * 1.5, y + h); c.lineTo(x + 3.4 + i * 1.5, y + h * 0.56); }
    c.stroke();
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 0.9; c.lineJoin = 'miter'; torsoPath(c, x, y, w, h, side); c.stroke();
  }

  // ---- hair ---------------------------------------------------------------
  /* look.hair -> how the in-match head wears it. ex = thickness over the skull, line = how high the hairline sits,
     alpha = cropped to the scalp, flat = square top, zig = jagged curls, big = a mass around the head (afro),
     locks = hair hanging to that length, ring = bald on top, top = an extra piece. Unknown styles fall back to short. */
  const HAIR = {
    bald: { none: true }, shaved: { ex: 0.2, line: 0.5, alpha: 0.3 }, buzz: { ex: 0.3, line: 0.46, alpha: 0.72 },
    short: { ex: 0.9, line: 0.36, part: 1 }, fade: { ex: 0.8, line: 0.5, flat: 1 }, side: { ex: 1.1, line: 0.3, part: 1 },
    slick: { ex: 0.8, line: 0.52 }, quiff: { ex: 0.9, line: 0.42, top: 'quiff' }, curly: { ex: 1.5, line: 0.4, zig: 1 },
    afro: { ex: 3.2, line: 0.5, zig: 1, big: 1 }, mop: { ex: 1.7, line: 0.1, locks: 3, part: 1 }, long: { ex: 1.2, line: 0.3, locks: 8 },
    braids: { ex: 0.7, line: 0.44, locks: 10, strands: 1 }, bun: { ex: 0.8, line: 0.46, top: 'bun' },
    mohawk: { ex: 0.3, line: 0.5, alpha: 0.5, top: 'mohawk' }, tuft: { ex: 0.2, line: 0.62, alpha: 0.3, top: 'tuft' },
    balding: { ex: 0.6, ring: true }, receding: { ex: 0.5, line: 0.66, alpha: 0.88 },
  };
  const R = 7.2;
  // the in-match head, as flat point lists around its centre (the side view faces right)
  const HEAD_F = [-4.3, -7.3, 4.3, -7.3, 6.7, -3.9, 6.7, 1.4, 4.9, 5.5, 2.2, 7.5, -2.2, 7.5, -4.9, 5.5, -6.7, 1.4, -6.7, -3.9];
  const HEAD_FS = [2.6, -7.3, 4.3, -7.3, 6.7, -3.9, 6.7, 1.4, 4.9, 5.5, 2.2, 7.5, 1.0, 7.5, 3.8, 2.4, 3.4, -2.6];
  const HEAD_S = [-3.6, -7.3, 3.0, -7.3, 5.9, -5.0, 6.3, -1.2, 7.9, 1.3, 6.3, 2.2, 6.1, 4.6, 4.0, 7.3, -0.8, 7.0, -4.2, 4.6, -6.8, 1.0, -6.8, -3.6];
  const HEAD_SS = [-3.6, -7.3, -1.0, -7.3, -2.6, -1.0, -1.2, 3.6, -0.8, 7.0, -4.2, 4.6, -6.8, 1.0, -6.8, -3.6];
  const EAR_F = [6.3, -1.3, 8.2, -1.8, 8.2, 1.4, 6.3, 2.5], EAR_S = [-2.1, -1.3, 0.2, -1.0, 0.0, 1.7, -1.5, 2.4];
  const BEARD_F = [-6.7, 0.4, -6.7, 1.4, -4.9, 5.5, -2.2, 7.5, 2.2, 7.5, 4.9, 5.5, 6.7, 1.4, 6.7, 0.4, 4.7, 2.3, 3.1, 2.8, -3.1, 2.8, -4.7, 2.3];
  const STRAP_F = [-6.7, 0.4, -6.7, 1.4, -4.9, 5.5, -2.2, 7.5, 2.2, 7.5, 4.9, 5.5, 6.7, 1.4, 6.7, 0.4, 5.4, 2.0, 4.0, 4.9, 1.8, 6.3, -1.8, 6.3, -4.0, 4.9, -5.4, 2.0];
  const GOAT_F = [-2.8, 2.8, 2.8, 2.8, 3.0, 5.6, 2.0, 7.5, -2.0, 7.5, -3.0, 5.6], TASH_F = [-3.0, 2.7, 3.0, 2.7, 3.4, 4.1, -3.4, 4.1];
  const BEARD_S = [0.3, 0.8, 2.3, 2.7, 6.3, 2.4, 6.1, 4.6, 4.0, 7.3, -0.8, 7.0, -1.5, 3.2];
  const GOAT_S = [3.3, 2.7, 6.3, 2.4, 6.1, 4.6, 4.0, 7.3, 2.3, 7.2], TASH_S = [3.6, 2.5, 6.4, 2.3, 6.4, 3.6, 3.6, 3.6];
  const KNOT = [-2.6, -1.2, -0.9, -2.9, 1.2, -2.8, 2.7, -1.0, 2.2, 1.6, -0.2, 2.6, -2.3, 1.4];
  const CROWN = [-3.2, -5.6, 3.2, -5.6, 4.3, -2.2, 2.5, 0.8, -2.5, 0.8, -4.3, -2.2];
  const beardKind = (b) => (b === 'goatee' || b === 'moustache' || b === 'chinstrap' || b === 'stubble' || b === 'full' ? b : b ? 'full' : null);

  function head(c, L, dir, hx, hy) {
    const H = HAIR[L.hair] || HAIR.short, col = L.hairColor || DEF_HAIR, col2 = L.hair2 || col;
    const skin = L.skin || DEF_SKIN, skinD = shade(skin, -26), e = (H.ex || 0) * (H.big ? (L.vol || 1) : 1);
    const up = dir === 'up', side = dir === 'side', bk = beardKind(L.beard);
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    // hair that sits behind the head
    if (!H.none && !up) {
      if (H.big) { c.fillStyle = col2; blob(c, hx - (side ? 1.3 : 0), hy - 1.2, 6.6 + e, 6.6 + e, 12, 1); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke(); }
      if (H.locks) {
        const k = hy + H.locks - 1;
        c.fillStyle = col2; c.beginPath();
        if (side) { c.moveTo(hx - 7 - e, hy - 3.5); c.lineTo(hx - 0.8, hy - 3.5); c.lineTo(hx - 1.3, k + 1); c.lineTo(hx - 4, k + 2.6); c.lineTo(hx - 7.7 - e, k); }
        else { c.moveTo(hx - 6.9 - e, hy - 3); c.lineTo(hx + 6.9 + e, hy - 3); c.lineTo(hx + 7.5 + e, k); c.lineTo(hx + 5.4, k + 2.2); c.lineTo(hx - 5.4, k + 2.2); c.lineTo(hx - 7.5 - e, k); }
        c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke();
      }
    }
    // skull, ears, the shadow plane
    c.fillStyle = skinD;
    if (side) { path(c, HEAD_S, hx, hy); c.fillStyle = skin; c.fill(); c.fillStyle = skinD; path(c, HEAD_SS, hx, hy); c.fill(); }
    else {
      path(c, EAR_F, hx, hy); c.fill(); path(c, EAR_F, hx, hy, -1); c.fill();
      path(c, HEAD_F, hx, hy); c.fillStyle = skin; c.fill();
      if (!up) { c.fillStyle = skinD; path(c, HEAD_FS, hx, hy); c.fill(); }
    }
    // beard
    if (bk && !up) {
      c.globalAlpha = bk === 'stubble' ? 0.36 : 1; c.fillStyle = L.beardColor || col;
      path(c, side ? (bk === 'goatee' ? GOAT_S : bk === 'moustache' ? TASH_S : BEARD_S) : (bk === 'goatee' ? GOAT_F : bk === 'moustache' ? TASH_F : bk === 'chinstrap' ? STRAP_F : BEARD_F), hx, hy);
      c.fill(); c.globalAlpha = 1;
    }
    // face: straight brows, small eyes, a short mouth
    if (!up) {
      const dark = bk === 'full' || bk === 'goatee';
      if (side) {
        c.fillStyle = '#f4efe6'; c.fillRect(hx + 3.0, hy - 1.5, 2.2, 1.7);
        c.fillStyle = '#1c1512'; c.fillRect(hx + 3.9, hy - 1.5, 1.3, 1.7);
        c.fillStyle = INK; c.fillRect(hx + 2.6, hy - 3.0, 3.3, 1.0);
        c.fillStyle = skinD; path(c, EAR_S, hx, hy); c.fill();
        c.fillStyle = dark ? shade(skin, -10) : 'rgba(60,20,10,.6)'; c.fillRect(hx + 4.5, hy + 3.9, 1.7, 0.7);
      } else {
        c.fillStyle = '#1c1512'; c.fillRect(hx - 3.7, hy - 0.7, 1.9, 1.7); c.fillRect(hx + 1.8, hy - 0.7, 1.9, 1.7);
        c.fillStyle = INK; c.fillRect(hx - 4.5, hy - 2.5, 3.3, L.brow === 'heavy' ? 1.3 : 1.0); c.fillRect(hx + 1.2, hy - 2.5, 3.3, L.brow === 'heavy' ? 1.3 : 1.0);
        c.fillStyle = dark ? shade(skin, -10) : 'rgba(60,20,10,.6)'; c.fillRect(hx - 1.7, hy + 3.9, 3.4, 0.75);
      }
    }
    c.strokeStyle = INK; c.lineWidth = 0.8; path(c, side ? HEAD_S : HEAD_F, hx, hy); c.stroke();
    if (H.none) return;

    const al = H.alpha || 1, yl = hy - 2.7 - (H.line || 0.4) * 5;
    c.fillStyle = col; c.globalAlpha = al; c.beginPath();
    if (up) {
      if (H.zig) blob(c, hx, hy - 1.8, 6.6 + e, 5.6 + e, 12, 1);
      else {
        c.moveTo(hx - 4.3 - e * 0.6, hy - 7.3 - e); c.lineTo(hx + 4.3 + e * 0.6, hy - 7.3 - e); c.lineTo(hx + 6.7 + e, hy - 3.9); c.lineTo(hx + 6.7 + e, hy + 1.6);
        c.lineTo(hx + 5.2 + e * 0.5, hy + 4.4); c.lineTo(hx - 5.2 - e * 0.5, hy + 4.4); c.lineTo(hx - 6.7 - e, hy + 1.6); c.lineTo(hx - 6.7 - e, hy - 3.9); c.closePath();
      }
    } else if (side) {
      if (H.ring) { c.moveTo(hx - 7.1, hy - 3.2); c.lineTo(hx - 3.4, hy - 4.6); c.lineTo(hx - 0.2, hy - 2.6); c.lineTo(hx + 0.2, hy - 0.9); c.lineTo(hx - 2.1, hy - 1.2); c.lineTo(hx - 2.6, hy + 3.6); c.lineTo(hx - 5.0, hy + 4.4); c.lineTo(hx - 7.1, hy + 1.2); }
      else {
        c.moveTo(hx - 6.9 - e, hy + 2.4); c.lineTo(hx - 6.9 - e, hy - 3.8);
        if (H.zig) { c.lineTo(hx - 5.2 - e * 0.6, hy - 7.0 - e); c.lineTo(hx - 2.6, hy - 6.9 - e * 0.5); c.lineTo(hx - 1.0, hy - 7.9 - e); c.lineTo(hx + 0.9, hy - 7.0 - e * 0.5); c.lineTo(hx + 2.8, hy - 7.9 - e); }
        else { c.lineTo(hx - 3.8 - e * 0.7, hy - 7.3 - e); c.lineTo(hx + 3.2, hy - 7.3 - e); }
        c.lineTo(hx + 6.1 + e * 0.3, hy - 5.0 - e * 0.5); c.lineTo(hx + 6.1, yl + 1.0); c.lineTo(hx + 2.0, yl + 1.9);
        c.lineTo(hx + 1.2, hy + 0.2); c.lineTo(hx - 0.2, hy - 1.0); c.lineTo(hx - 2.1, hy - 1.2); c.lineTo(hx - 2.6, hy + 3.4); c.lineTo(hx - 5.0, hy + 4.4);
      }
      c.closePath();
    } else if (H.ring) {
      for (const s of [-1, 1]) { c.moveTo(hx + s * 7.1, hy - 4.3); c.lineTo(hx + s * 4.9, hy - 5.6); c.lineTo(hx + s * 5.5, hy - 2.4); c.lineTo(hx + s * 5.7, hy + 0.2); c.lineTo(hx + s * 7.1, hy + 0.6); c.closePath(); }
    } else {
      c.moveTo(hx - 6.7 - e, hy + 0.5); c.lineTo(hx - 6.7 - e, hy - 3.9 - e * 0.3);
      if (H.zig) { c.lineTo(hx - 5.6 - e * 0.6, hy - 6.7 - e); c.lineTo(hx - 3.4, hy - 7.0 - e * 0.4); c.lineTo(hx - 1.8, hy - 8.0 - e); c.lineTo(hx, hy - 7.2 - e * 0.5); c.lineTo(hx + 1.8, hy - 8.0 - e); c.lineTo(hx + 3.4, hy - 7.0 - e * 0.4); c.lineTo(hx + 5.6 + e * 0.6, hy - 6.7 - e); }
      else { const tx = H.flat ? 4.9 : 4.3; c.lineTo(hx - tx - e * 0.6, hy - 7.3 - e); c.lineTo(hx + tx + e * 0.6, hy - 7.3 - e); }
      c.lineTo(hx + 6.7 + e, hy - 3.9 - e * 0.3); c.lineTo(hx + 6.7 + e, hy + 0.5);
      const sl = H.part ? 0.7 : 0;      // a side parting tips the hairline
      c.lineTo(hx + 5.7, hy - 0.5); c.lineTo(hx + 5.3, yl + 1.3 + sl); c.lineTo(hx + 3.9, yl + sl); c.lineTo(hx - 3.9, yl - sl); c.lineTo(hx - 5.3, yl + 1.3 - sl); c.lineTo(hx - 5.7, hy - 0.5);
      c.closePath();
    }
    c.fill(); c.globalAlpha = 1;
    if (al === 1) { c.strokeStyle = INK; c.lineWidth = 0.6; c.stroke(); }
    // the pieces that make a silhouette: knot, ridge, quiff, tuft, hanging hair, bald crown
    c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 0.6;
    const T = H.top;
    if (up) {
      if (H.ring) { c.fillStyle = skin; path(c, CROWN, hx, hy); c.fill(); c.fillStyle = col; }
      if (H.locks) {
        const k = hy + H.locks + 1;
        c.beginPath(); c.moveTo(hx - 6.9 - e, hy - 3); c.lineTo(hx + 6.9 + e, hy - 3); c.lineTo(hx + 7.5 + e, k); c.lineTo(hx + 5.2, k + 2.2); c.lineTo(hx - 5.2, k + 2.2); c.lineTo(hx - 7.5 - e, k); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = col; c.fillRect(hx - 6.2 - e, hy - 3.6, 12.4 + e * 2, 1.4);
      }
      if (T === 'bun') { c.fillStyle = shade(col, lum(col) < 0.2 ? 26 : -26); path(c, KNOT, hx, hy - 2.6, 1.15, 1.15); c.fill(); c.stroke(); }
      if (T === 'mohawk') { c.beginPath(); c.moveTo(hx - 1.9, hy - 8.8); c.lineTo(hx + 1.9, hy - 8.8); c.lineTo(hx + 2.3, hy + 4.4); c.lineTo(hx - 2.3, hy + 4.4); c.closePath(); c.fill(); c.stroke(); }
    } else if (side) {
      c.beginPath();
      if (T === 'bun') { path(c, KNOT, hx - 6.6, hy - 6.4); }
      else if (T === 'mohawk') { c.moveTo(hx - 5.0, hy - 6.4); c.lineTo(hx - 3.2, hy - 9.8); c.lineTo(hx + 2.6, hy - 10.4); c.lineTo(hx + 6.0, hy - 8.2); c.lineTo(hx + 5.6, hy - 5.2); c.lineTo(hx + 2.8, hy - 7.0); c.closePath(); }
      else if (T === 'quiff') { c.moveTo(hx - 1.6, hy - 7.6); c.lineTo(hx + 2.6, hy - 10.4); c.lineTo(hx + 7.6, hy - 9.0); c.lineTo(hx + 6.2, hy - 5.2); c.lineTo(hx + 3.4, hy - 6.6); c.closePath(); }
      else if (T === 'tuft') { c.moveTo(hx + 2.4, hy - 7.5); c.lineTo(hx + 6.2, hy - 8.0); c.lineTo(hx + 6.5, hy - 4.6); c.lineTo(hx + 4.2, hy - 5.2); c.closePath(); }
      if (T) { c.fill(); c.stroke(); }
    } else {
      c.beginPath();
      if (T === 'bun') path(c, KNOT, hx, hy - 9.8 - e);
      else if (T === 'mohawk') { c.moveTo(hx - 2.6, yl + 0.8); c.lineTo(hx - 3.0, hy - 7.6); c.lineTo(hx - 0.6, hy - 10.4); c.lineTo(hx + 2.2, hy - 9.6); c.lineTo(hx + 3.0, hy - 7.2); c.lineTo(hx + 2.6, yl + 0.8); c.closePath(); }
      else if (T === 'quiff') { c.moveTo(hx - 5.4, hy - 6.6); c.lineTo(hx - 2.2, hy - 9.6); c.lineTo(hx + 3.6, hy - 10.6); c.lineTo(hx + 6.6, hy - 7.6); c.lineTo(hx + 5.0, yl + 0.2); c.lineTo(hx - 3.6, yl + 0.6); c.closePath(); }
      else if (T === 'tuft') { c.moveTo(hx - 3.8, yl + 1.2); c.lineTo(hx - 2.8, hy - 7.5); c.lineTo(hx + 2.8, hy - 7.5); c.lineTo(hx + 3.8, yl + 1.2); c.lineTo(hx, yl + 2.2); c.closePath(); }
      if (T) { c.fill(); c.stroke(); }
    }
    if (H.strands && !side) {       // braids: a few ink lines down the hanging hair
      const k = hy + H.locks + (up ? 2 : 0);
      c.lineWidth = 0.5; c.beginPath();
      for (let i = -2; i <= 2; i++) { if (!up && i > -2 && i < 2) continue; c.moveTo(hx + i * 2.9, hy + (up ? -2 : 1)); c.lineTo(hx + i * 3.0, k); }
      c.stroke();
    }
    if (L.band) {
      const by = hy - 3.9;
      c.fillStyle = L.band; c.beginPath();
      if (side) { c.moveTo(hx - 7 - e, by + 0.9); c.lineTo(hx + 6.4, by - 0.3); c.lineTo(hx + 6.4, by + 1.3); c.lineTo(hx - 7 - e, by + 2.5); }
      else { c.moveTo(hx - 6.9 - e, by); c.lineTo(hx + 6.9 + e, by); c.lineTo(hx + 6.9 + e, by + 1.6); c.lineTo(hx - 6.9 - e, by + 1.6); }
      c.closePath(); c.fill();
    }
  }

  // ---- body ---------------------------------------------------------------
  // The figure is a small rig drawn live every frame, so a pose is a set of numbers that can be blended:
  //   t1 k1 t2 k2   thigh angle (rad, + = forward) and knee bend (rad) of each leg
  //   s1 e1 s2 e2   shoulder swing (+ = forward) and elbow bend of each arm;  ab = arms held out sideways
  //   armsUp 0..1   arms raised overhead;  lean = torso pitch (+ = forward);  tilt = roll to the side
  //   sw1 sw2       a foot swept sideways on screen (px, + = right) - the front/back view's way of rolling the ball with one foot
  //   spread        feet apart (px);  air = height off the ground (px);  rot = whole-body rotation (lying down)
  // The legs are solved in the body's own side-on plane and the lower foot is put on the ground, so the hips rise and
  // fall with the stride instead of the feet sliding. The same solution is then drawn side-on, or from the front / back.
  const THIGH = 7.9, SHIN = 7.9, UARM = 5.3, FARM = 5.1, DZ = 0.42;
  const REST = { t1: 0, k1: 0, t2: 0, k2: 0, s1: 0, e1: 0.2, s2: 0, e2: 0.2, ab: 0, armsUp: 0, lean: 0, tilt: 0, spread: 0, air: 0, rot: 0, bob: 0, sw1: 0, sw2: 0 };
  const POSE_KEYS = Object.keys(REST);
  const FK1 = { kf: 0, kd: 0, ff: 0, fd: 0, fa: 0 }, FK2 = { kf: 0, kd: 0, ff: 0, fd: 0, fa: 0 };
  const AK1 = { ef: 0, ed: 0, hf: 0, hd: 0 }, AK2 = { ef: 0, ed: 0, hf: 0, hd: 0 };
  function legFK(o, t, k) {      // forward offset and drop below the hip of the knee and the foot
    o.kf = Math.sin(t) * THIGH; o.kd = Math.cos(t) * THIGH;
    o.ff = o.kf + Math.sin(t - k) * SHIN; o.fd = o.kd + Math.cos(t - k) * SHIN; o.fa = t - k;
    return o;
  }
  function armFK(o, sa, eb, up) {
    const a = sa + (2.5 - sa) * up, e = eb + (0.12 - eb) * up, L = 1 + 0.65 * up;      // raised arms reach past the head
    o.ef = Math.sin(a) * UARM * L; o.ed = Math.cos(a) * UARM * L;
    o.hf = o.ef + Math.sin(a + e) * FARM * L; o.hd = o.ed + Math.cos(a + e) * FARM * L;
    return o;
  }
  // an inked limb: two straight segments with a hard, bevelled joint over a dark outline. ext squares off the root end
  // (a shoulder); gap leaves that much of the first colour showing past the joint (a knee above the sock).
  function limb2(c, x0, y0, x1, y1, x2, y2, w1, w2, c1, c2, ext, gap) {
    let ax = x1 - x0, ay = y1 - y0, bx = x2 - x1, by = y2 - y1;
    const al = Math.sqrt(ax * ax + ay * ay) || 1, bl = Math.sqrt(bx * bx + by * by) || 1;
    ax /= al; ay /= al; bx /= bl; by /= bl;
    const sx = x0 - ax * ext, sy = y0 - ay * ext, g = Math.min(gap + 0.5, bl * 0.6);
    c.lineCap = 'butt'; c.lineJoin = 'bevel';
    c.strokeStyle = INK; c.lineWidth = Math.max(w1, w2) + 1.5;
    c.beginPath(); c.moveTo(sx - ax * 0.75, sy - ay * 0.75); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = c1; c.lineWidth = w1; c.beginPath(); c.moveTo(sx, sy); c.lineTo(x1, y1); c.lineTo(x1 + bx * g, y1 + by * g); c.stroke();
    c.strokeStyle = c2; c.lineWidth = w2; c.beginPath(); c.moveTo(x1 + bx * (g - 0.5), y1 + by * (g - 0.5)); c.lineTo(x2, y2); c.stroke();
  }
  const BOOT_S = [-2.4, -2.4, 1.4, -2.4, 4.9, -0.5, 4.9, 1.0, -2.4, 1.0];
  const BOOT_F = [-2.3, -2.6, 2.3, -2.6, 3.0, 0.5, 1.9, 2.4, -1.9, 2.4, -3.0, 0.5], BOOT_FS = [0.6, -2.6, 2.3, -2.6, 3.0, 0.5, 1.9, 2.4, 0.2, 2.4];
  function bootSide(c, x, y, ang, col) {
    c.save(); c.translate(x, y); c.rotate(-ang * 0.55);
    path(c, BOOT_S); c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.lineJoin = 'miter'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-1.8, 0.2, 6.1, 0.7);
    c.restore();
  }
  function bootFront(c, x, y, near, col) {
    const k = near ? 1 : 0.78;
    c.fillStyle = col; path(c, BOOT_F, x, y - 0.4, 1, k); c.fill();
    c.fillStyle = PLANE; path(c, BOOT_FS, x, y - 0.4, 1, k); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.7; c.lineJoin = 'miter'; path(c, BOOT_F, x, y - 0.4, 1, k); c.stroke();
  }
  const HAND = [-1.5, -1.7, 1.2, -1.9, 2.0, 0.1, 0.9, 2.0, -1.3, 1.5];
  function hand(c, x, y, skin, keeper, sg) {
    const k = keeper ? 1.45 : 1;
    c.fillStyle = keeper ? '#f4f4f4' : skin; path(c, HAND, x, y, k * (sg || 1), k); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.6; c.lineJoin = 'miter'; c.stroke();
  }
  function shortsPath(c, x, y, w, h, side) {
    c.beginPath();
    if (side) { c.moveTo(x + 0.5, y); c.lineTo(x + w - 0.5, y); c.lineTo(x + w + 0.5, y + h); c.lineTo(x - 0.5, y + h); }
    else { const m = x + w / 2; c.moveTo(x + 0.6, y); c.lineTo(x + w - 0.6, y); c.lineTo(x + w + 0.6, y + h); c.lineTo(m + 1.0, y + h); c.lineTo(m, y + h - 2.6); c.lineTo(m - 1.0, y + h); c.lineTo(x - 0.6, y + h); }
    c.closePath();
  }
  function shorts(c, kit, x, y, w, h, side) {
    c.fillStyle = kit.shorts; shortsPath(c, x, y, w, h, side); c.fill();
    c.fillStyle = PLANE; c.beginPath(); c.moveTo(x + w * 0.62, y); c.lineTo(x + w - 0.6, y); c.lineTo(x + w + 0.6, y + h); c.lineTo(x + w * 0.56, y + h); c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.9; c.lineJoin = 'miter'; shortsPath(c, x, y, w, h, side); c.stroke();
  }

  function drawChar(c, L, kit, dir, P0, keeper) {
    const P = P0 || REST, g = (k) => (P[k] === undefined ? REST[k] : P[k]);
    const w = L.w || 1, h = L.h || 1, skin = L.skin || DEF_SKIN, skinD = shade(skin, -34);
    const sock = kit.socks, sockD = shade(sock, -38), boot = L.boot || CORAL;
    const sleeve = kit.pat === 'sleeves' ? kit.b : kit.a, sleeveD = shade(sleeve, -34);
    const lw = 4.5 * Math.sqrt(w), up = g('armsUp'), ab = g('ab'), lean = g('lean'), tilt = g('tilt'), spr = g('spread');
    const L1 = legFK(FK1, g('t1'), g('k1')), L2 = legFK(FK2, g('t2'), g('k2'));
    const A1 = armFK(AK1, g('s1'), g('e1'), up), A2 = armFK(AK2, g('s2'), g('e2'), up);
    const hip = Math.max(L1.fd, L2.fd) + g('air') - 0.6, bob = g('bob');
    c.save();
    c.scale(h, h);
    if (g('rot')) { c.translate(0, -12); c.rotate(g('rot')); c.translate(0, 12); }
    if (dir === 'side') {
      const tw = 8.9 * w, hy = -hip;
      const leg = (F, far) => {
        limb2(c, 0, hy, F.kf, hy + F.kd, F.ff, hy + F.fd, lw, 3.8, far ? skinD : skin, far ? sockD : sock, 0, 1.3);
        bootSide(c, F.ff, hy + F.fd, F.fa, far ? shade(boot, -30) : boot);
      };
      const arm = (A, far) => {
        const k = Math.max(0.45, Math.cos(ab)), sx = 0.4, sy = -10.3 + bob;
        limb2(c, sx, sy, sx + A.ef * k, sy + A.ed, sx + A.hf * k, sy + A.hd, 3.5, 3, far ? sleeveD : sleeve, far ? skinD : skin, 1.2, 0);
        hand(c, sx + A.hf * k, sy + A.hd, far ? skinD : skin, keeper, 1);
      };
      leg(L2, true); leg(L1, false);
      c.translate(0, hy); c.rotate(lean);              // the upper body pivots at the hips
      arm(A2, true);
      shorts(c, kit, -tw / 2 - 0.3, -4.6, tw + 0.6, 7.2, true);
      shirt(c, kit, -tw / 2, -15.2 + bob, tw, 11.6, true);
      arm(A1, false);
      head(c, L, 'side', 1.2, -21.6 + bob);
    } else {
      const s = dir === 'up' ? -1 : 1, tw = 12.5 * w, hy = -hip;
      const leg = (F, sg) => {
        const sw = sg < 0 ? g('sw1') : g('sw2');
        const hx = sg * (3.3 * w + spr * 0.35), fx = sg * (3.3 * w + spr) + sw, kx = (hx + fx) / 2 + sg * Math.max(0, F.kf - F.ff) * 0.12;
        const ky = hy + F.kd + s * F.kf * DZ, fy = hy + F.fd + s * F.ff * DZ;
        limb2(c, hx, hy, kx, ky, fx, fy, lw, 3.9, skin, sock, 0, 1.3);
        bootFront(c, fx, fy, s * F.ff >= 0, boot);
      };
      // the leg further from the viewer goes down first
      if (s * L1.ff <= s * L2.ff) { leg(L1, -1); leg(L2, 1); } else { leg(L2, 1); leg(L1, -1); }
      c.translate(0, hy); c.rotate(tilt); c.translate(0, s * lean * 4.5);
      const th = 11.7 * (1 - Math.min(0.25, Math.abs(lean) * 0.3));
      shorts(c, kit, -tw / 2, -5.1, tw, 7.4, false);
      shirt(c, kit, -tw / 2, -4.9 - th + bob, tw, th, false);
      if (dir === 'up' && L.num != null) {
        c.fillStyle = lum(kit.a) > 0.55 ? '#16161a' : '#ffffff';
        c.font = '700 6.6px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(L.num), 0, -4.9 - th / 2 + bob + 0.4);
      }
      const arm = (A, sg) => {
        const sx = sg * (tw / 2 + 0.7), sy = -4.9 - th + 2.1 + bob, out = Math.sin(ab) + up * 0.35, k = Math.max(0.3, Math.cos(ab));
        const ex = sx + sg * (0.9 + out * UARM), ey = sy + A.ed * k + s * A.ef * DZ;
        const hx = sx + sg * (1.3 + out * (UARM + FARM)), hy2 = sy + A.hd * k + s * A.hf * DZ;
        limb2(c, sx, sy, ex, ey, hx, hy2, 3.6, 3, sleeve, skin, 1.0, 0);
        hand(c, hx, hy2, skin, keeper, sg);
      };
      arm(A1, -1); arm(A2, 1);
      head(c, L, dir, 0, -4.9 - th - 6.6 + bob);
    }
    c.restore();
  }

  // The fixed frames of the sheet layout, used only when a hand-drawn PNG replaces a generated character.
  const ANIMS = [['idle', 2], ['run', 6], ['sprint', 6], ['kick', 3], ['tackle', 2], ['slide', 1],
    ['celebrate', 4], ['skill', 4], ['stumble', 1], ['dive', 1]];
  const DIRS = ['down', 'up', 'side'];       // 'side' faces right; the renderer mirrors it for left
  const COL = {};
  let NCOL = 0;
  for (const [a, f] of ANIMS) { COL[a] = { start: NCOL, frames: f }; NCOL += f; }

  function canvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv;
  }

  const cache = new Map();
  function entryFor(key, look, kit, keeper) {
    let e = cache.get(key);
    if (!e) { e = { look, kit, keeper, img: null }; cache.set(key, e); }
    return e;
  }
  // The character for a footballer; optionally a professional PNG sheet (ISO.SPRITE_OVERRIDES) replaces the live drawing.
  function forPlayer(def, kit, slot) {
    const key = def.id + ':' + slot + ':' + kit.a + kit.b + kit.pat + (def.look.boot || '');
    const fresh = !cache.has(key);
    const entry = entryFor(key, Object.assign({ num: def.num }, def.look), kit, false);
    const url = fresh && ISO.SPRITE_OVERRIDES && ISO.SPRITE_OVERRIDES[def.id];
    if (url && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { if (img.width >= NCOL * CW && img.height >= DIRS.length * CH) entry.img = img; };
      img.onerror = () => {};       // keep the live character
      img.src = url;
    }
    return entry;
  }
  function forKeeper(def, team) { return entryFor('gk:' + team, def.look, def.kit, true); }

  // Draw the character in pose P with its feet anchored at (x, y); angle (optional) turns a lying body on the ground.
  function drawLive(ctx, entry, P, dir, x, y, flip, angle, sx) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(DRAW_SCALE * (sx || 1), DRAW_SCALE);
    if (angle != null) { ctx.translate(0, -8); ctx.rotate(angle); ctx.translate(0, 12); }
    if (flip) ctx.scale(-1, 1);
    drawChar(ctx, entry.look, entry.kit, dir, P, entry.keeper);
    ctx.restore();
  }
  // one cell of a replacement PNG sheet
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

  // ---- portraits ------------------------------------------------------------
  /* A head-and-shoulders bust in the same framing as before, drawn on a 100 x 100 grid (x = 0 is the middle of the
     face). The face is a faceted polygon - temple, cheek, jaw corner and chin are separate vertices - with one flat
     shadow plane on the right, straight heavy brows and hair built from straight-edged blocks.
     look.face picks the jaw (oval / long / square / round / narrow / wide); unknown values fall back to oval. */
  const FACES = {
    oval: { tw: 18.5, cw: 19, jw: 14.5, chw: 6.5, jy: 60, chy: 68.5 },
    long: { tw: 17.6, cw: 17.9, jw: 13.6, chw: 6.6, jy: 61.5, chy: 71.5 },
    square: { tw: 19, cw: 19.5, jw: 17.4, chw: 9, jy: 61, chy: 68.5 },
    round: { tw: 20, cw: 21, jw: 16.6, chw: 8, jy: 59.5, chy: 67 },
    narrow: { tw: 18, cw: 18, jw: 12.2, chw: 5.2, jy: 60, chy: 69.5 },
    wide: { tw: 20.5, cw: 21, jw: 18.4, chw: 9.6, jy: 60.5, chy: 67.5 },
  };
  const CR = 17, CRW = 10, TY = 30, CY = 49;      // crown height and half-width, temple and cheekbone heights
  function fillP(c, p, col) { path(c, p); c.fillStyle = col; c.fill(); }
  function inkP(c, p, lw) { path(c, p); c.strokeStyle = INK; c.lineWidth = lw || 1.5; c.stroke(); }
  // the outside of a hair cap: o = thickness at the sides, v = height over the crown, sb = how far down the sides it comes
  function capOuter(g, o, v, sb) {
    return [-g.tw - o, sb, -g.tw - o, TY - 2, -(g.tw - 3) - o * 0.8, CR + 5 - v * 0.55, -CRW - o * 0.3, CR - v,
      CRW + o * 0.3, CR - v, g.tw - 3 + o * 0.8, CR + 5 - v * 0.55, g.tw + o, TY - 2, g.tw + o, sb];
  }
  // hairlines, right to left across the forehead
  function hairline(kind, g, y, sb) {
    const t = g.tw;
    if (kind === 'part') return [t - 2.4, sb, t - 2.8, y + 5, t - 6.5, y + 1.6, -8.5, y - 2.2, -10, y + 1.2, -(t - 5.5), y + 0.4, -(t - 2.8), y + 4.5, -(t - 2.4), sb];
    if (kind === 'widow') return [t - 2.4, sb, t - 2.8, y + 4, t - 6.8, y - 3.4, 5, y - 0.6, 0, y + 1.5, -5, y - 0.6, -(t - 6.8), y - 3.4, -(t - 2.8), y + 4, -(t - 2.4), sb];
    if (kind === 'fringe') return [t - 1.5, sb, t - 3, y + 9, 11.5, y + 6, 7.5, y + 9.5, 2.5, y + 5.5, -3, y + 9.5, -8, y + 5.5, -12.5, y + 9.5, -(t - 3), y + 6.5, -(t - 1.5), sb];
    if (kind === 'sweep') return [t - 2.4, sb, t - 2.6, y + 8, t - 6, y + 6.5, 4, y + 2.5, -8.5, y - 1.8, -10.2, y + 1.4, -(t - 5.5), y + 0.6, -(t - 2.8), y + 4.5, -(t - 2.4), sb];
    if (kind === 'curtain') return [t - 1.5, sb, t - 3.2, y + 11, 9, y + 3, 1.5, y - 2, -1.5, y - 2, -9, y + 3, -(t - 3.2), y + 11, -(t - 1.5), sb];
    if (kind === 'zig') return [t - 2.4, sb, t - 2.8, y + 4.5, t - 6, y + 0.5, 9, y + 2.8, 5.5, y - 0.4, 2, y + 2.6, -2, y - 0.2, -5.5, y + 2.8, -9, y, -(t - 6), y + 2.2, -(t - 2.8), y + 4.5, -(t - 2.4), sb];
    return [t - 2.4, sb, t - 2.8, y + 4.5, t - 6, y, -(t - 6), y, -(t - 2.8), y + 4.5, -(t - 2.4), sb];
  }
  // a jagged arc over the head, left to right (curls, afro)
  function zigArc(rx, ry, cy, n, d) {
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - d + ((Math.PI + 2 * d) * i) / n, k = i % 2 ? 1.07 : 0.95;
      p.push(Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    return p;
  }
  /* look.hair -> the portrait's hair. cap [o, v, sb], hl = hairline kind at height y, a = cropped to the scalp,
     fade = shaved sides under a fuller top, lines = strand strokes. */
  const PH = {
    bald: null,
    shaved: { cap: [0.4, 0.8, 41], hl: 'straight', y: 26.5, a: 0.26 },
    buzz: { cap: [0.6, 1.2, 42], hl: 'straight', y: 26.5, a: 0.84 },
    receding: { cap: [0.7, 1.5, 42], hl: 'widow', y: 23.8, a: 0.9 },
    short: { cap: [1.3, 3, 43], hl: 'part', y: 27, lines: 'part' },
    side: { cap: [1.5, 4.4, 44], hl: 'sweep', y: 26.5, lines: 'part' },
    slick: { cap: [1.1, 2.8, 42], hl: 'widow', y: 25.6, lines: 'back' },
    bun: { cap: [1.0, 2.4, 41], hl: 'widow', y: 25.6, lines: 'back', knot: 1 },
    fade: { fade: 1, cap: [0.7, 3.4, TY + 2], hl: 'straight', y: 26 },
    quiff: { fade: 1, top: 'quiff', hl: 'straight', y: 26.2, lines: 'quiff' },
    curly: { fade: 1, top: 'zig', hl: 'zig', y: 26.5 },
    mohawk: { fade: 1, top: 'mohawk' },
    tuft: { shave: 0.26, top: 'tuft' },
    afro: { top: 'afro', hl: 'zig', y: 27 },
    mop: { cap: [3, 4.4, 53], hl: 'fringe', y: 27, lines: 'down' },
    long: { cap: [2.6, 3.6, 52], hl: 'curtain', y: 27, lines: 'curtain', back: 'long' },
    braids: { cap: [1, 2.4, 40], hl: 'straight', y: 25, lines: 'rows', back: 'braids' },
    balding: { ring: 1 },
  };
  function strands(c, kind, y, col) {
    c.strokeStyle = col; c.lineWidth = 0.9; c.lineCap = 'butt'; c.beginPath();
    const ln = (x1, y1, x2, y2) => { c.moveTo(x1, y1); c.lineTo(x2, y2); };
    if (kind === 'part') { ln(-8.5, y - 2, -3, CR - 2); ln(-3, y - 0.6, 4, CR - 2.5); ln(4.5, y + 1.5, 10.5, CR); }
    else if (kind === 'back') for (const x of [-9, -3, 3, 9]) ln(x, y - 1, x * 0.6, CR - 1);
    else if (kind === 'down') { ln(-10, CR + 2, -12, y + 6); ln(-2, CR, -3, y + 7); ln(7, CR + 1, 8, y + 7); }
    else if (kind === 'rows') for (let x = -12; x <= 12.1; x += 4.8) ln(x, y + 1, x * 0.5, CR - 2);
    else if (kind === 'quiff') { ln(-8, y, -3, CR - 5); ln(0, y, 4, CR - 7); ln(8, y, 12, CR - 3); }
    else if (kind === 'curtain') { ln(-3, y, -14, 41); ln(3, y, 14, 41); ln(0, y - 2, 0, CR - 3); }
    c.stroke();
  }

  function bust(c, L, kit) {
    const F = FACES[L.face] || FACES.oval, g = F, tw = F.tw, cw = F.cw, jw = F.jw, chw = F.chw, jy = F.jy, chy = F.chy, my = chy - 8.6;
    const skin = L.skin || DEF_SKIN, sD = shade(skin, -24), sDD = shade(skin, -46);
    const hc = L.hairColor || DEF_HAIR, hc2 = L.hair2 || hc, w = Math.max(0.85, Math.min(1.16, L.w || 1));
    const nw = 9.6 + (w - 1) * 9, sw = 35 + (w - 1) * 32;
    const st = L.hair in PH ? PH[L.hair] : PH.short, vol = Math.max(0.5, Math.min(1.25, L.vol || 1));
    const dkHair = lum(hc) < 0.22, strandCol = dkHair ? shade(hc, 34) : shade(hc, -44);
    c.lineJoin = 'round'; c.lineCap = 'butt';

    // shirt: flat kit colours, one shadow plane, a patch of hatching
    const SH = [-nw - 2.5, 78.5, -sw + 4, 85.5, -sw - 2.5, 92, -sw - 4.5, 104, sw + 4.5, 104, sw + 2.5, 92, sw - 4, 85.5, nw + 2.5, 78.5];
    c.save(); path(c, SH); c.clip();
    kitFill(c, kit, -52, 76, 104, 30, 6.4);
    if (kit.pat === 'sleeves') { c.fillStyle = kit.b; fillP(c, [-60, 76, -(sw - 9), 76, -(sw - 14), 104, -60, 104], kit.b); fillP(c, [60, 76, sw - 9, 76, sw - 14, 104, 60, 104], kit.b); }
    fillP(c, [9, 76, 60, 76, 60, 104, 21, 104], PLANE);
    c.strokeStyle = 'rgba(255,255,255,.34)'; c.lineWidth = 0.9; c.beginPath();
    for (let i = 0; i < 5; i++) { c.moveTo(-31 + i * 3.4, 100); c.lineTo(-23 + i * 3.4, 90.5); }
    c.stroke(); c.restore();
    inkP(c, SH, 1.6);

    // hair hanging behind the neck
    if (st && st.back === 'long') {
      const B = [-tw - 3, 27, -tw - 6.5, 52, -tw - 5, 77, -tw - 1, 83.5, -tw + 3, 79.5, -9, 82, 9, 82, tw - 3, 79.5, tw + 1, 83.5, tw + 5, 77, tw + 6.5, 52, tw + 3, 27];
      fillP(c, B, hc2); c.save(); c.clip(); fillP(c, [4, 20, 40, 20, 40, 90, 12, 90], PLANE);
      c.strokeStyle = strandCol; c.lineWidth = 0.9; c.beginPath();
      for (const x of [-tw - 2.6, -tw + 1.2, tw - 1.2, tw + 2.6]) { c.moveTo(x, 52); c.lineTo(x * 0.98, 79); }
      c.stroke(); c.restore(); inkP(c, B, 1.5);
    } else if (st && st.back === 'braids') {
      for (const s of [-1, 1]) for (let i = 2; i >= 0; i--) {
        const x = s * (tw + 1.6 - i * 4.3), y2 = 84 - i * 2.5 - (i === 0 ? 3 : 0);
        const B = [x - 1.8, 30, x + 1.8, 30, x + 1.8, y2, x, y2 + 1.8, x - 1.8, y2];
        fillP(c, B, hc2); inkP(c, B, 1.1);
        c.strokeStyle = strandCol; c.lineWidth = 0.6; c.beginPath();
        for (let y = 50; y < y2 - 1; y += 3.6) { c.moveTo(x - 1.2, y); c.lineTo(x + 1.2, y + 1.4); }
        c.stroke();
      }
    } else if (st && st.top === 'afro') {
      const B = zigArc(tw + 8.5 * vol, 13 + 9.5 * vol, 29, 14, 0.5);
      fillP(c, B, hc2); inkP(c, B, 1.5);
    }
    if (st && st.knot) { const K = [-5.4, CR - 1, -6.4, CR - 6.6, -2.8, CR - 10, 2.8, CR - 10, 6.4, CR - 6.6, 5.4, CR - 1]; fillP(c, K, hc); fillP(c, [1, CR - 10, 2.8, CR - 10, 6.4, CR - 6.6, 5.4, CR - 1, 2.6, CR - 1], PLANE); inkP(c, K, 1.4); }

    // neck, with the shadow the jaw throws on it, and the collar
    const NK = [-nw, 55, nw, 55, nw + 2.5, 78.5, 0, 87, -nw - 2.5, 78.5];
    fillP(c, NK, skin); fillP(c, [2, 55, nw, 55, nw + 2.5, 78.5, 0, 87], sD);
    fillP(c, [-nw, 55, nw, 55, nw + 0.7, chy + 2.5, 1, chy + 7.5, -nw - 0.5, chy + 1.5], sDD);
    inkP(c, NK, 1.5);
    c.lineJoin = 'miter'; c.strokeStyle = INK; c.lineWidth = 4.6; c.beginPath(); c.moveTo(-nw - 3.4, 77.8); c.lineTo(0, 87.4); c.lineTo(nw + 3.4, 77.8); c.stroke();
    c.strokeStyle = lum(kit.b) === lum(kit.a) ? shade(kit.a, -40) : kit.b; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-nw - 3.2, 78); c.lineTo(0, 87.3); c.lineTo(nw + 3.2, 78); c.stroke();
    c.lineJoin = 'round';
    if (L.collar === 'up') for (const s of [-1, 1]) { const K = [s * (nw - 1.5), 66, s * (nw + 6.5), 63, s * (nw + 10), 81.5, s * (nw + 1.5), 80]; fillP(c, K, kit.b); inkP(c, K, 1.4); }

    // ears, then the faceted head and its shadow plane
    for (const s of [-1, 1]) {
      const E = [s * (tw - 0.5), 39.5, s * (tw + 3.6), 38.2, s * (tw + 4.3), 45.5, s * (cw + 1.7), 51.6, s * (cw - 0.5), 50.5];
      fillP(c, E, s > 0 ? sD : skin); inkP(c, E, 1.4);
      c.strokeStyle = sDD; c.lineWidth = 0.9; c.beginPath(); c.moveTo(s * (tw + 2.4), 41); c.lineTo(s * (tw + 1.5), 47); c.stroke();
    }
    const HD = [-tw, TY, -(tw - 3), CR + 5, -CRW, CR, CRW, CR, tw - 3, CR + 5, tw, TY, cw, CY, jw, jy, chw, chy, -chw, chy, -jw, jy, -cw, CY];
    fillP(c, HD, skin);
    fillP(c, [CRW - 2, CR, CRW, CR, tw - 3, CR + 5, tw, TY, cw, CY, jw, jy, chw, chy, chw - 2.5, chy, jw - 4.5, jy - 3, cw - 6.5, CY - 1, tw - 5.5, 36, tw - 6.5, 25], sD);
    const big = L.nose === 'big' ? 1.3 : 1;
    fillP(c, [0.9, 42.5, 4.3 * big, 53.2, 0.4, 55], sD);

    // beard
    const bk = beardKind(L.beard), bc = L.beardColor || hc;
    if (bk) {
      c.globalAlpha = bk === 'stubble' ? 0.3 : 1;
      if (bk === 'goatee') fillP(c, [-7, my - 3.4, 7, my - 3.4, 7.8, my + 2, chw + 0.6, chy, -chw - 0.6, chy, -7.8, my + 2], bc);
      else if (bk === 'moustache') fillP(c, [-7.2, my - 3.6, 7.2, my - 3.6, 8.6, my - 0.2, 0, my - 1.5, -8.6, my - 0.2], bc);
      else if (bk === 'chinstrap') fillP(c, [-cw + 0.4, CY - 4, -cw, CY, -jw, jy, -chw, chy, chw, chy, jw, jy, cw, CY, cw - 0.4, CY - 4, cw - 3, CY + 1, jw - 2.6, jy - 1.6, chw - 0.6, chy - 2.8, -chw + 0.6, chy - 2.8, -jw + 2.6, jy - 1.6, -cw + 3, CY + 1], bc);
      else fillP(c, [-cw + 0.3, CY - 5, -cw, CY, -jw, jy, -chw, chy, chw, chy, jw, jy, cw, CY, cw - 0.3, CY - 5, cw - 4.6, CY + 2.5, jw - 3.6, jy - 4.6, 7.6, my - 3.6, 0, my - 4.6, -7.6, my - 3.6, -jw + 3.6, jy - 4.6, -cw + 4.6, CY + 2.5], bc);
      if (bk === 'full') { c.save(); c.clip(); fillP(c, [6, 40, 40, 40, 40, 80, 3, 80], PLANE); c.restore(); }
      c.globalAlpha = 1;
    }
    inkP(c, HD, 1.6);

    // nose, mouth
    c.strokeStyle = sDD; c.lineWidth = 1.1; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-3.2 * big, 53.4); c.lineTo(0.4, 55.2); c.lineTo(4.4 * big, 53.3); c.stroke();
    const beardDark = bk === 'full' || bk === 'goatee' || bk === 'moustache';
    if (L.mouth === 'grin') { const M = [-6.6, my - 1.4, 6.6, my - 1.4, 4.6, my + 2.4, -4.6, my + 2.4]; fillP(c, M, '#f6f1e7'); inkP(c, M, 1.1); }
    else {
      c.strokeStyle = beardDark && lum(bc) < 0.3 ? shade(skin, -12) : shade(skin, -92); c.lineWidth = 1.3; c.beginPath();
      c.moveTo(-5.6, my - 0.5); c.lineTo(-3, my + 0.3); c.lineTo(3, my + 0.3); c.lineTo(5.6, my - 0.5); c.stroke();
      if (!beardDark) { c.strokeStyle = sDD; c.lineWidth = 1; c.beginPath(); c.moveTo(-2.4, my + 2.9); c.lineTo(2.4, my + 2.9); c.stroke(); }
    }
    // eyes under straight brows
    const bw = L.brow === 'heavy' ? 3.5 : L.brow === 'light' ? 1.8 : 2.6;
    const browCol = L.browColor || (lum(hc) > 0.5 ? shade(hc, -70) : shade(hc, -14));
    for (const s of [-1, 1]) {
      fillP(c, [s * 12.8, 42.9, s * 10.6, 40.9, s * 7, 40.7, s * 4.6, 42.8, s * 7, 44.6, s * 10.8, 44.6], '#f6f1e7');
      c.fillStyle = L.eye || '#1c1512'; c.beginPath(); c.arc(s * 8.5 + 0.3, 42.6, 1.95, 0, 7); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s * 13, 43.1); c.lineTo(s * 10.6, 40.8); c.lineTo(s * 7, 40.6); c.lineTo(s * 4.4, 42.8); c.stroke();
      fillP(c, [s * 3.3, 38.8, s * 3.6, 38.8 - bw, s * 14.4, 36.8 - bw * 0.72, s * 14.8, 36.9], browCol);
    }

    // hair
    if (st) {
      let top = null, y = st.y || 26.5;
      if (st.ring) {
        for (const s of [-1, 1]) { const B = [s * (tw + 1.1), 27, s * (tw + 1.3), 45, s * (tw - 2.4), 45, s * (tw - 3.2), 36, s * (tw - 6.5), 27.5, s * (tw - 5), CR + 3.4, s * (tw - 2.4), CR + 5]; c.globalAlpha = 0.86; fillP(c, B, hc); c.globalAlpha = 1; inkP(c, B, 1.2); }
        c.strokeStyle = shade(skin, 26); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-7, CR + 3.2); c.lineTo(-2, CR + 2.4); c.stroke();      // light on the bare crown
      }
      if (st.fade || st.shave) {      // cropped sides under the top
        c.globalAlpha = st.shave || 0.5; fillP(c, capOuter(g, 0.4, 0.9, 42).concat(hairline('straight', g, 26.5, 42)), hc2); c.globalAlpha = 1;
      }
      if (st.cap) top = capOuter(g, st.cap[0], st.cap[1], st.cap[2]).concat(hairline(st.hl, g, y, st.cap[2]));
      else if (st.top === 'quiff') top = [-tw - 0.4, TY + 2, -tw - 0.6, TY - 3, -(tw - 2.5), CR + 1, -CRW + 1, CR - 4.5, 3, CR - 9, tw - 3, CR - 7.5, tw + 1.6, CR - 1, tw + 0.9, TY - 2, tw + 0.4, TY + 2].concat(hairline('straight', g, y, TY + 2));
      else if (st.top === 'zig') top = zigArc(tw + 1.6, 16.5, 30, 10, 0.12).concat(hairline('zig', g, y, TY + 2));
      else if (st.top === 'afro') top = zigArc(tw + 8.5 * vol, 13 + 9.5 * vol, 29, 14, 0.5).concat(hairline('zig', g, y, 44));
      else if (st.top === 'mohawk') top = [-7, 28, -8.6, CR + 1, -5.4, CR - 6, 0.5, CR - 9.5, 6, CR - 6.5, 8.6, CR + 1, 7, 28, 0, 30];
      else if (st.top === 'tuft') top = [-9.5, 28.5, -7.5, CR + 1.5, 0, CR - 0.6, 7.5, CR + 1.5, 9.5, 28.5, 0, 31];
      if (top) {
        c.globalAlpha = st.a || 1; fillP(c, top, hc); c.globalAlpha = 1;
        c.save(); c.clip();
        fillP(c, [5, -10, 60, -10, 60, 70, 15, 70], PLANE);
        if (L.hair2 && st.top === 'zig') fillP(c, [-40, 20.5, -8, 22.5, 0, 20, 9, 22.5, 40, 20.5, 40, 60, -40, 60], hc2);      // dyed tips over dark roots
        if (st.lines) strands(c, st.lines, y, strandCol);
        c.restore();
        if (!st.a || st.a > 0.8) inkP(c, top, 1.5);
      }
      if (st.cap && st.cap[2] > 50) {}      // long sides already cover the ears
    }
    if (L.band) { const B = [-tw - 1.6, 24.6, tw + 1.6, 24.6, tw + 1.8, 28.6, -tw - 1.8, 28.6]; fillP(c, B, L.band); fillP(c, [8, 24.6, tw + 1.6, 24.6, tw + 1.8, 28.6, 10, 28.6], PLANE); inkP(c, B, 1.3); }
  }

  const portraits = new Map();
  function portrait(def, size, kitOverride) {
    const kit = kitOverride || def.kit, look = def.look || {}, key = def.id + size + kit.a + kit.b + kit.pat + (look.boot || '');
    let cv = portraits.get(key);
    if (cv) return cv;
    cv = canvas(size * 2, size * 2);
    const c = cv.getContext('2d'), D = size * 2, k = (D / 100) * 1.1;
    c.setTransform(k, 0, 0, k, D / 2, D * 0.37 - 43 * k);      // head and shoulders, the face a little above the middle
    bust(c, look, kit);
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
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6e9ee');
      c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
      c.fillStyle = CORAL;       // a coral slab that sweeps across as the ball rolls
      const sw = ((f / BALL_FRAMES) * 2 - 1) * r * 1.6;
      c.beginPath(); c.moveTo(sw - r * 0.5, -r); c.lineTo(sw + r * 0.1, -r); c.lineTo(sw + r * 0.1 - r * 0.9, r); c.lineTo(sw - r * 0.5 - r * 0.9, r); c.closePath(); c.fill();
      c.fillStyle = INK;
      const off = (f / BALL_FRAMES) * r * 2.2;
      const pent = (px, py, s) => { c.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + f * 0.25; c.lineTo(px + Math.cos(a) * s, py + Math.sin(a) * s); } c.closePath(); c.fill(); };
      for (let i = -2; i <= 2; i++) { pent(i * r * 1.1 + off - r * 1.1, (i % 2 ? -1 : 1) * r * 0.45, r * 0.36); }
      c.restore();
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(f * BALL_PX + BALL_PX / 2, BALL_PX / 2, r, 0, 7); c.stroke();
    }
    return ballSheet;
  }

  ISO.Sprites = {
    LAYOUT: { cellW: CW, cellH: CH, scale: S, footX: FOOT_X, footY: FOOT_Y, anims: ANIMS, dirs: DIRS },
    forPlayer, forKeeper, draw, drawLive, portrait, ball, BALL_FRAMES, BALL_PX, drawChar, REST, POSE_KEYS, DRAW_SCALE,
  };
})();
