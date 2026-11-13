# Technical architecture

Plain JavaScript, no bundler: files are loaded by `index.html` in order and share the global `ISO`. The same simulation files also load in Node (tools, server).

## Simulation (`js/game.js`, `js/ai.js`, `js/data.js`)

- Fixed step `C.STEP` = 1/120 s. The main loop and the online server feed it real time times `C.SPEED` (0.6).
- Seeded RNG: all randomness inside the simulation comes from the match seed, so two copies fed the same inputs stay identical. Never use `Math.random` or wall-clock time in `game.js`.
- Input contract: every button the simulation reads must be in `ZERO` (`js/game.js`); the online input packing uses it. A new button that is not in `ZERO` breaks prediction.
- Rule sets (Phase 4.1, `ISO.RULES` in `js/data.js`): `Game.create({ rules: 'street' })` sets `G.rules`, forces `G.walls`, and sets `G.win` and `G.limit`; the hooks read `RL(G)` (resolved per call, never cached on G) and are exactly neutral without it. `G.rules`, `G.limit`, `G.sudden` and `ball.wallHit` exist only when the rule set is on, and the `goal` event / `G.goals` entry gain `pts` only then. Offline only: `server/server.js` never passes `rules` (asserted in `server/test-integrity.js`). Tournaments (`js/cup.js`, pure) sit entirely outside the sim: bracket, seeded fixtures (`Cup.simMatch` runs the real sim headless, about 30-40 ms a fixture), the profile pays prizes (`recordCup`); `js/cup-ui.js` is the #cup screen.
- Training sandbox and custom drills (Phase 4.3 / 4.4): `Game.create({ solo: true, sand })` sets `G.sand` (clamped by `sandOpts`; team 1 defenders are updated and collided, `sandStep` ends a rep after 0.5 s of defender possession, `infStam`, keeper none / dummy, spot, ball, rain, turf); `Game.create({ solo: true, drill: 'custom', drillDef })` validates the spec with `ISO.DrillSpec.validate` and sets `G.drill.def` and `G.cust` (cones: `hitSeg` capsules with an optional radius; walls: `hitPanel`; `custPlayer` pushes you out of both). Both fields exist only when passed and are never passed online. Built-in drills are untouched.
- The simulation has no DOM and no rendering knowledge; rendering reads `G` and the events list.
- Ball physics config is `C.PHYS` (never serialised: AIR, MAGNUS, BOUNCE, SPIN, PASS, FRAME, WALL, BODY and the surface table `SURF[turf][dry|wet]`); the API is `ISO.Phys` (`surf`, `ballMotion`, `predict`, `passSpeed`, `rollDist`, `landT`, `hitSeg`, `height`, `mass`, `stumbleDur`). `G.turf` and `b.tsp` are ordinary snapshot state. Rule: resolve the surface with `surf(G)` on every call and never cache a row on G or the ball (a snapshot can change turf or wet underneath you). The server picks the turf (`'grass'`); clients adopt it from the snapshot.
- Adaptive difficulty and keeper styles (Phase 3 session 2): `ISO.AI.create(diff, { pers, lvl, adapt })`, `ISO.AI.Adapt` (pure level state kept in `P.adapt`), `ISO.keeperStyleOf(def)` read at call time in `updateKeeper` (neutral = exactly 1, never serialised, offline CPU games only). See `PHASE3_NOTES.md`.
- CPU opponent (`js/ai.js`, offline only): `ISO.AI.create(difficulty, { pers })` (pers from `ISO.AI.profileOf(def)`: one of seven archetypes as a table of knobs, neutral = the legacy brain; see `PHASE3_NOTES.md`) and `ISO.AI.update(G, player, ai, dt)` return the same input object a human produces.

## Rendering

- 2D: `js/render.js` draws a canvas from `G`; `js/smooth.js` interpolates between the last two simulation steps; `js/sprites.js` generates sprite sheets.
- 3D (`js/3d/`): `ISO.Smooth` -> `Adapter.snapshot` (a plain view frame in metres and radians; also latches events such as kicks and saves) -> `r3d.js` facade, which owns the Three.js scene and drives `player3d.js` (rigs), `ball3d.js`, `camera3d.js`, `stadium.js`, `fx3d.js`, `coords.js`. Every 3D helper is optional at runtime. The simulation is never modified by the 3D view.

