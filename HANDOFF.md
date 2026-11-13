# Codex handoff

Last updated at the end of the Phase 0 session that did 0.2 (animation, part), 0.5 (CI) and 0.6 (docs). Nothing is committed or pushed by that session.

## Phase 4 session 2 (4.3 training arena sandbox, 4.4 custom drill creator)

- New files: `js/drillspec.js` (pure `ISO.DrillSpec`: `validate`, share codes, 20 save slots in `isofootball.drills.v1`, arena tally helpers; loaded right after `game.js`), `js/arena-ui.js` (in-match sandbox panel, `ISO.ArenaUI`), `js/editor-ui.js` (the `#editor` screen, `ISO.EditorUI.drawWorld` is also called by `render.js`), `tools/drill-test.js` (in CI).
- Contract: `G.sand` / `G.cust` / `G.sandT` exist only when `opts.sand` / a valid `opts.drillDef` is passed (offline, solo); the default sim is byte-identical (`SIM_REV` unchanged); the server never passes them (asserted). Built-in drills are untouched. Authored drills pay 1 CR a point, 8 CR a run at most, and do not count towards the Drills achievement.
- Open: browser look (arena panel, editor canvas at 1280x720, custom drill playback, TEST round trip); wind (no wind in the sim); free ground target zones and CPU-driven custom defenders (not built); share by code only. Details: PHASE4_NOTES.md (M5, M6).

## Phase 9 session 1 (9.1 settings and accessibility, 9.2 challenges, 9.3 localization, 9.5 debug HUD)

- New: `js/access.js`, `js/challenges.js`, `js/challenges-ui.js`, `js/i18n.js`, `js/lang-en.js`, `js/lang-es.js`, `js/debug-hud.js` (injected on demand), `tools/i18n-check.js`, `tools/challenge-test.js`, `tools/settings-test.js` (all in CI). Hooks in main.js, meta-ui.js, input.js, render.js, 3d/r3d.js, fx3d.js, stadium.js (noFlash), pres-ui.js, profile.js (flat settings keys, `chal`, `stats.chDone`; schema stays 5), index.html, css. Details, deviations and the BROWSER-ONLY list: PHASE9_NOTES.md.
- Tests: node --check all; check.js 60 and sim.js 40 normal byte-identical; test-physics 384 OK; balance and ai-test smoke, pres-test, cam-test, stadium-test, season-test 50, drill-test, anim-gate (A 307 / B 0 / C 109) OK; the three new tools OK; server tests in the final report.
- Open: 9.4 performance (session 2: honour `quality`), translations beyond wave 1, human review of es, mobile BLOCKED.

## Phase 9 session 2 (9.4 performance, 9.3 wave 2 part, 9.1 remainder)

- New: `tools/bench.js` + `tools/bench-baseline.json`, `tools/dispose-test.js` (both in CI), `js/lang-ko.js` (partial). Edited: `js/3d/r3d.js` (adaptTier, quality, lastTier, rain cap, fx dispose, stadium flav), `js/3d/player3d.js` (two dispose leaks), `js/3d/stadium.js` (`opts.flav`), `js/sprites.js` (LRU), `js/render.js` (particle cap), `js/profile.js` (`lastTier`, `stFlags`, `stCrowd`, `onSaveFail`, `bytes`), `js/access.js`, `js/main.js` (demo 30 fps, save toast), `js/meta-ui.js` (debounce, stadium rows, export / import), `js/i18n.js`, `tools/i18n-check.js` (`dyn` whitelist, partial languages), index.html, lang-en / es.
- Tests: node --check all; check.js 60 and sim.js 40 normal byte-identical; test-physics, balance and ai-test smoke, pres-test, cam-test, stadium-test, drill-test, season-test 50, challenge-test, settings-test, i18n-check, bench, dispose-test, anim-gate (307 / 0 / 109 unchanged) all OK.
- Open: wave 2 string extraction of the JS-built screens, catalogue text, controls guide, fr / pt / de / ja; player comparison deltas on select panels and store; optional `chal` achievement family; mobile BLOCKED; the BROWSER-ONLY list in PHASE9_NOTES.md.

