# Phase 6 session 1: 6.1 camera system, 6.2 animation first pass

Presentation only. The simulation is untouched: `node tools/check.js 60` and `node tools/sim.js 40 normal` are byte-identical to before.

## 6.1 Camera rig

New pure file `js/3d/camrig.js` (`ISO.R3D.CamRig`, no THREE, loads after `coords.js`): `PRESETS`, `ORDER`, `SIT` (situational framing), `inputPsi`, `sideFrame`, `fixedFrame`, `ndc`, `guard`, `limits`, `shakeOf`, `blend`. `js/3d/camera3d.js` keeps the state and the chase body and gains `setPreset`, `setOptions`, `setLimits`.

| Preset id | Name | Frame |
| --- | --- | --- |
| chase | PLAYER CHASE | The original numbers exactly (D 8, H 3.4, fov 50, sprint +0.8 / +4, yaw cap 0.33, high-ball tracking). Default. |
| close | CLOSE ACTION | D 5.4, H 2.3, fov 47, the "wide when the ball is away" gain 1.3. |
| dynamic | DYNAMIC | Chase with D x 0.85..1.25 from the ball-to-player gap and speed, fov -3 inside the box with the ball, fov punch (up to 2.5 degrees, decays 6/s) on a goal or power kick. |
| broadcast | BROADCAST | Side rig at the stand (x = standX - 0.6), H 8, fov 38 (max 50), anchor 0.7 ball + 0.3 player. Keys turned an exact quarter. |
| low | LOW SIDELINE | Side rig at the touch line (x = half + 1.6, or half - 0.5 with walls), H 1.5, fov 52 (max 62). |
| tactical | TACTICAL | Fixed end-on: z = min(depthAll + 5, backZ), H = min(11, topY), x = 0.3 x focus (+-5), fov 44 (max 56). Keys as chase. |

Situations: kick-off pushes chase out by {3 m, 1.6 m} and widens side/fixed rigs by 4 degrees; the free-kick drill (vf.drill 'freekick', not in play) frames D 9.5 / H 2.9 / fov 48; goal celebration; final (phase 'end' with a winner: D 6, H 2.2, drifting 0.25 rad/s round the winner). The penalty shootout branch overrides every preset unchanged.

Behaviour: a preset switch stores the pose in force and blends to the new one (smoothstep, 0.6 s, longer when the move is long or turns far: never above about 1 m or 5.5 degrees a frame); a teleport (kick-off) snaps and cancels the blend. The guard keeps subject and ball inside the frame for side/fixed rigs (up to 4 rounds of pulling the look-at to their midpoint and widening the fov, engagement damped 4/s). Camera limits come from the stadium colliders (`CamRig.limits`). Goal mode (`camGoal`): 'celeb' goes to the celebration camera on the SCORER (vf.goalBy, also when the CPU scores) with no teleport snap while it lasts; 'wide' stays in the preset and pulls back 1/0.88; 'off' keeps the preset. Stadium back-end fade only applies when the lens is below about 5 m (`setView(camZ, camY)`).

