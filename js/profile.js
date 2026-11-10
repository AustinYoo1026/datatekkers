/* ISO FOOTBALL — persistent profile: credits, collection, achievements, box draws and MyCareer.
   Pure logic plus localStorage; no DOM. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const KEY = 'isofootball.profile.v1';
  const ATTR_KEYS = ISO.ATTRS.map((a) => a[0]);
  const STARTERS = ['cheadams', 'armstrong', 'ings', 'ayew', 'djames'];

  // ------------------------------------------------------------ achievements
  // `stat` is a profile.stats key (or a function of the profile); done when value >= goal.
  const ACH = [
    { id: 'first_match', name: 'Debut', desc: 'Play your first match', stat: 'matches', goal: 1, reward: 100 },
    { id: 'first_goal', name: 'Off the Mark', desc: 'Score your first goal', stat: 'goals', goal: 1, reward: 100 },
    { id: 'first_win', name: 'Winner', desc: 'Win a match', stat: 'wins', goal: 1, reward: 200 },
    { id: 'goals_10', name: 'Poacher', desc: 'Score 10 goals', stat: 'goals', goal: 10, reward: 300 },
    { id: 'goals_50', name: 'Goal Machine', desc: 'Score 50 goals', stat: 'goals', goal: 50, reward: 800 },
    { id: 'goals_150', name: 'Living Legend', desc: 'Score 150 goals', stat: 'goals', goal: 150, reward: 2000 },
    { id: 'wins_5', name: 'Habit', desc: 'Win 5 matches', stat: 'wins', goal: 5, reward: 400 },
    { id: 'wins_20', name: 'Serial Winner', desc: 'Win 20 matches', stat: 'wins', goal: 20, reward: 1200 },
    { id: 'clean_sheet', name: 'Whitewash', desc: 'Win a match without conceding', stat: 'cleanSheets', goal: 1, reward: 500 },
    { id: 'hard_win', name: 'Giant Killer', desc: 'Beat the CPU on Hard', stat: 'hardWins', goal: 1, reward: 600 },
    { id: 'skills_25', name: 'Showboat', desc: 'Perform 25 skill moves in matches', stat: 'skills', goal: 25, reward: 250 },
    { id: 'skills_200', name: 'Street Baller', desc: 'Perform 200 skill moves in matches', stat: 'skills', goal: 200, reward: 900 },
    { id: 'power_5', name: 'Thunderbolt', desc: 'Score 5 power-shot goals', stat: 'powerGoals', goal: 5, reward: 400 },
    { id: 'clears_10', name: 'Second Ball', desc: 'Clear 10 rebounds out of the box', stat: 'clears', goal: 10, reward: 300 },
    { id: 'arena_20', name: 'Practice Makes Perfect', desc: 'Score 20 goals in the Testing Arena', stat: 'arenaGoals', goal: 20, reward: 200 },
    { id: 'career_3', name: 'Rising Star', desc: 'Beat 3 MyCareer opponents', stat: 'careerWins', goal: 3, reward: 500 },
    { id: 'career_8', name: 'World Class', desc: 'Beat 8 MyCareer opponents', stat: 'careerWins', goal: 8, reward: 1500 },
    { id: 'career_all', name: 'The GOAT', desc: 'Beat every MyCareer opponent', stat: 'careerDone', goal: 1, reward: 5000 },
    { id: 'boxes_5', name: 'Hooked', desc: 'Open 5 boxes', stat: 'boxes', goal: 5, reward: 300 },
    { id: 'collect_15', name: 'Collector', desc: 'Own 15 players', stat: (p) => p.owned.length, goal: 15, reward: 800 },
    { id: 'own_icon', name: 'Icon Pull', desc: 'Pull an Icon from a box', stat: 'iconPulls', goal: 1, reward: 1000 },
    { id: 'skin_1', name: 'Fresh Fit', desc: 'Buy a skin in the Store', stat: (p) => Object.values(p.skins).reduce((n, l) => n + l.length, 0), goal: 1, reward: 150 },
    { id: 'prime_1', name: 'Prime Time', desc: 'Upgrade a player to their Prime', stat: (p) => Object.keys(p.prime).length, goal: 1, reward: 500 },
    { id: 'moves_all', name: 'Full Bag', desc: 'Unlock every skill move', stat: (p) => p.moves.length, goal: Object.values(ISO.MOVE_COST).filter((c) => c > 0).length, reward: 1500 },
    { id: 'maps_all', name: 'World Tour', desc: 'Own every map', stat: (p) => p.maps.length, goal: ISO.MAPS.length, reward: 1000 },
  ];

  // ------------------------------------------------------------ boxes
  const BOXES = [
    { id: 'bronze', name: 'BRONZE BOX', cost: 250, req: 'first_match', col: '#c98a5a',
      odds: { common: 0.7, rare: 0.26, epic: 0.035, legend: 0.005, icon: 0 } },
    { id: 'silver', name: 'SILVER BOX', cost: 700, req: 'first_win', col: '#c9d2de',
      odds: { common: 0.25, rare: 0.5, epic: 0.2, legend: 0.045, icon: 0.005 } },
    { id: 'gold', name: 'GOLD BOX', cost: 1600, req: 'career_3', col: '#ffcf4d',
      odds: { common: 0, rare: 0.35, epic: 0.45, legend: 0.17, icon: 0.03 } },
    { id: 'icon', name: 'ICON BOX', cost: 4000, req: 'career_8', col: '#f1735f',
      odds: { common: 0, rare: 0, epic: 0.4, legend: 0.35, icon: 0.25 } },
  ];
  const RANKS = ['common', 'rare', 'epic', 'legend', 'icon'];
  const PITY = 10;       // a Legendary or better is guaranteed at least every PITY boxes

  // ------------------------------------------------------------ career
  const CAREER_LOOKS = [
    { skin: '#e8bd95', hair: 'short', hairColor: '#3a2a1c' }, { skin: '#9a6a44', hair: 'fade', hairColor: '#17100c' },
    { skin: '#f6d7bd', hair: 'quiff', hairColor: '#e8cf7a' }, { skin: '#6b4226', hair: 'curly', hairColor: '#120d0a' },
    { skin: '#c98f62', hair: 'mohawk', hairColor: '#2a1a12' }, { skin: '#f1c9a5', hair: 'long', hairColor: '#5a3a22', band: '#f1735f' },
  ];
  const CAREER_KITS = [
    ['#f1735f', '#1f2433'], ['#35e08a', '#0f1a14'], ['#1f2433', '#f1735f'], ['#f4f4f4', '#4b5a74'], ['#4fa3ff', '#ffffff'], ['#ffcf4d', '#17171b'],
  ];
  const CAREER_STAGES = 12;
  const careerOvr = (a) => Math.round(['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'skl', 'str', 'sta']
    .reduce((s, k) => s + a[k], 0) / 11);
  const upgradeCost = (v) => (v < 70 ? 1 : v < 80 ? 2 : v < 90 ? 3 : 4);

  function newCareer() {
    // 12 opponents climbing from the weakest squad players to the very best icons
    const sorted = ISO.PLAYERS.slice().sort((a, b) => a.ovr - b.ovr);
    const ladder = [];
    for (let i = 0; i < CAREER_STAGES; i++) {
      const idx = Math.round((i / (CAREER_STAGES - 1)) * (sorted.length - 1));
      let j = idx; while (ladder.includes(sorted[j].id)) j++;
      ladder.push(sorted[Math.min(j, sorted.length - 1)].id);
    }
    const attr = {};
    for (const k of ATTR_KEYS) attr[k] = 55;
    attr.tck = 40; attr.wf = 50; attr.skl = 56;
    return { attr, base: Object.assign({}, attr), points: 5, stage: 0, ladder, look: 0, kit: 0, name: 'YOU' };
  }

  // ------------------------------------------------------------ storage
  function fresh() {
    return {
      credits: 300, owned: STARTERS.slice(), claimed: {}, pity: 0, career: null,
      skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium',      // store purchases
      settings: { volume: 0.8, muted: false, crowd: true, speed: 0.75, mouseAim: true, reticle: true, hint: true, diff: 'normal', keys: null,
        admin: { unlocked: false, allChars: false, allAch: false, infCredits: false } },
      stats: { matches: 0, wins: 0, goals: 0, powerGoals: 0, skills: 0, clears: 0, cleanSheets: 0, hardWins: 0,
        boxes: 0, careerWins: 0, careerDone: 0, arenaGoals: 0, iconPulls: 0 },
    };
  }
  let P = null;
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) P = JSON.parse(raw); } catch (e) { P = null; }
    const f = fresh();
    if (!P || typeof P !== 'object') P = f;
    for (const k of Object.keys(f)) if (P[k] === undefined) P[k] = f[k];
    for (const k of Object.keys(f.stats)) if (P.stats[k] === undefined) P.stats[k] = 0;
    P.owned = P.owned.filter((id) => ISO.playerById(id));
    P.moves = P.moves.filter((id) => ISO.MOVE_COST[id] > 0);
    P.maps = P.maps.filter((id) => ISO.MAPS.some((m) => m.id === id));
    if (!P.maps.includes('stadium')) P.maps.unshift('stadium');
    if (!P.maps.includes(P.map)) P.map = 'stadium';
    if (!P.career) P.career = newCareer();
    if (!P.career.base) P.career.base = newCareer().base;      // older saves
    for (const k of Object.keys(f.settings)) if (P.settings[k] === undefined) P.settings[k] = f.settings[k];
    for (const k of Object.keys(f.settings.admin)) if (P.settings.admin[k] === undefined) P.settings.admin[k] = f.settings.admin[k];
    return P;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: progress lasts this session */ } }

  // admin switches (Settings → Admin) override progress without touching the saved values
  const AD = () => P.settings.admin;
  const infinite = () => AD().unlocked && AD().infCredits;
  const owns = (id) => (AD().unlocked && AD().allChars) || P.owned.includes(id);
  const statOf = (a) => (AD().unlocked && AD().allAch ? a.goal : typeof a.stat === 'function' ? a.stat(P) : P.stats[a.stat] || 0);
  const isDone = (id) => { const a = ACH.find((x) => x.id === id); return !!a && statOf(a) >= a.goal; };
  // returns achievements that became complete since `before` (a set of ids)
  function doneSet() { return new Set(ACH.filter((a) => statOf(a) >= a.goal).map((a) => a.id)); }
  function newlyDone(before) { return ACH.filter((a) => statOf(a) >= a.goal && !before.has(a.id)); }

  function claim(id) {
    const a = ACH.find((x) => x.id === id);
    if (!a || P.claimed[id] || statOf(a) < a.goal) return 0;
    P.claimed[id] = true; P.credits += a.reward; save();
    return a.reward;
  }

  // ------------------------------------------------------------ matches
  // r: { mode: 'cpu'|'career', won, gf, ga, diff, opp (def), skills, clears, powerGoals }
  // Beating an easier CPU pays less: the win bonuses (win, clean sheet, career win) are scaled by this.
  const WIN_MULT = { easy: 0.4, normal: 0.7, hard: 1 };
  // Quick Match: beating a higher-rated player than yours pays more, a lower-rated one less (+4% per overall point, ×0.5 – ×2).
  const gapMult = (me, opp) => (me && opp ? Math.round(Math.max(0.5, Math.min(2, 1 + 0.04 * (opp.ovr - me.ovr))) * 100) / 100 : 1);
  const winMult = (diff, me, opp) => { const d = WIN_MULT[diff] || 1, g = gapMult(me, opp); return { diff: d, gap: g, total: Math.round(d * g * 100) / 100 }; };
  function recordMatch(r) {
    const before = doneSet(), S = P.stats, wm = winMult(r.diff, r.mode === 'cpu' ? r.me : null, r.opp), mult = wm.total;
    S.matches++; S.goals += r.gf; S.skills += r.skills; S.clears += r.clears; S.powerGoals += r.powerGoals;
    let credits = 40 + 15 * r.gf, points = 0, bonus = 0;
    if (r.won) {
      S.wins++; bonus += 100;
      if (r.ga === 0) { S.cleanSheets++; bonus += 50; }
      if (r.diff === 'hard') S.hardWins++;
    }
    if (r.mode === 'career') {
      const C = P.career;
      if (r.won) {
        bonus += 150 + Math.max(0, (r.opp.ovr - 60) * 4);
        points = 10 + 2 * C.stage;
        S.careerWins++; C.stage++;
        if (C.stage >= C.ladder.length) S.careerDone = 1;
      } else points = 1;
      C.points += points;
    }
    credits += Math.round(bonus * mult);
    P.credits += credits;
    save();
    return { credits, points, mult: r.won ? mult : 1, wm, ach: newlyDone(before) };
  }
  function recordArenaGoal() {
    const before = doneSet();
    P.stats.arenaGoals++; P.credits += 2; save();
    return newlyDone(before);
  }

  // ------------------------------------------------------------ box draw
  function pick(odds, rand) {
    let x = rand(), r = null;
    for (const k of RANKS) { const o = odds[k] || 0; if (o <= 0) continue; r = k; if (x < o) return k; x -= o; }
    return r;
  }
  function rollRarity(box, rand) {
    const forced = P.pity >= PITY - 1;
    let odds = box.odds;
    if (forced) {     // pity: only Legendary or Icon this time
      const l = odds.legend || 0.5, ic = odds.icon || 0.1;
      odds = { legend: l / (l + ic), icon: ic / (l + ic) };
    }
    return { rarity: pick(odds, rand), forced };
  }
  function poolOf(rarity) { return ISO.PLAYERS.filter((d) => ISO.rarityOf(d) === rarity); }
  // A random filler card for the spinning strip, weighted by the box odds.
  function filler(box, rand) {
    const pool = poolOf(pick(box.odds, rand));
    return pool[(rand() * pool.length) | 0];
  }
  function canOpen(box) {
    if (!isDone(box.req)) return 'locked';
    if (!infinite() && P.credits < box.cost) return 'poor';
    return 'ok';
  }
  function openBox(boxId, rand) {
    rand = rand || Math.random;
    const box = BOXES.find((b) => b.id === boxId);
    if (!box || canOpen(box) !== 'ok') return null;
    const before = doneSet();
    if (!infinite()) P.credits -= box.cost;
    const { rarity, forced } = rollRarity(box, rand);
    const pool = poolOf(rarity);
    const def = pool[(rand() * pool.length) | 0];
    let refund = 0;
    const dup = P.owned.includes(def.id);
    if (dup) { refund = ISO.RARITY[rarity].dup; P.credits += refund; } else P.owned.push(def.id);
    P.pity = RANKS.indexOf(rarity) >= 3 ? 0 : P.pity + 1;
    P.stats.boxes++;
    if (rarity === 'icon') P.stats.iconPulls++;
    save();
    return { def, rarity, dup, refund, forced, ach: newlyDone(before) };
  }

  // ------------------------------------------------------------ store
  // Every purchase returns 'ok' or the reason it was refused: 'owned' | 'locked' | 'poor'.
  function buy(cost, apply) {
    if (!infinite() && P.credits < cost) return 'poor';
    const before = doneSet();
    if (!infinite()) P.credits -= cost;
    apply(); save();
    lastAch = newlyDone(before);
    return 'ok';
  }
  let lastAch = [];
  const ownsSkin = (pid, sid) => sid === 'home' || (P.skins[pid] || []).includes(sid);
  const skinOf = (pid) => (ownsSkin(pid, P.equip[pid] || 'home') ? P.equip[pid] || 'home' : 'home');
  function buySkin(pid, sid) {
    const sk = ISO.SKINS.find((x) => x.id === sid);
    if (!sk || !ISO.playerById(pid) || !owns(pid)) return 'locked';
    if (ownsSkin(pid, sid)) return 'owned';
    return buy(sk.cost, () => { (P.skins[pid] = P.skins[pid] || []).push(sid); P.equip[pid] = sid; });
  }
  function equipSkin(pid, sid) { if (!ownsSkin(pid, sid)) return false; P.equip[pid] = sid; save(); return true; }
  const isPrime = (pid) => !!P.prime[pid];
  function buyPrime(pid) {
    const d = ISO.playerById(pid);
    if (!d || !owns(pid)) return 'locked';
    if (isPrime(pid)) return 'owned';
    return buy(ISO.primeCost(d), () => { P.prime[pid] = true; });
  }
  // the character as you field them: prime stats and the equipped skin
  const outfit = (d) => ISO.outfit(d, isPrime(d.id), skinOf(d.id));
  const hasMove = (id) => !ISO.MOVE_COST[id] || P.moves.includes(id);
  function buyMove(id) {
    if (ISO.MOVE_COST[id] === undefined) return 'locked';
    if (hasMove(id)) return 'owned';
    return buy(ISO.MOVE_COST[id], () => { P.moves.push(id); });
  }
  const moveSet = () => new Set(Object.keys(ISO.MOVE_COST).filter(hasMove));
  const ownsMap = (id) => P.maps.includes(id);
  function buyMap(id) {
    const m = ISO.MAPS.find((x) => x.id === id);
    if (!m) return 'locked';
    if (ownsMap(id)) return 'owned';
    return buy(m.cost, () => { P.maps.push(id); P.map = id; });
  }
  function setMap(id) { if (!ownsMap(id)) return false; P.map = id; save(); return true; }

  // ------------------------------------------------------------ career player
  function careerDef() {
    const C = P.career, look = Object.assign({ h: 1, w: 1 }, CAREER_LOOKS[C.look % CAREER_LOOKS.length]);
    const [a, b] = CAREER_KITS[C.kit % CAREER_KITS.length];
    return {
      id: 'you' + C.look + '_' + C.kit, name: C.name, short: C.name, nat: 'YOU', flag: '⭐', club: 'MyCareer', era: 'modern',
      ovr: careerOvr(C.attr), foot: 'R', num: 10, attr: Object.assign({}, C.attr), look,
      kit: { a, b, pat: 'cstripe', shorts: b, socks: a },
    };
  }
  // Slide an attribute to `target`: raising spends points (as far as they go), lowering refunds them —
  // even below the value the career started with, down to ATTR_MIN, so points can be moved between stats.
  const ATTR_MIN = 30;
  function setAttr(k, target) {
    const C = P.career, lo = Math.min(ATTR_MIN, C.attr[k]);
    target = Math.max(lo, Math.min(99, Math.round(target)));
    while (C.attr[k] < target && C.points >= upgradeCost(C.attr[k])) { C.points -= upgradeCost(C.attr[k]); C.attr[k]++; }
    while (C.attr[k] > target) { C.attr[k]--; C.points += upgradeCost(C.attr[k]); }
    save();
    return C.attr[k];
  }
  // highest value `k` could reach right now with the points available
  function reach(k) {
    const C = P.career; let v = C.attr[k], pts = C.points;
    while (v < 99 && pts >= upgradeCost(v)) { pts -= upgradeCost(v); v++; }
    return v;
  }
  function upgrade(k) {
    const C = P.career, v = C.attr[k], cost = upgradeCost(v);
    if (v >= 99 || C.points < cost) return false;
    C.attr[k]++; C.points -= cost; save();
    return true;
  }
  function careerOpponent() { const C = P.career; return C.stage < C.ladder.length ? ISO.playerById(C.ladder[C.stage]) : null; }
  const careerDiff = (stage) => (stage < 4 ? 'easy' : stage < 8 ? 'normal' : 'hard');
  function resetCareer() { P.career = newCareer(); save(); }
  function cycleLook(d) { P.career.look = (P.career.look + d + CAREER_LOOKS.length) % CAREER_LOOKS.length; save(); }
  function cycleKit(d) { P.career.kit = (P.career.kit + d + CAREER_KITS.length) % CAREER_KITS.length; save(); }

  load();
  ISO.Profile = {
    get data() { return P; }, save, ACH, BOXES, PITY, statOf, isDone, claim, recordMatch, recordArenaGoal,
    WIN_MULT, winMult, canOpen, openBox, filler, owns, infinite, ownedCount: () => ISO.PLAYERS.filter((d) => owns(d.id)).length,
    ownsSkin, skinOf, buySkin, equipSkin, isPrime, buyPrime, outfit, hasMove, buyMove, moveSet, ownsMap, buyMap, setMap,
    takeAch() { const l = lastAch; lastAch = []; return l; },      // achievements completed by the last purchase
    setSetting(k, v) { P.settings[k] = v; save(); },
    setAdmin(k, v) { P.settings.admin[k] = v; save(); },
    adminLogin(pw) { if (pw === 'datatekkers') { P.settings.admin.unlocked = true; save(); return true; } return false; },
    adminLogout() { P.settings.admin.unlocked = false; save(); },
    ATTR_MIN, careerDef, careerOpponent, careerDiff, upgrade, upgradeCost, setAttr, reach, resetCareer, cycleLook, cycleKit, careerOvr,
    reset() { const st = P.settings; P = fresh(); P.career = newCareer(); P.settings = st; save(); },
  };
})();
