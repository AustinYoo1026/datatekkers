# Phase 2 session 1: player individuality (2.2 traits and playstyles, 2.3 movement profiles, 2.4 weak foot)

Skipped by the user: 2.1 (signature animations), 1.5 (match situations), and 2.5 was not part of the session. No version bump (CI ties `ISO.VERSION` to README and index.html).

## Architecture

Everything is data in `js/data.js`, read through one cached resolver. No new file, no new state.

- `ISO.MODS = { key: [neutral, 'mul' | 'add', lo, hi] }` is the complete list of knobs the sim reads, with hard caps.
- `ISO.ROLES`: six playstyles that reuse the roster's `PROF` archetype keys (`winger`, `striker`, `playmaker`, `target`, `box2box`, `defender`), each `{ name, mods }`. Display names: Winger, Poacher, Playmaker, Target Man, Engine, Stopper.
- `ISO.TRAITS`: ten entries `{ id, name, tag, desc, score(a, def), bias, mods }`.
- `ISO.styleOf(def)` returns a frozen `{ role, traits, m, wfStars, celeb }` cached in a `WeakMap` keyed on the def object. `m` is the full MODS table: neutral defaults, then role mods, then body factors (continuous, from `look.h`, `str`), then trait mods, clamped to the caps. `celeb` is a reserved tag for roadmap 2.5 (unused).
- Role: `def.role` (the generated players store their archetype via `P(..., role)`), else `ROLE_FIX[id]` for the 20 hand-authored stars, else the nearest `PROF` offset signature (covers a career player or any unknown def).
- Traits: explicit `def.traits` array (tests), else `TRAIT_FIX[id]` (the 20 stars), else derived: `s = score - bias`, qualifies if `s >= 90` or (`s >= ovr + 1.5` and `s >= 60`), ranked by `s - ovr`, two slots (three at ovr 85+), always at least one. Always evaluated on `def.base || def`, so Prime and skins never change traits or role.
- Why keyed on the def: nothing is serialised (the def is rebuilt from the catalogue on both ends, `server.js defOf`), `js/net.js` is untouched, `setDef` (penalty takers) works, and the `{...me}` copy `js/ai.js` passes to `resolveStrike` still resolves.
- `ISO.STYLE_OFF = true` (checked before the cache) returns the neutral table. Neutral is bit-identical to the pre-Phase-2 sim: multiplicative hooks multiply by exactly 1, additive hooks only move thresholds. The weak-foot pass and skill changes are also gated by it. `STYLE=off node tools/sim.js` / `tools/check.js` use it.

## Knobs and where the sim reads them (`js/game.js`)

