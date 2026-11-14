// The tutorial (js/tutorial.js), headless: node tools/tutorial-test.js
// 1. Every lesson and step: scripted inputs on the real simulation perform the action and the step completes; a wrong action (or none) does not. Synthetic events then probe each
//    step's own predicate (a kick of the wrong type, a dive in the wrong turn ...), so a step that accepts too much fails here.
// 2. The host below runs the same loop main.js runs (events then the step, the frozen sim, the end-of-sim decision Tutorial.endAction, the pen practice rebuild) and, where main.js
//    would show the match end it records a match like showEnd does: a lesson that could end as a match shows up as changed stats / credits.
// 3. Regression tests for the six bugs of the independent test (penalty farm, SKIP on rebounds, rebound reliability, reward farming, first-run offer, tutorial from a running match)
//    and for the smaller ones (views settings, ball at the feet, labels, wording).
// 4. Strings: every lesson string exists in js/lang-en.js, every placeholder is one the panel supplies, key labels follow rebinding.
const fs = require('fs'), path = require('path');
require('../js/data.js'); require('../js/i18n.js'); require('../js/lang-en.js'); require('../js/game.js'); require('../js/ai.js'); require('../js/cup.js'); require('../js/career.js'); require('../js/career-obj.js'); require('../js/challenges.js');
const ISO = globalThis.ISO, C = ISO.C, ZERO = ISO.Game.ZERO, bad = [];
const ok = (c, m) => { if (!c && !bad.includes(m)) bad.push(m); };
const store = {}, KEY = 'isofootball.profile.v1';
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const noop = () => {};
globalThis.window = globalThis; globalThis.addEventListener = noop; globalThis.navigator = { getGamepads: () => [] };
require('../js/input.js'); require('../js/access.js'); require('../js/profile.js');
const Tut = require('../js/tutorial.js'), GCY = (C.GY0 + C.GY1) / 2;
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
ok(ISO.Tutorial === Tut && Tut.LESSONS.length === 8 && Tut.ORDER.length === 8, 'eight lessons');

// ------------------------------------------------------------ a headless host: builds the same game main.js builds (opts overrides last, then Tutorial.setup) and steps it like the main loop
const starter = ISO.playerById('ings');
function makeSim(run, seed) {
  const c = run.cfg, weak = ISO.PLAYERS.filter((d) => d.id !== starter.id).sort((a, b) => a.ovr - b.ovr);
  const takers = c.kind === 'pen' ? weak.slice(0, 5) : null, away = c.kind === 'duel' ? weak[0] : takers ? takers[0] : starter;
  const G = ISO.Game.create(Object.assign({ home: starter, away, roster: [starter, away], kickoff: 0, win: 0, keeperNerf: 16, seed, moves: [ISO.Profile.moveSet(), null], takers }, Tut.createOpts(c)));
  Tut.setup(G, c);
  return G;
}
function host(id) {
  const S = { seed: 7, env: Tut.envFrom(false, { camera: 'classic', mouseAim: false }), rebuilds: 0, done: false, clean: null, ends: [], shown: 0, sawEnd: false, kicks: 0 };
  S.run = Tut.create(id, { rebuild: () => { S.want = true; }, done: (x, clean) => { S.done = true; S.clean = clean; Tut.markDone(x, clean); } });      // (the browser's callback is the same call)
  S.G = makeSim(S.run, S.seed);
  S.tick = (inp) => {
    const G = S.G;
    if (!Tut.frozen(S.run, G)) {
      ISO.Game.step(G, [inp, Tut.opponent(G, G.players[1], S.run.cfg)]);
      for (const e of G.events) if (e.type === 'kick' && e.p === G.players[0]) S.kicks++;
    }
    const evs = G.events.slice(); G.events.length = 0;
    if (S.run.state !== 'done') S.run.step(G, C.STEP, evs, S.env);
    if (G.phase === 'end') {      // main.js: the end of a sim. A lesson restarts (or holds); anything that would be 'show' is the match-end screen: recordMatch, as showEnd does
      S.sawEnd = true;
      const a = Tut.endAction('tut', S.run); S.ends.push(a);
      if (a === 'show') { S.shown++; try { ISO.Profile.recordMatch({ mode: 'cpu', won: G.winner === 0, gf: G.score[0], ga: G.score[1], diff: 'easy', win: G.win, skills: 0, clears: 0, powerGoals: 0 }); } catch (e) { /* counted */ } }
      else if (a === 'restart' && !S.run.rebuilding) S.run.restart();
    }
    if (S.want) { S.want = false; S.rebuilds++; S.G = makeSim(S.run, ++S.seed); }
  };
  return S;
}
const I = (o) => Object.assign({}, ZERO, o);
// drive `secs` of sim seconds with a constant input (or a function of the game); stops early when stop() is true
function run(S, inp, secs, stop) { const n = Math.round(secs / C.STEP); for (let i = 0; i < n; i++) { S.tick(typeof inp === 'function' ? inp(S.G, i * C.STEP) : inp); if (stop && stop()) return true; } return !!(stop && stop()); }
const waitPlay = (S) => run(S, ZERO, 8, () => S.G.phase === 'play');
const toward = (G, x, y, mag) => { const p = G.players[0], d = Math.hypot(x - p.x, y - p.y) || 1; return { mx: (x - p.x) / d * (mag || 1), my: (y - p.y) / d * (mag || 1) }; };
// chase whoever has the ball (or the loose ball) and press `key` once within `d0`
const chase = (key, d0) => (G) => { const o = G.ball.owner && G.ball.owner.team === 1 ? G.ball.owner : G.ball, p = G.players[0], d = Math.hypot(o.x - p.x, o.y - p.y); return d > d0 ? Object.assign(I({}), toward(G, o.x, o.y)) : I({ [key]: Math.floor(G.t * 8) % 2 === 0 }); };      // (the key is tapped, not held: a press is an edge)
// get the ball back at your feet after a shot
function fetch(S) { waitPlay(S); run(S, (G) => { const b = G.ball, p = G.players[0]; return b.owner === p ? ZERO : Object.assign(I({}), toward(G, b.x, b.y)); }, 9, () => S.G.ball.owner === S.G.players[0] && S.G.phase === 'play'); }
const idxIs = (S, i) => S.run.idx === i && S.run.state === 'play';
// wait out the 'ok' flash until the run moves to the next step (the sim may be rebuilt on the way)
function next(S, i) { run(S, ZERO, 4, () => S.run.idx > i || S.run.state === 'done'); waitPlay(S); }
const stepDone = (S, i) => S.run.idx > i || S.run.state === 'ok' && S.run.idx === i || S.run.state === 'done';
// a host sitting at the start of step i (by SKIP: the step builds its own situation)
function at(id, i) { const S = host(id); waitPlay(S); for (let k = 0; k < i; k++) { S.run.skip(S.G); run(S, ZERO, 0.2); waitPlay(S); } return S; }
// one synthetic event through the run's own step(): did it complete the step ('ok'), warn (the flash key) or do nothing?
function fire(S, e) { const f0 = S.run.flash; S.run.step(S.G, 0.001, [e], S.env); return S.run.state === 'ok' ? 'ok' : S.run.state !== 'play' ? S.run.state : S.run.flash && S.run.flash !== f0 ? S.run.flash.k : 'none'; }
const kick = (S, shot, who) => ({ type: 'kick', p: S.G.players[who === undefined ? 0 : who], shot });

