/* ISO FOOTBALL — validation of everything a client tells the server about itself (no listener, no side effects).
   Trust model: there are no accounts, so the server cannot know what a player owns; it only accepts what it can check:
   a known catalogue id, a real boolean for prime, a known skin, a known celebration (cosmetic, like skins), known move ids, and stats rebuilt on the server. */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const f of ['data', 'game', 'net']) require(path.join(ROOT, 'js', f + '.js'));
const ISO = globalThis.ISO;

const BAD_PLAYER = 'That player cannot be used online.';
const cleanName = (s) => String(s || 'Player').replace(/[^\w .-]/g, '').trim().slice(0, 14) || 'Player';

// -> { ok: true, pick: { id, prime, skin, celeb } } or { ok: false, msg }. Rebuilt here: nobody can send arbitrary stats.
function validatePick(p) {
  const id = p && typeof p === 'object' ? p.id : undefined;
  let base;
  if (id === undefined || id === null || id === '') base = ISO.PLAYERS[0];      // nothing chosen yet: the default player
  else if (typeof id !== 'string' || /^you/.test(id) || !(base = ISO.PLAYERS.find((d) => d.id === id))) return { ok: false, msg: BAD_PLAYER };
  return { ok: true, pick: { id: base.id, prime: !!p && p.prime === true, skin: ISO.skinById(p && p.skin).id, celeb: p && typeof p.celeb === 'string' && ISO.hasCeleb(p.celeb) ? p.celeb : 'signature' } };      // a celebration is cosmetic: an unknown id is the signature one, it never reaches the sim
}
const sanitizePick = (p) => { const r = validatePick(p); return r.ok ? r.pick : validatePick(null).pick; };

let FREE = null;
const FREE_MOVES = () => FREE || (FREE = Object.keys(ISO.Game.SKILLS).filter((id) => !(ISO.MOVE_COST[id] > 0)));
function sanitizeMoves(list) {          // a client that sends nothing valid gets only the free moves, never all of them
  if (!Array.isArray(list)) return new Set(FREE_MOVES());
  return new Set(list.filter((id) => typeof id === 'string' && ISO.Game.SKILLS[id]).concat(FREE_MOVES()));
}
const sanitizeSettings = ISO.Net.sanitizeSettings, settingsOpts = ISO.Net.settingsOpts;      // room settings: allow-lists live in js/net.js so the clients apply exactly the same
module.exports = { sanitizeSettings, settingsOpts, cleanName, validatePick, sanitizePick, sanitizeMoves, FREE_MOVES, BAD_PLAYER };
