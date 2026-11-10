/* ISO FOOTBALL — synthesized sound effects (Web Audio, no asset files). */
(function () {
  'use strict';
  const ISO = (globalThis.ISO = globalThis.ISO || {});
  let ctx = null, master = null, noiseBuf = null, crowd = null, muted = false, volume = 0.8, crowdOn = true;
  const gainNow = () => (muted ? 0 : 0.7 * volume);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = gainNow(); master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone(type, f0, f1, dur, vol, delay) {
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(freq, qv, dur, vol, delay, type, attack) {
    const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = qv;
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(vol, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function whistle(dur, delay) {
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 2350; l.frequency.value = 38; lg.gain.value = 130;
    l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + dur - 0.04); g.gain.linearRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + dur + 0.02); l.stop(t + dur + 0.02);
  }

  function play(type, e) {
    if (!ctx || muted) return;
    e = e || {};
    switch (type) {
      case 'kick': { const p = e.power || 0.5; tone('sine', 150 + p * 60, 50, 0.13, 0.5 * (0.5 + p)); noise(1400, 0.8, 0.07, 0.35 * (0.4 + p)); break; }
      case 'touch': tone('sine', 120, 60, 0.06, 0.18); break;
      case 'bounce': tone('sine', 95, 55, 0.07, 0.14); break;
      case 'post': tone('triangle', 880, 820, 0.35, 0.35); tone('sine', 1320, 1250, 0.25, 0.2); noise(3000, 2, 0.05, 0.3); break;
      case 'tackle': case 'block': case 'bump': noise(420, 0.9, 0.12, 0.5); tone('sine', 100, 45, 0.12, 0.4); break;
      case 'lunge': noise(e.slide ? 900 : 1600, 0.6, e.slide ? 0.4 : 0.1, e.slide ? 0.2 : 0.1); break;
      case 'save': noise(700, 0.7, 0.14, 0.5); tone('sine', 130, 60, 0.12, 0.35); noise(1100, 0.5, 0.9, 0.16, 0.05, 'bandpass', 0.2); break;
      case 'skill': tone('sine', 620, 980, 0.09, 0.07); break;
      case 'beep': tone('square', 660, 660, 0.12, 0.09); break;
      case 'whistle': whistle(0.5); break;
      case 'out': whistle(0.22); break;
      case 'goal': whistle(0.35); whistle(0.6, 0.45); noise(900, 0.4, 2.8, 0.55, 0, 'bandpass', 0.35); noise(2200, 0.6, 2.2, 0.2, 0.1, 'bandpass', 0.5); break;
      case 'final': whistle(0.3); whistle(0.3, 0.42); whistle(0.9, 0.84); noise(900, 0.4, 3, 0.4, 0.5, 'bandpass', 0.6); break;
      case 'ui': tone('sine', 520, 700, 0.06, 0.08); break;
      case 'deny': tone('square', 220, 150, 0.14, 0.07); break;
      case 'tick': tone('triangle', 1500 + (e.pitch || 0) * 400, 1300, 0.035, 0.06); break;
      case 'shake': noise(300, 0.8, 0.12, 0.25); tone('sine', 80, 60, 0.1, 0.25); break;
      case 'coin': tone('square', 988, 988, 0.07, 0.05); tone('square', 1319, 1319, 0.18, 0.05, 0.07); break;
      case 'reveal': {      // bigger fanfare for rarer pulls
        const r = e.rank || 0, notes = [523, 659, 784, 1047, 1319];
        for (let i = 0; i <= r; i++) tone('triangle', notes[i], notes[i], 0.32, 0.12, i * 0.09);
        if (r >= 3) { noise(900, 0.4, 2.2, 0.45, 0.3, 'bandpass', 0.3); tone('sine', 1568, 1568, 0.8, 0.08, 0.45); }
        if (r >= 4) { whistle(0.25, 0.1); tone('sawtooth', 110, 55, 0.9, 0.12, 0.2); }
        break;
      }
    }
  }

  function ambience(on) {
    if (!ctx) return;
    if (on && !crowdOn) on = false;
    if (on && !crowd) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.35; g.gain.value = 0.05;
      s.connect(f); f.connect(g); g.connect(master); s.start();
      crowd = { s, g };
    } else if (!on && crowd) { try { crowd.s.stop(); } catch (e) { /* already stopped */ } crowd = null; }
  }

  ISO.Audio = {
    init, play, ambience,
    get muted() { return muted; },
    setMuted(m) { muted = m; if (master) master.gain.value = gainNow(); },
    setVolume(v) { volume = v; if (master) master.gain.value = gainNow(); },
    setCrowd(on) { crowdOn = on; if (!on) ambience(false); },
  };
})();
