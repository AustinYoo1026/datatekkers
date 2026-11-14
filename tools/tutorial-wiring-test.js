// The tutorial's wiring, behaviourally: the REAL js/main.js and js/tutorial.js (plus the sim, profile, input, render ...) booted on a stub DOM, driven through the same entry points the browser uses
// (document click handlers for the pause menu's data-act buttons and the panel / lesson list buttons, window keydown for ESC, the requestAnimationFrame loop). node tools/tutorial-wiring-test.js
// (tools/tutorial-test.js runs it as a child process, so the mutation of any wiring line fails that suite.)
const fs = require('fs'), path = require('path');
const bad = [], ok = (c, m) => { if (!c && !bad.includes(m)) bad.push(m); };
const root = path.join(__dirname, '..');

// ------------------------------------------------------------ a stub DOM: elements with a class list, attributes, listeners and a parent chain; canvases draw into the void
const noopCtx = new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: [] }) : () => noopCtx), set: () => true, apply: () => noopCtx });
const allEls = [];
class El {
  constructor(id, tag) { allEls.push(this); this.id = id || ''; this.tag = tag || 'div'; this.cls = new Set(); this.style = new Proxy({}, { get: (t, k) => (k === 'setProperty' || k === 'removeProperty' || k === 'getPropertyValue' ? () => '' : t[k]), set: (t, k, v) => ((t[k] = v), true) }); this.dataset = {}; this.kids = []; this.parent = null; this.L = {}; this.children = this.kids; this.value = ''; this.checked = false; this.width = 300; this.height = 150; this.textContent = ''; this._html = ''; this.attrs = {};
    const self = this; this.classList = { add: (...c) => c.forEach((x) => self.cls.add(x)), remove: (...c) => c.forEach((x) => self.cls.delete(x)), contains: (c) => self.cls.has(c), toggle: (c, f) => { const on = f === undefined ? !self.cls.has(c) : !!f; on ? self.cls.add(c) : self.cls.delete(c); return on; } }; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); } get className() { return [...this.cls].join(' '); }
  set innerHTML(v) { this._html = String(v); this.kids.length = 0; } get innerHTML() { return this._html; }
  get innerText() { return this._html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  appendChild(c) { c.parent = this; this.kids.push(c); return c; } append(...cs) { cs.forEach((c) => this.appendChild(c)); } remove() {} insertBefore(c) { return this.appendChild(c); } removeChild() {} replaceChildren() {}
  addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); } removeEventListener() {}
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; } removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; }
  getContext() { return noopCtx; } focus() {} blur() {} click() {} scrollIntoView() {} closest(sel) { let e = this; while (e) { if (e.matches && e.matches(sel)) return e; e = e.parent; } return null; }
  matches(sel) { const m = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(sel); if (m) { const k = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return k in this.dataset && (m[2] === undefined || this.dataset[k] === m[2]); } return false; }
  querySelector() { return new El(); } querySelectorAll() { return []; }
  get parentElement() { return this.parent || new El(); } get parentNode() { return this.parentElement; } get nextSibling() { return null; } get lastChild() { return this._lc || (this._lc = new El()); } get options() { return []; }
  get firstChild() { return this._fc || (this._fc = new El()); } get offsetWidth() { return 100; } get scrollHeight() { return 100; }
}
const byId = {}, docL = {}, winL = {};
const mk = (id) => byId[id] || (byId[id] = new El(id));
// a pretend button: what a click on a [data-xxx] element delivers to a document-level handler
const btn = (key, val, extra) => { const e = new El(); e.dataset[key] = val; Object.assign(e, extra); return e; };
globalThis.document = { getElementById: mk, querySelector: () => new El(), querySelectorAll: () => [], createElement: (t) => new El('', t), createElementNS: () => new El(), createTextNode: () => new El(), body: mk('body'), documentElement: mk('html'), head: mk('head'), fonts: { ready: Promise.resolve() },
  addEventListener: (t, f) => (docL[t] = docL[t] || []).push(f), removeEventListener() {}, hidden: false, activeElement: null, visibilityState: 'visible', cookie: '' };
