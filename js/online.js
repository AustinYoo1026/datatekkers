/* ISO FOOTBALL — online 1v1 / 2v2 client: connection, lobby screen and snapshot playback.
   The match itself runs on the server (server/server.js); this applies its snapshots to the local Game object
   that the renderer reads, and sends this player's inputs. */
(function () {
  'use strict';
  const ISO = globalThis.ISO, App = ISO.App, P = ISO.Profile;
  const $ = (id) => document.getElementById(id);

  const DELAY = 90;                   // ms of playback delay: smooths over network jitter
  const SEND_MS = 14;                 // inputs go out at up to ~70 Hz
  const params = new URLSearchParams(location.search);

  let ws = null, connecting = false, lobby = null, queued = false, qinfo = null, rematching = false, mode = '1v1';
  let pingMs = null, pingTimer = 0, retry = 0;
  let buf = [], off = null, evIdx = 0, lastSend = 0, pending = null;

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
      lobby = null; queued = false; qinfo = null; pingMs = null; buf = [];
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
      buf = []; off = null; evIdx = 0; rematching = false;
      App.startOnline(m.picks, m.names, m.kickoff, lobby ? lobby.you : 0);
    }
    else if (m.t === 's') { if (App.mode === 'online' && App.G && (App.screen === 'match' || App.screen === 'end')) addSnapshot(m); }
    else if (m.t === 'rematch') {
      if (lobby && !rematching) { const n = m.who.filter(Boolean).length; if (n) $('endRematch').textContent = n + ' / ' + m.who.length + ' WANT A REMATCH'; }
    }
    else if (m.t === 'left') {
      App.toast('PLAYER LEFT', m.forfeit ? 'The match was ended' : 'Your room is open again', '#ffcf4d');
      if (App.mode === 'online' && !App.demo) App.show('online');
      render();
    }
  }

  // ----------------------------------------------------------- snapshot playback
  function addSnapshot(m) {
    const now = performance.now(), sample = now - m.at;
    off = off == null ? sample : Math.min(sample, off + 0.5);      // tracks the fastest path; drifts up slowly if the clock does
    buf.push({ at: m.at, n: m.n });
    if (buf.length > 60) buf.splice(0, buf.length - 60);
  }

  function frame(G, dt) {
    const online = ISO.Net;
    if (buf.length) {
      const rt = performance.now() - off - DELAY;
      let i = 0;
      while (i + 1 < buf.length && buf[i + 1].at <= rt) i++;
      const a = buf[i], b = buf[i + 1];
      // events of every snapshot we have just played past
      for (let j = evIdx; j <= i; j++) for (const e of online.events(G, buf[j].n)) G.events.push(e);
      evIdx = i + 1;
      const f = b ? Math.max(0, Math.min(1, (rt - a.at) / (b.at - a.at))) : 0;
      online.apply(G, a.n, b && b.n, f);
      if (i > 2) { buf.splice(0, i - 2); evIdx -= i - 2; }
    }
    // inputs
    const now = performance.now();
    if (App.screen === 'match' && now - lastSend >= SEND_MS) {
      lastSend = now;
      const inp = App.paused ? { mx: 0, my: 0 } : App.humanInput();
      const o = { mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2) };
      for (const k in ISO.Game.ZERO) if (typeof ISO.Game.ZERO[k] === 'boolean' && inp[k]) o[k] = 1;
      if (inp.ax != null) { o.ax = Math.round(inp.ax); o.ay = Math.round(inp.ay); }
      send({ t: 'in', i: o });
      ISO.Input.consume();
    }
  }

  // ----------------------------------------------------------- lobby screen
  function myPick() {
    const d = App.pick[0];
    return { id: d.id, prime: P.isPrime(d.id), skin: P.skinOf(d.id) };
  }
  const myName = () => ($('onName').value || '').trim() || 'Player';
  const payload = (t, extra) => Object.assign({ t, mode, name: myName(), pick: myPick(), moves: Array.from(P.moveSet()) }, extra);

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
    const roster = (t) => {
      const rows = [];
      lobby.players.forEach((p, i) => { if (i % 2 === t) rows.push(p ? '<div class="on-slot' + (i === lobby.you ? ' me' : '') + '"><b>' + esc(p.name.toUpperCase()) + '</b><span>' + esc(ISO.playerById(p.pick.id).short.toUpperCase()) + '</span></div>' : '<div class="on-slot empty">WAITING…</div>'); });
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

  ISO.Online = {
    frame,
    onShow() { render(); if (!ws || ws.readyState > 1) connect(); else status('CONNECTED' + (pingMs != null ? ' · ' + pingMs + ' MS' : '')); },
    rematch() { rematching = true; $('endRematch').textContent = 'WAITING FOR OPPONENT…'; $('endRematch').disabled = true; send({ t: 'rematch' }); },
    leave() { send({ t: 'leave' }); lobby = null; queued = false; qinfo = null; buf = []; },
  };
  start();
})();
