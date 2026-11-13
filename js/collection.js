/* ISO FOOTBALL — collection logic (roadmap 5.6): sets (club / nation / rarity / era) with a one-time credit claim and a win-bonus for the fielded player,
   favourites, duplicate stars that cut the Prime price, the custom career kit. Pure, node-loadable (needs data.js). No DOM, no randomness.
   The profile (js/profile.js) stores P.favs, P.sets (claimed ids), P.dups (stars per player id) and career.kitCustom; the screens are js/collection-ui.js and js/career-ui.js. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  const FAV_CAP = 12;                  // favourites kept
  const DUP_MAX = 3, DUP_CUT = 0.1;    // a duplicate adds a star (3 at most), each star takes 10% off that player's Prime price
  const SET_BONUS = 0.05, SET_BONUS_CAP = 0.15;      // per completed set the fielded player belongs to, on the win bonuses; at most 15%
  const MIN_CLUB = 3;                  // a club or nation makes a set from this many players in the roster
  // one-time credits for completing a set: per player plus a completion bonus (clubs and nations); rarity and era sets pay per player only
  const PER = { club: 25, nation: 25, rarity: 30, era: 15 }, DONE = { club: 150, nation: 150, rarity: 0, era: 0 };
  const ERA_NAME = { modern: 'MODERN STARS', legend: 'LEGENDS' };

  let cache = null;
  function build() {
    const sets = [], by = (kind, key, name, ids, col) => sets.push({ id: kind + ':' + key, kind, key, name, ids, credit: ids.length * PER[kind] + DONE[kind], col });
    const group = (f) => { const m = new Map(); for (const d of ISO.PLAYERS) { const k = f(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d.id); } return m; };
    for (const [k, ids] of [...group((d) => d.club)].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) if (ids.length >= MIN_CLUB) by('club', k, k.toUpperCase(), ids);
    for (const [k, ids] of [...group((d) => d.nat)].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) if (ids.length >= MIN_CLUB) by('nation', k, k, ids);
    const rm = group((d) => ISO.rarityOf(d));
    for (const k of Object.keys(ISO.RARITY)) if (rm.get(k) && rm.get(k).length) by('rarity', k, ISO.RARITY[k].name + 'S', rm.get(k), ISO.RARITY[k].col);
    for (const [k, ids] of group((d) => d.era)) by('era', k, ERA_NAME[k] || String(k).toUpperCase(), ids);
    const idx = {}; for (const s of sets) for (const id of s.ids) (idx[id] = idx[id] || []).push(s.id);
    return { sets, byId: Object.fromEntries(sets.map((s) => [s.id, s])), idx };
  }
  const B = () => cache || (cache = build());
  const SETS = () => B().sets;
  const setById = (id) => B().byId[id] || null;
  const setsOf = (pid) => (B().idx[pid] || []).map((id) => B().byId[id]);
  const have = (set, owned) => { const o = owned instanceof Set ? owned : new Set(owned); return set.ids.filter((id) => o.has(id)).length; };
  const complete = (set, owned) => have(set, owned) === set.ids.length;
  // every set's credits claimed at once (the ceiling the economy doc and the tests bound)
  const creditTotal = () => SETS().reduce((n, s) => n + s.credit, 0);
  const SET_CREDIT_CAP = 16000;
  // +5% per completed set that contains the fielded player, at most +15%. A rounded value so the multiplier stays on a 0.05 grid.
  function setBonus(owned, pid) {
    const o = new Set(owned);
    const n = setsOf(pid).filter((s) => complete(s, o)).length;
    return Math.round(Math.min(SET_BONUS_CAP, SET_BONUS * n) * 100) / 100;
  }
  const dupStars = (dups, pid) => Math.max(0, Math.min(DUP_MAX, (dups && dups[pid]) | 0));
  // the Prime price with the duplicate cut (10% per star); the catalogue ISO.primeCost is unchanged
  const primeCost = (d, dups) => Math.round(ISO.primeCost(d) * (1 - DUP_CUT * dupStars(dups, d.id)));
  const HEX = /^#[0-9a-f]{6}$/i;
  // a custom kit: { a, b } hex colours (shirt, shorts and trim), or null. Anything else (a wrong shape, a colour that is not #rrggbb) is rejected.
  function kitValid(k) { return isObj(k) && typeof k.a === 'string' && typeof k.b === 'string' && HEX.test(k.a) && HEX.test(k.b); }
  const kitClean = (k) => (kitValid(k) ? { a: k.a.toLowerCase(), b: k.b.toLowerCase() } : null);

  // keyed on shape, no schema bump: favs (known ids, no repeats, capped), sets (known ids only), dups (owned players, 1-3), career.kitCustom
  function norm(Q) {
    const known = (id) => typeof id === 'string' && !!ISO.playerById(id);
    Q.favs = (Array.isArray(Q.favs) ? Q.favs : []).filter((id, i, a) => known(id) && a.indexOf(id) === i).slice(0, FAV_CAP);
    const sets = isObj(Q.sets) ? Q.sets : {}; Q.sets = {};
    for (const id of Object.keys(sets)) if (sets[id] === true && setById(id)) Q.sets[id] = true;
    const dups = isObj(Q.dups) ? Q.dups : {}; Q.dups = {};
    for (const id of Object.keys(dups)) if (known(id) && Number.isFinite(dups[id]) && dups[id] >= 1) Q.dups[id] = Math.min(DUP_MAX, Math.floor(dups[id]));
    if (isObj(Q.career)) Q.career.kitCustom = kitClean(Q.career.kitCustom);
  }

  ISO.Collection = { FAV_CAP, DUP_MAX, DUP_CUT, SET_BONUS, SET_BONUS_CAP, SET_CREDIT_CAP, PER, DONE, SETS, setById, setsOf, have, complete, creditTotal, setBonus, dupStars, primeCost, kitValid, kitClean, norm };
})();
