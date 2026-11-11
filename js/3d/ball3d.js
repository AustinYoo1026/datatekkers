/* ISO FOOTBALL 3D — the ball (spec section 6). Visual layer only: nothing here is ever written back to the sim.

   ISO.R3D.Ball.create(THREE, skinDef, opts) -> {
     mesh,            THREE.Group: world position + bounce squash (world-Y scale). Child `sphere` (radius 0.20 m) carries the
                      rolling orientation; optional additive glow sprite. Add `mesh` to the scene.
     sphere,          the textured sphere mesh (castShadow = true)
     shadow,          contact-shadow blob (flat quad on the ground). The caller adds it to the scene.
     update(vf, dt),  vf = ViewFrame (spec section 3), dt = real seconds (0 while paused)
     onEvent(e, vf),  plain events, see EVENTS below
     reset(),         new match / replay seek: forget all history (orientation is kept)
     setSkin(skin),   ISO.BALLS entry or its id
     setArena(o),     {walls: bool (futsal), boards: [...] (override, see makeArena)} -> dead-ball colliders
     getTrailPoints(),-> TRAIL (preallocated): { points: Vector3[CAP] newest first, count, speed (real m/s), cap }
     dispose()
   }

   UNITS (what update() reads from vf):
     vf.ball.x/y/z   world metres (coords.js toWorld): x across, y = height of the ball's BOTTOM (sim z * S, 0 on the grass),
                     z = distance out from the goal line. The drawn centre is y + 0.20.
     vf.ball.vx/vy/vz  world axes, metres per SIM second (sim px/s * S, i.e. vx = b.vy*S, vy = b.vz*S, vz = -b.vx*S).
                     Only used to seed the dead-ball integrator, kick spin and the net push. Real time = sim time / opts.timeScale.
     vf.ball.spin (sim value), owner (player index or -1), held (bool), inNet (bool). shot/rot are not read.
     vf.players[owner]: x, z, yaw (model yaw, forward = (sin yaw, 0, cos yaw)), speed, top (same unit, only the ratio is used),
                     runPh, state, fakeU, shield, hidden.
     vf.keeper: x, z, yaw (held pose).   vf.phase: dead-ball mode ends when it changes.

   EVENTS (onEvent reads only these fields; every event is applied on the next update() using that frame's vf):
     'kick'      e.shot ('normal'|'finesse'|'power'|'chip'|'first-time'|undefined = pass/throw) -> kick spin (chip = backspin)
     'bounce'    (no fields) -> squash (ignored in dead-ball mode, which makes its own)
     'out'       (no fields) -> start the local dead-ball integrator seeded from vf.ball
     'goal'      (no fields) -> push the drawn ball up to 0.35 m into the net bulge, then relax
     'post'|'bar' e.power (0..1, optional) -> kill 70% of the spin, small squash
     'save'      (no fields) -> kill 65% of the spin
     'teleport'  (no fields) -> snap everything (also auto-detected: sim ball moves > 2.4 m in one frame)

   No allocation in update/onEvent/getTrailPoints. THREE is never touched at parse time. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const R3D = (ISO.R3D = ISO.R3D || {});

  const TW = 512, TH = 256;            // equirect skin texture
  const R = 0.2;                       // visual radius (m)
  const TELE2 = 2.4 * 2.4;             // teleport threshold (same as Smooth.TELEPORT = 48 px)
  const TRAIL_CAP = 16, TRAIL_DT = 1 / 60;
  const SKIN_MAT = { goldenboot: { metal: 0.5, rough: 0.32 }, midnight: { metal: 0.1, rough: 0.35 } };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (t) => t * t * (3 - 2 * t);
  const rgb = (h) => {
    h = String(h || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const skinOf = (s) => (typeof s === 'string' || !s ? (ISO.ballById ? ISO.ballById(s || 'classic') : { id: 'classic', base: ['#ffffff', '#e6e9ee'], panel: '#1f2433', ink: '#1f2433', slab: '#f1735f' }) : s);

  // ------------------------------------------------------------------ texture painting (plain data, cached per skin id)
  // Painted in direction space so the pattern is undistorted on the sphere and seamless: pixel (i, j) maps to the same
  // direction THREE.SphereGeometry gives that uv (x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)).
  const paintCache = {};
  let ballDirs = null;                 // 12 pentagon + 20 hexagon centres (truncated icosahedron), slightly rotated
  function dirs() {
    if (ballDirs) return ballDirs;
    const f = (1 + Math.sqrt(5)) / 2, g = 1 / f, P = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { P.push([0, a, b * f], [a, b * f, 0], [b * f, 0, a]); }
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      for (const c of [-1, 1]) P.push([a, b, c]);
      P.push([0, a * g, b * f], [a * g, b * f, 0], [b * f, 0, a * g]);
    }
    const ca = Math.cos(0.37), sa = Math.sin(0.37), cb = Math.cos(0.21), sb = Math.sin(0.21);
    ballDirs = new Float64Array(P.length * 3);
    P.forEach((p, i) => {
      const l = Math.hypot(p[0], p[1], p[2]);
      let x = p[0] / l, y = p[1] / l, z = p[2] / l;
      let t = x * ca - z * sa; z = x * sa + z * ca; x = t;        // rotate about Y then X: no vertex on a pole
      t = y * cb - z * sb; z = y * sb + z * cb; y = t;
      ballDirs[i * 3] = x; ballDirs[i * 3 + 1] = y; ballDirs[i * 3 + 2] = z;
    });
    return ballDirs;
  }
  function paintSkin(def) {
    def = skinOf(def);
    if (paintCache[def.id]) return paintCache[def.id];
    const out = new Uint8ClampedArray(TW * TH * 4), D = dirs(), ND = D.length / 3;
    const b0 = rgb(def.base && def.base[0]), b1 = rgb(def.base && (def.base[1] || def.base[0]));
    const slab = def.slab ? rgb(def.slab) : null, pan = rgb(def.panel || def.ink), ink = rgb(def.ink || def.panel);
    const bias = def.many ? 0 : 0.055, seamW = def.many ? 0.012 : 0.008, seamA = def.many ? 0.95 : 0.6;
    let stars = null;
    if (def.stars) {
      stars = new Float64Array(140 * 3); let s = 12345;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 140; i++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        stars[i * 3] = r * Math.cos(a); stars[i * 3 + 1] = u; stars[i * 3 + 2] = r * Math.sin(a);
      }
    }
    const n1 = [0.42, 0.82, 0.39], l1 = Math.hypot(n1[0], n1[1], n1[2]);
    const col = [0, 0, 0];
    const mix = (c, k) => { col[0] += (c[0] - col[0]) * k; col[1] += (c[1] - col[1]) * k; col[2] += (c[2] - col[2]) * k; };
    for (let j = 0; j < TH; j++) {
      const th = ((j + 0.5) / TH) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i < TW; i++) {
        const ph = ((i + 0.5) / TW) * Math.PI * 2;
        const dx = -Math.cos(ph) * st, dy = ct, dz = Math.sin(ph) * st;
        // base: two-tone gradient across the sphere
        const t = clamp(0.5 + 0.5 * (dx * 0.35 + dy * 0.8 + dz * 0.45), 0, 1);
        col[0] = b1[0]; col[1] = b1[1]; col[2] = b1[2]; mix(b0, t);
        // slab: a wavy band around a tilted great circle
        if (slab) {
          const s = (dx * n1[0] + dy * n1[1] + dz * n1[2]) / l1 + 0.11 * Math.sin(5 * (dx * 0.8 - dz * 0.6));
          const a = clamp((0.17 - Math.abs(s)) / 0.025, 0, 1);
          if (a > 0) mix(slab, a);
        }
        // panels: Voronoi of the 32 centres, pentagons shrunk by `bias` unless `many` (Telstar)
        let t1 = -9, t2 = -9, pent = false;
        for (let k = 0; k < ND; k++) {
          const v = dx * D[k * 3] + dy * D[k * 3 + 1] + dz * D[k * 3 + 2] - (k < 12 ? bias : 0);
          if (v > t1) { t2 = t1; t1 = v; pent = k < 12; } else if (v > t2) t2 = v;
        }
        if (pent) mix(pan, 1);
        if (t1 - t2 < seamW) mix(ink, seamA);
        if (stars) {
          for (let k = 0; k < 140; k++) {
            if (dx * stars[k * 3] + dy * stars[k * 3 + 1] + dz * stars[k * 3 + 2] > 0.9993) { col[0] = col[1] = col[2] = 255; break; }
          }
        }
        const o = (j * TW + i) * 4;
        out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
      }
    }
    return (paintCache[def.id] = out);
  }
  // radial alpha blob (contact shadow / glow), rgb fixed
  function paintBlob(n, r, g, b, pow) {
    const out = new Uint8ClampedArray(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1, d = Math.sqrt(x * x + y * y);
      const a = d >= 1 ? 0 : Math.pow(1 - d, pow), o = (j * n + i) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a * 255;
    }
    return out;
  }
  function makeTex(THREE, data, w, h, srgb) {
    let tex = null;
    const doc = globalThis.document;
    if (doc && doc.createElement) {
      const cv = doc.createElement('canvas');
      cv.width = w; cv.height = h;
      const c = cv.getContext && cv.getContext('2d');
      if (c && c.createImageData) {
        const img = c.createImageData(w, h);
        img.data.set(data); c.putImageData(img, 0, 0);
        tex = new THREE.CanvasTexture(cv);
      }
    }
    if (!tex) { tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.flipY = true; }
    if (srgb && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // ------------------------------------------------------------------ dead-ball colliders
  // A wall: ax 0 = plane x = pos, ax 2 = plane z = pos; spans lo..hi on the other axis, optional gap gLo..gHi; height h (m); restitution e.
  function makeArena(K, o) {
    o = o || {};
    if (o.boards) return o.boards.map((w) => Object.assign({ gLo: 0, gHi: 0, e: 0.4, h: 0.9 }, w));
    const H = K.half, Dp = K.depth, gx = K.goalW / 2, far = Dp + 25;
    const W = (ax, pos, lo, hi, h, e, gLo, gHi) => ({ ax, pos, lo, hi, h, e, gLo: gLo || 0, gHi: gHi || 0 });
    if (o.walls) return [          // futsal: 1.2 m boards on the playable boundary (goal mouth open) + hall walls
      W(0, -H, -1, Dp + 1, 1.2, 0.82), W(0, H, -1, Dp + 1, 1.2, 0.82),
      W(2, 0, -H, H, 1.2, 0.82, -gx - R, gx + R), W(2, Dp, -H, H, 1.2, 0.82),
      W(0, -H - 4, -6, Dp + 6, 12, 0.4), W(0, H + 4, -6, Dp + 6, 12, 0.4), W(2, -5, -H - 4, H + 4, 12, 0.4), W(2, Dp + 5, -H - 4, H + 4, 12, 0.4),
    ];
    return [                       // ad boards 3 m behind the goal line and outside both touchlines (0.4), stand front walls (0.3)
      W(2, -3, -H - 3, H + 3, 0.9, 0.4), W(0, -H - 3, -3, far, 0.9, 0.4), W(0, H + 3, -3, far, 0.9, 0.4),
      W(2, -7, -H - 7, H + 7, 6, 0.3), W(0, -H - 7, -7, far, 6, 0.3), W(0, H + 7, -7, far, 6, 0.3),
    ];
  }

  // ------------------------------------------------------------------ instance
  function create(THREE, skinDef, opts) {
    opts = opts || {};
    const K = (ISO.R3D && ISO.R3D.K) || { S: 0.05, half: 18, depth: 17, goalW: 7.5, goalH: 3, goalD: 1.7 };
    const S = K.S, C = ISO.C || {};
    const TS = opts.timeScale != null ? opts.timeScale : C.SPEED || 1;     // sim seconds per real second
    const GRAV = (C.GRAV || 900) * S, VBOUNCE = 90 * S, K0 = 28 * S, AIRH = 1 * S;
    const NET_E = 0.15, GX = K.goalW / 2, GD = K.goalD, GH = K.goalH;
    const onNetHit = typeof opts.onNetHit === 'function' ? opts.onNetHit : null;   // (wx, wy, wz, speed) e.g. Stadium.netHit
    let arena = makeArena(K, opts);

    // meshes
    const mesh = new THREE.Group(); mesh.name = 'ball';
    const geo = new THREE.SphereGeometry(R, 32, 16);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.castShadow = opts.castShadow !== false; sphere.receiveShadow = false;
    mesh.add(sphere);
    const glowTex = makeTex(THREE, paintBlob(64, 255, 255, 255, 2), 64, 64, false);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMat); glow.scale.set(0.95, 0.95, 1); glow.visible = false;
    mesh.add(glow);
    const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
    const shTex = makeTex(THREE, paintBlob(64, 0, 0, 0, 1.6), 64, 64, false);
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shadow = new THREE.Mesh(shGeo, shMat); shadow.name = 'ballShadow'; shadow.renderOrder = 1;
    shadow.position.y = 0.012;

    const texCache = {};
    let skin = null;
    function setSkin(s) {
      const def = skinOf(s);
      if (skin && skin.id === def.id) return;
      skin = def;
      const tex = texCache[def.id] || (texCache[def.id] = makeTex(THREE, paintSkin(def), TW, TH, true));
      if (opts.anisotropy) tex.anisotropy = opts.anisotropy;
      const m = SKIN_MAT[def.id];
      mat.map = tex; mat.roughness = m ? m.rough : 0.45; mat.metalness = m ? m.metal : 0;
      if (def.glow) { mat.emissive.set(def.glow); mat.emissiveMap = tex; mat.emissiveIntensity = 0.55; glowMat.color.set(def.glow); glow.visible = true; }
      else { mat.emissive.setRGB(0, 0, 0); mat.emissiveMap = null; mat.emissiveIntensity = 1; glow.visible = false; }
      mat.needsUpdate = true;
    }
    setSkin(skinDef);

    // scratch / state (all preallocated)
    const simP = new THREE.Vector3(), prevSim = new THREE.Vector3(), base = new THREE.Vector3();
    const drawn = new THREE.Vector3(), prevDrawn = new THREE.Vector3(), vel = new THREE.Vector3();
    const tgt = new THREE.Vector3(), rawT = new THREE.Vector3(), holdP = new THREE.Vector3();
    const dp = new THREE.Vector3(), dv = new THREE.Vector3(), relP = new THREE.Vector3();
    const wB = new THREE.Vector3(), om = new THREE.Vector3(), netDir = new THREE.Vector3();
    const dq = new THREE.Quaternion();
    let hasPrev = false, hasDrawn = false, frames = 0;
    let w = 0, tgtValid = false, heldW = 0, kickHold = 0;
    let dead = false, deadT = 0, deadPhase = null, dspin = 0, netInside = false, relW = 0;
    let sqT = 1, sqD = 0, netOn = false, netT = 0, netAmt = 0;
    let pendKick = false, pendKickType = null, pendOut = false, pendGoal = false, pendSnap = false;

    const ring = []; for (let i = 0; i < TRAIL_CAP; i++) ring.push(new THREE.Vector3());
    const TRAIL = { points: ring.slice(), count: 0, speed: 0, cap: TRAIL_CAP };
    let tHead = 0, tCount = 0, tAcc = 0;

    function snap(vf) {
      dead = false; relW = 0; w = 0; tgtValid = false; kickHold = 0;
      heldW = vf && vf.ball && vf.ball.held ? 1 : 0;
      netOn = false; sqT = 1; tCount = 0; tAcc = 0; hasDrawn = false; wB.set(0, 0, 0);
    }
    function reset() {
      snap(null); hasPrev = false;
      pendKick = pendOut = pendGoal = pendSnap = false; pendKickType = null;
    }

    function seedDead(vf) {
      const b = vf.ball;
      dead = true; deadT = 0; deadPhase = vf.phase; relW = 0;
      dp.copy(simP); dv.set(b.vx || 0, b.vy || 0, b.vz || 0); dspin = b.spin || 0;
      netInside = dp.x > -GX && dp.x < GX && dp.z < 0 && dp.z > -GD && dp.y - R < GH;
    }
    function endDead() { dead = false; relP.copy(dp); relW = 1; }

    function netHit(sp) { if (onNetHit && sp > 1) onNetHit(dp.x, dp.y, dp.z, sp); }

    function collide(px, ph, pz) {
      let hb = dp.y - R;
      // goal net box, from the outside (and clamped inside if the ball is in it)
      const inside = dp.x > -GX - R && dp.x < GX + R && dp.z > -GD - R && dp.z < 0 && hb < GH;
      if (inside && !netInside) {
        const sp = dv.length();
        if (ph >= GH) { hb = GH; dv.y = Math.abs(dv.y) * NET_E; dv.x *= 0.6; dv.z *= 0.6; netHit(sp); }
        else if (px <= -GX - R) { dp.x = -GX - R; dv.x = -Math.abs(dv.x) * NET_E; dv.z *= 0.7; netHit(sp); }
        else if (px >= GX + R) { dp.x = GX + R; dv.x = Math.abs(dv.x) * NET_E; dv.z *= 0.7; netHit(sp); }
        else if (pz <= -GD - R) { dp.z = -GD - R; dv.z = -Math.abs(dv.z) * NET_E; dv.x *= 0.7; netHit(sp); }
        else netInside = true;                 // came in through the mouth (or started there)
      }
      if (netInside) {
        if (dp.z > R) netInside = false;
        else {
          if (dp.x < -GX + R) { dp.x = -GX + R; dv.x = Math.abs(dv.x) * NET_E; }
          if (dp.x > GX - R) { dp.x = GX - R; dv.x = -Math.abs(dv.x) * NET_E; }
          if (dp.z < -GD + R) { dp.z = -GD + R; dv.z = Math.abs(dv.z) * NET_E; }
          if (hb > GH - 2 * R) { hb = GH - 2 * R; dv.y = -Math.abs(dv.y) * NET_E; }
        }
      }
      // boards and stand walls (thin, two-sided, finite height)
      for (let i = 0; i < arena.length; i++) {
        const a = arena[i];
        if (hb >= a.h) continue;
        const o = a.ax === 0 ? dp.z : dp.x;
        if (o < a.lo || o > a.hi || (a.gHi > a.gLo && o > a.gLo && o < a.gHi)) continue;
        const c = a.ax === 0 ? dp.x : dp.z, pc = a.ax === 0 ? px : pz, s = pc - a.pos >= 0 ? 1 : -1;
        if (s * (c - a.pos) < R) {
          if (a.ax === 0) { dp.x = a.pos + s * R; if (s * dv.x < 0) { dv.x = -dv.x * a.e; dv.z *= 0.85; } }
          else { dp.z = a.pos + s * R; if (s * dv.z < 0) { dv.z = -dv.z * a.e; dv.x *= 0.85; } }
        }
      }
      dp.y = hb + R;
    }

    function stepDead(sdt) {
      if (sdt <= 0) return;
      const n = Math.min(12, Math.ceil(sdt / (1 / 120))), h = sdt / n;
      for (let s = 0; s < n; s++) {
        const px = dp.x, ph = dp.y - R, pz = dp.z;
        let sp = Math.hypot(dv.x, dv.z);
        if (dspin && sp > 60 * S) {                 // Magnus curve, as ballMotion
          const acc = dspin * 560 * S * (sp / (500 * S)), nx = -dv.z / sp, nz = dv.x / sp;
          dv.x += nx * acc * h; dv.z += nz * acc * h; dspin *= Math.exp(-0.9 * h);
        }
        dp.x += dv.x * h; dp.z += dv.z * h;
        let hb = dp.y - R;
        if (hb > 0 || dv.y > 0) {
          dv.y -= GRAV * h; hb += dv.y * h;
          if (hb <= 0) {
            hb = 0;
            if (dv.y < -VBOUNCE) { sqT = 0; sqD = clamp(-dv.y * 0.02, 0.05, 0.18); dv.y = -dv.y * 0.48; dv.x *= 0.84; dv.z *= 0.84; }
            else dv.y = 0;
          }
        }
        dp.y = hb + R;
        collide(px, ph, pz);
        hb = dp.y - R;
        const air = hb > AIRH, k1 = air ? 0.2 : 0.7, k0 = air ? 0 : K0;
        sp = Math.hypot(dv.x, dv.z);
        if (sp > 0) { const ns = Math.max(0, sp - (k1 * sp + k0) * h); dv.x *= ns / sp; dv.z *= ns / sp; }
      }
    }

    function update(vf, dt) {
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      const b = vf.ball;
      simP.set(b.x || 0, (b.y || 0) + R, b.z || 0);
      if (!(simP.x === simP.x && simP.y === simP.y && simP.z === simP.z)) simP.set(0, R, 0);
      if (hasPrev && simP.distanceToSquared(prevSim) > TELE2) pendSnap = true;
      if (pendSnap) { pendSnap = false; snap(vf); }     // an 'out'/'goal' latched in the same frame still applies after the snap
      prevSim.copy(simP); hasPrev = true;

      // ---- base position: sim, or the local dead-ball integrator after 'out'
      if (pendOut) { pendOut = false; if (!b.held) seedDead(vf); }
      if (dead) {
        deadT += dt;
        if (vf.phase !== deadPhase || b.owner >= 0 || b.held || deadT > 8) endDead();
        else stepDead(dt * TS);
      }
      if (dead) base.copy(dp);
      else {
        base.copy(simP);
        if (relW > 0.001) { base.lerp(relP, relW); relW *= Math.exp(-10 * dt); } else relW = 0;
      }

      // ---- dribble: ahead of the feet (6.2)
      const oi = b.owner, p = oi >= 0 && vf.players ? vf.players[oi] : null;
      const on = !!p && !p.hidden && p.state === 'free' && !p.shield && !(p.fakeU > 0) && !b.held && !dead && !b.inNet;
      if (p && !p.hidden) {
        const yaw = p.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
        const sr = p.top > 0 ? clamp((p.speed || 0) / p.top, 0, 1.5) : 0, ph = p.runPh || 0;
        const lead = 0.55 + 0.35 * sr + 0.1 * Math.sin(2 * ph);
        const side = clamp(Math.sin(ph) * 2.5, -1, 1) * 0.14;          // foot to foot: soft sign(sin(runPh))
        rawT.set((p.x || 0) + fx * lead + rx * side, R, (p.z || 0) + fz * lead + rz * side);
        if (!tgtValid || w < 0.02) tgt.copy(rawT); else tgt.lerp(rawT, 1 - Math.exp(-30 * dt));
        tgtValid = true;
      }
      w += ((on ? 1 : 0) - w) * (1 - Math.exp(-(on ? 8 : 14) * dt));
      if (w < 1e-4) w = 0;
      if (w > 0 && tgtValid) base.lerp(tgt, w);

      // ---- held by the keeper: hugged to the chest
      const k = vf.keeper, hOn = !!(b.held && k);
      if (hOn && !hasDrawn) heldW = 1;
      heldW += ((hOn ? 1 : 0) - heldW) * (1 - Math.exp(-(hOn ? 12 : 14) * dt));
      if (heldW < 1e-4) heldW = 0;
      if (heldW > 0 && k) {
        const ky = k.yaw || 0;
        holdP.set((k.x || 0) + Math.sin(ky) * 0.3, 1.05, (k.z || 0) + Math.cos(ky) * 0.3);
        base.lerp(holdP, heldW);
      }

      // ---- net bulge push on a goal
      if (pendGoal) {
        pendGoal = false;
        netDir.set(b.vx || 0, 0, b.vz || 0);
        const l = netDir.length();
        if (l > 1e-3) netDir.multiplyScalar(1 / l); else netDir.set(0, 0, -1);
        netAmt = clamp(l / 15, 0.3, 1); netOn = true; netT = 0;
      }
      if (netOn) {
        netT += dt;
        const a = netT < 0.08 ? netT / 0.08 : Math.exp(-5 * (netT - 0.08));
        if (netT > 1.5) netOn = false; else base.addScaledVector(netDir, 0.35 * a * netAmt);
      }

      // ---- drawn position + velocity of the drawn ball (rolling never slides, whatever moved it)
      drawn.copy(base);
      if (dt > 0 && hasDrawn) {
        vel.subVectors(drawn, prevDrawn).multiplyScalar(1 / dt);
        const l = vel.length();
        if (l > 45) vel.multiplyScalar(45 / l);
      } else if (!hasDrawn) vel.set(0, 0, 0);
      prevDrawn.copy(drawn); hasDrawn = true;

      // ---- orientation
      const hgt = drawn.y - R, grounded = hgt < 0.05 && heldW < 0.5;
      kickHold = Math.max(0, kickHold - dt);
      if (heldW >= 0.5) wB.multiplyScalar(Math.exp(-6 * dt));
      else if (grounded && kickHold <= 0) wB.set(vel.z / R, 0, -vel.x / R);         // (up x v) / R
      else wB.multiplyScalar(Math.pow(0.98, dt));
      if (pendKick) {
        pendKick = false;
        const vx = b.vx || 0, vz = b.vz || 0, vh = Math.hypot(vx, vz);
        if (vh > 0.1 && pendKickType) {
          const ax = vz / vh, az = -vx / vh;     // roll axis for the kick direction
          const r = pendKickType === 'chip' ? -32 : pendKickType === 'power' ? 6 : pendKickType === 'finesse' ? 9 : 14;
          wB.set(ax * r, 0, az * r); kickHold = 0.08;
        }
      }
      om.copy(wB);
      if (!grounded) om.y += (b.spin || 0) * 14;
      const wl = om.length(), ang = wl * dt;
      if (ang > 1e-7) {
        om.multiplyScalar(1 / wl);
        dq.setFromAxisAngle(om, ang);
        sphere.quaternion.premultiply(dq);
        if (++frames % 60 === 0) sphere.quaternion.normalize();
      }

      // ---- squash + placement
      sqT += dt;
      const sy = sqT < 0.09 ? 1 - sqD * (1 - sm(sqT / 0.09)) : 1, sxz = 1 / Math.sqrt(sy);
      mesh.scale.set(sxz, sy, sxz);
      mesh.position.set(drawn.x, hgt < 0.15 ? drawn.y - R * (1 - sy) : drawn.y, drawn.z);

      // ---- contact shadow
      const hh = Math.max(0, hgt), f = 1 / (1 + hh * 0.45), rad = 0.27 * (0.5 + 0.5 * f), al = 0.6 * f * f;
      shadow.position.set(drawn.x, 0.012, drawn.z);
      shadow.scale.set(rad * 2, 1, rad * 2);
      shMat.opacity = al; shadow.visible = al > 0.01;

      // ---- trail ring (fixed real-time sampling)
      if (dt > 0) {
        tAcc += dt;
        if (tAcc >= TRAIL_DT || tCount === 0) {
          tAcc = tAcc >= TRAIL_DT ? Math.min(tAcc - TRAIL_DT, TRAIL_DT) : 0;
          tHead = (tHead + 1) % TRAIL_CAP; ring[tHead].copy(drawn); tCount = Math.min(TRAIL_CAP, tCount + 1);
        }
      }
      TRAIL.speed = vel.length();
    }

    function onEvent(e) {
      if (!e) return;
      switch (e.type) {
        case 'kick': pendKick = true; pendKickType = e.shot || null; break;
        case 'bounce': if (!dead) { sqT = 0; sqD = 0.18; } break;
        case 'out': pendOut = true; break;
        case 'goal': pendGoal = true; break;
        case 'post': case 'bar': wB.multiplyScalar(0.3); sqT = 0; sqD = 0.05 + 0.07 * clamp(e.power != null ? e.power : 0.5, 0, 1); break;
        case 'save': wB.multiplyScalar(0.35); break;
        case 'teleport': pendSnap = true; break;
      }
    }

    function getTrailPoints() {
      for (let i = 0; i < tCount; i++) TRAIL.points[i] = ring[(tHead - i + TRAIL_CAP) % TRAIL_CAP];
      TRAIL.count = tCount;
      return TRAIL;
    }

    function setArena(o) { arena = makeArena(K, o); }

    function dispose() {
      geo.dispose(); mat.dispose(); shGeo.dispose(); shMat.dispose(); shTex.dispose(); glowMat.dispose(); glowTex.dispose();
      for (const id in texCache) texCache[id].dispose();
    }

    return {
      mesh, sphere, shadow, glow, update, onEvent, reset, setSkin, setArena, getTrailPoints, dispose,
      get skin() { return skin; }, get dribbleW() { return w; }, get dead() { return dead; }, get drawn() { return drawn; },
    };
  }

  R3D.Ball = { create, paintSkin, makeArena, RADIUS: R, TEX_W: TW, TEX_H: TH };
})();
