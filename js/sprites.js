/* ISO FOOTBALL — 2D characters.
   Every footballer is drawn live from their look + kit and a pose (see drawChar), at whatever size the camera asks
   for, so the figures stay sharp and every movement can blend into the next. A hand-drawn PNG sheet in the fixed
   layout (ISO.Sprites.LAYOUT) can still replace a character via ISO.SPRITE_OVERRIDES — a missing or broken image
   simply keeps the live one. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const CW = 64, CH = 62, S = 2, FOOT_X = 32, FOOT_Y = 52, DRAW_SCALE = 1.15;
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, v + amt));
    return 'rgb(' + c((n >> 16) & 255) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
  }
  // Flat, angular "blueprint poster" look: coral / slate / navy / white, hard chamfers, no soft curves,
  // diagonal hatching and crisp ink outlines.
  const INK = '#1f2433', CORAL = '#f1735f', SLATE = '#4b5a74';
  function limb(c, x1, y1, x2, y2, w, col) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'square';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  // chamfered rectangle: r is the size of the cut corners
  function rr(c, x, y, w, h, r) {
    r = Math.min(r * 0.9, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.lineTo(x + w, y + r); c.lineTo(x + w, y + h - r); c.lineTo(x + w - r, y + h);
    c.lineTo(x + r, y + h); c.lineTo(x, y + h - r); c.lineTo(x, y + r); c.closePath();
  }
  // faceted ellipse (octagon)
  function poly(c, x, y, rx, ry) {
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(x + Math.cos(a) * rx * 1.08, y + Math.sin(a) * ry * 1.08); }
    c.closePath();
  }
  function ell(c, x, y, rx, ry, col) { c.fillStyle = col; poly(c, x, y, rx, ry); c.fill(); }
  // diagonal hatching clipped to the current path
  function hatch(c, x, y, w, h, col, gap, lw) {
    c.save(); c.clip(); c.strokeStyle = col; c.lineWidth = lw || 0.8; c.lineCap = 'butt'; c.beginPath();
    for (let i = -h; i < w; i += gap) { c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); }
    c.stroke(); c.restore();
  }

  function shirt(c, kit, x, y, w, h, r) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    c.fillStyle = kit.a; c.fillRect(x, y, w, h);
    c.fillStyle = kit.b;
    if (kit.pat === 'vstripes') { for (let i = 0, sx = x - 0.4; sx < x + w; sx += 2.5, i++) if (i % 2) c.fillRect(sx, y, 2.5, h); }
    else if (kit.pat === 'hoops') { for (let i = 0, sy = y; sy < y + h; sy += 2.4, i++) if (i % 2) c.fillRect(x, sy, w, 2.4); }
    else if (kit.pat === 'cstripe') c.fillRect(x + w / 2 - w * 0.17, y, w * 0.34, h);
    else if (kit.pat === 'pin') { for (let sx = x + 1.2; sx < x + w; sx += 2.4) c.fillRect(sx, y, 0.55, h); }
    else if (kit.pat === 'halves') c.fillRect(x + w / 2, y, w / 2, h);
    else if (kit.pat === 'quarters') { c.fillRect(x + w / 2, y, w / 2, h / 2); c.fillRect(x, y + h / 2, w / 2, h / 2); }
    else if (kit.pat === 'sash') { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.3, y); c.lineTo(x + w, y + h * 0.75); c.lineTo(x + w, y + h); c.lineTo(x + w * 0.7, y + h); c.lineTo(x, y + h * 0.25); c.closePath(); c.fill(); }
    else if (kit.pat === 'chevron') { c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(x + w / 2, y + h * 0.55); c.lineTo(x + w, y + h * 0.15); c.lineTo(x + w, y + h * 0.42); c.lineTo(x + w / 2, y + h * 0.82); c.lineTo(x, y + h * 0.42); c.closePath(); c.fill(); }
    else c.fillRect(x, y, w, 1.5);     // collar trim
    // hard-edged shadow plane and a hatched panel, like the poster's overlapping slabs
    c.fillStyle = 'rgba(31,36,51,.32)'; c.beginPath(); c.moveTo(x + w * 0.62, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x + w * 0.3, y + h); c.closePath(); c.fill();
    c.save(); c.beginPath(); c.moveTo(x, y + h * 0.55); c.lineTo(x + w * 0.4, y + h * 0.55); c.lineTo(x + w * 0.22, y + h); c.lineTo(x, y + h); c.closePath();
    hatch(c, x, y, w, h, 'rgba(255,255,255,.55)', 1.7, 0.6); c.restore();
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 0.9; c.lineJoin = 'miter'; rr(c, x, y, w, h, r); c.stroke();
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
    c.strokeStyle = INK; c.lineWidth = 0.8; poly(c, hx, hy, R, R); c.stroke();
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
  function legFK(t, k) {      // forward offset and drop below the hip of the knee and the foot
    const kf = Math.sin(t) * THIGH, kd = Math.cos(t) * THIGH;
    return { kf, kd, ff: kf + Math.sin(t - k) * SHIN, fd: kd + Math.cos(t - k) * SHIN, fa: t - k };
  }
  function armFK(sa, eb, up) {
    const a = sa + (2.5 - sa) * up, e = eb + (0.12 - eb) * up, L = 1 + 0.65 * up;      // raised arms reach past the head
    const ef = Math.sin(a) * UARM * L, ed = Math.cos(a) * UARM * L;
    return { ef, ed, hf: ef + Math.sin(a + e) * FARM * L, hd: ed + Math.cos(a + e) * FARM * L };
  }
  // an inked limb: two segments with a dark outline under them and clean round joints
  function limb2(c, x0, y0, x1, y1, x2, y2, w1, w2, c1, c2) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = INK; c.lineWidth = Math.max(w1, w2) + 1.5;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = c1; c.lineWidth = w1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = c2; c.lineWidth = w2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function bootSide(c, x, y, ang, col) {
    c.save(); c.translate(x, y); c.rotate(-ang * 0.55);
    c.beginPath(); c.moveTo(-2.2, -2.3); c.lineTo(1.6, -2.3); c.lineTo(4.6, -0.6); c.lineTo(4.6, 0.9); c.lineTo(-2.2, 0.9); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.7; c.lineJoin = 'miter'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-1.6, 0.1, 5.6, 0.7);
    c.restore();
  }
  function bootFront(c, x, y, near, col) {
    c.fillStyle = col; poly(c, x, y - 0.5, 2.6, near ? 2.8 : 2.1); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.7; c.stroke();
  }
  function hand(c, x, y, skin, keeper) {
    c.fillStyle = keeper ? '#f4f4f4' : skin; poly(c, x, y, keeper ? 2.5 : 1.7, keeper ? 2.5 : 1.7); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.6; c.stroke();
  }
  function shorts(c, kit, x, y, w, h) {
    c.fillStyle = kit.shorts; rr(c, x, y, w, h, 2); c.fill();
    hatch(c, x, y, w, h, ISO.lum(kit.shorts) > 0.5 ? 'rgba(31,36,51,.35)' : 'rgba(255,255,255,.4)', 2.2, 0.7);
    c.strokeStyle = INK; c.lineWidth = 0.9; c.lineJoin = 'miter'; rr(c, x, y, w, h, 2); c.stroke();
  }

  function drawChar(c, L, kit, dir, P0, keeper) {
    const P = P0 || REST, g = (k) => (P[k] === undefined ? REST[k] : P[k]);
    const w = L.w || 1, h = L.h || 1, skin = L.skin, skinD = shade(skin, -34);
    const sock = kit.socks, sockD = shade(sock.length === 7 ? sock : '#888888', -38), boot = L.boot || CORAL;
    const sleeve = kit.pat === 'sleeves' ? kit.b : kit.a, sleeveD = shade(sleeve.length === 7 ? sleeve : '#888888', -34);
    const lw = 4.5 * Math.sqrt(w), up = g('armsUp'), ab = g('ab'), lean = g('lean'), tilt = g('tilt'), spr = g('spread');
    const L1 = legFK(g('t1'), g('k1')), L2 = legFK(g('t2'), g('k2'));
    const A1 = armFK(g('s1'), g('e1'), up), A2 = armFK(g('s2'), g('e2'), up);
    const hip = Math.max(L1.fd, L2.fd) + g('air') - 0.6, bob = g('bob');
    c.save();
    c.scale(h, h);
    if (g('rot')) { c.translate(0, -12); c.rotate(g('rot')); c.translate(0, 12); }
    if (dir === 'side') {
      const tw = 8.9 * w, hy = -hip;
      const leg = (F, far) => {
        limb2(c, 0, hy, F.kf, hy + F.kd, F.ff, hy + F.fd, lw, 3.8, far ? skinD : skin, far ? sockD : sock);
        bootSide(c, F.ff, hy + F.fd, F.fa, far ? shade(boot.length === 7 ? boot : '#888888', -30) : boot);
      };
      const arm = (A, far) => {
        const k = Math.max(0.45, Math.cos(ab)), sx = 0.4, sy = -10.3 + bob;
        limb2(c, sx, sy, sx + A.ef * k, sy + A.ed, sx + A.hf * k, sy + A.hd, 3.5, 3, far ? sleeveD : sleeve, far ? skinD : skin);
        hand(c, sx + A.hf * k, sy + A.hd, far ? skinD : skin, keeper);
      };
      leg(L2, true); leg(L1, false);
      c.translate(0, hy); c.rotate(lean);              // the upper body pivots at the hips
      arm(A2, true);
      shorts(c, kit, -tw / 2 - 0.3, -4.6, tw + 0.6, 7.2);
      shirt(c, kit, -tw / 2, -15.2 + bob, tw, 11.6, 3);
      arm(A1, false);
      head(c, L, 'side', 1.2, -21.6 + bob);
    } else {
      const s = dir === 'up' ? -1 : 1, tw = 12.5 * w, hy = -hip;
      const leg = (F, sg) => {
        const sw = sg < 0 ? g('sw1') : g('sw2');
        const hx = sg * (3.3 * w + spr * 0.35), fx = sg * (3.3 * w + spr) + sw, kx = (hx + fx) / 2 + sg * Math.max(0, F.kf - F.ff) * 0.12;
        const ky = hy + F.kd + s * F.kf * DZ, fy = hy + F.fd + s * F.ff * DZ;
        limb2(c, hx, hy, kx, ky, fx, fy, lw, 3.9, skin, sock);
        bootFront(c, fx, fy, s * F.ff >= 0, boot);
      };
      // the leg further from the viewer goes down first
      if (s * L1.ff <= s * L2.ff) { leg(L1, -1); leg(L2, 1); } else { leg(L2, 1); leg(L1, -1); }
      c.translate(0, hy); c.rotate(tilt); c.translate(0, s * lean * 4.5);
      const th = 11.7 * (1 - Math.min(0.25, Math.abs(lean) * 0.3));
      shorts(c, kit, -tw / 2, -5.1, tw, 7.4);
      shirt(c, kit, -tw / 2, -4.9 - th + bob, tw, th, 3.2);
      if (dir === 'up' && L.num != null) {
        c.fillStyle = ISO.lum(kit.a) > 0.55 ? '#16161a' : '#ffffff';
        c.font = '700 6.6px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(L.num), 0, -4.9 - th / 2 + bob + 0.4);
      }
      const arm = (A, sg) => {
        const sx = sg * (tw / 2 + 0.7), sy = -4.9 - th + 2.1 + bob, out = Math.sin(ab) + up * 0.35, k = Math.max(0.3, Math.cos(ab));
        const ex = sx + sg * (0.9 + out * UARM), ey = sy + A.ed * k + s * A.ef * DZ;
        const hx = sx + sg * (1.3 + out * (UARM + FARM)), hy2 = sy + A.hd * k + s * A.hf * DZ;
        limb2(c, sx, sy, ex, ey, hx, hy2, 3.6, 3, sleeve, skin);
        hand(c, hx, hy2, skin, keeper);
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

  const portraits = new Map();
  function portrait(def, size, kitOverride) {
    const kit = kitOverride || def.kit, key = def.id + size + kit.a + kit.b + kit.pat + (def.look.boot || '');
    let cv = portraits.get(key);
    if (cv) return cv;
    cv = canvas(size * 2, size * 2);
    const c = cv.getContext('2d'), D = size * 2, k = D / 30;
    c.setTransform(k, 0, 0, k, D / 2, D * 1.62);
    drawChar(c, Object.assign({}, def.look, { h: 1, num: def.num }), kit, 'down', { s1: 0.08, s2: -0.08, e1: 0.25, e2: 0.25 }, false);
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
