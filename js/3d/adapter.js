/* ISO FOOTBALL 3D — adapter: turns the live sim state (G) into a plain ViewFrame in metres/radians, and latches sim events
   (kicks, saves, ...) that the animator, camera and ball need. Everything the other 3D modules consume comes from here. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, C = ISO.C, S = K.S;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mkPlayer = () => ({ idx: 0, team: 0, hidden: false, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, jog: 0, top: 0, runPh: 0,
    state: 'free', u: 0, stT: 0, stDur: 0, kickT: 0, kick: null, charge: null, skill: null, fakeU: 0, fakeSide: 1, fallYaw: 0,
    owner: false, sprint: false, jock: false, shield: false, focus: false, exhausted: false, wall: false, ballSide: 0 });
  const mkKeeper = () => ({ x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, state: 'set', u: 0, diveDir: 1, high: false, slid: false, chip: false,
    holding: false, human: false, save: null, animDist: 0 });
  const vf = { t: 0, phase: 'play', me: 0, attacker: 0, slowmo: false, players: [], keeper: mkKeeper(),
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: -1, held: false, inNet: false, shot: null, rot: 0 } };

  // latched presentation state, resolved to indices immediately (events carry entity objects that must not be kept)
  const latch = { kick: [], save: null, throwAt: -9, holdPrev: false, lastGoalBy: -1 };
  function reset(G) {
    vf.players.length = 0;
    for (let i = 0; i < G.players.length; i++) { vf.players.push(mkPlayer()); latch.kick[i] = null; }
    latch.save = null; latch.holdPrev = false;
  }

  function onEvent(G, e) {
    if (e.type === 'kick' && e.p) {
      const i = G.players.indexOf(e.p), b = G.ball, p = e.p;
      if (i < 0) return;
      // which side of the body was the ball on at the strike? decides the kicking foot (ball lateral offset in the player's frame)
      const lat = -(b.x - p.x) * Math.sin(p.face) + (b.y - p.y) * Math.cos(p.face);
      let foot = p.def.foot === 'L' || p.def.foot === 'left' ? -1 : 1;
      if (Math.abs(lat * S) > 0.15) foot = lat > 0 ? 1 : -1;
      latch.kick[i] = { type: e.shot || null, foot, high: b.z >= 20, z: b.z, cross: !!(e.shot === 'chip' && (p.y < C.BOXY0 || p.y > C.BOXY1)) };
    } else if (e.type === 'kick') latch.throwAt = G.t;
    else if (e.type === 'save') latch.save = { kind: e.catch ? 'catch' : e.smother ? 'smother' : e.weak ? 'weak' : e.slide ? 'slide' : 'parry', at: G.t };
    else if (e.type === 'goal') { const lg = G.goals[G.goals.length - 1]; latch.lastGoalBy = lg && lg.by != null ? lg.by : -1; }
  }

  function snapshot(G, V) {
    if (vf.players.length !== G.players.length) reset(G);
    vf.t = G.t; vf.phase = G.phase; vf.me = (V && V.me) || 0; vf.attacker = G.attacker; vf.slowmo = false;
    const b = G.ball, B = vf.ball;
    B.x = (b.y - K.GCY) * S; B.z = (C.FW - b.x) * S; B.y = Math.max(0, b.z) * S;
    B.vx = b.vy * S; B.vz = -b.vx * S; B.vy = b.vz * S; B.spin = b.spin || 0; B.rot = b.rot || 0;
    B.owner = b.owner ? G.players.indexOf(b.owner) : -1; B.held = !!b.holder; B.inNet = b.inNet !== null && b.inNet !== undefined; B.shot = b.shot ? b.shot.type || 'normal' : null;
    for (let i = 0; i < G.players.length; i++) {
      const p = G.players[i], o = vf.players[i];
      o.idx = i; o.team = p.team; o.hidden = p.state === 'away';
      o.x = (p.y - K.GCY) * S; o.z = (C.FW - p.x) * S; o.yaw = Math.PI - p.face;
      o.vx = p.vy * S; o.vz = -p.vx * S; o.speed = Math.hypot(p.vx, p.vy) * S; o.jog = p.jog * S; o.top = p.top * S; o.runPh = p.runPh;
      o.state = p.state; o.stT = p.stT; o.stDur = p.stDur; o.u = p.stDur > 0 ? clamp(p.stT / p.stDur, 0, 1) : 0;
      o.kickT = p.kickT;
      let k = latch.kick[i];
      if (k && p.kickT <= 0) { latch.kick[i] = k = null; }
      o.kick = k;
      if (p.charge) { const cg = C.CHG[p.charge.type] || C.CHG.normal; o.charge = o.charge || { type: 'normal', f: 0, ft: false }; o.charge.type = p.charge.type; o.charge.f = clamp(p.charge.t / cg.full, 0, 1.3); o.charge.ft = !!p.charge.ft; }
      else o.charge = null;
      if (p.skill) { const s = o.skill = o.skill || { id: '', u: 0, sd: 1, lean: 0 }; s.id = p.skill.id; s.u = clamp(p.skill.t / (p.skill.dur || 1), 0, 1); s.sd = p.skill.sd; s.lean = p.skill.lean || 0; }
      else o.skill = null;
      o.fakeU = p.fakeT > 0 ? 1 - clamp(p.fakeT / C.FAKE_T, 0, 1) : 0; o.fakeSide = p.fakeDrag >= 0 ? 1 : -1;
      o.fallYaw = Math.PI - (p.fallDir !== undefined ? p.fallDir : p.face + Math.PI);
      o.owner = B.owner === i; o.sprint = !!p.sprinting; o.jock = !!p.jock; o.shield = !!p.shield; o.focus = !!p.focus; o.exhausted = !!p.exhausted;
      o.wall = p.noCtrl > 50; o.ballSide = p.ballSd || 0;
    }
    const kp = G.keeper, kv = vf.keeper;
    kv.x = (kp.y - K.GCY) * S; kv.z = (C.FW - kp.x) * S; kv.yaw = Math.PI - kp.face; kv.vx = kp.vy * S; kv.vz = -kp.vx * S; kv.speed = Math.hypot(kp.vx, kp.vy) * S;
    kv.state = kp.state; kv.diveDir = kp.diveDir || 1; kv.high = !!kp.high; kv.slid = !!kp.slid; kv.chip = !!kp.chip; kv.animDist = kp.animDist || 0;
    kv.u = kp.state === 'dive' ? clamp(kp.stT / (kp.diveT || kp.stDur || 0.42), 0, 1) : kp.stDur > 0 ? clamp(kp.stT / kp.stDur, 0, 1) : 0;
    kv.holding = kp.state === 'hold'; kv.human = false;
    const sv = latch.save;
    if (sv && G.t - sv.at < 0.5) { kv.save = kv.save || { kind: '', age: 0 }; kv.save.kind = sv.kind; kv.save.age = G.t - sv.at; } else kv.save = null;
    if (latch.holdPrev && !kv.holding && G.t - latch.throwAt < 0.2) kv.save = { kind: 'throw', age: G.t - latch.throwAt };
    latch.holdPrev = kv.holding;
    return vf;
  }

  R3D.Adapter = { snapshot, onEvent, reset, vf };
})();
