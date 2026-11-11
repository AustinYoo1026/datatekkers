# ISO Football

**Beta 2.2** — New card artwork, front-facing dribbling

A 2D, top-down, 1v1 football game for the browser. Rebound drill with the goal at the top: the attacker starts 10 yards outside the 18-yard box, in the centre, with the defender in front; a keeper catch is thrown back out for either player to win. After a shot, win the rebound and clear it outside the box. First to five goals wins.

## What's new in Beta 2.2

- **New card artwork** — Online 1v1, Testing Arena, Penalty Shootout, Target Practice and Chip Challenge now use flat-vector illustrations in the same style as MyCareer, Quick Match and Drills.
- **Dribbling** — players no longer swing into a full side profile. Moving left or right, the ball stays on the trailing side and the opposite foot nudges it along. A fake shot now drags the ball to the other side.

## Beta 2.0


- **Store Update** — one Store for everything you spend credits on: Players (skins and Prime upgrades), Box Draw, Skill Moves, Maps and Achievements.
- **Control Updates** — rebind every key in Settings, switch mouse aiming on and off (also from the pause menu).
- **MyCareer** — move points between stats by dropping any stat as low as 30.
- **Gameplay Changes** — a new PLAY page, easier Easy and Normal CPUs with smaller win bonuses, and bigger rewards for beating a higher-rated opponent in Quick Match.

## Menus

The main menu has four buttons: **Play**, **Store**, **Settings** and **Controls**.

### Play

- **MyCareer** — build your own player (look + kit) and climb a 12-opponent ladder from the weakest squad players to the greatest icons (first to 3, CPU difficulty rises as you climb). Wins earn upgrade points to spend on your attributes; losses still earn one. Any stat can be dropped as low as 30, even below where it started, to refund points into others.
- **Quick Match** — any footballer you own, Prime upgrade and skin included, against the CPU on easy, normal or hard. Players are listed by overall.
- **Drills** — **Penalty Shootout** (a full shootout against an opposing team: you take your kick, then keep goal for theirs; five each, then sudden death), and one player against the keeper in **Target Practice** (hit the lit corner of the goal for 3 points), **Chip Challenge** (lob a keeper who has come off his line) and the free **Testing Arena** (every skill move unlocked, no score limit). Drills pay credits by score and keep your best; the keeper level sets how good the keeper is.
- **Controls** — every action has two rebindable slots, and a slot can hold a key combination such as Shift+Q.

### Store

- **Players** — for every player you own:
  - **Skins** — Away, National, Third, Blackout and Gold. Every purchasable jersey is unique: no two players share one. Buy once, equip any time.
  - **Prime** — a permanent upgrade: +4 to every attribute and the overall (cap 99), plus gold boots. Rarer players cost more (800 – 8,000 CR).
- **Box Draw** — most players are locked. Spend credits on Bronze / Silver / Gold / Icon boxes (each tier unlocks by completing an achievement), watch the reel spin, and pull a random player. Rarer tiers have better odds, duplicates refund credits, and a pity counter guarantees a Legendary or better every 10 boxes.
- **Skill Moves** — only the body feint and stepovers are free. Ball roll, drag back, La Croqueta, roulette, heel-to-heel, nutmeg, elastico and rainbow flick are unlocked here (300 – 1,600 CR). A move also needs the player's skill stars; the CPU and the Testing Arena are not limited by unlocks.
- **Maps** — cosmetic pitches: The Stadium (free), Street Cage, Copa Beach, Winter Cup, Neon Night.
- **Achievements** — 25 goals (goals, wins, skills, power-shot goals, career progress, collection, store…) that pay out credits and unlock box tiers.

### Settings

- Audio and default CPU difficulty. The game speed is fixed (see Gameplay notes).
- **Mouse aiming & click to shoot** — on: the cursor aims, left click shoots, right click is the power shot. Off: keyboard only. It can also be switched from the pause menu.
- **Keyboard** — every action has two rebindable keys. Click a slot and press a key; `Esc` cancels, `Backspace` clears, and a key already in use swaps places. **Reset to default** restores the original layout.
- **Reset all progress** — wipes credits, players, skins, Primes, skill moves, maps, achievements and MyCareer. Settings and key bindings are kept.

## Gameplay notes

