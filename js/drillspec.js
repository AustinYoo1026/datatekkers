/* ISO FOOTBALL — custom drill spec (Phase 4.4). Pure data and validation, no DOM, no sim: node-loadable.
   A drill is plain JSON. validate(obj) returns a clamped, normalised COPY or null (never the input, never throws). Everything that
   reaches the sim (Game.create opts.drillDef), the save slots or an imported share code goes through it.

   Schema v1 (sim units: x runs towards the goal at x = FW = 340, y across 0..720, the goal mouth is y 285..435):
   { v: 1, id, name, total 1-20, time 3-30,
     start: { x, y, jx, jy }            your spot and the random spread (+- jx, +- jy) of it each rep
     keeper: { mode: 'live'|'dummy'|'none', x, y, nerf }
     defenders (<= 4): [{ x, y, mode: 'static', face }]
     cones (<= 12): [{ x, y, r }]       r 4-14
     walls (<= 6): [{ x0, y0, x1, y1, h }]   h 10-80 (the ball clears a wall higher than h)
     targets (<= 4): [0-3]              lit zones in the goal mouth (0 top left, 1 top right, 2 bottom left, 3 bottom right)
     score: { goal 1-5, bull 1-5, types: { normal|power|finesse|chip: 0-5 } } }   types replace a goal's worth (0: that shot type does not count)
   Rejects (null): not an object, wrong version, a numeric field that is present but not a finite number, a bad id, any object overlapping your start. */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  const FW = 340, FH = 720, GY0 = 285, GY1 = 435, BOXD = 190, BOXY0 = 110, BOXY1 = 610;
  const LIM = { cones: 12, walls: 6, defenders: 4, targets: 4, slots: 20, code: 8000 };
  const TYPES = ['normal', 'power', 'finesse', 'chip'];
  const CLEAR = 34;      // nothing may sit within this of your start (the player, the ball a step ahead and the first touch)
  const num = (v, a, b, d) => {      // undefined -> default; anything else must be a finite number (clamped); NaN, strings, objects -> undefined (reject)
    if (v === undefined || v === null) return d;
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    return Math.round(Math.min(b, Math.max(a, v))) + 0;
  };
  const arr = (v, max) => (v === undefined || v === null ? [] : Array.isArray(v) ? v.slice(0, max) : undefined);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
  const wrap = (f) => (typeof f === 'number' && Number.isFinite(f) ? Math.round(((f + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) * 100 - Math.PI * 100) / 100 + 0 : undefined);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function segDist(px, py, x0, y0, x1, y1) {
    const ex = x1 - x0, ey = y1 - y0, l2 = ex * ex + ey * ey, t = l2 > 0 ? Math.min(1, Math.max(0, ((px - x0) * ex + (py - y0) * ey) / l2)) : 0;
    return dist(px, py, x0 + ex * t, y0 + ey * t);
  }

  function validate(o) {
    try {
      o = obj(o); if (!o) return null;
      if (o.v !== 1) return null;
      const id = typeof o.id === 'string' ? o.id : '';
      if (!/^[a-z0-9_-]{1,24}$/.test(id)) return null;
      const name = (typeof o.name === 'string' ? o.name : 'MY DRILL').replace(/[^A-Za-z0-9 !?.+&'-]/g, '').trim().slice(0, 24).toUpperCase() || 'MY DRILL';
      const total = num(o.total, 1, 20, 5), time = num(o.time, 3, 30, 10);
      const so = o.start === undefined ? {} : obj(o.start), ko = o.keeper === undefined ? {} : obj(o.keeper), sc = o.score === undefined ? {} : obj(o.score);
      if (!so || !ko || !sc || total === undefined || time === undefined) return null;
      const start = { x: num(so.x, 40, FW - 70, 200), y: num(so.y, 60, FH - 60, 360), jx: num(so.jx, 0, 80, 0), jy: num(so.jy, 0, 200, 0) };
      if (Object.values(start).some((v) => v === undefined)) return null;
      const mode = ko.mode === 'dummy' || ko.mode === 'none' ? ko.mode : 'live';
      if (ko.mode !== undefined && ko.mode !== 'live' && mode === 'live') return null;
      const keeper = { mode, x: num(ko.x, FW - BOXD + 10, FW - 8, FW - 16), y: num(ko.y, BOXY0 + 10, BOXY1 - 10, 360), nerf: num(ko.nerf, -10, 30, 0) };
      if (Object.values(keeper).some((v) => v === undefined)) return null;
      const D = arr(o.defenders, LIM.defenders), Cn = arr(o.cones, LIM.cones), W = arr(o.walls, LIM.walls), T = arr(o.targets, LIM.targets);
      if (!D || !Cn || !W || !T) return null;
      const defenders = [], cones = [], walls = [], targets = [];
      for (const d of D) {
        const e = obj(d); if (!e) return null;
        const x = num(e.x, 20, FW - 30, 250), y = num(e.y, 20, FH - 20, 360), face = wrap(e.face === undefined ? Math.PI : e.face);
        if (x === undefined || y === undefined || face === undefined) return null;
        defenders.push({ x, y, mode: 'static', face });
      }
      for (const c of Cn) {
        const e = obj(c); if (!e) return null;
        const x = num(e.x, 20, FW - 20, 250), y = num(e.y, 20, FH - 20, 360), r = num(e.r, 4, 14, 8);
        if (x === undefined || y === undefined || r === undefined) return null;
        cones.push({ x, y, r });
      }
      for (const w of W) {
        const e = obj(w); if (!e) return null;
        const x0 = num(e.x0, 20, FW - 20, 200), y0 = num(e.y0, 20, FH - 20, 300), x1 = num(e.x1, 20, FW - 20, 200), y1 = num(e.y1, 20, FH - 20, 420), h = num(e.h, 10, 80, 40);
        if ([x0, y0, x1, y1, h].some((v) => v === undefined)) return null;
        if (dist(x0, y0, x1, y1) < 8) continue;      // a wall shorter than a ball is dropped
        walls.push({ x0, y0, x1, y1, h });
      }
      for (const t of T) { if (typeof t !== 'number' || !Number.isFinite(t)) return null; const i = Math.min(3, Math.max(0, Math.round(t))); if (!targets.includes(i)) targets.push(i); }
      targets.sort((a, b) => a - b);
      const goal = num(sc.goal, 1, 5, 1), bull = num(sc.bull, 1, 5, 3), to = sc.types === undefined ? {} : obj(sc.types);
      if (goal === undefined || bull === undefined || !to) return null;
      const types = {};
      for (const k of TYPES) if (Object.prototype.hasOwnProperty.call(to, k)) { const v = num(to[k], 0, 5, undefined); if (v === undefined) return null; types[k] = v; }
      // nothing on your start: the player, and the ball one step ahead
      const sx = start.x, sy = start.y;
      for (const c of cones) if (dist(c.x, c.y, sx, sy) < CLEAR + c.r || dist(c.x, c.y, sx + 12, sy) < CLEAR - 10 + c.r) return null;
      for (const d of defenders) if (dist(d.x, d.y, sx, sy) < CLEAR + 12) return null;
      for (const w of walls) if (segDist(sx, sy, w.x0, w.y0, w.x1, w.y1) < CLEAR + 3 || segDist(sx + 12, sy, w.x0, w.y0, w.x1, w.y1) < CLEAR - 7) return null;
      if (keeper.mode !== 'none' && dist(keeper.x, keeper.y, sx, sy) < CLEAR + 12) return null;
      // the jitter box must not reach a cone or a defender either
      for (const c of cones) if (Math.abs(c.x - sx) < start.jx + CLEAR + c.r && Math.abs(c.y - sy) < start.jy + CLEAR + c.r) return null;
      for (const d of defenders) if (Math.abs(d.x - sx) < start.jx + CLEAR + 12 && Math.abs(d.y - sy) < start.jy + CLEAR + 12) return null;
      for (const w of walls) {
        const nearJ = (px, py) => Math.abs(px - sx) < start.jx + CLEAR + 3 && Math.abs(py - sy) < start.jy + CLEAR + 3;
        for (let i = 0; i <= 8; i++) if (nearJ(w.x0 + (w.x1 - w.x0) * i / 8, w.y0 + (w.y1 - w.y0) * i / 8)) return null;
      }
      return { v: 1, id, name, total, time, start, keeper, defenders, cones, walls, targets, score: { goal, bull, types } };
    } catch (e) { return null; }
  }

  // a starter drill: you at the top of the box, a dummy keeper, nothing else
  const blank = (id) => validate({ v: 1, id: id || 'drill', name: 'MY DRILL', total: 5, time: 10, start: { x: 200, y: 360, jx: 0, jy: 0 }, keeper: { mode: 'live', x: FW - 16, y: 360, nerf: 0 }, defenders: [], cones: [], walls: [], targets: [], score: { goal: 1, bull: 3, types: {} } });

  // share code: 'ISOD1:' + base64(JSON). Decoding always ends in validate().
  const b64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))));
  const unb64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))));
  function toCode(spec) { const v = validate(spec); return v ? 'ISOD1:' + b64(JSON.stringify(v)) : ''; }
  function fromCode(code) {
    try {
      if (typeof code !== 'string') return null;
      const c = code.replace(/\s+/g, '');
      if (c.length > LIM.code || !c.startsWith('ISOD1:')) return null;
      const body = c.slice(6);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) return null;
      return validate(JSON.parse(unb64(body)));
    } catch (e) { return null; }
  }
  // the most one run can score (the HUD's "out of")
  const maxPoints = (d) => d.total * Math.max(d.score.goal, d.score.bull, ...Object.values(d.score.types));
  // credits for one run of an authored drill: low and capped so a drill built to be farmed (a keeper-less point-blank goal) pays nothing much: 1 CR a point, never more than CAP a run
  const CR_PER_POINT = 1, CR_CAP = 8;
  const credits = (points) => Math.min(CR_CAP, Math.max(0, Math.round(points * CR_PER_POINT)));

  // save slots: a SEPARATE localStorage key from the profile, at most LIM.slots drills; every read goes through validate and every access is guarded.
  // `ls` is a Storage or a function returning one (the browser passes () => window.localStorage, which can throw).
  const KEY = 'isofootball.drills.v1';
  const store = (ls) => { try { return typeof ls === 'function' ? ls() : ls; } catch (e) { return null; } };
  function loadSlots(ls) {
    try {
      const st = store(ls), raw = st && st.getItem(KEY);
      if (typeof raw !== 'string' || raw.length > 400000) return [];
      const a = JSON.parse(raw), out = [], seen = {};
      if (!Array.isArray(a)) return [];
      for (const x of a.slice(0, LIM.slots)) { const v = validate(x); if (v && !seen[v.id]) { seen[v.id] = 1; out.push(v); } }
      return out;
    } catch (e) { return []; }
  }
  function writeSlots(ls, list) { try { const st = store(ls); if (!st) return false; st.setItem(KEY, JSON.stringify(list.slice(0, LIM.slots))); return true; } catch (e) { return false; } }
  // { ok, reason, slots }: replaces a drill with the same id, else takes a free slot
  function putSlot(ls, spec) {
    const v = validate(spec); if (!v) return { ok: false, reason: 'invalid', slots: loadSlots(ls) };
    const list = loadSlots(ls), i = list.findIndex((d) => d.id === v.id);
    if (i >= 0) list[i] = v; else if (list.length >= LIM.slots) return { ok: false, reason: 'full', slots: list }; else list.push(v);
    return writeSlots(ls, list) ? { ok: true, slots: list } : { ok: false, reason: 'storage', slots: list };
  }
  function delSlot(ls, id) { const list = loadSlots(ls).filter((d) => d.id !== id); writeSlots(ls, list); return list; }

  // Testing Arena accuracy (Phase 4.3): { shots, goals, onTarget, byType: { type: { s, g } }, bestStreak }; back-filled by shape, every field clamped
  const BIG = 1e7, ti = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(BIG, Math.max(0, Math.floor(v))) : 0);
  function normArena(a) {
    const o = { shots: 0, goals: 0, onTarget: 0, byType: {}, bestStreak: 0 };
    if (!a || typeof a !== 'object') return o;
    o.shots = ti(a.shots); o.goals = Math.min(o.shots, ti(a.goals)); o.onTarget = Math.min(o.shots, ti(a.onTarget)); o.bestStreak = Math.min(o.goals, ti(a.bestStreak));
    const bt = a.byType && typeof a.byType === 'object' && !Array.isArray(a.byType) ? a.byType : {};
    for (const k of ['normal', 'power', 'finesse', 'chip', 'first-time']) { const e = bt[k]; if (e && typeof e === 'object') { const s = ti(e.s); if (s) o.byType[k] = { s, g: Math.min(s, ti(e.g)) }; } }
    return o;
  }
  // fold a session tally (same shape) into the all-time record
  function addArena(a, t) {
    const o = normArena(a), n = normArena(t);
    o.shots = Math.min(BIG, o.shots + n.shots); o.goals += n.goals; o.onTarget += n.onTarget; o.bestStreak = Math.max(o.bestStreak, n.bestStreak);
    for (const k of Object.keys(n.byType)) { const e = o.byType[k] = o.byType[k] || { s: 0, g: 0 }; e.s += n.byType[k].s; e.g += n.byType[k].g; }
    return normArena(o);
  }

  ISO.DrillSpec = { normArena, addArena, KEY, loadSlots, putSlot, delSlot, validate, blank, toCode, fromCode, maxPoints, credits, LIM, TYPES, CLEAR, CR_CAP, CR_PER_POINT, FW, FH, GY0, GY1, BOXD, BOXY0, BOXY1 };
  if (typeof module !== 'undefined') module.exports = ISO.DrillSpec;
})();
