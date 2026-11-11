# ISO Football

**Beta 2.41** — attacker and defender roles, a real defensive toolkit, tougher keepers

A 2D, top-down, 1v1 football game for the browser (online 2v2 too). Every rep is a rebound drill with the goal at the top of the screen: the attacker starts 10 yards outside the 18-yard box, in the centre, with the defender in front. Score, win the rebound, clear it outside the box, repeat. First to three wins a match (five in the rebound drill). No build step and no dependencies: open `index.html`.

- [What's new](#whats-new-in-beta-24) · [Playing](#playing) · [Attacking and defending](#attacking-and-defending) · [Menus](#menus) · [Gameplay notes](#gameplay-notes) · [Online](#online-1v1-and-2v2) · [Credits](#credits) · [Development](#development)

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

## Playing

Open `index.html` in a desktop browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

The controls guide is in the main menu and the pause menu (`Esc`) and always shows your current bindings.

### Default keys

| Action | Keys | When |
| --- | --- | --- |
| Move | WASD / arrows | always |
| Sprint | Shift | always |
| Shoot (hold to charge) | Space / left click | attacking · tap = fake shot |
| Finesse shot | F | attacking |
| Power shot (long wind-up) | Q / right click | attacking |
| Chip shot | E | attacking |
| Skill moves | J / K / L, alone or as chords | attacking |
| Pass (online 2v2) | R | attacking |
| Tackle | J | defending |
| Slide tackle | K | defending |
| Shoulder | L | defending |
| Focus (hold) | E | defending |
| Jockey · Shield | Ctrl / C | always |
| Pause | Esc | |

The shoot key doubles as a standing tackle while you defend. Skill moves are chords of J, K and L: J stepovers, K body feint, L knock on (a burst forward; with a sideways direction held, the ball roll), J+K La Croqueta, J+L roulette, K+L elastico, J+K+L rainbow flick; Sprint + J / K / L gives heel-to-heel, drag back and nutmeg.

## Attacking and defending

**Attacking**

- Hold a shot key to charge and release to strike; hold too long and it sails over the bar. Hold up or down to pick a corner, or aim with the mouse.
- Hold a shot key as a loose ball arrives for a first-time shot. Press a skill key while charging to cancel.
- Land a skill move on a defender who has committed to a lunge or slide and you break their ankles (about 0.9 s on the floor). Nothing else breaks ankles.
- Shielding (jockey with the ball) keeps your body between the ball and the tackler.

**Defending**

- Stay between the ball and your goal: jockey to back off while facing the ball, or hold Focus to have that handled for you.
- Time a standing tackle, slide (a slide that misses costs you a beat) or shoulder. Each can win the ball outright, knock it loose, or be beaten by a skill move that protects the ball.
- You cannot shoot until your side has cleared the ball.

## Menus

The main menu has four buttons: **Play**, **Store**, **Settings** and **Controls**.

### Play

- **MyCareer** — build your own player (look + kit) and climb a 12-opponent ladder from the weakest squad players to the greatest icons (first to 3, CPU difficulty rises as you climb). Wins earn upgrade points to spend on your attributes; losses still earn one. Any stat can be dropped as low as 30 to refund points into others.
- **Quick Match** — any footballer you own, Prime upgrade and skin included, against the CPU on easy, normal or hard.
- **Drills** — **Penalty Shootout** (take your kick, then keep goal for theirs; five each, then sudden death), and one player against the keeper in **Target Practice** (hit the lit corner for 3 points), **Chip Challenge** (lob a keeper who has come off his line) and the free **Testing Arena** (every skill move unlocked, no score limit). Drills pay credits by score and keep your best.
- **Online** — see below.

### Store

- **Players** — for every player you own: **Skins** (Away, National, Third, Blackout, Gold; every purchasable jersey is unique) and **Prime** (+4 to every attribute, cap 99, gold boots; rarer players cost more, 800 – 8,000 CR).
- **Box Draw** — most players are locked. Spend credits on Bronze / Silver / Gold / Icon boxes (each tier unlocks by completing an achievement). Rarer tiers have better odds, duplicates refund credits, and a pity counter guarantees a Legendary or better every 10 boxes.
- **Skill Moves** — the basic moves (body feint, stepovers, knock on) are free. Ball roll, drag back, La Croqueta, roulette, heel-to-heel, nutmeg, elastico and rainbow flick are unlocked here (300 – 1,600 CR). A move also needs the player's skill stars.
- **Maps** — cosmetic pitches: The Stadium (free), Street Cage, Copa Beach, Winter Cup, Neon Night.
- **Achievements** — 25 goals that pay out credits and unlock box tiers.

### Settings

- Audio and default CPU difficulty. Game speed is fixed (see Gameplay notes).
- **Mouse aiming & click to shoot** — on: the cursor aims, left click shoots, right click is the power shot. Off: keyboard only. Also in the pause menu.
- **Keyboard** — every action has two rebindable slots, and a slot can hold a combination such as Shift+Q. Click a slot and press keys; `Esc` cancels, `Backspace` clears. A key already in use swaps places, **except** between an attacking and a defending action, which may share a key. **Reset to default** restores the layout.
- **Reset all progress** — wipes credits, players, skins, Primes, skill moves, maps, achievements and MyCareer. Settings and key bindings are kept.

## Gameplay notes

- **Pace** — the game runs at 60% of real time (`C.SPEED` in `js/game.js`). The simulation steps at a fixed 120 Hz; the main loop and the online server feed it real time × `C.SPEED`.
- **Smooth drawing** — every frame is drawn part-way between the last two simulation steps (`js/smooth.js`), so motion is even on 60, 120 and 144 Hz screens.
- **Movement** — velocity eases straight toward the stick; there is no turning phase. Pace and acceleration ratings separate players without making weak ones sluggish.
- **Input buffering** — a skill chord or a shoot / tackle press made a moment early is held briefly and fires the instant it can, so moves chain into moves and into shots.
- **Dribbling** — the ball is carried beside the player and trails on the far side while moving sideways; a fake shot drags it across.
- **Characters** — drawn live from a small rig (`js/sprites.js`) and a blended pose (`js/render.js`).
- **Goal replays** — every match goal (not drills) is replayed through a low cinematic camera. Offline, the shoot key skips it. The replay is a renderer-side recording and never touches the match.
- **Penalty shootout controls** — your kick: aim with left / right (or the mouse) and hold shoot for power. Their kick: you are the keeper: left / right to move, hold a side and press shoot to dive, add up to dive high.

## Online 1v1 and 2v2

**Play → Online** needs the Node server in `server/`. The match runs there so neither player can cheat; browsers send their keys and draw the result. Your client predicts locally (same simulation, same dice) and re-simulates from each server snapshot, so your own player answers at once whatever the ping. Client and server must run the same version: redeploy the server after pulling.

- **Create room** gives a four-letter code and an invite link (`/?room=ABCD`); **Join room** takes the code; **Quick match** pairs you with whoever else is searching. Pick **1V1** or **2V2** at the top of the lobby.
- **2V2** needs four players. Seats alternate between teams; new arrivals fill the smaller team, and **Switch Team** moves you across if there is a free seat. **Pass** (default `R`) sends a ground pass to the closest teammate in the direction you face. The ball carrier alternates at each restart.
- Your chosen player, Prime, skin and unlocked skill moves are used. Online matches are friendlies: no credits or career progress. If anyone leaves, the match ends and the room reopens.

### Running the server

```sh
cd server && npm install && npm start      # http://localhost:8080  (PORT=… HOST=… to change)
```

It also serves the game, so players just open its address (it prints the LAN address on start-up). `GET /healthz` reports rooms and players.

To play over the internet, the server must be reachable: a small Node host (Render, Fly.io, Railway, a VPS; start command `node server/server.js`) or a tunnel (`cloudflared tunnel --url http://localhost:8080`, `ngrok http 8080`). Behind HTTPS the game connects with `wss://` automatically; WebSockets must be allowed through any proxy (path `/ws`). The game can be hosted elsewhere and pointed at the server with `?server=host:port` (add `&secure=1` for `wss`).

**Deploy: Render (server) + Vercel (site)**

1. Push the repo to GitHub. On Render: **New + > Blueprint**, pick the repo (it reads `render.yaml`). Opening the Render URL already works as a complete game.
2. Put `wss://<your-render-host>/ws` in `js/config.js` (`server`), commit and push.
3. On Vercel: **Add New > Project**, import the repo, no build settings (`.vercelignore` keeps `server/` out).
4. On Render, set `ALLOWED_ORIGINS` to your Vercel URL so only your site can connect.

The free Render plan sleeps when idle: the first player waits about 30 s.

In short: the server steps the same 120 Hz simulation as single-player and broadcasts a snapshot 40 times a second (about 100 KB/s per player). Inputs are sanitised and rate-limited; rooms are cleaned up when players leave.

## Credits

- Every match pays credits, with more for goals, wins, clean sheets and career wins. Achievements pay out too, and Testing Arena goals earn a trickle.
- Win bonuses depend on the CPU: ×0.4 on Easy, ×0.7 on Normal, ×1 on Hard.
- In Quick Match, each overall point the CPU's player has over yours adds 4% to the win bonus, and each point below takes 4% off (×0.5 – ×2). Player select shows what a win is worth before kick-off.
- Progress is saved in the browser (localStorage).

## Development

### Code layout

| File | Role |
| --- | --- |
| `js/data.js` | Roster, attributes, looks, kits, goalkeepers, store catalogue |
| `js/game.js` | Match simulation: physics, dribbling, skills, shooting, tackling, keepers, rules. No DOM. |
| `js/ai.js` | CPU opponent; emits the same inputs a human does |
| `js/input.js` | Keyboard / mouse / gamepad mapping, rebinding, attack / defence key groups |
| `js/sprites.js` | Generates each character's sprite sheet on a canvas |
| `js/render.js` | Canvas renderer, map themes, effects, goal replays |
| `js/smooth.js` | Render interpolation between simulation steps |
| `js/audio.js` | Synthesized sound effects |
| `js/profile.js` | Saved profile: credits, collection, purchases, achievements, boxes, MyCareer |
| `js/main.js` | Screens, HUD, main loop |
| `js/meta-ui.js` | Play, MyCareer, Store, Settings and key-binding screens |
| `js/config.js` | Deployment settings: where the online server is |
| `js/net.js`, `js/online.js` | Online: snapshot encode / apply and input packing; connection, lobby, prediction |
| `server/server.js` | Online server: static hosting, rooms, quick match, authoritative simulation |
| `assets/` | Menu and drill artwork (SVG) |

### Running headless

The simulation is independent of rendering. The helpers need Node:

```sh
node tools/sim.js 40 normal      # 40 CPU-vs-CPU matches, prints aggregate stats
node tools/check.js 60           # invariant checks (NaNs, players inside goals, stuck balls, ...)
cd server && node test.js && node test-determinism.js && node test-lag.js 50 10
```

The determinism test checks that a snapshot sent as JSON and applied to another game re-simulates exactly; run it after touching anything in `js/game.js`. Any new button the simulation reads must be added to `ZERO` in `js/game.js`, which is also what the online input packing uses.

### Replacing the placeholder sprites

Sprites are generated at runtime. To use hand-drawn art, add an entry to `ISO.SPRITE_OVERRIDES` in `js/data.js` mapping a player id to a PNG laid out like the generated sheet (`ISO.Sprites.LAYOUT`): 64×62 cells (any integer scale), feet anchored at (32, 52), three rows (facing down, up, right) and 30 columns: idle ×2, run ×6, sprint ×6, kick ×3, tackle ×2, slide ×1, celebrate ×4, skill ×4, stumble ×1, dive ×1. If the image fails to load the generated sheet is used. Shoulder reuses the tackle frames and focus the idle / run frames.
