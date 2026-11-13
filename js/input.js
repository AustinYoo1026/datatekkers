/* ISO FOOTBALL — keyboard (and optional gamepad) input, mapped to game actions. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  // One player. Skill moves are chords of J / K / L. Every action has two rebindable key slots (Settings › Keyboard);
  // the mouse buttons ride along on shoot and power shot.
  const ACTIONS = [['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'], ['sprint', 'Sprint'],
    ['shoot', 'Shoot · Tackle'], ['finesse', 'Finesse shot'], ['chip', 'Power shot'], ['lob', 'Chip shot'], ['j', 'Skill key 1'], ['k', 'Skill key 2'], ['l', 'Skill key 3'],
    ['jockey', 'Jockey · Close control · Shield'], ['pass', 'Pass (2v2)'], ['tackle', 'Tackle (defending)'], ['slide', 'Slide tackle (defending)'], ['shoulder', 'Shoulder barge (defending)'], ['focus', 'Focus stance (defending)']];
  // Attacking and defending actions may share keys: you are one or the other. Everything else (movement, sprint, jockey) is both.
  const DEFENCE = new Set(['tackle', 'slide', 'shoulder', 'focus']), OFFENCE = new Set(['shoot', 'finesse', 'chip', 'lob', 'j', 'k', 'l', 'pass']);
  const clash = (a, b) => !((DEFENCE.has(a) && OFFENCE.has(b)) || (OFFENCE.has(a) && DEFENCE.has(b)));
  const DEFAULT_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'], shoot: ['Space', 'Mouse0'], finesse: ['KeyF', null], chip: ['KeyQ', 'Mouse2'], lob: ['KeyE', null], j: ['KeyJ', null], k: ['KeyK', null], l: ['KeyL', null],
    jockey: ['ControlLeft', 'KeyC'], pass: ['KeyR', null], tackle: ['KeyJ', null], slide: ['KeyK', null], shoulder: ['KeyL', null], focus: ['KeyE', null] };
  // Phase 9.1 presets (Settings › Keyboard buttons call saveKeys(PRESETS[id])); 'default' is DEFAULT_KEYS. Offence and defence keys may share (see clash).
  const PRESETS = {
    default: DEFAULT_KEYS,
    lefty: { up: ['KeyI', null], down: ['KeyK', null], left: ['KeyJ', null], right: ['KeyL', null], sprint: ['ShiftRight', 'ShiftLeft'], shoot: ['Space', 'Mouse0'], finesse: ['KeyF', null], chip: ['KeyQ', 'Mouse2'], lob: ['KeyE', null],
      j: ['KeyA', null], k: ['KeyS', null], l: ['KeyD', null], jockey: ['ControlLeft', 'KeyC'], pass: ['KeyR', null], tackle: ['KeyA', null], slide: ['KeyS', null], shoulder: ['KeyD', null], focus: ['KeyE', null] },
    arrows: { up: ['ArrowUp', null], down: ['ArrowDown', null], left: ['ArrowLeft', null], right: ['ArrowRight', null], sprint: ['ShiftRight', 'ShiftLeft'], shoot: ['Space', 'Mouse0'], finesse: ['KeyF', null], chip: ['KeyQ', 'Mouse2'], lob: ['KeyE', null],
      j: ['KeyZ', null], k: ['KeyX', null], l: ['KeyC', null], jockey: ['ControlLeft', 'KeyV'], pass: ['KeyR', null], tackle: ['KeyZ', null], slide: ['KeyX', null], shoulder: ['KeyC', null], focus: ['KeyE', null] },
  };
  let padLayout = 'classic', padDz = 0.22;      // Settings › gamepad layout and stick deadzone (ISO.Access.apply calls setPad)
  const MAPS = {};
  let binds = null, combos = [];      // a binding can be one key or a combination written 'ShiftLeft+KeyQ'
  const GAME_KEYS = new Set();
  function setBindings(b) {
    binds = {};
    for (const [a] of ACTIONS) binds[a] = ((b && b[a]) || DEFAULT_KEYS[a]).slice(0, 2);
    MAPS.solo = {};
    for (const [a] of ACTIONS) MAPS.solo[a] = binds[a].filter(Boolean);
    GAME_KEYS.clear();
    for (const k of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']) GAME_KEYS.add(k);
    combos = [];
    for (const list of Object.values(MAPS.solo)) for (const k of list) {
      for (const part of k.split('+')) GAME_KEYS.add(part);
      if (k.indexOf('+') > 0) combos.push(k.split('+'));
    }
  }
  setBindings(null);
  const NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'Alt', AltRight: 'R-Alt', MetaLeft: 'Cmd', MetaRight: 'R-Cmd', Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
    BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps', Enter: 'Enter', Tab: 'Tab' };
  function label(code) {
    if (!code) return '—';
    if (code.indexOf('+') > 0) return code.split('+').map(label).join('+');
    if (code.startsWith('Mouse')) return ['Left Click', 'Middle Click', 'Right Click', 'Mouse 4', 'Mouse 5'][+code.slice(5)] || code;
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return NAMES[code] || code;
  }
  const keyLabel = (a) => label(binds[a].find(Boolean));

  const held = new Set(), latched = new Set();
  let capture = false;      // only swallow browser shortcuts while a match is on screen
  let mouseOn = true;       // Settings › Mouse aiming: only the cursor aim; mouse buttons are ordinary bindable inputs

  let lastDownT = 0;      // e.timeStamp of the latest keydown: the debug HUD's keydown-to-draw estimate reads it
  window.addEventListener('keydown', (e) => {
    lastDownT = e.timeStamp;
    if (capture && GAME_KEYS.has(e.code) && !e.metaKey) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code); latched.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  // mouse: the cursor aims, left button shoots, right button is the power shot (only while a match is on screen)
  const mouse = { x: 0, y: 0, moved: false };
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (capture) mouse.moved = true; });
  window.addEventListener('mousedown', (e) => { if (!capture) return; const k = 'Mouse' + e.button; held.add(k); latched.add(k); });
  window.addEventListener('mouseup', (e) => held.delete('Mouse' + e.button));
  window.addEventListener('contextmenu', (e) => { if (capture) e.preventDefault(); });
  window.addEventListener('blur', () => { held.clear(); latched.clear(); });

  const down = (k) => held.has(k) || latched.has(k);
  // a combination fires only while every key in it is down; its keys do not also fire their own single-key actions
  const shadowed = (k) => combos.some((c) => c.indexOf(k) >= 0 && c.every(down));
  const on = (list) => {
    for (const k of list) {
      if (k.indexOf('+') > 0) { if (k.split('+').every(down)) return true; }
      else if (down(k) && !shadowed(k)) return true;
    }
    return false;
  };

  function pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && pads[i];
    if (!g || !g.connected) return null;
    const b = (n) => !!(g.buttons[n] && g.buttons[n].pressed), dz = (v) => (Math.abs(v) < padDz ? 0 : v);
    const mv = { mx: dz(g.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), my: dz(g.axes[1] || 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0) };
    if (padLayout === 'chords') {      // LB is skill key 2, RB skill key 3; the triggers stay sprint (RT) and jockey (LT); lob and focus on the stick clicks
      return Object.assign(mv, { shoot: b(0), finesse: b(1), j: b(2), k: b(4), l: b(5), chip: b(3), lob: b(9) || b(10) || b(11), sprint: b(7), jockey: b(6), pass: b(8), tackle: b(2), slide: b(4), shoulder: b(5), focus: b(9) || b(10) || b(11) });
    }
    return Object.assign(mv, { shoot: b(0), finesse: b(1), j: b(2), k: false, l: false, chip: b(3), lob: b(9) || b(10) || b(11), sprint: b(7) || b(5), jockey: b(6) || b(4), pass: b(8), tackle: b(2), slide: b(1), shoulder: b(3), focus: b(9) || b(10) || b(11) });
  }

  function get(mapName, padIndex) {
    const m = MAPS[mapName];
    const o = { mx: (on(m.right) ? 1 : 0) - (on(m.left) ? 1 : 0), my: (on(m.down) ? 1 : 0) - (on(m.up) ? 1 : 0),
      sprint: on(m.sprint), jockey: on(m.jockey), shoot: on(m.shoot), finesse: on(m.finesse), chip: on(m.chip), lob: on(m.lob), j: on(m.j), k: on(m.k), l: on(m.l), pass: on(m.pass), tackle: on(m.tackle), slide: on(m.slide), shoulder: on(m.shoulder), focus: on(m.focus) };
    o.skill = o.j || o.k || o.l;
    const g = pad(padIndex);
    if (g) {
      if (!o.mx && !o.my) { o.mx = g.mx; o.my = g.my; }
      for (const k of ['sprint', 'jockey', 'shoot', 'finesse', 'chip', 'lob', 'j', 'k', 'l', 'pass', 'tackle', 'slide', 'shoulder', 'focus']) o[k] = o[k] || g[k];
      o.skill = o.j || o.k || o.l;
    }
    return o;
  }

  ISO.Input = {
    get, MAPS, clash, mouse, ACTIONS, DEFAULT_KEYS, PRESETS, setBindings, label, keyLabel,
    setPad(o) { if (o && (o.layout === 'classic' || o.layout === 'chords')) padLayout = o.layout; if (o && Number.isFinite(o.dz)) padDz = Math.max(0.05, Math.min(0.5, o.dz)); },
    get lastDownT() { return lastDownT; },      // read-only, for the debug HUD
    get live() { return { held: Array.from(held), latched: Array.from(latched), pad: padLayout + ' dz ' + padDz }; },
    get bindings() { return JSON.parse(JSON.stringify(binds)); },
    consume() { latched.clear(); },      // call once the simulation has seen this frame's taps
    setCapture(v) { capture = v; if (!v) { held.clear(); latched.clear(); } },
    resetMouse() { mouse.moved = false; },
    setMouse(v) { mouseOn = !!v; },
  };
})();