- **Pace** — the whole game runs at 60% of real time (`C.SPEED` in `js/game.js`). The simulation steps at a fixed 120 Hz; the main loop and the online server feed it real time × `C.SPEED`, so players, ball, keeper and timers slow together. Countdowns and dead-ball pauses are short so play restarts quickly.
- **Smooth drawing** — every frame is drawn part-way between the last two simulation steps (`js/smooth.js`), so motion is even on 60, 120 and 144 Hz screens.
- **Movement** — velocity eases straight toward the stick: most of a start, stop or cut happens in the first tenth of a second, with no turning phase. Everyone is quick; pace and acceleration ratings separate players (a 50-rated runner has about 83% of the top speed of a 99) without making weak players sluggish.
- **Input buffering** — a skill chord or a shoot / tackle press made a moment early (mid-move, mid-lunge, while stumbling) is held for a fraction of a second and fires the instant it can, so moves chain into moves and into shots. A buffered shot keeps charging while the key is held.
- **Quick recoveries** — skill moves are short, a missed tackle or slide costs a beat rather than a second, and a player whose ankles are broken is back up in well under a second.
- **Characters** — drawn live from a small rig (`js/sprites.js`) and a blended pose (`js/render.js`), so every movement eases into the next and figures stay sharp at any zoom.
- **Ankle breakers** — a skill move close to a defender can put them on the floor for a moment. Close range, a skilful dribbler, and a defender who is lunging, recovering or running the wrong way all raise the odds; keeping your distance or jockeying keeps your balance.
- **Goal replays** — every match goal (not drills, not the Testing Arena) is replayed through a low cinematic camera, the finish in slow motion. Offline, the shoot key skips it. The replay is a recording kept by the renderer: it never touches the match.
- **Penalty shootout controls** — your kick: aim with left / right (or the mouse) and hold shoot for power. Their kick: you are the keeper — left / right to move along the line, hold a side and press shoot to dive, add up to dive high. Watch the run-up: it often gives the side away.

## Online 1v1 and 2v2

Play > Online (needs the server in `server/`, see `render.yaml`). Your client predicts the match locally (same simulation, same dice as the server) and re-simulates from each server snapshot, so your own player answers at once whatever the ping; corrections to other players are blended in. Client and server must run the same version: redeploy the server after pulling. Tests: `cd server && node test.js && node test-determinism.js && node test-lag.js 50 10`. Create a room and share the four-letter code, or use Quick Match. Pick **1V1** or **2V2** at the top of the lobby.

- **2V2** needs four players. Seats alternate between teams (players 1 and 3 against 2 and 4); new arrivals fill the smaller team, and **Switch Team** in the lobby moves you across if the other team has a free seat. Each team shares one kit.
- **Pass** (default `R`, rebindable in Settings, Gamepad back button) sends a ground pass to the teammate you are pointing at (the nearest with no direction held). The ball carrier alternates between teammates at each restart.
- If anyone leaves mid-match the match ends and the room reopens. Online matches are friendlies: no credits or career progress.

## Credits

- Every match pays credits, with more for goals, wins, clean sheets and career wins. Achievements pay out too, and Testing Arena goals earn a trickle.
- Win bonuses depend on the CPU: ×0.4 on Easy, ×0.7 on Normal, ×1 on Hard.
- In Quick Match, each overall point the CPU's player has over yours adds 4% to the win bonus, and each point below takes 4% off (×0.5 – ×2). Player select shows what a win is worth before kick-off.
- Progress is saved in the browser (localStorage).

## Play

Open `index.html` in a desktop browser (no build step, no dependencies), or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

The full controls guide is in the main menu and the pause menu (`Esc`), and shows your current key bindings. Default keys:

| Action | Keys |
| --- | --- |
| Move | WASD / arrows |
| Sprint | Shift |
| Shoot (hold to charge) · Tackle | Space / left click |
| Finesse shot | F |
| Power shot (long wind-up) | Q / right click |
| Skill moves | J / K / L, alone or as chords |
| Jockey · Shield | Ctrl / C |
| Pause | Esc |

Sliding tackle: Sprint + direction + tackle. Skill moves are chords of J, K and L: J stepovers, K body feint, L ball roll, J+K La Croqueta, J+L roulette, K+L elastico, J+K+L rainbow flick; Sprint + J / K / L gives heel-to-heel, drag back and nutmeg.

## Running the online server

**Play → Online** lets two or four people play each other. The match runs on a small Node server (`server/`) so neither player can cheat and both see the same game; browsers just send their keys and draw what the server sends back.

```sh
cd server && npm install && npm start      # http://localhost:8080  (PORT=… HOST=… to change)
```

