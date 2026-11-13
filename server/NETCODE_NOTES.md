# Netcode notes: multiplayer integrity (roadmap 0.3) and bandwidth (0.4)

## Trust model (read this first)
There are no accounts and no server-side persistence. The whole profile (owned players, Prime, credits, career) lives in the
browser's localStorage (`isofootball.profile.v1`), so the server **cannot verify ownership** of anything a client claims.
What the server does verify (`server/validate.js`, `server.js`):
- seat ownership: a socket only ever feeds its own seat; its inputs cannot touch another seat's ack or queue;
- picks: only `{id, prime, skin}` is kept; the id must be in `ISO.PLAYERS` (career ids `you...` and unknown ids get
  `{t:'error', msg:'That player cannot be used online.'}` and the client is not seated); `prime` must be exactly `true`;
  unknown skin -> `home`; stats are rebuilt on the server (`ISO.outfit`); move lists are filtered to known ids (all moves are free today);
- inputs: `mx/my` clamped to [-1,1], `ax/ay` to +-1e6 (shared `ISO.Net.sanitizeInput`), NaN/Infinity dropped;
- abuse: 4096 B max payload (socket closed, 1009); token bucket 300 burst / 180 per s; 600 consecutive over-budget messages close with 1008;
- admin: see below.

Prime and ownership claims are cosmetic online: that is why online pays no credits. Ownership checks are deferred to accounts (8.1/8.5).

Consequence: anyone can claim a Prime or any catalogue player online. That is acceptable only because online is unranked and pays
no credits or career progress (js/main.js ~306). **Ranked play needs server-side accounts first (roadmap Phase 8.5).**
Admin switches only change the local profile; they grant nothing on the server.

## Admin
`{t:'admin', code}` -> `{t:'admin', ok}`. The code is compared as sha256 digests with `crypto.timingSafeEqual` against env
`ADMIN_CODE`; unset means always false; 5 attempts per socket (not per IP: reconnecting gives a fresh count), then always false. The client (`ISO.Online.adminLogin(code, cb)`)
times out after 5 s -> false. The plaintext password was removed from js/profile.js; `adminGrant()` is called on success and
`load()` forces `admin.unlocked=false` (per session). `render.yaml` has `ADMIN_CODE` (`sync: false`: set it in the Render dashboard).

## Protocol 2 (delta snapshots)
Client sends `v: 2` on create/join/quick (`ISO.Net.PROTO`); server `hello` is `{t:'hello', v:2}`. v1 clients are unchanged.
- Keyframe: full `{t:'s', k, ack, inp, q, n}` (first flush after start, every `KEY_EVERY` flushes, on phase `end`, or after the seat sends `{t:'key'}`).
- Delta: `{t:'s', k, ack, q, b, d, ev}`; `b` is the `k` of the snapshot it applies to, `d` omitted when nothing changed, `inp` only when changed, `ev` only when non-empty.
- `ISO.Net.diff/patch` are lossless over the encoded tree minus `ev` (see the comment in js/net.js). `ISO.Net.follower()` rebuilds `m.n`;
  `Predictor` uses it, and on a missing base asks for a keyframe once (`opt.resync`, `stats.resyncs`).
- permessage-deflate is OFF by default; `WS_DEFLATE=1` enables `{threshold:256, zlibDeflateOptions:{level:3, memLevel:7}, serverMaxWindowBits:13, clientMaxWindowBits:13, concurrencyLimit:10}`. No-context-takeover was not enabled (it was not measured; it would cost compression ratio).

## Decisions
- **No quantisation**: clients re-simulate from snapshots and test-crossplay.js asserts bit-exact steps; rounding state would break that.
- **No binary encoding (for now)**: delta already cuts the stream by about 80%; whether a binary format would beat delta + deflate was NOT measured, and it would cost far more code. Revisit only if mobile data matters more.
- Deflate is opt-in (`WS_DEFLATE=1`) because its CPU and per-socket memory cost was NOT measured. The wire numbers below with deflate were measured with it enabled; the tests run with the default (off).