`const sty = (p) => ISO.styleOf(p.def).m;` plus `weakSide(p, sign)` (the rule of `resolveStrike`'s `weakRaw`).

| Key (range) | Hook |
| --- | --- |
| `top` 0.97-1.03 | `makePlayer`, `setDef`: `topSpeed(a) * m.top` |
| `accLo`, `accHi` 0.88-1.12 | main rate line `* lerp(accLo, accHi, spd/top)` (off the mark vs late) |
| `cut` 0.88-1.15 | the `1.15 + 0.35*q(agi)` direction-change term |
| `turn`, `turnBall` 0.9-1.15 | facing turn rate (`turnBall` only with the ball) |
| `stop` 0.8-1.2 | no-input deceleration `15 * m.stop` |
| `lat` 1-1.04 | max speed when `|my| > 0.8` |
| `fwd` 1-1.12 | rate when attacking without the ball and `mx*dir > 0.7` |
| `stride` 0.9-1.12 | `runPh` stride length (`C.STRIDE * m.stride`) |
| `dribLead` 0.8-1.1, `dribPull` 0.9-1.15 | `updateBall` touch lead and pull |
| `firstStep`, `burst` (Quick Step) | rate below 0.5 jog; the stop-and-go burst speed |
| `wobble`, `heavy` (Technical, Press Resistant) | pressured touch raggedness; first-touch heaviness |
| `finErr`, `finSpin` (Finesse) | finesse spread; spin (then clamped to +-1) |
| `headV`, `headErr`, `headReach` (Power Header) | header and dive-header pace, spread, +3 px reach in `resolveStrike` |
| `volErr`, `volZ`, `diveRec` (Acrobatic) | volley spread, volley ceiling +3, dive-header recovery |
| `longErr`, `longV` (Long Shot) | `lerp(1, m, far)` on spread and pace |
| `pressErr`, `jostleV` (Press Resistant) | pressure and jostle penalties on shot error, jostle speed (0.85 base) |
| `stamDrain`, `stamRegen`, `tired` (Relentless) | sprint drain, regen, the low-stamina speed floor |
| `recT`, `stumT`, `blockP` (Quick Reflexes, outfield only) | tackle recovery, stumble duration inside `stumble()` (not `stumbleDur`: `test-physics.js` tests that directly), `autoBlock` chance |
| `skCost`, `botch`, `readRate`, `fakeSell` (Trickster) | skill stamina, botch chance, `tickFocus` read rate; `fakeSell` is read by `js/ai.js` only |

Weak foot (2.4): `ISO.wfStars` thresholds 92/84/74/62 give 5/4/3/2/1 stars (the planned 90/80/68/55 gave no spread). A pass that crosses the body onto the weak foot: error `x(1 + 0.6(1-wf))`, pace `x(0.93 + 0.07 wf)`. A skill move whose side is the weak side: botch `+0.03(1-wf)`, exit pace `x(0.94 + 0.06 wf)` (derived from `s.sd` in `updateSkill`, nothing stored). Shots keep their existing weak-foot numbers. `kick` events gain `weak` (and `foot` on passes); there is no new event type, so no `OWN` table change.

## CPU (`js/ai.js`, offline only)

Reads its own traits and the opponent's `fakeSell`: weak-foot aim bias to the strong side when `q(wf) < 0.5` (probability scaled by `D.smart`); Long Shot Taker range +20; Finesse +0.2 finesse-key chance; Trickster skillP x1.4; Quick Step stop-and-go x1.5; Relentless sprint threshold 14 (was 22); Press Resistant shield re-arm 1.6 s (was 2.5); the fake-sell term on the foolP rolls. Everything is neutral (and consumes the same RNG) when `ISO.STYLE_OFF`.

## UI

Select panel: `STYLE <role>` chip, `WEAK FOOT` stars, one `.chip.trait` per trait (title = description). Store hero: style, weak foot and the trait list with the description as visible text. Pack reveal: trait tags. 2D (`js/render.js`) and 3D (`js/3d/fx3d.js`): floating `WEAK FOOT` label on a weak-foot kick. `css/style.css`: `.chip.trait`, `.traits`.

## Trait coverage (141-player roster, per-trait `bias` tuned)

technical 37, finesse 38, quickstep 37, header 38, longshot 38, relentless 35, press 34, trickster 33, acrobat 22, reflex 18 (13% to 27%; asserted 8-35% in `tools/check.js`). Biases: technical 1.5, header 5, longshot 1.25, press 1.25, relentless 2.25, reflex -2, others 0. Roles: playmaker 38, striker 42, winger 24, target 11, box2box 16, defender 10. Trait count per player: 1 trait 34, 2 traits 25, 3 traits 82 (many roster players are 85+).

## Measured effects (`tools/check.js`, same seed, identical attributes)

Trait on / trait off: finesse spread 0.85, long shot spread 0.90 (at 400 px), press spread 0.95 (opponent at 30 px), volley spread 0.85, header speed 1.08, header spread 0.85, Quick Step time to half jog 0.875, Relentless stamina lost over a 3 s sprint 0.85, Technical ball-distance spread under pressure 0.955, Quick Reflexes tackle recovery 0.971 and stumble time 0.85, Trickster stamina cost 0.80 and botches at low stamina 0.64. Reach: Power Header takes a ball 28 px away as a header, Acrobatic a z 22 ball as a volley (the others do not). Roles: top-speed spread 2.4% (cap 3%); 180-degree turn winger < target and playmaker < target; 0-to-30% of top speed winger < box2box < target and striker < box2box; stop distance defender < box2box < target. Weak foot 1 star vs 5 star clones: weak-side pass error ratio 1.55, pass speed ratio 0.936, strong side bit-equal, `kick.weak` and `foot` set, weak-side skill moves differ and strong side is bit-equal.

## Balance

CPU-vs-CPU soak (150 normal matches): before 587 goals / 2779 shots / 1.04 min; with styles 609 goals / 3002 shots / 1.08 min (40-match and 150-match runs move about 10% on noise alone). With `STYLE=off`, `tools/sim.js` (40 and 150), and `tools/check.js 60` are byte-identical to the pre-Phase-2 output.

`node tools/balance.js [bases] [difficulty]`: mirrored matches, one base character on both sides, one with a single trait and one with none, both sides and both kickoffs (4 matches per base). Holder win rate (200 bases = 800 matches per trait): quickstep 48.4%, technical 50.4%, finesse 52.5%, header 54.5%, acrobat 54.8%, longshot 51.7%, press 53.6%, relentless 51.9%, reflex 54.9%, trickster 52.8%. A trait is flagged only if its 95% interval (+-1.96 SE, about +-3.5 points) misses the 50-58% band; none is. No trait needed its mods halved. Quick Step (48.4%) is inside noise of 50 but is the one to look at first. Tuning done during the session: Long Shot Taker first measured 46-47% because the CPU range bonus of +40 px made it shoot from where goals are rare; the CPU bonus is now +20 (51.7%). CI runs `node tools/balance.js --smoke` (6 matches).

## Multiplayer classification

- Traits, movement profiles and weak foot: fully supported. All inputs are the catalogue def and the same sim code, and nothing is stored or sent, so a client and the server agree as long as they run the same build. There is still no sim-version handshake (design call from Phase 1, not done), so a stale client would desync, as for any sim change. Prediction, rollback and the delta snapshots carry no new fields. `server/test-integrity.js` checks that a pick cannot inject `traits` / `role` / `m` and that `styleOf(defOf(pick))` equals the catalogue's.
- CPU awareness of traits and the weak foot: offline only (the server has no CPU).
- Drills: traits apply by design (a drill is the player's own character).
- Online Primes and skins remain cosmetic claims; they never change traits or role.

## Animation gate

`node tools/anim-gate.js` before: baseline A 302 / B 0 / C 122, excess 346.3 / 185.4. After the first run: A 311, B 1, C 123, excess 355.7 / 184.2: the single B fail was `backpedal pelvisSnap 0.801 > 0.8`, caused by the gate's subject (Lautaro, now a Poacher) running 0.5% faster through the Poacher `top` factor. The Poacher `top` factor was removed (striker speed comes from `fwd` and `accLo` instead; role top-speed spread still 2.4% between Winger and Target Man). Then A 308, B 0, C 111, excess 352.1 / 169.5: A is 6 over and excess +1.7%, C improved. The worsening comes from the sim changes (the subject's `top`, `stride`, `accLo` and `cut` now differ from the neutral player the clips were tuned on, and `runPh` advances at `C.STRIDE * m.stride` so footfall pacing against ground speed moved), not from animation code; `anim3d.js` and `TH` in `tools/anim-check.js` are untouched. Baseline updated with `node tools/anim-gate.js --update` to A 308 / B 0 / C 111, excess 352.1 / 169.5. The 3D stride length in `anim3d.js` is derived from `runPh` and `C.STRIDE` (not `m.stride`), so tall or short players can slide their feet by up to the stride factor (+-10%) in 3D: a visual check in a browser is needed.

## Not done / follow-ups

- No 3D weak-foot animation (kick clips use the resolved foot already present in `kickFoot`); the 3D stride length does not follow `m.stride` (the animation derives foot cycle from `runPh`, which does).
- The `celeb` tag is unused (2.5).
- No play-test by a person: all numbers are from the CPU harness. Quick Step is the weakest trait in the mirrored matches.
- A drill-only A/B for traits, and per-trait 3D effects, are not done.

# Phase 2 session 2: 2.5 signature celebrations, save schema 2, sim revision handshake

Presentation only. The sim state `celebrate`, `G.goalDur` and every timing are untouched; clips run on `p.stT` (already synced). `tools/sim.js 40 normal` is byte-identical with and without the new data; `tools/check.js` asserts a celebrated def leaves 900 sim steps unchanged.

## Celebrations

- `js/data.js`: `ISO.CELEBS` (8 entries `{ id, name, cost, dur, loop, cam: { D, H, yaw }, desc }`: fist 0 (free, the original clip), arms 300, point 300, salute 500, sit 600, robot 700, knee 900, spin 1500), `ISO.celebById`, `ISO.hasCeleb` (prototype-free table: `constructor` and `__proto__` are not ids), `ISO.CELEB_SIG` (the meta id `signature`, not in CELEBS), `CELEB_FIX` for the 20 stars, `ROLE_CELEB` (winger knee, striker fist, playmaker point, target arms, box2box salute, defender robot), 'fist' for anything unknown. `ISO.styleOf(def).celeb` (the reserved tag) is now the signature; `ISO.celebOf(def)` returns `def.celeb` if it is a known bought id, else the signature. `ISO.outfit(d, prime, skin, celeb)` clones when a known non-`signature` celeb is given (`o.celeb`), and returns `d` itself otherwise (so the default path and all old three-argument calls are unchanged).
- 3D: `clips-action.js` has `CELEB_CLIPS[id] = { clip, post }` and `clipCelebrate` dispatches on `st.celeb` (set from `actor.celeb`, which `player3d.js setSpec` fills from `ISO.celebOf(def)`, next to `actor.foot`); in place, no root travel; `fist` is the unchanged original clip (the anim gate's own celebrate row is unchanged). Spin Leap uses a continuous yaw (turn count added, no unwinding). `adapter.js` sets `vf.celebCam` from the first celebrating player; `camera3d.js` goal mode reads D, H and extra yaw from it (default 6.5 / 2.6 / 0.35 as before).
- 2D: `CELEB_2D[id](T, t)` in `playerPose` (`render.js`); sprite-sheet players (`drawSheet`) keep their default celebrate frames.
- Store: Celebrations tab (`index.html`, `meta-ui.js storeCelebs`), buy and equip, a Signature card, help text in the store and in the Controls screen. `profile.js`: `celebs: []`, `celeb: 'signature'` (global like the ball), `buyCeleb`, `equipCeleb`, `ownsCeleb`, `celebOf`; `Profile.outfit` and the career player (`main.js`) pass it. Admin "max all" grants all.
- Deviations: the roadmap example "backflip" became **Spin Leap** (a root pitch of 360 degrees pivots about the ground point and sends the head through the turf or needs a lift above the 0.7 m jump limit); "knee slide" became **Knee Drop** (in place, deep squat leaned back; a real slide needs root travel, which was ruled out). "Sit Down" is a deep squat with folded arms.
- Anim gate: seven new scripted rows (`celebrate:arms`, `:point`, `:salute`, `:robot`, `:sit`, `:knee`, `:spin`, in `tools/anim-check.js`, `TH` untouched). All pass the strict thresholds (robot needed a gentler snap and an elbow floor first). `node tools/anim-gate.js`: A 308 / B 0 / C 111, excess 352.1 / 169.5, equal to the baseline (no update needed). Nothing was looked at in a browser: ground contact (skate, scrape, airtime, legs) is clean in the validator only.

## Save compatibility (schema 2)

`fresh()` has `schema: 2`; `migrate()` in `load()` (exported with `SCHEMA`) runs after the key back-fill: `celebs` must be an array of known, priced, unique ids (unknown ids are dropped as for maps), `celeb` must be `signature` or an owned/free known id else `signature`, `career.foot` must be `L` or `R`. A profile with a higher `schema` keeps its number. The 2.5 keys (`celebs`, `celeb`, `schema`) and `career.foot` are new; nothing existing changed shape. `tools/check.js` loads old-shape and bad profiles through a stubbed `localStorage`.

## MyCareer and lobby

- `career.foot` (`'L'`/`'R'`, default R) read as `C.foot || 'R'` in `careerDef`; FOOT toggle in the career screen (this also sets which side the weak foot is on).
- Trait panel in the career screen: for every trait, score (`TRAITS[t].score - bias`) against the bar to earn it (`min(90, max(60, ovr + 1.5))`; the best two, three from 85 OVR, qualifying are active). No stored state.
- Online lobby slots show each player's trait tags (catalogue traits; Prime and skins do not change them).

## Multiplayer classification

- Celebrations: **cosmetic, server-validated** (like skins). The pick is `{ id, prime, skin, celeb }`; `server/validate.js` keeps a known id, else `signature`; `defOf` builds `ISO.outfit(.., p.celeb)`; the def is never serialised, so the celeb is not in the sim or any snapshot. Each client sees every player's celebration. Trust: like skins, a client can claim any celebration (no accounts).
- Sim revision: `ISO.SIM_REV = '2.81-p2'` (`js/data.js`), sent in the server's `start` message as `rev`. `online.js` shows a VERSION MISMATCH toast when it differs (a missing `rev`, an older server, is ignored). Protocol versions v1/v2/v3 are untouched (an extra field). Bump `SIM_REV` with any sim change.

## Tests added

`tools/check.js` (celebration data validity, roster resolution, outfit clone and no mutation, same sim with and without a celebration, profile migration, buy/equip, foot toggle, newer schema); `server/test-integrity.js` (known / unknown / object / prototype celeb ids, clone, sim unchanged, key list `celeb,id,prime,skin`); `server/test.js` (`start.rev`, validated celeb in `start.picks`).

## Not done

- Optional 3D weak-foot swing scale in `clipKick` and the final balance pass: not done (no sim change was made, so `tools/balance.js --smoke` only). The smoke run's point estimates are noise at 4 matches per trait.
- Nothing was seen in a browser: the clips, the cameras, the store tab and the career trait panel need a look (see the final report).
