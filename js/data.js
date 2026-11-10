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

  ISO.playerById = (id) => ISO.PLAYERS.find((p) => p.id === id);

  // Goalkeepers are AI-only. Ratings: reflexes, positioning, diving, handling, one-on-one.
  ISO.KEEPERS = [
    { name: 'Home GK', a: { ref: 84, pos: 83, div: 84, han: 81, ooo: 82 },
      look: { skin: '#e8bd95', hair: 'short', hairColor: '#3a2a1c', h: 1.08, w: 1.08 },
      kit: kit('#a78bfa', '#2e1f5e', 'solid', '#2e1f5e', '#a78bfa') },
    { name: 'Away GK', a: { ref: 83, pos: 84, div: 83, han: 82, ooo: 83 },
      look: { skin: '#9a6a44', hair: 'buzz', hairColor: '#17100c', beard: 'stubble', beardColor: '#17100c', h: 1.08, w: 1.08 },
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
