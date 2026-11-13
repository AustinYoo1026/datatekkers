/* ISO FOOTBALL — match presentation logic (roadmap 6.4). Pure: no DOM, no Math.random, never writes to G.
   Ratings, player of the match, goal lines, first-to-N pips, match point, the intro card's data and the goal slow-motion scale.
   The screens that show it are js/pres-ui.js. Presentation only: nothing here is read by the simulation. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10 > 3 ? 0 : n % 10]);
  const isMatch = (G) => !!G && !G.drill && !G.solo && Array.isArray(G.players) && !!G.stats;

  // One entry per player: { idx, team, rating (3.0..10, one decimal), goals }. Team statistics are shared by a team's players (2v2);
  // goals are per player (G.goals[].by). null for drills and one-player arenas.
  function rate(G) {
    if (!isMatch(G)) return null;
    const s = G.stats, tot = (s.poss[0] + s.poss[1]) || 0, goals = G.players.map(() => 0);
    for (const g of G.goals || []) if (!g.own && goals[g.by] !== undefined) goals[g.by] += 1;
    const win = G.winner;
    return G.players.map((p) => {
      const t = p.team, o = 1 - t, g = goals[p.idx];
      let r = 6.0;
      r += Math.min(3, 0.9 * g);
      r += Math.min(1, 0.2 * (s.onTarget[t] || 0));
      r -= 0.35 * (G.score[o] || 0);
      r += Math.min(1, 0.15 * (s.tackles[t] || 0));
      r += Math.min(0.5, 0.05 * (s.skills[t] || 0));
      r += Math.min(0.5, 0.1 * (s.clears[t] || 0));
      r += tot > 0 ? ((s.poss[t] / tot) * 100 - 50) / 100 : 0;
      if (win === t) r += 0.5;
      return { idx: p.idx, team: t, rating: Math.round(clamp(r, 3, 10) * 10) / 10, goals: g };
    });
  }

  // Player of the match: the highest rating; ties go to the winner, then more goals, then the lower index. null for drills.
  function potm(G) {
    const r = rate(G);
    if (!r || !r.length) return null;
    let best = null;
    for (const e of r) {
      if (!best) { best = e; continue; }
      if (e.rating !== best.rating) { if (e.rating > best.rating) best = e; continue; }
      const ew = e.team === G.winner, bw = best.team === G.winner;
      if (ew !== bw) { if (ew) best = e; continue; }
      if (e.goals > best.goals) best = e;
    }
    return best;
  }

  const clock = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  // Every goal in order: { team, by, n (that scorer's nth goal), time (seconds), clock, pts, score: [home, away] after it }
  function goalLines(G) {
    if (!G || !Array.isArray(G.goals)) return [];
    const sc = [0, 0], nth = {}, out = [];
    for (const g of G.goals) {
      const pts = g.pts || 1;
      sc[g.team] += pts; nth[g.by] = (nth[g.by] || 0) + 1;
      out.push({ team: g.team, by: g.by, n: nth[g.by], time: g.time, clock: clock(g.time), pts, score: sc.slice() });
    }
    return out;
  }

  // First-to-N pips: { win, filled: [a, b] } (capped at win), or null when there is nothing to count (drills, G.win > 5).
  function pips(G) {
    if (!isMatch(G) || !(G.win > 0) || G.win > 5) return null;
    return { win: G.win, filled: [Math.min(G.win, G.score[0]), Math.min(G.win, G.score[1])] };
  }

  // The team one goal from winning (so the next goal ends it): 0, 1, or -1 (nobody, both, or not applicable).
  function matchPoint(G) {
    if (!isMatch(G) || !(G.win > 0) || G.win > 5 || G.winner >= 0 || G.phase === 'end') return -1;
    const a = G.score[0] === G.win - 1, b = G.score[1] === G.win - 1;
    return a && !b ? 0 : b && !a ? 1 : -1;
  }

  // Sim-time scale for the goal slow-motion: 0.35 during the first 0.22 sim-seconds of a goal phase, else 1.
  function timeScale(G, on) {
    if (!on || !G || G.phase !== 'goal' || G.drill || !(G.goalDur > 0)) return 1;
    return G.goalDur - G.phaseT < 0.22 ? 0.35 : 1;
  }

  // The intro card's data. a = { mode, defs [home, away], win, rules, weather, turf, mapName, cupName, round, careerLine, persOf(def) -> name|null, celebName(def) -> text|null }
  const MODE_TITLE = { cpu: 'QUICK MATCH', career: 'MYCAREER', cup: 'CUP', online: 'ONLINE' };
  function intro(a) {
    a = a || {};
    const defs = a.defs || [], title = a.rules === 'street' ? (a.mode === 'cup' ? 'STREET CUP' : 'STREET FOOTBALL') : a.mode === 'cup' && a.cupName ? a.cupName : MODE_TITLE[a.mode] || 'MATCH';
    const sub = a.mode === 'cup' && a.round ? a.round : a.mode === 'career' && a.careerLine ? a.careerLine : '';
    const env = [a.mapName, a.weather === 'rain' ? 'RAIN' : '', a.turf && a.turf !== 'grass' ? String(a.turf).toUpperCase() : ''].filter(Boolean);
    const sides = [0, 1].map((i) => {
      const d = defs[i];
      if (!d) return null;
      const st = ISO.styleOf ? ISO.styleOf(d) : { role: 'none', traits: [], wfStars: 3 };
      const chips = [];
      if (st.role && st.role !== 'none') chips.push({ k: 'role', t: String(st.role).toUpperCase() });
      for (const t of st.traits || []) chips.push({ k: 'trait', t: (ISO.TRAITS && ISO.TRAITS[t] ? ISO.TRAITS[t].tag : String(t).toUpperCase()) });
      chips.push({ k: 'wf', t: 'WEAK FOOT ' + '★'.repeat(st.wfStars || 0) + '☆'.repeat(5 - (st.wfStars || 0)) });
      const ce = a.celebName ? a.celebName(d) : null;
      if (ce) chips.push({ k: 'celeb', t: String(ce).toUpperCase() });
      const pers = i === 1 && a.persOf ? a.persOf(d) : null;
      if (pers) chips.push({ k: 'ai', t: 'CPU: ' + String(pers).toUpperCase() });
      return { name: d.short || d.name, ovr: d.ovr, flag: d.flag, club: d.club, chips };
    });
    return { title, sub, env: env.join(' · '), first: a.win > 0 && a.win < 1000 ? 'FIRST TO ' + a.win : '', sides };
  }

  ISO.Pres = { rate, potm, goalLines, pips, matchPoint, timeScale, intro, clock, ORD, isMatch };
})();
