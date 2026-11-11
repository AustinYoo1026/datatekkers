/* ISO FOOTBALL 3D — effects: floating event texts projected onto the 2D overlay, burst particles, the aim reticle and a shot trail. */
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
    let head = 0; const tmp = new THREE.Color(), pp = { x: 0, y: 0 };

    function burst(x, y, z, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const j = head; head = (head + 1) % N;
        pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
        const a = Math.random() * 6.283, up = 0.4 + Math.random() * 0.9, sp = speed * (0.4 + Math.random() * 0.6);
        vel[j * 3] = Math.cos(a) * sp; vel[j * 3 + 1] = up * speed; vel[j * 3 + 2] = Math.sin(a) * sp; life[j] = 0.5 + Math.random() * 0.6;
        tmp.set(colors[i % colors.length]); col[j * 3] = tmp.r; col[j * 3 + 1] = tmp.g; col[j * 3 + 2] = tmp.b;
      }
    }
    function text(str, x, y, z, color, big) { texts.push({ str, x, y, z, color: color || '#fff', life: 1.1, max: 1.1, big }); }

    // sim events -> world effects (G gives the entity positions; events carry entity objects)
    function onEvent(G, e) {
      const b = G.ball, bw = K.toWorld(b.x, b.y, b.z), P = e.p && K.toWorld(e.p.x, e.p.y, 0), Kp = e.k && K.toWorld(e.k.x, e.k.y, 0);
      const tc = (p) => TEAM_COL[p.team] || '#fff';
      switch (e.type) {
        case 'kick': if (e.shot) burst(bw.x, 0.1, bw.z, ['#e9f7ee', '#bfe8cb'], 8, 2.5); break;
        case 'post': burst(bw.x, bw.y, bw.z, ['#ffffff'], 10, 3); text('WOODWORK!', bw.x, bw.y + 0.8, bw.z, '#fff'); break;
        case 'goal': burst(bw.x, bw.y, bw.z, ['#ffffff', '#35e08a'], 40, 6); text('GOAL!', 0, 3.4, 1, '#35e08a', true); break;
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
        case 'clear': text('CLEARED', bw.x, 1.6, bw.z, TEAM_COL[e.team] || '#fff'); break;
        case 'bump': if (P) text('SHOULDER', P.x, 2.4, P.z, tc(e.p)); break;
      }
    }

    function update(dt) {
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
        camera.project(t.x, t.y + (1 - t.life / t.max) * 0.8, t.z, pp);
        if (!pp.visible) continue;
        const k = t.life / t.max, a = Math.min(1, k * 3), s = (t.big ? 30 : 20) * (1 + (1 - Math.min(1, (t.max - t.life) * 8)) * 0.4);
        c.globalAlpha = a; c.font = '800 italic ' + s + 'px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif';
        c.lineWidth = 5; c.strokeStyle = 'rgba(6,10,14,.85)'; c.strokeText(t.str, pp.x, pp.y); c.fillStyle = t.color; c.fillText(t.str, pp.x, pp.y);
      }
      c.globalAlpha = 1;
      if (V && V.aim && G.phase === 'play') {                       // mouse aim reticle with a guide from the player
        const p = G.players[V.me || 0], pw = K.toWorld(p.x, p.y, 0), live = !!p.charge;
        camera.project(pw.x, 0.3, pw.z, pp);
        c.strokeStyle = live ? 'rgba(241,115,95,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = live ? 2 : 1.2; c.setLineDash([6, 6]);
        c.beginPath(); c.moveTo(pp.x, pp.y); c.lineTo(V.aim.x, V.aim.y); c.stroke(); c.setLineDash([]);
        c.strokeStyle = live ? '#f1735f' : 'rgba(255,255,255,.85)'; c.lineWidth = 2;
        c.beginPath(); c.arc(V.aim.x, V.aim.y, 9, 0, 6.283); c.stroke();
        c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(V.aim.x + dx * 5, V.aim.y + dy * 5); c.lineTo(V.aim.x + dx * 14, V.aim.y + dy * 14); } c.stroke();
      }
      c.restore();
    }
    function reset() { texts.length = 0; life.fill(0); }
    return { onEvent, update, draw2d, burst, reset };
  }
  R3D.Fx = { create };
})();
