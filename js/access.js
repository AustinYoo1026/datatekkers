/* ISO FOOTBALL — settings and accessibility (roadmap 9.1). `clean` / `reduced` / PALETTES are pure (node-loadable, no DOM);
   `apply` is the DOM side: CSS variables and body classes, the team colours written IN PLACE into the renderers' arrays, the gamepad layout.
   The live flags (scale, hc, rm, noFlash, labels, fxText) are read every frame by render.js and js/3d/fx3d.js. Never touches the simulation. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  // null keeps the renderers' own defaults (2D green / amber, 3D blue / red: the mismatch is old and is kept on purpose)
  const PALETTES = { default: null, cb: ['#4da3ff', '#ff9d2e'], hc: ['#ffffff', '#ffe600'] };
  const QUALITY = ['auto', 'low', 'med', 'high'], LAYOUTS = ['classic', 'chords'], TURFS = ['grass', 'firm', 'lush', 'astro'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d, a, b) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
  // sanitise the 9.1 settings in place (a hand-edited or corrupt profile never reaches the renderers); returns the settings object
  function clean(S) {
    if (!S || typeof S !== 'object') return S;
    S.uiScale = Math.round(num(S.uiScale, 1, 0.85, 1.3) * 100) / 100;
    if (!Object.prototype.hasOwnProperty.call(PALETTES, S.palette)) S.palette = 'default';
    S.hcHud = S.hcHud === true;
    S.motion = S.motion === true || S.motion === false ? S.motion : null;
    for (const k of ['flash', 'hudLabels', 'hudFxText', 'hudStam']) S[k] = S[k] !== false;
    S.lang = typeof S.lang === 'string' && /^[a-z]{2,3}$/.test(S.lang) ? S.lang : 'en';
    if (QUALITY.indexOf(S.quality) < 0) S.quality = 'auto';
    if (LAYOUTS.indexOf(S.padLayout) < 0) S.padLayout = 'classic';
    S.padDz = Math.round(num(S.padDz, 0.22, 0.05, 0.5) * 100) / 100;
    S.mRain = S.mRain === true;
    if (typeof S.mTurf !== 'string' || TURFS.indexOf(S.mTurf) < 0) S.mTurf = 'grass';
    return S;
  }
  // reduce motion: an explicit choice wins; null follows the operating system
  const reduced = (S, osPref) => (S && S.motion === true ? true : S && S.motion === false ? false : !!osPref);

  const live = { scale: 1, hc: false, rm: false, noFlash: false, labels: true, fxText: true };
  let def2d = null, def3d = null;
  function apply(S) {
    S = clean(S || (ISO.Profile && ISO.Profile.data.settings));
    if (!S) return live;
    const os = typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;
    live.scale = S.uiScale; live.hc = S.hcHud || S.palette === 'hc'; live.rm = reduced(S, os); live.noFlash = !S.flash; live.labels = S.hudLabels; live.fxText = S.hudFxText;
    const R = ISO.Render, R3 = ISO.R3D;
    if (R && R.TEAM_COL && !def2d) def2d = R.TEAM_COL.slice();
    if (R3 && R3.TEAM_COL && !def3d) def3d = R3.TEAM_COL.slice();
    const pal = PALETTES[S.palette];
    if (R && R.TEAM_COL) { const c = pal || def2d; R.TEAM_COL[0] = c[0]; R.TEAM_COL[1] = c[1]; }
    if (R3 && R3.TEAM_COL) { const c = pal || def3d; R3.TEAM_COL[0] = c[0]; R3.TEAM_COL[1] = c[1]; }
    if (typeof document !== 'undefined') {
      const st = document.getElementById('stage'), b = document.body;
      if (st) {
        const c = pal || def2d || ['#35e08a', '#ffb23d'];
        if (pal || S.palette !== 'default') { st.style.setProperty('--team0', c[0]); st.style.setProperty('--team1', c[1]); } else { st.style.removeProperty('--team0'); st.style.removeProperty('--team1'); }
        st.style.setProperty('--hud-s', String(S.uiScale));
        st.classList.toggle('nostam', !S.hudStam);
      }
      if (b) { b.classList.toggle('rm', live.rm); b.classList.toggle('nf', live.noFlash); b.classList.toggle('hc', live.hc); }
    }
    if (ISO.Input && ISO.Input.setPad) ISO.Input.setPad({ layout: S.padLayout, dz: S.padDz });
    return live;
  }
  ISO.Access = { PALETTES, QUALITY, LAYOUTS, TURFS, clean, reduced, apply, live,
    get scale() { return live.scale; }, get hc() { return live.hc; }, get rm() { return live.rm; }, get noFlash() { return live.noFlash; }, get labels() { return live.labels; }, get fxText() { return live.fxText; } };
})();
