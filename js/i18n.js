/* ISO FOOTBALL — localisation (roadmap 9.3). Pure and node-loadable (the DOM parts are guarded): no Math.random, no clock.
   Language tables are FLAT files in js/ (js/lang-en.js, js/lang-es.js): server/server.js only serves js/<file>, js/3d/<file>, js/vendor/<file>.
   Keys are explicit dotted ids ('btn.resume'). The English table is the source of truth and is loaded eagerly; every other language is injected on demand by set().
   Fallback chain: the language, then English, then the key itself; every miss is recorded in `missing` (the debug HUD lists it). index.html keeps its English inline
   as the fallback and carries data-i18n* attributes. The built-in pseudo-locale `xx` (accents plus 35% padding) exists to hunt for overflow. The simulation never sees any of this. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const tables = {}, metas = {}, missing = new Set(), listeners = [];
  // the languages the build ships (a language file registers itself with add(); until it is loaded the list shows this name)
  const SHIPPED = { en: { name: 'English', review: false }, es: { name: 'Español', review: true }, xx: { name: 'Pseudo (overflow test)', review: false } };
  let lang = 'en';
  const RTL = /^(ar|he|fa|ur)(-|$)/;

  function add(code, table, meta) { tables[code] = Object.assign(tables[code] || {}, table); metas[code] = Object.assign(metas[code] || {}, meta || {}); }
  const have = (code) => code === 'xx' || !!tables[code];
  const lookup = (code, key) => (code === 'xx' ? pseudoOf(tables.en && tables.en[key]) : tables[code] && tables[code][key]);
  const fmt = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k])) : String(s));

  // pseudo-locale: accents on the letters, 35% padding, placeholders / tags / entities untouched
  const ACC = { a: 'à', e: 'é', i: 'î', o: 'õ', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', A: 'À', E: 'É', I: 'Î', O: 'Õ', U: 'Ü', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ý' };
  function pseudoOf(s) {
    if (s == null) return s;
    const parts = String(s).split(/(\{\w+\}|<[^>]+>|&[#\w]+;)/);
    let out = '', len = 0;
    for (const p of parts) { if (/^(\{\w+\}|<[^>]+>|&[#\w]+;)$/.test(p)) out += p; else { out += p.replace(/[aeiouyncsAEIOUYNCS]/g, (c) => ACC[c]); len += p.length; } }
    return '[' + out + '·'.repeat(Math.ceil(len * 0.35)) + ']';
  }

  function t(key, vars) {
    let v = lookup(lang, key);
    if (v === undefined) { if (lang !== 'en' || !(tables.en && key in tables.en)) missing.add(key); v = lang === 'en' ? undefined : tables.en && tables.en[key]; }
    return fmt(v === undefined ? key : v, vars);
  }
  // plural: key.one / key.other (and the language's other categories when a table has them); {n} is the count
  function n(key, count, vars) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(lang === 'xx' ? 'en' : lang).select(count); } catch (e) { cat = count === 1 ? 'one' : 'other'; }
    const k = lookup(lang, key + '.' + cat) !== undefined ? key + '.' + cat : (tables.en && tables.en[key + '.' + cat] !== undefined ? key + '.' + cat : key + '.other');
    return t(k, Object.assign({ n: count }, vars));
  }
  const opt = (key, fallback) => { const v = lookup(lang, key); const e = tables.en && tables.en[key]; return v !== undefined ? fmt(v) : e !== undefined && lang !== 'en' ? fmt(e) : fallback; };
  const num = (x) => { try { return Number(x).toLocaleString(lang === 'xx' ? 'en' : lang); } catch (e) { return String(x); } };
  const up = (s) => { try { return String(s).toLocaleUpperCase(lang === 'xx' ? 'en' : lang); } catch (e) { return String(s).toUpperCase(); } };
  const dir = () => (RTL.test(lang) ? 'rtl' : 'ltr');

  // data-i18n (textContent), data-i18n-html (innerHTML: trusted table text only), data-i18n-title, data-i18n-ph (placeholder)
  function apply(root) {
    if (typeof document === 'undefined') return;
    root = root || document;
    const q = (sel, fn) => root.querySelectorAll(sel).forEach(fn);
    q('[data-i18n]', (el) => { el.textContent = t(el.dataset.i18n); });
    q('[data-i18n-html]', (el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    q('[data-i18n-title]', (el) => { el.title = t(el.dataset.i18nTitle); });
    q('[data-i18n-ph]', (el) => { el.placeholder = t(el.dataset.i18nPh); });
  }
  function inject(code, cb) {
    if (typeof document === 'undefined') return cb(false);
    const s = document.createElement('script');
    s.src = 'js/lang-' + code + '.js'; s.onload = () => cb(have(code)); s.onerror = () => cb(false);
    document.head.appendChild(s);
  }
  // switch language. cb(ok): a language that cannot be loaded leaves the current one in place
  function set(code, cb) {
    const done = (ok) => {
      if (ok) {
        lang = code;
        if (typeof document !== 'undefined') { const h = document.documentElement; h.lang = code === 'xx' ? 'en-XA' : code; h.dir = dir(); }
        apply(typeof document !== 'undefined' ? document : null);
        for (const f of listeners.slice()) { try { f(code); } catch (e) { /* a listener must not break the switch */ } }
      }
      if (cb) cb(ok);
    };
    if (have(code)) done(true); else inject(code, done);
  }
  const LANGS = () => Object.keys(SHIPPED).map((c) => ({ code: c, name: (metas[c] && metas[c].name) || SHIPPED[c].name, review: metas[c] && metas[c].review !== undefined ? !!metas[c].review : SHIPPED[c].review }));
  ISO.I18n = { add, t, n, opt, num, up, set, apply, dir, have, pseudoOf, LANGS, SHIPPED, tables, missing, onChange: (f) => listeners.push(f), get lang() { return lang; } };
})();