const timers = []; let raf = null, now = 0;
const setG = (o) => { for (const k of Object.keys(o)) Object.defineProperty(globalThis, k, { value: o[k], writable: true, configurable: true }); };
setG({ window: globalThis, self: globalThis, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (t, f) => (winL[t] = winL[t] || []).push(f), removeEventListener() {},
  requestAnimationFrame: (f) => { raf = f; return 1; }, cancelAnimationFrame() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => ({ getPropertyValue: () => '' }),
  setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: (i) => { if (i > 0 && i <= timers.length) timers[i - 1] = null; }, setInterval: () => 0, clearInterval() {},
  navigator: { getGamepads: () => [], userAgent: 'node', language: 'en-US', clipboard: {} }, location: { search: '', hash: '', href: 'http://x/', protocol: 'http:' }, performance: { now: () => now }, Image: function () { return new El(); }, Audio: function () { return new El(); },
  HTMLElement: El, Element: El, ResizeObserver: function () { this.observe = () => {}; }, FontFace: function () {}, scrollTo() {}, alert() {}, confirm: () => true, prompt: () => null, open() {}, history: { replaceState() {}, pushState() {} }, screen: {} });
const store = {}; globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.sessionStorage = globalThis.localStorage; globalThis.fetch = () => Promise.reject(new Error('no net'));
for (const id of ['stage']) mk(id);
for (const id of ['controls', 'opening', 'pause', 'end', 'drillend', 'hud']) mk(id).cls.add('hidden');
const flush = () => { for (let i = 0; i < 20 && timers.some(Boolean); i++) { const l = timers.splice(0); for (const f of l) if (f) f(); } };

// ------------------------------------------------------------ boot the real scripts (index.html's order, without the browser-only extras)
const logs = [];
const realErr = console.error; console.error = (...a) => logs.push(a.join(' '));
const load = (f) => require(path.join(root, f));
for (const f of ['js/data.js', 'js/i18n.js', 'js/lang-en.js', 'js/game.js', 'js/drillspec.js', 'js/net.js', 'js/config.js', 'js/ai.js', 'js/cup.js', 'js/pres.js', 'js/career.js', 'js/career-obj.js', 'js/challenges.js', 'js/rivals.js', 'js/collection.js', 'js/sprites.js', 'js/render.js', 'js/smooth.js', 'js/audio.js', 'js/input.js', 'js/profile.js', 'js/access.js']) load(f);
const ISO = globalThis.ISO;
let bootErr = null;
try { load('js/main.js'); load('js/tutorial.js'); } catch (e) { bootErr = e; }
ok(!bootErr, 'main.js and tutorial.js boot on the stub DOM: ' + (bootErr && bootErr.stack.split('\n').slice(0, 3).join(' | ')));
if (bootErr) { console.log('FAIL\n' + bad.join('\n')); process.exit(1); }
ISO.Online = ISO.Online || { frame() {}, leave() {}, rematch() {} };      // (the server connection is not part of this test: the loop only needs it to exist)
ISO.R3D = ISO.R3D || { ensure: (cb) => cb(true), resize() {}, ready: false };      // (WebGL is not part of this test: the Views lesson only needs the switch to take)
const App = ISO.App, Tut = ISO.Tutorial, Pf = ISO.Profile, S = () => Pf.data.settings;
ISO.Audio.init = ISO.Audio.init || (() => {});
// the browser's events
const click = (el) => { const e = { target: el, stopPropagation() {}, preventDefault() {}, defaultPrevented: false }; for (const f of docL.click || []) f(e); };
const clickAct = (a) => click(btn('act', a)), clickTp = (a) => { const p = allEls.find((e) => e.id === 'tutPanel'), b = btn('tp', a); for (const f of p.L.click || []) f({ target: b, stopPropagation() {}, preventDefault() {} }); };
const key = (code) => { for (const f of winL.keydown || []) f({ code, preventDefault() {}, defaultPrevented: false, repeat: false, key: code }); };
// the main loop: real requestAnimationFrame callbacks at 60 Hz with `inp` as the player's input (App.ctrl[0] is 'human': Input.read feeds it; here the sim input is driven through ISO.Input.read)
let inp = null;      // the player's wanted sim input (a function of the game, or an object): fed through Input.get, where main.js's humanInput reads the keys (screen up = +x in the sim)
const getReal = ISO.Input.get; ISO.Input.get = function (m, i) { if (!inp) return getReal.apply(this, arguments); const o = Object.assign({}, ISO.Game.ZERO, typeof inp === 'function' ? inp(App.G) : inp); return Object.assign(o, { mx: o.my || 0, my: -(o.mx || 0) }); };
const frames = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; flush(); const f = raf; if (f) f(now); } };
const secs = (s, stop) => { for (let i = 0; i < s * 60; i++) { frames(1); if (stop && stop()) return true; } return !!(stop && stop()); };
frames(2);
const panel = () => allEls.find((e) => e.id === 'tutPanel') || new El();
const panelText = () => panel().innerText;
const hiddenP = () => panel().cls.has('hidden');