## Phase 5 session 3 (5.5 rivalry, 5.6 collection)

- New files: `js/rivals.js` (pure `ISO.Rivals`: rivals, `rivalDef`, the finale, ledgers; wraps `ISO.Career.norm`), `js/collection.js` (pure `ISO.Collection`: sets, set bonus, favourites, duplicate stars, Prime price, custom kit validation), `js/collection-ui.js` (store COLLECTION tab, player card, compare), `css/meta2.css`. Anchored hooks: `profile.js` (recordMatch `mode: 'boss'`, careerForfeit, seasonEnd, winMult 5th argument, `primeCost`, careerDef kit), `main.js` (startMatch finale branch, `App.boss`, `App.matchPers` in buildMatch, end screen), `pres-ui.js` (intro line, forced archetype chip), `career-ui.js` (RIVALS and KIT tabs), `meta-ui.js` (boss card, store tab, `PF.primeCost`), `index.html`. Sim, `js/ai.js`, `js/game.js`, `js/3d/*` untouched; profile schema stays 5 (keyed on shape).
- Contract: the finale is `recordMatch({ mode: 'boss', ..., m })` after seven matchdays (`bossReady()`); it never touches `sn.md`, points, XP or tokens. `Rivals.bossSettle` pays prize + objectives + rep on a win only.
- Economy: finale credits at most 6,910 over a five-season career (asserted); one-time set credits at most 16,000 (15,745 now, asserted; needs the entire roster). Details: PHASE5_NOTES.md.
- Open: custom stadiums (BLOCKED), rival challenges `RIVAL_CH` are still data only, browser look (PHASE5_NOTES.md).

## Phase 6 session 1 (6.1 camera rig, 6.2 first pass)

- New `js/3d/camrig.js` (pure), camera3d.js refactor, hooks in adapter / stadium / r3d / render / profile / index.html / meta-ui / main, `tools/cam-test.js` + `tools/cam-baseline.json` (CI after the anim gate). Full details, deviations and the BROWSER-ONLY checklist: PHASE6_NOTES.md.
- 6.2: accepted WP1 (drawn-ball catch-up cap) and WP3 (stride); gate now A 307 / B 0 / C 109, excess 342.1 / 155.0. Did not help: gait ground-IK fade above 0.08 h root lift (C unchanged, A +1); post-hold cap for the power kickBall (4.9). Not done: WP4, WP5.
- Tests: node --check all, check.js 60 and sim.js 40 normal byte-identical, test-physics 384 OK, balance and ai-test smoke OK, server tests (PROTO unset / 2 / 3) OK, anim-gate OK, cam-test OK.
- Needs a browser look: the list in PHASE6_NOTES.md.

## Phase 6 session 3 (6.3 stadium environments, 6.2 third pass)

6.3 is in TESTING: the per-map table, flags, tifo, flashes, LED, crowd sway, sun and turf looks are in `js/3d/stadium.js` (`R3D.Stadium.FLAV`), three hooks in `js/3d/r3d.js` (`turf` and `kitCols` into the build, `cheer(0.6)` on save and post). New `tools/stadium-test.js` (CI) with `tools/stadium-baseline.json` recorded from the untouched stadium.js; `--update` only after a deliberate budget change. Sim byte-identical (`check.js 60`, `sim.js 40 normal`). Browser-only items are listed in `PHASE6_NOTES.md`. If a map looks wrong in a browser, the cheapest levers are its FLAV row (`sunDir`, `crowd`, `roof`, `flags`, `flash`, `led`, `tifo`, `wave`).
6.2 third pass: nothing accepted. Did not help (do not repeat): `recover: 1` in `LOCK_OFF` (C -1 but excess A +1.1 and every recover foot unlocked), `SP_F` 0.35 -> 0.39 / 0.45 in ball3d.js (A 307 -> 315). Skill leg overlaps are authored as foot targets, not abduction keys, and the elastico entries are after the clip ends (`out+67ms`): trace the pose at those instants first.

