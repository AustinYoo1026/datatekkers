// Settings, accessibility and bindings (roadmap 9.1), headless: node tools/settings-test.js
require('../js/data.js'); require('../js/game.js'); require('../js/ai.js'); require('../js/cup.js'); require('../js/career.js'); require('../js/career-obj.js'); require('../js/challenges.js');
const ISO = globalThis.ISO, bad = [], ok = (c, m) => { if (!c && !bad.includes(m)) bad.push(m); };
const store = {}, KEY = 'isofootball.profile.v1';
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const noop = () => {};
globalThis.window = globalThis; globalThis.addEventListener = noop; globalThis.navigator = { getGamepads: () => [] };
require('../js/input.js'); require('../js/access.js');
const PATH = require.resolve('../js/profile.js');
const load = () => { delete require.cache[PATH]; delete ISO.Profile; require('../js/profile.js'); return ISO.Profile; };
const NEW = ['uiScale', 'palette', 'hcHud', 'motion', 'flash', 'hudLabels', 'hudFxText', 'hudStam', 'lang', 'quality', 'padLayout', 'padDz', 'mRain', 'mTurf'];

// a schema-5 profile that predates the new keys
let P = load(); const old = JSON.parse(JSON.stringify(P.data));
for (const k of NEW) delete old.settings[k]; delete old.chal; delete old.stats.chDone;
store[KEY] = JSON.stringify(old); P = load();
ok(P.data.schema === 5, 'schema stays 5');
const D = { uiScale: 1, palette: 'default', hcHud: false, motion: null, flash: true, hudLabels: true, hudFxText: true, hudStam: true, lang: 'en', quality: 'auto', padLayout: 'classic', padDz: 0.22, mRain: false, mTurf: 'grass' };
for (const k of NEW) ok(JSON.stringify(P.data.settings[k]) === JSON.stringify(D[k]), 'default for ' + k + ' is ' + JSON.stringify(P.data.settings[k]));
ok(P.data.chal && P.data.chal.v === 1, 'chal back-filled'); ok(P.data.stats.chDone === 0, 'stats.chDone back-filled');
ok(P.data.settings.speed === 0.75 && P.data.settings.weather === true, 'the dead speed and weather settings are left in place');
// a profile saved by a newer build keeps its number
const fut = JSON.parse(JSON.stringify(P.data)); fut.schema = 99; store[KEY] = JSON.stringify(fut); P = load(); ok(P.data.schema === 99, 'schema 99 is kept');
// clamping
const S = { uiScale: 9, palette: 'neon', hcHud: 'yes', motion: 'x', flash: 0, hudLabels: null, lang: 'EN-us!', quality: 5, padLayout: 'z', padDz: -1, mRain: 1, mTurf: 'ice' };
ISO.Access.clean(S);
ok(S.uiScale === 1.3 && S.palette === 'default' && S.hcHud === false && S.motion === null && S.flash === true && S.hudLabels === true && S.lang === 'en' && S.quality === 'auto' && S.padLayout === 'classic' && S.padDz === 0.05 && S.mRain === false && S.mTurf === 'grass', 'clean() clamps and enum-checks: ' + JSON.stringify(S));
ok(ISO.Access.clean({ uiScale: 0.1, padDz: 9 }).uiScale === 0.85, 'uiScale floor'); ok(ISO.Access.clean({ padDz: 9 }).padDz === 0.5, 'padDz ceiling');
ok(ISO.Access.reduced({ motion: true }, false) && !ISO.Access.reduced({ motion: false }, true) && ISO.Access.reduced({ motion: null }, true) && !ISO.Access.reduced({ motion: null }, false), 'reduced() follows the OS only on null');
ok(ISO.Access.PALETTES.default === null && ISO.Access.PALETTES.cb.length === 2 && ISO.Access.PALETTES.hc.length === 2, 'palettes');
// reset keeps settings
P = load(); P.setSetting('uiScale', 1.2); P.setSetting('lang', 'es'); P.reset(); ok(P.data.settings.uiScale === 1.2 && P.data.settings.lang === 'es', 'reset() keeps settings');
// presets: no clash between any two actions that may not share a key
const IN = ISO.Input;
for (const id of Object.keys(IN.PRESETS)) {
  IN.setBindings(JSON.parse(JSON.stringify(IN.PRESETS[id])));
  const B = IN.bindings, seen = {};
  for (const [a] of IN.ACTIONS) for (const code of B[a].filter(Boolean)) { for (const [b, a2] of (seen[code] || [])) void b, void a2; (seen[code] = seen[code] || []).push([a]); }
  for (const code of Object.keys(seen)) { const l = seen[code].map((x) => x[0]); for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) ok(!IN.clash(l[i], l[j]), id + ': ' + code + ' is bound to both ' + l[i] + ' and ' + l[j]); }
  for (const [a] of IN.ACTIONS) ok(B[a].some(Boolean), id + ': ' + a + ' is unbound');
}
IN.setBindings(null);
ok(IN.get('solo', 0).mx === 0, 'keyboard default path untouched'); IN.setPad({ layout: 'chords', dz: 9 }); IN.setPad({ layout: 'bogus' });
console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'settings-test OK');
process.exit(bad.length ? 1 : 0);