// ------------------------------------------------------------ 1. a lesson starts through the lesson list: the lesson game is the one main.js builds
Pf.setSetting('hint', true); click(btn('tut', 'rebound'));
ok(App.hintT === 0, 'the controls hint of a match is not drawn over a lesson');
ok(App.mode === 'tut' && App.tut && App.tut.id === 'rebound' && App.screen === 'match', 'clicking a lesson card starts the lesson in the match screen');
ok(App.G && App.G.keeper.dummy === true && !App.G.ball.owner && ISO.inBox(App.G.ball), 'buildMatch applied Tutorial.setup: a mannequin keeper and the loose ball in the box');
ok(App.G.win === 1e9 && App.G.solo === false, 'the lesson game is the duel override of Tutorial.simOpts (nobody can win)');
ok(!App.demo && App.tutHold === false, 'a lesson is not the menu demo');
ok(mk('pRestart').textContent === ISO.I18n.t('btn.restart_lesson'), 'the pause menu says RESTART LESSON in a lesson');
secs(5, () => App.G.phase === 'play'); frames(3);
ok(!hiddenP() && /rebound|loose|penalty box/i.test(panelText() + ISO.I18n.t(App.tut.view().key)), 'the instruction panel is up during the lesson');
// win the ball, the step flashes ok and the pitch freezes (tutHold), then the next step
inp = (G) => { const p = G.players[0], b = G.ball, d = Math.hypot(b.x - p.x, b.y - p.y) || 1; return { mx: (b.x - p.x) / d, my: (b.y - p.y) / d }; };
secs(12, () => App.tut.state === 'ok');
ok(App.tut.state === 'ok' && App.tutHold === true, 'winning the ball starts the "ok" flash and the main loop is frozen by tutHold');
{ const t0 = App.G.t; frames(20); ok(App.G.t === t0, 'the main loop does not step the sim while tutHold is set'); }
secs(2, () => App.tut.idx === 1); ok(App.tut.idx === 1 && App.tutHold === false, 'after the flash the lesson moves on and the freeze is released');
// panel buttons: SKIP skips (it does not restart)
{ const G0 = App.G; clickTp('skip'); frames(3); ok(App.tut.idx === 2 && App.G === G0, 'the panel SKIP button moves to the next step (it does not rebuild the sim)'); }
{ clickTp('retry'); flush(); frames(3); ok(App.tut.idx === 2 && App.tut.rebuilding === false && App.G.t < 1, 'the panel RETRY button starts the situation over (a new sim)'); }
// ESC and the pause menu: pause, RESTART LESSON, QUIT TO MENU
secs(4, () => App.G.phase === 'play'); key('Escape'); ok(App.paused === true, 'ESC pauses a lesson');
{ const idxBefore = App.tut.id; clickAct('restart'); flush(); frames(3); ok(App.mode === 'tut' && App.tut && App.tut.id === idxBefore && App.tut.idx === 0 && App.paused === false, 'RESTART LESSON in the pause menu restarts the lesson from step 1'); }
// finish by skipping: the card, the freeze, the list
for (let i = 0; i < 4 && App.tut.state !== 'done'; i++) { clickTp('skip'); flush(); frames(3); }
ok(App.tut.state === 'done', 'skipping every step ends the lesson'); secs(8, () => App.tutHold);
ok(App.tutHold === true && /NEXT LESSON|REPLAY/i.test(panelText()) && !hiddenP(), 'the finished lesson shows its card and the pitch stands still under it');
// ------------------------------------------------------------ 2. the leak: an online game starts after a lesson ended, the freeze must not follow it
App.mode = 'tut'; const leakG = App.G;
{
  const picks = [{ id: 'messi' }, { id: 'ronaldo' }];
  App.startOnline(picks, ['A', 'B'], 0, 0, null);
  ok(App.tut === null && App.tutHold === false, 'starting an online game ends the lesson: App.tut and tutHold are cleared');
  frames(2); ok(hiddenP(), 'the lesson panel is gone in an online game');
}
// the frozen flag is cleared by a frame even if something left it behind
App.mode = 'cpu'; App.tutHold = true; frames(2); ok(App.tutHold === false, 'a frame outside a lesson clears a stale tutHold');
// a quick match after a lesson: it is a normal game and it runs
{
  click(btn('tut', 'rebound')); secs(5, () => App.G.phase === 'play'); secs(12, () => App.tut.state === 'ok'); secs(2, () => App.tut.idx === 1);
  App.tut.skip(App.G); App.tut.skip(App.G); frames(3); ok(App.tut.state === 'done', 'the lesson reached its end card'); secs(2, () => App.tutHold);
  App.mode = 'cpu'; App.drill = 'arena'; App.pick = [ISO.playerById('messi'), ISO.playerById('ronaldo')]; App.startMatch(); frames(2);
  ok(App.tut === null && App.tutHold === false && App.mode === 'cpu', 'a Quick Match after a finished lesson clears the lesson and its freeze');
  inp = null; const t0 = App.G.t; secs(5); ok(App.G.t > t0, 'and that match is stepped by the main loop');
  ISO.App.paused = false;
}
// ------------------------------------------------------------ 3. leaving: QUIT TO MENU in a lesson goes through Tutorial.exit (lesson ended, mode back, the menu is up)
{
  click(btn('tut', 'move')); secs(3, () => App.G.phase === 'play'); ok(App.mode === 'tut', 'lesson 1 running');
  key('Escape'); clickAct('quit-menu'); frames(2);
  ok(App.tut === null && App.mode !== 'tut' && App.screen === 'menu' && App.paused === false, 'QUIT TO MENU in a lesson ends it (App.tut cleared, the mode is not tut, the menu is up)'); ok(hiddenP(), 'and the panel is hidden');
  ok(App.screen === 'menu' && App.demo, 'the menu shows the demo again, and it runs: ' + App.screen);
  { const t0 = App.G && App.G.t; secs(2); ok(App.G && App.G.t > t0, 'the menu demo is stepped after a lesson'); }
}
// ------------------------------------------------------------ 3b. a paused lesson stays paused (no stall timer, no ok / flash timers on paused frames)
{
  click(btn('tut', 'defend')); secs(4, () => App.G.phase === 'play'); App.tut.skip(App.G); frames(3);
  ok(App.tut.idx === 1 && App.tut.id === 'defend', 'Defending step 2 (tackle) is up');
  const o = App.G.ball.owner; if (o) { o.hasBall = false; } App.G.ball.owner = null; App.G.ball.vx = 0; App.G.ball.vy = 0; frames(2);
  key('Escape'); const G0 = App.G, t0 = G0.t, i0 = App.tut.idx; secs(3);
  ok(App.paused === true && App.G === G0 && App.tut.idx === i0 && App.G.t === t0, 'ESC with the ball loose in the tackle step: 3 s later still paused, same step, same sim');
  clickAct('resume'); App.paused = false; clickAct('quit-menu'); frames(2);
  click(btn('tut', 'shoot')); secs(4, () => App.G.phase === 'play');
  App.tut.skip(App.G); frames(3); App.tut.state = 'ok'; App.tut.okT = 0.5; const i1 = App.tut.idx;
  key('Escape'); secs(2); ok(App.paused === true && App.tut.idx === i1 && App.tut.state === 'ok', 'ESC during the ok flash does not advance the lesson');
  App.paused = false; clickAct('quit-menu'); frames(2);
}
// ------------------------------------------------------------ 4. the Views lesson, through the real handlers
{
  Pf.setSetting('camera', 'classic'); App.setMouse(false); Pf.setSetting('cam3d', Pf.data.settings.cam3d);
  const cam0 = S().camera, cam3 = S().cam3d, mouse0 = S().mouseAim;
  click(btn('tut', 'views')); secs(4, () => App.G.phase === 'play');
  ok(Pf.tutSnap() && Pf.tutSnap().camera === cam0 && Pf.tutSnap().mouseAim === mouse0, 'starting the Views lesson saves its settings snapshot in the profile (a reload mid-lesson restores it)');
  key('Escape'); secs(3, () => App.tut.idx === 1); ok(App.paused === true && App.tut.idx === 1, 'ESC opens the pause menu and completes step 1 (through the keydown handler)');
  clickAct('toggle-3d'); frames(3); ok(S().camera !== cam0, 'the VIEW button changed the camera setting'); secs(2, () => App.tut.idx === 2);
  ok(App.tut.idx === 2, 'switching the view through the real VIEW button completes step 2');
  key('Escape'); frames(2); clickAct('mouse'); ok(S().mouseAim === !mouse0, 'the MOUSE AIM button changed mouse aiming');
  // leaving the lesson puts everything back
  key('Escape'); clickAct('quit-menu'); frames(2);
  ok(S().camera === cam0 && S().mouseAim === mouse0 && S().cam3d === cam3, 'leaving the Views lesson restores the camera, the 3D camera and mouse aiming'); ok(Pf.tutSnap() === null, 'and clears the saved snapshot');
}
// ------------------------------------------------------------ 5. the first-run offer and the PLAY THE TUTORIAL button
{
  const nudge = () => allEls.find((e) => e.id === 'tutNudge');
  Pf.reset(); delete Pf.data.settings.tut; Pf.data.stats.matches = 0; App.show('menu'); ok(nudge() && !nudge().cls.has('hidden'), 'a fresh profile is offered the tutorial on the main menu');
  App.show('select'); ok(nudge().cls.has('hidden'), 'the offer is hidden away from the menu');
  App.show('menu'); click(btn('tutAct', 'nudge-no')); ok(nudge().cls.has('hidden') && Pf.tutState().seen === true, '"no thanks" hides the offer for good'); App.show('select'); App.show('menu'); ok(nudge().cls.has('hidden'), 'and it does not come back');
  Pf.reset(); delete Pf.data.settings.tut; App.show('select'); App.show('menu'); click(btn('tutAct', 'nudge-yes')); ok(App.mode === 'tut' && App.tut && App.tut.id === Tut.ORDER[0], 'the offer\'s yes starts lesson 1');
  App.tut && (App.paused = false); clickAct('quit-menu');
  // the Controls guide: its tutorial button hides inside a match
  const cb = new El(); const real = document.querySelector; document.querySelector = (s) => (/data-tut-act="open"/.test(s) ? cb : new El());
  Tut.syncControls('match'); ok(cb.cls.has('hidden'), 'PLAY THE TUTORIAL is hidden while a match is running'); Tut.syncControls('menu'); ok(!cb.cls.has('hidden'), 'and shown on the menus'); document.querySelector = real;
  App.show('menu'); mk('controls').cls.add('hidden'); click(btn('tutAct', 'open')); ok(App.screen === 'tutorial', 'the guide\'s PLAY THE TUTORIAL opens the lesson list from a menu');
}
console.error = realErr;
console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'tutorial-wiring-test OK');
process.exit(bad.length ? 1 : 0);
