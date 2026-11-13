// Localisation check (roadmap 9.3): node tools/i18n-check.js [--extract]
// Blocking: every data-i18n* / T('..') / I18n.t|n|opt('..') key exists in en; the en values match the inline index.html text (drift); every shipped language has every en key,
// matching {placeholders}, matching tag multiset for html keys, and no empty values. Warnings: unused keys, translations over 1.4x the English length on btn. / seg. / hud. keys.
// --extract prints the en entries found inline in index.html (key -> text) as JSON.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const html = read('index.html');
// ---- inline text per key
const inline = {}, used = new Set();
{
  const re = /<([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g; let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), at = m[2];
    const g = (n) => { const x = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(at); return x ? x[1] : null; };
    const k = g('data-i18n'), kh = g('data-i18n-html'), kt = g('data-i18n-title'), kp = g('data-i18n-ph');
    if (kt) { inline[kt] = unesc(g('title') || ''); used.add(kt); }
    if (kp) { inline[kp] = unesc(g('placeholder') || ''); used.add(kp); }
    if (k || kh) {
      let depth = 1, i = re.lastIndex; const tr = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); tr.lastIndex = i; let t;
      while ((t = tr.exec(html))) { depth += t[1] ? -1 : 1; if (!depth) break; }
      const inner = html.slice(i, t ? t.index : i);
      if (k) { inline[k] = unesc(inner.replace(/\s+/g, ' ').trim()); used.add(k); }
      if (kh) { inline[kh] = inner.trim(); used.add(kh); }
    }
  }
}
if (process.argv.includes('--extract')) { console.log(JSON.stringify(inline, null, 1)); process.exit(0); }

// ---- the language tables (flat files in js/)
const ISO = (globalThis.ISO = {});
const tables = {}, metas = {};
ISO.I18n = { add: (c, t, m) => { tables[c] = Object.assign(tables[c] || {}, t); metas[c] = m || {}; } };
const langs = fs.readdirSync(path.join(root, 'js')).filter((f) => /^lang-[a-z]{2,3}\.js$/.test(f));
for (const f of langs) require(path.join(root, 'js', f));
const bad = [], warn = [];
const en = tables.en;
if (!en) { console.log('FAIL: js/lang-en.js missing'); process.exit(1); }
// ---- keys used in code
const files = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && !/^lang-/.test(f)).map((f) => 'js/' + f);
const planned = new Set();
for (const f of files) {
  const s = read(f);
  for (const m of s.matchAll(/(?<![\w$.])T\('([a-z0-9_.]+)'/gi)) planned.add(m[1]);
  for (const m of s.matchAll(/I18n\.t\('([a-z0-9_.]+)'/gi)) planned.add(m[1]);
  for (const m of s.matchAll(/I18n\.n\('([a-z0-9_.]+)'/gi)) { planned.add(m[1] + '.one'); planned.add(m[1] + '.other'); }
}
for (const k of used) if (!(k in en)) bad.push('index.html uses a key missing in en: ' + k);
for (const k of planned) if (k.endsWith('.')) planned.delete(k);
for (const k of Array.from(planned)) if (k.endsWith('.')) planned.delete(k);
for (const k of planned) if (!(k in en) && !/\.(one|other)$/.test(k)) bad.push('code uses a key missing in en: ' + k);
for (const k of planned) if (/\.(one|other)$/.test(k) && !(k in en)) bad.push('code uses a plural key missing in en: ' + k);
for (const k of Object.keys(inline)) if (k in en && en[k] !== inline[k]) bad.push('drift: ' + k + '\n   html: ' + JSON.stringify(inline[k]) + '\n   en:   ' + JSON.stringify(en[k]));
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(','), tags = (s) => (String(s).match(/<\/?[a-z]+[^>]*>/gi) || []).map((t) => t.toLowerCase().replace(/\s.*>/, '>')).sort().join(',');
for (const c of Object.keys(tables)) {
  if (c === 'en') continue;
  const T = tables[c];
  for (const k of Object.keys(en)) {
    if (!(k in T)) { if (!(metas[c] && metas[c].partial)) bad.push(c + ': missing ' + k); continue; }      // a partial language (ko) falls back to en per key
    if (!String(T[k]).trim()) bad.push(c + ': empty ' + k);
    if (ph(T[k]) !== ph(en[k])) bad.push(c + ': placeholders differ in ' + k + ' (' + ph(en[k]) + ' vs ' + ph(T[k]) + ')');
    if (tags(T[k]) !== tags(en[k])) bad.push(c + ': tags differ in ' + k);
    if (/^(btn|seg|hud)\./.test(k) && String(T[k]).length > 1.4 * String(en[k]).length + 2) warn.push(c + ': ' + k + ' is ' + (String(T[k]).length / String(en[k]).length).toFixed(2) + 'x the English length');
  }
  for (const k of Object.keys(T)) if (!(k in en)) bad.push(c + ': extra key not in en: ' + k);
}
// keys chosen at run time (ternaries / string concatenation the scan cannot see): whitelisted by prefix. 9.4 session 2: the 18 ternary-selected keys
const dyn = /^(diff|drill|act|kbg|chal|common|de|trait|role|celeb|map|rival)\.|^btn\.(forfeit_match|view_)|^end\.(cpu_win_tail|tougher_x|weaker_x|you_win_tail)|^hud\.your_team|^sel\.(cpu|keeper|street)/;
const unusedKeys = Object.keys(en).filter((k) => !used.has(k) && !planned.has(k) && !dyn.test(k) && !/\.(one|other)$/.test(k));
console.log('languages: ' + Object.keys(tables).join(', ') + ' | en keys ' + Object.keys(en).length + ' | inline keys ' + used.size + ' | code keys ' + planned.size);
if (unusedKeys.length) console.log('unused keys (' + unusedKeys.length + '): ' + unusedKeys.slice(0, 40).join(' ') + (unusedKeys.length > 40 ? ' ...' : ''));
for (const w of warn) console.log('warning: ' + w);
if (bad.length) { console.log('FAIL\n' + bad.slice(0, 80).join('\n') + (bad.length > 80 ? '\n... ' + (bad.length - 80) + ' more' : '')); process.exit(1); }
console.log('i18n-check OK');
