# Changelog

Release notes for DataTekkers: ISO Football. The newest work is first. The README links here instead of repeating them.

## Beta 3.01

- **3D maps fixed.** Stadiums, stands, crowds and backgrounds were missing in 3D because the stadium build failed on an undefined variable and fell back to a plain pitch. The simulation is unchanged.

## Beta 3.0

- **Menus and polish.** MyCareer is a hub of pages (overview, skills and upgrades with every stat, season table, fixtures, seasons, objectives, training, rivals, kit, collection). Quick Match and Street pick players first, then a separate match-settings page with an always-visible Play button. The Play menu is a horizontal strip. New Info page (traits, playstyles, skill moves, celebrations, keeper styles, CPU personalities, rules and modes). Player comparison deltas on the select screen and in the store. Skill Moves removed from the store (all moves are free). Weather and pitch options and a 2D/3D view toggle in the Testing Arena; the Drill Creator and custom drills support 3D. The 3D camera no longer jerks when the ball is kicked. Translations (Spanish, Korean) were removed: the game is English only. The simulation is unchanged.

## Unreleased / Phase 0 (foundation work, no new version number yet)

- **Performance, stadium options, settings backup, Korean (Phase 9.4 / 9.1 / 9.3 part).** The 3D quality now adapts both ways (a dropped tier recovers on a 60 Hz screen, upgrades wait longer after every bounce), Settings > Quality can pin Low / Medium / High, and the last automatic tier is remembered. Fixes two small GPU memory leaks in player models, caps 2D particles, rain and sprite caches, draws the menu demo at 30 fps, and saves slider drags once. New Stadium flags and Crowd density options, a settings export / import (JSON) and a one-time warning if the browser cannot save. Korean (beta, partial: menus and buttons) joins Spanish. New `tools/bench.js` and `tools/dispose-test.js` in CI. The simulation is unchanged.

- **Accessibility, challenges, languages and a debug HUD (Phase 9.1 / 9.2 / 9.3 / 9.5).** Settings gain a colour-blind and a high-contrast palette, HUD and text scale, reduce motion (follows the system by default) and reduce flashes, toggles for name tags, floating text and stamina bars, left-handed and arrow-key control presets, a second gamepad layout and a stick deadzone, and a remembered prematch pitch and weather. Three daily and three weekly challenges (the same on every device for a date) pay credits as you finish, with a streak bonus; they are local only and never count online, in the Testing Arena or on Easy. The interface can be switched to Spanish (machine translation, marked beta) and there is a pseudo-language for layout testing. A developer debug HUD (F2 with `?debug=1` or admin) shows performance, sim, input, net and AI numbers with overlays. The simulation is unchanged.

- **Advanced Training Arena and Custom Drill Creator (Phase 4.3 / 4.4).** The Testing Arena has a side panel: 0-3 defenders (standing or CPU-driven; one who holds the ball for half a second ends the rep), a live, dummy or no keeper at easy, normal or hard level, five start spots (or click the pitch), a ball played to your feet, rolling in or dropped, unlimited stamina, rain and pitch type, quarter and half speed, and links to the penalty and free-kick drills. It records your accuracy (shots, goals, on target, best streak, by shot type) for this session against all time. A new Drill Creator on the Drills screen lets you place cones, walls, defenders, a keeper and goal target zones on a top-down pitch (drag, rotate, delete, undo and redo), set your start, reps, time and scoring, test the drill at once, keep 20 saved drills and share them as a code. Authored drills pay at most 8 credits a run. No sim change for existing modes (the match simulation output is byte-identical).