## Phase 6 session 2 (6.4 match presentation, 6.2 second pass)

- 6.4 done in code: new `js/pres.js` (pure `ISO.Pres`), `js/pres-ui.js` (DOM), `tools/pres-test.js` (CI), one-line hooks in main.js (beginMatch, frame, updateHud, showEnd), `camera3d.js` intro sweep keyed on `R3D.introP`, Settings toggles (pres, slowmo), CSS block `/* Phase 6.4 */`. Details, rating formula and the browser-only list: PHASE6_NOTES.md. Known: the cup/career forfeit window grows 0.8 s with the longer full-time delay.
- 6.2 second pass: nothing accepted. WP6 (keeper get-up leg abduction) did not help and was reverted; WP4, WP5, WP7 and landing absorb were not attempted. Gate unchanged (A 307 / B 0 / C 109).
- Tests: node --check all; check.js 60 and sim.js 40 normal byte-identical; pres-test, cam-test, test-physics, balance and ai-test smoke OK; all server tests (default, PROTO=2, PROTO=3 incl. test-lag and test.js) OK.
- Needs a browser look: the list in PHASE6_NOTES.md (6.4).

## Phase 5 session 2 (5.2 training, 5.3 objectives, 5.4 reputation)

- Files: new `js/career-obj.js` (pure; tracker, OBJ / SEASON_OBJ, TRAIN, reputation, `norm`, `settle`), `js/career-ui.js` (tabs, hooks), `js/profile.js` (schema 5), one-line hooks in `js/main.js`, `index.html`, `css/style.css`, `tools/check.js` (career block 2), `tools/season-test.js` (synthetic summaries, budget and economy asserts), `PHASE5_NOTES.md`. Sim untouched.
- Contract: `recordMatch({ mode: 'career', ..., m })` with `m` from `ISO.Career.Tracker.finish`; without `m` nothing new is paid. The training XP scales in `TRAIN[].measure` are tuned to CPU-vs-CPU sim averages: replay-check them after a human playtest (the 10-15% budget assertion in season-test uses synthetic summaries).
- Open: assists (no sim event), sprint / strength / endurance drills (4.3), rival challenges (data only, 5.5), browser look (see PHASE5_NOTES.md).

## Phase 5 session 1 (5.1 career seasons; 1.5, 2.1, 4.5, 4.6, Phase 7 and 8 skipped by the user)

