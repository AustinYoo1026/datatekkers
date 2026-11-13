/* ISO FOOTBALL — MyCareer seasons (roadmap 5.1): five seasons, each an eight-team league of seven matchdays.
   Pure logic, node-loadable (needs data.js and cup.js for the seeded prng/mix). No DOM, no Math.random: the season state keeps no
   results of the other teams, they are derived from the career seed (a pure function of seed, season index, attempt, matchday).
   The profile (js/profile.js) stores the state and pays the rewards; the screen is js/career-ui.js. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  // One row per season. band: who the seven rivals are drawn from; lv: the CPU level of each of the seven matchdays;
  // win: upgrade points for a win (a loss gives LOSS_PTS); prize: credits for the title; cap: the training cap (data for 5.2,
  // not enforced yet); rel: finishing at this position or below drops you a season (null: no relegation); up: top positions that go up.
  const LOSS_PTS = 3, MD = 7, SIZE = 8;
  const rep = (l, n) => Array(n).fill(l);
  ISO.SEASONS = [
    { id: 's1', name: 'BREAK THROUGH', tag: 'SEASON 1 · YOUTH LEAGUE', col: '#35e08a', band: { maxOvr: 76 }, lv: [...rep('easy', 4), ...rep('normal', 3)], win: 10, prize: 1000, cap: 75, rel: null, up: 3 },
    { id: 's2', name: 'FIRST TEAM', tag: 'SEASON 2 · ESTABLISH YOURSELF', col: '#4fa3ff', band: { minOvr: 74, maxOvr: 86 }, lv: ['easy', ...rep('normal', 6)], win: 14, prize: 1800, cap: 82, rel: 7, up: 3 },
    { id: 's3', name: 'ELITE', tag: 'SEASON 3 · THE BIG LEAGUE', col: '#b06bff', band: { minOvr: 86, maxOvr: 89 }, lv: [...rep('normal', 4), ...rep('hard', 3)], win: 18, prize: 2600, cap: 88, rel: 7, up: 3 },
    { id: 's4', name: 'LEGENDS', tag: 'SEASON 4 · AGAINST THE ICONS', col: '#ffcf4d', band: { minOvr: 90, maxOvr: 92, era: 'legend' }, lv: ['normal', ...rep('hard', 6)], win: 22, prize: 3600, cap: 94, rel: 7, up: 3 },
    { id: 's5', name: 'THE GREATEST', tag: 'SEASON 5 · BECOME THE GREATEST', col: '#f1735f', band: { minOvr: 93 }, lv: rep('hard', 7), win: 26, prize: 6000, cap: 99, rel: 7, up: 3 },
  ];
  const LAST = ISO.SEASONS.length - 1;
  const PRIZE_PCT = (pos) => (pos === 1 ? 1 : pos <= 3 ? 0.4 : pos <= 6 ? 0.1 : 0);      // champion, 2nd-3rd, 4th-6th, the rest nothing
  const clampI = (i) => Math.max(0, Math.min(LAST, i | 0));

  const prng = (s) => ISO.Cup.prng(s), mix = (...n) => ISO.Cup.mix(...n);

  // everyone who fits the season's band. If fewer than seven fit (a thin roster), the band widens by 1 overall point on each side, repeatedly:
  // deterministic and documented in PHASE5_NOTES.md (the shipped roster never needs it).
  function pool(i) {
    const b = ISO.SEASONS[clampI(i)].band;
    for (let w = 0; w < 40; w++) {
      const p = ISO.PLAYERS.filter((d) => (b.minOvr == null || d.ovr >= b.minOvr - w) && (b.maxOvr == null || d.ovr <= b.maxOvr + w) && (!b.era || w >= 20 || d.era === b.era));
      if (p.length >= MD) return p;
    }
    return ISO.PLAYERS.slice();
  }
  // slot (1..7) of the rival you meet on matchday r: o(r) = ((6 + r) % 7) + 1, so r = 0 is the weakest and r = 6 the strongest
  const slotOf = (r) => ((6 + r) % 7) + 1;

  // state: { i, n, field[7] (field[slot - 1]), md, res[] of { w, gf, ga }, live }. n is the attempt counter, so a replayed season is a new draw.
  function newSeason(seed, i, n) {
    i = clampI(i); n = Math.max(0, n | 0);
    const rnd = prng(mix(seed, i, n, 0x5ea5)), ids = pool(i).map((d) => d.id), pick = [];
    while (pick.length < MD && ids.length) pick.push(ids.splice((rnd() * ids.length) | 0, 1)[0]);
    pick.sort((a, b) => ISO.playerById(a).ovr - ISO.playerById(b).ovr || (a < b ? -1 : 1));
    const field = Array(MD);
    for (let r = 0; r < MD; r++) field[slotOf(r) - 1] = pick[r];
    return { i, n, field, md: 0, res: [], live: false };
  }

  // circle method: fixtures [slotA, slotB] of matchday r; slot 0 is you
  function schedule(r) {
    const L = [0];
    for (let j = 0; j < MD; j++) L.push(((j + r) % MD) + 1);
    const out = [];
    for (let k = 0; k < SIZE / 2; k++) out.push([L[k], L[SIZE - 1 - k]]);
    return out;
  }
  const opponentId = (sn) => (sn.md < MD ? sn.field[slotOf(sn.md) - 1] : null);
  const diffOf = (sn) => ISO.SEASONS[sn.i].lv[Math.min(sn.md, MD - 1)];

  // a derived fixture between two other teams: the same formula as cup.js rollMatch (logistic on the overall gap over 6, the winner 3, the loser 0-2)
  function roll(a, b, seed) {
    const rnd = prng(mix(seed, 0x9a11)), pa = 1 / (1 + Math.exp(-(a.ovr - b.ovr) / 6));
    const w = rnd() < pa ? 0 : 1, lo = (rnd() * 3) | 0;
    return { sa: w === 0 ? 3 : lo, sb: w === 1 ? 3 : lo, w };
  }
  // the table after the matchdays played (sn.md): rows { id | 'me', slot, p, w, l, gf, ga, pts }. No draws exist, so pts = 3 * w and a matchday hands out 12.
  // myOvr is accepted for the roadmap's signature and unused: your results are yours, the others are derived from rating alone.
  function table(seed, sn, myOvr) { // eslint-disable-line no-unused-vars
    const rows = [{ id: 'me', slot: 0 }].concat(sn.field.map((id, s) => ({ id, slot: s + 1 })));
    for (const x of rows) { x.p = 0; x.w = 0; x.l = 0; x.gf = 0; x.ga = 0; x.pts = 0; }
    const add = (x, win, gf, ga) => { x.p++; x.gf += gf; x.ga += ga; if (win) { x.w++; x.pts += 3; } else x.l++; };
    for (let r = 0; r < sn.md; r++) {
      schedule(r).forEach(([sa, sb], k) => {
        if (sa === 0 || sb === 0) {
          const m = sn.res[r], opp = rows[sa === 0 ? sb : sa];
          add(rows[0], m.w, m.gf, m.ga); add(opp, !m.w, m.ga, m.gf);
        } else {
          const A = rows[sa], B = rows[sb], x = roll(ISO.playerById(A.id), ISO.playerById(B.id), mix(seed, sn.i, sn.n, r, k, 0x7ab1));
          add(A, x.w === 0, x.sa, x.sb); add(B, x.w === 1, x.sb, x.sa);
        }
      });
    }
    return rows.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.slot - b.slot);
  }
  // my own result of the current matchday: { won, gf, ga }
  function playMine(sn, r) {
    if (sn.md >= MD) return false;
    sn.res.push({ w: !!r.won, gf: r.gf | 0, ga: r.ga | 0 });
    sn.md++; sn.live = false;
    return true;
  }
  const posOf = (seed, sn, myOvr) => table(seed, sn, myOvr).findIndex((x) => x.id === 'me') + 1;
  // the end of a season (md 7): { pos, move: 'champion' | 'up' | 'stay' | 'down', next: { i, n } }. The Season 5 champion stays at 5 (title defence).
  function finish(seed, sn, myOvr) {
    const pos = posOf(seed, sn, myOvr), def = ISO.SEASONS[sn.i];
    let move = 'stay', i = sn.i;
    if (pos === 1) { move = 'champion'; i = Math.min(LAST, sn.i + 1); }
    else if (pos <= def.up && sn.i < LAST) { move = 'up'; i = sn.i + 1; }
    else if (def.rel != null && pos >= def.rel) { move = 'down'; i = sn.i - 1; }
    return { pos, move, next: { i, n: sn.n + 1 } };
  }
  const prize = (sn, pos, alreadyWon) => Math.round(ISO.SEASONS[sn.i].prize * PRIZE_PCT(pos) * (alreadyWon ? 0.5 : 1));

  // shape check used by the profile migration: a state that cannot be trusted is rebuilt
  function valid(sn) {
    if (!sn || typeof sn !== 'object' || !Number.isInteger(sn.i) || sn.i < 0 || sn.i > LAST || !Number.isInteger(sn.n) || sn.n < 0) return false;
    if (!Array.isArray(sn.field) || sn.field.length !== MD || new Set(sn.field).size !== MD || !sn.field.every((id) => typeof id === 'string' && ISO.playerById(id))) return false;
    if (!Number.isInteger(sn.md) || sn.md < 0 || sn.md > MD || !Array.isArray(sn.res) || sn.res.length !== sn.md) return false;
    return sn.res.every((x) => x && typeof x === 'object' && typeof x.w === 'boolean' && Number.isFinite(x.gf) && Number.isFinite(x.ga));
  }
  // an old save's stage (0-29) becomes the season it matches
  const fromLegacy = (stage) => { stage = stage | 0; return stage < 6 ? 0 : stage < 12 ? 1 : stage < 15 ? 2 : stage < 18 ? 3 : 4; };
  // a seed for a career that has none (an old save): FNV-1a over what the save already holds
  function seedOf(Q) {
    let h = 2166136261;
    for (const c of [String(Q.name), String(Q.stage | 0), String(Q.points | 0), String(Q.credits | 0), String(Q.matches | 0)].join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h >>> 0;
  }

  ISO.Career = { MD, SIZE, LOSS_PTS, PRIZE_PCT, slotOf, pool, newSeason, schedule, opponentId, diffOf, roll, table, playMine, posOf, finish, prize, valid, fromLegacy, seedOf, clampI };
})();