## Env vars
`ADMIN_CODE` (unset = admin disabled), `WS_DEFLATE=1` (enable permessage-deflate, default off), `KEY_EVERY` (default 144 snapshots, 4 s), plus existing `PORT HOST SEND_EVERY Q_MAX Q_KEEP MAX_ROOMS ALLOWED_ORIGINS`.

## Bandwidth (snapshot body, seeded, 60 s AI play, 36 Hz) -- `node bench-bandwidth.js`
| offline, bytes/snapshot | mean | p95 | max | KB/s |
|---|---|---|---|---|
| 1v1 full JSON (before) | 3630 | 3870 | 4105 | 130.7 |
| 1v1 delta (incl. keyframes) | 620 | 1008 | 3863 | 22.3 |
| 2v2 full JSON (before) | 5814 | 6051 | 6326 | 209.3 |
| 2v2 delta (incl. keyframes) | 1229 | 1481 | 6123 | 44.2 |

The table above is protocol 2 deltas from `node bench-bandwidth.js` on an earlier simulation tree. Re-run on the current tree (same bench, protocol 2): 1v1 delta 678 B, 2v2 delta 951 B (p95 1472, 34.2 KB/s); so 1229 B is stale. `bench-bandwidth.js` has no protocol 3 offline mode.

Target was <=800 B (1v1, met) and <=1000 B (2v2, 1229 B at the time; 951 B on the current tree). Per-player floats (x, y, vx, vy, face, animDist, runPh, stam) are
incompressible without quantising; further cuts need dropping or deriving animation-phase fields, which was out of scope.

| live wire, server->client bytes/s (`--live`, 20 s, measured on one client) | 1v1 | 2v2 | up (client->server) |
|---|---|---|---|
| v1, no deflate (before, the default) | 135005 | 215839 | ~4000 |
| v1 + deflate | 23970 (-82%) | 28915 (-87%) | 981 |
| v2, no deflate (clients now send v3; v2 is still served) | 27937 (-79.3%) | 33406 (-84.5%) | ~4000 |
| v2 + deflate | 12694 (-90.6%) | 15961 (-92.6%) | 981 |

Delta alone is 79.3% lower in 1v1 (target 80%: marginally missed) and 84.5% in 2v2; with deflate both are over 90%.
Client prediction stats in all four live runs: own error ~0, stalls 0, resyncs 0.
Note v1 + deflate already gives most of the saving, so old clients benefit too.

## Tests
`npm test` runs test.js, test-determinism.js, test-delta.js, test-integrity.js. `PROTO=2 node test-lag.js 50 10` and `PROTO=2 node test-crossplay.js` exercise protocol 2
(a client that does not send `v` is treated as protocol 1; current clients send `v: 3`). Admin and rate-limit behaviour are covered by test-integrity.js.

## Protocol 3 (compact deltas, lossless)
Client sends `v: 3`, hello is `v: 3`; the server builds one delta per protocol version (2 and 3 seats can share a room). Same messages as protocol 2; the delta `d` additionally uses:
- a number leaf is `'~' + base64(8 bytes, little-endian, no padding)` when its JSON text is longer than 14 chars (bit-exact); a real string starting with `~` is wrapped as `{ $r }` (also in v2);
- `$t: { d,u,z,D,U,Z: [keys] }` on an object: the key moved by `(a-STEP)-STEP`, `(a+STEP)+STEP`, `max(0,(a-STEP)-STEP)` (two steps) or the one-step forms D/U/Z. The sender tests exact equality; the receiver repeats the arithmetic with `ISO.C.STEP`.
Measured earlier in the session (offline, 2v2 delta mean per snapshot, tree at that time): v2 950 B, v3 802 B (1v1 about 527 B); live 20 s 2v2 downstream 41.8 to 35.2 KB/s. Re-measured on the current tree: `bench-bandwidth.js` v2 2v2 951 B; `test-delta.js` mean delta body (6 seeded 1v1/2v2 matches) v2 813 B, v3 676 B. The 1229 B in the table above is the older v2 number (earlier tree); it is not comparable to the v3 figures. `server/test.js` also has a v2 seat + v3 seat in one room case (identical reconstructed state at the same k). `test-delta.js` (`PROTO=3`) checks the JSON round trip and bit-exact re-simulation; crossplay and lag pass at PROTO 1, 2 and 3.
