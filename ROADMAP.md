# Roadmap

Source: `DATATEKKERS - MASTER DEVELOPMENT ROADMAP & AUTONOMOUS CODEX IMPLEMENTATION DIRECTIVE.md` (kept outside the repo; Part II is the item list, Part IV the rules). Statuses: NOT STARTED, IN PROGRESS, BLOCKED, TESTING, COMPLETE. Nothing is COMPLETE until its criteria are met and documented.

Priority uses the roadmap's Part IV order (P1 critical bugs and security .. P11 optional quality of life). Complexity: S, M, L, XL. Phase 0 is mandatory before any dependent work. Items past Phase 0 have criteria summarised from Part II, which stays the authority.

Phase 2 session 2 (2.5 celebrations, save schema 2, sim revision handshake) is in TESTING, see `PHASE2_NOTES.md`. Phase 2 session 1 (2.2, 2.3, 2.4; 2.1 and 1.5 skipped by the user) is in TESTING, see `PHASE2_NOTES.md`. Earlier session: Phase 0 remainder (animation 0.2, audit 0.1, protocol 3 for 0.4, 0.3 scope decision); the strict animation gate still fails and Phase 0 is not complete. See `HANDOFF.md`.

## PHASE 0 - TECHNICAL STABILIZATION (mandatory first)

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Repository and architecture audit | TESTING | none | P2 / M | Audit written in TECHNICAL_ARCHITECTURE.md ("Audit": duplicated systems, dead code, outdated docs, bottlenecks named but not measured, modularisation candidates). Removed the legacy `ISO.Net.apply(G, s, to, f)` interpolation branch (no callers) and a no-op in anim3d.js; declared `st.rdH`. Nothing else refactored on purpose. |
| 0.2 | Fix 3D animation transitions | IN PROGRESS | none | P2 / L | `node tools/anim-check.js` exits 0 with the original thresholds (TH untouched). Today (own last run, with the other coder's sim changes in the tree): A 315 fails, B 0, C 120; excess A 366.3, C 200.6 (start: 341 / 0 / 129, excess A 538.2). Done: ball re-aim during the kick hold fixed, foot lock stuck-lkS hop-through (`lkC`), keeper hold fall on a smooth clock. Not done: keeper landing absorb, gkHand, seedFeet both-airborne (measured worse), kick carry, stepover/diveHigh key pops. The strict gate still fails. |
| 0.3 | Multiplayer integrity | COMPLETE for the unranked scope | 0.1 | P1 / L | Ownership verification is deferred to 8.1/8.5 (accounts): the profile is client-side, so the server cannot know what a player owns. Server-side: pick rebuilt from id/prime/skin (extra fields such as stats/attr/ovr are stripped, tested in test-integrity.js), move ids filtered, inputs sanitised, rate limits, admin hashed. Prime/ownership claims are cosmetic online, which is why online pays no credits. |
| 0.4 | Multiplayer bandwidth optimization | TESTING | 0.1 | P2 / L | Protocol 3 (js/net.js, server keeps v1/v2): lossless deltas with compact floats (base64 of the 8 bytes when the JSON text is longer than 14 chars) and tick-suppressed timers. Offline bench 2v2 delta mean 950 B (v2) to 802 B (v3), 1v1 about 527 B; live 20 s: 2v2 41.8 to 35.2 KB/s down. test-delta (PROTO=3) bit-exact, test-crossplay and test-lag pass at PROTO=1/2/3. Deflate stays opt-in. |
| 0.5 | Automated testing and CI | TESTING | none | P1 / S | `.github/workflows/ci.yml` runs syntax, invariants, CPU sim, server tests (determinism, lag, crossplay, integrity, delta), version check and the animation ratchet on every pull request and push to main. Not yet run on GitHub (only the commands, locally); a first green run on GitHub completes it. |
| 0.6 | Documentation and organization | TESTING | 0.2, 0.4 for final numbers | P2 / S | Version numbers agree (ISO.VERSION, README, index.html; CI checks), README current, links fixed, historical releases in CHANGELOG.md, branding standardized, misleading security claim removed. Branding in index.html and the in-game title screen was not audited. |

## PHASE 1 - CORE GAMEPLAY OVERHAUL

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Advanced dribbling system | IN PROGRESS (M1: sim, CPU, 2D; 3D animation hook not done; shield capped at 2.5 s) | 0.2, 0.4 | P4 / L | Close control, directional rolls, stop-and-go, shielding, attribute-dependent; 2D and 3D; determinism tests green. |
| 1.2 | Expanded shooting mechanics | IN PROGRESS (2a: context-selected volley / half-volley / header / diving header / driven / outside-foot done, no new buttons; still open: 2D kick sprites per kind, a held-pass lofted cross, per-attribute trait tuning) | 0.2 | P4 / L | New shot types play in 2D and 3D, tuned per attribute, keepers respond; determinism green. |
| 1.3 | Advanced ball physics | SIM DONE (3D visual pass pending) | 0.4 | P4 / M | Spin, drag, bounce and rain interact consistently across game.js, 2D and 3D; no determinism change between client and server. |
| 1.4 | Physical interactions | SIM DONE (3D stumble direction pending) | 0.2 | P4 / L | Shoulder, shielding, collisions and falls read correctly in 3D; balance tuned. |
| 1.5 | Match situations | SKIPPED (user decision) | 1.1-1.4 | P3 / M | Corners, throw-ins and similar restarts exist in the simulation and render in 2D and 3D. Not part of the Phase 2 session 1 scope. |

## PHASE 2 - PLAYER INDIVIDUALITY

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Signature player animations | SKIPPED (user decision) | 0.2 (stable animation system) | P5 / XL | Per-player animation profiles pass anim-check with the same thresholds. Not part of the Phase 2 session 1 scope. |
| 2.2 | Player traits and playstyles | TESTING | 1.1, 1.2 | P5 / L | Ten traits and six playstyles (roles) resolved by `ISO.styleOf(def)` from the catalogue def (nothing stored in the sim or profile, so nothing to save: the profile already holds the owned ids, primes and skins that determine them). Traits change sim behaviour (shot spread and pace, stamina, stumbles, skill cost and botch, dribble touches, AI choices); UI chips and descriptions; per-trait A/B, role A/B, coverage and byte-identical STYLE_OFF checks in `tools/check.js`; mirrored balance harness `tools/balance.js`. See `PHASE2_NOTES.md`. Not yet play-tested by a person. |
| 2.3 | Individual movement profiles | TESTING | 2.2 | P5 / M | Role factors plus continuous body factors (height, width, strength) on top speed (+-1.2%), acceleration curve (off the mark vs late), cuts, turns, stops, stride, dribble lead and pull. Orderings asserted in `tools/check.js`; top-speed spread across roles 2.4%. 3D stride/footfall shift is covered by the animation gate (section C moved, see `PHASE2_NOTES.md`). |
| 2.4 | Weak-foot system | TESTING | 2.2 | P5 / M | Weak foot (star rating from 92/84/74/62) now also affects passes across the body (error x(1+0.6(1-wf)), pace x(0.93+0.07wf)) and skill moves toward the weak side (botch +0.03(1-wf), exit pace x(0.94+0.06wf)); shots already used it. `kick` events carry `weak` (and `foot` on passes), floating WEAK FOOT label 2D/3D, UI stars; the CPU lines up its strong side when its weak foot is poor. No 3D weak-foot animation. |
| 2.5 | Signature celebrations | TESTING (8 celebrations, store tab, 2D and 3D, online cosmetic; needs a browser look) | 0.2 | P5 / M | Per-player celebrations in 3D; 2D fallback. |

## PHASE 3 - AI AND OPPONENT INTELLIGENCE

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 3.1 | AI personalities | TESTING | 3.5 harness | P6 / L | Seven archetypes that change real decisions, measurable in tools/sim.js. |
| 3.2 | Adaptive difficulty | TESTING | 3.1 | P6 / M | Difficulty reacts to the player's results without breaking determinism. |
| 3.3 | Tactical AI | TESTING | 3.1 | P6 / L | Pressing, shape and counter play in 1v1 and 2v2. |
| 3.4 | Goalkeeper personalities | TESTING | 3.1 | P6 / M | Distinct keeper styles; keeper animation stays inside anim-check. |
| 3.5 | AI testing | TESTING | none | P6 / M | Automated AI-vs-AI statistics per personality in CI. |

## PHASE 4 - GAME MODE EXPANSION

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Street Football | TESTING | 1.3, 1.4 | P7 / L | Own tuning config, enclosed pitch, wall rebounds, rules, rewards. |
| 4.2 | Tournament Mode | TESTING | 5.x persistence | P7 / M | Brackets and rewards persisted. |
| 4.3 | Advanced Training Arena | TESTING | none | P7 / M | Flexible drill environment. Sandbox panel (`js/arena-ui.js`), `Game.create` opt `sand`, accuracy tally. Browser look pending. See PHASE4_NOTES.md (M5). |
| 4.4 | Custom Drill Creator | TESTING | 4.3 | P7 / L | Create, save and play custom drills. `js/drillspec.js` (validate, share code, slots), `js/editor-ui.js` (#editor), custom drill engine in `game.js`, `tools/drill-test.js`. Browser look pending. See PHASE4_NOTES.md (M6). |
| 4.5 | Local Multiplayer | SKIPPED (user decision) | input mapping | P7 / M | Two local players on one machine. |
| 4.6 | Ghost Mode | SKIPPED (user decision) | 7.1 deterministic replay data | P7 / L | Race a recorded run. |

## PHASE 5 - MYCAREER AND LONG-TERM PROGRESSION

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Career seasons | DONE (session 1; browser look pending) | reliable progression persistence (profile.js) | P8 / L | Five seasons with new opponents, challenges and rewards; save compatible. TESTING: `check.js 60` (legacy stages 0/7/13/17/20/30 -> seasons 0/1/2/3/4/4 with attr, points, name, stage, ladder kept; corrupt states rebuilt; live flag = 0-3 loss; schema 99 kept; win/loss/forfeit bookkeeping; seasonEnd champion / up / stay / down; seed determinism; table invariants), `node tools/season-test.js 200 --sim` (headless careers, reload at every step, promotion bands, perfect run, real CPU-vs-CPU season). See PHASE5_NOTES.md. |
| 5.2 | Training and development | TESTING | 5.1 | P8 / M | Six programmes (sprint, dribbling, finishing, strength, technical, endurance): XP from career fixtures (focus doubles) and one training token per fixture for an existing drill played as the career player; +1 attribute per 100 x upgrade cost XP, lowest first, capped by the season, trained points not refundable; trait unlock toast. Training is 13.6% of career growth in the perfect-run test (band 10-15%). TESTING: `check.js 60` career block, `season-test.js 200 --sim`. Browser look pending. See PHASE5_NOTES.md. |
| 5.3 | Career objectives | TESTING | 5.1 | P8 / M | A pure tracker over the drained events (`ISO.Career.Tracker`), 23 match objectives (all seven roadmap items; three per fixture drawn by seed and matchday) and 14 season objectives, credits / rep / upgrade points, next-match panel, pause overlay, end-screen rows, `objDone` achievements. Objective credits capped at 19,000 per career (asserted). TESTING: as 5.2. Browser look pending. |
| 5.4 | Reputation | TESTING | 5.1 | P8 / M | `career.rep` (monotonic) from wins, OVR gap, goals, rating, streaks, skills, objectives and season finishes; seven tiers (0 / 100 / 300 / 700 / 1500 / 3000 / 5000); unlocks kits, looks (appended), harder objectives, rival challenge data; `careerRep` achievements. Assists are not tracked (no assist event in the sim). TESTING: as 5.2. Browser look pending. |
| 5.5 | Rivalry system | TESTING | 5.1, 3.1 | P8 / M | Four fictional rivals (`js/rivals.js`: own look, kit, ISO.PROF attribute shape, forced AI archetype via `App.matchPers`, intro lines, own objective), the season finale after matchday 7 (first to 5, optional, a loss or a skip never blocks the season), `rivalDef(r, level)` with level = season + meetings, ledgers (`career.rivals`, `career.h2h`), rematch prize bonus, RIVALS tab. Tests in `check.js` and `season-test.js`; browser look pending (PHASE5_NOTES.md). |
| 5.6 | Progression and collection improvements | TESTING | 5.1 | P8 / M | Store COLLECTION tab, player card modal (traits, stars, personality, celebration), comparison, favourites (cap 12), 35 sets (club / nation / rarity / era) with a one-time credit claim and a capped win bonus, duplicate stars (Prime -10% each, max 3), custom career kit. **Custom stadiums: BLOCKED** (needs map rendering work in the 2D and 3D renderers; not faked). Browser look pending. |

## PHASE 6 - PRESENTATION, ANIMATION AND IMMERSION

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Camera system | TESTING | 0.2 | P9 / L | Selectable 3D camera presets (Broadcast, Player Chase and others) in settings. |
| 6.2 | Character animation quality | IN PROGRESS | 0.2 | P9 / XL | Quality beyond the gate: visual review, not only numbers. Third pass (session 3): nothing accepted, gate unchanged (A 307 / B 0 / C 109); tried and logged as not helping: `recover` in LOCK_OFF (mixed), strike spot further ahead of the hip (worse); skill leg crossing needs a trace past the clip end (see PHASE6_NOTES.md). |
| 6.3 | Stadium environments | TESTING | 0.5 performance budget | P9 / L | Per-map sun bearing and height with a fitted shadow frustum (dusk long shadows), crowd density, roof, flags in the home colours, a tifo banner, camera flashes on a goal (night), scrolling LED boards, a swaying crowd by section, and pitch looks by turf (lush, firm, astro). All in `js/3d/stadium.js` (`FLAV`); +2 draw calls and +232 triangles at most at quality 0, +0 at quality 2 (tifo +2 triangles). `tools/stadium-test.js` in CI checks the budgets against `tools/stadium-baseline.json`. TESTING needs a browser look: dusk shadows, flags, flashes, crowd, turf looks, frame time at tier 0 and 2, real draw calls from `tools/lab-stadium.html` (PHASE6_NOTES.md). |
| 6.4 | Match presentation | CODE DONE, BROWSER TESTING PENDING | 6.1 | P9 / M | Intros, overlays and replays presentation. |

## PHASE 7 - REPLAY STUDIO AND CONTENT CREATION

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 7.1 | Replay system | NOT STARTED | reliable match recording | P10 / L | Full match, goal, save, skill and tackle replays; alternate cameras. |
| 7.2 | Replay controls | NOT STARTED | 7.1 | P10 / M | Pause, scrub, speed, camera. |
| 7.3 | Highlight export | NOT STARTED | 7.1, 7.2 | P10 / L | Export a clip. |

## PHASE 8 - MULTIPLAYER AND COMPETITIVE ECOSYSTEM

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Ranked matchmaking | NOT STARTED | 0.3, server-side accounts | P10 / XL | Tiers Bronze to Elite, separate 1v1 and 2v2 ratings. |
| 8.2 | Statistics and leaderboards | NOT STARTED | 8.1 | P10 / L | Server-side stats and boards. |
| 8.3 | Friends system | NOT STARTED | accounts | P10 / L | Friends list and invites. |
| 8.4 | Custom online matches | NOT STARTED | 0.4 | P10 / M | Custom rules in rooms. |
| 8.5 | Ranked integrity | NOT STARTED | 0.3, 8.1 | P10 / L | Anti-cheat for ranked. |

## PHASE 9 - QUALITY OF LIFE, ACCESSIBILITY AND EXPANSION

| ID | Item | Status | Depends on | Priority / complexity | Completion criteria and notes |
| --- | --- | --- | --- | --- | --- |
| 9.1 | Customization | TESTING | none | P11 / M | Custom kits and stadiums, favorites, comparisons, camera and physics presets, saved settings. Session 1: accessibility, HUD toggles, binding presets, pad layouts (PHASE9_NOTES.md); mobile BLOCKED (no touch input). |
| 9.2 | Daily and weekly challenges | TESTING | persistence | P11 / M | Challenges rotate and pay credits. |
| 9.3 | Localization | TESTING (wave 2 part: ko partial, checker whitelist, es keys; screens and catalogue text still English) | UI text extraction | P11 / L | UI strings externalized; languages selectable. |
| 9.4 | Performance optimization | TESTING (mobile / touch BLOCKED: no touch input) | 0.1 audit | P11 / M | Frame-time budget measured on a low-end device. |
| 9.5 | Developer debug HUD | TESTING | none | P11 / S | Debug overlay for sim, net and animation. |
