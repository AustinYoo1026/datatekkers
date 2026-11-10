/* ISO FOOTBALL — roster data. Pure data, no DOM. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});

  // Attribute order used by the compact roster table below.
  const KEYS = ['pac', 'acc', 'dri', 'agi', 'bal', 'bct', 'fin', 'sho', 'lng', 'cur', 'wf', 'skl', 'str', 'tck', 'sta'];

  ISO.ATTRS = [
    ['pac', 'Pace'], ['acc', 'Acceleration'], ['dri', 'Dribbling'], ['agi', 'Agility'], ['bal', 'Balance'],
    ['bct', 'Ball Control'], ['fin', 'Finishing'], ['sho', 'Shot Power'], ['lng', 'Long Shots'], ['cur', 'Curve'],
    ['wf', 'Weak Foot'], ['skl', 'Skill Moves'], ['str', 'Strength'], ['tck', 'Tackling'], ['sta', 'Stamina'],
  ];

  // Skill-move star rating (1-5) derived from the Skill Moves attribute.
  ISO.stars = (skl) => (skl >= 90 ? 5 : skl >= 80 ? 4 : skl >= 68 ? 3 : skl >= 55 ? 2 : 1);

  function P(id, name, short, nat, flag, club, era, ovr, foot, num, attrs, look, kit) {
    const attr = {};
    KEYS.forEach((k, i) => (attr[k] = attrs[i]));
    return { id, name, short, nat, flag, club, era, ovr, foot, num, attr, look, kit };
  }
  const kit = (a, b, pat, shorts, socks) => ({ a, b, pat, shorts, socks });

  ISO.PLAYERS = [
    //                                                                            pac acc dri agi bal bct fin sho lng cur wf  skl str tck sta
    P('messi', 'Lionel Messi', 'MESSI', 'ARG', '🇦🇷', 'Inter Miami', 'modern', 94, 'L', 10,
      [86, 93, 98, 95, 97, 98, 95, 86, 93, 95, 72, 88, 62, 38, 76],
      { skin: '#eec39a', hair: 'short', hairColor: '#5a3a22', beard: 'full', beardColor: '#6b4428', h: 0.92, w: 0.98 },
      kit('#f4a9c2', '#17171b', 'solid', '#f4a9c2', '#f4a9c2')),
    P('ronaldo', 'Cristiano Ronaldo', 'RONALDO', 'POR', '🇵🇹', 'Al Nassr', 'modern', 93, 'R', 7,
      [90, 88, 89, 86, 78, 91, 96, 96, 93, 84, 88, 92, 84, 36, 86],
      { skin: '#dba77a', hair: 'quiff', hairColor: '#1c1410', h: 1.06, w: 1.06 },
      kit('#f7d117', '#1d3f94', 'solid', '#1d3f94', '#f7d117')),
    P('mbappe', 'Kylian Mbappé', 'MBAPPÉ', 'FRA', '🇫🇷', 'Real Madrid', 'modern', 92, 'R', 10,
      [98, 98, 93, 93, 82, 91, 93, 90, 84, 82, 80, 91, 76, 36, 88],
      { skin: '#8a5a3a', hair: 'buzz', hairColor: '#141010', h: 1.0, w: 1.0 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('haaland', 'Erling Haaland', 'HAALAND', 'NOR', '🇳🇴', 'Manchester City', 'modern', 91, 'L', 9,
      [90, 84, 79, 74, 74, 82, 97, 97, 85, 76, 68, 62, 96, 45, 84],
      { skin: '#f6d7bd', hair: 'bun', hairColor: '#e8cf7a', h: 1.12, w: 1.14 },
      kit('#6cabdd', '#ffffff', 'solid', '#ffffff', '#6cabdd')),
    P('neymar', 'Neymar Jr', 'NEYMAR', 'BRA', '🇧🇷', 'Santos', 'modern', 90, 'R', 10,
      [88, 93, 96, 96, 84, 95, 88, 80, 84, 90, 92, 98, 52, 32, 78],
      { skin: '#c98f62', hair: 'mohawk', hairColor: '#2a1a12', beard: 'stubble', beardColor: '#2a1a12', h: 0.97, w: 0.9 },
      kit('#f4f4f4', '#141414', 'vstripes', '#141414', '#f4f4f4')),
    P('yamal', 'Lamine Yamal', 'YAMAL', 'ESP', '🇪🇸', 'Barcelona', 'modern', 89, 'L', 10,
      [90, 92, 94, 93, 80, 92, 85, 80, 84, 90, 66, 92, 58, 34, 80],
      { skin: '#b47a4e', hair: 'curly', hairColor: '#d8b45a', hair2: '#2a1a12', h: 1.0, w: 0.9 },
      kit('#a50044', '#004d98', 'vstripes', '#004d98', '#004d98')),
    P('vinicius', 'Vinícius Júnior', 'VINÍCIUS', 'BRA', '🇧🇷', 'Real Madrid', 'modern', 91, 'R', 7,
      [96, 96, 94, 95, 80, 90, 87, 82, 78, 80, 70, 96, 66, 30, 86],
      { skin: '#6b4226', hair: 'fade', hairColor: '#120d0a', h: 0.98, w: 0.93 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('salah', 'Mohamed Salah', 'SALAH', 'EGY', '🇪🇬', 'Liverpool', 'modern', 90, 'L', 11,
      [92, 92, 90, 91, 90, 89, 93, 86, 86, 88, 64, 82, 74, 44, 88],
      { skin: '#c08a5c', hair: 'afro', hairColor: '#1a1210', beard: 'full', beardColor: '#1a1210', h: 0.97, w: 1.0 },
      kit('#c8102e', '#f6eb61', 'solid', '#c8102e', '#c8102e')),
    P('bellingham', 'Jude Bellingham', 'BELLINGHAM', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Real Madrid', 'modern', 90, 'R', 5,
      [82, 82, 88, 84, 86, 90, 86, 86, 86, 80, 82, 84, 86, 80, 95],
      { skin: '#9a6a44', hair: 'fade', hairColor: '#17100c', h: 1.05, w: 1.05 },
      kit('#f7f7f4', '#c9a227', 'solid', '#f7f7f4', '#f7f7f4')),
    P('debruyne', 'Kevin De Bruyne', 'DE BRUYNE', 'BEL', '🇧🇪', 'Napoli', 'modern', 89, 'R', 11,
      [72, 74, 86, 76, 78, 91, 86, 93, 95, 93, 96, 82, 76, 64, 84],
      { skin: '#f6cfb0', hair: 'short', hairColor: '#d9843a', beard: 'stubble', beardColor: '#d9843a', h: 1.01, w: 1.02 },
      kit('#12a0d7', '#ffffff', 'solid', '#ffffff', '#12a0d7')),
    P('dembele', 'Ousmane Dembélé', 'DEMBÉLÉ', 'FRA', '🇫🇷', 'Paris Saint-Germain', 'modern', 90, 'R', 10,
      [93, 94, 93, 92, 80, 90, 88, 86, 84, 86, 98, 91, 60, 40, 82],
      { skin: '#7a4c2e', hair: 'curly', hairColor: '#15100c', beard: 'stubble', beardColor: '#15100c', h: 1.0, w: 0.9 },
      kit('#0a1f44', '#e30613', 'cstripe', '#0a1f44', '#0a1f44')),
    P('kane', 'Harry Kane', 'KANE', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Bayern Munich', 'modern', 90, 'R', 9,
      [70, 68, 83, 72, 80, 88, 97, 94, 93, 84, 92, 70, 86, 48, 84],
      { skin: '#f1c9a5', hair: 'short', hairColor: '#8a6a44', beard: 'stubble', beardColor: '#8a6a44', h: 1.07, w: 1.08 },
      kit('#dc052d', '#ffffff', 'solid', '#dc052d', '#dc052d')),

    P('pele', 'Pelé', 'PELÉ', 'BRA', '🇧🇷', 'Santos', 'legend', 96, 'R', 10,
      [93, 94, 95, 93, 93, 96, 97, 93, 90, 86, 92, 93, 80, 50, 88],
      { skin: '#5e3a22', hair: 'curly', hairColor: '#0f0b09', h: 0.95, w: 1.0 },
      kit('#f4f4f4', '#141414', 'solid', '#f4f4f4', '#f4f4f4')),
    P('maradona', 'Diego Maradona', 'MARADONA', 'ARG', '🇦🇷', 'Napoli', 'legend', 96, 'L', 10,
      [90, 94, 99, 96, 98, 97, 92, 88, 90, 92, 62, 94, 78, 42, 80],
      { skin: '#d9a077', hair: 'afro', hairColor: '#17110d', h: 0.88, w: 1.12 },
      kit('#3fa9e0', '#ffffff', 'solid', '#ffffff', '#3fa9e0')),
    P('ronaldinho', 'Ronaldinho', 'RONALDINHO', 'BRA', '🇧🇷', 'Barcelona', 'legend', 94, 'R', 10,
      [90, 91, 97, 94, 86, 97, 89, 88, 90, 95, 84, 99, 78, 36, 78],
      { skin: '#8f5f3c', hair: 'long', hairColor: '#15100c', band: '#f4f4f4', beard: 'goatee', beardColor: '#15100c', h: 1.02, w: 1.0 },
      kit('#a50044', '#004d98', 'vstripes', '#004d98', '#004d98')),
    P('r9', 'Ronaldo Nazário', 'R9', 'BRA', '🇧🇷', 'Brazil', 'legend', 96, 'R', 9,
      [97, 97, 96, 92, 90, 94, 98, 94, 86, 82, 88, 96, 88, 34, 78],
      { skin: '#a87148', hair: 'tuft', hairColor: '#1a120d', h: 1.03, w: 1.1 },
      kit('#ffdc02', '#009b3a', 'solid', '#0b3d91', '#f4f4f4')),
    P('henry', 'Thierry Henry', 'HENRY', 'FRA', '🇫🇷', 'Arsenal', 'legend', 93, 'R', 14,
      [96, 94, 91, 90, 82, 91, 95, 90, 88, 92, 80, 86, 80, 42, 86],
      { skin: '#7a4c2e', hair: 'bald', hairColor: '#17100c', beard: 'goatee', beardColor: '#17100c', h: 1.07, w: 1.0 },
      kit('#ef0107', '#ffffff', 'sleeves', '#ffffff', '#ffffff')),
    P('zidane', 'Zinedine Zidane', 'ZIDANE', 'FRA', '🇫🇷', 'Real Madrid', 'legend', 95, 'R', 5,
      [78, 78, 95, 86, 92, 99, 88, 90, 92, 90, 96, 96, 86, 66, 84],
      { skin: '#e2b48c', hair: 'balding', hairColor: '#2a1e16', h: 1.06, w: 1.05 },
      kit('#f7f7f4', '#2b2f6b', 'solid', '#f7f7f4', '#f7f7f4')),
    P('cruyff', 'Johan Cruyff', 'CRUYFF', 'NED', '🇳🇱', 'Ajax', 'legend', 95, 'R', 14,
      [91, 93, 96, 95, 88, 95, 92, 86, 86, 88, 90, 95, 68, 52, 86],
      { skin: '#f1c9a5', hair: 'mop', hairColor: '#6a4a2a', h: 1.0, w: 0.88 },
      kit('#f7f7f4', '#d2122e', 'cstripe', '#f7f7f4', '#f7f7f4')),
    P('beckham', 'David Beckham', 'BECKHAM', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester United', 'legend', 89, 'R', 7,
      [76, 76, 84, 78, 80, 90, 84, 92, 97, 99, 70, 74, 74, 62, 94],
      { skin: '#f3cda8', hair: 'quiff', hairColor: '#e2c26a', beard: 'stubble', beardColor: '#b89a56', h: 1.03, w: 1.0 },
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
  };
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
  };
  const look = (skin, hair, hairColor, x) => Object.assign({ skin, hair, hairColor, h: 1, w: 1 }, x || {});
  const SK = { pale: '#f6d7bd', fair: '#f1c9a5', light: '#e8bd95', tan: '#c98f62', brown: '#9a6a44', dark: '#6b4226', deep: '#4e2f1c' };
  const X = (id, name, short, nat, flag, club, era, ovr, foot, num, prof, lk) =>
    P(id, name, short, nat, flag, club, era, ovr, foot, num, gen(id, ovr, prof), lk, CLUB[club] || kit('#f4f4f4', '#17171b', 'solid', '#17171b', '#f4f4f4'));
  ISO.PLAYERS.push(
    // common
    X('cheadams', 'Che Adams', 'C. ADAMS', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Torino', 'modern', 70, 'R', 18, 'striker', look(SK.brown, 'buzz', '#17100c', { beard: 'stubble', beardColor: '#17100c' })),
    X('armstrong', 'Adam Armstrong', 'ARMSTRONG', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Southampton', 'modern', 68, 'R', 9, 'striker', look(SK.fair, 'short', '#5a3a22')),
    X('ings', 'Danny Ings', 'INGS', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 66, 'R', 18, 'striker', look(SK.fair, 'short', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c', h: 0.95 })),
    X('antonio', 'Michail Antonio', 'ANTONIO', 'JAM', '🇯🇲', 'West Ham', 'modern', 69, 'R', 9, 'target', look(SK.dark, 'bald', '#120d0a', { beard: 'full', beardColor: '#120d0a', h: 1.06, w: 1.1 })),
    X('weghorst', 'Wout Weghorst', 'WEGHORST', 'NED', '🇳🇱', 'Ajax', 'modern', 68, 'R', 25, 'target', look(SK.pale, 'short', '#c9a46a', { beard: 'stubble', beardColor: '#c9a46a', h: 1.14, w: 1.05 })),
    X('lingard', 'Jesse Lingard', 'LINGARD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'FC Seoul', 'modern', 69, 'R', 10, 'playmaker', look(SK.tan, 'fade', '#17100c', { beard: 'goatee', beardColor: '#17100c', h: 0.95 })),
    X('carroll', 'Andy Carroll', 'CARROLL', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Leeds', 'modern', 62, 'L', 9, 'target', look(SK.fair, 'bun', '#5a3a22', { beard: 'full', beardColor: '#5a3a22', h: 1.12, w: 1.1 })),
    X('barkley', 'Ross Barkley', 'BARKLEY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Aston Villa', 'modern', 70, 'R', 6, 'box2box', look(SK.light, 'short', '#2a1e16', { w: 1.06 })),
    X('ayew', 'Jordan Ayew', 'J. AYEW', 'GHA', '🇬🇭', 'Leicester', 'modern', 68, 'R', 9, 'winger', look(SK.dark, 'buzz', '#120d0a', { beard: 'stubble', beardColor: '#120d0a' })),
    X('djames', 'Daniel James', 'D. JAMES', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Leeds', 'modern', 69, 'L', 7, 'winger', look(SK.fair, 'short', '#3a2a1c', { h: 0.92, w: 0.9 })),
    // rare
    X('wood', 'Chris Wood', 'WOOD', 'NZL', '🇳🇿', 'Nottingham Forest', 'modern', 75, 'R', 11, 'target', look(SK.fair, 'short', '#5a3a22', { beard: 'stubble', beardColor: '#5a3a22', h: 1.1, w: 1.08 })),
    X('vardy', 'Jamie Vardy', 'VARDY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Leicester', 'modern', 74, 'R', 9, 'striker', look(SK.fair, 'short', '#8a6a44', { beard: 'stubble', beardColor: '#8a6a44', w: 0.92 })),
    X('solanke', 'Dominic Solanke', 'SOLANKE', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Tottenham', 'modern', 77, 'R', 19, 'striker', look(SK.brown, 'curly', '#17100c', { h: 1.05 })),
    X('bjohnson', 'Brennan Johnson', 'B. JOHNSON', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Tottenham', 'modern', 76, 'R', 22, 'winger', look(SK.tan, 'fade', '#17100c', { w: 0.92 })),
    X('bowen', 'Jarrod Bowen', 'BOWEN', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 79, 'L', 20, 'winger', look(SK.fair, 'short', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c' })),
    X('cwilson', 'Callum Wilson', 'C. WILSON', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'West Ham', 'modern', 74, 'R', 9, 'striker', look(SK.brown, 'buzz', '#17100c', { beard: 'goatee', beardColor: '#17100c' })),
    X('maddison', 'James Maddison', 'MADDISON', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Tottenham', 'modern', 79, 'R', 10, 'playmaker', look(SK.fair, 'quiff', '#3a2a1c', { beard: 'stubble', beardColor: '#3a2a1c' })),
    X('welbeck', 'Danny Welbeck', 'WELBECK', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Brighton', 'modern', 75, 'R', 18, 'striker', look(SK.dark, 'buzz', '#120d0a', { beard: 'stubble', beardColor: '#120d0a', h: 1.06 })),
    X('richarlison', 'Richarlison', 'RICHARLISON', 'BRA', '🇧🇷', 'Tottenham', 'modern', 77, 'R', 9, 'striker', look(SK.brown, 'mohawk', '#d8b45a', { h: 0.98 })),
    X('grealish', 'Jack Grealish', 'GREALISH', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Everton', 'modern', 79, 'R', 18, 'winger', look(SK.fair, 'long', '#3a2a1c', { band: '#f4f4f4' })),
    X('rashford', 'Marcus Rashford', 'RASHFORD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Barcelona', 'modern', 79, 'R', 14, 'winger', look(SK.dark, 'fade', '#120d0a', { beard: 'stubble', beardColor: '#120d0a' })),
    // epic
    X('watkins', 'Ollie Watkins', 'WATKINS', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Aston Villa', 'modern', 82, 'R', 11, 'striker', look(SK.brown, 'buzz', '#17100c')),
    X('son', 'Heung-min Son', 'SON', 'KOR', '🇰🇷', 'LAFC', 'modern', 86, 'R', 7, 'winger', look(SK.light, 'short', '#17100c', { h: 1.0, w: 0.98 })),
    X('saka', 'Bukayo Saka', 'SAKA', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Arsenal', 'modern', 87, 'L', 7, 'winger', look(SK.dark, 'fade', '#120d0a', { w: 0.95 })),
    X('foden', 'Phil Foden', 'FODEN', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester City', 'modern', 85, 'L', 47, 'playmaker', look(SK.fair, 'buzz', '#c9a46a', { h: 0.93, w: 0.9 })),
    X('palmer', 'Cole Palmer', 'PALMER', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Chelsea', 'modern', 86, 'L', 10, 'playmaker', look(SK.fair, 'short', '#d9843a', { w: 0.9 })),
    X('odegaard', 'Martin Ødegaard', 'ØDEGAARD', 'NOR', '🇳🇴', 'Arsenal', 'modern', 86, 'L', 8, 'playmaker', look(SK.pale, 'short', '#5a3a22', { w: 0.92 })),
    X('isak', 'Alexander Isak', 'ISAK', 'SWE', '🇸🇪', 'Liverpool', 'modern', 86, 'R', 9, 'striker', look(SK.brown, 'curly', '#17100c', { h: 1.1, w: 0.9 })),
    X('kvara', 'Khvicha Kvaratskhelia', 'KVARA', 'GEO', '🇬🇪', 'Paris Saint-Germain', 'modern', 86, 'R', 7, 'winger', look(SK.fair, 'mop', '#3a2a1c', { h: 1.04, w: 0.92 })),
    X('lautaro', 'Lautaro Martínez', 'LAUTARO', 'ARG', '🇦🇷', 'Inter', 'modern', 86, 'R', 10, 'striker', look(SK.tan, 'short', '#17100c', { beard: 'full', beardColor: '#17100c' })),
    X('leao', 'Rafael Leão', 'LEÃO', 'POR', '🇵🇹', 'AC Milan', 'modern', 84, 'R', 10, 'winger', look(SK.dark, 'curly', '#120d0a', { h: 1.06, w: 0.92 })),
    X('pedri', 'Pedri', 'PEDRI', 'ESP', '🇪🇸', 'Barcelona', 'modern', 86, 'R', 8, 'playmaker', look(SK.light, 'short', '#17100c', { w: 0.88 })),
    // icons
    X('kaka', 'Kaká', 'KAKÁ', 'BRA', '🇧🇷', 'AC Milan', 'legend', 92, 'R', 22, 'playmaker', look(SK.light, 'short', '#3a2a1c', { h: 1.05 })),
    X('pirlo', 'Andrea Pirlo', 'PIRLO', 'ITA', '🇮🇹', 'Juventus', 'legend', 90, 'R', 21, 'playmaker', look(SK.light, 'long', '#2a1e16', { beard: 'full', beardColor: '#2a1e16' })),
    X('totti', 'Francesco Totti', 'TOTTI', 'ITA', '🇮🇹', 'Roma', 'legend', 90, 'R', 10, 'striker', look(SK.light, 'short', '#c9a46a', { beard: 'stubble', beardColor: '#8a6a44' })),
    X('rooney', 'Wayne Rooney', 'ROONEY', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Manchester United', 'legend', 90, 'R', 10, 'striker', look(SK.fair, 'buzz', '#8a6a44', { h: 0.95, w: 1.1 })),
    X('zlatan', 'Zlatan Ibrahimović', 'ZLATAN', 'SWE', '🇸🇪', 'AC Milan', 'legend', 92, 'R', 11, 'target', look(SK.light, 'bun', '#17100c', { beard: 'stubble', beardColor: '#17100c', h: 1.14 })),
    X('drogba', 'Didier Drogba', 'DROGBA', 'CIV', '🇨🇮', 'Chelsea', 'legend', 90, 'R', 11, 'target', look(SK.deep, 'buzz', '#120d0a', { h: 1.08, w: 1.12 })),
    X('gerrard', 'Steven Gerrard', 'GERRARD', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Liverpool', 'legend', 90, 'R', 8, 'box2box', look(SK.fair, 'short', '#8a6a44', { h: 1.04 })),
    X('iniesta', 'Andrés Iniesta', 'INIESTA', 'ESP', '🇪🇸', 'Barcelona', 'legend', 91, 'R', 8, 'playmaker', look(SK.fair, 'balding', '#5a3a22', { w: 0.9 })),
    X('cantona', 'Eric Cantona', 'CANTONA', 'FRA', '🇫🇷', 'Manchester United', 'legend', 89, 'R', 7, 'striker', look(SK.light, 'short', '#17100c', { h: 1.07 })),
    X('vanbasten', 'Marco van Basten', 'VAN BASTEN', 'NED', '🇳🇱', 'AC Milan', 'legend', 93, 'R', 9, 'striker', look(SK.fair, 'mop', '#8a6a44', { h: 1.07 })),
    X('eusebio', 'Eusébio', 'EUSÉBIO', 'POR', '🇵🇹', 'Benfica', 'legend', 92, 'R', 10, 'striker', look(SK.deep, 'short', '#120d0a')),
    X('rivaldo', 'Rivaldo', 'RIVALDO', 'BRA', '🇧🇷', 'Barcelona', 'legend', 91, 'L', 10, 'winger', look(SK.tan, 'long', '#17100c', { h: 1.05, w: 0.92 })),
    X('parkjisung', 'Park Ji-sung', 'PARK', 'KOR', '🇰🇷', 'Manchester United', 'legend', 86, 'R', 13, 'box2box', look(SK.light, 'short', '#17100c', { h: 0.97 })),
  );

  ISO.PLAYERS.find((p) => p.id === 'son').attr.wf = 95;      // two-footed

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

  /* Optional professional sprite overrides.
     Map a player id to an image URL laid out exactly like the generated sheet
     (see ISO.Sprites.LAYOUT in sprites.js). Missing/broken images are ignored. */
  ISO.SPRITE_OVERRIDES = {};
})();
