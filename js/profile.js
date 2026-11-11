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
  // Achievements come in families with levels: finishing one tier opens the next (25 skill moves -> 50 -> 200 ...).
  // A tier is [goal, reward credits, id, level name, player id unlocked on claim (optional)].
  const sum = (o) => Object.values(o).reduce((n, l) => n + l.length, 0);
  const FAMILIES = [
    { fam: 'goals', stat: 'goals', desc: (g) => 'Score ' + g + ' goal' + (g > 1 ? 's' : ''), tiers: [[1, 100, 'first_goal', 'Off the Mark'], [10, 300, 'goals_10', 'Poacher'], [50, 800, 'goals_50', 'Goal Machine', 'bowen'], [150, 2000, 'goals_150', 'Living Legend'], [400, 3500, 'goals_400', 'Golden Boot', 'rooney'], [1000, 8000, 'goals_1000', 'Immortal']] },
    { fam: 'wins', stat: 'wins', desc: (g) => 'Win ' + (g > 1 ? g + ' matches' : 'a match'), tiers: [[1, 200, 'first_win', 'Winner'], [5, 400, 'wins_5', 'Habit'], [20, 1200, 'wins_20', 'Serial Winner', 'wood'], [50, 2500, 'wins_50', 'Dynasty'], [100, 5000, 'wins_100', 'Invincible']] },
    { fam: 'matches', stat: 'matches', desc: (g) => 'Play ' + (g > 1 ? g + ' matches' : 'your first match'), tiers: [[1, 100, 'first_match', 'Debut'], [25, 300, 'matches_25', 'Regular'], [100, 1000, 'matches_100', 'Veteran'], [300, 3000, 'matches_300', 'Club Legend']] },
    { fam: 'skills', stat: 'skills', desc: (g) => 'Perform ' + g + ' skill moves in matches', tiers: [[25, 250, 'skills_25', 'Showboat'], [50, 400, 'skills_50', 'Flair Player'], [200, 900, 'skills_200', 'Street Baller', 'grealish'], [500, 2000, 'skills_500', 'Trickster', 'iniesta'], [1000, 4000, 'skills_1000', 'Magician']] },
    { fam: 'power', stat: 'powerGoals', desc: (g) => 'Score ' + g + ' power-shot goals', tiers: [[5, 400, 'power_5', 'Thunderbolt'], [15, 800, 'power_15', 'Cannon'], [40, 1800, 'power_40', 'Howitzer', 'zlatan'], [100, 4000, 'power_100', 'Rocket Man']] },
    { fam: 'clears', stat: 'clears', desc: (g) => 'Clear ' + g + ' rebounds out of the box', tiers: [[10, 300, 'clears_10', 'Second Ball'], [50, 800, 'clears_50', 'Sweeper'], [150, 1800, 'clears_150', 'Wall']] },
    { fam: 'sheets', stat: 'cleanSheets', desc: (g) => 'Win ' + (g > 1 ? g + ' matches' : 'a match') + ' without conceding', tiers: [[1, 500, 'clean_sheet', 'Whitewash'], [5, 900, 'sheets_5', 'Shutout'], [20, 2200, 'sheets_20', 'Brick Wall', 'maldini'], [50, 5000, 'sheets_50', 'Fortress']] },
    { fam: 'hard', stat: 'hardWins', desc: (g) => 'Beat the CPU on Hard' + (g > 1 ? ' ' + g + ' times' : ''), tiers: [[1, 600, 'hard_win', 'Giant Killer'], [5, 1200, 'hard_5', 'Hard Man'], [20, 3000, 'hard_20', 'Unbreakable', 'baresi']] },
    { fam: 'arena', stat: 'arenaGoals', desc: (g) => 'Score ' + g + ' goals in the Testing Arena', tiers: [[20, 200, 'arena_20', 'Practice Makes Perfect'], [100, 600, 'arena_100', 'Training Obsessed'], [300, 1500, 'arena_300', 'Lab Rat']] },
    { fam: 'drills', stat: 'drillRuns', desc: (g) => 'Finish ' + g + ' drills', tiers: [[5, 250, 'drills_5', 'Training Ground'], [25, 800, 'drills_25', 'Drill Sergeant'], [75, 2000, 'drills_75', 'Specialist', 'pirlo']] },
    { fam: 'career', stat: 'careerWins', desc: (g) => 'Win ' + g + ' MyCareer matches', tiers: [[3, 500, 'career_3', 'Rising Star'], [8, 1500, 'career_8', 'World Class', 'foden'], [20, 3000, 'career_20', 'Contender'], [50, 6000, 'career_50', 'Hall of Famer', 'xavi']] },
    { fam: 'goat', stat: 'careerDone', desc: () => 'Beat every MyCareer opponent', tiers: [[1, 5000, 'career_all', 'The GOAT']] },
    { fam: 'boxes', stat: 'boxes', desc: (g) => 'Open ' + g + ' boxes', tiers: [[5, 300, 'boxes_5', 'Hooked'], [25, 900, 'boxes_25', 'Unboxer'], [100, 3000, 'boxes_100', 'Box Addict']] },
    { fam: 'collect', stat: (p) => p.owned.length, desc: (g) => 'Own ' + g + ' players', tiers: [[15, 800, 'collect_15', 'Collector'], [40, 2000, 'collect_40', 'Squad Builder'], [80, 4000, 'collect_80', 'Curator'], [120, 8000, 'collect_120', 'Hall of Fame']] },
    { fam: 'icons', stat: 'iconPulls', desc: (g) => 'Pull ' + g + (g > 1 ? ' Icons' : ' Icon') + ' from boxes', tiers: [[1, 1000, 'own_icon', 'Icon Pull'], [5, 2500, 'icons_5', 'Icon Hunter'], [15, 6000, 'icons_15', 'Icon Collector']] },
    { fam: 'skins', stat: (p) => sum(p.skins), desc: (g) => 'Buy ' + g + ' skin' + (g > 1 ? 's' : '') + ' in the Store', tiers: [[1, 150, 'skin_1', 'Fresh Fit'], [10, 700, 'skins_10', 'Fashionista'], [30, 2000, 'skins_30', 'Wardrobe']] },
    { fam: 'prime', stat: (p) => Object.keys(p.prime).length, desc: (g) => 'Upgrade ' + g + ' player' + (g > 1 ? 's' : '') + ' to Prime', tiers: [[1, 500, 'prime_1', 'Prime Time'], [5, 1500, 'prime_5', 'Peak Form'], [15, 4000, 'prime_15', 'Golden Age']] },
    { fam: 'maps', stat: (p) => p.maps.length, desc: (g) => 'Own ' + g + ' maps', tiers: [[5, 400, 'maps_5', 'Tourist'], [12, 1000, 'maps_12', 'Globetrotter'], [ISO.MAPS.length, 3000, 'maps_all', 'World Tour', 'pedri']] },
    { fam: 'balls', stat: (p) => 1 + (p.balls || []).length, desc: (g) => 'Own ' + g + ' ball skins', tiers: [[3, 300, 'balls_3', 'Kit Bag'], [6, 900, 'balls_6', 'Ball Boy'], [10, 2500, 'balls_all', 'Ball Collector']] },
  ];
  const ACH = [];
  for (const F of FAMILIES) F.tiers.forEach((t, i) => ACH.push({ id: t[2], fam: F.fam, tier: i + 1, tiers: F.tiers.length, name: t[3], desc: F.desc(t[0]), stat: F.stat, goal: t[0], reward: t[1], player: t[4] || null }));

  // ------------------------------------------------------------ boxes
  const BOXES = [
    { id: 'bronze', name: 'BRONZE BOX', cost: 150, req: 'first_match', col: '#c98a5a',
      odds: { common: 0.7, rare: 0.26, epic: 0.035, legend: 0.005, icon: 0 } },
    { id: 'silver', name: 'SILVER BOX', cost: 400, req: 'first_win', col: '#c9d2de',
      odds: { common: 0.25, rare: 0.5, epic: 0.2, legend: 0.045, icon: 0.005 } },
    { id: 'gold', name: 'GOLD BOX', cost: 950, req: 'career_3', col: '#ffcf4d',
      odds: { common: 0, rare: 0.35, epic: 0.45, legend: 0.17, icon: 0.03 } },
    { id: 'icon', name: 'ICON BOX', cost: 2400, req: 'career_8', col: '#f1735f',
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
  const CAREER_STAGES = 18, CAREER_REMATCH = 12;      // 18 opponents climbing in rating, then rematches against the 12 toughest of them (you can play the same person again)
  const careerOvr = (a) => Math.round(['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'skl', 'str', 'sta']
    .reduce((s, k) => s + a[k], 0) / 11);
  const upgradeCost = (v) => (v < 70 ? 1 : v < 80 ? 2 : v < 90 ? 3 : 4);

  function newCareer() {
    // opponents climbing from the weakest squad players to the very best icons, then the rematches
    const sorted = ISO.PLAYERS.slice().sort((a, b) => a.ovr - b.ovr);
    const ladder = [];
    for (let i = 0; i < CAREER_STAGES; i++) {
      // climb evenly by rating, not by position in the roster (which is top-heavy with stars and icons)
      const want = sorted[0].ovr + (i / (CAREER_STAGES - 1)) * (sorted[sorted.length - 1].ovr - sorted[0].ovr);
      let idx = sorted.findIndex((d) => d.ovr >= want); if (idx < 0) idx = sorted.length - 1;
      let j = idx; while (j < sorted.length - 1 && ladder.includes(sorted[j].id)) j++;
      ladder.push(sorted[Math.min(j, sorted.length - 1)].id);
    }
    for (let i = 0; i < CAREER_REMATCH; i++) ladder.push(ladder[CAREER_STAGES - CAREER_REMATCH + i]);
    const attr = {};
    for (const k of ATTR_KEYS) attr[k] = 55;
    attr.tck = 40; attr.wf = 50; attr.skl = 56;
    return { attr, base: Object.assign({}, attr), points: 5, stage: 0, ladder, look: 0, kit: 0, name: 'YOU' };
  }

  // ------------------------------------------------------------ storage
  function fresh() {
    return {
      credits: 300, owned: STARTERS.slice(), claimed: {}, pity: 0, career: null,
      skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium', balls: [], ball: 'classic',      // store purchases
      settings: { volume: 0.8, muted: false, crowd: true, speed: 0.75, mouseAim: false, reticle: true, camera: 'classic', hint: true, diff: 'normal', keys: null,
        admin: { unlocked: false, allChars: false, allAch: false, infCredits: false } },
      stats: { matches: 0, wins: 0, goals: 0, powerGoals: 0, skills: 0, clears: 0, cleanSheets: 0, hardWins: 0,
        boxes: 0, careerWins: 0, careerDone: 0, arenaGoals: 0, iconPulls: 0, drillRuns: 0 },
      drills: {},          // best score per drill: { penalty: { best, plays } }
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
    { const nl = newCareer().ladder; if (P.career.ladder.length < nl.length) P.career.ladder = nl; }      // the ladder grew: keep your stage, new opponents follow
    for (const k of Object.keys(f.settings)) if (P.settings[k] === undefined) P.settings[k] = f.settings[k];
    if (P.settings.keys && !P.settings.keysMouse) {      // mouse buttons became ordinary bindings: keep click-to-shoot for existing profiles
      const K = P.settings.keys; if (K.shoot && !K.shoot[1]) K.shoot[1] = 'Mouse0'; if (K.chip && !K.chip[1]) K.chip[1] = 'Mouse2';
    }
    P.settings.keysMouse = true;
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

  let lastClaim = { player: null, dup: 0 };
  function claim(id) {
    const a = ACH.find((x) => x.id === id);
    if (!a || P.claimed[id] || statOf(a) < a.goal) return 0;
    P.claimed[id] = true; P.credits += a.reward;
    lastClaim = { player: null, dup: 0 };
    if (a.player && ISO.playerById(a.player)) {      // some levels also hand over a player (a duplicate pays its refund instead)
      const d = ISO.playerById(a.player);
      if (P.owned.includes(d.id)) { lastClaim.dup = ISO.RARITY[ISO.rarityOf(d)].dup; P.credits += lastClaim.dup; } else { P.owned.push(d.id); lastClaim.player = d; }
    }
    save();
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
        points = Math.min(30, 10 + 2 * C.stage);
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

  // Finishing a penalty / target / chip drill pays credits by score (scaled by the keeper level) and keeps your best.
  const DRILL_CR = { penalty: 20, target: 6, chip: 30, freekick: 30, oneonone: 22, longshot: 14, finesse: 14, power: 28 };
  function recordDrill(kind, score, diff, bonus) {
    const before = doneSet(), d = (P.drills[kind] = P.drills[kind] || { best: 0, plays: 0 });
    const credits = Math.round((score * (DRILL_CR[kind] || 5) + (bonus || 0)) * (WIN_MULT[diff] || 1));
    const newBest = score > d.best;
    if (newBest) d.best = score;
    d.plays++; P.stats.drillRuns++; P.credits += credits; save();
    return { credits, best: d.best, newBest, ach: newlyDone(before) };
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
  function canOpen(box, n) {
    if (!isDone(box.req)) return 'locked';
    if (!infinite() && P.credits < box.cost * (n || 1)) return 'poor';
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

  // Open several boxes in a row (stops early if you run out of credits). Returns the list of results.
  function openBoxes(boxId, n, rand) {
    const out = [];
    for (let i = 0; i < n; i++) { const r = openBox(boxId, rand); if (!r) break; out.push(r); }
    return out;
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
  // admin: unlock and max out everything in one go (written to the profile, unlike the switches)
  function maxAll() {
    for (const d of ISO.PLAYERS) {
      if (!P.owned.includes(d.id)) P.owned.push(d.id);
      P.prime[d.id] = true;
      P.skins[d.id] = ISO.SKINS.map((s) => s.id);
    }
    if (ISO.BALLS) P.balls = ISO.BALLS.map((b) => b.id);
    P.maps = ISO.MAPS.map((m) => m.id);
    save();
  }
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
  const ownsBall = (id) => id === 'classic' || (P.balls || []).includes(id);
  function buyBall(id) {
    const b = ISO.BALLS.find((x) => x.id === id);
    if (!b) return 'locked';
    if (ownsBall(id)) return 'owned';
    return buy(b.cost, () => { P.balls.push(id); P.ball = id; });
  }
  function equipBall(id) { if (!ownsBall(id)) return false; P.ball = id; save(); return true; }
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
  const careerDiff = (stage) => (stage < 6 ? 'easy' : stage < 14 ? 'normal' : 'hard');
  function resetCareer() { P.career = newCareer(); save(); }
  function cycleLook(d) { P.career.look = (P.career.look + d + CAREER_LOOKS.length) % CAREER_LOOKS.length; save(); }
  function cycleKit(d) { P.career.kit = (P.career.kit + d + CAREER_KITS.length) % CAREER_KITS.length; save(); }

  load();
  ISO.Profile = {
    get data() { return P; }, save, ACH, BOXES, PITY, statOf, isDone, claim, recordMatch, recordArenaGoal, recordDrill,
    WIN_MULT, winMult, canOpen, openBox, openBoxes, claimInfo: () => lastClaim, FAMILIES, filler, owns, infinite, ownedCount: () => ISO.PLAYERS.filter((d) => owns(d.id)).length,
    ownsSkin, skinOf, maxAll, buySkin, equipSkin, isPrime, buyPrime, outfit, hasMove, buyMove, moveSet, ownsMap, buyMap, setMap, ownsBall, buyBall, equipBall,
    takeAch() { const l = lastAch; lastAch = []; return l; },      // achievements completed by the last purchase
    setSetting(k, v) { P.settings[k] = v; save(); },
    setAdmin(k, v) { P.settings.admin[k] = v; save(); },
    adminLogin(pw) { if (pw === 'datatekkers') { P.settings.admin.unlocked = true; save(); return true; } return false; },
    adminLogout() { P.settings.admin.unlocked = false; save(); },
    ATTR_MIN, careerDef, careerOpponent, careerDiff, upgrade, upgradeCost, setAttr, reach, resetCareer, cycleLook, cycleKit, careerOvr,
    reset() { const st = P.settings; P = fresh(); P.career = newCareer(); P.settings = st; save(); },
  };
})();
