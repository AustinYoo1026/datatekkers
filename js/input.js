/* ISO FOOTBALL — keyboard (and optional gamepad) input, mapped to game actions. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  const MAPS = {
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'], shoot: ['Space'],
      finesse: ['KeyF'], chip: ['KeyQ'], skill: ['KeyE'], jockey: ['ControlLeft', 'KeyC'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['ShiftRight', 'KeyL'], shoot: ['KeyM'],
      finesse: ['Comma'], chip: ['KeyN'], skill: ['Period'], jockey: ['KeyK'] },
  };
  // 1-player mode: the arrow keys and right-hand modifiers also drive player 1
  MAPS.solo = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'], shoot: ['Space'], finesse: ['KeyF'], chip: ['KeyQ'], skill: ['KeyE'], jockey: ['ControlLeft', 'ControlRight', 'KeyC'] };

  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  for (const m of Object.values(MAPS)) for (const list of Object.values(m)) for (const k of list) GAME_KEYS.add(k);

  const held = new Set(), latched = new Set();
  let capture = false;      // only swallow browser shortcuts while a match is on screen

  window.addEventListener('keydown', (e) => {
    if (capture && GAME_KEYS.has(e.code) && !e.metaKey) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code); latched.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); latched.clear(); });

  const on = (list) => { for (const k of list) if (held.has(k) || latched.has(k)) return true; return false; };

  function pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && pads[i];
    if (!g || !g.connected) return null;
    const b = (n) => !!(g.buttons[n] && g.buttons[n].pressed), dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
    return { mx: dz(g.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), my: dz(g.axes[1] || 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0),
      shoot: b(0), finesse: b(1), skill: b(2), chip: b(3), sprint: b(7) || b(5), jockey: b(6) || b(4) };
  }

  function get(mapName, padIndex) {
    const m = MAPS[mapName];
    const o = { mx: (on(m.right) ? 1 : 0) - (on(m.left) ? 1 : 0), my: (on(m.down) ? 1 : 0) - (on(m.up) ? 1 : 0),
      sprint: on(m.sprint), jockey: on(m.jockey), shoot: on(m.shoot), finesse: on(m.finesse), chip: on(m.chip), skill: on(m.skill) };
    const g = pad(padIndex);
    if (g) {
      if (!o.mx && !o.my) { o.mx = g.mx; o.my = g.my; }
      for (const k of ['sprint', 'jockey', 'shoot', 'finesse', 'chip', 'skill']) o[k] = o[k] || g[k];
    }
    return o;
  }

  ISO.Input = {
    get, MAPS,
    consume() { latched.clear(); },      // call once the simulation has seen this frame's taps
    setCapture(v) { capture = v; if (!v) { held.clear(); latched.clear(); } },
  };
})();
