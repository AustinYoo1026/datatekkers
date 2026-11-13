#!/usr/bin/env node
/* Ratchet for the animation quality gate (the strict gate, tools/anim-check.js, still fails: this one must never get worse).
   node tools/anim-gate.js [--update]
   Runs `anim-check.js --json`, compares with tools/anim-baseline.json {A,B,C,excessA,excessC}:
     fails if anim-check exits 2 (a module did not load / a section crashed), B > 0, a count (A, C) exceeds the baseline, or an excess
     score exceeds the baseline by more than 2 %.
   excess = sum over fails[] of max(0, min(10, value / limit - 1)) per section: how far over the limits the clips are, not only how many.
   When the numbers improve it says so: lower the baseline (--update writes the current numbers). It never touches anim-check's TH. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const dir = __dirname, basePath = path.join(dir, 'anim-baseline.json');
const r = spawnSync(process.execPath, [path.join(dir, 'anim-check.js'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 30 });
if (r.status === 2 || r.status === null) { console.log('FAIL: anim-check exited with', r.status, (r.stderr || '').slice(0, 500)); process.exit(1); }
let j; try { j = JSON.parse(r.stdout); } catch (e) { console.log('FAIL: anim-check printed no JSON:', e.message); process.exit(1); }
const cur = { A: 0, B: 0, C: 0, excessA: 0, excessC: 0 };
for (const f of j.fails || []) {
  if (!(f.section in cur)) continue;
  cur[f.section]++;
  if (f.section === 'A' || f.section === 'C') cur['excess' + f.section] += Math.max(0, Math.min(10, f.value / f.limit - 1));
}
if (j.errors && j.errors.length || Object.keys(j.loadErrors || {}).length) { console.log('FAIL: anim-check errors', JSON.stringify(j.errors), JSON.stringify(j.loadErrors)); process.exit(1); }
cur.excessA = +cur.excessA.toFixed(1); cur.excessC = +cur.excessC.toFixed(1);
if (process.argv.includes('--update')) { fs.writeFileSync(basePath, JSON.stringify(cur, null, 2) + '\n'); console.log('baseline written', cur); process.exit(0); }
const base = JSON.parse(fs.readFileSync(basePath, 'utf8')), bad = [];
if (cur.B > 0) bad.push('B (stability) fails: ' + cur.B);
for (const k of ['A', 'C']) if (cur[k] > base[k]) bad.push(k + ' count ' + cur[k] + ' > baseline ' + base[k]);
for (const k of ['excessA', 'excessC']) if (cur[k] > base[k] * 1.02) bad.push(k + ' ' + cur[k] + ' > baseline ' + base[k] + ' (+2 %)');
console.log('current ', JSON.stringify(cur)); console.log('baseline', JSON.stringify(base));
if (bad.length) { console.log('FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
const better = ['A', 'C', 'excessA', 'excessC'].some(k => cur[k] < base[k]);
if (better) console.log('Improved: lower the baseline with `node tools/anim-gate.js --update` and commit tools/anim-baseline.json.');
console.log('anim-gate OK');
