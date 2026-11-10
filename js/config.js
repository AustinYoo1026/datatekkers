/* ISO FOOTBALL — deployment settings.
   server: where the online server lives, as a WebSocket URL, e.g. 'wss://iso-football.onrender.com/ws'.
   Leave it empty when the game is served by the server itself (local play, or Render serving everything). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  ISO.CONFIG = { server: '' };
})();
