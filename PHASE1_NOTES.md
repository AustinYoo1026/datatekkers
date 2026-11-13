# Phase 1 Milestone 1: advanced dribbling (coder D)

No new button. The jockey key does three things while you own the ball.

- Hold = close control: speed cap `jog*(0.62+0.16*q(dri))`, ball lead 7 px, side offset 15 px, ball pull x1.35. `p.shield` only when an opponent is within `SHIELD_R` (95 px); shielding costs `SHIELD_STAM` (4) stamina per second.
- Fresh press at speed (> 0.75 jog, `sgCd` 0, no charge, not a spot drill) = stop (brake): `stopT = STOP_T - 0.05*q(agi)`, 2 stamina, event `stop`. Target speed 0, rate `22+14*q(bal)` (x0.8 in rain). Ball lead 6, pull x1.6.
- When `stopT` reaches 0, `goT = GO_WIN` (0.32 s). Sprint + a direction with jockey released inside it = burst: velocity `dir*jog*(0.75+0.35*q(acc))` (x0.7 if hemmed by a focused defender), `boost = max(boost, 0.5+0.3*q(acc))`, 3 stamina, event `burst`.

## Sim fields (game.js)
`close`, `stopT`, `goT`, `sgCd`, `shHeld`, `shLock` on the player (makePlayer / resetPlayer; the shield timers rest at exactly 0). `close` and `shield` are cleared after `updateBall` for anyone who is not the owner. `jockey` added to `snapPrev`. Tuning: `ISO.C.DRIB` (not serialised).
Other changes: ball pressure wobble (opponent < 60 px or jostle), first-touch heaviness (standing/jockeying x0.6, sprinting x1.25, opponent < 40 px x1.15*(1.2-0.4*q(bal)); `touch` event gets `heavy:true` above 0.6), shield tackle multiplier `lerp(0.5,0.22,0.6*q(str)+0.4*q(bal))` (was a fixed 0.3), body-collision weight of a shielder `1.2+0.3*q(str)`, ball roll in close control (jockey held + L, any direction; `rf` forward/back variants, speed from the stored jog ratio `jr`).
CPU (ai.js): `m.sg` stop-and-go sequence, a 0.4 s shield when pressed from beside/behind and tired (re-armed at most every 2.5 s), overrun of a human stop (`foolP*0.6`, one roll per stop via a latch `m.ovDone` cleared when the opponent's `stopT` is 0; about 66 reactions per 150 normal matches).
Shield cap: shielding turns off (close control continues) when stamina is exhausted/zero, or after `C.DRIB.SHIELD_MAX` (2.5 s) of continuous shielding, then stays off for `C.DRIB.SHIELD_CD` (1 s). Timers `shHeld` / `shLock`. Invariant and a check scenario cover it.
Behaviour change (deliberate, design call): jockey while owning the ball above 0.75x jog is now always a hard brake (stop), so jockey can no longer be used to just slow down while carrying the ball at speed.
Fix: a first-time charge (`c.ft`) is cancelled with no shot when the attack flips to the other team (or a clear is pending) while it winds up; this removed the 'shot by a non-attacker' violation.
3D: `close` and `stopT` are exposed in `js/3d/adapter.js`; the animation hook is deferred (the Phase 1 sim work, coder D, did not touch `anim3d.js`; the separate animation pass, coder C, did).
2D: render.js poses for stop and close control, dust on `stop`/`burst`, replay tape carries `close`/`stopT`, audio cues. `stop` and `burst` are in the net.js `OWN` table.

## Tests
- tools/check.js: invariants (timers finite and non-negative; close/shield imply ownership) and scenario 9 (brake < 30% within STOP_T and keeps ball; burst fires once and reaches jog within 0.1 s for high acc; high-acc faster than low-acc; close-control distance < 27 px; shield from behind wins less than from the front over 200 seeds, 45 front vs 26 behind).
- tools/sim.js prints stop and burst counts.

## Balance numbers (CPU vs CPU)
- After the review fixes (charge cancel, shield cap, overrun latch): 150 matches normal 596 goals, 2710 shots, 0.99 min.
- 150 matches normal (before the fixes): 593 goals, 2755 shots, 1.02 min average (the same run with the new CPU behaviour disabled: 599 / 2767 / 1.02). 40-match runs move +-10% on noise alone.
- 120 matches hard: 467 goals, 2051 shots, 0.87 min.
- CPU uses stop-and-go about 0.7 stops per match (normal).

## Multiplayer compatibility
- Fully supported: all new state (`stopT`, `goT`, `sgCd`, `close`, `shHeld`, `shLock`, charge fields) lives on the player and serialises generically in the snapshot / delta; the edge-triggered brake rolls back correctly because `jockey` is in `snapPrev` (`prev.jockey`); `stop` / `burst` are in the `OWN` tables of net.js, test-crossplay.js and test-lag.js. Server tests pass at PROTO 1, 2 and 3.
- Offline only: the CPU AI behaviour (stop-and-go, shield re-arm, overrun reaction). The server has no CPU players. No sim-version handshake exists; mixed client/server sim versions are not detected (design call, not done).

## Known follow-ups
- 3D animation hook and 3D dust for stop/burst are not done.
- check.js: 0 violations in 60 matches and in a 2000-match scan (same seeds and pairings as check.js) after the first-time-charge fix.

# Phase 1 milestone 2a: context-selected shot types (no new buttons)

The shoot / finesse / power / chip keys are unchanged. `ISO.Game.resolveStrike(G, p, type, ft, aim, power, ball)` (js/game.js) is a pure resolver (reads state, writes nothing, never calls `G.rand`; `check.js` asserts the RNG state and the whole game JSON are unchanged and the result repeatable) that returns `{ kind, foot, weak, pressure, reach }`. `ft` = the ball is loose; `ball` optionally overrides `G.ball` (the AI passes the ball's predicted state). First match wins:
- loose ball: `diveheader` (z 10-34, 26-48 px away, speed > 0.6 jog and moving toward it, dot > 0.5, goal within 200 px), `header` (z 20-44, within 26 px), `halfvolley` (bounced within 0.12 s, rising, z < 14, within 28 px), `volley` (z 8-20, within 28 px), else the ground first-time (z < 20, 28 px). Chip / finesse / power keys keep their own shot on the ground; only `header` and `diveheader` replace the vertical speed (vz) and drop spin, so there the key just scales power; volleys and half-volleys keep the chip / finesse / power path (spin, chip vz 470) with the kind's v / vz / err multipliers. A chip-key half-volley halves vz, so its speed is divided by the same factor (capped 900) to still reach the goal. Reach: headers and dive headers reach wider (dive 26-48 px, header 26 px) than feet (28 px); the ground first-time needs z < 20. `outside` also curls back onto the target (aim offset applied with the reversed spin) and is off in drills (`G.drill`). The AI and the human first-time charge share `C.SHOT.T.ftPress` (110 px). A held pass key can also play a lofted cross.
- owned ball: `outside` (finesse or normal key, a weak-footed strike, `wf` < 0.6, turn 0.2-0.9 rad: struck with the strong foot, curl reversed), `driven` (normal key, wind-up power < 0.75, speed > 0.7 jog at release, goal within 260 px; the quick-tap fake shot (< 0.18 s) is unchanged), else the pressed type.
Config: `ISO.C.SHOT` (thresholds in `SHOT.T`; per-kind `v, vz, err, react, through, recover`). Pressure (nearest opponent 45 px -> 0, plus jostle) adds up to +25% error on every shot. The first-time charge now starts at ball z < 90 (was 45) and reach comes from the resolver.
Sim fields: `b.bncAt` (time of the last bounce, -9 at reset), `b.shot.kind` (`b.shot.type` is unchanged for drills / powerGoals / keeper code), `p.kickKind` / `p.kickFoot` (cleared in resetPlayer), `p.state = 'hdive'` (0.5 s, then `down` for `SHOT.diveheader.recover` 0.45 s), `kick` event gains `kind` and `foot` (no new event types, so no OWN table change). Keeper: reaction time x `react`, beaten-by-pace chance x `through`, parry vz raised from 80-200 to 160-300 so parries rise to head height. The pass key is untouched; option for later (needs approval): a held pass as a lofted cross for headers in 2v2.
AI (ai.js): the loose-ball branch resolves the strike on the predicted ball at arrival and holds shoot for volleys, half-volleys and headers as well as fast ground balls.
Animation: adapter latches `kind` / `foot` (outside uses the event foot); `kickVariant` picks the clip from the kind (half-volley = volley clip at low z, driven = power, outside = finesse, dive header = header); `kickReady` uses `C.SHOT.T` heights. 2D: `hdive` reuses the slide/dive pose, `kickKind` in the replay copy, floating label per kind (render.js, fx3d.js), head-contact sound. Not done: dedicated 2D sprite poses per kind, a dedicated 3D dive-header clip (the header clip plays during the kick window, then the existing `down`).
Help text: meta-ui key list, index.html skill panel, main.js hint.

## 2a tests and balance
- check.js: scripted kind scenarios (ground first-time, falling volley, just-bounced half-volley, z 30 header, running dive header and its recovery, sprint driven, outside foot with a weak foot), purity, invariants (header kick at ball z >= 19, hdive ends in `down` while play continues, every shot has a kind). 60 matches: violations {}.
- sim.js 150 normal matches: 597 goals / 2938 shots / 1.04 min (baseline 593 / 2755 / 1.02: shots +7%, goals +0.7%). Kinds: normal 1369, finesse 426, chip 265, first-time 242, header 222, power 205, outside 96, driven 57, diving header 32, half-volley 18, volley 6. Volleys are rare because the AI rarely meets a falling ball inside 8-20 px height at contact; headers (222) are mostly from keeper parries.
- Server tests: determinism, delta, integrity, test.js, crossplay (PROTO unset/2/3), lag 50 10 all OK. bench-bandwidth: 1v1 delta 619 B, 2v2 delta 1136 B; with the new fields removed the same tree gives 1113 B (+2.1%), 1v1 unchanged.
- Knobs / risks: `SHOT.T.driven.power` (0.75) and `spd`; client / server may resolve a different kind on a mispredicted frame (cosmetic: the ball is corrected by the snapshot); wider first-time reach raises first-time scoring a little (watch the save rate).

# Phase 1 milestone 3: advanced ball physics (1.3)

Everything lives in `js/game.js` and is exported as `ISO.Phys = { surf, ballMotion, predict, passSpeed, rollDist, landT, hitSeg, height, mass, stumbleDur }` (`ISO.predict` kept). Config is `ISO.C.PHYS` (never serialised).

## Config tables (`C.PHYS`)
- `AIR {k1 .2, k0 0, z 1}`, `MAGNUS {acc 560, vRef 500, vMin 60, decay .9}`, `BOUNCE {vMin 90, side .10, top .12, topE .15, keepMin .55, keepMax .97, spinKeep .6}`, `SPIN {chip -.6, power .3, driven .45, volley .25, halfvolley .2}` (topspin + / backspin -, picked by shot kind then type, else 0; headers 0), `PASS {arrive 170, vMin 200, vMax 1000, dv 10}`, `FRAME {r 4, barZ 65, e .65, mu .1, spinKeep .3}`, `WALL {e .82, board .35, spinKeep .5, vyKeep .9}`.
- `SURF[turf][dry|wet]`, every row complete (built at module init, blank cells inherit grass dry). Keys: `k1 k0` ground drag, `e` vertical restitution, `keep` horizontal retention at a bounce, `bite` spin effect at a bounce, `zip` wet launch boost, `grip` player acceleration rate, `brake` stop rate, `slide` slide-tackle decay, `slip` slip chance multiplier (0 = none), `skip` (wet hop or null).

| turf (dry) | k1 | k0 | e | keep | bite | grip |
| --- | --- | --- | --- | --- | --- | --- |
| grass (STANDARD) | .70 | 28 | .48 | .84 | 1 | 1 |
| firm | .58 | 24 | .56 | .88 | .9 | 1 |
| lush | .85 | 36 | .40 | .78 | 1.15 | 1 |
| astro | .62 | 22 | .54 | .86 | 1.25 | 1.04 |

Wet rows: grass wet `k1 .5, k0 20, bite .6, zip 1.12, grip .92, brake .8, slide 2.2, slip 1, skip {330, 20, 25, .25, .15}`; the other turfs scale `k1`/`k0` by .71 and take the other wet columns from grass wet. `surf(G)` returns `SURF[G.turf || 'grass'][G.ball.wet ? 'wet' : 'dry']` and is resolved on every call: never cache a row on G or the ball.

## State and behaviour
- New state: `G.turf` (string, set in `create`; unknown turf, drills and solo force `'grass'`), `b.tsp` (topspin +, backspin -; rests at exactly 0; every `b.spin = 0` became `b.spin = b.tsp = 0`), `b.bncV` (vertical speed of the last bounce, for the event power). The `bounce` event now carries `{ power }`; the `post` event carries `{ power, bar }`.
- `ballMotion(s, dt, spinF, S)`: Magnus, air drag, ground drag and the bounce all read `PHYS` and the surface. Bounce: `e = S.e*(1-topE*tsp)`, `keep = clamp(S.keep*(1+top*S.bite*tsp), keepMin, keepMax)`; sidespin rotates the horizontal velocity in the Magnus direction by `spin*side*bite`, then spin and tsp are cut by `spinKeep`. Zero spin takes the old path bit for bit (tested with `Object.is`). There is no in-air dip from topspin (the chip solver, `shotLine` and the AI assume ballistic flight).
- `predict(b, x, spinF, S)` copies `tsp` and takes the surface. Callers pass `surf(G)`.
- `passSpeed(d, S)` is the same search with the surface drag; `doPass` multiplies by `S.zip`.
- Player: brake rate x `S.brake`, acceleration x `S.grip`, rain slip gated by `S.slip` (chance x `S.slip`), slide decay `S.slide`. Wet ball skip uses `S.skip`.
- Goal frame: `hitSeg` replaces the post circles and the crossbar plane test. Two posts and the bar are capsules (radius `FRAME.r` + ball radius, bar centre `barZ` = BAR+5, so the scoring band is unchanged: goals below about BAR-5, out at `z >= barZ`). Contact pushes out along the 3D normal, reflects the normal speed with `1+e`, takes `mu` off the tangential speed and spends spin. A ball runs at most about 12 px per step against a 20 px contact diameter, so it cannot tunnel (tested, speeds 200..1300).
- UI: PITCH segment (STANDARD / FIRM / LUSH / ASTRO) beside WEATHER on the select screen, hidden online and in the arena, not persisted. 2D shows `<TURF> PITCH`, `CROSSBAR!`, bounce dust scaled by the bounce power. 3D: the adapter sets `vf.turf`, `vf.surf`, `B.tsp`; `ball3d.js` dead-ball integrator reads `vf.surf` (dry-grass literals remain the fallback).
- AI (`ai.js`): landing time `ISO.Phys.landT(b) * 0.9`; gravity literals now `C.GRAV` (bit-identical).

## Multiplayer classification
Physics, `b.tsp`, the goal frame and `G.turf` itself are fully supported online (generic snapshot codec, no net.js change; a snapshot applied onto a game created with a different turf continues bit-identically: `tools/test-physics.js`, `server/test-determinism.js`). Turf and rain SELECTION is offline only: `Room.start` passes `turf: 'grass'` and the server never reads a turf from a client message (`server/test-integrity.js`). Online turf option deferred (roadmap 8.4).

## Deliberate behaviour changes
1. The keeper reads and on-target stats now use the wet drag in rain (they used dry drag: `predict` did not copy `wet`).
2. `passSpeed` in rain uses the wet row (it used the dry loop and then x1.12).
3. Wet slide-tackle decay is 2.2 (was 2.6).
4. Goal frame: round tubes in 3D (balls can now hit the underside of the bar and drop in, or bounce off the top); `post` events can carry `bar`.
5. Shots now carry topspin or backspin (chips backspin: they die on landing; power and driven shots skid on).
Stage A (config moved, no behaviour change) was verified against a copy of the old `game.js`: 8 seeded CPU matches (6 clear, 2 rain), hash of ball, player and RNG state every 40 steps: all 8 identical, including the rain matches (the two documented rain fixes did not change those traces).

## Tests
`node tools/test-physics.js` (384 checks): config completeness and ranges, fallback and forcing rules, roll distance vs closed form (within 1%) and ordering, pass arrival speed, bounce rebound (about e^2), rest within 5 s, retention order topspin > none > backspin, sidespin direction and bound, zero-spin identity, Magnus symmetry, air vs ground drag, goal frame grid (9945 shots), fuzz 2000 states x 600 steps, determinism and snapshot round trip across turfs, body mass, stumble, bump and barge checks. `tools/check.js` has invariants (tsp finite, |spin| <= 1.01, ball not inside the frame, stumble <= 0.52, valid turf) and a scenario with one match per turf and wet state. `tools/sim.js` takes `--turf=` and `--rain` and tests z and tsp for NaN.

## Balance (150 normal CPU matches, same seeds)
| run | goals | shots | tackles | post events | min |
| --- | --- | --- | --- | --- | --- |
| before (old game.js) | 596 | 2954 | 2404 | 367 | 1.04 |
| after, standard grass | 587 | 2779 | 2510 | 339 | 1.04 |
| firm | 596 | 2925 | 2537 | 399 | 1.09 |
| lush | 596 | 3035 | 2553 | 342 | 1.10 |
| astro | 598 | 3170 | 2719 | 366 | 1.17 |
| rain (grass) | 595 | 2784 | 2393 | 352 | 1.05 |
| rain firm / lush / astro | 600 / 600 / 587 | 3139 / 3133 / 2795 | 2667 / 2607 / 2599 | n/a | 1.19 / 1.16 / 1.09 |
Standard grass: goals -1.5%, shots -5.9%, tackles +4.4%, match length equal. Each turf is within 2% of grass on goals; shots rise on the fast turfs (astro +14%) because play is more open there. No stuck or unfinished matches. Knobs if a later pass wants it: `FRAME.r` (lower if goals fall), `BOUNCE.top` (halve if goals rise > 5%).

# Phase 1 milestone 4: physical interactions (1.4)

No new player inputs. New player field `fallDir` (stumble direction, initialised to 0 in `makePlayer`).
- `C.PHYS.BODY`: `htMin .88, htMax 1.14, massHt 1.5, bodyZ 24`, `STUMBLE {hard 1.3, easy .7, wBal .55, wAgi .3, wHt .15, imp .35, lo .06, hi .3, decay [1.15,.85]}`, `TACKLE {vRef 300, mid .735, ch .08, knock [.8,1.25], clean [1.15,.7], reachHt 1}`, `SHOULDER {vRef 250, mid .6, mom .25, ht .6, push 130, keep [.2,.45]}`, `BUMP {vRef 160, scale [.55,1.5], jostle [1.25,.75]}`.
- `height(p)` comes from `def.look.h` clamped to 0.88..1.14 (computed each call, identical on client and server). `mass(p)` replaces `heavy()` and adds `1+massHt*(height-1)`. `stumbleDur(p, base, I, hi)`: a neutral player (balance and agility mid, height 1) at I = 0.5 gets exactly `base` (0.1 / 0.16 / 0.18); capped at `STUMBLE.hi` 0.3 s (the rain slip passes 0.5). The `stumble(G, o, base, extra, I, dir, hi)` helper keeps today's noCtrl gaps (.10 standing tackle, .04 slide, .04 shoulder, .06 bump, .06 focus, .10 slip) and records `fallDir`.
- Tackle: closing speed `I = clamp(closing/300, 0, 1)`; win chance `+ ch*2*(I-mid)`, knock speed x `lerp(knock, I)`, clean-win probability x `lerp(clean, I)`, stumble scaled. Reach x `1+reachHt*(height-1)`. Slide body hit slows the target by `lerp(.75,.5, massShare)`; jostle scales with balance.
- Shoulder: win chance gains `mom*(cl-mid) + ht*(height(p)-height(o))` (same 0.08..0.85 clamp), push on the target `push*2*massShare*clamp(cl,.5,1.3)`, on a miss the barger keeps `lerp(keep, massShare)` of its speed. Body bump: probability x `clamp(closing/160, .55, 1.5)` before the 0.02..0.45 clamp; jostle scaled by balance; the stumble faces along the contact normal. Stumble velocity decay `7*lerp(decay, q(bal))`. Ball-to-body contact height is `24*height(p)`.
- Calibration: over 50 CPU matches the mean tackle closing ratio was 0.735 (median 0.87) and the mean bump closing speed 159 px/s; the neutral points were set to those means. The CPU never shoulders, so `SHOULDER.mid`/`vRef` are design values (a human running barge is about 0.6 of 250 at contact).
- Tests: see `tools/test-physics.js` (mass, stumble, barge 400 seeds: strong tall 346 wins vs weak short 53, closing run-up 238 vs standing 201; clean-win share falls with closing speed; lighter body displaced more, no NaN at d = 0). Tackles stat +4.4% (within +-5%).
- Not done: scaling header reach by height (only `height` is exported), the 3D animation follow-up (`clipStumble` plays by `pv.u` only: it does not read `fallYaw`; the adapter already passes `fallDir` as `fallYaw`).
