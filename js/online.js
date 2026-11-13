/* ISO FOOTBALL — online 1v1 / 2v2 client: connection, lobby screen and the match loop.
   The match runs on the server (server/server.js), but nothing here waits for it: the local Game object is stepped at
   once with this player's inputs and corrected whenever a snapshot arrives (ISO.Net.Predictor in js/net.js has the
   details), so your own player answers as fast as offline. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, App = ISO.App, P = ISO.Profile;
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);

  let ws = null, connecting = false, lobby = null, queued = false, qinfo = null, rematching = false, mode = '1v1';
  let pingMs = null, pingTimer = 0, retry = 0;
  let pred = null, pending = null, adminCb = null, adminTimer = 0;

  // ?server=host[:port] overrides (add &secure=1 for wss), then js/config.js, then the host that served the page
  const serverUrl = () => {
    const q = params.get('server');
    if (q) return (location.protocol === 'https:' || params.get('secure') ? 'wss://' : 'ws://') + q + '/ws';
    if (ISO.CONFIG && ISO.CONFIG.server) return ISO.CONFIG.server;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  };
  const configured = () => !!(params.get('server') || (ISO.CONFIG && ISO.CONFIG.server));
  const status = (t, cls) => { const el = $('onStatus'); el.textContent = t; el.style.color = cls || ''; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  // ----------------------------------------------------------- connection
  function connect(then) {
    if (ws && ws.readyState === 1) { then && then(); return; }
    if (location.protocol === 'file:' && !configured()) { status('OPEN THE GAME FROM THE SERVER (SEE README)', '#f1735f'); return; }
    if (connecting) { pending = then || pending; return; }
    connecting = true; pending = then || null; status('CONNECTING…');
    let sock;
    try { sock = new WebSocket(serverUrl()); } catch (e) { connecting = false; status('CANNOT REACH SERVER', '#f1735f'); return; }
    ws = sock;
    sock.onopen = () => {
      connecting = false; retry = 0; status('CONNECTED'); clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping', c: performance.now() }), 2000);
      send({ t: 'ping', c: performance.now() });
      if (pending) { const f = pending; pending = null; f(); }
    };
    sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    sock.onclose = () => {
      clearInterval(pingTimer); connecting = false;
      if (ws !== sock) return;
      ws = null; const wasIn = lobby || App.mode === 'online' && App.screen === 'match' || App.screen === 'end';
      lobby = null; queued = false; qinfo = null; pingMs = null; pred = null;
      if (wasIn && App.mode === 'online' && !App.demo) { App.toast('DISCONNECTED', 'Lost connection to the server', '#f1735f'); App.show('online'); }
      status(App.screen === 'online' ? 'DISCONNECTED' : '', '#f1735f'); render();
    };
    sock.onerror = () => { status('CANNOT REACH SERVER', '#f1735f'); };
  }

  function onMessage(m) {
    if (m.t === 'pong') { pingMs = Math.round(performance.now() - m.c); if (App.screen === 'online') status('CONNECTED · ' + pingMs + ' MS'); }
    else if (m.t === 'room') { lobby = m; queued = false; mode = m.size === 4 ? '2v2' : '1v1'; render(); if (params.get('room')) { params.delete('room'); history.replaceState(null, '', location.pathname); } }
    else if (m.t === 'queued') { queued = true; qinfo = m; mode = m.mode; render(); }
    else if (m.t === 'error') { queued = false; App.toast('ONLINE', m.msg, '#f1735f'); render(); }
    else if (m.t === 'out') { lobby = null; queued = false; render(); }
    else if (m.t === 'start') {
      rematching = false;
      const me = lobby ? lobby.you : 0;
      App.startOnline(m.picks, m.names, m.kickoff, me);
      // the sim revision: a server on another sim would make this client predict wrongly, so say so instead of silently drifting
      if (m.rev !== undefined && m.rev !== ISO.SIM_REV) App.toast('VERSION MISMATCH', 'This game (' + ISO.SIM_REV + ') and the server (' + m.rev + ') run different match code. Refresh the page; until then the match may look jumpy.', '#f1735f');
      // everybody is re-simulated here, so every player needs the skill moves the server lets that seat use
      if (m.moves) App.G.players.forEach((p, i) => { p.moves = m.moves[i] ? new Set(m.moves[i]) : null; });
      pred = ISO.Net.Predictor({ me, send, smooth: ISO.Smooth, resync: () => send({ t: 'key' }) });
      ISO.Smooth.reset(); api.alpha = 0;
    }
    else if (m.t === 's') { if (pred && App.mode === 'online' && App.G && (App.screen === 'match' || App.screen === 'end')) pred.onSnapshot(m); }
    else if (m.t === 'admin') { if (adminCb) { const f = adminCb; adminCb = null; clearTimeout(adminTimer); f(!!m.ok); } }
    else if (m.t === 'rematch') {
      if (lobby && !rematching) { const n = m.who.filter(Boolean).length; if (n) $('endRematch').textContent = n + ' / ' + m.who.length + ' WANT A REMATCH'; }
    }
    else if (m.t === 'left') {
      App.toast('PLAYER LEFT', m.forfeit ? 'The match was ended' : 'Your room is open again', '#ffcf4d');
      if (App.mode === 'online' && !App.demo) App.show('online');
      render();
    }
  }

  // ----------------------------------------------------------- the match
  // Once per display frame: take in the snapshots that have arrived, then step the local game up to now. main.js plays
  // G.events afterwards and draws between the last two steps (ISO.Smooth.begin(G, ISO.Online.alpha, dt)).
  const IDLE = { mx: 0, my: 0 };
  function frame(G, dt) {
    if (!pred) { api.alpha = 1; return; }
    const live = App.screen === 'match' && !App.paused;
    const n = pred.frame(G, dt, () => (live ? App.humanInput() : IDLE));
    if (n) ISO.Input.consume();
    api.alpha = pred.alpha;
  }

  // ----------------------------------------------------------- lobby screen
  function myPick() {
    const d = App.pick[0];
    return { id: d.id, prime: P.isPrime(d.id), skin: P.skinOf(d.id), celeb: P.celebOf() };
  }
  const myName = () => ($('onName').value || '').trim() || 'Player';
  const payload = (t, extra) => Object.assign({ t, v: ISO.Net.PROTO, mode, name: myName(), pick: myPick(), moves: Array.from(P.moveSet()) }, extra);

  function render() {
    if (!$('onMenu')) return;
    const d = P.owns(App.pick[0].id) ? P.outfit(App.pick[0]) : App.pick[0];
    const c = $('onFace').getContext('2d'); c.clearRect(0, 0, 184, 184); c.drawImage(ISO.Sprites.portrait(d, 92), 0, 0);
    $('onNm').textContent = d.name; $('onOvr').textContent = d.ovr;
    const inRoom = !!lobby || queued;
    $('onMenu').classList.toggle('hidden', inRoom); $('onLobby').classList.toggle('hidden', !inRoom);
    if (!inRoom) { $('onModeSeg').classList.remove('hidden'); for (const m of ['1v1', '2v2']) $('onMode' + m[0]).classList.toggle('on', mode === m); return; }
    $('onModeSeg').classList.add('hidden');
    $('onLobbyK').textContent = lobby ? 'ROOM CODE · ' + mode.toUpperCase() : 'QUICK MATCH · ' + mode.toUpperCase();
    $('onRoomCode').textContent = lobby ? lobby.code : '· · · ·';
    $('onRoomCode').style.display = lobby ? '' : 'none';
    $('onCopy').classList.toggle('hidden', !lobby);
    const missing = lobby ? lobby.players.filter((x) => !x).length : qinfo ? qinfo.need - qinfo.have : 1;
    const word = mode === '2v2' ? (missing === 1 ? 'PLAYER' : 'PLAYERS') : 'OPPONENT';
    $('onWait').textContent = lobby ? (missing ? 'WAITING FOR ' + (mode === '2v2' ? missing + ' MORE ' : 'AN ') + word + '…' : 'STARTING…')
      : 'SEARCHING FOR ' + (mode === '2v2' ? missing + ' MORE ' : 'AN ') + word + '…';
    $('onWait').classList.toggle('live', !!lobby && !missing);
    // the teams: yours first
    // the traits each slot brings (from the catalogue, exactly what the sim will use; Prime and skins never change them)
    const tagsOf = (pk) => { const d = ISO.playerById(pk.id); return d ? '<div class="traits">' + ISO.styleOf(d).traits.map((t) => '<span class="chip trait" title="' + esc(ISO.TRAITS[t].desc) + '">' + ISO.TRAITS[t].tag + '</span>').join('') + '</div>' : ''; };
    const roster = (t) => {
      const rows = [];
      lobby.players.forEach((p, i) => { if (i % 2 === t) rows.push(p ? '<div class="on-slot' + (i === lobby.you ? ' me' : '') + '"><b>' + esc(p.name.toUpperCase()) + '</b><span>' + esc(ISO.playerById(p.pick.id).short.toUpperCase()) + '</span>' + tagsOf(p.pick) + '</div>' : '<div class="on-slot empty">WAITING…</div>'); });
      return rows.join('');
    };
    const mine = lobby ? lobby.you % 2 : 0;
    $('onRoster').innerHTML = lobby ? '<div class="on-team"><i>YOUR TEAM</i>' + roster(mine) + '</div><div class="on-team opp"><i>' + (mode === '2v2' ? 'OPPONENTS' : 'OPPONENT') + '</i>' + roster(1 - mine) + '</div>' : '';
    $('onTeam').classList.toggle('hidden', !(lobby && mode === '2v2'));
    $('onLeave').textContent = lobby && lobby.players.filter(Boolean).length > 1 ? 'LEAVE' : 'CANCEL';
  }

  function start() {
    $('onName').value = (P.data.settings.onlineName || '');
    $('onName').addEventListener('change', () => P.setSetting('onlineName', myName() === 'Player' ? '' : myName()));
    $('onCreate').addEventListener('click', () => connect(() => send(payload('create'))));
    $('onQuick').addEventListener('click', () => connect(() => send(payload('quick'))));
    const join = () => { const code = $('onCode').value.trim().toUpperCase(); if (code.length < 4) { App.toast('ONLINE', 'Enter the 4-letter room code', '#f1735f'); return; } connect(() => send(payload('join', { code }))); };
    $('onJoin').addEventListener('click', join);
    $('onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    $('onCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    $('onLeave').addEventListener('click', () => { send({ t: 'leave' }); lobby = null; queued = false; qinfo = null; render(); });
    $('onTeam').addEventListener('click', () => send({ t: 'team' }));
    for (const m of ['1v1', '2v2']) $('onMode' + m[0]).addEventListener('click', () => { mode = m; render(); });
    $('onCopy').addEventListener('click', () => {
      if (!lobby) return;
      const u = new URL(location.href); u.search = ''; u.searchParams.set('room', lobby.code);
      if (params.get('server')) { u.searchParams.set('server', params.get('server')); if (params.get('secure')) u.searchParams.set('secure', '1'); }
      (navigator.clipboard ? navigator.clipboard.writeText(u.toString()) : Promise.reject()).then(() => App.toast('COPIED', 'Invite link on your clipboard'), () => App.toast('INVITE LINK', u.toString()));
    });
    // joining from an invite link
    if (params.get('room')) {
      const code = params.get('room').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      $('onCode').value = code; App.mode = 'online'; App.show('online');
      connect(() => send(payload('join', { code })));
    }
  }

  const api = ISO.Online = {
    frame, alpha: 0,
    get net() { return pred && { ping: pingMs, rate: pred.rate, pending: pred.pending, stats: pred.stats }; },      // for a debug overlay / the console
    onShow() { render(); if (!ws || ws.readyState > 1) connect(); else status('CONNECTED' + (pingMs != null ? ' · ' + pingMs + ' MS' : '')); },
    rematch() { rematching = true; $('endRematch').textContent = 'WAITING FOR OPPONENT…'; $('endRematch').disabled = true; send({ t: 'rematch' }); },
    // Settings -> Admin: the server checks the code (ADMIN_CODE env var). cb(true|false); false after 5 s without an answer.
    // This only unlocks the developer switches in the local profile (there is no server-side account to change).
    adminLogin(code, cb) {
      if (adminCb) { const f = adminCb; adminCb = null; clearTimeout(adminTimer); f(false); }
      adminCb = cb; adminTimer = setTimeout(() => { if (adminCb) { const f = adminCb; adminCb = null; f(false); } }, 5000);
      const go = () => send({ t: 'admin', code: String(code || '') });
      if (connecting && pending) { const prev = pending; pending = () => { prev(); go(); }; }   // chain after the pending create/join/quick
      else connect(go);
    },
    leave() { send({ t: 'leave' }); lobby = null; queued = false; qinfo = null; pred = null; },
  };
  start();
})();