// ------------------------------------------------------------ each lesson: [per step: wrong action(s), the right action]
const shootTimes = (S, key, hold, aim) => { run(S, I({ [key]: true, my: aim || 0 }), hold); run(S, I({ my: aim || 0 }), 0.3); };
const REC = {
  move: [
    { wrong: (S) => run(S, ZERO, 3), right: (S) => run(S, I({ mx: 1 }), 2.2, () => stepDone(S, 0)) },
    { wrong: (S) => run(S, I({ my: 1 }), 3), right: (S) => run(S, I({ my: 1, sprint: true }), 3, () => stepDone(S, 1)) },
    { wrong: (S) => run(S, I({ mx: 1 }), 2), right: (S) => { const d = [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]; for (const [x, y] of d) { run(S, I({ mx: x, my: y }), 0.45, () => stepDone(S, 2)); if (stepDone(S, 2)) return; } } },
  ],
  shoot: [
    { wrong: (S) => { run(S, I({ shoot: true }), 0.05); run(S, ZERO, 0.4); ok(S.run.flash && S.run.flash.k === 'tut.shoot.charge.tap', 'a tap gives the fake-shot warning'); run(S, I({ finesse: true }), 0.4); run(S, ZERO, 1); }, right: (S) => shootTimes(S, 'shoot', 0.33) },
    { wrong: (S) => { run(S, ZERO, 1); shootTimes(S, 'shoot', 0.33); run(S, ZERO, 3); }, right: (S) => { for (let k = 0; k < 8 && !stepDone(S, 1); k++) { fetch(S); run(S, I({ my: k % 2 ? -1 : 1 }), 0.25); shootTimes(S, 'shoot', 0.33, k % 2 ? -1 : 1); run(S, ZERO, 3, () => stepDone(S, 1)); } } },
    { wrong: (S) => { fetch(S); shootTimes(S, 'shoot', 0.3); run(S, ZERO, 1); ok(S.run.flash && S.run.flash.k === 'tut.shoot.over.early', 'an early release warns'); }, right: (S) => { fetch(S); run(S, I({ shoot: true }), 1.2, () => stepDone(S, 2)); run(S, ZERO, 0.2); } },
  ],
  shots: [
    { wrong: (S) => { shootTimes(S, 'shoot', 0.33); run(S, ZERO, 1.5); shootTimes(S, 'lob', 0.2); run(S, ZERO, 1.5); }, right: (S) => { waitPlay(S); shootTimes(S, 'finesse', 0.4); } },
    { wrong: (S) => { fetch(S); shootTimes(S, 'finesse', 0.4); run(S, ZERO, 2); }, right: (S) => { for (let k = 0; k < 4 && !stepDone(S, 1); k++) { fetch(S); shootTimes(S, 'chip', 0.65); run(S, ZERO, 2, () => stepDone(S, 1)); } } },
    { wrong: (S) => { fetch(S); shootTimes(S, 'chip', 0.65); run(S, ZERO, 2); }, right: (S) => { for (let k = 0; k < 4 && !stepDone(S, 2); k++) { fetch(S); shootTimes(S, 'lob', 0.2); run(S, ZERO, 2, () => stepDone(S, 2)); } } },
    { wrong: (S) => { fetch(S); shootTimes(S, 'shoot', 0.33); run(S, ZERO, 2); }, right: (S) => { for (let k = 0; k < 4 && !stepDone(S, 3); k++) { fetch(S); run(S, I({ shoot: true }), 0.05); run(S, ZERO, 1, () => stepDone(S, 3)); } } },
    { wrong: (S) => { waitPlay(S); const r = S.rebuilds; run(S, ZERO, 3); ok(S.rebuilds === r + 1, 'trapping the loose ball restarts the first-time step'); }, right: (S) => { waitPlay(S); run(S, I({ shoot: true }), 3, () => stepDone(S, 4)); } },
  ],
  skills: [
    { wrong: (S) => { run(S, I({ k: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1); }, right: (S) => { run(S, I({ j: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1, () => stepDone(S, 0)); } },
    { wrong: (S) => { run(S, I({ j: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1); }, right: (S) => { run(S, I({ k: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1, () => stepDone(S, 1)); } },
    { wrong: (S) => { run(S, I({ k: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1); }, right: (S) => { run(S, I({ l: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1, () => stepDone(S, 2)); } },
    { wrong: (S) => { run(S, I({ j: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1.2); }, right: (S) => { run(S, I({ j: true, k: true, mx: 1 }), 0.1); run(S, I({ mx: 1 }), 1.2, () => stepDone(S, 3)); } },
  ],
  defend: [
    { wrong: (S) => { run(S, ZERO, 3); }, right: (S) => { run(S, (G) => Object.assign(I({ jockey: true }), toward(G, G.ball.x, G.ball.y, 0.2)), 4, () => stepDone(S, 0)); } },
    { wrong: (S) => { run(S, () => I({ slide: true }), 0.1); run(S, ZERO, 1); }, right: (S) => { run(S, chase('tackle', 40), 6, () => stepDone(S, 1)); } },
    { wrong: (S) => { run(S, () => I({ tackle: true }), 0.1); run(S, ZERO, 1); }, right: (S) => { run(S, chase('slide', 70), 8, () => stepDone(S, 2)); } },
    { wrong: (S) => { run(S, () => I({ slide: true }), 0.1); run(S, ZERO, 1); }, right: (S) => { run(S, chase('shoulder', 38), 8, () => stepDone(S, 3)); } },
  ],
  // the ball is loose in the box and the CPU stands: running onto it wins it inside the box; the rest is the clear rule
  rebound: [
    { wrong: (S) => { run(S, ZERO, 3); ok(S.run.idx === 0 && S.run.state === 'play', 'standing still does not win the ball'); }, right: (S) => { run(S, (G) => Object.assign(I({}), toward(G, G.ball.x, G.ball.y)), 12, () => stepDone(S, 0)); } },
    { wrong: (S) => { run(S, ZERO, 0.4); }, right: (S) => { run(S, I({ shoot: true }), 0.2, () => stepDone(S, 1)); } },
    { wrong: (S) => { run(S, ZERO, 0.4); }, right: (S) => { run(S, I({ mx: -1 }), 4, () => stepDone(S, 2)); } },
  ],
  penalty: [
    { wrong: (S) => { run(S, ZERO, 2.5); }, right: (S) => { run(S, I({ my: 1, shoot: true }), 0.33); run(S, I({ my: 1 }), 0.5); } },
    { wrong: (S) => { run(S, ZERO, 1); }, right: (S) => { run(S, ZERO, 8, () => S.G.drill.so.turn === 'save' && S.G.phase === 'play'); run(S, ZERO, 0.2); run(S, I({ my: 1, shoot: true }), 0.1, () => stepDone(S, 1)); } },
  ],
  views: [
    { wrong: (S) => { run(S, ZERO, 3); ok(S.run.idx === 0, 'the pause step waits for the pause'); }, right: (S) => { S.env = Tut.envFrom(true, { camera: 'classic', mouseAim: false }); S.tick(ZERO); } },
    { wrong: (S) => { S.tick(ZERO); S.tick(ZERO); ok(S.run.idx === 1, 'the view step waits for a change'); }, right: (S) => { S.env = Tut.envFrom(true, { camera: '3d', mouseAim: false }); S.tick(ZERO); } },
    { wrong: (S) => { S.env = Tut.envFrom(false, { camera: '3d', mouseAim: true }); waitPlay(S); shootTimes(S, 'shoot', 0.33); run(S, ZERO, 1); ok(S.run.idx === 2, 'a keyboard shot is not a mouse shot'); fetch(S); run(S, I({ shoot: true, ax: 330, ay: 400 }), 0.05); run(S, I({ ax: 330, ay: 400 }), 0.5); ok(S.run.idx === 2 && S.run.flash && S.run.flash.k === 'tut.views.mouse.tap', 'a mouse CLICK is a fake shot: it warns and does not count'); }, right: (S) => { waitPlay(S); run(S, I({ shoot: true, ax: 330, ay: 400 }), 0.33); run(S, I({ ax: 330, ay: 400 }), 0.5); } },
  ],
};

// ------------------------------------------------------------ run every lesson
const prof = () => JSON.parse(JSON.stringify(ISO.Profile.data));
const before = prof();
for (const L of Tut.LESSONS) {
  const S = host(L.id); waitPlay(S);
  const rec = REC[L.id];
  ok(rec && rec.length === L.steps.length, L.id + ': a test per step');
  for (let i = 0; i < L.steps.length; i++) {
    const st = L.steps[i], tag = L.id + '.' + st.id;
    ok(idxIs(S, i), tag + ': expected to start on step ' + i + ' (idx ' + S.run.idx + ' ' + S.run.state + ')');
    if (st.paused === undefined && i > 0) waitPlay(S);
    rec[i].wrong(S);
    if (S.run.idx !== i) { bad.push(tag + ': wrong action advanced the lesson'); break; }
    waitPlay(S);
    rec[i].right(S);
    ok(stepDone(S, i), tag + ': the right action must complete the step (idx ' + S.run.idx + ' ' + S.run.state + ')');
    ok(S.run.idx === i ? S.run.flash && S.run.flash.kind === 'ok' : true, tag + ': positive feedback');
    if (!stepDone(S, i)) break;
    next(S, i);
  }
  ok(S.run.state === 'done' && S.done && S.clean === true, L.id + ': the lesson finishes, completed (' + S.run.state + ' idx ' + S.run.idx + ')');
  ok(!S.sawEnd && S.shown === 0, L.id + ': the sim never reaches a match end');
  ok(JSON.stringify(Object.assign({}, prof().settings, { tut: 0 })) === JSON.stringify(Object.assign({}, before.settings, { tut: 0 })), L.id + ': finishing it changed no setting but settings.tut');
}
{ // what the full chain did to the profile: only settings.tut and the one reward
  const after = prof(), st0 = JSON.stringify(Object.assign({}, before, { settings: 0 })), st1 = JSON.stringify(Object.assign({}, after, { settings: 0, credits: before.credits }));
  ok(st0 === st1, 'finishing the lessons only changed settings.tut and the reward credits');
  ok(after.credits === before.credits + Tut.REWARD, 'all eight lessons pay ' + Tut.REWARD + ' credits once (got ' + (after.credits - before.credits) + ')');
  ok(Object.keys(after.settings.tut.done).length === 8 && Object.values(after.settings.tut.done).every((v) => v === 1) && after.settings.tut.paid === true, 'eight lessons recorded as completed');
  const rest = (s) => JSON.stringify(Object.assign({}, s, { tut: 0 }));
  ok(rest(after.settings) === rest(before.settings), 'no other setting changed');
}

// ------------------------------------------------------------ every step's own predicate, probed with synthetic events (a step that accepts too much fails here)
{
  const E = (S, e) => fire(S, e);
  let S = at('shoot', 0); ok(E(S, kick(S, 'power')) === 'none' && E(S, kick(S, 'normal', 1)) === 'none', 'shoot.charge: only your normal shot counts'); ok(E(S, { type: 'fake', p: S.G.players[0] }) === 'tut.shoot.charge.tap', 'shoot.charge: a fake shot warns'); ok(E(S, kick(S, 'normal')) === 'ok', 'shoot.charge: a normal shot completes');
  for (const [lesson, i, good] of [['shots', 0, 'finesse'], ['shots', 1, 'power'], ['shots', 2, 'chip']]) {
    S = at(lesson, i);
    for (const t of ['normal', 'finesse', 'power', 'chip', 'first-time']) if (t !== good) ok(E(S, kick(S, t)) === 'none', lesson + '.' + good + ': a ' + t + ' shot must not complete it');
    ok(E(S, kick(S, good, 1)) === 'none', lesson + '.' + good + ': the CPU\'s kick does not count'); ok(E(S, kick(S, good)) === 'ok', lesson + '.' + good + ': the right shot completes');
  }
  S = at('shots', 3); ok(E(S, kick(S, 'normal')) === 'none' && E(S, { type: 'fake', p: S.G.players[1] }) === 'none', 'shots.fake: a kick or the CPU\'s fake does not count'); ok(E(S, { type: 'fake', p: S.G.players[0] }) === 'ok', 'shots.fake: your fake completes');
  S = at('shots', 4); for (const t of ['normal', 'finesse', 'power', 'chip']) ok(E(S, kick(S, t)) === 'none', 'shots.first: a ' + t + ' kick must not complete the first-time step'); ok(E(S, kick(S, 'first-time', 1)) === 'none', 'shots.first: the CPU\'s kick does not count'); ok(E(S, kick(S, 'first-time')) === 'ok', 'shots.first: a first-time kick completes');
  const skillIds = ['stepover', 'feint', 'knock', 'croqueta'];
  for (let i = 0; i < 4; i++) { S = at('skills', i); for (const id of skillIds) if (id !== skillIds[i]) ok(E(S, { type: 'skill', p: S.G.players[0], id }) === 'none', 'skills step ' + i + ': ' + id + ' must not complete it'); ok(E(S, { type: 'skill', p: S.G.players[0], id: skillIds[i] }) === 'ok', 'skills step ' + i + ': the right move completes'); }
  S = at('rebound', 0); ok(E(S, { type: 'clearit', team: 1 }) === 'none' && E(S, { type: 'clear', team: 0 }) === 'none' && E(S, { type: 'clearfirst', team: 0 }) === 'none', 'rebound.win: only your clearit completes it'); ok(E(S, { type: 'clearit', team: 0 }) === 'ok', 'rebound.win: clearit completes');
  S = at('rebound', 1); ok(E(S, { type: 'clearit', team: 0 }) === 'none' && E(S, { type: 'clearfirst', team: 1 }) === 'none' && E(S, { type: 'clear', team: 0 }) === 'none', 'rebound.shoot: only your refused shot completes it'); ok(E(S, { type: 'clearfirst', team: 0 }) === 'ok', 'rebound.shoot: clearfirst completes');
  S = at('rebound', 2); ok(E(S, { type: 'clearfirst', team: 0 }) === 'none' && E(S, { type: 'clear', team: 1 }) === 'none', 'rebound.clear: only your clear completes it'); ok(E(S, { type: 'clear', team: 0 }) === 'ok', 'rebound.clear: clear completes');
  S = host('penalty'); waitPlay(S); ok(E(S, kick(S, 'normal', 1)) === 'none', 'penalty.kick: the taker\'s kick does not count'); ok(E(S, kick(S, 'normal')) === 'ok', 'penalty.kick: your kick completes');
  // the keeper step: a kick or a dive in the SHOOT turn (after RETRY / REMATCH / a skipped step 1) must not complete it; a dive in the SAVE turn does
  S = at('penalty', 1); S.run.restart(); run(S, ZERO, 0.1); waitPlay(S); ok(S.G.drill.so.turn === 'shoot' && idxIs(S, 1), 'penalty: a restart on step 2 starts with your kick');
  ok(S.run.view().key === 'tut.penalty.save.wait', 'penalty.save: in your kick turn the panel says so, not "now you are the keeper" (' + S.run.view().key + ')');
  ok(E(S, kick(S, 'normal')) === 'none' && E(S, { type: 'dive', p: S.G.players[0] }) === 'none', 'penalty.save: a kick or a dive in the shoot turn must not complete it');
  S.G.drill.so.turn = 'save'; S.G.keeper.human = true; ok(S.run.view().key === 'tut.penalty.save', 'penalty.save: in the keeper turn the keeper text shows'); ok(E(S, kick(S, 'normal')) === 'none', 'penalty.save: a kick does not complete it even in the save turn'); ok(E(S, { type: 'dive', p: S.G.keeper }) === 'ok', 'penalty.save: a dive in the save turn completes it');
  S = at('views', 2); S.G.players[0].aim = { x: 1, y: 1 }; ok(E(S, { type: 'fake', p: S.G.players[0] }) === 'tut.views.mouse.tap', 'views.mouse: a click (fake shot) warns'); ok(E(S, kick(S, 'normal')) === 'ok', 'views.mouse: a held, aimed shot completes');
  S = at('views', 2); ok(E(S, kick(S, 'normal')) === 'none', 'views.mouse: a shot without the mouse aim does not count');
  // the Views steps read the settings through Tutorial.envFrom, the function the frame uses
  ok(Tut.envFrom(true, { camera: '3d', mouseAim: true }).camera === '3d' && Tut.envFrom(true, { camera: '3d', mouseAim: true }).mouseAim === true && Tut.envFrom(false, {}).camera === 'classic' && Tut.envFrom(false, { mouseAim: 'yes' }).mouseAim === false, 'envFrom reads camera and mouse aim from the settings');
}

// ------------------------------------------------------------ SKIP: every step of every lesson advances, never bounces back, and a skipped lesson is not a completed one
for (const L of Tut.LESSONS) for (let i = 0; i < L.steps.length; i++) {
  const S = at(L.id, i), tag = L.id + '.' + L.steps[i].id;
  ok(idxIs(S, i), tag + ': skipping to this step lands on it (idx ' + S.run.idx + ' ' + S.run.state + ')');
  S.run.skip(S.G); run(S, ZERO, 0.2);
  ok(S.run.idx === i + 1 || S.run.state === 'done', tag + ': SKIP advances (idx ' + S.run.idx + ' ' + S.run.state + ')');
  const idx = S.run.idx; run(S, ZERO, 14);      // (then idle: the next step must not throw you back; a situation that cannot go on starts over at the SAME step)
  ok(S.run.idx >= idx, tag + ': after SKIP the lesson does not go back a step (idx ' + S.run.idx + ' < ' + idx + ')');
}
{
  const S = host('move'); waitPlay(S); const c0 = ISO.Profile.data.credits;
  const st0 = JSON.stringify(ISO.Profile.data.settings.tut);
  for (let k = 0; k < 3; k++) { S.run.skip(S.G); run(S, ZERO, 0.2); }
  ok(S.run.state === 'done' && S.done && S.clean === false, 'a lesson finished only by SKIP is reported as not completed');
  ok(ISO.Profile.data.settings.tut.done.move === 1, 'a lesson already completed stays completed when replayed with a skip');
  ok(ISO.Profile.data.credits === c0, 'skipping pays nothing');
}
{ // a fresh profile: skip everything in all eight lessons: seen, not completed, no reward; then play one: only that one counts
  store[KEY] = ''; delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js');
  const P = ISO.Profile, c0 = P.data.credits;
  for (const L of Tut.LESSONS) { const S = host(L.id); waitPlay(S); for (let k = 0; k < L.steps.length; k++) { S.run.skip(S.G); run(S, ZERO, 0.2); waitPlay(S); } ok(S.run.state === 'done', L.id + ': skipping every step finishes the lesson'); }
  const t = P.tutState();
  ok(Tut.ORDER.every((id) => t.done[id] === 2), 'eight skipped lessons are recorded as skipped (2), not completed'); ok(t.paid === false && P.data.credits === c0, 'skipping everything pays no reward'); ok(Tut.progress().done === 0, 'skipped lessons do not count as done');
  const S = host('move'); waitPlay(S); run(S, I({ mx: 1 }), 2.2, () => S.run.state === 'ok'); next(S, 0); run(S, I({ my: 1, sprint: true }), 3, () => S.run.idx > 1 || S.run.state === 'ok'); next(S, 1);
  for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) { run(S, I({ mx: x, my: y }), 0.45, () => stepDone(S, 2)); if (stepDone(S, 2)) break; }
  run(S, ZERO, 2, () => S.run.state === 'done');
  ok(P.tutState().done.move === 1 && Tut.progress().done === 1, 'replaying a skipped lesson properly completes it'); ok(P.tutState().done.shoot === 2, 'the other skipped lessons stay skipped');
  P.tutDone('move', false); ok(P.tutState().done.move === 1, 'progress only grows: a completed lesson is never lowered to skipped');
  // the reward needs eight completed lessons: seven completed and one skipped pays nothing
  for (const id of Tut.ORDER) P.tutDone(id, true); P.tutState().done.views = 2; ok(Tut.markDone('views', false).reward === undefined && P.data.credits === c0, 'seven completed + one skipped: no reward'); Tut.markDone('views', true); ok(P.data.credits === c0 + Tut.REWARD, 'the eighth completed lesson pays once');
}

// ------------------------------------------------------------ bug 4: settings import never touches settings.tut (the import line of js/meta-ui.js, run on mock settings)
{
  const src = read('js/meta-ui.js'), m = /const ST2 = PF\.data\.settings, base = Object\.assign\(\{\}, ST2\);[^\n]*\n\s*for \(const k of Object\.keys\(base\)\)[^\n]*\n/.exec(src);
  ok(!!m, 'the settings import of js/meta-ui.js can be found');
  if (m) {
    const f = new Function('PF', 'o', m[0] + 'return ST2;');
    const PF = { data: { settings: { hint: true, mouseAim: false, tut: { done: { move: 1 }, seen: true, paid: true }, admin: false } } };
    const ST = f(PF, { hint: false, tut: { done: {}, seen: false, paid: false }, admin: true, mouseAim: 'x' });
    ok(ST.hint === false, 'the import still applies a known setting');
    ok(ST.tut.paid === true && ST.tut.done.move === 1 && ST.tut.seen === true, 'the settings import never changes the tutorial progress or the paid flag');
    ok(ST.admin === false && ST.mouseAim === false, 'the import keeps admin and ignores values of the wrong type');
  }
  // and the exported / imported data is not what the reward lives on: profile functions only grow it
  const P = ISO.Profile; ok(P.tutReward(150) === 0, 'the reward cannot be paid twice');
}

// ------------------------------------------------------------ bug 1: the penalties lesson is practice: five rounds of only kicking never end it, never record a match
{
  const P = ISO.Profile, st0 = JSON.stringify(P.data.stats), cr0 = P.data.credits;
  for (const mode of ['kick-only', 'kick-and-dive']) {
    const S = host('penalty'); waitPlay(S);
    const inp = (G) => (G.phase === 'play' && G.drill.so.turn === 'shoot' ? I({ my: 1, shoot: Math.floor(G.t / 0.4) % 2 === 0 }) : mode === 'kick-and-dive' && G.phase === 'play' && G.drill.so.turn === 'save' && G.t % 3 < 0.2 ? I({ my: 1, shoot: true }) : ZERO);
    run(S, inp, 160);
    ok(S.shown === 0 && JSON.stringify(P.data.stats) === st0, mode + ': no match was recorded (' + S.shown + ')');
    if (mode === 'kick-only') { ok(S.kicks >= 8, mode + ': many kicks (' + S.kicks + ')'); ok(!S.sawEnd && S.G.phase !== 'end', mode + ': the sim of the lesson never reaches its final phase'); ok(S.rebuilds >= 1, mode + ': the shootout starts over by itself before it can be decided'); }
  }
  ok(JSON.stringify(P.data.stats) === st0, 'the profile stats are unchanged after the penalty practice');
  // the decision main.js takes when a sim reaches its final phase
  ok(Tut.endAction('cpu', null) === 'show' && Tut.endAction('cup', null) === 'show' && Tut.endAction('career', null) === 'show', 'real matches still end in the end screen');
  const R = Tut.create('penalty', {}); ok(Tut.endAction('tut', R) === 'restart' && Tut.endAction('tut', null) === 'restart', 'a lesson that reaches its end restarts: never the end screen'); R.state = 'done'; ok(Tut.endAction('tut', R) === 'hold', 'under the finished card it holds');
  // a shootout that WAS decided (forced) goes through the same decision and does not record anything
  const S = host('penalty'); waitPlay(S); S.G.drill.so.kicks = [['goal', 'goal', 'goal'], ['saved', 'saved', 'saved']]; S.G.phase = 'end'; S.tick(ZERO);
  ok(S.ends[0] === 'restart' && S.shown === 0 && S.rebuilds === 1, 'a decided shootout starts over instead of showing FULL TIME');
  // the wiring in js/main.js: the end screen is not reachable in a lesson
  const mj = read('js/main.js');
  ok(/function showEnd\(\) \{\s*\n\s*if \(App\.mode === 'tut'\) return;/.test(mj), 'showEnd() returns at once in a lesson');
  ok(/else if \(App\.mode === 'tut'\) ISO\.Tutorial\.onEnd\(App\); else showEnd\(\)/.test(mj), 'the main loop hands a lesson\'s end to Tutorial.onEnd');
}

// ------------------------------------------------------------ bug 3: Rebounds & CLEAR IT, one attempt per trial (no retry loop), a player who follows the instruction
{
  // `style`: 'follow' runs onto the ball; 'sprint' does it sprinting and tapping tackle; 'rush' runs straight at the CPU first (to "tackle him"), then to the ball
  function trial(seed, style) {
    const S = host('rebound'); S.seed = seed; S.G = makeSim(S.run, seed); waitPlay(S);
    const pol = (G) => {
      const me = G.players[0], o = G.ball.owner, cpu = G.players[1];
      if (S.run.state === 'ok') return ZERO;
      if (S.run.idx === 1 && G.mustClear === 0) return I({ shoot: Math.floor(G.t * 8) % 2 === 0 });
      if (o === me) return I({ mx: -1 });
      if (style === 'rush' && !S.met) { if (Math.hypot(cpu.x - me.x, cpu.y - me.y) < 45) S.met = true; return Object.assign(I({}), toward(G, cpu.x, cpu.y)); }
      if (style === 'sprint') return Object.assign(I({ sprint: true, tackle: Math.floor(G.t * 8) % 2 === 0 }), toward(G, G.ball.x, G.ball.y));
      return Object.assign(I({}), toward(G, G.ball.x, G.ball.y));
    };
    run(S, pol, 30, () => S.run.state === 'done');
    return S.run.state === 'done' && S.rebuilds === 0 && S.clean === true;
  }
  const rate = (style) => { let n = 0; for (let k = 1; k <= 10; k++) if (trial(k * 11 + 2, style)) n++; return n; };
  const f = rate('follow'), sp = rate('sprint'), ru = rate('rush');
  console.log('rebound lesson, single attempts, 10 seeds: follows the instruction ' + f + '/10, sprints onto the ball tapping tackle ' + sp + '/10, rushes at the CPU first ' + ru + '/10');
  ok(f >= 8, 'a player who follows the instruction wins the ball in the box and clears it at least 8 times in 10 (' + f + '/10)');
  ok(sp >= 8, 'a sprinting, tackle-tapping player does too (' + sp + '/10)');
  // the situation itself: the ball is loose inside the box, you stand in line with it (a tackle's poke rolls up the box, not over a line), the keeper is a mannequin, the CPU does not move
  const G = (() => { const S = host('rebound'); return S.G; })();
  ok(ISO.inBox(G.ball) && !G.ball.owner && G.keeper.dummy === true && G.attacker === 1, 'rebound start: a loose ball in the box, a mannequin keeper, the CPU the attacker');
  // SKIP on the first step moves on and the lesson stays on step 2 even after the countdown: no throw-back (the SKIP regression)
  const S = at('rebound', 1); run(S, ZERO, 15); ok(S.run.idx === 1, 'rebound: skipped into step 2 it stays on step 2 (idx ' + S.run.idx + ')'); ok(S.run.view().key === 'tut.rebound.win', 'rebound: skipped into step 2 the panel still asks for the ball first');
  // the "ok" flash freezes the sim, so a carry cannot undo it
  const T2 = host('rebound'); waitPlay(T2); run(T2, (G) => Object.assign(I({}), toward(G, G.ball.x, G.ball.y)), 12, () => T2.run.state === 'ok'); const bx = T2.G.ball.x, t0 = T2.G.t; run(T2, I({ mx: -1 }), 0.5);
  ok(T2.run.idx === 0 && T2.G.t === t0 && T2.G.ball.x === bx, 'the sim stands still while the CLEAR IT flash shows');
}

// ------------------------------------------------------------ the smaller ones
{
  // 5. the first-run offer, and its placement
  const fresh = { done: {}, seen: false, paid: false }, nobody = { matches: 0, drillRuns: 0, arenaGoals: 0 };
  ok(Tut.wantsNudge(fresh, nobody), 'a fresh profile is offered the tutorial'); ok(!Tut.wantsNudge({ done: {}, seen: true, paid: false }, nobody), 'not after it was answered'); ok(!Tut.wantsNudge({ done: { move: 1 }, seen: false, paid: false }, nobody), 'not after a lesson was played'); ok(!Tut.wantsNudge(fresh, { matches: 1, drillRuns: 0, arenaGoals: 0 }), 'not for a profile that has played');
  const tj = read('js/tutorial.js'), css = read('css/style.css');
  ok(/if \(A\(\) && A\(\)\.screen === 'menu'\) Tut\.onShow\('menu'\);/.test(tj), 'tutorial.js shows the offer for the menu that was already up when it loaded (first boot)');
  const nudgeRule = /#tutNudge \{([^}]*)\}/.exec(css);
  ok(!!nudgeRule && /top:\s*\d+px/.test(nudgeRule[1]) && /left:\s*\d+px/.test(nudgeRule[1]) && !/translateX|bottom:/.test(nudgeRule[1]), 'the offer is placed in the top-left corner, away from the menu buttons');
  // 6. no tutorial from a running match
  ok(Tut.canOpen('menu') && Tut.canOpen('play') && Tut.canOpen('settings') && !Tut.canOpen('match'), 'the lesson list cannot be opened from a match');
  ok(/'controls': \(\) => \{[^}]*ISO\.Tutorial\.syncControls\(App\.screen\)/.test(read('js/main.js')), 'main.js asks the tutorial to hide its button when the Controls guide opens');
  ok(/act === 'open'\) \{ const app = A\(\); if \(!Tut\.canOpen\(app\.screen\)\) return;/.test(tj), 'the open handler refuses in a match as well');
  // 7./8. the views lesson puts back what it touched
  const V = Tut.byId('views'), snap = Tut.snapOf(V, { camera: 'classic', cam3d: 'chase', mouseAim: false, hint: true });
  ok(JSON.stringify(snap) === '{"camera":"classic","cam3d":"chase","mouseAim":false}', 'the views lesson snapshots camera, 3D camera and mouse aim only');
  const plan = Tut.restorePlan(V, snap, { camera: '3d', cam3d: 'side', mouseAim: true });
  ok(plan.camera === 'classic' && plan.cam3d === 'chase' && plan.mouseAim === false && Object.keys(plan).length === 3, 'every changed setting is put back'); ok(Object.keys(Tut.restorePlan(V, snap, { camera: 'classic', cam3d: 'chase', mouseAim: false })).length === 0, 'nothing to put back when nothing changed'); ok(Object.keys(Tut.restorePlan(Tut.byId('move'), {}, { camera: '3d' })).length === 0, 'other lessons restore nothing');
  ok(/restoreSettings\(\); *\n?\s*app\.tut = null/.test(tj) || /clearTimeout\(rebuildT\); restoreSettings\(\);/.test(tj), 'leaving a lesson restores its settings'); ok(/nowClean = clean !== false; restoreSettings\(\);/.test(tj), 'finishing a lesson restores its settings');
  // 9. each step starts with the ball at your feet in the solo lessons
  for (const [id, steps] of [['shoot', [0, 1]], ['shots', [0, 1, 2]]]) for (const i of steps) {
    const S = host(id); waitPlay(S); for (let k = 0; k < i; k++) { S.run.skip(S.G); run(S, ZERO, 0.2); waitPlay(S); }
    // a shot that went away just before the skip: the next step must still begin at your feet
    S.G.ball.owner = null; S.G.ball.x = S.G.players[0].x + 180; S.run.skip(S.G); run(S, ZERO, 0.1); waitPlay(S);
    ok(S.G.ball.owner === S.G.players[0] || S.G.ball.owner === null && Math.hypot(S.G.ball.x - S.G.players[0].x, S.G.ball.y - S.G.players[0].y) < 40 || S.run.cur() === undefined, id + ' step ' + (i + 1) + ': begins with the ball at your feet');
  }
  // 11./12. the pause menu label and the banner team names
  const mj = read('js/main.js');
  ok(/\$\('pRestart'\)\.textContent = T\(App\.mode === 'tut' \? 'btn\.restart_lesson' : 'btn\.restart_match'\)/.test(mj), 'the pause menu says RESTART LESSON in a lesson'); ok(ISO.I18n.tables.en['btn.restart_lesson'] === 'RESTART LESSON', 'RESTART LESSON exists');
  ok(/if \(S\.teams\) App\.V\.teams = S\.teams;/.test(mj), 'the countdown banner uses team names (not "YOU ATTACKS")'); ok(!/ATTACKS/.test(ISO.I18n.tables.en['tut.ui.your_side'] + ISO.I18n.tables.en['tut.ui.cpu_side']) && /^[A-Z ]+$/.test(ISO.I18n.tables.en['tut.ui.your_side']), 'team names read right before ATTACKS');
  ok(/Tutorial\.frozen|frozen\(app\.tut, app\.G\)/.test(tj) && Tut.frozen({ state: 'done' }, { phase: 'countdown' }) === false && Tut.frozen({ state: 'done' }, { phase: 'play' }) === true, 'under the finished card the pitch stands still, once the banner of the moment has played out');
  const rr = Tut.create('rebound', {}); rr.state = 'ok'; ok(Tut.frozen(rr, { phase: 'play' }) === true, 'the rebound "ok" flash freezes the pitch'); const mv = Tut.create('move', {}); mv.state = 'ok'; ok(Tut.frozen(mv, { phase: 'play' }) === false, 'other steps keep playing during their flash');
  // 13./14./15. wording: real seconds, no un-actionable advice, the guide says left / right
  const en = ISO.I18n.tables.en, all = Object.keys(en).filter((k) => k.startsWith('tut.')).map((k) => en[k]).join('\n');
  ok(!/third of a second|full second\b.{0,40}half a second|0\.6 s|0\.6 seconds|1\.2 s/.test(all), 'lesson text states real seconds (the sim runs at ' + C.SPEED + ' of real time)');
  for (const [type, key] of [['normal', 'tut.shoot.charge.hint'], ['finesse', 'tut.shots.finesse.hint'], ['power', 'tut.shots.power.hint']]) {
    const real = C.CHG[type].full / C.SPEED, words = { normal: /half a second/, finesse: /two thirds of a second/, power: /about a second/ }[type];
    ok(words.test(en[key]) && Math.abs(real - { normal: 0.5, finesse: 0.67, power: 1 }[type]) < 0.12, key + ' says the real time to full power (' + real.toFixed(2) + ' s)');
  }
  ok(Math.abs(C.CHG.normal.over / C.SPEED - 0.8) < 0.05 && /0\.8/.test(en['tut.shoot.over.hint']) && /0\.8/.test(en['tut.shoot.over.ok']) && C.CHG.normal.max / C.SPEED > 1.1, 'the over-hit text matches the sim (over ' + (C.CHG.normal.over / C.SPEED).toFixed(2) + ' s, auto-fire ' + (C.CHG.normal.max / C.SPEED).toFixed(2) + ' s)');
  ok(!/further to one side/i.test(all) && /\{left\}/.test(en['tut.shoot.aim.mid']), 'the corner advice names the keys to hold');
  ok(!/up \/ down|up or down/i.test(read('index.html').replace(/<!--[\s\S]*?-->/g, '').split('guide-body')[1] || '') && !/Hold up or down/.test(read('README.md')), 'the Controls guide and the README say left / right to pick a corner');
  // 16. each lesson header card aims its own art
  for (const a of ['vardy', 'pulisic', 'palmer', 'rooney']) { const r = new RegExp('\\.tutcard\\.art-' + a + ' \\{([^}]*)\\}').exec(css); ok(!!r && /--ap:\s*50% \d+%/.test(r[1]) && /var\(--ap\)/.test(r[1]), a + ': the header art has its own position'); }
}

// ------------------------------------------------------------ the rebound lesson for a player who tackles: one tackle press 30 / 45 px from the loose ball pokes it far; the lesson must still be winnable, or restart with a message that is true
{
  const trial = (seed, near) => {
    const S = host('rebound'); S.seed = seed; S.G = makeSim(S.run, seed); let pressed = false;
    for (let i = 0; i < Math.round(14 / C.STEP); i++) {
      const G = S.G, p = G.players[0], b = G.ball, d = Math.hypot(b.x - p.x, b.y - p.y); let inp = ZERO;
      if (G.phase === 'play' && S.run.idx === 0 && S.run.state === 'play') { inp = Object.assign(I({}), toward(G, b.x, b.y)); if (!pressed && d < near) { inp.tackle = true; pressed = true; } }
      S.tick(inp);
      if (S.run.idx > 0 || S.run.state === 'ok') return { won: true };
      if (S.rebuilds) return { won: false, msg: S.run.flash && S.run.flash.k, pressed };
    }
    return { won: false, msg: 'nothing' };
  };
  for (const near of [20, 30, 45]) {
    let won = 0; const msgs = new Set();
    for (let k = 1; k <= 10; k++) { const r = trial(k * 11 + 2, near); if (r.won) won++; else msgs.add(r.msg); }
    console.log('rebound, one tackle press within ' + near + ' px of the ball: ' + won + '/10 won' + (msgs.size ? '; otherwise: ' + [...msgs].join(', ') : ''));
    ok(won >= 8, 'a tackle pressed once ' + near + ' px from the loose ball still wins it (' + won + '/10)');
    for (const m of msgs) ok(m === 'tut.rebound.out' || m === 'tut.rebound.win.early', 'a restart after a tackle says the ball went out / was won outside the box, not "' + m + '"');
  }
  { const E = host('rebound'); waitPlay(E); E.G.attacker = 0; E.G.mustClear = -1; E.tick(ZERO); ok(E.rebuilds === 1 && E.run.flash && E.run.flash.k === 'tut.rebound.win.early', 'the rebound lesson restarts with the "won it outside the box" message when the CPU lost the right to shoot before you won it in the box'); }
  // a ball that goes over a line is "out", not "won outside the box"
  const S = host('rebound'); waitPlay(S); S.G.events.push({ type: 'out' }); S.G.ball.x = 10; S.tick(ZERO); ok(S.rebuilds === 1 && S.run.flash && S.run.flash.k === 'tut.rebound.out', 'an out of play in the rebound lesson restarts it with the "went out" message');
  // step 2 never flashes step 1's text: entering the shoot step from the won ball already knows it has the ball
  const N = host('rebound'); waitPlay(N); run(N, (G) => Object.assign(I({}), toward(G, G.ball.x, G.ball.y)), 12, () => N.run.state === 'ok'); run(N, ZERO, 1.2, () => N.run.idx === 1);
  ok(N.run.idx === 1 && N.run.view().key === 'tut.rebound.shoot', 'the shoot step shows its own text from its first frame (' + N.run.view().key + ')');
}
// the defend lesson: a challenge that leaves the ball loose with nobody on it does not stall the step
{
  const S = host('defend'); waitPlay(S); S.G.ball.owner = null; S.G.ball.vx = S.G.ball.vy = 0; S.G.ball.x = 20; S.G.ball.y = 40;
  run(S, ZERO, 4, () => S.rebuilds > 0); ok(S.rebuilds === 1 && S.run.flash && S.run.flash.k === 'tut.defend.loose', 'defend: a ball nobody has for two seconds restarts the step with a message');
}
// the penalty step 2 text: "your kick comes first" only while the kick is still to be taken
{
  const S = host('penalty'); waitPlay(S); S.run.skip(S.G); S.run.step(S.G, C.STEP, [], S.env); const wait = 'tut.penalty.save.wait';
  ok(S.run.view().key === wait && S.G.ball.owner === S.G.players[0], 'penalty step 2, skipped into: your kick comes first while the ball is at your feet');
  S.G.ball.owner = null; ok(S.run.view().key !== wait, 'penalty step 2: not once the kick has left your foot');
}
// wiring with the real main.js / tutorial.js on a stub DOM (a separate process: it installs globals)
{
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'tutorial-wiring-test.js')], { encoding: 'utf8', timeout: 240000 });
  ok(r.status === 0, 'tutorial-wiring-test: ' + ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => l && l !== 'FAIL').slice(0, 6).join(' | '));
}

// ------------------------------------------------------------ progress storage
{
  ISO.Profile.reset(); ok(ISO.Profile.data.settings.tut.paid === true || ISO.Profile.data.settings.tut.paid === false, 'a reset keeps a valid tut record');
  const t0 = JSON.parse(JSON.stringify(ISO.Profile.data.settings.tut)); ISO.Profile.reset(); ok(JSON.stringify(ISO.Profile.data.settings.tut) === JSON.stringify(t0), 'a reset keeps the paid flag and the lessons: the reward cannot be farmed'); ok(ISO.Profile.tutReward(150) === 0, 'still nothing after a reset');
  const old = JSON.parse(JSON.stringify(ISO.Profile.data)); delete old.settings.tut; store[KEY] = JSON.stringify(old);
  delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js');
  const t = ISO.Profile.tutState(); ok(t && t.done && t.seen === false && t.paid === false, 'an old profile gets settings.tut back-filled'); ok(ISO.Profile.data.schema === 5, 'the schema number is unchanged');
  store[KEY] = JSON.stringify(Object.assign({}, old, { settings: Object.assign({}, old.settings, { tut: { done: { move: 1, shoot: 2, shots: 3, zz: 7, 'x y': 1 }, seen: 'yes', paid: 3 } }) }));
  delete require.cache[require.resolve('../js/profile.js')]; delete ISO.Profile; require('../js/profile.js');
  const u = ISO.Profile.tutState(); ok(u.done.move === 1 && u.done.shoot === 2 && !('shots' in u.done) && !('zz' in u.done) && !('x y' in u.done) && u.seen === false && u.paid === false, 'a corrupt settings.tut is cleaned');
}

// ------------------------------------------------------------ the default sim is untouched: lesson options are opt-in overrides, never defaults
{
  const a = ISO.Game.create({ home: starter, away: starter, seed: 3 });
  ok(!a.sand && !a.solo && a.win === C.WIN && a.drill === null && a.keeper.dummy === undefined && a.attacker === 0 && a.walls === false, 'a default game has no sandbox, is not solo, wins at 3, has a live keeper and the home kickoff');
  const before = JSON.stringify(a.players.map((p) => [p.x, p.y])) + a.ball.x + a.ball.y + (a.ball.owner === a.players[0]);
  Tut.setup(a, { kind: 'solo', keeper: 'live' }); Tut.setup(a, null); Tut.setup(null, null);
  ok(JSON.stringify(a.players.map((p) => [p.x, p.y])) + a.ball.x + a.ball.y + (a.ball.owner === a.players[0]) === before && a.keeper.dummy === undefined, 'Tutorial.setup does nothing for a situation without the options');
  const d = Tut.createOpts(Tut.cfgOf(Tut.byId('defend'), null));
  ok(d.solo === false && d.win === 1e9 && d.kickoff === 1 && d.replay === false && !d.sand, 'duel opts: nobody can win, the CPU kicks off, no replay');
  const g = ISO.Game.create(Object.assign({ home: starter, away: ISO.PLAYERS[0], seed: 3, win: 0 }, d));
  ok(g.win === 1e9 && g.attacker === 1 && !g.solo, 'a duel game: attacker is the CPU seat'); ok(g.sand === undefined && g.drill === null && g.keeper.dummy === undefined, 'the defend lesson keeps a live keeper');
  const b = ISO.Game.create({ home: starter, away: starter, seed: 3 }); ok(b.keeper.dummy === undefined, 'a dummy keeper in one game does not leak into the next');
  const rb = ISO.Game.create(Object.assign({ home: starter, away: ISO.PLAYERS[0], seed: 3, win: 0 }, Tut.createOpts(Tut.cfgOf(Tut.byId('rebound'), null)))); Tut.setup(rb, Tut.cfgOf(Tut.byId('rebound'), null)); ok(rb.keeper.dummy === true && ISO.KEEPERS[1].dummy === undefined, 'the rebound lesson\'s mannequin keeper is that game\'s own');
}

// ------------------------------------------------------------ strings and placeholders
const en = ISO.I18n.tables.en, ph = new Set(Object.keys(Tut.vars()).concat(['n', 'total', 'cr']));
{
  const need = [];
  for (const L of Tut.LESSONS) { need.push('tut.' + L.id + '.title', 'tut.' + L.id + '.desc', 'tut.' + L.id + '.tip'); for (const s of L.steps) need.push(s.key, s.key + '.hint', s.key + '.ok'); }
  const src = read('js/tutorial.js');
  for (const m of src.matchAll(/'(tut\.[a-z_.]+[a-z_])'/g)) need.push(m[1]);
  need.push('tut.penalty.save.wait.hint');      // (the hint of the alternative text a step can show)
  for (const m of read('index.html').matchAll(/data-i18n(?:-html|-title|-ph)?="((?:tut|play\.learn|play\.tutorial|play\.eight)[a-z0-9_.]*)"/g)) need.push(m[1]);
  need.push('btn.exit_lesson', 'btn.restart_lesson', 'play.learn_the_game', 'play.tutorial');
  for (const k of new Set(need)) { ok(typeof en[k] === 'string' && en[k].length > 0, 'js/lang-en.js is missing ' + k); }
  for (const k of Object.keys(en)) if (k.startsWith('tut.')) for (const m of en[k].matchAll(/\{(\w+)\}/g)) ok(ph.has(m[1]), k + ' uses {' + m[1] + '} which the panel does not supply');
  for (const L of Tut.LESSONS) for (const s of L.steps) ok(en[s.key].length <= 130 && en[s.key + '.hint'].length <= 150, s.key + ': keep step texts short enough for the panel');
}
// key labels follow the player's bindings (never hard-coded)
{
  ISO.Input.setBindings({ shoot: ['KeyZ', null], up: ['KeyI', null], left: ['KeyJ', null], down: ['KeyK', null], right: ['KeyL', null], chip: ['KeyX', 'Mouse2'] });
  const v = Tut.vars();
  ok(/<kbd>Z<\/kbd>/.test(v.shoot) && !/SPACE/.test(v.shoot), 'the shoot label follows a rebinding'); ok(/I<\/kbd> <kbd>J<\/kbd> <kbd>K<\/kbd> <kbd>L/.test(v.move), 'the move label follows a rebinding: ' + v.move);
  ok(/<kbd>X<\/kbd>/.test(v.power) && !/Click/i.test(v.power), 'the power shot label hides the mouse button while mouse aiming is off'); ISO.Input.setBindings(null);
  ok(/SPACE/.test(Tut.vars().shoot) && /SHIFT/.test(Tut.vars().sprint), 'default labels');
}

console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'tutorial-test OK (' + Tut.LESSONS.length + ' lessons, ' + Tut.LESSONS.reduce((n, l) => n + l.steps.length, 0) + ' steps)');
process.exit(bad.length ? 1 : 0);
