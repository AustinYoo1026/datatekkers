/* ISO FOOTBALL 3D — adapter: turns the live sim state (G) into a plain ViewFrame in metres/radians, and latches sim events
   (kicks, saves, ...) that the animator, camera and ball need. Everything the other 3D modules consume comes from here. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, R3D = ISO.R3D, K = R3D.K, C = ISO.C, S = K.S;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mkPlayer = () => ({ stride: 1, idx: 0, team: 0, hidden: false, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, jog: 0, top: 0, runPh: 0,
    state: 'free', u: 0, stT: 0, stDur: 0, kickT: 0, kick: null, charge: null, skill: null, fakeU: 0, fakeSide: 1, fallYaw: 0,
    owner: false, close: false, stopT: 0, sprint: false, jock: false, shield: false, focus: false, exhausted: false, wall: false, ballSide: 0, sim: null });
  const mkKeeper = () => ({ x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, state: 'set', u: 0, diveDir: 1, high: false, slid: false, chip: false,
    holding: false, human: false, save: null, animDist: 0, jump: false, sim: null });
  const vf = { t: 0, phase: 'play', goalBy: -1, winner: -1, drill: null, me: 0, attacker: 0, slowmo: false, walls: false, pen: null, mustClear: -1, myTeam: 0, players: [], keeper: mkKeeper(),
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: -1, held: false, inNet: false, shot: null, rot: 0 } };

  // latched presentation state, resolved to indices immediately (events carry entity objects that must not be kept)
  const liveLatch = { lastOwner: -1, kick: [], save: null, throwAt: -9, holdPrev: false, lastGoalBy: -1 };
  const repLatch = { lastOwner: -1, kick: [], save: null, throwAt: -9, holdPrev: false, lastGoalBy: -1 };      // the goal replay's own copy: tape frames carry the live latches, the replay never touches liveLatch
  let latch = liveLatch;
  function reset(G) {
    vf.players.length = 0;
    for (let i = 0; i < G.players.length; i++) { vf.players.push(mkPlayer()); latch.kick[i] = null; }
    clear();
  }
  // forget the latched events (new match, or the 3D view comes back after the 2D one was showing: what it latched is stale)
  function clear() {
    for (let i = 0; i < latch.kick.length; i++) latch.kick[i] = null;
    latch.save = null; latch.holdPrev = false; latch.throwAt = -9; latch.lastGoalBy = -1;
  }

  function onEvent(G, e) {
    if (e.type === 'kick' && e.p) {
      const i = G.players.indexOf(e.p), b = G.ball, p = e.p;
      if (i < 0) return;
      // which side of the body was the ball on at the strike? decides the kicking foot (ball lateral offset in the player's frame)
      const lat = -(b.x - p.x) * Math.sin(p.face) + (b.y - p.y) * Math.cos(p.face);
      let foot = p.def.foot === 'L' || p.def.foot === 'left' ? -1 : 1;
      if (Math.abs(lat * S) > 0.15) foot = lat > 0 ? 1 : -1;
      const kind = e.kind || null;      // the sim's resolved strike (volley, header, outside ...): the clip follows it, not a height guess
      if (kind === 'outside' && e.foot) foot = e.foot === 'L' ? -1 : 1;
      latch.kick[i] = { type: e.shot || null, kind, owned: latch.lastOwner === i, foot, high: kind ? kind === 'header' || kind === 'diveheader' : b.z >= 20, z: b.z, cross: !!(e.shot === 'chip' && (p.y < C.BOXY0 || p.y > C.BOXY1)) };
    } else if (e.type === 'kick') latch.throwAt = G.t;
    else if (e.type === 'save') latch.save = { kind: e.catch ? 'catch' : e.smother ? 'smother' : e.weak ? 'weak' : e.slide ? 'slide' : 'parry', at: G.t };
    else if (e.type === 'goal') { const lg = G.goals[G.goals.length - 1]; latch.lastGoalBy = lg && lg.by != null ? lg.by : -1; }
  }

  function snapshot(G, V) {
    if (vf.players.length !== G.players.length) reset(G);
    vf.t = G.t; vf.phase = G.phase; vf.me = (V && V.me) || 0; vf.attacker = G.attacker; vf.slowmo = false;
    vf.walls = !!G.walls; vf.celebCam = null;      // the goal camera of the celebration being played (roadmap 2.5)
    vf.turf = G.turf || 'grass'; vf.surf = ISO.Phys ? ISO.Phys.surf(G) : null;      // pitch type and the surface row in force (never cached across frames)
    vf.pen = G.drill && G.drill.so ? G.drill.so.turn : null;      // penalty shootout: 'shoot' (you take it) or 'save' (you keep)
    vf.mustClear = G.mustClear == null ? -1 : G.mustClear;
    vf.goalBy = latch.lastGoalBy; vf.winner = G.winner == null ? -1 : G.winner; vf.drill = G.drill ? G.drill.kind || null : null;      // camera rig: the last scorer, the match winner, the drill kind (read-only)
    vf.myTeam = G.players[vf.me] ? G.players[vf.me].team : 0;
    const b = G.ball, B = vf.ball;
    B.x = (b.y - K.GCY) * S; B.z = (C.FW - b.x) * S; B.y = Math.max(0, b.z) * S;
    B.vx = b.vy * S; B.vz = -b.vx * S; B.vy = b.vz * S; B.spin = b.spin || 0; B.tsp = b.tsp || 0; B.rot = b.rot || 0;
    B.owner = b.owner ? G.players.indexOf(b.owner) : -1; if (!(B.owner < 0 && b.kickT < 0.02)) latch.lastOwner = B.owner;      // who had the ball just before a kick released it (pv.kick.owned)
    B.held = !!b.holder; B.inNet = b.inNet !== null && b.inNet !== undefined; B.shot = b.shot ? b.shot.type || 'normal' : null;
    for (let i = 0; i < G.players.length; i++) {
      const p = G.players[i], o = vf.players[i];
      o.idx = i; o.team = p.team; o.hidden = p.state === 'away';
      o.sim = p;      // sim: the live sim player, READ ONLY (an escape hatch for fields not copied below)
      o.x = (p.y - K.GCY) * S; o.z = (C.FW - p.x) * S; o.yaw = Math.PI - p.face;
      o.vx = p.vy * S; o.vz = -p.vx * S; o.speed = Math.hypot(p.vx, p.vy) * S; o.jog = p.jog * S; o.top = p.top * S; o.runPh = p.runPh; o.stride = ISO.styleOf ? ISO.styleOf(p.def).m.stride : 1;      // the sim's per-player stride factor (read-only): the gait's stride length follows it
      if (p.state === 'celebrate' && !vf.celebCam && ISO.celebOf) vf.celebCam = ISO.celebById(ISO.celebOf(p.def)).cam;
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
      o.owner = B.owner === i; o.sprint = !!p.sprinting; o.jock = !!p.jock; o.shield = !!p.shield; o.close = !!p.close; o.stopT = p.stopT || 0; o.focus = !!p.focus; o.exhausted = !!p.exhausted;
      o.wall = p.noCtrl > 50; o.ballSide = p.ballSd || 0;
    }
    const kp = G.keeper, kv = vf.keeper;
    kv.x = (kp.y - K.GCY) * S; kv.z = (C.FW - kp.x) * S; kv.yaw = Math.PI - kp.face; kv.vx = kp.vy * S; kv.vz = -kp.vx * S; kv.speed = Math.hypot(kp.vx, kp.vy) * S;
    kv.state = kp.state; kv.diveDir = kp.diveDir || 1; kv.high = !!kp.high; kv.slid = !!kp.slid; kv.chip = !!kp.chip; kv.animDist = kp.animDist || 0; kv.jump = !!kp.jump; kv.sim = kp;
    kv.u = kp.state === 'dive' ? clamp(kp.stT / (kp.diveT || kp.stDur || 0.42), 0, 1) : kp.stDur > 0 ? clamp(kp.stT / kp.stDur, 0, 1) : 0;
    kv.holding = kp.state === 'hold'; kv.human = !!kp.human;
    if (kp.human && kp.state === 'dive') kv.u = clamp(kp.stT / 0.42, 0, 1);      // the human keeper's dive always lasts 0.42 s (diveT / stDur can be left over from an AI dive)
    const sv = latch.save;
    if (sv && G.t - sv.at < 0.5) { kv.save = kv.save || { kind: '', age: 0 }; kv.save.kind = sv.kind; kv.save.age = G.t - sv.at; } else kv.save = null;
    if (latch.holdPrev && !kv.holding && G.t - latch.throwAt < 0.2) kv.save = { kind: 'throw', age: G.t - latch.throwAt };
    latch.holdPrev = kv.holding;
    return vf;
  }

  // ------------------------------------------------------------------ goal replay tape (3D)
  // A ring of the last few seconds of what was drawn: every field snapshot() reads from the sim (players, keeper, ball) plus the latched
  // kick / save events. Fixed storage, nothing allocated per frame once warm. seek() interpolates two frames into a FAKE game object
  // (it inherits from the live G, so any field not recorded reads the live one) that snapshotTape() turns into a ViewFrame through the
  // very same code the live match uses: the animators, ball and rings need no replay mode. The live G and the live latches are never written.
  const TAPE_S = 8.5, TN = 1400;      // seconds kept, ring size (enough for 144 Hz)
  const PN = ['x', 'y', 'vx', 'vy', 'face', 'stT', 'stDur', 'kickT', 'runPh', 'animDist', 'jog', 'top', 'fakeT', 'fakeDrag', 'fallDir', 'stopT', 'noCtrl', 'ballSd'];
  const PO = ['state', 'sprinting', 'jock', 'shield', 'close', 'focus', 'exhausted'];
  const KN = ['x', 'y', 'vx', 'vy', 'face', 'stT', 'stDur', 'diveT', 'animDist', 'diveDir'];
  const KO = ['state', 'high', 'slid', 'chip', 'jump', 'human'];
  const BN = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin', 'tsp', 'rot', 'kickT'];
  const ANG = { face: 1 }, TAU = Math.PI * 2;
  const tp = { fr: [], n: 0, head: 0, clock: 0, goalAt: -1, fg: null, fgFor: null };
  const mkSlot = () => ({ _c: null, _s: null, charge: null, skill: null });
  const mkFrame = (np) => ({ t: 0, gt: 0, ph: 'play', pl: Array.from({ length: np }, mkSlot), k: {}, b: { holder: false, inNet: false, shot: null, wet: false, own: -1 }, kick: [], save: null, throwAt: -9 });
  const frameAt = (i) => tp.fr[(tp.head - tp.n + i + TN * 2) % TN];
  function put(G, f) {
    f.t = tp.clock; f.gt = G.t; f.ph = G.phase;
    for (let i = 0; i < G.players.length; i++) {
      const p = G.players[i], s = f.pl[i];
      for (let j = 0; j < PN.length; j++) s[PN[j]] = p[PN[j]];
      for (let j = 0; j < PO.length; j++) s[PO[j]] = p[PO[j]];
      if (p.charge) { const c = s._c || (s._c = {}); c.t = p.charge.t; c.type = p.charge.type; c.ft = p.charge.ft; s.charge = c; } else s.charge = null;
      if (p.skill) { const c = s._s || (s._s = {}); if (c.id !== p.skill.id) for (const k in c) delete c[k]; Object.assign(c, p.skill); s.skill = c; } else s.skill = null;
      f.kick[i] = liveLatch.kick[i] || null;
    }
    const k = G.keeper, kk = f.k;
    for (let j = 0; j < KN.length; j++) kk[KN[j]] = k[KN[j]];
    for (let j = 0; j < KO.length; j++) kk[KO[j]] = k[KO[j]];
    const b = G.ball, bb = f.b;
    for (let j = 0; j < BN.length; j++) bb[BN[j]] = b[BN[j]];
    bb.holder = !!b.holder; bb.inNet = b.inNet !== null && b.inNet !== undefined; bb.shot = b.shot ? b.shot.type || 'normal' : null; bb.wet = !!b.wet; bb.own = b.owner ? G.players.indexOf(b.owner) : -1;
    f.save = liveLatch.save; f.throwAt = liveLatch.throwAt;
  }
  const Tape = {
    record(G, dt) {
      tp.clock += dt;
      const f = tp.fr[tp.head] || (tp.fr[tp.head] = mkFrame(G.players.length));
      if (f.pl.length !== G.players.length) { tp.fr.length = 0; tp.n = 0; tp.head = 0; return; }
      put(G, f); tp.head = (tp.head + 1) % TN; if (tp.n < TN) tp.n++;
      while (tp.n > 2 && frameAt(0).t < tp.clock - TAPE_S) tp.n--;
    },
    mark() { tp.goalAt = tp.clock; }, unmark() { tp.goalAt = -1; }, goalAt: () => tp.goalAt,
    clear() { tp.n = 0; tp.head = 0; tp.goalAt = -1; tp.fg = tp.fgFor = null; },
    count: () => tp.n, clock: () => tp.clock,
    t0: () => (tp.n ? frameAt(0).t : 0), t1: () => (tp.n ? frameAt(tp.n - 1).t : 0),
    // tape time -> the fake game (shared object: valid until the next seek); null when the tape is empty
    seek(G, t) {
      if (!tp.n) return null;
      let i = 0;
      while (i + 1 < tp.n && frameAt(i + 1).t <= t) i++;
      const a = frameAt(i), b = i + 1 < tp.n ? frameAt(i + 1) : null, f = b ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1))) : 0;
      if (tp.fgFor !== G) {
        const fg = Object.create(G);
        fg.players = G.players.map((p) => Object.create(p)); fg.keeper = Object.create(G.keeper); fg.ball = Object.create(G.ball); fg.events = [];
        tp.fg = fg; tp.fgFor = G;
        repLatch.kick.length = G.players.length;
      }
      const fg = tp.fg, mix = (dst, x, y, nums, others) => {
        const same = !y || x.state === y.state;
        for (let j = 0; j < nums.length; j++) {
          const k = nums[j], u = x[k], v = y && y[k];
          if (same && f > 0 && typeof u === 'number' && typeof v === 'number') {
            if (ANG[k]) { let d = v - u; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; dst[k] = u + d * f; } else dst[k] = u + (v - u) * f;
          } else dst[k] = u;
        }
        for (let j = 0; j < others.length; j++) dst[others[j]] = x[others[j]];
      };
      fg.t = a.gt + (b ? (b.gt - a.gt) * f : 0); fg.phase = a.ph;
      for (let j = 0; j < fg.players.length; j++) { const d = fg.players[j]; mix(d, a.pl[j], b && b.pl[j], PN, PO); d.charge = a.pl[j].charge; d.skill = a.pl[j].skill; repLatch.kick[j] = a.kick[j]; }
      mix(fg.keeper, a.k, b && b.k, KN, KO);
      const bl = fg.ball; mix(bl, a.b, b && b.b, BN, ['holder', 'shot', 'wet']);
      bl.inNet = a.b.inNet ? 1 : null; bl.holder = a.b.holder; bl.owner = a.b.own >= 0 ? fg.players[a.b.own] : null;
      repLatch.save = a.save; repLatch.throwAt = a.throwAt;
      return fg;
    },
    // a replay starts clean: the latches it evolves (owner before a kick, the keeper's hold) belong to the tape, not to the match
    begin() { repLatch.lastGoalBy = liveLatch.lastGoalBy; repLatch.lastOwner = -1; repLatch.holdPrev = false; repLatch.save = null; repLatch.throwAt = -9; for (let i = 0; i < repLatch.kick.length; i++) repLatch.kick[i] = null; },
  };
  // the ViewFrame of a fake game from Tape.seek (the shared vf: the live frame overwrites it again next frame)
  function snapshotTape(fg, V) { const sv = latch; latch = repLatch; try { return snapshot(fg, V); } finally { latch = sv; } }

  R3D.Adapter = { snapshot, snapshotTape, onEvent, reset, clear, vf, Tape };
})();
