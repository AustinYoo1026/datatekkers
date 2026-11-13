/* ISO FOOTBALL — roster data. Pure data, no DOM. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  ISO.VERSION = '3.01';      // the release shown on the menu; README.md and index.html must say the same (CI checks)

  // Attribute order used by the compact roster table below.
  const KEYS = ['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'lng', 'cur', 'wf', 'skl', 'str', 'tck', 'sta'];

  ISO.ATTRS = [
    ['pac', 'Pace'], ['acc', 'Acceleration'], ['dri', 'Dribbling'], ['agi', 'Agility'], ['bal', 'Balance'],
    ['bct', 'Ball Control'], ['fin', 'Finishing'], ['sho', 'Shot Power'], ['lng', 'Long Shots'], ['cur', 'Curve'],
    ['wf', 'Weak Foot'], ['skl', 'Skill Moves'], ['str', 'Strength'], ['tck', 'Tackling'], ['sta', 'Stamina'],
  ];

  // Skill-move star rating (1-5) derived from the Skill Moves attribute.
  ISO.stars = (skl) => (skl >= 90 ? 5 : skl >= 80 ? 4 : skl >= 68 ? 3 : skl >= 55 ? 2 : 1);

  function P(id, name, short, nat, flag, club, era, ovr, foot, num, attrs, look, kit, role) {
    const attr = {};
    KEYS.forEach((k, i) => (attr[k] = attrs[i]));
    const d = { id, name, short, nat, flag, club, era, ovr, foot, num, attr, look, kit };
    if (role) d.role = role;      // generated players carry their archetype; the 20 hand-authored stars are in ROLE_FIX below
    return d;
  }
  const kit = (a, b, pat, shorts, socks) => ({ a, b, pat, shorts, socks });

  ISO.PLAYERS = [
    //                                                                            pac acc dri agi bal bct fin sho lng cur wf  skl str tck sta
    P('messi', 'Lionel Messi', 'MESSI', 'ARG', '🇦🇷', 'Inter Miami', 'modern', 94, 'L', 10,
      [86, 93, 98, 95, 97, 98, 95, 86, 93, 95, 72, 88, 62, 38, 76],
      { skin: '#eec39a', hair: 'side', hairColor: '#4a2f1c', beard: 'full', beardColor: '#7a4a2c', face: 'oval', h: 0.92, w: 0.98 },
      kit('#f4a9c2', '#17171b', 'solid', '#f4a9c2', '#f4a9c2')),
    P('ronaldo', 'Cristiano Ronaldo', 'RONALDO', 'POR', '🇵🇹', 'Al Nassr', 'modern', 93, 'R', 7,
      [90, 88, 89, 86, 78, 91, 96, 96, 93, 84, 88, 92, 84, 36, 86],
      { skin: '#dba77a', hair: 'quiff', hairColor: '#1c1410', face: 'square', brow: 'heavy', h: 1.06, w: 1.06 },
      kit('#f7d117', '#1d3f94', 'solid', '#1d3f94', '#f7d117')),
    P('mbappe', 'Kylian Mbappé', 'MBAPPÉ', 'FRA', '🇫🇷', 'Real Madrid', 'modern', 92, 'R', 10,
      [98, 98, 93, 93, 82, 91, 93, 90, 84, 82, 80, 91, 76, 36, 88],
      { skin: '#8a5a3a', hair: 'buzz', hairColor: '#141010', face: 'round', h: 1.0, w: 1.0 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('haaland', 'Erling Haaland', 'HAALAND', 'NOR', '🇳🇴', 'Manchester City', 'modern', 91, 'L', 9,
      [90, 84, 79, 74, 74, 82, 97, 97, 85, 76, 68, 62, 96, 45, 84],
      { skin: '#f6d7bd', hair: 'bun', hairColor: '#e8cf7a', face: 'long', brow: 'light', h: 1.12, w: 1.14 },
      kit('#6cabdd', '#ffffff', 'solid', '#ffffff', '#6cabdd')),
    P('neymar', 'Neymar Jr', 'NEYMAR', 'BRA', '🇧🇷', 'Santos', 'modern', 90, 'R', 10,
      [88, 93, 96, 96, 84, 95, 88, 80, 84, 90, 92, 98, 52, 32, 78],
      { skin: '#c98f62', hair: 'mohawk', hairColor: '#2a1a12', beard: 'stubble', beardColor: '#2a1a12', face: 'narrow', h: 0.97, w: 0.9 },
      kit('#f4f4f4', '#141414', 'vstripes', '#141414', '#f4f4f4')),
    P('yamal', 'Lamine Yamal', 'YAMAL', 'ESP', '🇪🇸', 'Barcelona', 'modern', 89, 'L', 10,
      [90, 92, 94, 93, 80, 92, 85, 80, 84, 90, 66, 92, 58, 34, 80],
      { skin: '#b47a4e', hair: 'curly', hairColor: '#d8b45a', hair2: '#2a1a12', face: 'narrow', h: 1.0, w: 0.9 },
      kit('#a50044', '#004d98', 'vstripes', '#004d98', '#004d98')),
    P('vinicius', 'Vinícius Júnior', 'VINÍCIUS', 'BRA', '🇧🇷', 'Real Madrid', 'modern', 91, 'R', 7,
      [96, 96, 94, 95, 80, 90, 87, 82, 78, 80, 70, 96, 66, 30, 86],
      { skin: '#6b4226', hair: 'fade', hairColor: '#120d0a', face: 'sharp', h: 0.98, w: 0.93 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('salah', 'Mohamed Salah', 'SALAH', 'EGY', '🇪🇬', 'Liverpool', 'modern', 90, 'L', 11,
      [92, 92, 90, 91, 90, 89, 93, 86, 86, 88, 64, 82, 74, 44, 88],
      { skin: '#c08a5c', hair: 'afro', hairColor: '#1a1210', beard: 'full', beardColor: '#1a1210', face: 'oval', h: 0.97, w: 1.0 },
      kit('#c8102e', '#f6eb61', 'solid', '#c8102e', '#c8102e')),
    P('bellingham', 'Jude Bellingham', 'BELLINGHAM', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Real Madrid', 'modern', 90, 'R', 5,
      [82, 82, 88, 84, 86, 90, 86, 86, 86, 80, 82, 84, 86, 80, 95],
      { skin: '#9a6a44', hair: 'fade', hairColor: '#17100c', beard: 'stubble', beardColor: '#17100c', face: 'square', h: 1.05, w: 1.05 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('debruyne', 'Kevin De Bruyne', 'DE BRUYNE', 'BEL', '🇧🇪', 'Napoli', 'modern', 89, 'R', 11,
      [72, 74, 86, 76, 78, 91, 86, 93, 95, 93, 96, 82, 76, 64, 84],
      { skin: '#f6cfb0', hair: 'side', hairColor: '#d9843a', beard: 'stubble', beardColor: '#d9843a', face: 'round', brow: 'light', h: 1.01, w: 1.02 },
      kit('#12a0d7', '#ffffff', 'solid', '#ffffff', '#12a0d7')),
    P('dembele', 'Ousmane Dembélé', 'DEMBÉLÉ', 'FRA', '🇫🇷', 'Paris Saint-Germain', 'modern', 90, 'R', 10,
      [93, 94, 93, 92, 80, 90, 88, 86, 84, 86, 98, 91, 60, 40, 82],
      { skin: '#7a4c2e', hair: 'curly', hairColor: '#15100c', beard: 'goatee', beardColor: '#15100c', face: 'long', h: 1.0, w: 0.9 },
      kit('#0a1f44', '#e30613', 'cstripe', '#0a1f44', '#0a1f44')),
    P('kane', 'Harry Kane', 'KANE', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Bayern Munich', 'modern', 90, 'R', 9,
      [70, 68, 83, 72, 80, 88, 97, 94, 93, 84, 92, 70, 86, 48, 84],
      { skin: '#f1c9a5', hair: 'side', hairColor: '#8a6a44', beard: 'stubble', beardColor: '#8a6a44', face: 'long', h: 1.07, w: 1.08 },
      kit('#dc052d', '#ffffff', 'solid', '#dc052d', '#dc052d')),

    P('pele', 'Pelé', 'PELÉ', 'BRA', '🇧🇷', 'Santos', 'legend', 96, 'R', 10,
      [93, 94, 95, 93, 93, 96, 97, 93, 90, 86, 92, 93, 80, 50, 88],
      { skin: '#5e3a22', hair: 'afro', hairColor: '#0f0b09', vol: 0.55, face: 'round', h: 0.95, w: 1.0 },
      kit('#f4f4f4', '#141414', 'solid', '#f4f4f4', '#f4f4f4')),
    P('maradona', 'Diego Maradona', 'MARADONA', 'ARG', '🇦🇷', 'Napoli', 'legend', 96, 'L', 10,
      [90, 94, 99, 96, 98, 97, 92, 88, 90, 92, 62, 94, 78, 42, 80],
      { skin: '#d9a077', hair: 'afro', hairColor: '#17110d', vol: 0.95, face: 'wide', brow: 'heavy', h: 0.88, w: 1.12 },
      kit('#3fa9e0', '#ffffff', 'solid', '#ffffff', '#3fa9e0')),
    P('ronaldinho', 'Ronaldinho', 'RONALDINHO', 'BRA', '🇧🇷', 'Barcelona', 'legend', 94, 'R', 10,
      [90, 91, 97, 94, 86, 97, 89, 88, 90, 95, 84, 99, 78, 36, 78],
      { skin: '#8f5f3c', hair: 'long', hairColor: '#15100c', band: '#f4f4f4', beard: 'goatee', beardColor: '#15100c', face: 'long', mouth: 'grin', h: 1.02, w: 1.0 },
      kit('#a50044', '#004d98', 'vstripes', '#004d98', '#004d98')),
    P('r9', 'Ronaldo Nazário', 'R9', 'BRA', '🇧🇷', 'Brazil', 'legend', 96, 'R', 9,
      [97, 97, 96, 92, 90, 94, 98, 94, 86, 82, 88, 96, 88, 34, 78],
      { skin: '#a87148', hair: 'tuft', hairColor: '#1a120d', face: 'wide', mouth: 'grin', h: 1.03, w: 1.1 },
      kit('#ffdc02', '#009b3a', 'solid', '#0b3d91', '#f4f4f4')),
    P('henry', 'Thierry Henry', 'HENRY', 'FRA', '🇫🇷', 'Arsenal', 'legend', 93, 'R', 14,
      [96, 94, 91, 90, 82, 91, 95, 90, 88, 92, 80, 86, 80, 42, 86],
      { skin: '#7a4c2e', hair: 'bald', hairColor: '#17100c', beard: 'goatee', beardColor: '#17100c', face: 'long', h: 1.07, w: 1.0 },
      kit('#ef0107', '#ffffff', 'sleeves', '#ffffff', '#ffffff')),
    P('zidane', 'Zinedine Zidane', 'ZIDANE', 'FRA', '🇫🇷', 'Real Madrid', 'legend', 95, 'R', 5,
      [78, 78, 95, 86, 92, 99, 88, 90, 92, 90, 96, 96, 86, 66, 84],
      { skin: '#e2b48c', hair: 'balding', hairColor: '#2a1e16', face: 'long', brow: 'heavy', h: 1.06, w: 1.05 },
      kit('#f7f7f4', '#2b2f6b', 'solid', '#f7f7f4', '#f7f7f4')),
    P('cruyff', 'Johan Cruyff', 'CRUYFF', 'NED', '🇳🇱', 'Ajax', 'legend', 95, 'R', 14,
      [91, 93, 96, 95, 88, 95, 92, 86, 86, 88, 90, 95, 68, 52, 86],
      { skin: '#f1c9a5', hair: 'mop', hairColor: '#6a4a2a', face: 'narrow', h: 1.0, w: 0.88 },
      kit('#f7f7f4', '#d2122e', 'cstripe', '#f7f7f4', '#f7f7f4')),
    P('beckham', 'David Beckham', 'BECKHAM', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester United', 'legend', 89, 'R', 7,
      [76, 76, 84, 78, 80, 90, 84, 92, 97, 99, 70, 74, 74, 62, 94],
      { skin: '#f3cda8', hair: 'quiff', hairColor: '#e2c26a', beard: 'stubble', beardColor: '#b89a56', face: 'square', h: 1.03, w: 1.0 },
      kit('#da291c', '#ffffff', 'solid', '#ffffff', '#17171b')),
  ];

  // ---- extended roster: lower-rated squad players, more stars, more icons ------------------
  // Attributes come from an archetype offset around the overall, with a little per-player variation.
  const PROF = {
    //          pac acc dri agi bal bct fin sho lng cur  wf  skl str  tck sta
    winger:    [  5,  6,  3,  4,  1,  1, -4, -4, -5, -1, -10,  2, -12, -38,  0],
    striker:   [  1,  0, -3, -4, -4,  0,  5,  4, -3, -7,  -8, -10,  4, -40, -2],
    playmaker: [ -8, -6,  2,  0,  1,  4, -5,  0,  4,  5,   0,  0, -8, -20,  2],
    target:    [ -6, -8, -8,-10, -6, -3,  3,  5, -4,-10, -10, -20, 10, -35, -2],
    box2box:   [ -2, -2,  0, -4,  0,  1, -4,  0,  0, -3,  -6, -8,  3,   0,  8],
    defender:  [ -3, -3, -8, -6,  0, -4,-18, -6,-10,-10,  -8,-18,  6,   4,  4],
  };
  ISO.PROF = PROF;
  function gen(id, ovr, prof) {
    let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const rnd = () => { h = (Math.imul(h, 1103515245) + 12345) | 0; return ((h >>> 16) & 0x7fff) / 0x7fff; };
    return PROF[prof].map((o) => Math.max(25, Math.min(99, Math.round(ovr + o + (rnd() - 0.5) * 6))));
  }
  const CLUB = {
    'Tottenham': kit('#f4f4f4', '#132257', 'solid', '#132257', '#f4f4f4'),
    'LAFC': kit('#17171b', '#c39e6d', 'solid', '#17171b', '#17171b'),
    'Arsenal': kit('#ef0107', '#ffffff', 'sleeves', '#ffffff', '#ffffff'),
    'Manchester City': kit('#6cabdd', '#ffffff', 'solid', '#ffffff', '#6cabdd'),
    'Manchester United': kit('#da291c', '#ffffff', 'solid', '#ffffff', '#17171b'),
    'Chelsea': kit('#034694', '#ffffff', 'solid', '#034694', '#ffffff'),
    'Liverpool': kit('#c8102e', '#f6eb61', 'solid', '#c8102e', '#c8102e'),
    'Aston Villa': kit('#670e36', '#95bfe5', 'sleeves', '#ffffff', '#670e36'),
    'West Ham': kit('#7a263a', '#1bb1e7', 'sleeves', '#ffffff', '#7a263a'),
    'Brighton': kit('#0057b8', '#ffffff', 'vstripes', '#0057b8', '#ffffff'),
    'Nottingham Forest': kit('#dd0000', '#ffffff', 'solid', '#ffffff', '#dd0000'),
    'Leicester': kit('#003090', '#fdbe11', 'solid', '#003090', '#003090'),
    'Everton': kit('#003399', '#ffffff', 'solid', '#ffffff', '#003399'),
    'Southampton': kit('#d71920', '#ffffff', 'vstripes', '#17171b', '#d71920'),
    'Leeds': kit('#ffffff', '#1d428a', 'solid', '#ffffff', '#ffffff'),
    'Torino': kit('#8b1a1a', '#ffffff', 'solid', '#ffffff', '#8b1a1a'),
    'Ajax': kit('#ffffff', '#d2122e', 'cstripe', '#ffffff', '#ffffff'),
    'FC Seoul': kit('#c8102e', '#17171b', 'vstripes', '#17171b', '#17171b'),
    'Barcelona': kit('#a50044', '#004d98', 'vstripes', '#004d98', '#004d98'),
    'Inter': kit('#0a2fa0', '#17171b', 'vstripes', '#17171b', '#17171b'),
    'AC Milan': kit('#fb090b', '#17171b', 'vstripes', '#ffffff', '#17171b'),
    'Paris Saint-Germain': kit('#0a1f44', '#e30613', 'cstripe', '#0a1f44', '#0a1f44'),
    'Juventus': kit('#ffffff', '#17171b', 'vstripes', '#17171b', '#ffffff'),
    'Roma': kit('#8e1f2f', '#f0bc42', 'solid', '#ffffff', '#17171b'),
    'Benfica': kit('#e83030', '#ffffff', 'solid', '#ffffff', '#e83030'),
    'Inter Miami': kit('#f4a9c2', '#17171b', 'solid', '#f4a9c2', '#f4a9c2'),
    'Real Madrid': kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4'),
    'Bayern Munich': kit('#dc052d', '#ffffff', 'solid', '#dc052d', '#dc052d'),
    'Napoli': kit('#12a0d7', '#ffffff', 'solid', '#ffffff', '#12a0d7'),
    'Santos': kit('#ffffff', '#17171b', 'solid', '#ffffff', '#ffffff'),
    'Flamengo': kit('#c8102e', '#17171b', 'hoops', '#ffffff', '#17171b'),
    'Botafogo': kit('#17171b', '#ffffff', 'vstripes', '#17171b', '#17171b'),
    'Corinthians': kit('#ffffff', '#17171b', 'solid', '#17171b', '#ffffff'),
    'Palmeiras': kit('#006437', '#ffffff', 'solid', '#ffffff', '#006437'),
    'Marseille': kit('#ffffff', '#2faee0', 'solid', '#ffffff', '#ffffff'),
    'Borussia Mönchengladbach': kit('#ffffff', '#00843d', 'solid', '#ffffff', '#ffffff'),
    'Kaiserslautern': kit('#c8102e', '#ffffff', 'solid', '#c8102e', '#c8102e'),
    'Newcastle': kit('#17171b', '#ffffff', 'vstripes', '#17171b', '#17171b'),
    'Blackpool': kit('#f68712', '#ffffff', 'solid', '#ffffff', '#f68712'),
    'Galatasaray': kit('#a90432', '#fdb912', 'halves', '#ffffff', '#a90432'),
    'Valencia': kit('#ffffff', '#17171b', 'solid', '#17171b', '#ffffff'),
    'Alianza Lima': kit('#ffffff', '#0b1f4b', 'vstripes', '#0b1f4b', '#0b1f4b'),
    'Honvéd': kit('#c8102e', '#17171b', 'vstripes', '#17171b', '#c8102e'),
    'Reims': kit('#d2122e', '#ffffff', 'sleeves', '#ffffff', '#d2122e'),
    'Dukla Prague': kit('#f5c518', '#8b1a1a', 'solid', '#8b1a1a', '#f5c518'),
    'Ferencváros': kit('#00843d', '#ffffff', 'vstripes', '#ffffff', '#00843d'),
    'Nacional': kit('#ffffff', '#0b3b8c', 'solid', '#0b3b8c', '#ffffff'),
    'River Plate': kit('#ffffff', '#d2122e', 'sash', '#17171b', '#ffffff'),
    'Peñarol': kit('#f5c518', '#17171b', 'vstripes', '#17171b', '#17171b'),
    'Austria Vienna': kit('#5b2a86', '#ffffff', 'solid', '#ffffff', '#5b2a86'),
  };
  const look = (skin, hair, hairColor, x) => Object.assign({ skin, hair, hairColor, h: 1, w: 1 }, x || {});
  const SK = { pale: '#f6d7bd', fair: '#f1c9a5', light: '#e8bd95', tan: '#c98f62', brown: '#9a6a44', dark: '#6b4226', deep: '#4e2f1c' };
  const X = (id, name, short, nat, flag, club, era, ovr, foot, num, prof, lk) =>
    P(id, name, short, nat, flag, club, era, ovr, foot, num, gen(id, ovr, prof), lk, CLUB[club] || kit('#f4f4f4', '#17171b', 'solid', '#17171b', '#f4f4f4'), prof);
  ISO.PLAYERS.push(
    // common
    X('cheadams', 'Che Adams', 'C. ADAMS', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Torino', 'modern', 70, 'R', 18, 'striker', look(SK.brown, 'fade', '#17100c', { beard: 'stubble', beardColor: '#17100c' })),
    X('armstrong', 'Adam Armstrong', 'ARMSTRONG', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Southampton', 'modern', 68, 'R', 9, 'striker', look(SK.fair, 'short', '#5a3a22', { face: 'round' })),
    X('ings', 'Danny Ings', 'INGS', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 66, 'R', 18, 'striker', look(SK.fair, 'short', '#3a2a1c', { beard: 'full', beardColor: '#3a2a1c', face: 'square', h: 0.95 })),
    X('antonio', 'Michail Antonio', 'ANTONIO', 'JAM', '🇯🇲', 'West Ham', 'modern', 69, 'R', 9, 'target', look(SK.dark, 'bald', '#120d0a', { beard: 'full', beardColor: '#120d0a', face: 'wide', h: 1.06, w: 1.1 })),
    X('weghorst', 'Wout Weghorst', 'WEGHORST', 'NED', '🇳🇱', 'Ajax', 'modern', 68, 'R', 25, 'target', look(SK.pale, 'short', '#c9a46a', { beard: 'stubble', beardColor: '#c9a46a', face: 'long', brow: 'light', h: 1.14, w: 1.05 })),
    X('lingard', 'Jesse Lingard', 'LINGARD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'FC Seoul', 'modern', 69, 'R', 10, 'playmaker', look(SK.tan, 'fade', '#17100c', { beard: 'goatee', beardColor: '#17100c', face: 'narrow', h: 0.95 })),
    X('carroll', 'Andy Carroll', 'CARROLL', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Leeds', 'modern', 62, 'L', 9, 'target', look(SK.fair, 'bun', '#3a2a1c', { beard: 'full', beardColor: '#3a2a1c', face: 'long', h: 1.12, w: 1.1 })),
    X('barkley', 'Ross Barkley', 'BARKLEY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Aston Villa', 'modern', 70, 'R', 6, 'box2box', look(SK.light, 'buzz', '#2a1e16', { face: 'wide', w: 1.06 })),
    X('ayew', 'Jordan Ayew', 'J. AYEW', 'GHA', '🇬🇭', 'Leicester', 'modern', 68, 'R', 9, 'winger', look(SK.dark, 'buzz', '#120d0a', { beard: 'stubble', beardColor: '#120d0a' })),
    X('djames', 'Daniel James', 'D. JAMES', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Leeds', 'modern', 69, 'L', 7, 'winger', look(SK.fair, 'short', '#3a2a1c', { face: 'narrow', h: 0.92, w: 0.9 })),
    // rare
    X('wood', 'Chris Wood', 'WOOD', 'NZL', '🇳🇿', 'Nottingham Forest', 'modern', 75, 'R', 11, 'target', look(SK.fair, 'short', '#5a3a22', { beard: 'stubble', beardColor: '#5a3a22', face: 'square', h: 1.1, w: 1.08 })),
    X('vardy', 'Jamie Vardy', 'VARDY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Leicester', 'modern', 74, 'R', 9, 'striker', look(SK.fair, 'short', '#4a3626', { beard: 'stubble', beardColor: '#4a3626', face: 'narrow', w: 0.92 })),
    X('solanke', 'Dominic Solanke', 'SOLANKE', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Tottenham', 'modern', 77, 'R', 19, 'striker', look(SK.brown, 'curly', '#17100c', { beard: 'stubble', beardColor: '#17100c', h: 1.05 })),
    X('bjohnson', 'Brennan Johnson', 'B. JOHNSON', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Tottenham', 'modern', 76, 'R', 22, 'winger', look(SK.tan, 'fade', '#17100c', { face: 'narrow', w: 0.92 })),
    X('bowen', 'Jarrod Bowen', 'BOWEN', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 79, 'L', 20, 'winger', look(SK.fair, 'side', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c' })),
    X('cwilson', 'Callum Wilson', 'C. WILSON', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 74, 'R', 9, 'striker', look(SK.brown, 'buzz', '#17100c', { beard: 'full', beardColor: '#17100c', face: 'square' })),
    X('maddison', 'James Maddison', 'MADDISON', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Tottenham', 'modern', 79, 'R', 10, 'playmaker', look(SK.fair, 'quiff', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c' })),
    X('welbeck', 'Danny Welbeck', 'WELBECK', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Brighton', 'modern', 75, 'R', 18, 'striker', look(SK.dark, 'buzz', '#120d0a', { beard: 'goatee', beardColor: '#120d0a', face: 'long', h: 1.06 })),
    X('richarlison', 'Richarlison', 'RICHARLISON', 'BRA', '🇧🇷', 'Tottenham', 'modern', 77, 'R', 9, 'striker', look(SK.brown, 'mohawk', '#d8b45a', { hair2: '#2a1a12', face: 'long', h: 0.98 })),
    X('grealish', 'Jack Grealish', 'GREALISH', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Everton', 'modern', 79, 'R', 18, 'winger', look(SK.fair, 'slick', '#3a2a1c', { band: '#17171b', face: 'square' })),
    X('rashford', 'Marcus Rashford', 'RASHFORD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Barcelona', 'modern', 79, 'R', 14, 'winger', look(SK.dark, 'fade', '#120d0a', { beard: 'goatee', beardColor: '#120d0a' })),
    // epic
    X('watkins', 'Ollie Watkins', 'WATKINS', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Aston Villa', 'modern', 82, 'R', 11, 'striker', look(SK.brown, 'fade', '#17100c', { beard: 'stubble', beardColor: '#17100c' })),
    X('son', 'Heung-min Son', 'SON', 'KOR', '🇰🇷', 'LAFC', 'modern', 86, 'R', 7, 'winger', look(SK.light, 'side', '#17100c', { face: 'round', h: 1.0, w: 0.98 })),
    X('saka', 'Bukayo Saka', 'SAKA', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Arsenal', 'modern', 87, 'L', 7, 'winger', look(SK.dark, 'fade', '#120d0a', { face: 'round', w: 0.95 })),
    X('foden', 'Phil Foden', 'FODEN', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester City', 'modern', 85, 'L', 47, 'playmaker', look(SK.fair, 'buzz', '#8a6a44', { face: 'narrow', h: 0.93, w: 0.9 })),
    X('palmer', 'Cole Palmer', 'PALMER', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Chelsea', 'modern', 86, 'L', 10, 'playmaker', look(SK.fair, 'short', '#a86a3a', { face: 'long', brow: 'light', w: 0.9 })),
    X('odegaard', 'Martin Ødegaard', 'ØDEGAARD', 'NOR', '🇳🇴', 'Arsenal', 'modern', 86, 'L', 8, 'playmaker', look(SK.pale, 'side', '#6a4a2a', { face: 'narrow', w: 0.92 })),
    X('isak', 'Alexander Isak', 'ISAK', 'SWE', '🇸🇪', 'Liverpool', 'modern', 86, 'R', 9, 'striker', look(SK.brown, 'curly', '#17100c', { beard: 'moustache', beardColor: '#17100c', face: 'long', h: 1.1, w: 0.9 })),
    X('kvara', 'Khvicha Kvaratskhelia', 'KVARA', 'GEO', '🇬🇪', 'Paris Saint-Germain', 'modern', 86, 'R', 7, 'winger', look(SK.fair, 'mop', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c', face: 'long', brow: 'heavy', h: 1.04, w: 0.92 })),
    X('lautaro', 'Lautaro Martínez', 'LAUTARO', 'ARG', '🇦🇷', 'Inter', 'modern', 86, 'R', 10, 'striker', look(SK.tan, 'short', '#17100c', { beard: 'full', beardColor: '#17100c', face: 'square', brow: 'heavy' })),
    X('leao', 'Rafael Leão', 'LEÃO', 'POR', '🇵🇹', 'AC Milan', 'modern', 84, 'R', 10, 'winger', look(SK.dark, 'curly', '#120d0a', { beard: 'goatee', beardColor: '#120d0a', face: 'narrow', h: 1.06, w: 0.92 })),
    X('pedri', 'Pedri', 'PEDRI', 'ESP', '🇪🇸', 'Barcelona', 'modern', 86, 'R', 8, 'playmaker', look(SK.light, 'side', '#17100c', { face: 'narrow', w: 0.88 })),
    // more stars
    X('lewandowski', 'Robert Lewandowski', 'LEWANDOWSKI', 'POL', '🇵🇱', 'Barcelona', 'modern', 90, 'R', 9, 'striker', look(SK.light, 'quiff', '#3a2a1c', { face: 'long', brow: 'heavy', h: 1.05 })),
    X('kroos', 'Toni Kroos', 'KROOS', 'GER', '🇩🇪', 'Real Madrid', 'modern', 89, 'R', 8, 'playmaker', look(SK.fair, 'side', '#c9a25a', { beard: 'stubble', beardColor: '#b8935a', face: 'square' })),
    X('tmuller', 'Thomas Müller', 'T. MÜLLER', 'GER', '🇩🇪', 'Bayern Munich', 'modern', 87, 'R', 25, 'striker', look(SK.fair, 'short', '#5a3a22', { face: 'long', h: 1.05, w: 0.92 })),
    X('modric', 'Luka Modrić', 'MODRIĆ', 'CRO', '🇭🇷', 'Real Madrid', 'modern', 89, 'R', 10, 'playmaker', look(SK.fair, 'long', '#8a6a44', { face: 'narrow', h: 0.94, w: 0.88 })),
    X('suarez', 'Luis Suárez', 'SUÁREZ', 'URU', '🇺🇾', 'Inter Miami', 'modern', 88, 'R', 9, 'striker', look(SK.light, 'short', '#17100c', { beard: 'stubble', beardColor: '#17100c', face: 'square', brow: 'heavy' })),
    X('ramos', 'Sergio Ramos', 'RAMOS', 'ESP', '🇪🇸', 'Real Madrid', 'modern', 88, 'R', 4, 'defender', look(SK.light, 'slick', '#3a2a1c', { beard: 'full', beardColor: '#3a2a1c', face: 'square', h: 1.04, w: 1.06 })),
    X('busquets', 'Sergio Busquets', 'BUSQUETS', 'ESP', '🇪🇸', 'Barcelona', 'modern', 86, 'R', 5, 'box2box', look(SK.light, 'short', '#17100c', { beard: 'stubble', beardColor: '#17100c', face: 'long', h: 1.08, w: 0.9 })),
    // icons
    X('kaka', 'Kaká', 'KAKÁ', 'BRA', '🇧🇷', 'AC Milan', 'legend', 92, 'R', 22, 'playmaker', look(SK.light, 'side', '#3a2a1c', { face: 'oval', h: 1.05 })),
    X('pirlo', 'Andrea Pirlo', 'PIRLO', 'ITA', '🇮🇹', 'Juventus', 'legend', 90, 'R', 21, 'playmaker', look(SK.light, 'long', '#2a1e16', { beard: 'full', beardColor: '#2a1e16', face: 'long' })),
    X('totti', 'Francesco Totti', 'TOTTI', 'ITA', '🇮🇹', 'Roma', 'legend', 90, 'R', 10, 'striker', look(SK.light, 'slick', '#a8875a', { beard: 'stubble', beardColor: '#8a6a44', face: 'square' })),
    X('rooney', 'Wayne Rooney', 'ROONEY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester United', 'legend', 90, 'R', 10, 'striker', look(SK.fair, 'receding', '#8a6a44', { face: 'wide', h: 0.95, w: 1.1 })),
    X('zlatan', 'Zlatan Ibrahimović', 'ZLATAN', 'SWE', '🇸🇪', 'AC Milan', 'legend', 92, 'R', 11, 'target', look(SK.light, 'bun', '#17100c', { beard: 'goatee', beardColor: '#17100c', face: 'long', nose: 'big', brow: 'heavy', h: 1.14 })),
    X('drogba', 'Didier Drogba', 'DROGBA', 'CIV', '🇨🇮', 'Chelsea', 'legend', 90, 'R', 11, 'target', look(SK.deep, 'long', '#120d0a', { band: '#17171b', beard: 'goatee', beardColor: '#120d0a', face: 'square', h: 1.08, w: 1.12 })),
    X('gerrard', 'Steven Gerrard', 'GERRARD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Liverpool', 'legend', 90, 'R', 8, 'box2box', look(SK.fair, 'short', '#6a4a2a', { face: 'long', h: 1.04 })),
    X('iniesta', 'Andrés Iniesta', 'INIESTA', 'ESP', '🇪🇸', 'Barcelona', 'legend', 91, 'R', 8, 'playmaker', look(SK.pale, 'receding', '#5a3a22', { face: 'narrow', w: 0.9 })),
    X('cantona', 'Eric Cantona', 'CANTONA', 'FRA', '🇫🇷', 'Manchester United', 'legend', 89, 'R', 7, 'striker', look(SK.light, 'short', '#17100c', { beard: 'stubble', beardColor: '#17100c', face: 'square', brow: 'heavy', collar: 'up', h: 1.07 })),
    X('vanbasten', 'Marco van Basten', 'VAN BASTEN', 'NED', '🇳🇱', 'AC Milan', 'legend', 93, 'R', 9, 'striker', look(SK.fair, 'mop', '#8a6a44', { face: 'long', h: 1.07 })),
    X('eusebio', 'Eusébio', 'EUSÉBIO', 'POR', '🇵🇹', 'Benfica', 'legend', 92, 'R', 10, 'striker', look(SK.deep, 'afro', '#120d0a', { vol: 0.5, face: 'oval' })),
    X('rivaldo', 'Rivaldo', 'RIVALDO', 'BRA', '🇧🇷', 'Barcelona', 'legend', 91, 'L', 10, 'winger', look(SK.tan, 'slick', '#17100c', { face: 'narrow', h: 1.05, w: 0.92 })),
    X('parkjisung', 'Park Ji-sung', 'PARK', 'KOR', '🇰🇷', 'Manchester United', 'legend', 86, 'R', 13, 'box2box', look(SK.light, 'mop', '#17100c', { face: 'round', h: 0.97 })),
    // more icons: FourFourTwo's 100 greatest (outfield players)
    X('gerdmuller', 'Gerd Müller', 'G. MÜLLER', 'GER', '🇩🇪', 'Bayern Munich', 'legend', 95, 'R', 13, 'striker', look(SK.fair, 'mop', '#17100c', { face: 'round', h: 0.94, w: 1.08 })),
    X('beckenbauer', 'Franz Beckenbauer', 'BECKENBAUER', 'GER', '🇩🇪', 'Bayern Munich', 'legend', 95, 'R', 5, 'box2box', look(SK.fair, 'curly', '#3a2a1c', { face: 'oval', h: 1.03 })),
    X('puskas', 'Ferenc Puskás', 'PUSKÁS', 'HUN', '🇭🇺', 'Real Madrid', 'legend', 95, 'L', 10, 'striker', look(SK.fair, 'slick', '#17100c', { face: 'round', h: 0.93, w: 1.1 })),
    X('distefano', 'Alfredo Di Stéfano', 'DI STÉFANO', 'ARG', '🇦🇷', 'Real Madrid', 'legend', 95, 'R', 9, 'striker', look(SK.fair, 'balding', '#c9a25a', { face: 'oval' })),
    X('garrincha', 'Garrincha', 'GARRINCHA', 'BRA', '🇧🇷', 'Botafogo', 'legend', 94, 'R', 7, 'winger', look(SK.brown, 'short', '#17100c', { face: 'oval', h: 0.94 })),
    X('platini', 'Michel Platini', 'PLATINI', 'FRA', '🇫🇷', 'Juventus', 'legend', 94, 'R', 10, 'playmaker', look(SK.light, 'curly', '#3a2a1c', { face: 'oval' })),
    X('maldini', 'Paolo Maldini', 'MALDINI', 'ITA', '🇮🇹', 'AC Milan', 'legend', 93, 'R', 3, 'defender', look(SK.light, 'long', '#3a2a1c', { face: 'long', h: 1.06 })),
    X('best', 'George Best', 'BEST', 'NIR', '🇬🇧', 'Manchester United', 'legend', 94, 'R', 7, 'winger', look(SK.fair, 'mop', '#17100c', { beard: 'full', beardColor: '#17100c', face: 'oval', h: 0.96 })),
    X('zico', 'Zico', 'ZICO', 'BRA', '🇧🇷', 'Flamengo', 'legend', 93, 'R', 10, 'playmaker', look(SK.light, 'curly', '#8a6a44', { face: 'oval', h: 0.95 })),
    X('xavi', 'Xavi Hernández', 'XAVI', 'ESP', '🇪🇸', 'Barcelona', 'legend', 92, 'R', 6, 'playmaker', look(SK.light, 'short', '#17100c', { beard: 'stubble', beardColor: '#17100c', face: 'square', h: 0.93 })),
    X('baresi', 'Franco Baresi', 'BARESI', 'ITA', '🇮🇹', 'AC Milan', 'legend', 91, 'R', 6, 'defender', look(SK.light, 'receding', '#3a2a1c', { face: 'long', h: 0.97 })),
    X('bcharlton', 'Bobby Charlton', 'CHARLTON', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester United', 'legend', 92, 'R', 9, 'playmaker', look(SK.pale, 'balding', '#c9a25a', { face: 'oval' })),
    X('matthaus', 'Lothar Matthäus', 'MATTHÄUS', 'GER', '🇩🇪', 'Inter', 'legend', 93, 'R', 10, 'box2box', look(SK.fair, 'curly', '#5a3a22', { face: 'square' })),
    X('gullit', 'Ruud Gullit', 'GULLIT', 'NED', '🇳🇱', 'AC Milan', 'legend', 93, 'R', 10, 'box2box', look(SK.brown, 'braids', '#17100c', { beard: 'moustache', beardColor: '#17100c', face: 'long', h: 1.08, w: 1.05 })),
    X('socrates', 'Sócrates', 'SÓCRATES', 'BRA', '🇧🇷', 'Corinthians', 'legend', 91, 'R', 8, 'playmaker', look(SK.tan, 'curly', '#17100c', { beard: 'full', beardColor: '#17100c', face: 'long', h: 1.1, w: 0.92 })),
    X('kopa', 'Raymond Kopa', 'KOPA', 'FRA', '🇫🇷', 'Reims', 'legend', 90, 'R', 10, 'winger', look(SK.fair, 'side', '#3a2a1c', { face: 'round', h: 0.93 })),
    X('moore', 'Bobby Moore', 'MOORE', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'legend', 91, 'R', 6, 'defender', look(SK.fair, 'curly', '#c9a25a', { face: 'square' })),
    X('vmazzola', 'Valentino Mazzola', 'V. MAZZOLA', 'ITA', '🇮🇹', 'Torino', 'legend', 91, 'R', 10, 'playmaker', look(SK.light, 'slick', '#c9a25a', { face: 'square' })),
    X('sindelar', 'Matthias Sindelar', 'SINDELAR', 'AUT', '🇦🇹', 'Austria Vienna', 'legend', 90, 'R', 9, 'striker', look(SK.pale, 'slick', '#c9a25a', { face: 'narrow', w: 0.86 })),
    X('baggio', 'Roberto Baggio', 'BAGGIO', 'ITA', '🇮🇹', 'Juventus', 'legend', 93, 'R', 10, 'playmaker', look(SK.light, 'bun', '#3a2a1c', { beard: 'goatee', beardColor: '#3a2a1c', face: 'oval', h: 0.96 })),
    X('jcharles', 'John Charles', 'J. CHARLES', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Juventus', 'legend', 90, 'R', 9, 'target', look(SK.fair, 'side', '#17100c', { face: 'square', h: 1.1, w: 1.1 })),
    X('laudrup', 'Michael Laudrup', 'LAUDRUP', 'DEN', '🇩🇰', 'Barcelona', 'legend', 91, 'R', 10, 'playmaker', look(SK.fair, 'side', '#3a2a1c', { face: 'oval' })),
    X('dalglish', 'Kenny Dalglish', 'DALGLISH', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Liverpool', 'legend', 91, 'R', 7, 'striker', look(SK.fair, 'curly', '#8a6a44', { face: 'round' })),
    X('romario', 'Romário', 'ROMÁRIO', 'BRA', '🇧🇷', 'Barcelona', 'legend', 94, 'R', 11, 'striker', look(SK.tan, 'short', '#17100c', { face: 'round', h: 0.92 })),
    X('koeman', 'Ronald Koeman', 'KOEMAN', 'NED', '🇳🇱', 'Barcelona', 'legend', 90, 'R', 4, 'box2box', look(SK.pale, 'side', '#c9a25a', { face: 'round', w: 1.06 })),
    X('matthews', 'Stanley Matthews', 'MATTHEWS', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Blackpool', 'legend', 91, 'R', 7, 'winger', look(SK.pale, 'receding', '#3a2a1c', { face: 'narrow', w: 0.88 })),
    X('netzer', 'Günter Netzer', 'NETZER', 'GER', '🇩🇪', 'Borussia Mönchengladbach', 'legend', 90, 'R', 10, 'playmaker', look(SK.fair, 'long', '#c9a25a', { face: 'long', h: 1.04 })),
    X('didi', 'Didi', 'DIDI', 'BRA', '🇧🇷', 'Botafogo', 'legend', 91, 'R', 8, 'playmaker', look(SK.dark, 'short', '#17100c', { face: 'oval' })),
    X('scirea', 'Gaetano Scirea', 'SCIREA', 'ITA', '🇮🇹', 'Juventus', 'legend', 90, 'R', 6, 'defender', look(SK.light, 'side', '#3a2a1c', { face: 'long' })),
    X('keegan', 'Kevin Keegan', 'KEEGAN', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Liverpool', 'legend', 90, 'R', 7, 'striker', look(SK.fair, 'curly', '#3a2a1c', { vol: 0.6, face: 'square', h: 0.93 })),
    X('jairzinho', 'Jairzinho', 'JAIRZINHO', 'BRA', '🇧🇷', 'Botafogo', 'legend', 91, 'R', 7, 'winger', look(SK.dark, 'afro', '#17100c', { vol: 0.5, face: 'square', w: 1.05 })),
    X('carlosalberto', 'Carlos Alberto', 'C. ALBERTO', 'BRA', '🇧🇷', 'Santos', 'legend', 90, 'R', 4, 'defender', look(SK.brown, 'short', '#17100c', { face: 'square', h: 1.03 })),
    X('schiaffino', 'Juan Alberto Schiaffino', 'SCHIAFFINO', 'URU', '🇺🇾', 'Peñarol', 'legend', 90, 'L', 10, 'playmaker', look(SK.fair, 'slick', '#17100c', { face: 'narrow', w: 0.88 })),
    X('fwalter', 'Fritz Walter', 'F. WALTER', 'GER', '🇩🇪', 'Kaiserslautern', 'legend', 90, 'R', 16, 'playmaker', look(SK.fair, 'side', '#3a2a1c', { face: 'oval' })),
    X('passarella', 'Daniel Passarella', 'PASSARELLA', 'ARG', '🇦🇷', 'River Plate', 'legend', 90, 'L', 6, 'defender', look(SK.light, 'mop', '#3a2a1c', { face: 'square', h: 0.95 })),
    X('rivera', 'Gianni Rivera', 'RIVERA', 'ITA', '🇮🇹', 'AC Milan', 'legend', 91, 'R', 10, 'playmaker', look(SK.light, 'side', '#3a2a1c', { face: 'narrow', w: 0.9 })),
    X('law', 'Denis Law', 'LAW', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Manchester United', 'legend', 91, 'R', 10, 'striker', look(SK.pale, 'quiff', '#c9a25a', { face: 'narrow', w: 0.9 })),
    X('greaves', 'Jimmy Greaves', 'GREAVES', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Tottenham', 'legend', 91, 'R', 8, 'striker', look(SK.fair, 'short', '#17100c', { face: 'oval', h: 0.95 })),
    X('rummenigge', 'Karl-Heinz Rummenigge', 'RUMMENIGGE', 'GER', '🇩🇪', 'Bayern Munich', 'legend', 92, 'R', 11, 'striker', look(SK.fair, 'mop', '#c9a25a', { face: 'square', w: 1.05 })),
    X('suarezmiramontes', 'Luis Suárez Miramontes', 'L. SUÁREZ', 'ESP', '🇪🇸', 'Inter', 'legend', 90, 'R', 10, 'playmaker', look(SK.light, 'slick', '#17100c', { face: 'oval' })),
    X('nordahl', 'Gunnar Nordahl', 'NORDAHL', 'SWE', '🇸🇪', 'AC Milan', 'legend', 90, 'R', 9, 'target', look(SK.pale, 'slick', '#c9a25a', { face: 'square', h: 1.06, w: 1.12 })),
    X('neeskens', 'Johan Neeskens', 'NEESKENS', 'NED', '🇳🇱', 'Ajax', 'legend', 90, 'R', 6, 'box2box', look(SK.fair, 'long', '#3a2a1c', { beard: 'chinstrap', beardColor: '#3a2a1c', face: 'long' })),
    X('hugosanchez', 'Hugo Sánchez', 'H. SÁNCHEZ', 'MEX', '🇲🇽', 'Real Madrid', 'legend', 91, 'L', 9, 'striker', look(SK.tan, 'curly', '#17100c', { face: 'oval', h: 0.96 })),
    X('meazza', 'Giuseppe Meazza', 'MEAZZA', 'ITA', '🇮🇹', 'Inter', 'legend', 91, 'R', 9, 'striker', look(SK.light, 'slick', '#17100c', { face: 'oval', h: 0.94 })),
    X('moreno', 'José Manuel Moreno', 'MORENO', 'ARG', '🇦🇷', 'River Plate', 'legend', 90, 'R', 10, 'playmaker', look(SK.light, 'slick', '#17100c', { beard: 'moustache', beardColor: '#17100c', face: 'square' })),
    X('gento', 'Paco Gento', 'GENTO', 'ESP', '🇪🇸', 'Real Madrid', 'legend', 90, 'L', 11, 'winger', look(SK.light, 'side', '#17100c', { face: 'round', h: 0.94 })),
    X('rijkaard', 'Frank Rijkaard', 'RIJKAARD', 'NED', '🇳🇱', 'AC Milan', 'legend', 91, 'R', 8, 'box2box', look(SK.brown, 'curly', '#17100c', { vol: 0.5, beard: 'moustache', beardColor: '#17100c', face: 'long', h: 1.08 })),
    X('andrade', 'José Andrade', 'ANDRADE', 'URU', '🇺🇾', 'Nacional', 'legend', 89, 'R', 5, 'defender', look(SK.deep, 'short', '#17100c', { face: 'oval', h: 1.03 })),
    X('rossi', 'Paolo Rossi', 'P. ROSSI', 'ITA', '🇮🇹', 'Juventus', 'legend', 90, 'R', 20, 'striker', look(SK.light, 'mop', '#3a2a1c', { face: 'narrow', h: 0.95, w: 0.86 })),
    X('robertocarlos', 'Roberto Carlos', 'R. CARLOS', 'BRA', '🇧🇷', 'Real Madrid', 'legend', 91, 'L', 3, 'box2box', look(SK.brown, 'shaved', '#17100c', { face: 'round', h: 0.92, w: 1.1 })),
    X('albert', 'Flórián Albert', 'ALBERT', 'HUN', '🇭🇺', 'Ferencváros', 'legend', 90, 'R', 9, 'striker', look(SK.fair, 'side', '#3a2a1c', { face: 'oval' })),
    X('rivellino', 'Rivellino', 'RIVELLINO', 'BRA', '🇧🇷', 'Corinthians', 'legend', 91, 'L', 11, 'playmaker', look(SK.light, 'mop', '#17100c', { beard: 'moustache', beardColor: '#17100c', face: 'square' })),
    X('bergkamp', 'Dennis Bergkamp', 'BERGKAMP', 'NED', '🇳🇱', 'Arsenal', 'legend', 92, 'R', 10, 'playmaker', look(SK.pale, 'side', '#c9a25a', { face: 'long', h: 1.03 })),
    X('masopust', 'Josef Masopust', 'MASOPUST', 'CZE', '🇨🇿', 'Dukla Prague', 'legend', 90, 'R', 6, 'box2box', look(SK.fair, 'side', '#3a2a1c', { face: 'oval' })),
    X('shearer', 'Alan Shearer', 'SHEARER', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Newcastle', 'legend', 91, 'R', 9, 'target', look(SK.fair, 'receding', '#3a2a1c', { face: 'square', w: 1.06 })),
    X('stoichkov', 'Hristo Stoichkov', 'STOICHKOV', 'BUL', '🇧🇬', 'Barcelona', 'legend', 92, 'L', 8, 'striker', look(SK.light, 'side', '#17100c', { face: 'square', brow: 'heavy' })),
    X('smazzola', 'Sandro Mazzola', 'S. MAZZOLA', 'ITA', '🇮🇹', 'Inter', 'legend', 90, 'R', 8, 'playmaker', look(SK.light, 'side', '#17100c', { beard: 'moustache', beardColor: '#17100c', face: 'narrow', w: 0.9 })),
    X('weah', 'George Weah', 'WEAH', 'LBR', '🇱🇷', 'AC Milan', 'legend', 92, 'R', 9, 'striker', look(SK.deep, 'buzz', '#17100c', { face: 'square', h: 1.06, w: 1.08 })),
    X('simonsen', 'Allan Simonsen', 'SIMONSEN', 'DEN', '🇩🇰', 'Borussia Mönchengladbach', 'legend', 89, 'R', 7, 'winger', look(SK.pale, 'mop', '#c9a25a', { face: 'narrow', h: 0.9, w: 0.86 })),
    X('cafu', 'Cafu', 'CAFU', 'BRA', '🇧🇷', 'Roma', 'legend', 91, 'R', 2, 'box2box', look(SK.brown, 'short', '#17100c', { face: 'oval' })),
    X('facchetti', 'Giacinto Facchetti', 'FACCHETTI', 'ITA', '🇮🇹', 'Inter', 'legend', 90, 'L', 3, 'defender', look(SK.light, 'side', '#3a2a1c', { face: 'long', h: 1.08 })),
    X('fontaine', 'Just Fontaine', 'FONTAINE', 'FRA', '🇫🇷', 'Reims', 'legend', 91, 'R', 17, 'striker', look(SK.light, 'side', '#17100c', { face: 'round' })),
    X('kocsis', 'Sándor Kocsis', 'KOCSIS', 'HUN', '🇭🇺', 'Honvéd', 'legend', 91, 'R', 8, 'target', look(SK.fair, 'slick', '#17100c', { face: 'narrow', w: 0.9 })),
    X('lahm', 'Philipp Lahm', 'LAHM', 'GER', '🇩🇪', 'Bayern Munich', 'legend', 90, 'R', 21, 'box2box', look(SK.fair, 'short', '#5a3a22', { face: 'round', h: 0.91, w: 0.9 })),
    X('dsantos', 'Djalma Santos', 'D. SANTOS', 'BRA', '🇧🇷', 'Palmeiras', 'legend', 89, 'R', 2, 'defender', look(SK.deep, 'short', '#17100c', { face: 'square', w: 1.06 })),
    X('zanetti', 'Javier Zanetti', 'ZANETTI', 'ARG', '🇦🇷', 'Inter', 'legend', 89, 'R', 4, 'box2box', look(SK.light, 'side', '#17100c', { face: 'square' })),
    X('cubillas', 'Teófilo Cubillas', 'CUBILLAS', 'PER', '🇵🇪', 'Alianza Lima', 'legend', 90, 'R', 10, 'playmaker', look(SK.brown, 'afro', '#17100c', { vol: 0.45, face: 'round' })),
    X('kempes', 'Mario Kempes', 'KEMPES', 'ARG', '🇦🇷', 'Valencia', 'legend', 91, 'L', 10, 'striker', look(SK.light, 'long', '#17100c', { face: 'long', h: 1.04 })),
    X('hagi', 'Gheorghe Hagi', 'HAGI', 'ROU', '🇷🇴', 'Galatasaray', 'legend', 91, 'L', 10, 'playmaker', look(SK.light, 'short', '#17100c', { face: 'square', h: 0.94 })),
  );

  ISO.PLAYERS.find((p) => p.id === 'son').attr.wf = 95;      // two-footed

  // ---- player individuality (Phase 2: traits, playstyles, movement profiles, weak foot) ---------------------------------
  // Everything is derived from the catalogue def through ISO.styleOf(def) and cached per def object. Nothing is stored on
  // players or in the game state, so nothing is serialised: client and server (same build) resolve identical tables.
  // ISO.MODS lists every knob the sim reads: key: [neutral value, 'mul' | 'add', lo, hi]. 'mul' mods multiply the neutral value
  // (role, body and trait factors stack), 'add' mods add to it; the result is clamped to [lo, hi]. The neutral table is the
  // default column: the sim is bit-identical to the pre-Phase-2 build when every knob is at its default (ISO.STYLE_OFF = true).
  const qa = (v) => Math.max(0, Math.min(1, (v - 40) / 59));
  ISO.MODS = {
    // movement (role + body)
    top: [1, 'mul', 0.97, 1.03], accLo: [1, 'mul', 0.88, 1.12], accHi: [1, 'mul', 0.88, 1.12], cut: [1, 'mul', 0.88, 1.15],
    turn: [1, 'mul', 0.9, 1.15], turnBall: [1, 'mul', 0.9, 1.15], stop: [1, 'mul', 0.8, 1.2], lat: [1, 'mul', 1, 1.04],
    fwd: [1, 'mul', 1, 1.12], stride: [1, 'mul', 0.9, 1.12], dribLead: [1, 'mul', 0.8, 1.1], dribPull: [1, 'mul', 0.9, 1.15],
    // traits
    firstStep: [1, 'mul', 1, 1.15], burst: [1, 'mul', 1, 1.15],                                  // Quick Step
    wobble: [1, 'mul', 0.6, 1], heavy: [1, 'mul', 0.7, 1],                                       // Technical, Press Resistant
    finErr: [1, 'mul', 0.7, 1], finSpin: [1, 'mul', 1, 1.25],                                    // Finesse Specialist
    headV: [1, 'mul', 1, 1.12], headErr: [1, 'mul', 0.75, 1], headReach: [0, 'add', 0, 6],       // Power Header
    volErr: [1, 'mul', 0.75, 1], volZ: [0, 'add', 0, 6], diveRec: [1, 'mul', 0.8, 1],            // Acrobatic
    longErr: [1, 'mul', 0.8, 1], longV: [1, 'mul', 1, 1.08],                                     // Long Shot Taker
    pressErr: [1, 'mul', 0.6, 1], jostleV: [0.85, 'add', 0.85, 0.95],                            // Press Resistant
    stamDrain: [1, 'mul', 0.8, 1], stamRegen: [1, 'mul', 1, 1.2], tired: [0.86, 'add', 0.86, 0.92],   // Relentless
    recT: [1, 'mul', 0.8, 1], stumT: [1, 'mul', 0.8, 1], blockP: [0, 'add', 0, 0.08],            // Quick Reflexes (outfield)
    skCost: [1, 'mul', 0.8, 1], botch: [1, 'mul', 0.7, 1], readRate: [1, 'mul', 1, 1.2], fakeSell: [1, 'mul', 1, 1.5],   // Trickster
  };
  // Six playstyles, reusing the PROF archetype keys used to generate the roster. Values are factors / deltas on ISO.MODS.
  ISO.ROLES = {
    winger:    { name: 'Winger',    mods: { top: 1.012, lat: 1.03, accLo: 1.04, cut: 1.06, turn: 1.04, dribLead: 0.95 } },
    striker:   { name: 'Poacher',   mods: { fwd: 1.06, accLo: 1.03, accHi: 1.02 } },
    playmaker: { name: 'Playmaker', mods: { turnBall: 1.08, dribLead: 0.9, dribPull: 1.08, cut: 1.03 } },
    target:    { name: 'Target Man', mods: { top: 0.988, accLo: 0.94, accHi: 1.04, cut: 0.94, turn: 0.94, stop: 0.92 } },
    box2box:   { name: 'Engine',    mods: { accHi: 1.03, stop: 1.03, turn: 1.02 } },
    defender:  { name: 'Stopper',   mods: { stop: 1.1, turn: 1.02, accLo: 1.02, top: 0.995 } },
  };
  // Ten traits. score(a, def) is a 0-100 style rating from the attributes; bias moves the trait's rank and qualification so that
  // each trait ends up on roughly 8-35% of the roster (tools/check.js asserts it). mods are the same shape as ROLES.
  ISO.TRAITS = {
    quickstep: { id: 'quickstep', name: 'Quick Step', tag: 'QUICK STEP', desc: 'Explosive first yards and a sharper burst out of a stop.',
      score: (a) => a.acc * 0.6 + a.agi * 0.4, bias: 0, mods: { firstStep: 1.12, burst: 1.1 } },
    technical: { id: 'technical', name: 'Technical', tag: 'TECHNICAL', desc: 'Close touches: the ball stays tight and a first touch rarely runs away.',
      score: (a) => (a.dri + a.bct) / 2, bias: 1.5, mods: { dribLead: 0.9, wobble: 0.75, heavy: 0.8 } },
    finesse: { id: 'finesse', name: 'Finesse Specialist', tag: 'FINESSE', desc: 'Placed, curling finesse shots: tighter spread and more bend.',
      score: (a) => a.cur * 0.6 + a.fin * 0.4, bias: 0, mods: { finErr: 0.85, finSpin: 1.12 } },
    header: { id: 'header', name: 'Power Header', tag: 'HEADER', desc: 'Wins the high ball: harder, truer headers from a little further.',
      score: (a) => a.str * 0.55 + a.fin * 0.25 + a.sho * 0.2, bias: 5, mods: { headV: 1.08, headErr: 0.85, headReach: 3 } },
    acrobat: { id: 'acrobat', name: 'Acrobatic', tag: 'ACROBAT', desc: 'Volleys from higher, more accurately, and bounces up from a diving header.',
      score: (a) => a.skl * 0.5 + a.agi * 0.3 + a.bal * 0.2, bias: 0, mods: { volErr: 0.85, volZ: 3, diveRec: 0.85 } },
    longshot: { id: 'longshot', name: 'Long Shot Taker', tag: 'LONG SHOT', desc: 'Shoots from distance: less spread and more pace the further out.',
      score: (a) => a.lng * 0.6 + a.sho * 0.4, bias: 1.25, mods: { longErr: 0.88, longV: 1.04 } },
    press: { id: 'press', name: 'Press Resistant', tag: 'PRESS PROOF', desc: 'Stays composed under pressure: less thrown off by a close defender or a jostle.',
      score: (a) => a.bal * 0.55 + a.str * 0.45, bias: 1.25, mods: { pressErr: 0.75, jostleV: 0.06, wobble: 0.85 } },
    relentless: { id: 'relentless', name: 'Relentless', tag: 'RELENTLESS', desc: 'Runs all match: slower stamina drain, faster recovery.',
      score: (a) => a.sta, bias: 2.25, mods: { stamDrain: 0.85, stamRegen: 1.15, tired: 0.04 } },
    reflex: { id: 'reflex', name: 'Quick Reflexes', tag: 'REFLEXES', desc: 'Back on his feet sooner after a tackle or a stumble, and better at blocking shots.',
      score: (a) => a.tck * 0.4 + a.agi * 0.3 + a.acc * 0.3, bias: -2, mods: { recT: 0.85, stumT: 0.85, blockP: 0.06 } },
    trickster: { id: 'trickster', name: 'Trickster', tag: 'TRICKSTER', desc: 'Skill moves cost less and rarely go wrong, and fakes fool more defenders.',
      score: (a) => a.skl, bias: 0, mods: { skCost: 0.8, botch: 0.75, readRate: 1.15, fakeSell: 1.25 } },
  };
  ISO.TRAIT_ORDER = Object.keys(ISO.TRAITS);
  // Hand-authored stars: roles and traits chosen by hand (the rest are derived from the attributes).
  const ROLE_FIX = { messi: 'playmaker', ronaldo: 'striker', mbappe: 'winger', haaland: 'target', neymar: 'winger', yamal: 'winger', vinicius: 'winger',
    salah: 'winger', bellingham: 'box2box', debruyne: 'playmaker', dembele: 'winger', kane: 'striker', pele: 'striker', maradona: 'playmaker',
    ronaldinho: 'playmaker', r9: 'striker', henry: 'striker', zidane: 'playmaker', cruyff: 'playmaker', beckham: 'playmaker' };
  const TRAIT_FIX = { messi: ['technical', 'finesse', 'quickstep'], ronaldo: ['header', 'longshot', 'relentless'], mbappe: ['quickstep', 'relentless'],
    haaland: ['header', 'press'], neymar: ['trickster', 'technical', 'quickstep'], yamal: ['technical', 'trickster'], vinicius: ['quickstep', 'trickster', 'technical'],
    salah: ['quickstep', 'finesse', 'relentless'], bellingham: ['relentless', 'press', 'header'], debruyne: ['longshot', 'finesse'], dembele: ['quickstep', 'trickster'],
    kane: ['longshot', 'header', 'finesse'], pele: ['acrobat', 'technical', 'finesse'], maradona: ['technical', 'press', 'trickster'],
    ronaldinho: ['trickster', 'finesse', 'technical'], r9: ['quickstep', 'press', 'finesse'], henry: ['quickstep', 'finesse'],
    zidane: ['technical', 'press', 'finesse'], cruyff: ['technical', 'quickstep', 'trickster'], beckham: ['finesse', 'longshot', 'relentless'] };
  // Weak-foot stars from the Weak Foot attribute (thresholds chosen for the roster's spread).
  ISO.wfStars = (wf) => (wf >= 92 ? 5 : wf >= 84 ? 4 : wf >= 74 ? 3 : wf >= 62 ? 2 : 1);
  ISO.STYLE_OFF = false;      // kill switch: true makes styleOf return the neutral table (tests and tools/sim.js STYLE=off)
  const baseOf = (d) => d.base || d;
  // The role: an explicit def.role, else the hand-authored fix, else the PROF archetype whose attribute offsets are nearest.
  ISO.roleOf = (def) => {
    const b = baseOf(def);
    if (b.role && ISO.ROLES[b.role]) return b.role;
    if (ROLE_FIX[b.id]) return ROLE_FIX[b.id];
    let best = 'box2box', bd = 1e18;
    for (const r in PROF) {
      let s = 0;
      KEYS.forEach((k, i) => { const e = (b.attr[k] || 0) - b.ovr - PROF[r][i]; s += e * e; });
      if (s < bd) { bd = s; best = r; }
    }
    return best;
  };
  // Traits: explicit def.traits (tests), else the hand-authored list, else the best-ranked styles (2 slots, 3 from ovr 85).
  ISO.traitsOf = (def) => {
    if (Array.isArray(def.traits)) return def.traits.filter((t) => ISO.TRAITS[t]);
    const b = baseOf(def);
    if (Array.isArray(b.traits)) return b.traits.filter((t) => ISO.TRAITS[t]);
    if (TRAIT_FIX[b.id]) return TRAIT_FIX[b.id].slice();
    const rows = ISO.TRAIT_ORDER.map((id) => { const T = ISO.TRAITS[id], s = T.score(b.attr, b) - T.bias; return { id, s, rank: s - b.ovr }; });
    rows.sort((x, y) => y.rank - x.rank);
    const slots = b.ovr >= 85 ? 3 : 2;
    const out = rows.filter((r) => r.s >= 90 || (r.rank >= 1.5 && r.s >= 60)).slice(0, slots).map((r) => r.id);
    if (!out.length) out.push(rows[0].id);
    return out;
  };
  const neutralM = () => { const m = {}; for (const k in ISO.MODS) m[k] = ISO.MODS[k][0]; return m; };
  const NEUTRAL = Object.freeze({ role: 'none', traits: Object.freeze([]), m: Object.freeze(neutralM()), wfStars: 3, celeb: 'fist' });
  const STYLE_CACHE = new WeakMap();
  // Celebrations (roadmap 2.5): presentation only. The sim state 'celebrate' and its timing never depend on them.
  // dur: the loop length of the clip on the state clock; cam: the 3D goal camera (distance, height, extra yaw toward the goal).
  ISO.CELEBS = [
    { id: 'fist', name: 'FIST PUMP', cost: 0, dur: 1.6, loop: true, cam: { D: 6.5, H: 2.6, yaw: 0.35 }, desc: 'A leap, a fist to the sky, then both fists pumping.' },
    { id: 'arms', name: 'ARMS WIDE', cost: 300, dur: 2.0, loop: true, cam: { D: 6.8, H: 2.4, yaw: 0.3 }, desc: 'Head back, arms stretched wide, soaking it in.' },
    { id: 'point', name: 'POINT UP', cost: 300, dur: 2.0, loop: true, cam: { D: 6.5, H: 2.2, yaw: 0.3 }, desc: 'Both index fingers to the sky.' },
    { id: 'salute', name: 'SALUTE', cost: 500, dur: 2.0, loop: true, cam: { D: 5.8, H: 2.0, yaw: 0.3 }, desc: 'A crisp salute to the crowd.' },
    { id: 'robot', name: 'ROBOT', cost: 700, dur: 1.6, loop: true, cam: { D: 6.0, H: 2.2, yaw: 0.3 }, desc: 'Stiff, mechanical arm moves on the beat.' },
    { id: 'sit', name: 'SIT DOWN', cost: 600, dur: 2.4, loop: true, cam: { D: 5.4, H: 1.6, yaw: 0.25 }, desc: 'Cool as ice: drop into a low squat, arms folded.' },
    { id: 'knee', name: 'KNEE DROP', cost: 900, dur: 2.2, loop: true, cam: { D: 5.4, H: 1.5, yaw: 0.25 }, desc: 'Sink low on the knees, head back, arms out.' },
    { id: 'spin', name: 'SPIN LEAP', cost: 1500, dur: 2.4, loop: true, cam: { D: 8.0, H: 3.0, yaw: 0.3 }, desc: 'A leap with a full turn in the air, then a fist pump.' },
  ];
  const CELEB_IDS = Object.create(null);      // no prototype: 'constructor' and '__proto__' are not celebrations
  for (const c of ISO.CELEBS) CELEB_IDS[c.id] = c;
  ISO.celebById = (id) => CELEB_IDS[id] || CELEB_IDS.fist;
  ISO.hasCeleb = (id) => !!CELEB_IDS[id];
  ISO.CELEB_SIG = { id: 'signature', name: 'SIGNATURE', desc: "Your player's own celebration (every star has one; others follow their playstyle)." };
  const CELEB_FIX = { messi: 'point', ronaldo: 'arms', mbappe: 'salute', haaland: 'sit', neymar: 'knee', yamal: 'robot', vinicius: 'spin', salah: 'knee', bellingham: 'arms',
    debruyne: 'fist', dembele: 'robot', kane: 'fist', pele: 'fist', maradona: 'arms', ronaldinho: 'spin', r9: 'arms', henry: 'knee', zidane: 'salute', cruyff: 'point', beckham: 'knee' };
  const ROLE_CELEB = { winger: 'knee', striker: 'fist', playmaker: 'point', target: 'arms', box2box: 'salute', defender: 'robot' };
  function buildStyle(def) {
    const role = ISO.roleOf(def), traits = ISO.traitsOf(def), b = baseOf(def), a = def.attr, M = ISO.MODS, m = neutralM();
    const apply = (mods) => { for (const k in mods) { const e = M[k]; if (!e) continue; m[k] = e[1] === 'mul' ? m[k] * mods[k] : m[k] + mods[k]; } };
    apply(ISO.ROLES[role].mods);
    // body: continuous, from height, width and strength. Tall = longer stride, slower off the mark; strong = stronger late.
    const hf = Math.max(-1, Math.min(1, ((b.look && b.look.h || 1) - 1) / 0.14)), sf = (qa(a.str) - 0.5) * 2;
    apply({ stride: 1 + 0.1 * hf, accLo: 1 - 0.07 * hf - 0.02 * sf, accHi: 1 + 0.03 * hf + 0.04 * sf, turn: 1 - 0.05 * hf, cut: 1 - 0.04 * hf });
    for (const t of traits) apply(ISO.TRAITS[t].mods);
    for (const k in M) m[k] = Math.max(M[k][2], Math.min(M[k][3], m[k]));
    return Object.freeze({ role, traits: Object.freeze(traits), m: Object.freeze(m), wfStars: ISO.wfStars(a.wf), celeb: CELEB_FIX[b.id] || ROLE_CELEB[role] || 'fist' });
  }
  // The one resolver the sim, AI and UI read. Pure: the same def always gives the same table.
  ISO.styleOf = (def) => {
    if (ISO.STYLE_OFF || !def || !def.attr) return NEUTRAL;
    let s = STYLE_CACHE.get(def);
    if (!s) { s = buildStyle(def); STYLE_CACHE.set(def, s); }
    return s;
  };

  // Rarity tiers drive the box draw.
  ISO.RARITY = {
    common: { name: 'COMMON', col: '#9aa3b2', dup: 50 },
    rare: { name: 'RARE', col: '#4fa3ff', dup: 120 },
    epic: { name: 'EPIC', col: '#b06bff', dup: 300 },
    legend: { name: 'LEGENDARY', col: '#ffb23d', dup: 700 },
    icon: { name: 'ICON', col: '#f1735f', dup: 1500 },
  };
  ISO.rarityOf = (d) => (d.era === 'legend' ? 'icon' : d.ovr >= 87 ? 'legend' : d.ovr >= 80 ? 'epic' : d.ovr >= 71 ? 'rare' : 'common');

  ISO.playerById = (id) => ISO.PLAYERS.find((p) => p.id === id);

  // Goalkeepers are AI-only. Ratings: reflexes, positioning, diving, handling, one-on-one.
  ISO.KEEPERS = [
    { name: 'Home GK', a: { ref: 84, pos: 83, div: 84, han: 81, ooo: 82 },
      look: { skin: '#e8bd95', hair: 'short', hairColor: '#3a2a1c', h: 0.9, w: 0.9 },
      kit: kit('#a78bfa', '#2e1f5e', 'solid', '#2e1f5e', '#a78bfa') },
    { name: 'Away GK', a: { ref: 83, pos: 84, div: 83, han: 82, ooo: 83 },
      look: { skin: '#9a6a44', hair: 'buzz', hairColor: '#17100c', beard: 'stubble', beardColor: '#17100c', h: 0.9, w: 0.9 },
      kit: kit('#ff8a3d', '#4a1f00', 'solid', '#4a1f00', '#ff8a3d') },
  ];

  // Phase 3.4: goalkeeper personalities. A keeper def may carry `gk` (a style id). The tables below have the same shape as ISO.MODS:
  // key: [neutral, 'mul' | 'add', lo, hi]. The neutral table multiplies by exactly 1 / adds 0, so a keeper with no `gk` (every keeper the
  // server, the drills and the default offline game use) is bit-identical to the pre-style keeper. Only offline CPU games pass a styled keeper.
  ISO.GK_MODS = {
    depth: [1, 'mul', 0.5, 1.5], narrow: [1, 'mul', 0.6, 1.4], rushP: [1, 'mul', 0.3, 2], rushR: [1, 'mul', 0.8, 1.4], rushCd: [1, 'mul', 0.6, 1.5],
    slideP: [1, 'mul', 0.3, 2], slideR: [1, 'mul', 0.8, 1.3], claim: [1, 'mul', 0.7, 1.6], antic: [1, 'mul', 0.4, 1.5], react: [1, 'mul', 0.9, 1.1],
    wait: [1, 'mul', 0.9, 1.2], readErr: [1, 'mul', 0.8, 1.2], lineSpd: [1, 'mul', 0.9, 1.15], hold: [1, 'mul', 0.5, 1.4], distDepth: [1, 'mul', 0.8, 1.3],
    distWide: [1, 'mul', 0.8, 1.3], penGuess: [0, 'add', 0, 0.6],
  };
  ISO.GK_STYLES = {
    aggressive: { name: 'Aggressive', desc: 'Rushes and slides at dribblers, narrows hard, gambles in a penalty.', knobs: { rushP: 1.6, rushR: 1.15, slideP: 1.4, narrow: 1.25, claim: 1.2, hold: 0.7, readErr: 1.1, penGuess: 0.5 } },
    conservative: { name: 'Conservative', desc: 'Stays home, rarely comes out, protects the line.', knobs: { rushP: 0.4, slideP: 0.5, narrow: 0.7, depth: 0.7, claim: 0.85, wait: 1.1, readErr: 0.92, hold: 1.2, distWide: 1.2 } },
    reflex: { name: 'Reflex', desc: 'Quick off the mark, reads the wind-up, but sits on his line.', knobs: { react: 0.9, antic: 0.6, depth: 0.8, readErr: 1.12, rushP: 0.8 } },
    sweeper: { name: 'Sweeper', desc: 'Plays high: claims loose balls, sweeps up and throws long.', knobs: { claim: 1.5, rushR: 1.3, rushP: 1.3, depth: 1.3, narrow: 1.15, hold: 0.6, distDepth: 1.2, react: 1.05 } },
    positioning: { name: 'Positioning', desc: 'Always in the right place: reads the line, rarely gambles.', knobs: { depth: 1.15, readErr: 0.85, lineSpd: 1.1, antic: 1.3, rushP: 0.7, slideP: 0.8, wait: 1.05 } },
  };
  ISO.GK_ORDER = Object.keys(ISO.GK_STYLES);
  const gkNeutral = () => { const m = {}; for (const k in ISO.GK_MODS) m[k] = ISO.GK_MODS[k][0]; return m; };
  const GK_NEUTRAL = Object.freeze({ id: 'neutral', name: 'Balanced', desc: 'No particular style.', m: Object.freeze(gkNeutral()) });
  const GK_CACHE = new Map();
  // pure table of a style id ('neutral' for anything unknown)
  ISO.gkTable = (id) => {
    const st = ISO.GK_STYLES[id];
    if (!st || !Object.prototype.hasOwnProperty.call(ISO.GK_STYLES, id)) return GK_NEUTRAL;
    let t = GK_CACHE.get(id);
    if (!t) {
      const m = gkNeutral();
      for (const k in st.knobs) { const e = ISO.GK_MODS[k]; if (e) m[k] = Math.max(e[2], Math.min(e[3], e[1] === 'mul' ? m[k] * st.knobs[k] : m[k] + st.knobs[k])); }
      t = Object.freeze({ id, name: st.name, desc: st.desc, m: Object.freeze(m) }); GK_CACHE.set(id, t);
    }
    return t;
  };
  // The one resolver the sim reads (at call time, from the keeper def: nothing is stored on the keeper or G).
  ISO.keeperStyleOf = (def) => (ISO.STYLE_OFF || !def || !def.gk ? GK_NEUTRAL : ISO.gkTable(def.gk));
  // A stable style for a CPU opponent from its player id (offline only)
  ISO.gkFor = (def) => { let h = 7; const id = (def && def.id) || ''; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return ISO.GK_ORDER[h % ISO.GK_ORDER.length]; };

  // --- kit helpers ---------------------------------------------------------
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  ISO.lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  function colorDist(a, b) {
    const A = rgb(a), B = rgb(b);
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  }
  // If the away kit is too close to the home kit, give the away side a change strip.
  ISO.resolveKits = (home, away) => {
    let ak = away.kit;
    if (colorDist(home.kit.a, away.kit.a) < 110) {
      ak = ISO.lum(home.kit.a) > 0.5
        ? kit('#1d2233', away.kit.b === '#1d2233' ? '#35e08a' : away.kit.a, 'cstripe', '#1d2233', '#1d2233')
        : kit('#f4f4f4', away.kit.a, 'cstripe', '#f4f4f4', '#f4f4f4');
    }
    return [home.kit, ak];
  };

  // --- store catalogue: skins, primes, skill moves, maps ---------------------
  // Skins are bought per character, and every purchasable jersey is one of a kind: no two players
  // (and no two skins) share the same shirt. Each skin type has a theme; the details are generated
  // per player from a seed, and a clash with any jersey already handed out moves on to the next design.
  const PATS = ['solid', 'cstripe', 'vstripes', 'hoops', 'sash', 'halves', 'quarters', 'pin', 'chevron', 'sleeves'];
  const BRIGHT = ['#f1735f', '#35e08a', '#4fa3ff', '#ffcf4d', '#b06bff', '#ff4fa3', '#3df5ff', '#d7ff3d', '#ff8a3d', '#e83030',
    '#7fc4ff', '#ffffff', '#c9d2de', '#9ef0c4', '#ffb3c7', '#ffa64d'];
  const DARKS = ['#17171b', '#1f2433', '#0a1f44', '#3a0d1a', '#0f3d2a', '#2e1f5e', '#4a1f00', '#26313f', '#5a0f2e', '#123b4a'];
  const NAT = {   // national team colours: shirt, trim, shorts
    ARG: ['#75aadb', '#ffffff', '#17171b'], POR: ['#c8102e', '#046a38', '#046a38'], FRA: ['#1d2f6f', '#ffffff', '#ffffff'],
    NOR: ['#ba0c2f', '#00205b', '#ffffff'], BRA: ['#ffdc02', '#009b3a', '#0b3d91'], ESP: ['#c60b1e', '#ffc400', '#1d2f6f'],
    EGY: ['#c8102e', '#17171b', '#ffffff'], ENG: ['#ffffff', '#1d2f6f', '#1d2f6f'], BEL: ['#e30613', '#ffd90c', '#e30613'],
    NED: ['#ff6c00', '#17171b', '#ff6c00'], SCO: ['#1d2f6f', '#ffffff', '#ffffff'], JAM: ['#ffd100', '#009b3a', '#17171b'],
    GHA: ['#ffffff', '#ce1126', '#ffffff'], WAL: ['#c8102e', '#00ad36', '#c8102e'], NZL: ['#ffffff', '#17171b', '#17171b'],
    KOR: ['#c8102e', '#17171b', '#17171b'], GEO: ['#ffffff', '#da291c', '#ffffff'], SWE: ['#fecc02', '#006aa7', '#006aa7'],
    ITA: ['#0066cc', '#ffffff', '#ffffff'], CIV: ['#ff8200', '#009e60', '#ffffff'],
  };
  const seeded = (str) => {
    let h = 9; for (const ch of str) h = (h * 33 + ch.charCodeAt(0)) | 0;
    return () => { h = (Math.imul(h, 1103515245) + 12345) | 0; return ((h >>> 16) & 0x7fff) / 0x8000; };
  };
  const pickOf = (r, list) => list[(r() * list.length) | 0];
  // Each design returns a candidate kit for try number n (0, 1, 2 ...): early tries stay closest to the theme.
  const DESIGNS = {
    away: (d, r, n) => {
      const k = d.kit, pat = n === 0 ? (k.pat === 'solid' ? 'cstripe' : k.pat === 'cstripe' ? 'sash' : 'solid') : pickOf(r, PATS);
      const b = n < 4 ? k.a : pickOf(r, BRIGHT.concat(DARKS));
      return kit(k.b, b, pat, k.a, k.b);
    },
    national: (d, r, n) => {
      const c = NAT[d.nat] || ['#f4f4f4', '#17171b', '#17171b'], swap = n >= PATS.length && n < PATS.length * 2;
      const pat = n < PATS.length * 2 ? PATS[(n + ((r() * PATS.length) | 0)) % PATS.length] : pickOf(r, PATS);
      const a = swap ? c[1] : c[0], b = n >= PATS.length * 2 ? pickOf(r, BRIGHT.concat(DARKS)) : swap ? c[0] : c[1];
      return kit(a, b, pat, c[2], a);
    },
    third: (d, r) => {
      const a = pickOf(r, BRIGHT.concat(DARKS));
      let b = pickOf(r, ISO.lum(a) > 0.55 ? DARKS : BRIGHT);
      if (b === a) b = '#ffffff';
      return kit(a, b, pickOf(r, PATS), b, a);
    },
    blackout: (d, r) => kit('#17171b', pickOf(r, BRIGHT), pickOf(r, PATS), '#17171b', '#17171b'),
    gold: (d, r) => kit('#ffcf4d', pickOf(r, DARKS), pickOf(r, PATS), pickOf(r, DARKS), '#ffcf4d'),
  };
  ISO.SKINS = [
    { id: 'home', name: 'HOME', cost: 0, desc: () => 'The classic strip' },
    { id: 'away', name: 'AWAY', cost: 300, desc: (d) => esc(d.club) + ' colours, flipped' },
    { id: 'national', name: 'NATIONAL', cost: 400, desc: (d) => d.flag + ' ' + d.nat + ' colours' },
    { id: 'third', name: 'THIRD', cost: 600, desc: () => 'A one-off design' },
    { id: 'blackout', name: 'BLACKOUT', cost: 800, desc: () => 'All black, one accent', boot: '#17171b' },
    { id: 'gold', name: 'GOLD', cost: 1500, desc: () => 'For the ones who made it', boot: '#ffcf4d' },
  ];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kitKey = (k) => k.a + k.b + k.pat;
  let SKIN_KITS = null;
  // Hand out every player's jerseys in roster order, so the result never changes between sessions.
  function buildSkinKits() {
    SKIN_KITS = {};
    const used = new Set(ISO.PLAYERS.map((d) => kitKey(d.kit)));      // never copy a real home kit either
    for (const sk of ISO.SKINS) {
      if (!DESIGNS[sk.id]) continue;
      for (const d of ISO.PLAYERS) {
        const r = seeded(d.id + ':' + sk.id);
        let k = null;
        for (let n = 0; n < 400; n++) { const c = DESIGNS[sk.id](d, r, n); if (c.a !== c.b && !used.has(kitKey(c))) { k = c; break; } }
        if (!k) k = DESIGNS[sk.id](d, r, 0);
        used.add(kitKey(k));
        (SKIN_KITS[d.id] = SKIN_KITS[d.id] || {})[sk.id] = k;
      }
    }
  }
  ISO.skinKit = (d, sid) => {
    if (sid === 'home') return d.kit;
    if (!SKIN_KITS) buildSkinKits();
    return (SKIN_KITS[d.id] && SKIN_KITS[d.id][sid]) || d.kit;
  };
  ISO.skinById = (id) => ISO.SKINS.find((s) => s.id === id) || ISO.SKINS[0];

  // Prime: a permanent upgrade bought with credits. Every attribute and the overall go up.
  ISO.PRIME = { boost: 4, cost: { common: 800, rare: 1500, epic: 3000, legend: 5000, icon: 8000 }, boot: '#ffcf4d' };
  ISO.primeCost = (d) => ISO.PRIME.cost[ISO.rarityOf(d)];
  ISO.primeOf = (d) => {
    const attr = {};
    for (const k of KEYS) attr[k] = Math.min(99, d.attr[k] + ISO.PRIME.boost);
    return Object.assign({}, d, { attr, ovr: Math.min(99, d.ovr + ISO.PRIME.boost), prime: true, base: d,
      look: Object.assign({}, d.look, { boot: ISO.PRIME.boot }) });
  };
  // A character as the owner fields them: prime stats (if bought) and the equipped skin.
  // celeb (optional): a bought celebration id; unknown ids and 'signature' leave the player's own. It clones, so the catalogue def is never mutated.
  ISO.outfit = (d, prime, skinId, celeb) => {
    const sk = ISO.skinById(skinId), cs = celeb && celeb !== 'signature' && ISO.hasCeleb(celeb);
    if (!prime && sk.id === 'home' && !cs) return d;
    const o = prime ? ISO.primeOf(d) : Object.assign({}, d, { base: d });
    if (cs) o.celeb = celeb;
    if (sk.id !== 'home') {
      o.kit = ISO.skinKit(d, sk.id); o.skin = sk.id;
      if (sk.boot && !prime) o.look = Object.assign({}, d.look, { boot: sk.boot });
    }
    return o;
  };

  // The celebration a def plays: a bought one (def.celeb) else its signature (CELEB_FIX, then the playstyle, then 'fist').
  ISO.celebOf = (def) => {
    const c = def && def.celeb;
    if (c && c !== 'signature' && CELEB_IDS[c]) return c;
    return ISO.styleOf(def).celeb || 'fist';
  };
  // Sim revision: bump on any change that alters match results. The server sends it in `start`; a client with another revision warns.
  ISO.SIM_REV = '2.81-p2';

  // Skill moves the player has to unlock in the store (the CPU is only limited by skill stars).
  ISO.MOVE_COST = { feint: 0, knock: 0, stepover: 0, roll: 0, dragback: 0, croqueta: 0, roulette: 0, heel: 0, nutmeg: 0, elastico: 0, rainbow: 0 };      // every skill move is unlocked from the start

  // Maps are cosmetic pitches; render.js paints them from these themes.
  ISO.MAPS = [
    { id: 'stadium', name: 'THE STADIUM', cost: 0, desc: 'Matchday under the floodlights' },
    { id: 'street', name: 'STREET CAGE', cost: 600, desc: 'Tarmac, chain-link and yellow paint' },
    { id: 'beach', name: 'COPA BEACH', cost: 900, desc: 'Sand underfoot, sea behind the goal' },
    { id: 'snow', name: 'WINTER CUP', cost: 1200, desc: 'Orange lines on a frozen pitch' },
    { id: 'neon', name: 'NEON NIGHT', cost: 2000, desc: 'Midnight turf, glowing lines' },
    { id: 'sunset', name: 'GOLDEN HOUR', cost: 800, desc: 'Amber light across a warm pitch' },
    { id: 'monsoon', name: 'MONSOON', cost: 1000, desc: 'A heavy, rain-soaked night match' },
    { id: 'jungle', name: 'AMAZON CUP', cost: 1000, desc: 'Deep green, thick with canopy' },
    { id: 'moon', name: 'LUNAR LEAGUE', cost: 1600, desc: 'Grey dust and a very low sky' },
    { id: 'desert', name: 'DUNE DERBY', cost: 900, desc: 'Orange sand and a burning sun' },
    { id: 'retro', name: 'RETRO 8-BIT', cost: 1400, desc: 'Green phosphor on black' },
    { id: 'sakura', name: 'CHERRY PARK', cost: 1100, desc: 'Pink blossom drifting over the pitch' },
    { id: 'dock', name: 'DOCKYARD', cost: 700, desc: 'Concrete, cranes and shipping containers' },
    { id: 'gold', name: 'GOLD CUP', cost: 3000, desc: 'A trophy-night pitch dressed in gold' },
    { id: 'mud', name: 'MUDBATH', cost: 600, desc: 'Heavy, churned-up Sunday league turf' },
    // futsal: walled courts. The ball bounces off every wall (the goal mouths stay open), so nothing goes out of play.
    { id: 'fs_wood', name: 'HARDWOOD ARENA', cat: 'futsal', walls: true, cost: 1500, desc: 'Polished parquet, boards all round' },
    { id: 'fs_blue', name: 'BLUE COURT', cat: 'futsal', walls: true, cost: 1500, desc: 'The classic indoor blue' },
    { id: 'fs_red', name: 'CRIMSON DOME', cat: 'futsal', walls: true, cost: 1800, desc: 'Hot red floor, loud walls' },
    { id: 'fs_roof', name: 'ROOFTOP CAGE', cat: 'futsal', walls: true, cost: 1800, desc: 'Wire-fenced court over the skyline' },
    { id: 'fs_glass', name: 'GLASS CUBE', cat: 'futsal', walls: true, cost: 2400, desc: 'A clear-walled neon box' },
  ];
  // Rule sets (Phase 4.1), read by js/game.js through ISO.RULES[G.rules] (opt-in per match, offline only; the server never passes `rules`).
  // top / acc: sprint speed and acceleration x; skCost / skCd: skill stamina cost and cooldown x; stars: extra skill-move stars (cap 5);
  // wallE: wall restitution x; win: goals to win; limit: seconds (0 = none), then the leader wins and a level score is sudden death;
  // outBox: points for a goal struck from outside the box; wallGoal: points for a goal that came off a wall.
  ISO.RULES = {
    street: { top: 1.05, acc: 1.15, skCost: 0.6, skCd: 0.7, stars: 1, wallE: 0.9, win: 5, limit: 180, outBox: 2, wallGoal: 2 },
  };
  // Ball skins (cosmetic, local to your screen). Drawn by sprites.js: base gradient, a sweeping slab, panels, outline, optional glow and stripes.
  ISO.BALLS = [
    { id: 'classic', name: 'MATCHDAY', cost: 0, desc: 'The standard ball', base: ['#ffffff', '#e6e9ee'], slab: '#f1735f', panel: '#1f2433', ink: '#1f2433' },
    { id: 'inferno', name: 'INFERNO', cost: 400, desc: 'Scorched orange, hot to the touch', base: ['#ffb347', '#e8541a'], slab: '#ffe27a', panel: '#5a1a08', ink: '#5a1a08', glow: '#ff6a1a' },
    { id: 'glacier', name: 'GLACIER', cost: 400, desc: 'Frosted ice-blue panels', base: ['#f4fbff', '#b9dcf0'], slab: '#6ab8e8', panel: '#2a5a80', ink: '#2a5a80' },
    { id: 'volt', name: 'VOLT', cost: 600, desc: 'Electric lime with black panels', base: ['#e8ff5a', '#9be01a'], slab: '#111111', panel: '#111111', ink: '#111111', glow: '#c8ff2a' },
    { id: 'goldenboot', name: 'GOLDEN BOOT', cost: 1500, desc: 'Solid gold, for the top scorer', base: ['#fff0a0', '#d9a41a'], slab: '#8a6410', panel: '#6a4a08', ink: '#6a4a08', glow: '#ffd23d' },
    { id: 'bubblegum', name: 'BUBBLEGUM', cost: 500, desc: 'Pink and playful', base: ['#ffe0ee', '#f7a3c8'], slab: '#ff5fa8', panel: '#8a2a5a', ink: '#8a2a5a' },
    { id: 'midnight', name: 'MIDNIGHT', cost: 900, desc: 'Black ball, cyan glow', base: ['#2a3040', '#0a0d14'], slab: '#3df5ff', panel: '#3df5ff', ink: '#05070c', glow: '#3df5ff' },
    { id: 'retro70', name: 'TELSTAR', cost: 700, desc: 'Black and white, 1970 style', base: ['#ffffff', '#dcdcdc'], slab: null, panel: '#111111', ink: '#111111', many: true },
    { id: 'planet', name: 'PLANET', cost: 1100, desc: 'Blue ocean, green continents', base: ['#6ac4ff', '#1f6fb8'], slab: '#3fbf5a', panel: '#2e8a44', ink: '#123a66' },
    { id: 'galaxy', name: 'GALAXY', cost: 1800, desc: 'Deep purple, a thousand stars', base: ['#6a3fb8', '#2a0f5a'], slab: '#b06bff', panel: '#ffe9ff', ink: '#14062e', glow: '#b06bff', stars: true },
  ];
  ISO.ballById = (id) => ISO.BALLS.find((b) => b.id === id) || ISO.BALLS[0];
  ISO.mapById = (id) => ISO.MAPS.find((m) => m.id === id) || ISO.MAPS[0];

  /* Optional professional sprite overrides.
     Map a player id to an image URL laid out exactly like the generated sheet
     (see ISO.Sprites.LAYOUT in sprites.js). Missing/broken images are ignored. */
  ISO.SPRITE_OVERRIDES = {};
})();