### Camera rig (`js/3d/camrig.js`, `js/3d/camera3d.js`)

Match presentation (Phase 6.4): `js/pres.js` is pure (ratings, player of the match, goal lines, pips, match point, intro data, slow-mo scale; never writes G, tested by `tools/pres-test.js`); `js/pres-ui.js` is the DOM (intro, HUD extras, goal card, sting, end panel) driven by one-line hooks in main.js. The intro holds the sim through `App.introOn` (offline only); the goal slow-mo scales only the real-time pacing of `App.acc` in the 3D offline view, so the sim steps themselves are unchanged. The camera intro sweep is a post-pose offset in the camera3d shared tail, active only while `R3D.introP` is a number.

`camrig.js` is pure (no THREE) and holds the presets (chase, close, dynamic, broadcast, low, tactical), situational framing, the allocation-free frame / guard / blend / input maths and the stadium-derived limits. `camera3d.js` owns the state: the chase family runs the original body with preset numbers; side and fixed rigs take a `CamRig` frame around a ball-weighted anchor, pass it through the guard and define `st.yaw` from the frame so `mapInput` (keys read at `CamRig.inputPsi`) and the fx keep working. A shared tail blends from the previous pose on a preset or family change, then applies shake and lookAt. The penalty branch overrides every preset. `r3d.js` feeds settings (`cam3d`, `camZoom`, `camSens`, `camShake`, `camGoal`) when they change. Tested by `tools/cam-test.js`.

`stadium.js` builds the environment once per match from the 2D theme plus one row of its own table (`R3D.Stadium.FLAV`: sky, night, trees, weather and, since 6.3, `sunDir`, `crowd`, `roof`, `flags`, `tifo`, `flash`, `led`, `wave`). The sun's direction sets a shadow frustum fitted to the playable box in light space; flags and flashes are one instanced mesh and one `Points` each (shader-animated from `uT` / `uJump`, no per-frame CPU); the tifo banner is a row of the ad atlas; the crowd's `aSec` attribute makes each stand section sway at its own pace; `opts.turf` changes the pitch paint and `opts.kitCols` colours flags and banner (both passed by `r3d.js`). Budgets (+2 draw calls and +6000 triangles at quality 0, +0 at quality 2, no new lights or shadow casters, at most 400 new points) are tested by `tools/stadium-test.js` against `tools/stadium-baseline.json`.

## Animation pipeline (`js/3d/anim3d.js`, clips)