- **Rivals and collection (Phase 5.5 / 5.6).** Four fictional rivals now close your MyCareer seasons: after matchday 7 an optional finale (first to 5, the CPU plays the rival's own style) pays a prize, reputation and objective credits on a win and costs nothing on a loss; each meeting makes that rival stronger and a repeat win pays a rematch bonus. New RIVALS tab (records, next level, head to head) and KIT tab (custom shirt and shorts colours). The store gets a COLLECTION tab: player cards with traits, weak-foot and skill stars, personality and celebration, side-by-side comparison, favourites, 35 sets (club, nation, rarity, era) with a one-time credit claim and a win bonus for fielded set members (+5% per set, max +15%), and duplicate stars that cut a Prime price by 10% each (max 3). Old saves load unchanged. Custom stadiums are not built yet.
- **Stadium environments (Phase 6.3).** Each 3D map now has its own sun (bearing and height, long dusk shadows on Golden Hour, Cherry Park and Mudbath), crowd density, roof or open stands, waving flags in the home team's colours, a supporters' banner, camera flashes on a goal at night, scrolling LED boards on the neon-style maps, a crowd that sways section by section, and the Pitch type (Firm, Lush, Astro) shows on the 3D pitch. Costs at most two extra draw calls. New `tools/stadium-test.js` in CI. Needs a browser look (PHASE6_NOTES.md).

- **MyCareer objectives, training and reputation (Phase 5.2 / 5.3 / 5.4).** Every career fixture now has three objectives (easy, medium, hard: score two goals, five skill moves, score from outside the box, weak-foot goal, win without conceding, beat a stronger opponent, and more) paying credits, reputation and upgrade points, plus three season objectives paid when you close the season. Fixtures also earn training XP in six programmes (your chosen focus earns double) and a training token that buys a drill as your own player; XP turns into attribute points (capped by the season, not refundable). Reputation has seven tiers and unlocks kits, looks and harder objectives. New OBJECTIVES and TRAINING tabs, an objective list in the pause menu and objective rows on the end screen. Forfeits pay nothing. Old careers load with empty training and reputation. Save schema 5. Needs a browser look (PHASE5_NOTES.md).

- **Match presentation (Phase 6.4).** A lineup intro card before offline Quick Match, MyCareer and cup matches (skip with Enter, Space or a click), first-to-N pips, a MATCH POINT pulse, a scorer ticker, a goal card, optional 3D goal slow-motion, a FULL TIME sting, and a player of the match, ratings, goal timeline and stat bars on the end screen. Two Settings toggles: Match presentation and Slow-motion goals. Needs a browser look (PHASE6_NOTES.md).

- **3D camera presets (Phase 6.1) and animation first pass (6.2).** Settings > GAMEPLAY has a 3D camera (Player chase, Close action, Dynamic, Broadcast, Low sideline, Tactical), distance, follow speed, camera shake and goal camera; the pause menu cycles the preset. Sideline cameras turn the movement keys a quarter turn. The goal camera follows the scorer, and the match end frames the winner. The drawn ball no longer jumps ahead after a kick and the gait follows each player's stride factor. See PHASE6_NOTES.md. Needs a browser look.

- **MyCareer seasons (Phase 5.1).** MyCareer is now five seasons (Break Through, First Team, Elite, Legends, The Greatest), each an eight-team league of seven matchdays against seven seeded rivals who get stronger each matchday. Table, fixtures and season history tabs; a season prize for finishing 1st / 2nd-3rd / 4th-6th, a points bonus for promotion or the title, relegation from Season 2 on. Leaving a fixture or reloading in the middle of one is a 0-3 loss. Old saves start at the season their stage matches (no retroactive prizes). New achievements for seasons won and promotions; the GOAT achievement is now winning Season 5. Save schema 4.

- **Tournament mode and Street Football (Phase 4.2 / 4.1).** A Tournament card on the Play hub opens eight-player knockout cups (Rookie, Pro, Legends, Street): pick an eligible player you own, play your quarterfinal, semifinal and final against the bracket while the other fixtures are simulated, and collect a prize per round, a trophy, a `cups` and a `street` achievement family (the 5-cup tier hands over a Legend). Quitting or reloading mid-match counts as elimination. Street Football (a Play card, the RULES segment on the select screen, and the Street Cup) plays in a walled cage: first to five or three minutes then sudden death, quicker feet, cheaper skill moves, and goals from outside the box or off a wall count double (a +2 banner in 2D and 3D, a countdown on the HUD). Offline only; online play and every default path are byte-identical. See `PHASE4_NOTES.md`.

- **Adaptive CPU, keeper styles, tactics (Phase 3.2 / 3.3 / 3.4 / 3.5).** Quick Match and MyCareer CPUs ease off after losses and tighten after wins (within half a tier, never beyond Hard; Settings toggle and reset; win bonus and keeper strength follow the level). CPU keepers get one of five styles (Aggressive, Conservative, Reflex, Sweeper, Positioning). The CPU can step onto a shot line, follow rebounds and choose skill moves from context. Offline only; online and default sims are unchanged. Also fixes a CPU-match crash in `buildMatch`.
- **AI personalities (Phase 3.1 / 3.3 / 3.5).** The offline CPU now plays one of seven archetypes (Aggressive, Technical, Defensive, Clinical, Unpredictable, Counter, Possession), worked out from the opponent's playstyle, traits and attributes and shown as an AI chip on the select panel and in MyCareer. They change decisions (tackling, pressing, skill moves, shot selection, hold-up, counter attacks, dropping deep), never speed or reactions. The plain `create(diff)` brain is unchanged. New `tools/ai-test.js` (legacy identity, profiles, decision snapshots, signatures, matrix, anti-stuck; `--smoke` in CI), `sim.js --pers`. Notes in `PHASE3_NOTES.md`.

- **Signature celebrations (Phase 2.5).** Eight goal celebrations (Fist Pump, Arms Wide, Point Up, Salute, Robot, Sit Down, Knee Drop, Spin Leap) in 3D clips and 2D poses; every character has a signature one (the 20 stars by hand, others by playstyle) and the Store has a Celebrations tab to buy and equip others (global, like the ball skin). Each has its own goal-camera framing in 3D. Online, the pick carries a validated `celeb` (cosmetic, never in the sim). Profile `schema: 2` with a migration; MyCareer gets a stronger-foot toggle and a trait panel showing each trait's score against what it takes; online lobby slots show trait tags; the server sends a sim revision (`ISO.SIM_REV`) and a mismatching client is warned. The sim is unchanged. Notes in `PHASE2_NOTES.md`.

- **Player individuality (Phase 2.2 / 2.3 / 2.4).** Every character now has a playstyle (Winger, Poacher, Playmaker, Target Man, Engine, Stopper), a weak-foot star rating and one to three traits out of ten (Quick Step, Technical, Finesse Specialist, Power Header, Acrobatic, Long Shot Taker, Press Resistant, Relentless, Quick Reflexes, Trickster). They are worked out from the catalogue, shown on the select panel, in the store and on pack reveals, and they change the simulation: acceleration, turning, stopping and stride per body and role (top speed differs by at most 2.4% between playstyles), shot spread and pace, headers and volleys, stamina, stumble and tackle recovery, skill-move cost and mistakes, touch quality under pressure, and what the CPU chooses to do. Weak-foot now also affects passes across the body and skill moves toward the weak side, and a weak-foot strike shows a WEAK FOOT label. Same build on both ends needed online (nothing new is sent). `ISO.STYLE_OFF` restores the old sim exactly. New `tools/balance.js` (mirrored trait-on/off matches); new checks in `tools/check.js`. Notes in `PHASE2_NOTES.md`.
- **Advanced ball physics and physical interactions (Phase 1.3 / 1.4).** Pitch type (STANDARD, FIRM, LUSH, ASTRO, offline matches only) and rain change drag, bounce height, how much speed a bounce keeps and how hard spin bites; shots carry topspin or backspin (chips die on landing, driven shots skid on), sidespin kicks the ball sideways at a bounce; the goal frame is a set of round tubes (crossbar rebounds, underside goals). Body size and strength set mass, taller defenders reach further, and tackle, shoulder and bump outcomes and stumble length depend on closing speed, balance, agility and height (stumbles are capped at 0.3 s). Rain keeper reads, rain pass speed and wet slides now use the wet surface. Config in `C.PHYS`, API in `ISO.Phys`; see `PHASE1_NOTES.md`.
- **Animation (Phase 0.2, in progress).** The 3D animation quality gate (`node tools/anim-check.js`) still fails its strict limits; this work lowers the numbers. Foot plants from the run cycle are now inherited by the clip foot lock, an abandoned first-time approach is let go over about a quarter of a second instead of in one frame, and header lunges move at a speed a body can have. The numbers are in `HANDOFF.md`.
- **Animation, latest.** The drawn ball no longer re-aims during the kick hold, a foot lock that was released on the frame it was taken no longer drags the plant foot (it hops through level, 7 cm, not seen in a browser), and the keeper's fall after a catch in the air runs on a smooth clock. anim-check A 326 to 315 fails (excess 486.1 to 366.3), C 130 to 120.
- **Context-selected shot types (Phase 1.2, milestone 2a).** No new buttons: the shoot / finesse / power / chip keys now resolve to a volley, half-volley, header, diving header, driven shot or outside-of-the-foot shot from how the ball arrives and how you are moving (`ISO.Game.resolveStrike`, a pure function the AI and the 3D approach also call). Each kind has its own power, error and keeper-reaction tuning (`C.SHOT`); a diving header puts the player on the grass (`hdive` then `down`). Keeper parries now rise higher, so headers come up more often. The 3D clips follow the sim's resolved kind, 2D and 3D show a short label, headers have their own sound, and the controls help explains it. Details in `PHASE1_NOTES.md`.
- **Dribbling review fixes (Phase 1 M1).** A first-time shot that was winding up when possession flipped no longer fires for the team that lost the attack. Shielding now ends after 2.5 s (1 s cooldown) or when stamina runs out, and the CPU no longer re-arms its shield every 0.4 s. The CPU's reaction to a dribbler's stop now fires once per stop. Jockey while carrying the ball at speed is always a hard brake.
- **CI (Phase 0.5).** `.github/workflows/ci.yml` runs syntax checks, `tools/check.js`, `tools/sim.js`, every `server/test*.js`, a version-agreement check and the animation ratchet `tools/anim-gate.js` on every pull request and push to main. `tools/check.js` and `tools/sim.js` now set a failing exit code on violations.
- **Docs (Phase 0.6).** README trimmed; this changelog, `ROADMAP.md`, `HANDOFF.md` and `TECHNICAL_ARCHITECTURE.md` added. `ISO.VERSION` in `js/data.js` is the single source for the menu's version label.
- **Netcode (Phase 0.3 / 0.4).** Protocol 3 adds compact floats and tick-suppressed timers to the lossless deltas (2v2 offline delta mean 950 to 802 B; clients send `v: 3`, v1/v2 still served). The legacy interpolating `ISO.Net.apply` branch is gone. Earlier: Delta snapshots (protocol 2, lossless, with keyframes and resync), server-side input validation and admin check, and bandwidth benchmarks (ROADMAP 0.3/0.4) have landed; see `server/NETCODE_NOTES.md`.

## What's new in Beta 2.81

- **Weather.** Pick CLEAR or RAIN on the player-select screen. In the rain every player, attackers and defenders on both teams, can slip, and ground shots and passes skid faster and skip along the pitch. Rain is drawn in both the Classic and 3D views. Drills, online matches and MyCareer stay clear.
- **3D kits.** Shirts are looser, shorts are real flared shorts on each leg, and sleeves are baggier. The shirt hem, shorts and sleeves move with cloth physics, and long hair, braids and buns swing.
- **3D players.** Socks are shorter, torsos and hips are slimmer, and Vinícius Júnior has a sharper, longer chin.
- **MyCareer.** You can change your player's name and shirt number.
- **One on One.** You can now dribble before you shoot.
- **Camera.** The Cinematic option is gone from the Match camera setting; drills that default to it still use it.

## Beta 2.63

- Every drill card now has its own illustrated player; MyCareer and Long Shots swapped artwork, and the Quick Match shirt reads MESSI.

## Beta 2.62

- **Drills** menu scrolls left to right instead of fitting all cards on one page.
- Chip, Free Kick, One on One, Long Shots and Finesse always use the cinematic camera, which is now higher and zoomed in.
- Long shots start closer so the player and ball stay in bounds; fixed the Free Kicks start screen not closing.

## Beta 2.61

- **Free kicks** now have a wall of four defenders, and always play in the cinematic camera.
- **Cinematic camera** is zoomed in and limited to part of the pitch width, following the ball sideways; the goal replay uses the same angle.
- The main-menu featured-player panel is removed.

## What's new in Beta 2.4

**Roles.** You are an *attacker* while your team last had the ball (you or a teammate holds it, or your side touched it last) and a *defender* once the other side gets it. Attacking keys do nothing while defending, and defending keys do nothing while attacking, so the two sets can share physical keys. A key held through a change of role is not treated as a fresh press.

**Defensive moves** (new, rebindable, off while you attack):

- **Tackle** and **Slide tackle** have their own keys. A slide no longer needs a sprint.
- **Shoulder** — a short barge at the nearest opponent. A strong defender can knock the ball loose; it is much weaker against a dribbler mid-move or one shielding the ball. It cannot be dodged for an ankle break.
- **Focus** (hold) — a low, side-on defensive stance. While focused you
  - get steered onto the line between the dribbler and the goal (and onto the path of a shot in flight), travelling with them rather than chasing where they were, and swinging round the side rather than through them if you end up level or behind;
  - ignore the protection a skill move gives the ball, and have a chance to read the move and steal the ball mid-skill;
  - slow a close dribbler (sprint and burst are dampened, and driving straight into you is slow);
  - sometimes slide to block a shot on their own, and lunge in with a tackle if the dribbler gets past you;
  - drain stamina while held.

**Shooting.**

- Wind-ups are about a third quicker for every shot type.
- A quick tap on the **normal** shot key is a **fake shot**: a faster swing, then a burst of speed. Tapping finesse, power or chip fires a quick, weak shot instead.
- Long-range shots come in harder and no longer lose accuracy with distance.

**Goalkeepers.**

- The keeper dives at every shot on target. Its ratings (nerfed on lower difficulties, boosted on Hard) decide how well it aims, how far it reaches and how often it gets a hand to it.
- Most saves from a dive are deflections, not catches. Shots from outside the box are easier to save.
- A scooped chip is the one shot the keeper stands tall for.
- The keeper runs out and slides more slowly than before, and a keeper on Normal now has its full ratings.

**Controls.** Tackle, Slide, Shoulder and Focus join the key list, with overlap-friendly rebinding and gamepad buttons.
