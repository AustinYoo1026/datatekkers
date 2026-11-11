/* ISO FOOTBALL 3D — procedural footballer / goalkeeper.
   A rigid-segment character (no skinning): every bone is an Object3D, every body segment a low-poly mesh parented to its
   bone. 16 meshes per character (the whole head - skull, face, hair, brows, beard, headband - is one vertex-coloured
   mesh), all geometries / materials / textures shared through a cache keyed by size and colour.

   ISO.R3D.Player.create(THREE, spec) -> actor
     spec  = { def, kit, keeper, slot }   def: roster entry (ISO.PLAYERS / ISO.outfit(...) / ISO.KEEPERS[i]); kit: resolved kit
     actor = { group, bones, rig, spec, keeper, foot, THREE, setSpec(spec), setMarker(color|null), dispose() }
       group   world placement (position x/z, rotation.y = model yaw); the animator writes it
       bones   { root, pelvis, spine, chest, neck, head, upperArmL, foreArmL, handL, upperArmR, foreArmR, handR,
                 thighL, shinL, footL, thighR, shinR, footR }  (root = body pivot on the ground point, child of group)
       rig     segment lengths in metres after look.h / look.w scaling (read by anim3d.js for IK and ground contact)
       foot    +1 right-footed, -1 left-footed
   Conventions: model forward = local +z, character's left = local +x, Y up. Limbs hang along -y from their joint.
   Never touches THREE at parse time. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});
  const PI = Math.PI;

  // base proportions of a 1.80 m player (spec 5.1)
  const B = {
    pelvis: 0.96, hipX: 0.10, hipY: -0.02, thigh: 0.44, shin: 0.42, ankle: 0.08, footL: 0.26, footH: 0.08,
    spine: 0.08, abd: 0.14, chest: 0.30, neck: 0.08, headR: 0.125, shX: 0.215, shY: 0.26, uarm: 0.29, farm: 0.26,
  };
  const FACE = { long: [0.92, 1.12, 1.0], narrow: [0.88, 1.04, 0.97], oval: [0.95, 1.05, 1.0], round: [1.05, 0.98, 1.03], square: [1.0, 1.0, 1.0], wide: [1.1, 0.96, 1.03] };
  const DEF_SKIN = '#e8bd95', DEF_HAIR = '#2a1e16', DEF_BOOT = '#17171b', GLOVE = '#f2f4f6';

  // ------------------------------------------------------------------ caches (one THREE per page)
  let T3 = null;
  const GEO = new Map(), MAT = new Map(), TEX = new Map();
  function cached(map, key, make) { let v = map.get(key); if (!v) { v = make(); map.set(key, v); } return v; }

  function canvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function canvasTex(cv) {
    const t = new T3.CanvasTexture(cv);
    if (T3.SRGBColorSpace) t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const lum = (hex) => (ISO.lum && typeof hex === 'string' && hex.length === 7 ? ISO.lum(hex) : 0.5);
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  const hexOk = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);

  // plain colour material, or a textured one
  function matCol(hex) { return cached(MAT, 'c' + hex, () => new T3.MeshStandardMaterial({ color: hex, roughness: 0.8, metalness: 0 })); }
  function matTex(key, paint, w, h) {
    return cached(MAT, 't' + key, () => {
      const tex = cached(TEX, key, () => { const cv = canvas(w, h); const c = cv.getContext('2d'); if (c) paint(c, w, h); return canvasTex(cv); });
      return new T3.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
    });
  }
  function matVC() { return cached(MAT, 'vc', () => new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 })); }

  // a limb texture: colour bands along v (0 = bottom of the segment, 1 = top)
  function bands(list) {
    const key = 'b' + list.join(',');
    return matTex(key, (c, w, h) => {
      for (let i = 0; i < list.length; i += 3) { c.fillStyle = list[i + 2]; const y0 = Math.round((1 - list[i + 1]) * h), y1 = Math.round((1 - list[i]) * h); c.fillRect(0, y0, w, Math.max(1, y1 - y0)); }
    }, 4, 64);
  }

  // ------------------------------------------------------------------ kit texture (torso) — all 10 patterns, number + name on the back
  // u 0..0.5 = front (centre at 0.25), 0.5..1 = back (centre at 0.75); v 1 = shoulders, the bottom 30% is the abdomen.
  function kitFill(c, kit, x, y, w, h, u) {
    c.fillStyle = kit.a; c.fillRect(x, y, w, h);
    c.fillStyle = kit.b;
    const pat = kit.pat, mx = x + w / 2;
    if (pat === 'vstripes') { for (let sx = mx - u / 2; sx < x + w; sx += u * 2) c.fillRect(sx, y, u, h); for (let sx = mx - u * 2.5; sx > x - u; sx -= u * 2) c.fillRect(sx, y, u, h); }
    else if (pat === 'hoops') { for (let i = 0, sy = y; sy < y + h; sy += u, i++) if (i % 2) c.fillRect(x, sy, w, u); }
    else if (pat === 'cstripe') c.fillRect(mx - w * 0.15, y, w * 0.3, h);
    else if (pat === 'pin') { for (let sx = mx - u * 6; sx < x + w; sx += u) c.fillRect(sx, y, Math.max(1, u * 0.22), h); for (let sx = mx - u * 7; sx > x - u; sx -= u) c.fillRect(sx, y, Math.max(1, u * 0.22), h); }
    else if (pat === 'halves') c.fillRect(mx, y, w / 2, h);
    else if (pat === 'quarters') { c.fillRect(mx, y, w / 2, h / 2); c.fillRect(x, y + h / 2, w / 2, h / 2); }
    else if (pat === 'sash') { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.3, y); c.lineTo(x + w, y + h * 0.75); c.lineTo(x + w, y + h); c.lineTo(x + w * 0.7, y + h); c.lineTo(x, y + h * 0.25); c.closePath(); c.fill(); }
    else if (pat === 'chevron') { c.beginPath(); c.moveTo(x, y + h * 0.15); c.lineTo(mx, y + h * 0.55); c.lineTo(x + w, y + h * 0.15); c.lineTo(x + w, y + h * 0.42); c.lineTo(mx, y + h * 0.82); c.lineTo(x, y + h * 0.42); c.closePath(); c.fill(); }
    // 'solid' and 'sleeves' are plain on the body ('sleeves' colours the sleeves in kit.b)
  }
  function inkFor(kit) {
    const la = lum(kit.a), lb = lum(kit.b);
    if (Math.abs(la - lb) > 0.38 && kit.pat !== 'vstripes' && kit.pat !== 'pin' && kit.pat !== 'hoops') return kit.b;
    return la > 0.55 ? '#17171b' : '#ffffff';
  }
  function kitMat(kit, num, name, keeper) {
    const key = 'k' + [kit.a, kit.b, kit.pat, num, name, keeper ? 1 : 0].join('|');
    return matTex(key, (c, W, H) => {
      const u = W / 18;
      kitFill(c, kit, 0, 0, W / 2, H, u);
      kitFill(c, kit, W / 2, 0, W / 2, H, u);
      // collar + side seams
      c.fillStyle = kit.pat === 'solid' || !kit.pat || kit.pat === 'sleeves' ? kit.b : kit.a;
      c.fillRect(0, 0, W, Math.round(H * 0.035));
      c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(W / 2 - 3, 0, 6, H); c.fillRect(0, 0, 3, H); c.fillRect(W - 3, 0, 3, H);
      const ink = inkFor(kit);
      const panel = (cx, cy, w, h) => { c.fillStyle = kit.a; c.globalAlpha = 0.85; c.fillRect(cx - w / 2, cy - h / 2, w, h); c.globalAlpha = 1; };
      c.textAlign = 'center'; c.textBaseline = 'middle';
      // back: name over a big number (a plain panel behind them on busy patterns so they always read)
      const busy = kit.pat && kit.pat !== 'solid' && kit.pat !== 'sleeves';
      const n = String(num == null ? (keeper ? 1 : '') : num);
      if (busy && n) panel(W * 0.75, H * 0.43, W * 0.24, H * 0.36);
      if (name) {
        c.fillStyle = ink; c.font = 'bold ' + Math.round(H * (name.length > 9 ? 0.055 : 0.07)) + 'px Arial, sans-serif';
        if (busy) panel(W * 0.75, H * 0.17, W * 0.34, H * 0.08);
        c.fillStyle = ink; c.fillText(name, W * 0.75, H * 0.17, W * 0.34);
      }
      if (n) { c.fillStyle = ink; c.font = 'bold ' + Math.round(H * 0.3) + 'px Arial, sans-serif'; c.fillText(n, W * 0.75, H * 0.45, W * 0.3); }
      // front: small number on the chest, a crest dot opposite
      if (n) { c.font = 'bold ' + Math.round(H * 0.09) + 'px Arial, sans-serif'; c.fillStyle = ink; c.fillText(n, W * 0.25, H * 0.42); }
      c.fillStyle = ink; c.beginPath(); if (c.arc) c.arc(W * 0.31, H * 0.2, H * 0.03, 0, PI * 2); c.fill();
      c.fillStyle = kit.b === kit.a ? '#ffffff' : kit.b; c.beginPath(); if (c.arc) c.arc(W * 0.19, H * 0.2, H * 0.028, 0, PI * 2); c.fill();
    }, 256, 256);
  }

  // ------------------------------------------------------------------ geometry helpers
  function lathe(key, pts, flatZ, v0, v1) {
    return cached(GEO, key, () => {
      const P = pts.map((p) => new T3.Vector2(p[0], p[1]));
      const g = new T3.LatheGeometry(P, 14, -PI / 2, PI * 2);
      g.scale(1, 1, flatZ);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
      g.computeVertexNormals();
      return g;
    });
  }
  function capsule(r, len, cy) { return cached(GEO, 'cap' + r + ',' + len + ',' + cy, () => { const g = new T3.CapsuleGeometry(r, len, 2, 7); g.translate(0, cy, 0); return g; }); }
  function box(w, h, d, x, y, z) { return cached(GEO, 'box' + [w, h, d, x, y, z].join(','), () => { const g = new T3.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }); }
  function cyl(rt, rb, h, y, seg) { return cached(GEO, 'cyl' + [rt, rb, h, y, seg].join(','), () => { const g = new T3.CylinderGeometry(rt, rb, h, seg || 10); g.translate(0, y, 0); return g; }); }
  function foot() {
    return cached(GEO, 'foot', () => {
      // a boot: a tapered box with a rounded toe
      const g = new T3.BoxGeometry(0.1, 0.08, 0.26, 1, 1, 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), y = p.getY(i);
        let x = p.getX(i);
        if (z > 0.05) x *= 0.85;
        if (z > 0.12) { x *= 0.8; if (y > 0) p.setY(i, y - 0.025); }
        if (z < -0.12 && y > 0) p.setY(i, y + 0.01);
        p.setX(i, x);
      }
      g.computeVertexNormals();
      g.translate(0, -0.04, 0.06);
      return g;
    });
  }

  // vertex-coloured merge (position + normal + color), used for the head
  const _col = { r: 0, g: 0, b: 0 };
  function part(list, geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new T3.Color(hex);
    list.push({ g, c });
    return g;
  }
  function merge(list) {
    let n = 0;
    for (const it of list) n += it.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const it of list) {
      const p = it.g.attributes.position, q = it.g.attributes.normal;
      for (let i = 0; i < p.count; i++, o++) {
        pos[o * 3] = p.getX(i); pos[o * 3 + 1] = p.getY(i); pos[o * 3 + 2] = p.getZ(i);
        nor[o * 3] = q.getX(i); nor[o * 3 + 1] = q.getY(i); nor[o * 3 + 2] = q.getZ(i);
        col[o * 3] = it.c.r; col[o * 3 + 1] = it.c.g; col[o * 3 + 2] = it.c.b;
      }
      it.g.dispose();
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    g.setAttribute('color', new T3.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

  // ------------------------------------------------------------------ the head: skull, face, hair (14+ styles), brows, beard, band
  const SPH = (r, ws, hs, ps, pl, ts, tl) => new T3.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
  function headGeo(look) {
    const L = look || {};
    const skin = hexOk(L.skin, DEF_SKIN), hair = hexOk(L.hairColor, DEF_HAIR), hair2 = hexOk(L.hair2, hair);
    const style = L.hair || 'short', beard = L.beard || null, beardCol = hexOk(L.beardColor, hair), brow = L.brow || '';
    const fp = FACE[L.face] || FACE.oval, vol = L.vol || 1, band = hexOk(L.band, null);
    const key = ['h', skin, hair, hair2, style, beard, beardCol, brow, L.face || '', vol, band || ''].join('|');
    return cached(GEO, key, () => {
      const R = B.headR, cy = 0.12, fx = fp[0], fy = fp[1], fz = fp[2], parts = [];
      const at = (g, x, y, z) => { g.translate(x, cy + y, z); return g; };
      const shell = (k, ts, tl, tilt, col, sx, ps, pl) => { const g = part(parts, SPH(R * k, 12, 5, ps || 0, pl || PI * 2, ts || 0, tl), col); g.scale(fx * (sx || 1), fy, fz); if (tilt) g.rotateX(-tilt); at(g, 0, 0, 0); return g; };
      const blob = (r, x, y, z, sx, sy, sz, col) => { const g = part(parts, SPH(r, r > 0.05 ? 7 : 5, r > 0.05 ? 5 : 4), col); g.scale(sx || 1, sy || 1, sz || 1); at(g, x * fx, y, z * fz); return g; };
      const cube = (w, h, d, x, y, z, col, rx) => { const g = part(parts, new T3.BoxGeometry(w, h, d), col); if (rx) g.rotateX(rx); at(g, x, y, z); return g; };
      const dark = mix(skin, '#000000', 0.18), lip = mix(skin, '#6a2a2a', 0.35);
      // skull + jaw, nose, ears, eyes, mouth
      { const g = part(parts, SPH(R, 14, 10), skin); g.scale(fx, fy, fz); at(g, 0, 0, 0); }
      if (L.face === 'square' || L.face === 'wide') cube(0.17 * fx, 0.07, 0.15 * fz, 0, -0.075, 0.015, skin);
      else blob(0.085, 0, -0.07, 0.025, 1.05 * fx, 0.7, 1.05, skin);
      cube(0.032, 0.05, 0.045, 0, -0.012, R * fz * 0.97, dark, -0.25);
      blob(0.028, 0.122, -0.005, -0.005, 0.45, 1, 0.8, dark); blob(0.028, -0.122, -0.005, -0.005, 0.45, 1, 0.8, dark);
      blob(0.014, 0.043, 0.022, R * 0.9, 1, 0.75, 0.6, '#16161c'); blob(0.014, -0.043, 0.022, R * 0.9, 1, 0.75, 0.6, '#16161c');
      cube(0.05, 0.009, 0.012, 0, -0.06, R * fz * 0.92, lip);
      // brows
      const bh = brow === 'heavy' ? 0.017 : brow === 'light' ? 0.007 : 0.011, bcol = brow === 'light' ? mix(hair, skin, 0.35) : hair;
      cube(0.046, bh, 0.016, 0.045 * fx, 0.048, R * fz * 0.93, bcol, 0.1); cube(0.046, bh, 0.016, -0.045 * fx, 0.048, R * fz * 0.93, bcol, 0.1);
      // hair
      const capH = 0.5 * PI;
      switch (style) {
        case 'bald': break;
        case 'shaved': shell(1.015, 0, 0.42 * PI, 0.3, mix(hair, skin, 0.45)); break;
        case 'buzz': shell(1.03, 0, 0.45 * PI, 0.3, mix(hair, skin, 0.2)); break;
        case 'fade': shell(1.035, 0, 0.47 * PI, 0.32, mix(hair, skin, 0.25)); shell(1.075, 0, 0.3 * PI, 0.2, hair); break;
        case 'side': shell(1.07, 0, 0.52 * PI, 0.32, hair); blob(0.06, 0.05, 0.115, 0.01, 1.4, 0.55, 1.9, hair); break;
        case 'slick': shell(1.06, 0, capH, 0.42, hair, 1.01); break;
        case 'quiff': shell(1.06, 0, 0.47 * PI, 0.3, hair); blob(0.07, 0, 0.125, 0.06, 1.35, 0.85, 1.15, hair2 === hair ? hair : hair2); break;
        case 'curly': {
          shell(1.1, 0, 0.55 * PI, 0.3, hair2);
          for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; blob(0.045, Math.cos(a) * 0.075, 0.1 + (i % 2) * 0.02, Math.sin(a) * 0.075 - 0.01, 1, 0.8, 1, hair); }
          blob(0.05, 0, 0.135, 0, 1.2, 0.7, 1.2, hair); break;
        }
        case 'afro': { const k = 1.25 + 0.3 * Math.min(1.2, vol); blob(R * k, 0, 0.045, -0.02 / fz, fx, 0.95, fz, hair2 === hair ? hair : hair2); blob(R * k * 0.9, 0, 0.07, 0.0, fx * 1.02, 0.9, fz * 1.02, hair); break; }
        case 'mop': shell(1.12, 0, 0.66 * PI, 0.12, hair); break;
        case 'long': {
          shell(1.08, 0, 0.55 * PI, 0.28, hair);
          cube(0.25 * fx, 0.26, 0.07, 0, -0.07, -0.1 * fz, hair2, 0.12);
          cube(0.05, 0.2, 0.09, 0.115 * fx, -0.05, -0.04, hair); cube(0.05, 0.2, 0.09, -0.115 * fx, -0.05, -0.04, hair);
          break;
        }
        case 'braids': {
          shell(1.05, 0, 0.5 * PI, 0.3, hair);
          for (let i = 0; i < 7; i++) { const a = -0.9 + (i / 6) * 1.8; const g = part(parts, new T3.CylinderGeometry(0.012, 0.012, 0.22, 4), hair2); g.translate(Math.sin(a) * 0.11 * fx, cy - 0.06, -Math.cos(a) * 0.1 * fz); }
          break;
        }
        case 'bun': shell(1.06, 0, capH, 0.4, hair); blob(0.055, 0, 0.1, -0.12, 1, 1, 1, hair); break;
        case 'mohawk': shell(1.02, 0, 0.42 * PI, 0.3, mix(hair2 === hair ? hair : hair2, skin, 0.3)); cube(0.04, 0.075, 0.25 * fz, 0, 0.13, -0.005, hair, 0.05); break;
        case 'tuft': shell(1.015, 0, 0.4 * PI, 0.3, mix(hair, skin, 0.4)); cube(0.05, 0.05, 0.06, 0, 0.13, 0.07, hair, -0.3); break;
        case 'balding': { const g = part(parts, new T3.CylinderGeometry(R * 1.04, R * 1.02, 0.075, 14, 1, true, PI * 0.3, PI * 1.4), hair); g.scale(fx, 1, fz); g.translate(0, cy + 0.01, -0.01); break; }
        case 'receding': shell(1.05, 0, 0.45 * PI, 0.62, hair); break;
        default: shell(1.07, 0, capH, 0.35, hair); break;      // short and anything unknown
      }
      if (band) { const g = part(parts, new T3.CylinderGeometry(R * 1.1, R * 1.1, 0.03, 16, 1, true), band); g.scale(fx, 1, fz); g.rotateX(-0.25); g.translate(0, cy + 0.065, 0); }
      // beard (front half shells of the lower face)
      if (beard) {
        const full = (k, ts, tl, col) => shell(k, ts, tl, 0, col, 1, 0, PI);
        if (beard === 'full') { full(1.045, 0.56 * PI, 0.36 * PI, beardCol); cube(0.07, 0.04, 0.05, 0, -0.105, R * fz * 0.7, beardCol); cube(0.07, 0.014, 0.02, 0, -0.043, R * fz * 0.96, beardCol); }
        else if (beard === 'stubble') full(1.012, 0.57 * PI, 0.36 * PI, mix(skin, beardCol, 0.5));
        else if (beard === 'goatee') { cube(0.05, 0.05, 0.035, 0, -0.095, R * fz * 0.82, beardCol); cube(0.07, 0.014, 0.02, 0, -0.043, R * fz * 0.96, beardCol); }
        else if (beard === 'moustache') cube(0.075, 0.016, 0.022, 0, -0.043, R * fz * 0.96, beardCol);
        else if (beard === 'chinstrap') full(1.04, 0.72 * PI, 0.13 * PI, beardCol);
        else full(1.04, 0.56 * PI, 0.36 * PI, beardCol);
      }
      return merge(parts);
    });
  }

  // ------------------------------------------------------------------ create
  const BONES = ['root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
    'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
  const PARENT = { pelvis: 'root', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', upperArmL: 'chest', foreArmL: 'upperArmL', handL: 'foreArmL',
    upperArmR: 'chest', foreArmR: 'upperArmR', handR: 'foreArmR', thighL: 'pelvis', shinL: 'thighL', footL: 'shinL', thighR: 'pelvis', shinR: 'thighR', footR: 'shinR' };
  const MESHES = ['pelvis', 'abdomen', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
  const MESH_BONE = { pelvis: 'pelvis', abdomen: 'spine', chest: 'chest', neck: 'neck', head: 'head', uarmL: 'upperArmL', farmL: 'foreArmL', handL: 'handL',
    uarmR: 'upperArmR', farmR: 'foreArmR', handR: 'handR', thighL: 'thighL', shinL: 'shinL', footL: 'footL', thighR: 'thighR', shinR: 'shinR', footR: 'footR' };

  function create(THREE, spec) {
    T3 = THREE;
    const group = new THREE.Group();
    group.name = 'player3d';
    const bones = {};
    for (const n of BONES) { const o = new THREE.Object3D(); o.name = n; bones[n] = o; }
    group.add(bones.root);
    bones.root.rotation.order = 'YXZ';
    for (const n of BONES) if (PARENT[n]) bones[PARENT[n]].add(bones[n]);
    const meshes = {};
    for (const n of MESHES) {
      const m = new THREE.Mesh(box(0.1, 0.1, 0.1, 0, 0, 0), matCol('#888888'));
      m.castShadow = true; m.receiveShadow = false; m.name = n;
      bones[MESH_BONE[n]].add(m); meshes[n] = m;
    }
    const actor = { group, bones, meshes, rig: {}, spec: null, keeper: false, foot: 1, THREE, marker: null, setSpec, setMarker, dispose };

    function setSpec(sp) {
      T3 = THREE;
      sp = sp || {};
      const def = sp.def || {}, L = def.look || {}, keeper = !!sp.keeper;
      const kit = sp.kit || def.kit || { a: '#cccccc', b: '#333333', pat: 'solid', shorts: '#333333', socks: '#cccccc' };
      const k = { a: hexOk(kit.a, '#cccccc'), b: hexOk(kit.b, '#333333'), pat: kit.pat || 'solid', shorts: hexOk(kit.shorts, hexOk(kit.b, '#333333')), socks: hexOk(kit.socks, hexOk(kit.a, '#cccccc')) };
      const h = Math.min(1.16, Math.max(0.85, L.h || 1)), w = Math.min(1.18, Math.max(0.85, L.w || 1));
      const skin = hexOk(L.skin, DEF_SKIN), boot = hexOk(L.boot, DEF_BOOT);
      actor.spec = sp; actor.keeper = keeper;
      actor.foot = def.foot === 'L' || def.foot === 'left' ? -1 : 1;
      // rig dimensions (metres)
      const R = actor.rig;
      R.h = h; R.w = w; R.pelvisY = B.pelvis * h; R.thigh = B.thigh * h; R.shin = B.shin * h; R.ankle = B.ankle * h; R.uarm = B.uarm * h; R.farm = B.farm * h;
      R.hipX = B.hipX * w; R.shX = B.shX * w; R.eye = (B.pelvis + B.spine + B.abd + B.chest + B.neck + 0.12) * h; R.footLen = B.footL * h;
      R.legLen = R.thigh + R.shin + R.ankle; R.armLen = R.uarm + R.farm;
      // bone offsets
      const b = bones;
      b.root.position.set(0, 0, 0);
      b.pelvis.position.set(0, R.pelvisY, 0);
      b.spine.position.set(0, B.spine * h, 0);
      b.chest.position.set(0, B.abd * h, 0);
      b.neck.position.set(0, B.chest * h, 0);
      b.head.position.set(0, B.neck * h, 0);
      b.upperArmL.position.set(R.shX, B.shY * h, 0); b.upperArmR.position.set(-R.shX, B.shY * h, 0);
      b.foreArmL.position.set(0, -R.uarm, 0); b.foreArmR.position.set(0, -R.uarm, 0);
      b.handL.position.set(0, -R.farm, 0); b.handR.position.set(0, -R.farm, 0);
      b.thighL.position.set(R.hipX, B.hipY * h, 0); b.thighR.position.set(-R.hipX, B.hipY * h, 0);
      b.shinL.position.set(0, -R.thigh, 0); b.shinR.position.set(0, -R.thigh, 0);
      b.footL.position.set(0, -R.shin, 0); b.footR.position.set(0, -R.shin, 0);
      // materials
      const sleeve = k.pat === 'sleeves' ? k.b : k.a;
      const M = meshes, kitM = kitMat(k, def.num, keeper ? '' : (def.short || ''), keeper);
      const set = (n, g, m, sx, sy, sz) => { M[n].geometry = g; M[n].material = m; M[n].scale.set(sx, sy, sz); };
      set('pelvis', lathe('pel', [[0.04, -0.17], [0.15, -0.15], [0.165, -0.08], [0.168, 0.0], [0.158, 0.07]], 0.72, 0, 1), matCol(k.shorts), w, h, w);
      set('abdomen', lathe('abd', [[0.152, -0.02], [0.158, 0.06], [0.164, 0.15]], 0.64, 0, 0.3), kitM, w, h, w);
      set('chest', lathe('chs', [[0.16, -0.01], [0.172, 0.1], [0.19, 0.2], [0.196, 0.25], [0.17, 0.29], [0.1, 0.315], [0.045, 0.32]], 0.62, 0.3, 1), kitM, w, h, w);
      set('neck', cyl(0.052, 0.058, 0.12, 0.04, 8), matCol(skin), w, h, w);
      set('head', headGeo(L), matVC(), h * 0.97, h * 0.97, h * 0.97);
      // limbs: two-tone textures along the segment
      const uarmM = keeper ? matCol(sleeve) : bands([0, 0.5, skin, 0.5, 1, sleeve, 0.5, 0.56, k.b]);
      const farmM = keeper ? bands([0, 0.18, k.b, 0.18, 1, sleeve]) : matCol(skin);
      const thighM = bands([0, 0.4, skin, 0.4, 1, k.shorts]);
      const shinM = bands([0, 0.74, k.socks, 0.74, 0.8, k.b, 0.8, 1, skin]);
      const handG = keeper ? box(0.078, 0.13, 0.06, 0, -0.055, 0.005) : box(0.06, 0.1, 0.035, 0, -0.045, 0.005);
      const handM = keeper ? matCol(GLOVE) : matCol(skin);
      for (const s of ['L', 'R']) {
        set('uarm' + s, capsule(0.05, 0.21, -0.135), uarmM, w, h, w);
        set('farm' + s, capsule(keeper ? 0.046 : 0.041, 0.18, -0.125), farmM, w, h, w);
        set('hand' + s, handG, handM, w, h, w);
        set('thigh' + s, capsule(0.077, 0.3, -0.21), thighM, w, h, w);
        set('shin' + s, capsule(0.056, 0.31, -0.2), shinM, w, h, w);
        set('foot' + s, foot(), matCol(boot), w, h, h);
      }
      if (actor.anim && actor.anim.reset) actor.anim.reset();
      return actor;
    }

    // small team-coloured chevron above the head (spec 5.1); null hides it
    function setMarker(color) {
      if (!color) { if (actor.marker) actor.marker.visible = false; return; }
      if (!actor.marker) {
        const g = cached(GEO, 'chev', () => { const c = new THREE.ConeGeometry(0.11, 0.16, 3); c.rotateX(PI); c.scale(1, 1, 0.45); return c; });
        actor.marker = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
        actor.marker.position.y = 2.2 * (actor.rig.h || 1);
        group.add(actor.marker);
      }
      actor.marker.material.color.set(color); actor.marker.visible = true;
    }

    function dispose() {
      if (group.parent) group.parent.remove(group);
      if (actor.marker) { actor.marker.material.dispose(); actor.marker = null; }
      // geometries / materials / textures are shared: Player.clearCache() frees them
    }

    setSpec(spec);
    return actor;
  }

  function clearCache() {
    for (const g of GEO.values()) g.dispose();
    for (const m of MAT.values()) m.dispose();
    for (const t of TEX.values()) t.dispose();
    GEO.clear(); MAT.clear(); TEX.clear();
  }

  R3D.Player = { create, clearCache, BONES, PROPORTIONS: B, stats: () => ({ geometries: GEO.size, materials: MAT.size, textures: TEX.size }) };
})();
