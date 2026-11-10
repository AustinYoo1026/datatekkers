# ISO Football

**Alpha v1**

A 2D, top-down, 1v1 football game for the browser. Rebound drill with the goal at the top: the attacker starts 10 yards outside the 18-yard box, in the centre, with the defender in front; a keeper catch is thrown back out for either player to win. After a shot, win the rebound and clear it outside the box. First to five goals wins.

## Modes & progression

- **MyCareer** — build your own player (look + kit) and climb a 12-opponent ladder from the weakest squad players to the greatest icons (first to 3, CPU difficulty rises as you climb). Wins earn upgrade points to spend on your attributes; losses still earn one.
- **Box Draw** — most players are locked. Spend credits on Bronze / Silver / Gold / Icon boxes (each tier unlocks by completing an achievement), watch the reel spin, and pull a random player. Rarer tiers have better odds, duplicates refund credits, and a pity counter guarantees a Legendary or better every 10 boxes.
- **Achievements** — 21 goals (goals, wins, skills, power-shot goals, career progress, collection…) that pay out credits and unlock box tiers.
- **Credits** — earned from every match (more for goals, wins, clean sheets and career wins), from achievements, and a trickle from Testing Arena goals.
- Progress is saved in the browser (localStorage).

Mouse aiming: move the mouse during a match and your shots go toward the cursor; left click shoots, right click is the power shot.

## Play

Open `index.html` in a desktop browser (no build step, no dependencies), or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

Modes: **1 Player vs CPU** (easy / normal / hard) and the **Testing Arena** (one player, the ball and the keeper, every skill move unlocked, no score limit). The full controls guide is in the main menu and the pause menu (`Esc`).

| Action | Keys |
| --- | --- |
| Move | WASD / arrows |
| Sprint | Shift |
| Shoot (hold to charge) · Tackle | Space |
| Finesse shot | F |
| Power shot (long wind-up) | Q |
| Skill moves | J / K / L, alone or as chords |
| Jockey · Shield | Ctrl / C |

Sliding tackle: Sprint + direction + tackle. Skill moves are chords of J, K and L: J stepovers, K body feint, L ball roll, J+K La Croqueta, J+L roulette, K+L elastico, J+K+L rainbow flick; Sprint + J / K / L gives heel-to-heel, drag back and nutmeg.

## Code layout

| File | Role |
| --- | --- |
| `js/data.js` | Roster, attributes, looks, kits, goalkeepers |
| `js/game.js` | Match simulation — physics, dribbling, skills, shooting, tackling, keepers, rules. No DOM. |
| `js/ai.js` | CPU opponent; emits the same inputs a human does |
| `js/sprites.js` | Generates each character's sprite sheet on a canvas |
| `js/render.js` | Canvas renderer and effects |
| `js/audio.js` | Synthesized sound effects |
| `js/input.js` | Keyboard / gamepad mapping |
| `js/main.js` | Screens, HUD, main loop |

The simulation runs at a fixed 120 Hz and is independent of rendering, so it can be run headless:

```sh
node tools/sim.js 40 normal   # 40 CPU-vs-CPU matches, prints aggregate stats
node tools/check.js 60        # invariant checks (NaNs, players inside goals, stuck balls, ...)
```

## Replacing the placeholder sprites

Character sprites are generated at runtime. To use hand-drawn art, add an entry to `ISO.SPRITE_OVERRIDES` in `js/data.js` mapping a player id to a PNG laid out like the generated sheet (`ISO.Sprites.LAYOUT`): 64×62 cells (any integer scale), feet anchored at (32, 52), three rows (facing down, up, right) and 30 columns — idle ×2, run ×6, sprint ×6, kick ×3, tackle ×2, slide ×1, celebrate ×4, skill ×4, stumble ×1, dive ×1. If the image fails to load the generated sheet is used.
