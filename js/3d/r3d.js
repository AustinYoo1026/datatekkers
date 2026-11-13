/* ISO FOOTBALL 3D — facade. Lazily loads Three.js, owns the renderer/scene, and per frame turns the live sim (the single source of
   truth, untouched) into a ViewFrame that the stadium, players, animator, ball, camera and effects consume.
   Every helper module is optional at runtime: a missing or failing one is replaced by a simple stand-in rather than breaking the game. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = (ISO.R3D = ISO.R3D || {}), K = R3D.K;
  const TEAM_COL = (R3D.TEAM_COL = R3D.TEAM_COL || ['#4da3ff', '#ff6b5e']);      // shared with fx3d.js; ISO.Access.apply writes the palette into it in place (Phase 9.1)
  const AX = () => ISO.Access || { hc: false, rm: false, noFlash: false };
  let THREE = null, renderer = null, scene = null, canvas = null, loading = null;
  let stadium = null, ball = null, fx = null, camera = null, sun = null, ring = null, rings = [], ringGeo = null;
  let actors = [], keeperActor = null, keeperMine = null, pending = null, built = false, lastBall = null, castSig = null;
  const bad = {};                  // modules disabled after throwing
  let hemi = null, fxOn = false;
  // rain: one LineSegments draw call, drops recycled in a box around the camera
  let rain = null;
  const RAIN_N = 1800, RAIN_N2 = 900, RAIN_W = 70, RAIN_H = 28, RAIN_D = 90;
  function clearRain() { if (!rain) return; try { if (scene) scene.remove(rain.mesh); rain.mesh.geometry.dispose(); rain.mesh.material.dispose(); } catch (e) { /* ignore */ } rain = null; }
  function makeRain() {
    const d = new Float32Array(RAIN_N * 3), pos = new Float32Array(RAIN_N * 6);
    for (let i = 0; i < RAIN_N; i++) { d[i * 3] = Math.random() * RAIN_W; d[i * 3 + 1] = Math.random() * RAIN_H; d[i * 3 + 2] = Math.random() * RAIN_D; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfd4ea, transparent: true, opacity: 0.38, depthWrite: false, fog: false }));
    mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
    rain = { mesh, d, pos, n: tier >= 2 ? RAIN_N2 : RAIN_N };
    if (rain.n < RAIN_N) geo.setDrawRange(0, rain.n * 2);
  }
  function updateRain(dt) {
    if (!rain || !camera || !camera.cam) return;
    const cp = camera.cam.position, d = rain.d, p = rain.pos, fall = 26 * Math.min(dt, 0.05);
    const ox = cp.x - RAIN_W / 2, oz = cp.z - RAIN_D / 2;
    for (let i = 0, n = rain.n; i < n; i++) {
      let y = d[i * 3 + 1] - fall * (0.85 + (i % 5) * 0.08); if (y < 0) y += RAIN_H;
      d[i * 3 + 1] = y;
      // x / z are stored relative to the box and wrapped around the camera so the drops follow it
      const x = ox + ((((d[i * 3] - ox) % RAIN_W) + RAIN_W) % RAIN_W), z = oz + ((((d[i * 3 + 2] - oz) % RAIN_D) + RAIN_D) % RAIN_D);
      const j = i * 6; p[j] = x; p[j + 1] = y; p[j + 2] = z; p[j + 3] = x + 0.1; p[j + 4] = y + 0.9; p[j + 5] = z + 0.05;
    }
    rain.mesh.geometry.attributes.position.needsUpdate = true;
  }
  function applyRainLook() {      // darker, bluer, closer: an overcast wet evening
    if (!stadium) return;
    const g = new THREE.Color(0x56626f);
    if (stadium.hemi) stadium.hemi.intensity *= 0.62;
    if (stadium.sun) stadium.sun.intensity *= 0.5;
    if (stadium.fog) { stadium.fog.color.lerp(g, 0.55); stadium.fog.near *= 0.45; stadium.fog.far *= 0.6; }
    if (stadium.background && stadium.background.lerp) stadium.background.lerp(g, 0.55);
    stadium.group.traverse((o) => { if (o.name === 'pitch' && o.material && o.material.roughness !== undefined) o.material.roughness = Math.min(o.material.roughness, 0.55); });
  }
  let pixelRatio = 1, tier = 0, tAvg = 16, tLow = 0, tHigh = 0, time = 0;
  // 9.4 adaptive quality: downgrades on frame INTERVAL (> 19 ms for 2 s), upgrades on measured WORK time (< 7 ms for upWait seconds; the wait doubles after every bounce)
  let workAvg = 8, okT = 0, upWait = 10, upAt = -999, tierFixed = null, lastQ = 'auto';

  function guard(name, fn, fallback) {
    if (bad[name]) return fallback;
    try { return fn(); } catch (err) { bad[name] = true; console.warn('[3D] ' + name + ' disabled:', err); return fallback; }
  }

  // ------------------------------------------------------------------ boot
  function ensure(cb) {
    if (R3D.ready) { cb && cb(true); return; }
    const init = () => {
      THREE = globalThis.THREE;
      try {
        canvas = document.getElementById('cv3d');
        if (renderer) {
          // an earlier renderer is still around (its context was lost, or the 3D view failed). While its context is still lost a new
          // WebGLRenderer cannot be built (a failed constructor leaves listeners on the canvas that throw when the context is restored),
          // so wait: the old renderer's own restore handler stays in place until then.
          let lost = false; try { lost = renderer.getContext().isContextLost(); } catch (e) { lost = true; }
          if (lost) { console.warn('[3D] WebGL context is still lost'); R3D.ready = false; cb && cb(false); return; }
          try { renderer.dispose(); } catch (e) { /* ignore */ }
          renderer = null;
        }
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setPixelRatio(pixelRatio); renderer.setSize(1280, 720, false);
        built = false;                 // a new renderer and scene: whatever was built for an earlier one is gone
        if (!canvas.r3dLost) canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3D.ready = false; built = false; ISO.Profile.setSetting('camera', 'classic'); if (ISO.App && ISO.App.toast) ISO.App.toast('3D LOST', 'Back to Classic view', '#ffb23d'); });
        canvas.r3dLost = true;
        if (scene) clearScene();
        if (fx && fx.dispose) { try { fx.dispose(); } catch (e) { /* ignore */ } }
        if (camera && camera.dispose) { try { camera.dispose(); } catch (e) { /* ignore */ } }
        scene = new THREE.Scene();
        camera = R3D.Camera.create(THREE);
        fx = R3D.Fx.create(THREE, scene);
        initTier();
        castSig = null;                // the model caches belong to the previous renderer: rebuild them
        R3D.ready = true;
      } catch (err) {
        console.warn('[3D] WebGL unavailable', err); R3D.ready = false;
        if (renderer) { try { renderer.dispose(); } catch (e2) { /* ignore */ } renderer = null; }     // built, but the rest of the boot failed
      }
      cb && cb(R3D.ready);
    };
    if (globalThis.THREE) { init(); return; }
    if (!loading) {
      loading = [];
      const s = document.createElement('script');
      s.src = 'js/vendor/three.min.js';
      s.onload = () => { const l = loading; loading = null; l.forEach((f) => f()); };
      s.onerror = () => { const l = loading; loading = null; l.forEach((f) => f(true)); };
      document.head.appendChild(s);
    }
    loading.push((failed) => { if (failed) cb && cb(false); else init(); });
  }

  function resize(ratio) { pixelRatio = ratio || 1; if (renderer) renderer.setPixelRatio(Math.min(pixelRatio, tier === 0 ? 1.5 : tier === 1 ? 1.25 : 1)); }

  // ------------------------------------------------------------------ scene construction
  // custom drill (G.cust, js/drillspec.js): its cones (vertical capsules, 20 sim px high) and walls (thin panels of height h) as simple meshes
  let custGroup = null;
  function buildCust(G) {
    if (!G.cust) return;
    const grp = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }), wm = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.8 }), p = {};
    for (const c of G.cust.cones) {
      const r = c.r * K.S, m = new THREE.Mesh(new THREE.ConeGeometry(r, 20 * K.S, 16), cm); K.toWorld(c.x, c.y, 0, p);
      m.position.set(p.x, 10 * K.S, p.z); m.castShadow = true; grp.add(m);
    }
    const q = {};
    for (const w of G.cust.walls) {
      K.toWorld(w.x0, w.y0, 0, p); K.toWorld(w.x1, w.y1, 0, q);
      const len = Math.hypot(q.x - p.x, q.z - p.z) + 0.12, h = w.h * K.S, m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.12), wm);
      m.position.set((p.x + q.x) / 2, h / 2, (p.z + q.z) / 2); m.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    }
    scene.add(grp); custGroup = grp;
  }
  function clearScene() {
    if (!scene) return;
    for (const o of actors.concat(keeperActor ? [keeperActor] : [], keeperMine ? [keeperMine] : [])) { guard('player', () => o.dispose && o.dispose()); scene.remove(o.group); }
    actors = []; keeperActor = null; keeperMine = null;
    if (stadium) { guard('stadium', () => stadium.dispose && stadium.dispose()); scene.remove(stadium.group); stadium = null; }
    if (ball) { scene.remove(ball.mesh); if (ball.shadow) scene.remove(ball.shadow); guard('ball', () => ball.dispose && ball.dispose()); ball = null; }
    if (ring) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); ring = null; }
    for (const r of rings) { scene.remove(r); r.material.dispose(); }
    rings = []; if (ringGeo) { ringGeo.dispose(); ringGeo = null; }
    if (sun) { scene.remove(sun, sun.target); sun = null; }
    if (hemi) { scene.remove(hemi); hemi = null; }
    clearRain();
    if (custGroup) { scene.remove(custGroup); custGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); custGroup = null; }
  }

  // simple stand-ins used when a helper module is missing or has failed
  function fallbackStadium(theme) {
    const g = new THREE.Group();
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(70, 60), new THREE.MeshStandardMaterial({ color: theme.base || '#2c7a3d', roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.z = 17; pitch.receiveShadow = true; g.add(pitch);
    const mat = new THREE.MeshStandardMaterial({ color: theme.post || '#fff' });
    const gp = (x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, K.goalH, 8), mat); m.position.set(x, K.goalH / 2, 0); m.castShadow = true; g.add(m); };
    gp(-K.goalW / 2); gp(K.goalW / 2);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, K.goalW, 8), mat); bar.rotation.z = Math.PI / 2; bar.position.set(0, K.goalH, 0); g.add(bar);
    scene.background = new THREE.Color(theme.bg || '#0c1016');
    return { group: g, update() {}, netHit() {}, setTargets() {}, sun: null, dispose() {} };
  }
  function fallbackPlayer(spec) {
    const g = new THREE.Group(), col = new THREE.Color((spec.kit && spec.kit.a) || '#fff');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: col }));
    body.position.y = 0.9; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: (spec.def.look && spec.def.look.skin) || '#e8bd95' }));
    head.position.y = 1.7; g.add(head);
    return { group: g, bones: {}, dispose() {} };
  }
  function fallbackBall() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(K.ballR, 20, 14), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.5 }));
    mesh.castShadow = true;
    return { mesh, shadow: null, update(vf) { const b = vf.ball; mesh.position.set(b.x, b.y + K.ballR, b.z); }, onEvent() {}, reset() {} };
  }

  // the home (team 0) kit colours for the flags and the banner of the stands
  function homeCols(G, info) {
    try { const k = (info && info.kits) || ISO.resolveKits(G.players[0].def, G.players[1].def); const h = k && k[0]; return h && h.a ? [h.a, h.b || h.a] : null; } catch (e) { return null; }
  }
  function build() {
    const { G, V, info } = pending;
    clearScene();
    built = false;
    const R = ISO.Render, theme = R.theme(), mapId = R.mapId();
    const quality = tier;
    stadium = (R3D.Stadium && guard('stadium', () => R3D.Stadium.build(THREE, theme, K, { walls: !!G.walls, quality, mapId, turf: G.turf, kitCols: homeCols(G, info), noFlash: AX().noFlash, flav: stadiumFlav(mapId) }))) || fallbackStadium(theme);
    scene.add(stadium.group);
    if (stadium.applyTo) guard('stadium', () => stadium.applyTo(scene));
    if (!stadium.sun) {
      sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-14, 26, 20); sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024); const c = sun.shadow.camera; c.left = -22; c.right = 22; c.top = 22; c.bottom = -12; c.near = 1; c.far = 80; sun.shadow.bias = -0.0004;
      sun.target.position.set(0, 0, 8); scene.add(sun, sun.target); hemi = new THREE.HemisphereLight(0xcfe8ff, 0x335533, 0.7); scene.add(hemi);
    } else if (stadium.sun.parent == null) scene.add(stadium.sun);
    const kits = info.kits || ISO.resolveKits(G.players[0].def, G.players[1].def);
    // the player models share cached geometries / materials / textures (a texture per kit and shirt number): free them when the
    // cast changes. Everything built from them was removed and disposed by clearScene() above, nothing on screen still uses them.
    const sig = G.players.map((p) => [p.def && p.def.id, p.def && p.def.name, p.def && p.def.num, p.def && JSON.stringify(p.def.look), JSON.stringify(kits[p.team % 2])].join('|')).join(';');
    if (sig !== castSig) { if (R3D.Player && R3D.Player.clearCache) guard('player', () => R3D.Player.clearCache()); castSig = sig; }
    G.players.forEach((p, i) => {
      const spec = { def: p.def, kit: kits[p.team % 2], keeper: false, slot: i };
      const a = (R3D.Player && guard('player', () => R3D.Player.create(THREE, spec))) || fallbackPlayer(spec);
      a.anim = (R3D.Anim && guard('anim', () => R3D.Anim.create(a))) || null;
      scene.add(a.group); actors.push(a);
    });
    const kdef = ISO.KEEPERS[1], kspec = { def: kdef, kit: kdef.kit, keeper: true, slot: 9 };
    keeperActor = (R3D.Player && guard('player', () => R3D.Player.create(THREE, kspec))) || fallbackPlayer(kspec);
    keeperActor.anim = (R3D.Anim && guard('anim', () => R3D.Anim.create(keeperActor))) || null;
    scene.add(keeperActor.group);
    if (G.drill && G.drill.so) {      // the penalty shootout: the keeper you play (his own kit) takes the place of the opposing one in their kicks
      const mdef = ISO.KEEPERS[0], mspec = { def: mdef, kit: mdef.kit, keeper: true, slot: 8 };
      keeperMine = (R3D.Player && guard('player', () => R3D.Player.create(THREE, mspec))) || fallbackPlayer(mspec);
      keeperMine.anim = (R3D.Anim && guard('anim', () => R3D.Anim.create(keeperMine))) || null;
      scene.add(keeperMine.group);
    }
    const skin = ISO.ballById(ISO.Profile.data.ball);
    ball = (R3D.Ball && guard('ball', () => R3D.Ball.create(THREE, skin, { walls: !!G.walls, onNetHit: (x, y, z, s) => { if (stadium) guard('stadium', () => stadium.netHit(x, y, z, s)); } }))) || fallbackBall();
    scene.add(ball.mesh); if (ball.shadow) scene.add(ball.shadow);
    // a ring in the team colour under every player, as on the 2D view (bolder under whoever has the ball); a wider one marks you
    ringGeo = new THREE.RingGeometry(0.5, 0.56, 40);
    G.players.forEach((p) => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TEAM_COL[p.team % 2], transparent: true, opacity: 0.5, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.025; scene.add(r); rings.push(r);
    });
    ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 40), new THREE.MeshBasicMaterial({ color: TEAM_COL[0], transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
    guard('cust', () => buildCust(G));
    if (G.weather === 'rain') guard('rain', () => { applyRainLook(); makeRain(); });
    if (R3D.CamRig && stadium) camera.setLimits(R3D.CamRig.limits(stadium.colliders, stadium.kind, K));
    camSig = ''; fx.reset(); camera.reset(); R3D.Adapter.reset(G); lastBall = null;
    built = true;       // only once everything above succeeded
  }

  // the camera settings (profile.settings: cam3d, camZoom, camSens, camShake, camGoal) reach the camera only when they change
  let camSig = '';
  function applyCamSettings() {
    const st = (ISO.Profile && ISO.Profile.data && ISO.Profile.data.settings) || {};
    const noShake = AX().rm, sig = [st.cam3d, st.camZoom, st.camSens, st.camShake, st.camGoal, noShake].join('|');
    if (sig === camSig) return; camSig = sig;
    camera.setPreset(st.cam3d && R3D.CamRig.PRESETS[st.cam3d] ? st.cam3d : 'chase');
    camera.setOptions({ zoom: st.camZoom == null ? 1 : st.camZoom, sens: st.camSens == null ? 1 : st.camSens, shakeK: noShake ? 0 : st.camShake == null ? 1 : st.camShake, goalMode: st.camGoal || 'celeb' });
  }
  function onMatch(G, V, info) { pending = { G, V, info: info || {} }; built = false; if (R3D.ready && scene) { /* built lazily on the next render */ } }

  // ------------------------------------------------------------------ events
  // An event can arrive before the first picture of a match (the scene is built lazily): it builds the scene rather than
  // being lost. Events of a match other than the one the scene is for are not this renderer's.
  function onEvent(G, e) {
    if (!R3D.ready || !pending || pending.G !== G) return;
    try { if (!built) build(); onEventInner(G, e); } catch (err) { fail(err); }
  }
  // The 3D view is being shown again after the 2D one (VIEW toggled, Three.js finished loading, back from the shootout):
  // events went to the other renderer meanwhile, so everything latched from them or integrated over time starts clean.
  function onView() {
    if (!R3D.ready || !built) return;
    try {
      fx.reset(); camera.reset(); R3D.Adapter.clear(); lastBall = null;
      if (ball && ball.reset) guard('ball', () => ball.reset());
    } catch (err) { fail(err); }
  }
  function onEventInner(G, e) {
    R3D.Adapter.onEvent(G, e);
    { const mp = G.players[(pending.V && pending.V.me) || 0]; fx.setClear(fxOn, mp ? mp.team : -1); if (e.type === 'clear' && mp && e.team === mp.team) fx.flashClear(); }
    fx.onEvent(G, e);
    camera.onEvent(e, R3D.Adapter.vf);
    const plain = { type: e.type, power: e.power, shot: e.shot, kind: e.kind, team: e.team, catch: e.catch, weak: e.weak, smother: e.smother, slide: e.slide, p: e.p ? G.players.indexOf(e.p) : -1 };
    if (ball) guard('ball', () => ball.onEvent(plain, R3D.Adapter.vf));
    if (stadium && e.type === 'goal' && stadium.cheer) guard('stadium', () => stadium.cheer());
    if (stadium && (e.type === 'save' || e.type === 'post') && stadium.cheer) guard('stadium', () => stadium.cheer(0.6));
    if (stadium && (e.type === 'goal')) guard('stadium', () => stadium.netHit(R3D.Adapter.vf.ball.x, R3D.Adapter.vf.ball.y, R3D.Adapter.vf.ball.z, 12));
  }

  // ------------------------------------------------------------------ frame
  // 9.1: the player's stadium options as a Stadium.build flavour override (flags on/off, crowd density), never above the map's own value
  function stadiumFlav(id) {
    const s = PS(), o = {}; if (!s) return o;
    if (s.stFlags === false) o.flags = 0;
    const m = s.stCrowd === 'med' ? 0.6 : s.stCrowd === 'low' ? 0.35 : 1;
    if (m < 1) { const F = R3D.Stadium && R3D.Stadium.FLAV && R3D.Stadium.FLAV[id]; o.crowd = Math.max(0.25, Math.min(F && F.crowd != null ? F.crowd : 1, m)); }
    return o;
  }
  const Q2T = { low: 2, med: 1, high: 0 };
  const PS = () => { try { return ISO.Profile.data.settings; } catch (e) { return null; } };
  function deviceHint() {
    let t = 0;
    try {
      const n = typeof navigator === 'object' && navigator || {};
      if ((n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (n.deviceMemory && n.deviceMemory <= 4)) t = 1;
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) t = 2;
    } catch (e) { /* ignore */ }
    return t;
  }
  function initTier() {
    const s = PS(), q = s && s.quality;
    tierFixed = q in Q2T ? Q2T[q] : null; lastQ = q || 'auto';
    tier = tierFixed != null ? tierFixed : (s && (s.lastTier === 0 || s.lastTier === 1 || s.lastTier === 2) ? s.lastTier : deviceHint());
    tAvg = 16; workAvg = 8; tLow = tHigh = okT = 0; upWait = 10; upAt = -999;
    renderer.setPixelRatio(Math.min(pixelRatio, tier === 0 ? 1.5 : tier === 1 ? 1.25 : 1));
  }
  function setTier(n) {
    tier = n; applyTier();
    if (rain) { rain.n = tier >= 2 ? RAIN_N2 : RAIN_N; rain.mesh.geometry.setDrawRange(0, rain.n * 2); }
    if (tierFixed == null) { const s = PS(); if (s && s.lastTier !== tier) ISO.Profile.setSetting('lastTier', tier); }
  }
  function adaptTier(dt, work) {
    const s = PS(), q = s ? s.quality : 'auto';
    if (q !== lastQ) { lastQ = q; tierFixed = q in Q2T ? Q2T[q] : null; if (tierFixed != null && tierFixed !== tier) setTier(tierFixed); tLow = tHigh = okT = 0; }
    if (tierFixed != null) return;
    tAvg += (dt * 1000 - tAvg) * 0.05; workAvg += (work - workAvg) * 0.05;
    if (tAvg > 19) { tLow += dt; okT = 0; } else { tLow = 0; if (workAvg < 7) okT += dt; else okT = 0; }
    if (tLow > 2 && tier < 2) {
      if (time - upAt < 40) upWait = Math.min(upWait * 2, 160);      // a bounce (we went back up and fell again): wait twice as long next time
      setTier(tier + 1); tLow = 0; okT = 0; tAvg = 16;
    } else if (okT > upWait && tier > 0) { upAt = time; setTier(tier - 1); okT = 0; workAvg = 8; }
  }
  function applyTier() {
    renderer.setPixelRatio(Math.min(pixelRatio, tier === 0 ? 1.5 : tier === 1 ? 1.25 : 1));
    const L = stadium && stadium.sun || sun;
    if (L && L.shadow) { renderer.shadowMap.enabled = tier < 2; L.shadow.mapSize.set(tier === 0 ? 2048 : 1024, tier === 0 ? 2048 : 1024); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  }

  // any exception on the 3D path: log it and hand the game back to Classic rather than breaking the match
  function fail(err) { console.warn('[3D] disabled after error:', err); R3D.ready = false; built = false; try { ISO.Profile.setSetting('camera', 'classic'); if (ISO.App && ISO.App.toast) ISO.App.toast('3D ERROR', 'Switched back to Classic view', '#ffb23d'); } catch (e2) { /* ignore */ } }
  function render(G, V, dt, c2d) {
    if (!R3D.ready) return;
    try { renderInner(G, V, dt, c2d); } catch (err) { fail(err); }
  }
  // the ball as drawn this frame, in the ViewFrame ball's shape: x / z, y = height of its lowest point, sim velocities, r = radius
  const bvOut = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: K.ballR, owner: -1, held: false };
  function drawnBall(vf) {
    const b = vf.ball, d = ball && ball.drawn;
    bvOut.x = d ? d.x : b.x; bvOut.z = d ? d.z : b.z; bvOut.y = d ? Math.max(0, d.y - K.ballR) : b.y;
    bvOut.vx = b.vx; bvOut.vy = b.vy; bvOut.vz = b.vz; bvOut.owner = b.owner; bvOut.held = b.held; bvOut.r = K.ballR; bvOut.hold = ball && ball.strike ? ball.strike.hold : -1; bvOut.strike = (ball && ball.strike) || null;
    return bvOut;
  }
  function renderInner(G, V, dt, c2d) {
    if (pending && pending.G !== G) return;       // not the match this scene belongs to
    if (!built) { if (!pending) return; build(); }
    const t0 = typeof performance === 'object' ? performance.now() : 0;
    time += dt;
    const rs = replayStep(G, V, dt);      // non-null while the goal replay is on screen
    const vf = rs ? R3D.Adapter.snapshotTape(rs.fg, V) : R3D.Adapter.snapshot(G, V);
    const dtA = rs ? dt * rs.rate : dt;      // the figures and the ball move at the replay's speed (slow motion), the camera and the stadium in real time
    // a sudden ball jump (kick-off / new rep) resets the ball's visual state
    if (lastBall && (Math.abs(vf.ball.x - lastBall.x) + Math.abs(vf.ball.z - lastBall.z)) > 3 && ball && ball.reset) guard('ball', () => ball.reset());
    lastBall = lastBall || {}; lastBall.x = vf.ball.x; lastBall.z = vf.ball.z;
    // the ball first: the animator reaches the feet and hands to the ball as it is DRAWN (bv), not to the raw sim position
    if (ball) guard('ball', () => ball.update(vf, dtA));
    const bv = drawnBall(vf);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i], pv = vf.players[i];
      if (a.anim) guard('anim', () => a.anim.update(pv, dtA, bv)); else if (a.group) { a.group.visible = !pv.hidden; a.group.position.set(pv.x, 0, pv.z); a.group.rotation.y = pv.yaw; }
    }
    {
      // in the shootout the keeper on the pitch is you (your kit) while they shoot, theirs while you shoot
      const ka = keeperMine && vf.keeper.human ? keeperMine : keeperActor, kb = ka === keeperMine ? keeperActor : keeperMine;
      if (kb) kb.group.visible = false;
      if (ka) { if (ka.anim) guard('anim', () => ka.anim.update(vf.keeper, dtA, bv)); else { ka.group.position.set(vf.keeper.x, 0, vf.keeper.z); ka.group.rotation.y = vf.keeper.yaw; } }
    }
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], pv = vf.players[i];
      r.visible = !!pv && !pv.hidden; if (!pv) continue;
      r.position.set(pv.x, 0.025, pv.z); r.material.opacity = AX().hc || pv.owner ? (AX().hc ? 1 : 0.95) : 0.5;
      const tc = TEAM_COL[G.players[i].team % 2]; if (r.userData.tc !== tc) { r.userData.tc = tc; r.material.color.set(tc); }      // the palette can change mid-match
    }
    if (ring) { const me = vf.players[vf.me]; ring.visible = !!me && !me.hidden && G.phase !== 'end'; if (me) { ring.position.set(me.x, 0.03, me.z); ring.material.color.set(TEAM_COL[me.team % 2]); } }
    if (rs) {
      REP.rig.update(bv, dt, { slow: rs.slowmo, rm: AX().rm, half: K.half, walls: !!G.walls, depthAll: K.depthAll || K.depth, sideX: camera.st.lim && camera.st.lim.sideX }, REP.pose);
      camera.applyPose(REP.pose);
      fxOn = false; fx.setClear(false, vf.myTeam);
    } else {
      applyCamSettings();
      camera.update(vf, dt, time, bv);
      // the clear cue belongs to the team of the screen: the box outline glows while that team has to clear
      fxOn = G.phase === 'play' && vf.mustClear >= 0 && vf.mustClear === vf.myTeam; fx.setClear(fxOn, vf.myTeam);
    }
    if (stadium && stadium.setTargets) guard('stadium', () => (G.drill && G.drill.kind === 'target' ? stadium.setTargets(ISO.TARGETS, G.drill.target) : stadium.setTargets(null)));
    if (stadium) guard('stadium', () => { stadium.update(dt, time); if (stadium.setView) stadium.setView(camera.cam.position.z, camera.cam.position.y); });
    fx.update(dt);
    if (rain) guard('rain', () => updateRain(dt));
    renderer.render(scene, camera.cam);
    adaptTier(dt, typeof performance === 'object' ? performance.now() - t0 : 0);
    if (c2d) { if (!rs) fx.draw2d(c2d, camera, G, V); replayOverlay(c2d, G, V, rs); }
  }

  // ------------------------------------------------------------------ goal replay
  // The tape (R3D.Adapter.Tape) records what is drawn while a match is live; a goal plays it back through the same actors, ball and stadium
  // (driven from tape frames, nothing new built, the live game never written) with its own low side-on camera (CamRig.replayCam).
  // Same window, skip key and conditions as the 2D view's replay (G.replay, not the menu demo, drills or the shootout); also off with
  // Match presentation switched off. Slow motion follows Slow-motion goals and reduce motion; the fades are to black, never white.
  const REP = { on: false, e: -1, rig: null, pose: { px: 0, py: 2, pz: 8, lx: 0, ly: 1, lz: 8, fov: 50 }, outT: 0, black: 0, rs: null, view: null };
  const smooth01 = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); };
  function replayWanted(G, V) {
    if (!G || !G.replay || (V && V.quiet) || G.drill || !R3D.Adapter || !R3D.Adapter.Tape || !R3D.CamRig || !R3D.CamRig.replayState) return false;
    const st = PS(); return !(st && st.pres === false);
  }
  function replayStep(G, V, dt) {
    const Tp = R3D.Adapter.Tape, CR = R3D.CamRig, ok = replayWanted(G, V);
    REP.rs = null; REP.black = 0;
    if (REP.outT > 0) REP.outT = Math.max(0, REP.outT - dt);
    if ((!ok || G.phase === 'end' || (G.phase === 'countdown' && Tp.goalAt() < 0)) && Tp.count()) Tp.clear();      // a new rep / match starts a new tape
    let rs = null;
    if (ok) {
      if (G.phase !== 'goal') { if (Tp.goalAt() >= 0) Tp.unmark(); REP.e = -1; } else if (Tp.goalAt() < 0) Tp.mark();
      if (G.phase === 'goal' && Tp.goalAt() >= 0 && Tp.count() > 8) {
        const eRaw = (G.goalDur - G.phaseT) / ISO.C.SPEED;
        if (REP.e < 0 || Math.abs(REP.e - eRaw) > 0.12) REP.e = eRaw; else if (dt > 0) { REP.e += dt; REP.e += (eRaw - REP.e) * Math.min(1, dt * 3); }
        const st = PS() || {}, slow = st.slowmo !== false && !AX().rm;
        rs = CR.replayState(REP.e, G.goalDur / ISO.C.SPEED, Tp.goalAt(), Tp.t0(), slow);
        if (!rs) REP.black = CR.replayPre(REP.e);
      }
      if (!rs && dt > 0 && (G.phase === 'play' || G.phase === 'goal')) Tp.record(G, dt);      // the tape pauses while it is being watched; costs one ring write a frame
    }
    if (rs) {
      if (!REP.on) {      // cut in: the actors, the ball and the lens start from the tape, the live latches stay out of it
        REP.on = true; if (!REP.rig) REP.rig = CR.replayCam(); REP.rig.reset(); Tp.begin();
        if (ball && ball.reset) guard('ball', () => ball.reset()); fx.reset(); lastBall = null;
      }
      rs.fg = Tp.seek(G, rs.t);
      if (!rs.fg) rs = null;
    }
    if (!rs && REP.on) {      // cut out: forget what the replay left in the latches, springs and ball, and fade up from black
      REP.on = false; camera.reset(); R3D.Adapter.clear(); fx.reset(); lastBall = null; REP.outT = 0.3; REP.e = G.phase === 'goal' ? REP.e : -1;
      if (ball && ball.reset) guard('ball', () => ball.reset());
    }
    REP.rs = rs;
    if (rs) REP.black = rs.black; else if (REP.outT > 0) REP.black = Math.max(REP.black, smooth01(REP.outT / 0.3));
    return rs;
  }
  function replayOverlay(c, G, V, rs) {
    const VW = 1280, VH = 720, FONT = '"Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
    c.save();
    if (rs) {
      const bar = 46; c.fillStyle = '#05070a'; c.fillRect(0, 0, VW, bar); c.fillRect(0, VH - bar, VW, bar);
    }
    if (REP.black > 0.001) { c.globalAlpha = Math.min(1, REP.black); c.fillStyle = '#05070a'; c.fillRect(0, 0, VW, VH); }
    if (rs) {
      c.globalAlpha = 1 - Math.min(1, REP.black);
      const lg = G.goals[G.goals.length - 1], i = lg && lg.by != null ? lg.by : 1 - G.concede, who = ((V && V.names && V.names[i] ? V.names[i] + ' (' + G.players[i].def.short + ')' : (G.players[i] || G.players[0]).def.short) || '').toUpperCase();
      const col = TEAM_COL[i % 2], bx = 86, by = VH - 46 - 34;
      c.font = '900 italic 30px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(6,10,14,.82)'; c.fillRect(bx - 16, by - 22, 190 + c.measureText(who).width, 44);
      c.fillStyle = col; c.fillRect(bx - 16, by - 22, 6, 44);
      if (AX().noFlash || Math.sin(time * 6) > -0.3) { c.fillStyle = '#ff4d4d'; c.beginPath(); c.arc(bx + 6, by, 6, 0, 6.2832); c.fill(); }      // the dot does not blink with reduce flash
      c.fillStyle = '#fff'; c.fillText('REPLAY', bx + 22, by + 1); c.fillStyle = col; c.fillText(who, bx + 140, by + 1);
      c.textAlign = 'right'; c.font = '800 20px ' + FONT; c.fillStyle = 'rgba(255,255,255,.8)';
      c.fillText(G.score[0] + ' \u2013 ' + G.score[1] + (rs.slowmo ? '   \u00b7   SLOW MOTION' : '') + (V && V.canSkip && ISO.Input ? '   \u00b7   ' + ISO.Input.keyLabel('shoot').toUpperCase() + ' TO SKIP' : ''), VW - 86, by + 1);
    }
    c.restore();
  }

  R3D.ensure = ensure; R3D.resize = resize; R3D.onMatch = onMatch; R3D.onEvent = onEvent; R3D.render = render;
  R3D.mapInput = (k) => (camera ? camera.mapInput(k) : { ...k, mx: -k.my, my: k.mx });
  R3D.unproject = (x, y) => (camera ? camera.unproject(x, y) : null);
  R3D.onView = onView;
  R3D.project = (x, y, z, out) => (camera ? camera.project(x, y, z, out) : null);      // world point -> 1280 x 720 screen px (tools / tests)
  R3D.camPresets = () => R3D.CamRig.ORDER;
  R3D.camState = () => (camera ? camera.st : null);
  // read-only numbers for the debug HUD (js/debug-hud.js); never touches the scene
  R3D.debug = () => ({ tier, tAvg, workAvg, upWait, fixed: tierFixed, info: renderer ? renderer.info : null, cam: camera ? camera.st : null, players: R3D.Player && R3D.Player.stats ? R3D.Player.stats() : null });
  R3D.scene = () => scene;
  R3D.drawnBall = () => (ball && ball.drawn) || null;
  // The goal pause of a match is long enough for a replay. The 3D view shows the celebration instead, but the pause can be
  // cut short in the same window as on the 2D view (render.js replayState: from 1.25 s after the goal until 0.1 s before
  // the end). A pure function of the sim's clocks; the caller decides whether skipping is allowed at all (never online).
  R3D.inReplay = (G) => {
    if (!G || !G.replay || G.phase !== 'goal') return false;
    const sp = ISO.C.SPEED, e = (G.goalDur - G.phaseT) / sp;
    return e >= 1.25 && e <= G.goalDur / sp - 0.1;
  };
  // the 2D overlays' view of the replay (render.js overlays: the GOAL banner steps aside while it is on screen): { mix } or null
  R3D.replayView = () => { if (!REP.rs) return null; REP.view = REP.view || { mix: 1 }; REP.view.mix = 1 - Math.min(1, REP.black); return REP.view; };
  R3D.ready = false;
})();