Settings (defaults only in `fresh().settings`, no schema bump): `cam3d` 'chase', `camZoom` 1 (80-130 %, scales D and H; side/fixed rigs scale H and fov), `camSens` 1 (50-150 %, follow and yaw damping), `camShake` 1 (0-100 %, also scales the 2D screen shake in `render.js`), `camGoal` 'celeb'; `pres` and `slowmo` reserved for a later session. UI: Settings > GAMEPLAY (#setCam3d, #setCamZoom, #setCamSens, #setCamShake, #setCamGoal plus a help line) and a pause-menu CAMERA button (#camBtn, `data-act="cam-next"`, hidden outside 3D). `settings.camera` ('classic' | '3d') is unchanged. Hooks: `adapter.js` adds vf.goalBy, vf.winner, vf.drill (read-only) and `o.stride`; `r3d.js` applies the limits after build and the settings when they change; `server/test-crossplay.js` loads camrig.js.

### Tests: `node tools/cam-test.js` (CI, after the anim gate)

T1 golden chase (scripted jog, sprint, loose ball, chip, back edge, penalty, kick, goal, kick-off teleport at 60 Hz; baseline `tools/cam-baseline.json` written from the untouched camera3d.js; refactor matches to 0 deviation), T2 visibility (6 presets x 300 seeded situations), T3 continuity (120 s of random preset switches, goal and final entries: worst step 0.84 m, worst turn 5.6 degrees), T4 input (6 presets x 8 keys; side rigs give exact 0/+-1), T5 time step (30/60/144 Hz settle together; dt = 0 changes nothing), T6 shake (bounded, exactly 0 at camShake 0). `--update` rewrites the baseline.

Visibility results (ball and subject inside NDC): chase 83.3 % (the recorded baseline, which the chase must not fall below), dynamic 83.3 %, close 66.7 %, broadcast 99.7 %, low 97.3 %, tactical 100 %. Deviation from "100 % for side/fixed": the misses are a ball on the near touch line within 1.6 m of the Low camera, or a ball 7 m up above a subject at the near line under Broadcast, which no fixed lens can hold. The test thresholds are 99 % (broadcast, tactical) and 97 % (low).

### Deviations from the brief

- Fov punch applies to DYNAMIC only (the chase golden run contains goal events and must stay exact).
- 'wide' goal mode pulls back (zoom x 1/0.88) rather than x 0.88, so it is actually wider.
- A subject change (goal scorer, winner) skips the 2.4 m teleport check for that frame; leaving the goal camera for a subject far from the scorer damps instead of cutting.

### BROWSER-ONLY verification (no browser was available)

- Each preset on stadium, beach, fs_roof (rooftop), fs_wood (hall): nothing between lens and play (stands, nets, walls, the back board).
- Whether Broadcast and Low read well on the 36 x 20.5 m one-goal pitch and whether the quarter-turned controls feel right. If not, flip the two rows to end-on: one data change in `PRESETS` (fam 'fixed').
- Blend smoothness on preset switch, goal, final and kick-off.
- Mouse aim and the reticle under every preset (unproject uses the live camera).
- Penalty shootout unchanged; free-kick drill framing.
- Celebration camera on the scorer for all 8 celebrations, including when the CPU scores.
- Shake and punch at 0, 50 and 100 %.
- Back board under Tactical versus Chase.
- Every 6.2 change in `tools/lab-player.html`.

## 6.2 first pass (animation)

Gate (`node tools/anim-gate.js`) before: A 308 / B 0 / C 111, excess A 352.1 / C 169.5. After: A 307 / B 0 / C 109, excess A 342.1 / C 155.0 (baseline updated).

Accepted:
- WP1 `js/3d/ball3d.js`: while the kick window is open the drawn ball never moves more than 1.55x the sim ball's step in a frame (measured against the previous drawn position; the rest of the gap stays for later frames). Removed A `pass kickFast` and C 'drawn ball above 1.6x'; excess A -10.0, C -13.7.
- WP3 stride: `adapter.js` adds `o.stride` (read-only, `ISO.styleOf(def).m.stride`), `anim3d.js` multiplies the gait stride length (and the lab's on-the-spot distance) by it. `anim-check.js --only B --stride f` measures it (default output unchanged). At stride 1.12: jog pelvis snap 0.44 -> 0.36, sprint pelvis vy 1.29 -> 1.02, snap 0.88 -> 0.54; at 0.9 neutral (sprint scrape 1.1 -> 1.5 cm, dribble 1.6 -> 0.5 cm); stride 1 is identical. Slip stays 0 % in every case (the planted feet never slide), so slip% cannot show it. C -1, excess C -0.8.

Did not help (reverted, do not repeat): WP2 fading the gait's ground IK weight (st.legW and the ground fit) once the root lift passes 0.08 h with a 0.12 h ramp: no change in C (the worst `free` frame, match 1 t=28.76-28.82, is not reached through that path) and A +1; the right foot's 129-178 cm per-frame move with a body spinning at ~14 rad/s needs a trace of the lock / gait target frames, not the weight. WP1 'power kickBall' (4.9, boot 47 cm from the drawn ball when it moves): the post-hold cap does not change it (the gap is made in the charge pose, before the hold releases).

Not done: WP4 (standing-kick plant foot), WP5 (shoulder). ROADMAP 6.2 stays IN PROGRESS. The strict `anim-check` still exits 1.

## 6.4 Match presentation (session 2)

Files: `js/pres.js` (pure logic, node-loadable; `ISO.Pres`: rate, potm, goalLines, pips, matchPoint, timeScale, intro), `js/pres-ui.js` (DOM; `ISO.PresUI`: begin, frame, hud, end, endDelay), `tools/pres-test.js` (in CI), one `/* Phase 6.4 */` block at the end of `css/style.css`. Hooks in `js/main.js` (one line each): `beginMatch` -> `PresUI.begin`, `frame()` (`running` also needs `!App.introOn`; `App.acc` is scaled by `Pres.timeScale`; the end delay is `PresUI.endDelay`; `PresUI.frame` once per match frame), `updateHud` -> `PresUI.hud`, `showEnd` -> `PresUI.end`. Camera: `camera3d.js` shared tail applies the intro sweep only while `R3D.introP` is a number below 1 (set by pres-ui; `null` in play, so `cam-test` and the golden chase are untouched).

- Intro `#intro` (offline cpu / career / cup, never drills or the menu demo): two lineup cards (portrait, name, OVR, flag, club, chips: role, traits, weak-foot stars, celebration, and for the CPU its AI personality via `ISO.AI.profileOf`), centre title (QUICK MATCH, STREET FOOTBALL, cup name + round, career season + matchday), map, rain, turf, FIRST TO n. Holds the sim for 4 s or until Enter / Space / click / the shoot key; `Input.consume()` runs every held frame and on exit, so nothing leaks into the kick-off. The camera swings in from round the look point and 3.2 m higher onto the real pose. Online: a non-blocking lower-third for 2.5 s over the countdown.
- HUD: first-to-N pips (only when G.win <= 5), MATCH POINT pulse (one team a goal from winning), scorer ticker under the clock (last scorer, time), clock red under 30 s on a limited match (street).
- Goal card `#goalCard`: portrait, NAME, nth goal, clock, +n tag; shown from 0.3 s after the goal until 0.3 s before the pause ends, hidden during the 2D replay (`inReplay` is passed from main.js using the same expression as the skip check); 2D and 3D.
- Slow-mo: 0.35 sim-time scale for the first 0.22 sim-seconds of a goal phase, 3D offline only (`cur3d`, never online, never 2D). Adds about 0.41 s to the goal pause. The sim steps are identical, only their real-time pacing changes.
- Full time: the end delay is 1.4 s (was 0.6 s) for matches, and a FULL TIME sting `#sting` shows over the camera's `final` mode. Consequence: the cup / career `live` (forfeit) window, which is only cleared in `recordMatch` from `showEnd`, grows by 0.8 s. Not changed (would need a profile.js change).
- End screen `#endPres` above `#endStats`: player of the match (portrait, rating), every player's rating (+ goals), goal timeline (clock, scorer, running score, +pts), proportional bars behind the stat rows. Not persisted.
- Ratings: base 6.0, +0.9 per goal (cap +3), +0.2 per shot on target (cap +1), -0.35 per goal conceded, +0.15 per tackle (cap 1), +0.05 per skill (cap 0.5), +0.1 per clear (cap 0.5), +(possession% - 50)/100, +0.5 for the win; clamped 3.0-10, one decimal. Team stats are shared by a team's players (2v2); goals are per player. Drills give null. Player of the match: highest rating, ties to the winner, then goals, then lower index.
- Settings (Settings > GAMEPLAY): `Match presentation` (pres; off disables intro, HUD extras, goal card, sting, end panel and the long end delay) and `Slow-motion goals` (slowmo). Both defaults were already in `fresh().settings` (true); no schema bump.
- No halves exist (first-to-3, street first-to-5 with a clock), so there is no half-time moment; the moments are match point, sudden death (the existing label) and full time.

Verification (headless): `node tools/pres-test.js` (bounds, determinism, monotonic in goals, zero-stat match, 2v2, drill null, street points, pips / match point, slow-mo scale, intro data, and a JSON snapshot of G before and after every call proves no mutation); a DOM-stub run of pres-ui (intro holds and ends, goal card shows and hides in a replay, end panel, online does not hold); `index.html` loads in headless Chrome with no console error. `check.js 60` and `sim.js 40 normal` are byte-identical before and after.

### BROWSER-ONLY verification (6.4)

Intro card layout at 1280x720 (both cards, long chip rows, street cup titles); Enter / Space / click / shoot skip, and no input leak into the kick-off; the camera sweep (clipping through stands or walls on the small street courts); online lower-third; goal card against the 2D replay; slow-mo feel and total goal-pause length; the FULL TIME sting over the final camera; the end screen with player of the match in cpu, career, cup, street and online 2v2; the HUD row (pips, MATCH POINT, ticker) at the 132 px middle column; clock red in street.

## 6.2 second pass

Did not help (reverted): WP6 widening the leg abduction in the keeper get-up propped key (`clipGkGround` P0, 0.05/0.3 to 0.22/0.45): the gate was unchanged to the digit (gk:diveLow legs 11 / width 1.03 unchanged), so the shin collision at out+233 ms (side-) is not made in that key; it is in the set / stride that follows (after the clip's end), needs a trace of the pose at out+233 ms. WP4, WP5, WP7 and the landing absorb: not attempted this session (time went to 6.4). Gate unchanged: A 307 / B 0 / C 109, excess A 342.1 / C 155. ROADMAP 6.2 stays IN PROGRESS.

## 6.3 Stadium environments (session 3)

Presentation only: `node tools/check.js 60` and `node tools/sim.js 40 normal` are byte-identical before and after. All changes are in `js/3d/stadium.js`, `js/3d/r3d.js` (three small hooks) and the new `tools/stadium-test.js` / `tools/stadium-baseline.json`. The single 3D table stays in `stadium.js` (`R3D.Stadium.FLAV`, also still `flavours`); `ISO.MAPS` and `js/data.js` are untouched, and render.js keeps its text turf label (a deliberate 3D-only difference: the pitch look by turf only exists in 3D).

### The table (new optional row fields)

| Field | Meaning | Cost |
| --- | --- | --- |
| `sunDir [az, el]` | Sun bearing and height in degrees (az 0 = beyond the far end, 180 = behind the goal). Default day 55, night 62, dusk 24; minimum elevation 22. The shadow frustum is fitted to the playable box in light space for any direction. Intensity is scaled by clamp(0.819 / sin el, 0.9, 1.5) so the ground keeps about the same light. Dusk maps (sunset, sakura, mud) get el 24 and long shadows. | 0 |
| `crowd 0.25..1` | Multiplies the instanced fan count (on top of the tier keepFrac) and raises the empty-seat rate in `paintCrowd` (0.1 + (1 - crowd) x 0.6). stadium and gold 1, neon 0.9, beach 0.85, street and snow 0.8, sunset and sakura 0.7, monsoon 0.6, jungle / retro / dock / fs_roof 0.5, desert 0.4, mud 0.35, moon 0.25. | fewer instances |
| `roof` (full or none) | Cantilever roof of the big stands (crowd kind). none on sunset, sakura, mud, moon. | 0 |
| `flags n <= 24` | One InstancedMesh of poles with waving cloth in the HOME kit colours (`opts.kitCols`, from `r3d.js` `homeCols()`), placed on the upper rows of the stands; wave in the vertex shader (`uT`). Tiers 0 and 1 (half at tier 1), off at tier 2. | +1 draw call, <= 24 x 10 triangles |
| `tifo` | A banner hung under the roof front of the goal-end stand (crowd kind with a full roof), diagonal bands in the home colours. Painted as ONE EXTRA 1024 x 128 ROW of the existing ad atlas and drawn by the existing boards mesh. Deviation from the plan: no separate 512 x 128 canvas (it would have needed its own material and draw call); on at every tier. | 0 draw calls, +2 triangles |
| `flash` | Camera-flash sparkle on a goal: up to 160 `Points` in the stands (night maps), size driven by `uJump` (only at full cheer, so a save does not flash) and a per-point blink. Tiers 0 and 1. | +1 draw call, <= 160 points |
| `led` | Ad boards scroll (`adTex.offset.x`). neon, retro, street, fs_blue, fs_glass. Disjoint from tifo (the banner shares the atlas). | 0 |
| `wave` | New instanced attribute `aSec` (stand section: x / 14 m plus the side): each section sways at its own pace and phase. `cheer(0.6)` on `save` and `post` events (`r3d.js onEventInner`, two lines). | 0 |

Pitch look by turf (`opts.turf = G.turf`, offline only, painted into the pitch canvas): lush = darker with stronger stripes and less wear; firm = paler with a larger, stronger worn goal mouth; astro = flat (bands blended) with crumb speckle and no wear; grass is the unchanged paint.

### Budgets and results

Recorded BASELINE first against the untouched `stadium.js` (`node tools/stadium-test.js --update`, 52 builds: 20 maps at quality 0 and 2, plus the walls-on build for the stadium), then refactored. `node tools/stadium-test.js` (in CI) checks:
- S1 every `ISO.MAPS` id has a FLAV row and a render.js theme (render.js loads headless after `sprites.js`); every row is well formed (crowd 0.25..1, sun elevation >= 22, flags <= 24, roof full / none).
- S2 per build against the baseline: quality 0 at most +2 draw calls and +6000 triangles; quality 2 +0 draw calls and at most +16 triangles (the tifo banner; plan said +0, the banner is 2 triangles); no new lights, no new shadow casters; at most +400 points per map at quality 0.
- S3 300 frames of `update` / `cheer` / `setView`: no THREE constructor is called (no per-frame allocation); all four turf paints build.

Measured: worst draw-call delta +2, worst triangle delta +232 (flags), points +160 per night map (flash). Existing loads untouched (fx pool 220, rain 1800 segments, weather points 2200 / 1400 / 600). Deviation: "400 new points in total" is enforced per map (a build carries at most 160 new points); summed over all 20 maps it is 1362, which is not a quantity a single match ever builds.

### BROWSER-ONLY verification (6.3; no browser was available)

Dusk shadows (sunset, sakura, mud: long, soft-edged, not clipped by the fitted frustum) and the shadow texel density on the fitted frustum for every map; flags (colour, placement on the stands, wave); tifo banner (brightness, orientation, does not hide the scoreboard / look) ; camera flashes on a goal (night maps) and no flash on a save; crowd density and empty seats on the 0.25 to 1 range; turf looks (lush, firm, astro) on grass, sand, snow and the futsal courts (unchanged there); LED scroll on neon and retro; the section sway; frame time at tier 0 and tier 2 (the camera rig and presentation should stay under 0.2 ms).
Draw calls: `tools/lab-stadium.html` prints `renderer.info.render.calls` and triangles in its stats box (shadow pass included). Record them before and after for stadium, beach, fs_roof and fs_wood (select the map and read the stats line; once with the old file, via `git show HEAD:js/3d/stadium.js` saved to a scratch copy and loaded in a copy of the lab, and once with the new one). `stadium-test.js` gives the build-time renderable count per map (`calls` in the baseline file, +0 .. +2 against it).

## 6.2 third pass

Protocol: one change, `node tools/anim-gate.js`, accept only if no count rises and the excess falls. Result: nothing accepted, gate unchanged at A 307 / B 0 / C 109, excess A 342.1 / C 155.0.

Did not help (reverted, do not repeat):
- `recover` added to `LOCK_OFF` in `anim3d.js` (the tackle skate 5.4 is "R boot, recover to u=0.88"): C 109 -> 108 and excess C -0.2, but excess A +1.1; and it unlocks the planted foot in every recover (all kicks and tackles), a visible foot-slide risk the gate does not measure. Reverted as a mixed result. A narrower version (only after a tackle) would need the clip name in the lock test.
- Ball in the boot at the strike: `SP_F` 0.35 -> 0.45 and 0.39 (the strike spot further ahead of the hip, to cure 'drawn ball behind the hip line'): A 307 -> 315 both times (excess A +30 / +11): a spot further ahead is out of the boot's reach in the charge pose, which is where the gap is made. Do not widen it; the hold needs the foot brought to the ball, not the ball to the foot.
- Skill leg crossing (elastico 4.0, focus, roll, nutmeg, dragback, croqueta, feint, jockey): NOT changed. The brief's "widen abduction at the crossing keys" has no counterpart in `clips-skill.js`: the legs are not keyed, they are foot positions in the body frame solved by `place()` (the crossing allowance is a foot target property), and the gate's `legs` entries for elastico are `shins out+67ms` and `out+983ms`, i.e. AFTER the clip ends (the hand-over to the gait), the same trap as the keeper get-up. A trace of the pose at those instants (which foot, which target) is the next step; widening `FT` targets blind would only move the crossing.
- Kick-foot sweep scrape (stumble, cross, shoot, volley): not attempted (no trace made). WP4 (standing-kick plant foot) and WP5 (shoulder): not attempted.

ROADMAP 6.2 stays IN PROGRESS. The strict `anim-check` still exits 1.
