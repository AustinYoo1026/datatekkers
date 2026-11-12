/* ISO FOOTBALL 3D — effects: floating event texts projected onto the 2D overlay, burst particles, the aim reticle, and the
   per-player markers of the 2D view (name tag, shot power meter). The event texts are the 2D view's (render.js onEvent):
   same words, same colours, same 1.1 s life, so two players on different views read the same thing at the same moment. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, S = K.S;
  const TEAM_COL = ['#4da3ff', '#ff6b5e'];

  function create(THREE, scene) {
    const texts = [];
    const N = 220, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; scene.add(pts);
    let head = 0; const tmp = new THREE.Color(), pp = { x: 0, y: 0 }, pw = { x: 0, y: 0, z: 0 };
    const FONT = '"Avenir Next Condensed","Arial Narrow",Arial,sans-serif';

    function burst(x, y, z, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const j = head; head = (head + 1) % N;
        pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
        const a = Math.random() * 6.283, up = 0.4 + Math.random() * 0.9, sp = speed * (0.4 + Math.random() * 0.6);
        vel[j * 3] = Math.cos(a) * sp; vel[j * 3 + 1] = up * speed; vel[j * 3 + 2] = Math.sin(a) * sp; life[j] = 0.5 + Math.random() * 0.6;
        tmp.set(colors[i % colors.length]); col[j * 3] = tmp.r; col[j * 3 + 1] = tmp.g; col[j * 3 + 2] = tmp.b;
      }
    }
    function text(str, x, y, z, color, big, life) { life = life || 1.1; texts.push({ str, x, y, z, color: color || '#fff', life, max: life, big, slot: -1, rise: 0.8 }); }
    // the clear pop-ups: one slot per player, a new message replaces the one showing. Anchored just above the head (rising a little),
    // and dropped to chest height while another event text of that player (the tackle that won the ball) is still showing above it.
    function clearText(str, P, team, color, big, life) {
      const slot = P ? P.idx : 100 + team;
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].slot === slot) texts.splice(i, 1);
      text(str, P ? P.x : 0, 2.0, P ? P.z : 0, color, big, life);
      const t = texts[texts.length - 1]; t.slot = slot; t.rise = 0.25; t.x = P ? P.x : bwX; t.z = P ? P.z : bwZ;
    }
    let bwX = 0, bwZ = 0;

    // sim events -> world effects (G gives the entity positions; events carry entity objects)
    function onEvent(G, e) {
      const b = G.ball, bw = K.toWorld(b.x, b.y, b.z), P = e.p && K.toWorld(e.p.x, e.p.y, 0), Kp = e.k && K.toWorld(e.k.x, e.k.y, 0);
      const tc = (p) => TEAM_COL[p.team] || '#fff';
      switch (e.type) {
        case 'kick': if (e.shot) burst(bw.x, 0.1, bw.z, ['#e9f7ee', '#bfe8cb'], 8, 2.5); break;
        case 'board': burst(bw.x, 0.15, bw.z, ['#d9d3c2'], 4, 0.8); break;      // the back board: a puff of dust, no text
        case 'post': burst(bw.x, bw.y, bw.z, ['#ffffff'], 10, 3); text('WOODWORK!', bw.x, bw.y + 0.8, bw.z, '#fff'); break;
        case 'goal': burst(bw.x, bw.y, bw.z, ['#ffffff', '#35e08a'], 40, 6); break;      // the GOAL! banner is the shared overlay (render.js overlays)
        case 'save': { const s = K.toWorld(G.keeper.x, G.keeper.y, 0); burst(bw.x, bw.y, bw.z, ['#ffffff', '#ffe066'], 10, 3); text(e.slide ? 'SLID IN' : e.smother ? 'SMOTHERED' : e.weak ? 'SPILLED!' : e.catch ? 'CAUGHT!' : 'SAVE!', s.x, 2.6, s.z, '#ffe066'); break; }
        case 'tackle': burst(bw.x, 0.1, bw.z, ['#8bd45e', '#5aa02f'], 8, 2.2); if (e.on && P) text('TACKLE', P.x, 2.4, P.z, tc(e.p)); break;
        case 'lunge': if (e.slide && P) burst(P.x, 0.1, P.z, ['#8bd45e', '#5aa02f'], 12, 2); break;
        case 'beaten': if (P) text('BEATEN', P.x, 2.4, P.z, '#ff8a8a'); break;
        case 'skill': if (P) text(String(e.name).toUpperCase(), P.x, 2.5, P.z, '#ffffff'); break;
        case 'fake': if (P) text('FAKE SHOT', P.x, 2.5, P.z, '#ffffff'); break;
        case 'ankles': { const o = K.toWorld(e.on.x, e.on.y, 0); burst(o.x, 0.2, o.z, ['#ffffff', '#ffe066'], 12, 2.5); text('ANKLES BROKEN!', o.x, 2.5, o.z, '#ffe066', true); break; }
        case 'botch': if (P) text('HEAVY TOUCH', P.x, 2.5, P.z, '#ff8a8a'); break;
        case 'steal': if (P) text('NICKED', P.x, 2.4, P.z, tc(e.p)); break;
        case 'block': burst(bw.x, bw.y, bw.z, ['#ffffff'], 6, 2); if (P) text('BLOCK', P.x, 2.4, P.z, tc(e.p)); break;
        // the clear pop-ups are shown only on the screen of the team concerned, at the player
        case 'clearit': if (P && e.team === clearFx.team) { P.idx = G.players.indexOf(e.p); clearText('CLEAR IT', P, e.team, '#ffe066', true, 0.8); } break;
        case 'clearfirst': if (P && e.team === clearFx.team) { P.idx = G.players.indexOf(e.p); clearText('CLEAR IT FIRST', P, e.team, '#ffe066', true, 0.8); } break;
        case 'clear': if (e.team === clearFx.team) { if (P) P.idx = G.players.indexOf(e.p); else { bwX = bw.x; bwZ = bw.z; } clearText('CLEARED', P, e.team, 'rgba(210,225,215,.9)', false, 0.6); } break;
        case 'bump': if (P) text('SHOULDER', P.x, 2.4, P.z, tc(e.p)); break;
      }
    }

    // ---- the clear cue: the outline of the penalty box (the line the ball has to cross) glows and flutters on the screen of the
    // team that has to clear, and flashes once when it does. A flat ribbon just above the turf along the box's three open
    // sides: a gold glow (pulse + a shimmer travelling along it + a fast flutter) over a soft dark under-stroke (normal blending, so
    // it reads on the white markings and pale floors alike).
    const clearFx = (() => {
      const bd = K.boxD, bh = K.boxHalf, W = 0.7, STEP = 0.25;      // W: ribbon width; the bright core is 0.15 m, the pitch markings' own width
      const path = [[-bh, 0], [-bh, bd], [bh, bd], [bh, 0]], pts = [];
      let len = 0;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / STEP));
        const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
        for (let j = i ? 1 : 0; j <= n; j++) pts.push({ x: a[0] + dx * l * j / n, z: a[1] + dz * l * j / n, s: len + l * j / n, dx, dz });
        len += l;
      }
      // mitred normals: the corner points use the average of the two segments' directions
      const P = [], A = [], X = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[i + 1] || p, r = pts[i - 1] || p;
        let tx = (q.x - r.x) || 0, tz = (q.z - r.z) || 0; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = -tz, nz = tx, dot = Math.max(0.5, Math.abs(nx * -p.dz + nz * p.dx));
        for (const sd of [-1, 1]) { P.push(p.x + nx * sd * W / 2 / dot, 0, p.z + nz * sd * W / 2 / dot); A.push(sd); X.push(p.s); }
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aAcross', new THREE.Float32BufferAttribute(A, 1));
      g.setAttribute('aAlong', new THREE.Float32BufferAttribute(X, 1)); g.setIndex(idx);
      const vert = 'attribute float aAcross; attribute float aAlong; varying float vA; varying float vS; void main() { vA = aAcross; vS = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
      const common = 'uniform float uT; uniform float uShow; uniform float uFlash; varying float vA; varying float vS;';
      const glowF = common + `void main() {
        float aa = abs(vA), core = 1.0 - smoothstep(0.17, 0.25, aa), halo = pow(1.0 - aa, 1.6) * 0.55;
        float pulse = 0.55 + 0.45 * sin(uT * 5.0);
        float shim = pow(0.5 + 0.5 * sin(vS * 1.35 - uT * 8.0), 3.0);
        float flick = 0.88 + 0.12 * sin(uT * 37.0 + vS * 2.3) * sin(uT * 11.0 - vS * 0.7);
        float a = ((pulse * 0.85 + shim * 0.9) * (core * 0.8 + halo) * flick * uShow * 0.75 + uFlash * (core + halo * 1.5));
        vec3 col = mix(vec3(1.0, 0.8, 0.22), vec3(1.0, 0.97, 0.85), clamp(uFlash + shim * 0.4, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0)); }`;
      const darkF = common + 'void main() { float w = 1.0 - smoothstep(0.3, 1.0, abs(vA)); gl_FragColor = vec4(0.02, 0.03, 0.06, w * (0.22 * uShow + 0.15 * uFlash)); }';
      const U = { uT: { value: 0 }, uShow: { value: 0 }, uFlash: { value: 0 } };
      const mk = (frag, additive, order, y) => {
        const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.position.y = y; m.renderOrder = order; m.frustumCulled = false; m.visible = false; scene.add(m); return m;
      };
      const meshes = [mk(darkF, false, 4, 0.03), mk(glowF, false, 5, 0.034)];
      return { U, meshes, show: 0, flash: 0, on: false, team: -1, t: 0 };
    })();
    function setClear(on, team) { clearFx.on = !!on; clearFx.team = team; }
    function flashClear() { clearFx.flash = 1; }
    function updateClear(dt) {
      const c = clearFx; c.t += dt;
      c.show += ((c.on ? 1 : 0) - c.show) * (1 - Math.exp(-(c.on ? 10 : 6) * dt)); if (!c.on && c.show < 0.01) c.show = 0;
      c.flash = Math.max(0, c.flash - dt * 1.6);
      c.U.uT.value = c.t; c.U.uShow.value = c.show; c.U.uFlash.value = c.flash * c.flash;
      const vis = c.show > 0 || c.flash > 0; for (const m of c.meshes) m.visible = vis;
    }

    function update(dt) {
      updateClear(dt);
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; }
        life[i] -= dt; vel[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.03) { pos[i * 3 + 1] = 0.03; vel[i * 3 + 1] *= -0.3; }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      for (let i = texts.length - 1; i >= 0; i--) { texts[i].life -= dt; if (texts[i].life <= 0) texts.splice(i, 1); }
    }

    function draw2d(c, camera, G, V) {
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const t of texts) {
        let ty = t.y;
        if (t.slot !== -1 || t.rise < 0.8) { for (const o of texts) if (o.slot === -1 && o.max - o.life < 0.9 && Math.hypot(o.x - t.x, o.z - t.z) < 1.4) { ty = 1.25; break; } }
        camera.project(t.x, ty + (1 - t.life / t.max) * t.rise, t.z, pp);
        if (!pp.visible) continue;
        const k = t.life / t.max, a = Math.min(1, k * 3), s = (t.big ? 30 : 20) * (1 + (1 - Math.min(1, (t.max - t.life) * 8)) * 0.4);
        c.globalAlpha = a; c.font = '800 italic ' + s + 'px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
        c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(t.str, pp.x, pp.y); c.fillStyle = t.color; c.fillText(t.str, pp.x, pp.y);
      }
      c.globalAlpha = 1;
      const so = G.drill && G.drill.so;
      // the shootout: the taker stands between the camera and the keeper, so his tag would land on the keeper. No tag for the
      // taker; when you keep, the keeper (you) is the one tagged
      if (so && so.turn !== 'shoot') {
        const kp = G.keeper; K.toWorld(kp.x, kp.y, 0, pw); camera.project(pw.x, 2.2, pw.z, pp);
        if (pp.visible) {
          c.fillStyle = TEAM_COL[0]; c.beginPath(); c.moveTo(pp.x - 6, pp.y - 7); c.lineTo(pp.x + 6, pp.y - 7); c.lineTo(pp.x, pp.y); c.closePath(); c.fill();
          c.font = '800 13px ' + FONT; c.textBaseline = 'bottom'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)';
          const lb = (V && V.labels && V.labels[0]) || 'YOU'; c.strokeText(lb, pp.x, pp.y - 8); c.fillText(lb, pp.x, pp.y - 8);
        }
      }
      // every player as the 2D view marks them: name tag and arrow in the team colour, the shot power meter, TIRED
      for (let i = 0; i < G.players.length; i++) {
        const p = G.players[i], label = so ? '' : V && V.labels && V.labels[i];
        if (p.state === 'away') continue;
        K.toWorld(p.x, p.y, 0, pw);
        if (label) {
          camera.project(pw.x, 1.86 * ((p.def.look && p.def.look.h) || 1) + 0.1, pw.z, pp);
          if (pp.visible) {
            c.fillStyle = TEAM_COL[p.team % 2];
            c.beginPath(); c.moveTo(pp.x - 6, pp.y - 7); c.lineTo(pp.x + 6, pp.y - 7); c.lineTo(pp.x, pp.y); c.closePath(); c.fill();
            c.font = '800 13px ' + FONT; c.textBaseline = 'bottom'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)';
            c.strokeText(label, pp.x, pp.y - 8); c.fillText(label, pp.x, pp.y - 8);
          }
        }
        if (!p.charge && !p.exhausted) continue;
        camera.project(pw.x, 0, pw.z, pp);
        if (!pp.visible) continue;
        c.textBaseline = 'top'; c.font = '800 10px Arial';
        if (p.charge) {
          const cg = ISO.C.CHG[p.charge.type] || ISO.C.CHG.normal, w = 48, x = pp.x - w / 2, y = so ? Math.min(pp.y + 10, 632) : pp.y + 10;      // (shootout: kept clear of the hint line)
          const f = p.charge.ft ? Math.min(1, 0.5 + p.charge.t * 0.5) : Math.max(0.3, Math.min(1, p.charge.t / cg.full)), cooked = !p.charge.ft && p.charge.t > cg.over;
          c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x - 1.5, y - 1.5, w + 3, 9);
          c.fillStyle = cooked ? '#ff4d4d' : f > 0.95 ? '#ffb23d' : '#35e08a'; c.fillRect(x, y, w * f, 6);
          c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x + w * 0.78, y - 1.5, 1.4, 9);
          c.fillStyle = '#fff'; c.fillText(p.charge.ft ? 'FIRST TIME' : cooked ? 'TOO LONG!' : p.charge.type === 'normal' ? '' : p.charge.type === 'chip' ? 'CHIP' : p.charge.type.toUpperCase(), pp.x, y + 10);
        } else { c.fillStyle = '#ff6b6b'; c.fillText('TIRED', pp.x, pp.y + 10); }
      }
      c.textBaseline = 'middle';
      if (V && V.canSkip && R3D.inReplay && R3D.inReplay(G) && ISO.Input) {      // the goal pause can be ended early, as the replay can on the 2D view
        c.textAlign = 'right'; c.font = '800 20px ' + FONT; c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)';
        const t = ISO.Input.keyLabel('shoot').toUpperCase() + ' TO SKIP';
        c.strokeText(t, 1280 - 86, 720 - 80); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillText(t, 1280 - 86, 720 - 80);
        c.textAlign = 'center';
      }
      if (so && so.turn === 'shoot' && !V.aim && G.phase !== 'end' && ISO.Input && ISO.Input.get) {
        // aiming with the keys: where the shot will go (the sim sends it to the post on the held side, else the open side, away from the keeper)
        const k = ISO.Input.get('solo', V.me || 0), C = ISO.C, d = k.mx < -0.35 ? C.GY0 + 18 : k.mx > 0.35 ? C.GY1 - 18 : G.keeper.y > K.GCY ? C.GY0 + 34 : C.GY1 - 34;
        camera.project((d - K.GCY) * S, 1.0, 0, pp);
        if (pp.visible) {
          const held = Math.abs(k.mx) > 0.35;
          c.strokeStyle = held ? '#ffe066' : 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(pp.x, pp.y, 11, 0, 6.283); c.stroke();
          c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(pp.x + dx * 6, pp.y + dy * 6); c.lineTo(pp.x + dx * 16, pp.y + dy * 16); } c.stroke();
        }
      }
      if (V && V.aim && G.phase === 'play' && !(G.drill && G.drill.so && G.drill.so.turn !== 'shoot')) {                       // mouse aim reticle with a guide from the player
        const p = G.players[V.me || 0], live = !!p.charge;
        K.toWorld(p.x, p.y, 0, pw);
        camera.project(pw.x, 0.3, pw.z, pp);
        c.strokeStyle = live ? 'rgba(241,115,95,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = live ? 2 : 1.2; c.setLineDash([6, 6]);
        c.beginPath(); c.moveTo(pp.x, pp.y); c.lineTo(V.aim.x, V.aim.y); c.stroke(); c.setLineDash([]);
        c.strokeStyle = live ? '#f1735f' : 'rgba(255,255,255,.85)'; c.lineWidth = 2;
        c.beginPath(); c.arc(V.aim.x, V.aim.y, 9, 0, 6.283); c.stroke();
        c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(V.aim.x + dx * 5, V.aim.y + dy * 5); c.lineTo(V.aim.x + dx * 14, V.aim.y + dy * 14); } c.stroke();
      }
      c.restore();
    }
    function reset() { texts.length = 0; life.fill(0); clearFx.show = 0; clearFx.flash = 0; clearFx.on = false; for (const m of clearFx.meshes) m.visible = false; }
    function dispose() { for (const m of clearFx.meshes) { scene.remove(m); m.material.dispose(); } clearFx.meshes[0].geometry.dispose(); scene.remove(pts); geo.dispose(); pts.material.dispose(); }
    return { onEvent, update, draw2d, burst, reset, setClear, flashClear, dispose };
  }
  R3D.Fx = { create };
})();