The server also serves the game, so players just open its address. It prints the LAN address on start-up.

- **Create room** gives a four-letter code and an invite link (`/?room=ABCD`); **Join room** takes the code; **Quick match** pairs you with whoever else is searching. The match starts as soon as two players are in a room. Rematch needs both players to accept; the kick-off alternates.
- Your chosen player, Prime upgrade, equipped skin and unlocked skill moves are used. Online matches are friendly: no credits or career progress.
- **Friends over the internet:** the server must be reachable by them. Easiest options are a small host that runs Node (Render, Fly.io, Railway, a VPS: start command `node server/server.js`, install in `server/`), or a tunnel from your own machine (`cloudflared tunnel --url http://localhost:8080` or `ngrok http 8080`). Behind HTTPS the game connects with `wss://` automatically. WebSockets must be allowed through any proxy (path `/ws`).
- The game can also be hosted elsewhere (e.g. GitHub Pages) and pointed at the server with `?server=host:port` (add `&secure=1` for `wss`).
- **Deploy: Render (server) + Vercel (site).**
  1. Push the repo to GitHub. On Render: **New + > Blueprint**, pick the repo (it reads `render.yaml`). Note the URL, e.g. `https://iso-football.onrender.com`. Opening that URL already works as a complete game.
  2. Put `wss://iso-football.onrender.com/ws` in `js/config.js` (`server`), commit and push.
  3. On Vercel: **Add New > Project**, import the repo, no build settings (`.vercelignore` keeps `server/` out).
  4. Back on Render, set `ALLOWED_ORIGINS` to your Vercel URL (e.g. `https://iso-football.vercel.app`) so only your site can connect.
  The free Render plan sleeps when idle: the first player waits ~30 s for it to wake (the online screen shows CONNECTING).
- `GET /healthz` reports rooms and players. `npm test` in `server/` plays a scripted match against a throwaway server.

Server, in short: it steps the same 120 Hz simulation as single-player, broadcasts a snapshot 40 times a second (about 100 KB/s per player), and clients play snapshots back ~90 ms behind, interpolated. Inputs are sanitised and rate-limited; rooms are cleaned up when players leave.

## Code layout

| File | Role |
| --- | --- |
| `js/data.js` | Roster, attributes, looks, kits, goalkeepers, and the store catalogue (skins, Prime, skill-move prices, maps) |
| `js/game.js` | Match simulation — physics, dribbling, skills, shooting, tackling, keepers, rules. No DOM. |
| `js/ai.js` | CPU opponent; emits the same inputs a human does |
| `js/sprites.js` | Generates each character's sprite sheet on a canvas |
| `js/render.js` | Canvas renderer, map themes and effects |
| `js/audio.js` | Synthesized sound effects |
| `js/input.js` | Keyboard / mouse / gamepad mapping and key rebinding |
| `js/profile.js` | Saved profile — credits, collection, store purchases, achievements, box draws, MyCareer |
| `js/config.js` | Deployment settings: where the online server is |
| `js/net.js` | Online: snapshot encode / apply shared by the server and the browser |
| `js/online.js` | Online: connection, lobby screen, snapshot playback and input sending |
| `server/server.js` | Online server: static hosting, rooms, quick match, authoritative simulation |
| `js/main.js` | Screens, HUD, main loop |
| `js/meta-ui.js` | Play, MyCareer, Store (Box Draw, Achievements), Settings and key-binding screens |
| `assets/play/` | PLAY page artwork (SVG): MyCareer, Quick Match and Testing Arena cards |

The simulation runs at a fixed 120 Hz and is independent of rendering, so it can be run headless:

```sh
node tools/sim.js 40 normal   # 40 CPU-vs-CPU matches, prints aggregate stats
node tools/check.js 60        # invariant checks (NaNs, players inside goals, stuck balls, ...)
```

## Replacing the placeholder sprites

Character sprites are generated at runtime. To use hand-drawn art, add an entry to `ISO.SPRITE_OVERRIDES` in `js/data.js` mapping a player id to a PNG laid out like the generated sheet (`ISO.Sprites.LAYOUT`): 64×62 cells (any integer scale), feet anchored at (32, 52), three rows (facing down, up, right) and 30 columns — idle ×2, run ×6, sprint ×6, kick ×3, tackle ×2, slide ×1, celebrate ×4, skill ×4, stumble ×1, dive ×1. If the image fails to load the generated sheet is used.
