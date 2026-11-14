/* ISO FOOTBALL — persistent profile: credits, collection, achievements, box draws and MyCareer.
   Pure logic plus localStorage; no DOM. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const KEY = 'isofootball.profile.v1';
  const SCHEMA = 5;      // 5: career objectives, training and reputation (career.rep, xp, trained, tokens, focus, traits, obj, streak, sn.tally; stats.objDone; keyed on shape, see ISO.Career.norm); 4: career seasons (career.seed, sn, hist, best; stats.seasonsWon, promotions); 3: tournaments (cup, cups, stats.cupWins); 2: celebrations (celebs, celeb) and career.foot; older profiles carry no `schema` and are migrated in load()
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
    { fam: 'cups', stat: 'cupWins', desc: (g) => 'Win ' + (g > 1 ? g + ' tournaments' : 'a tournament'), tiers: [[1, 600, 'cup_1', 'Cup Winner'], [5, 2000, 'cup_5', 'Cup Collector', 'zanetti'], [20, 6000, 'cup_20', 'Cup Dynasty']] },
    { fam: 'street', stat: 'streetWins', desc: (g) => 'Win ' + (g > 1 ? g + ' Street Football matches' : 'a Street Football match'), tiers: [[1, 300, 'street_1', 'Cage Rookie'], [10, 900, 'street_10', 'Cage Regular'], [40, 2500, 'street_40', 'King of the Cage']] },
    { fam: 'seasons', stat: 'seasonsWon', desc: (g) => 'Win ' + (g > 1 ? g + ' MyCareer seasons' : 'a MyCareer season'), tiers: [[1, 800, 'season_1', 'Champion'], [3, 2500, 'season_3', 'Serial Champion', 'saka'], [5, 6000, 'season_5', 'Dynasty Builder', 'kane']] },
    { fam: 'promo', stat: 'promotions', desc: (g) => 'Get promoted ' + (g > 1 ? g + ' times' : 'once') + ' in MyCareer', tiers: [[1, 500, 'promo_1', 'Promoted'], [4, 3500, 'promo_4', 'Rags to Riches', 'kvara']] },
    { fam: 'objDone', stat: 'objDone', desc: (g) => 'Complete ' + g + ' career objective' + (g > 1 ? 's' : ''), tiers: [[1, 200, 'obj_1', 'Challenger'], [10, 800, 'obj_10', 'Overachiever'], [40, 2500, 'obj_40', 'Taskmaster'], [100, 6000, 'obj_100', 'Completionist']] },
    { fam: 'careerRep', stat: (p) => (p.career && p.career.rep) || 0, desc: (g) => 'Reach ' + g + ' career reputation', tiers: [[300, 600, 'rep_300', 'Local Hero'], [1500, 2000, 'rep_1500', 'Fan Favourite'], [5000, 6000, 'rep_5000', 'Global Icon']] },
    { fam: 'goat', stat: 'careerDone', desc: () => 'Win Season 5', tiers: [[1, 5000, 'career_all', 'The GOAT']] },
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
    // appended at the END (indices never move); unlocked by reputation tier, see ISO.Career.LOOK_REQ
    { skin: '#7a5033', hair: 'fade', hairColor: '#e8cf7a' }, { skin: '#e8bd95', hair: 'mohawk', hairColor: '#4fa3ff' }, { skin: '#c98f62', hair: 'long', hairColor: '#17100c', band: '#ffcf4d' }, { skin: '#f6d7bd', hair: 'curly', hairColor: '#f1735f' },
  ];
  const CAREER_KITS = [
    ['#f1735f', '#1f2433'], ['#35e08a', '#0f1a14'], ['#1f2433', '#f1735f'], ['#f4f4f4', '#4b5a74'], ['#4fa3ff', '#ffffff'], ['#ffcf4d', '#17171b'],
    ['#b06bff', '#1f2433'], ['#0f1a14', '#ffcf4d'], ['#ffffff', '#f1735f'], ['#17171b', '#ffffff'],      // appended: reputation unlocks (ISO.Career.KIT_REQ)
  ];
  const CAREER_STAGES = 18, CAREER_REMATCH = 12;      // 18 opponents climbing in rating, then rematches against the 12 toughest of them (you can play the same person again)
  const careerOvr = (a) => Math.round(['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'skl', 'str', 'sta']
    .reduce((s, k) => s + a[k], 0) / 11);
  const upgradeCost = (v) => (v < 70 ? 1 : v < 80 ? 2 : v < 90 ? 3 : 4);

  function newCareer(seed) {
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
    // stage and ladder are frozen legacy fields (older builds still read them); the seasons live in seed, sn, hist and best
    const C = { attr, base: Object.assign({}, attr), points: 5, stage: 0, ladder, look: 0, kit: 0, name: 'YOU', foot: 'R', hist: [], best: [0, 0, 0, 0, 0] };
    if (ISO.Career) { C.seed = (seed == null ? ISO.Career.seedOf({ name: 'YOU' }) : seed) >>> 0; C.sn = ISO.Career.newSeason(C.seed, 0, 0); if (seed != null) C.seeded = true; }
    if (ISO.Career && ISO.Career.norm) ISO.Career.norm(C);
    return C;
  }

  // ------------------------------------------------------------ storage
  function fresh() {
    return {
      schema: SCHEMA, credits: 300, owned: STARTERS.slice(), claimed: {}, pity: 0, career: null,
      skins: {}, equip: {}, prime: {}, moves: [], maps: ['stadium'], map: 'stadium', balls: [], ball: 'classic', celebs: [], celeb: 'signature',      // store purchases (celeb: global, like the ball)
      settings: { volume: 0.8, muted: false, crowd: true, speed: 0.75, mouseAim: false, reticle: true, camera: 'classic', cam3d: 'chase', camZoom: 1, camSens: 1, camShake: 1, camGoal: 'celeb', pres: true, slowmo: true, hint: true, adaptive: true, weather: true, diff: 'normal', keys: null,
        uiScale: 1, palette: 'default', hcHud: false, motion: null, flash: true, hudLabels: true, hudFxText: true, hudStam: true, lang: 'en', quality: 'auto', lastTier: null, stFlags: true, stCrowd: 'full', padLayout: 'classic', padDz: 0.22, mRain: false, mTurf: 'grass', mCpu: 'auto', tut: { done: {}, seen: false, paid: false },      // Phase 9.1 (flat keys, back-filled by load(); sanitised by ISO.Access.clean). speed and weather above are dead settings: never read
        admin: { unlocked: false, allChars: false, allAch: false, infCredits: false } },
      stats: { matches: 0, wins: 0, goals: 0, powerGoals: 0, skills: 0, clears: 0, cleanSheets: 0, hardWins: 0,
        boxes: 0, careerWins: 0, careerDone: 0, seasonsWon: 0, promotions: 0, arenaGoals: 0, iconPulls: 0, drillRuns: 0, cupWins: 0, streetWins: 0, objDone: 0, chDone: 0 },
      cup: null,           // the tournament in progress: { id, seed, me, field[8], round, res[][], live } (see js/cup.js)
      cups: {},            // per cup: { won, best } (best = rounds won in your best run)
      chal: null,          // Phase 9.2 daily / weekly challenges (js/challenges.js): null until first use, sanitised by ISO.Challenges.norm
      favs: [], sets: {}, dups: {},      // Phase 5.6 collection (js/collection.js): favourite player ids (capped), claimed set ids, duplicate stars per player id (1-3)
      drills: {},          // best score per drill: { penalty: { best, plays } }; an authored drill is 'custom:<id>' (at most 30 kept)
      arena: { shots: 0, goals: 0, onTarget: 0, byType: {}, bestStreak: 0 },      // Phase 4.3: all-time Testing Arena accuracy (ISO.DrillSpec.normArena / addArena)
      adapt: { v: 1, off: { easy: 0, normal: 0, hard: 0 }, ema: { easy: 0, normal: 0, hard: 0 }, n: 0 },      // adaptive difficulty (Phase 3.2): per tier a level offset and a smoothed performance (js/ai.js ISO.AI.Adapt)
    };
  }
  let P = null;
  // Career seasons (js/career.js). Keyed on shape, not on the schema number: back-fills seed / hist / best, builds the season an old save's stage matches
  // (earlier seasons are logged as legacy, no prizes paid), rebuilds a season state that cannot be trusted (attr, points, name, look are never touched),
  // and turns a fixture that was live at reload into a 0-3 loss (no quit-scumming).
  function normCareer(Q) {
    const C = Q.career, CA = ISO.Career;
    if (!CA || !C || typeof C !== 'object') return;
    const stage = Number.isFinite(C.stage) ? C.stage | 0 : 0;
    if (!Number.isFinite(C.seed)) C.seed = CA.seedOf({ name: C.name, stage, points: C.points, credits: Q.credits, matches: Q.stats && Q.stats.matches });
    C.seed = C.seed >>> 0;
    if (!Array.isArray(C.hist)) C.hist = [];
    C.hist = C.hist.filter((h) => h && typeof h === 'object' && Number.isInteger(h.i) && h.i >= 0 && h.i < ISO.SEASONS.length).slice(-20);
    if (!Array.isArray(C.best) || C.best.length !== ISO.SEASONS.length) C.best = [0, 0, 0, 0, 0];
    C.best = C.best.map((b) => (Number.isInteger(b) && b > 0 && b <= CA.SIZE ? b : 0));
    if (!C.sn || typeof C.sn !== 'object') {
      const i = CA.fromLegacy(stage);
      for (let k = 0; k < i; k++) C.hist.push({ i: k, legacy: true });
      C.hist = C.hist.slice(-20);
      C.sn = CA.newSeason(C.seed, i, 0);
    } else if (!CA.valid(C.sn)) C.sn = CA.newSeason(C.seed, CA.clampI(C.sn.i), Number.isInteger(C.sn.n) && C.sn.n > 0 ? C.sn.n : 0);
    if (C.sn.live) { const oid = CA.opponentId(C.sn); CA.playMine(C.sn, { won: false, gf: 0, ga: 3 }); C.sn.live = false; C.streak = 0; if (ISO.Rivals) ISO.Rivals.h2hAdd(C, oid, false, 0, 3); }
    if (CA.norm) CA.norm(C);      // Phase 5.2-5.4: rep, xp, trained, tokens, focus, traits, obj, streak, sn.tally (back-filled by shape)
    if (C.kit >= CAREER_KITS.length || C.kit < 0) C.kit = 0;      // a kit or look this build does not know falls back to the first
    if (C.look >= CAREER_LOOKS.length || C.look < 0) C.look = 0;
  }
  // Schema upgrades, run on every load. Missing keys are back-filled by the loop in load(); this fixes values that are present but stale or unknown.
  function migrate(Q) {
    const was = Q.schema | 0;
    if (!Array.isArray(Q.celebs)) Q.celebs = [];
    Q.celebs = Q.celebs.filter((id, i) => typeof id === 'string' && ISO.hasCeleb(id) && ISO.celebById(id).cost > 0 && Q.celebs.indexOf(id) === i);      // unknown ids (a removed celebration) are dropped, as for maps
    if (typeof Q.celeb !== 'string' || (Q.celeb !== 'signature' && !(ISO.hasCeleb(Q.celeb) && (ISO.celebById(Q.celeb).cost === 0 || Q.celebs.includes(Q.celeb))))) Q.celeb = 'signature';
    if (!Q.cups || typeof Q.cups !== 'object' || Array.isArray(Q.cups)) Q.cups = {};
    for (const id of Object.keys(Q.cups)) { const c = Q.cups[id]; if (!ISO.Cup || !ISO.Cup.cupById(id) || !c || typeof c !== 'object') delete Q.cups[id]; else { c.won = Math.max(0, c.won | 0); c.best = Math.max(0, c.best | 0); } }      // an unknown cup (a removed one) is dropped
    if (Q.cup && (!ISO.Cup || !ISO.Cup.valid(Q.cup))) Q.cup = null;      // a cup whose id or players are unknown, or whose bracket does not add up, is dropped (never trusted)
    else if (Q.cup && Q.cup.live) Q.cup = null;      // reloaded or quit in the middle of a cup match: that counts as elimination (no retry scumming)
    if (!Q.cup) Q.cup = null;
    if (Q.career && typeof Q.career === 'object' && Q.career.foot !== 'L' && Q.career.foot !== 'R') Q.career.foot = 'R';
    normCareer(Q);
    if (ISO.Collection) ISO.Collection.norm(Q);      // Phase 5.6: favs, sets, dups, career.kitCustom (keyed on shape, no schema bump)
    if (ISO.Challenges) ISO.Challenges.norm(Q);      // Phase 9.2: chal (keyed on shape, no schema bump)
    if (ISO.AI && ISO.AI.Adapt) Q.adapt = ISO.AI.Adapt.sanitize(Q.adapt);      // keyed on shape (no schema bump): corrupt or out-of-range values become 0
    if (ISO.DrillSpec) Q.arena = ISO.DrillSpec.normArena(Q.arena);      // Phase 4.3 (keyed on shape, no schema bump)
    if (Q.drills && typeof Q.drills === 'object') { const ck = Object.keys(Q.drills).filter((k) => k.startsWith('custom:')); for (const k of ck.slice(0, Math.max(0, ck.length - 30))) delete Q.drills[k]; }      // authored drills: bounded
    if (was < SCHEMA) Q.schema = SCHEMA;      // never lowered: a profile saved by a newer build keeps its number
    return Q;
  }
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
    migrate(P);
    if (!P.career.base) P.career.base = newCareer().base;      // older saves
    { const nl = newCareer().ladder; if (P.career.ladder.length < nl.length) P.career.ladder = nl; }      // the ladder grew: keep your stage, new opponents follow
    for (const k of Object.keys(f.settings)) if (P.settings[k] === undefined) P.settings[k] = f.settings[k];
    if (P.settings.keys && !P.settings.keysMouse) {      // mouse buttons became ordinary bindings: keep click-to-shoot for existing profiles
      const K = P.settings.keys; if (K.shoot && !K.shoot[1]) K.shoot[1] = 'Mouse0'; if (K.chip && !K.chip[1]) K.chip[1] = 'Mouse2';
    }
    P.settings.keysMouse = true;
    for (const k of Object.keys(f.settings.admin)) if (P.settings.admin[k] === undefined) P.settings.admin[k] = f.settings.admin[k];
    P.settings.admin.unlocked = false;      // admin is per session: it has to be entered again after every reload
    return P;
  }
  let saveFailCb = null, saveFailed = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: progress lasts this session */ if (!saveFailed) { saveFailed = true; try { saveFailCb && saveFailCb(e); } catch (e2) { /* ignore */ } } } }

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
  // Phase 5.6: a duplicate keeps its refund and also adds a star (3 at most); each star takes 10% off that player's Prime price
  function addDup(id) { const C = ISO.Collection; if (C) P.dups[id] = Math.min(C.DUP_MAX, ((P.dups[id]) | 0) + 1); }
  function claim(id) {
    const a = ACH.find((x) => x.id === id);
    if (!a || P.claimed[id] || statOf(a) < a.goal) return 0;
    P.claimed[id] = true; P.credits += a.reward;
    lastClaim = { player: null, dup: 0 };
    if (a.player && ISO.playerById(a.player)) {      // some levels also hand over a player (a duplicate pays its refund instead)
      const d = ISO.playerById(a.player);
      if (P.owned.includes(d.id)) { lastClaim.dup = ISO.RARITY[ISO.rarityOf(d)].dup; P.credits += lastClaim.dup; addDup(d.id); } else { P.owned.push(d.id); lastClaim.player = d; }
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
  const winMult = (diff, me, opp, lvl, set) => { const d = Number.isFinite(lvl) && ISO.AI && ISO.AI.Adapt ? ISO.AI.Adapt.payout(lvl) : WIN_MULT[diff] || 1, g = gapMult(me, opp), sb = set > 0 ? set : 0; return { diff: d, gap: g, set: sb, total: Math.round(d * g * (1 + sb) * 100) / 100 }; };      // lvl: the effective level (adaptive CPU): sandbagging pays less
  function recordMatch(r) {
    const before = doneSet(), S = P.stats, wm = winMult(r.diff, r.mode === 'cpu' ? r.me : null, r.opp, r.lvl, r.mode === 'cpu' && r.me && ISO.Collection ? ISO.Collection.setBonus(P.owned, (r.me.base || r.me).id) : 0), mult = wm.total;      // Phase 5.6: +5% per completed set the fielded player belongs to (max +15%)
    if (r.adapt && ISO.AI && ISO.AI.Adapt && (r.mode === 'cpu' || r.mode === 'career')) P.adapt = ISO.AI.Adapt.next(P.adapt, r.diff, { gf: r.gf, ga: r.ga, win: r.win, poss: r.poss, sot: r.sot });      // adaptive difficulty: next match's level
    S.matches++; S.goals += r.gf; S.skills += r.skills; S.clears += r.clears; S.powerGoals += r.powerGoals;
    let credits = 40 + 15 * r.gf, points = 0, bonus = 0, season = null, obj = null, boss = null;
    if (r.won) {
      S.wins++; bonus += 100;
      if (r.ga === 0) { S.cleanSheets++; bonus += 50; }
      if (Number.isFinite(r.lvl) ? r.lvl >= 2 : r.diff === 'hard') S.hardWins++;      // an adaptive Hard that has eased off does not count
      if (r.rules === 'street') S.streetWins++;
    }
    if (r.mode === 'career') {
      const C = P.career, sn = C.sn;
      points = r.won ? ISO.SEASONS[sn.i].win : ISO.Career.LOSS_PTS;
      if (r.won) { bonus += 150 + Math.max(0, (r.opp.ovr - 60) * 4); S.careerWins++; }
      obj = r.m ? careerSettle(r.m, r) : null;      // before playMine: the objectives belong to this matchday (a result without a tracker summary earns none)
      C.points += points;
      if (ISO.Rivals && r.opp) ISO.Rivals.h2hAdd(C, r.opp.id, r.won, r.gf, r.ga);      // Phase 5.5: head-to-head against the season's opponents
      ISO.Career.playMine(sn, { won: r.won, gf: r.gf, ga: r.ga }); sn.live = false;
      season = { md: sn.md, pos: ISO.Career.posOf(C.seed, sn, careerOvr(C.attr)), done: sn.md >= ISO.Career.MD };
    }
    if (r.mode === 'boss' && ISO.Rivals && P.career.sn.md >= ISO.Career.MD) {      // Phase 5.5: the season finale (a rival, first to 5). Not a league fixture: no matchday, points, XP or token; a loss pays only the ordinary match credits
      boss = ISO.Rivals.bossSettle(P.career, { won: r.won, gf: r.gf, ga: r.ga, m: r.m });
      if (boss) credits += boss.credits;
    }
    credits += Math.round(bonus * mult);
    P.credits += credits;
    save();
    return { credits, points, mult: r.won ? mult : 1, wm, season, obj, boss, ach: newlyDone(before) };
  }
  // Phase 5.2-5.4: pay one finished career fixture (never a forfeit): objectives, XP, token, reputation. m: the tracker summary (ISO.Career.Tracker.finish).
  function careerSettle(m, r) {
    const C = P.career, CA = ISO.Career;
    if (!CA.settle) return null;
    if (!Number.isFinite(m.ovrGap) && r.opp) m.ovrGap = r.opp.ovr - careerOvr(C.attr);
    if (!Array.isArray(C.traits)) C.traits = ISO.styleOf(careerDef()).traits.slice();
    const t0 = C.traits.slice(), ids = CA.objectivesFor(C, { gap: m.ovrGap });
    const x = CA.settle(C, m, { ids, i: C.sn.i });
    P.credits += x.credits; C.points += x.points; P.stats.objDone += x.done;
    const t1 = ISO.styleOf(careerDef()).traits;
    x.traitsNew = t1.filter((id) => !t0.includes(id)); C.traits = t0.concat(x.traitsNew);      // remembered: a trait toasts once, when it is first unlocked
    return x;
  }
  // ------------------------------------------------------------ tournaments (js/cup.js holds the bracket logic)
  const CUPS = () => ISO.CUPS || [];
  const cupRec = (id) => (P.cups[id] = P.cups[id] || { won: 0, best: 0 });
  const cupWon = (id) => !!(P.cups[id] && P.cups[id].won > 0);
  // 'ok' | 'locked' (the cup you must win first) | 'noplayer' (your player does not fit the cup) | 'unknown'
  function cupCan(id, meId) {
    const cup = ISO.Cup.cupById(id);
    if (!cup) return 'unknown';
    if (cup.req && !cupWon(cup.req) && !(AD().unlocked && AD().allAch)) return 'locked';
    const d = ISO.playerById(meId);
    if (!d || !owns(meId) || !ISO.Cup.eligible(cup, d) || ISO.Cup.seedField(cup, meId, 1).length < cup.size) return 'noplayer';
    return 'ok';
  }
  // Enter: a fresh seeded bracket. `seed` comes from the caller (the UI passes the clock): the profile never rolls dice. A cup in progress is abandoned (no refund, no prize).
  function cupEnter(id, meId, seed) {
    if (cupCan(id, meId) !== 'ok') return null;
    P.cup = ISO.Cup.newState(ISO.Cup.cupById(id), meId, seed);
    save();
    return P.cup;
  }
  // Written before kickoff and saved: if the page is closed or the match quit from here, the load counts it as a loss.
  function cupKickoff() { if (!P.cup) return false; P.cup.live = true; save(); return true; }
  // The match is over (won or lost) or abandoned (won = false). Pays the round's prize on a win; a loss or a quit ends the cup.
  // Returns { status: 'next' | 'champion' | 'out', prize, round, ach }. After 'next' the other fixtures of the round are still to be simulated (cupSimNext).
  function recordCup(won, gf, ga) {
    const st = P.cup;
    if (!st) return null;
    const before = doneSet(), cup = ISO.Cup.cupById(st.id), r = st.round, rec = cupRec(st.id);
    st.live = false;
    if (ISO.Cup.playMine(st, { won: !!won, gf: gf | 0, ga: ga | 0 }) === 'out') {
      rec.best = Math.max(rec.best, r);
      P.cup = null; save();
      return { status: 'out', prize: 0, round: r, cup, ach: newlyDone(before) };
    }
    const prize = cup.prize[r] || 0;
    P.credits += prize; rec.best = Math.max(rec.best, r + 1);
    let status = 'next';
    if (r + 1 >= ISO.Cup.roundCount(cup)) { rec.won++; P.stats.cupWins++; status = 'champion'; P.cup = null; }
    save();
    return { status, prize, round: r, cup, ach: newlyDone(before) };
  }
  // Simulate one pending fixture of the round in progress (the screen calls this once per frame); advances the round when the last one lands.
  // Returns { left, fixture, round } with left = fixtures still pending (0 when the round moved on).
  function cupSimNext() {
    const st = P.cup;
    if (!st) return null;
    const pend = ISO.Cup.pending(st), round = st.round;
    if (!pend.length) { if (st.res[st.round] && st.res[st.round][ISO.Cup.myFixture(st)]) ISO.Cup.finishRound(st); save(); return { left: 0, fixture: -1, round }; }
    const f = pend[0]; ISO.Cup.simFixture(st, f);
    if (pend.length === 1) ISO.Cup.finishRound(st);
    save();
    return { left: pend.length - 1, fixture: f, round };
  }
  function cupOpponent() { return P.cup ? ISO.playerById(ISO.Cup.opponentOf(P.cup)) : null; }
  function chPay(x) { P.credits += x.credits; P.stats.chDone += x.done.length; if (x.done.length || x.credits) save(); return x; }
  function recordArena(t) { P.arena = ISO.DrillSpec.addArena(P.arena, t); save(); return P.arena; }
  function recordArenaGoal() {
    const before = doneSet();
    P.stats.arenaGoals++; P.credits += 2; save();
    return newlyDone(before);
  }

  // Finishing a penalty / target / chip drill pays credits by score (scaled by the keeper level) and keeps your best.
  const DRILL_CR = { penalty: 20, target: 6, chip: 30, freekick: 30, oneonone: 22, longshot: 14, finesse: 14, power: 28 };
  function recordDrill(kind, score, diff, bonus) {
    const custom = typeof kind === 'string' && kind.startsWith('custom:');      // Phase 4.4: an authored drill pays 1 CR a point, at most ISO.DrillSpec.CR_CAP (8) a run, no win bonus, and does not count towards the Drills achievement
    const before = doneSet(), d = (P.drills[kind] = P.drills[kind] || { best: 0, plays: 0 });
    if (custom) {
      const credits = ISO.DrillSpec.credits(score), newBest = score > d.best;
      if (newBest) d.best = score;
      d.plays++; P.credits += credits; save();
      return { credits, best: d.best, newBest, ach: [] };
    }
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
    if (dup) { refund = ISO.RARITY[rarity].dup; P.credits += refund; addDup(def.id); } else P.owned.push(def.id);
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
    P.celebs = ISO.CELEBS.filter((c) => c.cost > 0).map((c) => c.id);
    P.maps = ISO.MAPS.map((m) => m.id);
    save();
  }
  const isPrime = (pid) => !!P.prime[pid];
  const primeCost = (d) => (ISO.Collection ? ISO.Collection.primeCost(d, P.dups) : ISO.primeCost(d));
  // ---- Phase 5.6 collection: favourites, sets, duplicate stars (the rules are js/collection.js)
  const isFav = (id) => P.favs.includes(id);
  function toggleFav(id) {      // false when the id is unknown or the list is full (the cap is ISO.Collection.FAV_CAP)
    if (!ISO.playerById(id)) return false;
    const i = P.favs.indexOf(id);
    if (i >= 0) P.favs.splice(i, 1);
    else if (P.favs.length < ISO.Collection.FAV_CAP) P.favs.push(id);
    else return false;
    save(); return true;
  }
  const setStatus = (id) => { const s = ISO.Collection.setById(id); return s ? { set: s, have: ISO.Collection.have(s, P.owned), done: ISO.Collection.complete(s, P.owned), claimed: !!P.sets[id] } : null; };
  // the one-time credit claim of a completed set; idempotent (0 when not complete or already claimed)
  function claimSet(id) {
    const st = setStatus(id);
    if (!st || !st.done || st.claimed) return 0;
    P.sets[id] = true; P.credits += st.set.credit; save();
    return st.set.credit;
  }
  const dupStars = (id) => ISO.Collection.dupStars(P.dups, id);
  function buyPrime(pid) {
    const d = ISO.playerById(pid);
    if (!d || !owns(pid)) return 'locked';
    if (isPrime(pid)) return 'owned';
    return buy(primeCost(d), () => { P.prime[pid] = true; });
  }
  // the character as you field them: prime stats and the equipped skin
  const outfit = (d) => ISO.outfit(d, isPrime(d.id), skinOf(d.id), celebOf());
  // celebrations: one global choice ('signature' = the player's own), like the ball skin
  const ownsCeleb = (id) => id === 'signature' || (ISO.hasCeleb(id) && (ISO.celebById(id).cost === 0 || P.celebs.includes(id)));
  const celebOf = () => (ownsCeleb(P.celeb) ? P.celeb : 'signature');
  function buyCeleb(id) {
    if (!ISO.hasCeleb(id)) return 'locked';
    if (ownsCeleb(id)) return 'owned';
    return buy(ISO.celebById(id).cost, () => { P.celebs.push(id); P.celeb = id; });
  }
  function equipCeleb(id) { if (!ownsCeleb(id)) return false; P.celeb = id; save(); return true; }
  const hasMove = (id) => !ISO.MOVE_COST[id] || P.moves.includes(id);
  function buyMove(id) {      // no store path any more: every move is free and unlocked; kept for old callers
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
    const kc = ISO.Collection ? ISO.Collection.kitClean(C.kitCustom) : null, [a, b] = kc ? [kc.a, kc.b] : CAREER_KITS[C.kit % CAREER_KITS.length];      // 5.6: a custom kit (validated hex colours) replaces the chosen one
    return {
      id: 'you' + C.look + '_' + C.kit + (kc ? '_' + kc.a.slice(1) + kc.b.slice(1) : ''), name: C.name, short: C.name, nat: 'YOU', flag: '⭐', club: 'MyCareer', era: 'modern',
      ovr: careerOvr(C.attr), foot: C.foot || 'R', num: C.num == null ? 10 : C.num, attr: Object.assign({}, C.attr), look,
      kit: { a, b, pat: 'cstripe', shorts: b, socks: a },
    };
  }
  // Slide an attribute to `target`: raising spends points (as far as they go), lowering refunds them —
  // even below the value the career started with, down to ATTR_MIN, so points can be moved between stats.
  const ATTR_MIN = 30;
  function setAttr(k, target) {
    const C = P.career, lo = Math.min(ATTR_MIN + ((C.trained && C.trained[k]) | 0), C.attr[k]);      // trained points (5.2) are not refundable: the floor rises by them
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
  // ------------------------------------------------------------ career seasons (js/career.js holds the league logic)
  const careerOpponent = () => { const id = ISO.Career.opponentId(P.career.sn); return id ? ISO.playerById(id) : null; };
  const careerDiff = () => ISO.Career.diffOf(P.career.sn);      // the old stage argument is ignored
  // A career nobody has touched takes the UI's clock seed once, so two new careers do not share a league. Never reseeds a career in progress.
  function careerBegin(seed) {
    const C = P.career, sn = C.sn;
    if (C.seeded || sn.live || sn.md || sn.n || C.hist.length || !Number.isFinite(seed)) return false;
    C.seed = seed >>> 0; C.seeded = true; C.sn = ISO.Career.newSeason(C.seed, sn.i, 0); save();
    return true;
  }
  // written before kickoff and saved: a page closed or a match quit from here is a 0-3 loss
  function careerKickoff() { if (P.career.sn.md >= ISO.Career.MD) return false; P.career.sn.live = true; save(); return true; }
  function careerForfeit() {
    const sn = P.career.sn;
    if (sn.boss && sn.boss.live && ISO.Rivals) { ISO.Rivals.bossForfeit(P.career); save(); return { md: sn.md, pos: ISO.Career.posOf(P.career.seed, sn, careerOvr(P.career.attr)), done: true, boss: true }; }      // 5.5: leaving the finale is a loss on the rival ledger, nothing paid, the league is unaffected
    if (!sn.live) return null;
    if (ISO.Rivals) ISO.Rivals.h2hAdd(P.career, ISO.Career.opponentId(sn), false, 0, 3);
    ISO.Career.playMine(sn, { won: false, gf: 0, ga: 3 }); sn.live = false; P.career.streak = 0; save();      // a forfeit pays no objectives, XP, token or reputation
    return { md: sn.md, pos: ISO.Career.posOf(P.career.seed, sn, careerOvr(P.career.attr)), done: sn.md >= ISO.Career.MD };
  }
  const seasonTable = () => { const C = P.career; return ISO.Career.table(C.seed, C.sn, careerOvr(C.attr)); };
  // the season is over (matchday 7 played): pays the prize and the points bonus, logs it, installs the next season. Returns the summary, or null when it is not over.
  function seasonEnd() {
    const C = P.career, sn = C.sn, CA = ISO.Career;
    if (sn.md < CA.MD || sn.live || (sn.boss && sn.boss.live)) return null;
    const before = doneSet(), def = ISO.SEASONS[sn.i], f = CA.finish(C.seed, sn, careerOvr(C.attr));
    const again = C.best[sn.i] === 1, prize = CA.prize(sn, f.pos, again), bonus = f.move === 'champion' ? 2 * def.win : f.move === 'up' ? def.win : 0;
    P.credits += prize; C.points += bonus;
    const sobj = CA.seasonSettle ? CA.seasonSettle(C, f.pos, f.move) : null;      // the three season objectives and the finish's reputation (5.3, 5.4)
    if (sobj) { P.credits += sobj.credits; C.points += sobj.points; P.stats.objDone += sobj.objs.filter((o) => o.done).length; }
    if (f.pos < C.best[sn.i] || !C.best[sn.i]) C.best[sn.i] = f.pos;
    if (f.move === 'champion') P.stats.seasonsWon++;
    if (f.next.i > sn.i) P.stats.promotions++;
    if (f.move === 'champion' && sn.i === ISO.SEASONS.length - 1) P.stats.careerDone = 1;
    C.hist.push({ i: sn.i, n: sn.n, pos: f.pos, move: f.move, prize, bonus }); C.hist = C.hist.slice(-20);
    const finale = sn.boss && sn.boss.done ? { id: sn.boss.id, w: !!(sn.boss.res && sn.boss.res.w) } : null;      // 5.5: closing with the finale unplayed skips it (no record)
    const rows = CA.table(C.seed, sn, careerOvr(C.attr));
    C.sn = CA.newSeason(C.seed, f.next.i, f.next.n);
    if (ISO.Rivals) ISO.Rivals.ensureBoss(C);
    save();
    return { i: sn.i, n: sn.n, pos: f.pos, move: f.move, next: f.next, prize, bonus, halved: again && prize > 0, rows, sobj, finale, ach: newlyDone(before) };
  }
  // ---- Phase 5.5 rivals (js/rivals.js): the season finale, the ledgers
  const bossReady = () => !!ISO.Rivals && ISO.Rivals.bossReady(P.career);
  const bossMatch = () => (bossReady() ? ISO.Rivals.bossMatch(P.career) : null);
  const bossKickoff = () => { const ok = !!ISO.Rivals && ISO.Rivals.bossKickoff(P.career); if (ok) save(); return ok; };
  const rivalLedger = (id) => (ISO.Rivals && P.career.rivals && P.career.rivals[id]) || (ISO.Rivals ? ISO.Rivals.blank() : null);
  const setKitCustom = (a, b) => { const k = ISO.Collection ? ISO.Collection.kitClean(a === null ? null : { a, b }) : null; if (a !== null && !k) return false; P.career.kitCustom = k; save(); return true; };
  function resetCareer(seed) { P.career = newCareer(seed); save(); }
  // the next look / kit in direction d that your reputation tier has unlocked (the ones past the first six are rewards, ISO.Career.LOOK_REQ / KIT_REQ)
  const cycleOpt = (cur, d, len, ok) => { let k = cur; for (let n = 0; n < len; n++) { k = (k + d + len) % len; if (ok(k)) return k; } return cur; };
  function cycleLook(d) { P.career.look = cycleOpt(P.career.look, d, CAREER_LOOKS.length, (k) => ISO.Career.lookOk(k, P.career.rep | 0)); save(); }
  function setCareerName(v) { P.career.name = String(v || '').replace(/[^\w .'-]/g, '').trim().toUpperCase().slice(0, 12) || 'YOU'; save(); return P.career.name; }
  function setCareerNum(v) { const n = Math.max(0, Math.min(99, parseInt(v, 10))); P.career.num = Number.isFinite(n) ? n : 10; save(); return P.career.num; }
  function toggleFoot() { P.career.foot = P.career.foot === 'L' ? 'R' : 'L'; save(); return P.career.foot; }
  function cycleKit(d) { P.career.kit = cycleOpt(P.career.kit, d, CAREER_KITS.length, (k) => ISO.Career.kitOk(k, P.career.rep | 0)); save(); }
  // ------------------------------------------------------------ objectives, training, reputation (5.2-5.4; the rules are js/career-obj.js)
  // the three objectives of the next fixture (drawn once per matchday and remembered), with rewards
  function careerObjectives() {
    const C = P.career, CA = ISO.Career, opp = careerOpponent();
    if (!CA.objectivesFor || C.sn.md >= CA.MD) return [];
    const ids = CA.objectivesFor(C, { gap: opp ? opp.ovr - careerOvr(C.attr) : 0 });
    save();
    return ids.map((id) => { const o = CA.OBJ_BY[id]; return Object.assign({ id, tier: o.tier, desc: o.desc }, CA.objReward(o.tier, C.sn.i)); });
  }
  const seasonObjectives = () => { const C = P.career, CA = ISO.Career; return CA.seasonObjs(C.seed, C.sn.i, C.sn.n).map((id) => { const o = CA.SEASON_BY[id]; return Object.assign({ id, tier: o.tier, desc: o.desc, done: o.id === 's_top3' ? null : !!o.test(C.sn.tally || CA.freshTally(), 1) }, CA.seasonReward(o.tier, C.sn.i)); }); };
  function setFocus(id) { if (!ISO.Career.TRAIN_BY[id]) return false; P.career.focus = id; save(); return true; }
  // spend a training token on a drill of programme `prog`: false when there is none (or the drill does not train it). The token is spent at kickoff: leaving the drill loses it.
  let trainPending = null;
  function trainStart(prog, kind) {
    const C = P.career;
    if (C.tokens < 1 || !ISO.Career.progForDrill(prog, kind)) return false;
    C.tokens--; trainPending = { prog, kind }; save();
    return true;
  }
  // the drill finished: XP for the programme (doubled on the focus), attribute gains, trait unlocks
  function trainFinish(kind, score) {
    const t = trainPending, C = P.career;
    trainPending = null;
    if (!t || t.kind !== kind || !(ISO.DRILLS && ISO.DRILLS[kind])) return null;
    if (!Array.isArray(C.traits)) C.traits = ISO.styleOf(careerDef()).traits.slice();
    const t0 = C.traits.slice(), x = ISO.Career.drillSettle(C, t.prog, kind, score, ISO.DRILLS[kind].max);
    if (!x) return null;
    x.traitsNew = ISO.styleOf(careerDef()).traits.filter((id) => !t0.includes(id)); C.traits = t0.concat(x.traitsNew);
    save();
    return x;
  }
  const trainActive = () => !!trainPending;
  const trainAbort = () => { trainPending = null; };

  // The tutorial (js/tutorial.js): which lessons are done (1 = completed, 2 = finished with a step skipped: seen, but it does not count for the reward), whether the first-run offer was answered and whether the one-time reward was paid. Lives in settings.tut, so an old
  // profile gets it back-filled by load(), reset() keeps it (the reward can never be collected twice) and no schema number changes. Lessons never touch stats, challenges or career.
  function tutState() {
    const S = P.settings, t = S.tut && typeof S.tut === 'object' && !Array.isArray(S.tut) ? S.tut : (S.tut = {});
    if (!t.done || typeof t.done !== 'object' || Array.isArray(t.done)) t.done = {};
    for (const k of Object.keys(t.done)) if (!/^[a-z]{1,16}$/.test(k) || t.done[k] !== 1 && t.done[k] !== 2) delete t.done[k];
    t.seen = t.seen === true; t.paid = t.paid === true;
    if (t.snap !== undefined && !(t.snap && typeof t.snap === 'object' && !Array.isArray(t.snap))) delete t.snap;
    return t;
  }
  const tutDone = (id, completed) => { const t = tutState(), v = completed === false ? 2 : 1; if (/^[a-z]{1,16}$/.test(id) && (t.done[id] === undefined || (v === 1 && t.done[id] === 2))) { t.done[id] = v; t.seen = true; save(); } };      // (only ever grows: a skipped finish is 2, a completed one 1, and 1 is never lowered)
  // the settings a lesson changes (Views: camera, 3D camera, mouse aim) as they were when it began, kept until the lesson puts them back: a tab closed mid-lesson is restored on the next boot
  const tutSnap = (v) => { const t = tutState(); if (v === undefined) return t.snap || null; if (v) t.snap = v; else delete t.snap; save(); return t.snap || null; };
  const tutSeen = () => { const t = tutState(); if (!t.seen) { t.seen = true; save(); } };
  function tutReward(cr) { const t = tutState(); if (t.paid || !(cr > 0)) return 0; t.paid = true; P.credits += Math.min(500, Math.floor(cr)); save(); return Math.min(500, Math.floor(cr)); }      // once, ever: the flag is set before the credits are paid

  load();
  ISO.Profile = {
    tutState, tutDone, tutSeen, tutSnap, tutReward,
    get data() { return P; }, save, ACH, BOXES, PITY, statOf, isDone, claim, recordMatch, recordArenaGoal, recordArena, recordDrill,
    WIN_MULT, winMult, canOpen, openBox, openBoxes, claimInfo: () => lastClaim, FAMILIES, filler, owns, infinite, ownedCount: () => ISO.PLAYERS.filter((d) => owns(d.id)).length,
    cupCan, cupEnter, cupKickoff, recordCup, cupSimNext, cupOpponent, cupWon,
    ownsSkin, skinOf, maxAll, buySkin, equipSkin, isPrime, buyPrime, outfit, hasMove, buyMove, moveSet, ownsMap, buyMap, setMap, ownsBall, buyBall, equipBall, ownsCeleb, celebOf, buyCeleb, equipCeleb, toggleFoot, migrate, SCHEMA,
    takeAch() { const l = lastAch; lastAch = []; return l; },      // achievements completed by the last purchase
    setSetting(k, v) { P.settings[k] = v; save(); },
    onSaveFail(cb) { saveFailCb = cb; },      // 9.4: called once if localStorage refuses a write
    bytes: () => JSON.stringify(P).length,
    // Phase 9.2: the challenge state stepped to `now` (ms), the view for the overlay; recording pays credits straight away (no claim step) and counts stats.chDone
    challenges(now) { const S = ISO.Challenges.norm(P), ch = ISO.Challenges.roll(S, now), v = ISO.Challenges.view(S, now); if (ch) save(); return v; },
    challengeMatch(m, ctx, now) { return chPay(ISO.Challenges.onMatch(ISO.Challenges.norm(P), m, ctx, now)); },
    challengeDrill(kind, score, max, diff, now) { return chPay(ISO.Challenges.onDrill(ISO.Challenges.norm(P), kind, score, max, diff, now)); },
    setAdmin(k, v) { P.settings.admin[k] = v; save(); },
    adminGrant() { P.settings.admin.unlocked = true; save(); },      // called once the server has accepted the code (ISO.Online.adminLogin)
    adminLogout() { P.settings.admin.unlocked = false; save(); },
    bossReady, bossMatch, bossKickoff, rivalLedger, setKitCustom, isFav, toggleFav, setStatus, claimSet, dupStars, primeCost,
    careerObjectives, seasonObjectives, setFocus, trainStart, trainFinish, trainActive, trainAbort, careerSettle,
    ATTR_MIN, careerDef, careerOpponent, careerDiff, careerBegin, careerKickoff, careerForfeit, seasonTable, seasonEnd, upgrade, upgradeCost, setAttr, reach, resetCareer, cycleLook, cycleKit, setCareerName, setCareerNum, careerOvr,
    adaptLevel: (diff) => (ISO.AI && ISO.AI.Adapt ? ISO.AI.Adapt.level(P.adapt, diff) : { easy: 0, normal: 1, hard: 2 }[diff] || 1),
    resetAdapt() { P.adapt = ISO.AI && ISO.AI.Adapt ? ISO.AI.Adapt.fresh() : fresh().adapt; save(); },
    reset() { const st = P.settings; P = fresh(); P.career = newCareer(); P.settings = st; save(); },
  };
})();