Per actor and frame: gait (run cycle with planned foot steps, `seedFeet` / `st.loco`) -> target (`target()` picks a clip: `clips-action.js` kicks, tackles, `clips-keeper.js` keeper clips, `clips-skill.js` skills; `kickReady` draws a first-time approach) -> filter (a critically damped offset per channel hides jumps between targets, with slew limits `SLEW` for headers) -> contact and IK (ground fit, leg IK `boneLeg`, kick and ball-touch IK) -> foot lock (a planted foot stays put; releases step to the clip's foot; plants from the gait are inherited on the first non-gait frame).

Pose channel layout (`js/3d/animkit.js`, `N = 40`): `RX LIFT RZ RYAW PITCH ROLL` (root), `PX PY PZ` (pelvis), `SX SY SZ` (spine), `CX CY CZ` (chest), `NX` (neck), `HX HY HZ` (head), `ARM_L`=19 and `ARM_R`=24 (five each: swing, abduct, twist, elbow, wrist), `LEG_L`=29 and `LEG_R`=34 (swing, abduct, toe out, knee, ankle), `GROUND`=39. Lateral channels are positive toward the character's right.

Quality is measured by `tools/anim-check.js` (A scripted clips, B stability, C CPU matches; thresholds `TH` are fixed) and ratcheted by `tools/anim-gate.js` against `tools/anim-baseline.json`.

## Networking (`js/net.js`, `js/online.js`, `server/server.js`)

The server steps the authoritative simulation and sends snapshots every 2 steps (36 per second). Clients run the same simulation: `ISO.Net.Predictor` applies local inputs at once and re-simulates from each server snapshot using the inputs the server reports (rollback and replay), so the local player answers immediately. Online matches are unranked and pay no credits. Bandwidth, delta snapshots and integrity work: protocol 3 (and 2) sends a keyframe then lossless deltas (v3: compact floats, tick-suppressed timers; 2v2 delta mean 950 to 802 B) (`ISO.Net.diff/patch`), cutting the offline stream from 130.7 to 22.3 KB/s (1v1) and 209.3 to 44.2 KB/s (2v2); permessage-deflate is optional (`WS_DEFLATE=1`). See `server/NETCODE_NOTES.md`. The `start` message carries `rev: ISO.SIM_REV` (js/data.js); a client with another revision shows a VERSION MISMATCH toast. Bump `SIM_REV` with any change that alters match results. A pick is `{ id, prime, skin, celeb }`; `celeb` is cosmetic and validated (`server/validate.js`), never part of the sim or snapshots.

## Persistence (`js/profile.js`)

Phase 4.3 / 4.4: `P.arena = { shots, goals, onTarget, byType, bestStreak }` (keyed on shape, `ISO.DrillSpec.normArena` in `migrate`, no schema bump) and `P.drills['custom:<id>']` (best and plays; at most 30 kept). Saved custom drills live in a separate `localStorage` key, `isofootball.drills.v1` (`ISO.DrillSpec.loadSlots / putSlot / delSlot`, 20 slots, every read validated), so a corrupt drill list can never touch the profile.

Phase 5.5 / 5.6 fields, keyed on shape with no schema bump (`ISO.Rivals.norm` through the wrapped `ISO.Career.norm`, `ISO.Collection.norm` in `migrate`): `career.rivals{id: {w,l,gf,ga,met}}`, `career.h2h{playerId: {w,l,gf,ga}}` (the most recent 40), `career.sn.boss` (`{ id, done, live, res }`, the season finale; live at reload counts as a forfeited loss), `career.kitCustom` (`{ a, b }` lowercase `#rrggbb` or null), `favs[]` (12), `sets{id: true}` (claimed sets), `dups{playerId: 1-3}`. 

One JSON profile (`schema: 5`: career objectives, training and reputation: `career.rep` (monotonic), `career.xp{programme}`, `career.trained{attr}` (raises the `setAttr` floor), `career.tokens` (0-2), `career.focus`, `career.traits` (unlocked trait ids), `career.obj` (`{ sk, md, ids[3], used{} }`, the drawn objectives), `career.streak`, `career.sn.tally`, `stats.objDone`; all keyed on shape and back-filled by `ISO.Career.norm` in `normCareer`; the pure rules are `js/career-obj.js` (tracker, objectives, training, reputation); `recordMatch` pays them only when the caller passes the tracker summary `r.m`; 4: career seasons: `career.seed` (uint32), `career.sn` (the season in progress: `{ i, n, field[7], md, res[], live }`), `career.hist`, `career.best`, `stats.seasonsWon`, `stats.promotions`; the league logic is the pure `js/career.js` (`ISO.Career`, `ISO.SEASONS`): every draw is a pure function of the seed, the other teams' results are derived, never stored; `career.stage` and `career.ladder` are frozen legacy fields; `normCareer()` in `migrate()` is keyed on shape; 3: tournaments `cup`, `cups`, `stats.cupWins`, `stats.streetWins`; `migrate()` in `load()` back-fills new keys and drops unknown ids) in browser localStorage: credits, celebrations (`celebs`, `celeb`), collection, Primes, skins, skill moves, maps, achievements, boxes, MyCareer, settings, key bindings. It is client side and not validated by the server.

## Data

Roster rows in `js/data.js` (attribute order `KEYS`), `ISO.VERSION` (menu label; README and index.html must agree, CI checks), player looks and kits.

Player individuality (Phase 2, all in `js/data.js`, no new file): `ISO.MODS` is the complete list of knobs the sim reads, each `[neutral, 'mul'|'add', lo, hi]` with hard caps; `ISO.ROLES` six playstyles (reusing the roster's `PROF` archetype keys; `ISO.PROF` is exported); `ISO.TRAITS` ten traits (`score`, `bias`, `mods`, UI `tag` and `desc`); `ISO.styleOf(def)` is the single resolver, cached in a WeakMap keyed on the def object, returning a frozen `{ role, traits, m, wfStars, celeb }`. The table is layered: neutral defaults, role mods, continuous body factors (look.h, str), trait mods, clamped to the caps. Traits and role are evaluated on `def.base || def`, so Prime and skins never change them; the 20 hand-authored stars use `ROLE_FIX` / `TRAIT_FIX`, everyone else is derived from the attributes (`ISO.roleOf`, `ISO.traitsOf`). The def is rebuilt from the catalogue on client and server and never serialised, so no state is added to the players, `G` or the ball, and `js/net.js` is untouched. `ISO.STYLE_OFF = true` returns the neutral table, which is bit-identical to the pre-Phase-2 sim (also gates the weak-foot pass/skill changes). `js/game.js` reads it through `sty(p)` (`ISO.styleOf(p.def).m`). Details: `PHASE2_NOTES.md`.

## Testing procedures

| What | Command |
| --- | --- |
| Syntax | `node --check <file>` on js/*.js, js/3d/*.js, server/*.js, tools/*.js |
| Rule invariants | `node tools/check.js 60` |
| CPU soak | `node tools/sim.js 40 normal` (`--turf=firm|lush|astro`, `--rain`) |
| Ball physics and body interactions | `node tools/test-physics.js` |
| Server, determinism, lag, crossplay, delta, integrity | `cd server && npm ci && for t in test*.js; do node $t; done` |
| Custom drills (validate fuzz, 200-drill soak, cone / wall collisions, share codes, slots) | `node tools/drill-test.js` |
| Animation ratchet | `node tools/anim-gate.js` (`--update` after an improvement) |
| Animation strict limits | `node tools/anim-check.js` (currently exits 1) |

Run the determinism and crossplay tests after touching `js/game.js`. Animation changes cannot be judged by eye headless: compare the validator's numbers, and look at them in a browser when possible (the lab pages `tools/lab-player.html` etc.). CI is `.github/workflows/ci.yml`.

## Animation notes
Foot lock (`anim3d.js`): `lkS` marks a lock let go for over-stretch until the clip lifts the foot; if it was let go on the frame it was taken no step ever clears it, so `lkC` hops the plant foot through level (7 cm x h) while the body moves faster than 0.5 m/s. The keeper hold fall (`clipGkHold`) runs on `st.clock` latched at hold entry, not on the step-quantised sim time.

## Audit (Phase 0.1)
Duplicate systems (listed, not refactored): `clamp` / `lerp` / `sm` are redefined in game.js, render.js, animkit.js, adapter.js, camera3d.js, ball3d.js and stadium.js. Two snapshot paths exist (v1 full, v2/v3 delta). 2D and 3D presentation are separate on purpose. The kick strike-spot logic is split between ball3d.js and clips-action.js, which was the source of the hold re-aim bug. The legacy `ISO.Net.apply(G, s, to, f)` interpolation had no callers and was removed.
Dead or unclear code: the no-op `- 0.0` in anim3d.js seedFeet was removed; `st.rdH` (read in the SLEW test, set in clips-action.js kickReady) is now declared in `st`. The Cinematic camera still has 8 references (render.js, main.js, meta-ui.js) and is reachable: drills default to it (the setting's option is gone). `js/config.js` is kept. `tools/gen-art.py` and `tools/lab-*.html` are developer tools only.
Outdated docs fixed: ROADMAP current-session paragraph and 0.2 numbers, HANDOFF next milestone, CHANGELOG netcode entry (it is 0.3/0.4), this animation paragraph.
Performance bottlenecks (named, not measured): anim3d `update` calls localToWorld / updateMatrixWorld many times per foot per actor; the server runs JSON.stringify and a diff per flush (one per protocol version now, not per seat; 36 Hz); the Predictor re-simulates after every snapshot; stadium.js and sprites.js are generated at load; anim-check takes about 35 s in CI.
Modularisation candidates (not done): game.js (about 1700 lines), the anim3d `update` closure, main.js and meta-ui.js, the tools/anim-check.js harness export.
