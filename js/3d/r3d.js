/* ISO FOOTBALL 3D — facade. Lazily loads Three.js, owns the renderer/scene, and per frame turns the live sim (the single source of
   truth, untouched) into a ViewFrame that the stadium, players, animator, ball, camera and effects consume.
   Every helper module is optional at runtime: a missing or failing one is replaced by a simple stand-in rather than breaking the game. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = (ISO.R3D = ISO.R3D || {}), K = R3D.K;
  const TEAM_COL = ['#4da3ff', '#ff6b5e'];
  let THREE = null, renderer = null, scene = null, canvas = null, loading = null;
  let stadium = null, ball = null, fx = null, camera = null, sun = null, ring = null, rings = [], ringGeo = null;
  let actors = [], keeperActor = null, keeperMine = null, pending = null, built = false, lastBall = null, castSig = null;
  const bad = {};                  // modules disabled after throwing
  let hemi = null, fxOn = false;
  let pixelRatio = 1, tier = 0, tAvg = 16, tLow = 0, tHigh = 0, time = 0;

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
        scene = new THREE.Scene();
        camera = R3D.Camera.create(THREE);
        fx = R3D.Fx.create(THREE, scene);
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

  function build() {
    const { G, V, info } = pending;
    clearScene();
    built = false;
    const R = ISO.Render, theme = R.theme(), mapId = R.mapId();
    const quality = tier;
    stadium = (R3D.Stadium && guard('stadium', () => R3D.Stadium.build(THREE, theme, K, { walls: !!G.walls, quality, mapId }))) || fallbackStadium(theme);
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
    fx.reset(); camera.reset(); R3D.Adapter.reset(G); lastBall = null;
    built = true;       // only once everything above succeeded
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
    if (stadium && (e.type === 'goal')) guard('stadium', () => stadium.netHit(R3D.Adapter.vf.ball.x, R3D.Adapter.vf.ball.y, R3D.Adapter.vf.ball.z, 12));
  }

  // ------------------------------------------------------------------ frame
  function adaptTier(dt) {
    tAvg += (dt * 1000 - tAvg) * 0.05;
    if (tAvg > 19) { tLow += dt; tHigh = 0; } else if (tAvg < 14) { tHigh += dt; tLow = 0; } else { tLow = tHigh = 0; }
    if (tLow > 2 && tier < 2) { tier++; applyTier(); tLow = 0; } else if (tHigh > 10 && tier > 0) { tier--; applyTier(); tHigh = 0; }
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
    time += dt;
    const vf = R3D.Adapter.snapshot(G, V);
    // a sudden ball jump (kick-off / new rep) resets the ball's visual state
    if (lastBall && (Math.abs(vf.ball.x - lastBall.x) + Math.abs(vf.ball.z - lastBall.z)) > 3 && ball && ball.reset) guard('ball', () => ball.reset());
    lastBall = lastBall || {}; lastBall.x = vf.ball.x; lastBall.z = vf.ball.z;
    // the ball first: the animator reaches the feet and hands to the ball as it is DRAWN (bv), not to the raw sim position
    if (ball) guard('ball', () => ball.update(vf, dt));
    const bv = drawnBall(vf);
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i], pv = vf.players[i];
      if (a.anim) guard('anim', () => a.anim.update(pv, dt, bv)); else if (a.group) { a.group.visible = !pv.hidden; a.group.position.set(pv.x, 0, pv.z); a.group.rotation.y = pv.yaw; }
    }
    {
      // in the shootout the keeper on the pitch is you (your kit) while they shoot, theirs while you shoot
      const ka = keeperMine && vf.keeper.human ? keeperMine : keeperActor, kb = ka === keeperMine ? keeperActor : keeperMine;
      if (kb) kb.group.visible = false;
      if (ka) { if (ka.anim) guard('anim', () => ka.anim.update(vf.keeper, dt, bv)); else { ka.group.position.set(vf.keeper.x, 0, vf.keeper.z); ka.group.rotation.y = vf.keeper.yaw; } }
    }
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], pv = vf.players[i];
      r.visible = !!pv && !pv.hidden; if (!pv) continue;
      r.position.set(pv.x, 0.025, pv.z); r.material.opacity = pv.owner ? 0.95 : 0.5;
    }
    if (ring) { const me = vf.players[vf.me]; ring.visible = !!me && !me.hidden && G.phase !== 'end'; if (me) { ring.position.set(me.x, 0.03, me.z); ring.material.color.set(TEAM_COL[me.team % 2]); } }
    camera.update(vf, dt, time, bv);
    // the clear cue belongs to the team of the screen: the box outline glows while that team has to clear
    fxOn = G.phase === 'play' && vf.mustClear >= 0 && vf.mustClear === vf.myTeam; fx.setClear(fxOn, vf.myTeam);
    if (stadium && stadium.setTargets) guard('stadium', () => (G.drill && G.drill.kind === 'target' ? stadium.setTargets(ISO.TARGETS, G.drill.target) : stadium.setTargets(null)));
    if (stadium) guard('stadium', () => { stadium.update(dt, time); if (stadium.setView) stadium.setView(camera.cam.position.z); });
    fx.update(dt);
    renderer.render(scene, camera.cam);
    adaptTier(dt);
    if (c2d) fx.draw2d(c2d, camera, G, V);
  }

  R3D.ensure = ensure; R3D.resize = resize; R3D.onMatch = onMatch; R3D.onEvent = onEvent; R3D.render = render;
  R3D.mapInput = (k) => (camera ? camera.mapInput(k) : { ...k, mx: -k.my, my: k.mx });
  R3D.unproject = (x, y) => (camera ? camera.unproject(x, y) : null);
  R3D.onView = onView;
  R3D.project = (x, y, z, out) => (camera ? camera.project(x, y, z, out) : null);      // world point -> 1280 x 720 screen px (tools / tests)
  R3D.camState = () => (camera ? camera.st : null);
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
  R3D.ready = false;
})();
