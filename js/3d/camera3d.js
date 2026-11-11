/* ISO FOOTBALL 3D — chase camera: behind and above the controlled player, goal-anchored yaw (capped at 19 deg so the sim's
   auto-aim thresholds still hold), no roll, no head-bob, frame-rate independent smoothing, shot/pass tracking. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  const MAXYAW = 0.33;

  function create(THREE) {
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 400);
    const st = { ax: 0, az: 8, yaw: 0, D: 8, H: 3.4, fov: 50, tx: 0, ty: 0, tz: 0, lookBlend: 0, mode: 'follow', modeT: 0, shake: 0, inputYaw: 0,
      sx: 0, sz: 0, cutT: 0, goalT: 0, goalYaw: 0, kickoff: 1, trackT: 0, init: false, held: false };
    const v3 = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let subject = { x: 0, z: 10 };

    function reset() { st.init = false; st.mode = 'follow'; st.kickoff = 1; st.lookBlend = 0; st.shake = 0; st.goalT = 0; st.cutT = 0; }

    function onEvent(e, vf) {
      if (e.type === 'kick' && e.shot) { st.mode = 'shot'; st.modeT = 0; st.trackT = 0; }
      else if (e.type === 'kick' && e.p) { if (st.mode === 'follow') { st.mode = 'pass'; st.modeT = 0; } }
      else if (e.type === 'post') st.shake = Math.max(st.shake, 0.06 * (e.power || 0.5) * 2);
      else if (e.type === 'save') st.shake = Math.max(st.shake, 0.04);
      else if (e.type === 'goal') { st.shake = 0.12; st.mode = 'goal'; st.modeT = 0; }
      else if ((e.type === 'out' || e.type === 'clear') && st.mode !== 'goal') st.modeT = Math.max(st.modeT, 99);
    }

    function update(vf, dt, time) {
      dt = Math.min(dt, 0.05);
      const me = vf.players[vf.me] || vf.players[0];
      const b = vf.ball;
      const own = vf.players[b.owner];
      const subj = me && !me.hidden ? me : own || { x: b.x, z: b.z, vx: 0, vz: 0, speed: 0, sprint: false };
      // cut: a teleport (kick-off, new rep) snaps everything instead of sweeping across the pitch
      if (st.init && Math.hypot(subj.x - st.sx, subj.z - st.sz) > 2.4) st.init = false;
      st.sx = subj.x; st.sz = subj.z;
      const fwdx = Math.sin(st.yaw), fwdz = -Math.cos(st.yaw);
      // anchor follow with a little velocity look-ahead
      const lax = clamp(subj.vx * 0.25, -1.5, 1.5), laz = clamp(subj.vz * 0.25, -1.5, 1.5);
      let tx = subj.x + lax, tz = subj.z + laz;
      if (own !== me) { tx += clamp((b.x - subj.x) * 0.35, -3, 3); tz += clamp((b.z - subj.z) * 0.35, -3, 3); }
      // goal-anchored yaw: half the bearing to the goal centre, hard-capped
      let ty = clamp(0.5 * Math.atan2(-subj.x, subj.z + 3), -MAXYAW, MAXYAW);
      let D = 8.0 + (subj.sprint ? 0.8 : 0), H = 3.4, fov = subj.sprint ? 54 : 50;
      if (vf.phase === 'countdown' || vf.phase === 'ready') { st.kickoff = Math.min(1, st.kickoff + dt * 2); } else st.kickoff = Math.max(0, st.kickoff - dt * 1.2);
      D += st.kickoff * 3; H += st.kickoff * 1.6;
      let lookBlendT = 0, lookH = 0.9;
      st.modeT += dt;
      if (st.mode === 'shot') {
        ty = st.yaw; fov = 46; lookBlendT = 0.7;
        if (!b.shot && st.modeT > 0.4) st.mode = 'follow';
        if (st.modeT > 3) st.mode = 'follow';
      } else if (st.mode === 'pass') { lookBlendT = 0.45; if (st.modeT > 0.8) st.mode = 'follow'; }
      else if (st.mode === 'goal') {
        D = 6.5; H = 2.6; ty = clamp(st.yaw + 0.35 * Math.min(1, st.modeT / 1.2), -0.8, 0.8); lookBlendT = 0.5;
        if (vf.phase !== 'goal') st.mode = 'follow';
      } else if (st.mode === 'follow' && st.modeT > 99) st.modeT = 0;
      const snap = !st.init;
      if (snap) { st.ax = tx; st.az = tz; st.yaw = ty; st.D = D; st.H = H; st.fov = fov; st.lookBlend = lookBlendT; st.init = true; st.cutT = 0.15; }
      const kA = damp(st.mode === 'shot' ? 3 : 5.5, dt);
      st.ax += (tx - st.ax) * kA; st.az += (tz - st.az) * kA;
      // yaw: smooth, speed-limited (40 deg/s) so it never whips
      const dy = clamp((ty - st.yaw) * damp(2.5, dt), -0.7 * dt, 0.7 * dt);
      st.yaw += dy;
      st.D += (D - st.D) * damp(3, dt); st.H += (H - st.H) * damp(3, dt); st.fov += (fov - st.fov) * damp(3, dt);
      st.lookBlend += (lookBlendT - st.lookBlend) * damp(6, dt);
      // the held-direction yaw for input mapping only moves while no direction is held (so a held key never arcs)
      const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);
      // camera position: behind the anchor along -forward, above
      let cx = st.ax - fx * st.D, cz = st.az - fz * st.D, cy = st.H;
      cx = clamp(cx, -24, 24); cz = clamp(cz, 2, 30); cy = Math.max(1.2, cy);
      st.shake *= Math.exp(-8 * dt);
      const sh = st.shake, n1 = Math.sin(time * 71), n2 = Math.cos(time * 53);
      cam.position.set(cx + n1 * sh, cy + n2 * sh * 0.7, cz + n2 * sh);
      // look target: ahead of the anchor, blended toward the ball while it matters
      let lx = st.ax + fx * 2.5, lz = st.az + fz * 2.5, ly = 0.9;
      if (st.lookBlend > 0.001) { lx += (b.x - lx) * st.lookBlend; lz += (b.z - lz) * st.lookBlend; ly += (Math.min(b.y, 2.5) + 0.2 - ly) * st.lookBlend; }
      cam.up.set(0, 1, 0);
      cam.lookAt(lx, ly, lz);
      if (Math.abs(cam.fov - st.fov) > 0.01) { cam.fov = st.fov; cam.updateProjectionMatrix(); }
      st.cutT = Math.max(0, st.cutT - dt);
      return st;
    }

    // screen px (1280x720 canvas) -> world point on the goal plane or ground
    function unproject(sx, sy) {
      ndc.set((sx / 1280) * 2 - 1, -(sy / 720) * 2 + 1);
      cam.updateMatrixWorld(); ray.setFromCamera(ndc, cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (d.z < -1e-4) {                                     // looking toward the goal plane (z = 0)
        const t = -o.z / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
        if (t > 0 && Math.abs(x) <= K.goalW / 2 + 0.6 && y >= 0 && y <= K.goalH + 0.9) return { x: K.FW, y: x / K.S + K.GCY };
      }
      if (d.y < -1e-4) { const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t; return K.toSim(x, z, 0); }
      return null;
    }
    function project(wx, wy, wz, out) {
      v3.set(wx, wy, wz).project(cam);
      out = out || {}; out.x = (v3.x * 0.5 + 0.5) * 1280; out.y = (-v3.y * 0.5 + 0.5) * 720; out.visible = v3.z < 1 && v3.z > -1; return out;
    }
    // camera-relative input: pressing up moves toward where the camera looks
    const lastKeys = { fwd: 0, rgt: 0 };
    function mapInput(k) {
      const fwd = -k.my, rgt = k.mx;
      if ((fwd === 0 && rgt === 0) || fwd !== lastKeys.fwd || rgt !== lastKeys.rgt) st.inputYaw = st.yaw;
      lastKeys.fwd = fwd; lastKeys.rgt = rgt;
      const psi = st.inputYaw, c = Math.cos(psi), s = Math.sin(psi);
      // sim forward at yaw psi = (cos psi, sin psi) in (x = depth toward goal, y = across)
      return { ...k, mx: fwd * c - rgt * s, my: fwd * s + rgt * c };
    }
    return { cam, st, reset, update, onEvent, project, unproject, mapInput, get mode() { return st.mode; } };
  }
  R3D.Camera = { create };
})();