- Files: new `js/career.js` (pure, `ISO.Career` + `ISO.SEASONS`), `js/career-ui.js` (middle column of #career), `js/profile.js` (schema 4, `normCareer`, `careerBegin/Kickoff/Forfeit`, `seasonTable`, `seasonEnd`, `recordMatch` career branch, achievements), `js/main.js` (startMatch / forfeit / end screen), `js/meta-ui.js`, `index.html`, `css/style.css` (`/* Phase 5 */`), `tools/check.js` (career block), new `tools/season-test.js` (CI), `PHASE5_NOTES.md`. Sim untouched, `SIM_REV` unchanged.
- Tests: all node --check; `check.js 60` exit 0 `{}` and with `sim.js 40 normal` and `ai-test.js --smoke` byte-identical to before; `season-test.js 200 --sim` OK; `test-physics.js` 384 OK; balance smoke OK; anim-gate unchanged; server tests OK.
- Needs a browser look: the #career screen (banner, tabs, table at 1280x720), the end-screen line, the forfeit toast, CLOSE SEASON flow.
- Next: 5.2 training (the per-season `cap` is data in `ISO.SEASONS`, not yet enforced).

## Phase 3 session 2 (3.2 adaptive, 3.3 tactics, 3.4 keeper styles, 3.5 decision quality)

- Files: `js/ai.js` (Adapt, paramsAt, laneBlock/rebound/ctxSkill), `js/data.js` (GK_MODS, GK_STYLES, keeperStyleOf, gkFor), `js/game.js` (keeper style hooks, neutral by default), `js/profile.js` (P.adapt, settings.adaptive, adaptLevel, resetAdapt, winMult level, hardWins), `js/main.js` / `js/meta-ui.js` / `index.html` (UI), `tools/ai-test.js` (sections S, F, G, Q), server test-determinism / test-integrity (small). Details and numbers: `PHASE3_NOTES.md`.
- 2v2 CPU tactics BLOCKED/SKIPPED (no offline 2v2, 4.5). Browser-only unchecked: select-screen adaptive/keeper chips, Settings toggle and reset, 'NEXT MATCH' line, a styled keeper's look in play, the main.js `(c, i)` fix.
- Open: Hard parameters are not stronger than Normal in CPU-vs-CPU play (level 2 loses to the Normal bot).

## Phase 3 session 1 (3.1 AI personalities, 3.3 tactical AI partly, 3.5 AI testing)

- Files: `js/ai.js` (KNOBS, ARCH, profileOf, shotQ, create(diff, opts), hooks), `js/main.js` (buildMatch, select chip), `js/meta-ui.js` (career line), new `tools/ai-test.js` and `tools/ai-baseline.json`, `tools/sim.js` (`--pers`), CI (`ai-test --smoke`), new `PHASE3_NOTES.md`. Session 2: adaptive difficulty (3.2, `lvl`/`adapt` already accepted), laneBlock / ctxSkill / rebound, keeper personalities (3.4). Never run `ai-test --update` to hide a legacy drift.
- Open: `check.js 60` reports 'profile: old shape not back-filled' (Phase 2.5 schema check, not the AI). Section E shows legacy difficulty is not monotonic CPU-vs-CPU.

## Phase 2 session 2 (2.5 celebrations, save schema 2, sim revision handshake)

- Files: `js/data.js` (CELEBS, celebOf, outfit 4th argument, SIM_REV), `js/3d/clips-action.js` / `anim3d.js` / `player3d.js` / `adapter.js` / `camera3d.js`, `js/render.js` (CELEB_2D), `js/profile.js` (schema 2, migrate, celebs), `js/meta-ui.js` and `index.html` (store tab, career foot and trait panel, help), `js/online.js` (trait tags, rev toast, pick celeb), `js/main.js`, `server/validate.js`, `server/server.js` (`rev` in `start`, defOf), the server tests, `tools/check.js`, `tools/anim-check.js` (seven new scripted celebrate rows, TH untouched). Details and deviations (Spin Leap for backflip, Knee Drop for knee slide) in `PHASE2_NOTES.md`.
- Tests: all node --check; `check.js 60` exit 0 `{}`; `sim.js 40 normal` byte-identical with and without the new data; `test-physics.js` 384 OK; `balance.js --smoke` OK; server tests at PROTO unset, 2, 3 (see the final report); `anim-gate` A 308 / B 0 / C 111, excess 352.1 / 169.5 (baseline unchanged).
- Follow-ups: a browser look at all eight clips and cameras, the store tab, the career trait panel and lobby tags; the optional weak-foot swing scale in `clipKick`; a real knee slide or backflip would need root travel or a pivot at the centre of mass.

## Phase 2 session 1 (2.2 traits and playstyles, 2.3 movement profiles, 2.4 weak foot; 2.1 and 1.5 skipped by the user)

- Files: `js/data.js` (ISO.MODS / ROLES / TRAITS / styleOf / STYLE_OFF, `P()` role arg, `ISO.PROF`), `js/game.js` (hooks through `sty(p)`, `weakSide`, weak-foot pass and skill), `js/ai.js`, `js/main.js`, `js/meta-ui.js`, `js/render.js`, `js/3d/fx3d.js`, `css/style.css`, `tools/check.js` (scenario 10, goal-frame check skips a ball already in the net), `tools/sim.js` (`STYLE=off`, wins per trait and role), new `tools/balance.js`, `server/test-integrity.js`, `.github/workflows/ci.yml` (balance smoke), `tools/anim-baseline.json`, new `PHASE2_NOTES.md`, ROADMAP, CHANGELOG, TECHNICAL_ARCHITECTURE.
- Tests: node --check all OK; `STYLE=off` sim 40 and 150 and `check.js 60` byte-identical to the pre-change output; `check.js 60` exit 0 `{}` (with the new scenario); `test-physics.js` 384 checks OK; every server test OK at PROTO unset, 2 and 3; bench-bandwidth delta bytes unchanged in structure (1v1 558 B, 2v2 716 B with styles on; 597 / 864 with `STYLE_OFF`, the difference is trajectory noise); `tools/balance.js 200`: all ten traits 48-55% (see `PHASE2_NOTES.md`); sim 150 normal 609 goals / 3002 shots / 1.08 min.
- Anim gate: baseline moved from A 302 / B 0 / C 122, excess 346.3 / 185.4 to A 308 / B 0 / C 111, excess 352.1 / 169.5 (`--update`). The sim now gives the gate's subject role, body and trait factors. A first run had B 1 (`backpedal pelvisSnap 0.801 > 0.8`) from a +0.5% Poacher top speed; that factor was removed. TH in `tools/anim-check.js` untouched.
- Follow-ups: look at 3D foot sliding for the extreme `stride` factors in a browser; a 3D weak-foot kick animation; per-trait 3D visuals; Quick Step is the weakest trait in mirrored matches (about 48-49%, inside noise of 50%); a person has not play-tested any of this; `celeb` is reserved for 2.5.

## Phase 1.3 / 1.4 session (advanced ball physics, physical interactions)

- Files: `js/game.js` (C.PHYS, ISO.Phys, goal frame, bodies), `js/ai.js` (landT, C.GRAV), `js/main.js`, `index.html` (PITCH segment, help), `js/render.js`, `js/3d/adapter.js`, `js/3d/ball3d.js` (reads `vf.surf`), `server/server.js` (turf 'grass'), `tools/test-physics.js` (new), `tools/check.js`, `tools/sim.js`, `server/test-determinism.js`, `server/test-integrity.js`, `.github/workflows/ci.yml`, `PHASE1_NOTES.md` (milestones 3 and 4).
- Tests: node --check all OK; `check.js 60` {}; `test-physics.js` 384 checks OK; sim 150 normal 587 goals / 2779 shots / 1.04 min (before 596 / 2954 / 1.04); server tests all OK (PROTO unset/2/3); anim-gate baseline lowered to A 302 / B 0 / C 122, excess A 346.3 / C 185.4 (from 311 / 0 / 117, 353.5 / 161.2): the C rise comes only from the new sim (a tree with the old game.js and ai.js reproduces the old baseline exactly; match trajectories differ, so different poses are sampled).
- Follow-ups: online turf option (roadmap 8.4); 3D stumble direction (`clipStumble` plays by `pv.u` and ignores `fallYaw`, anim3d is not touched here); in-air dip from topspin (not modelled: chip solver, shotLine and the AI assume ballistic flight); height-scaled header reach in `resolveStrike` (only `ISO.Phys.height` exists); `ball3d.js` bar visual fudge (`BAR_LO/BAR_HI`, `POST_TOP_SIM`) still assumes the old plane bar, check it against `FRAME.barZ` (65) and radius 4 in a browser; 3D visuals for tsp are not drawn.

## Phase and milestone

- Phase: **0, Technical Stabilization**. Not complete.
- Last completed milestones: CI workflow and animation ratchet (0.5, written and run locally, not yet run on GitHub); documentation set (0.6).
- In progress: **0.2** animation (strict gate still FAILS), **0.1** audit. Netcode (0.3 / 0.4, partial) has landed: lossless delta snapshots (protocol 2; offline 130.7 to 22.3 KB/s in 1v1 and 209.3 to 44.2 KB/s in 2v2), input validation, server-side admin check, optional permessage-deflate (`WS_DEFLATE=1`). Not done: ownership/accounts, 2v2 size target, quantisation. Details: `server/NETCODE_NOTES.md`.

## Phase 4 session (M3 Tournament 4.2, M4 Street Football 4.1)

- Both are TESTING in `ROADMAP.md`; 4.5 and 4.6 are SKIPPED by user decision. Full detail, numbers and the browser-check list are in `PHASE4_NOTES.md`.
- New files: `js/cup.js` (pure bracket logic, `ISO.CUPS`, `ISO.Cup`), `js/cup-ui.js` (the #cup screen). Edited: `js/profile.js` (SCHEMA 3, cup state, `recordCup`), `js/game.js` (`ISO.RULES.street` hooks, all behind `G.rules`), `js/data.js` (`ISO.RULES`), `js/main.js` (cup mode, rules segment, HUD clock, street look), `index.html`, `css/style.css`, `js/render.js` and `js/3d/fx3d.js` (+2), `tools/check.js`, `tools/sim.js` (`--rules=street`), `server/test-integrity.js`.
- Default path is byte-identical (`sim.js 40 normal`, `check.js 60`); `ISO.SIM_REV` and `ISO.VERSION` untouched. Rule sets and tournaments are offline only: `server/server.js` never passes `rules`.
- Needs a browser look: six-card Play hub, the #cup screen, the cup end screen, the street HUD clock and +2 banner in 2D and 3D, `fs_roof` as the street look.

## What this session changed

- `js/3d/anim3d.js`: (1) the run cycle's foot plants are inherited by the clip foot lock (`lkI`, `lkG`, `lkGs`, `st.lkArm`, `LK_NEAR = 0.2`: only if the clip's own foot is within 0.2 h of the plant; a wider tolerance on the planted test, 6 cm); (2) the first-time approach weight is persistent and let go at `RD_FALL = 4` per second (`st.rdWs`, `st.rdLx/rdLz`), so an abandoned approach no longer vanishes in one frame; (3) the root slew limit (`SLEW`, unchanged values 8 and 10) also applies while a header approach is being drawn.
- `tools/check.js`, `tools/sim.js`: now exit non-zero on violations. New `tools/anim-gate.js`, `tools/anim-baseline.json`. New `.github/workflows/ci.yml`.
- `js/data.js` (`ISO.VERSION = '2.81'`), `js/main.js` (version label), `index.html` (BETA 2.81), `.gitignore` (.DS_Store).
- Docs: `README.md`, `CHANGELOG.md`, `ROADMAP.md`, this file, `TECHNICAL_ARCHITECTURE.md`.
- `tools/anim-check.js` and its `TH` thresholds are unchanged (`git diff tools/anim-check.js` is empty).

## Animation numbers

Excess score per section = sum over `fails[]` of `min(10, value / limit - 1)` from `node tools/anim-check.js --json`. This session's own formula; the planner quoted 508.2 and 172.6 for the start, which this exact formula did not reproduce (it gives 538.2 and 192.6 on the same code), so all comparisons below use the one formula that `tools/anim-gate.js` implements.

| | start | now |
| --- | --- | --- |
| A fails (clips) | 341 | 315 |
| B fails (stability) | 0 | 0 |
| C fails (matches) | 129 | 120 |
| excess A | 538.2 | 366.3 |
| excess C | 192.6 | 200.6 |
| A skate / skatePeak | 98.9 / 96.2 | 75.9 / 72.5 |
| A snap / jnt | 59.2 / 10.7 | 59.9 / 10.7 |

The excess formula now clamps each fail at 0 (it was 188.3 for C before that fix); the 'start' excess values were computed with the old formula and were not recomputed. C has one more failing row than at the start (130 against 129) while its excess went down; the gate baseline `C` count is 120 (baseline file: A 315 / B 0 / C 120, excess A 366.3 / C 200.6; the earlier '130' was a typo). The strict gate (`node tools/anim-check.js`) still exits 1. Not tested: how any of this looks. No visual check was possible headless; every number is from the validator.

## Tests run (locally, at the end of the session)

| Command | Result |
| --- | --- |
| `node --check` on js/*.js, js/3d/*.js, server/*.js, tools/*.js | all pass |
| `node tools/check.js 60` | exit 0, violations {} (after the first-time-charge fix; before it, match 52 failed with 'shot by a non-attacker') |
| `node tools/sim.js 40 normal` | exit 0 |
| `server/test-determinism.js`, `test-crossplay.js`, `test-lag.js`, `test-delta.js`, `test-integrity.js` | OK |
| `server/test.js` | OK on the last run; it failed once ("2v2 state") while the other session was editing `server/test.js`, so re-run it |
| `node tools/anim-gate.js` | FAIL after the Phase 1 review fixes: current A 315 / B 0 / C 124, excess A 366.3 / C 192.8 against baseline C 120 / 200.6 (C count +4 from the sim changes, excess lower). Baseline not updated; decide whether to accept 124 and run `--update`. |
| `node tools/anim-check.js` | exit 1 (strict gate fails, as before) |
| GitHub Actions run | NOT run (needs a push) |

## Experiments that did not help (do not repeat)

Root step limit 8 to 4; slower cut fade on root channels; clamping kick carry to 0.2 h; LK_SPD 2.5 to 6; lock height 0.03 to 0.06 (alone); leg step limit 45 to 25; crossfade rate x1.5 to x1.0. This session added: inherited plants with no distance test (snap +15, jnt +11 from the kicking foot being held at the gait's plant while the charge pose draws it back); fading an inherited plant out instead of stepping it (benefit mostly lost); lowering the root slew from 8 and 10 to 6 and 7 or 6 and 8 pushes the header contact to 22 to 35 cm against a 15 cm limit; larger FT_LEAD does not touch the scripted header scene.

## Second pass (coder C): changes and numbers

Final run with coder D's sim changes in the tree: A 315 / B 0 / C 120, excess A 366.3 / C 200.6 (baseline in `tools/anim-baseline.json` lowered). `ball3d.js`: the kick hold's ease is scaled by `1 - swW` at the kick event (A excess 486.1 to 416.8 with D's tree). `anim3d.js`: `lkC` hop-through for a lock released on the frame it was taken (A 416.8 to 370.3, C count 121 to 120, C excess +0.8 slightly worse); `st.rdH` declared, dead `- 0.0` removed. `clips-keeper.js`: hold fall uses `st.clock` latched at entry (`g.hClk`), FALL 1.6 to 1.0 (A 370.3 to 366.3). Netcode: protocol 3 (see NETCODE_NOTES). Tests `test-crossplay.js` / `test-lag.js` OWN tables now include `stop`/`burst` like `js/net.js`. Not done: keeper landing absorb, gkHand, seedFeet both-airborne (measured worse earlier: do not apply), reachOwn kick carry, probes, stepover/diveHigh key pops. Someone should eyeball `tools/lab-player.html` for the lkC hop. The strict `anim-check` still exits 1.

## Not done from the plan

WP4 keeper descent shaping, WP5 `seedFeet` both-feet-airborne case, WP6 spreading the kick carry, WP7 stepover and dive key smoothing. The `turn` pop (a synthetic yaw flip) is left as is. Foot contact (skate, skatePeak, scrape) is still about half of the A excess.

## Next smallest useful milestone

(Updated: next ball3d targets are the power-kick kickBall 0.475, the pass kickFast one-frame 1.79x, and C 'drawn ball behind hip line' / 'above 1.6x'; then the keeper landing absorb. The older note follows.)

Trace `skill:stepover` knee key (u = 0.827) and `gk:diveHigh` GROUND (u = 0.731) with `--only A --clip <name> --trace <name>`; then the keeper hold descent. Lower `tools/anim-baseline.json` with `node tools/anim-gate.js --update` after every improvement. Then 0.3 (server-side profile validation needs a server-held profile) once the netcode session lands.

## Known constraints

Sim is fixed 120 Hz and must stay deterministic client and server (see `TECHNICAL_ARCHITECTURE.md`); never edit `TH` in `tools/anim-check.js`; the profile is client-side localStorage; `render.yaml` and `server/*` are the netcode session's.
