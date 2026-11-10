// One-shots play recorded clips from sounds/sfx (made with ElevenLabs) once loaded, and
// fall back to the WebAudio synth versions below until then (or if a file fails).
// Loops and music stay synthesised. Characters speak short lines from sounds/voice.
// Nothing starts until the first user gesture calls init(); with ?debug (automated
// checks) init is a no-op and nothing plays.
const SFX = ['pop', 'splat', 'boing', 'tink', 'nick', 'shing', 'sparkle', 'lock', 'zap', 'knock', 'oink', 'drip',
  'tick', 'stamp', 'success', 'perfect', 'fail', 'fanfare', 'cheer', 'thud', 'flash'];
const PITCHED = new Set(['pop', 'boing', 'tink', 'zap', 'knock']); // first argument is a pitch
const SFX_VOL = { tick: 0.5, drip: 0.6, sparkle: 0.7, shing: 0.7, cheer: 0.6, fanfare: 0.7, flash: 0.7, nick: 0.8, knock: 0.8 };
const VOICES = ['goth', 'bodybuilder', 'bookworm', 'brainiac', 'foodie', 'punk', 'bully', 'gamer', 'glam', 'grandpa', 'regular'];
const base = new URL('../sounds/', import.meta.url);
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.platformOn = true;
    this.loops = {};
    this.grains = { bubble: 0, bloop: 0 };
    this._acc = { bubble: 0, bloop: 0 };
    this.musicOn = false;
    this.buf = {}; this.last = {}; this.vbuf = {}; this.voiceUntil = 0;
    for (const n of SFX) {
      const synth = this[n].bind(this);
      this[n] = (...a) => { if (this.ctx && !this._sample(n, a[0])) synth(...a); };
    }
  }
  async _load(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    const data = await r.arrayBuffer();
    return new Promise((ok, no) => this.ctx.decodeAudioData(data, ok, no));
  }
  _loadSfx() { for (const n of SFX) this._load(new URL(`sfx/${n}.mp3`, base)).then((b) => { this.buf[n] = b; }, () => {}); }
  _sample(n, pitch) {
    const b = this.buf[n]; if (!b) return false;
    const t = this.ctx.currentTime;
    if (t - (this.last[n] || -1) < 0.045) return true; // the same clip stacked in one frame just gets louder
    this.last[n] = t;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    if (PITCHED.has(n) && typeof pitch === 'number') src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
    const g = this.ctx.createGain(); g.gain.value = SFX_VOL[n] || 0.9;
    src.connect(g); this._out(g, 0.08); src.start(t);
    return true;
  }
  // a character's line: 'ouch' | 'happy' | 'gasp'. One voice at a time, with a breather between.
  voice(kind, line) {
    if (!this.ctx || this.muted) return;
    if (!VOICES.includes(kind)) kind = 'regular';
    const key = `${kind}-${line}`, t = this.ctx.currentTime;
    if (t < this.voiceUntil) return;
    const b = this.vbuf[key];
    if (!b) { if (b === undefined) { this.vbuf[key] = null; this._load(new URL(`voice/${key}.mp3`, base)).then((x) => { this.vbuf[key] = x; }, () => {}); } return; }
    this.voiceUntil = t + b.duration + 1.4;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = this.ctx.createGain(); g.gain.value = 0.8;
    src.connect(g); this._out(g, 0.05); src.start(t);
  }
  // load one character's lines ahead of time (when they sit down)
  prepVoice(kind) {
    if (!this.ctx) return;
    for (const l of ['ouch', 'happy', 'gasp']) {
      const key = `${VOICES.includes(kind) ? kind : 'regular'}-${l}`;
      if (this.vbuf[key] === undefined) { this.vbuf[key] = null; this._load(new URL(`voice/${key}.mp3`, base)).then((x) => { this.vbuf[key] = x; }, () => {}); }
    }
  }
  get ready() { return !!this.ctx; }
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this._targetVol();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    const len = Math.floor(ctx.sampleRate * 1.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.22;
    this.verb.connect(vg).connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.music.connect(this.master);
    const mv = ctx.createGain(); mv.gain.value = 0.25; this.music.connect(mv).connect(this.verb);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this._buildLoops();
    this._loadSfx();
    this.startMusic();
  }
  _targetVol() { return this.muted || !this.platformOn ? 0 : 0.85; }
  _applyVol() { if (this.ctx) this.master.gain.setTargetAtTime(this._targetVol(), this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; this._applyVol(); }
  setPlatformAudio(on) { this.platformOn = on; this._applyVol(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  // 'interrupted' is iOS after a call or a trip to the home screen
  resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); }
  // iPhone Safari only lets sound start from a tap's release (touchend, click), not from
  // the touch going down, so every release calls this. Once sound runs it does nothing.
  unlock() {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    this.resume();
    // a silent blip started inside the gesture fully opens the output on iOS
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
  }

  _noise(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }
  _out(node, verb = 0.15) {
    node.connect(this.dry);
    if (verb > 0) { const g = this.ctx.createGain(); g.gain.value = verb; node.connect(g).connect(this.verb); }
  }
  _buildLoops() {
    const ctx = this.ctx;
    const mk = (name, chain, verb = 0.1) => {
      const g = ctx.createGain(); g.gain.value = 0;
      chain(g);
      this._out(g, verb);
      this.loops[name] = g;
    };
    // scrub: soft soapy hiss (bubble blips come from grains)
    mk('scrub', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
      const am = ctx.createGain(); am.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const d = ctx.createGain(); d.gain.value = 0.4; lfo.connect(d).connect(am.gain); lfo.start();
      n.connect(f).connect(am).connect(g); n.start();
    });
    // squeeze: a wobbly rising tone for pimple tension
    mk('squeeze', (g) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180;
      const vib = ctx.createOscillator(); vib.frequency.value = 9; const vd = ctx.createGain(); vd.gain.value = 6; vib.connect(vd).connect(o.frequency); vib.start();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      o.connect(f).connect(g); o.start(); this.sqOsc = o; this.sqVib = vd;
    }, 0.15);
    // mew: slide whistle
    mk('whistle', (g) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 420;
      const vib = ctx.createOscillator(); vib.frequency.value = 6; const vd = ctx.createGain(); vd.gain.value = 9; vib.connect(vd).connect(o.frequency); vib.start();
      o.connect(g); o.start(); this.whOsc = o;
    }, 0.25);
    // comb: quick bristly strokes
    mk('rasp', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 2.2;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 16;
      const depth = ctx.createGain(); depth.gain.value = 0.5; lfo.connect(depth).connect(am.gain); lfo.start();
      n.connect(f).connect(am).connect(g); n.start();
    });
    // gold pour: warm bubbling rumble (bloops come from grains)
    mk('pour', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 120;
      n.connect(f).connect(f2).connect(g); n.start();
    });
    // polish: glassy shimmer with tremolo and a soft squeak band
    mk('polish', (g) => {
      const trem = ctx.createGain(); trem.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const d = ctx.createGain(); d.gain.value = 0.35; lfo.connect(d).connect(trem.gain); lfo.start();
      [1567.98, 2093.0, 3135.96].forEach((fr, i) => { const o = ctx.createOscillator(); o.frequency.value = fr; o.detune.value = (i - 1) * 7; const og = ctx.createGain(); og.gain.value = 0.05 / (i + 1); o.connect(og).connect(trem); o.start(); });
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6; const ng = ctx.createGain(); ng.gain.value = 0.3;
      n.connect(f).connect(ng).connect(trem); n.start();
      trem.connect(g);
    }, 0.35);
    // laser: a thin electric buzz
    mk('laser', (g) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 196;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 1568;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.4;
      const g2 = ctx.createGain(); g2.gain.value = 0.15;
      const trem = ctx.createGain(); trem.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 31; const d = ctx.createGain(); d.gain.value = 0.3; lfo.connect(d).connect(trem.gain); lfo.start();
      o.connect(f); o2.connect(g2).connect(f); f.connect(trem).connect(g); o.start(); o2.start();
    }, 0.1);
    // iron: a steamy hiss
    mk('steam', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
      const am = ctx.createGain(); am.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3; const d = ctx.createGain(); d.gain.value = 0.25; lfo.connect(d).connect(am.gain); lfo.start();
      n.connect(f).connect(am).connect(g); n.start();
    }, 0.15);
    // whitening lamp: a soft electric hum
    mk('hum', (g) => {
      [220, 440, 660].forEach((fr, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = fr; o.detune.value = i * 4; const og = ctx.createGain(); og.gain.value = 0.16 / (i + 1); o.connect(og).connect(g); o.start(); });
    }, 0.2);
  }
  level(name, v, tc = 0.04) {
    if (!this.ctx) return;
    const g = this.loops[name]; if (!g) return;
    g.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }
  stopLoops() { for (const k in this.loops) this.level(k, 0, 0.02); this.grains.bubble = 0; this.grains.bloop = 0; }
  tension(k) {
    if (!this.ctx) return;
    if (k < 0) { this.level('squeeze', 0, 0.03); return; }
    const t = this.ctx.currentTime;
    this.sqOsc.frequency.setTargetAtTime(170 + 320 * Math.min(1.45, k), t, 0.03);
    this.sqVib.gain.setTargetAtTime(4 + 18 * Math.min(1.45, k), t, 0.05);
    this.level('squeeze', 0.14);
  }
  whistle(m) {
    if (!this.ctx) return;
    if (m < 0) { this.level('whistle', 0, 0.03); return; }
    this.whOsc.frequency.setTargetAtTime(380 + 760 * Math.min(1.6, m), this.ctx.currentTime, 0.02);
    this.level('whistle', 0.12);
  }

  // ---------- music: a gentle marimba loop over C, G, Am, F ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.mNext = this.ctx.currentTime + 0.15; this.mStep = 0;
    this.music.gain.setTargetAtTime(0.55, this.ctx.currentTime, 1.2);
  }
  _musicTick() {
    const ctx = this.ctx, sp = 60 / 112 / 4;
    while (this.mNext < ctx.currentTime + 0.25) {
      this._mStep(this.mStep, this.mNext);
      this.mNext += sp; this.mStep = (this.mStep + 1) % 64;
    }
  }
  _mStep(i, t) {
    const bar = i >> 4, st = i & 15;
    const roots = [130.81, 98.0, 110.0, 87.31];
    const P = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    const MEL = [
      [0, -1, 2, -1, 3, -1, 2, -1, 5, -1, 3, -1, 2, -1, 3, -1],
      [3, -1, 1, -1, 3, -1, 6, -1, 5, -1, -1, 3, 1, -1, -1, -1],
      [4, -1, 2, -1, 0, -1, 2, -1, 4, -1, 5, -1, 4, -1, 2, -1],
      [4, -1, 5, -1, 4, -1, 2, -1, 0, -1, 2, -1, 3, -1, -1, -1],
    ];
    const n = MEL[bar][st];
    if (n >= 0) this._mallet(P[n], t, 0.05);
    if (st === 0 || st === 8) this._bass(roots[bar], t);
    if (st === 12) this._bass(roots[bar] * 1.5, t);
    if (st % 4 === 2) this._hat(t);
  }
  _mallet(f, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    const o2 = ctx.createOscillator(); o2.frequency.value = f * 4;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.003); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.music); o2.connect(g2).connect(this.music);
    o.start(t); o.stop(t + 0.42); o2.start(t); o2.stop(t + 0.1);
  }
  _bass(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.38);
  }
  _hat(t) {
    const ctx = this.ctx;
    const n = this._noise(false); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(f).connect(g).connect(this.music); n.start(t, Math.random(), 0.06);
  }

  update(dt) {
    if (!this.ctx) return;
    if (this.musicOn && this.ctx.state === 'running') this._musicTick();
    for (const k of ['bubble', 'bloop']) {
      const rate = this.grains[k];
      if (rate <= 0) continue;
      this._acc[k] += dt * rate;
      while (this._acc[k] > 1) {
        this._acc[k] -= 1;
        const t = this.ctx.currentTime;
        if (k === 'bubble') this._tone(500 + Math.random() * 700, t, 0.05, 0.05, 'sine', 1300 + Math.random() * 900, 0.1);
        else this._tone(380 + Math.random() * 220, t, 0.09, 0.07, 'sine', 140, 0.15);
      }
    }
  }
  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  _tone(freq, t, dur, vol, type = 'sine', toFreq = null, verb = 0.15) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.004, vol, dur);
    o.connect(g); this._out(g, verb); o.start(t); o.stop(t + dur + 0.05);
  }
  _burst(t, dur, vol, type, freq, q = 1, verb = 0.1, sweepTo = null) {
    const ctx = this.ctx;
    const n = this._noise(false); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.002, vol, dur);
    n.connect(f).connect(g); this._out(g, verb); n.start(t, Math.random() * 1.5, dur + 0.05);
  }
  get _t() { return this.ctx.currentTime; }

  // ---------- one-shots ----------
  pop(pitch = 1) {
    if (!this.ctx) return; const t = this._t;
    this._tone(380 * pitch, t, 0.08, 0.3, 'sine', 1250 * pitch, 0.12);
    this._burst(t, 0.015, 0.22, 'highpass', 3000, 1, 0.05);
    this._tone(2400 * pitch, t + 0.05, 0.16, 0.035, 'sine', null, 0.35);
  }
  splat() {
    if (!this.ctx) return; const t = this._t;
    this._burst(t, 0.16, 0.35, 'lowpass', 900, 1, 0.1, 300);
    this._tone(240, t, 0.14, 0.18, 'sine', 80, 0.1);
  }
  boing(pitch = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = this._t;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170 * pitch, t); o.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.07); o.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.3);
    const vib = ctx.createOscillator(); vib.frequency.value = 22; const vd = ctx.createGain();
    vd.gain.setValueAtTime(60 * pitch, t); vd.gain.exponentialRampToValueAtTime(1, t + 0.3); vib.connect(vd).connect(o.frequency);
    const g = ctx.createGain(); this._env(g, t, 0.005, 0.16, 0.3);
    o.connect(g); this._out(g, 0.15); o.start(t); vib.start(t); o.stop(t + 0.36); vib.stop(t + 0.36);
  }
  tink(pitch = 1) {
    if (!this.ctx) return; const t = this._t, f = 1650 * pitch;
    [[1, 0.2, 0.13], [2.76, 0.1, 0.07], [5.4, 0.05, 0.04]].forEach(([m, d, v]) => this._tone(f * m, t, d, v, 'sine', null, 0.2));
    this._burst(t, 0.012, 0.28, 'highpass', 5000, 0.7, 0.05);
  }
  nick() {
    if (!this.ctx) return; const t = this._t;
    this._burst(t, 0.05, 0.45, 'highpass', 2000, 1, 0.1);
    this._tone(520, t, 0.2, 0.16, 'square', 200, 0.15);
  }
  shing() {
    if (!this.ctx) return; const t = this._t;
    this._tone(900, t, 0.22, 0.07, 'sine', 3600, 0.3);
    [2093, 2637, 3136].forEach((f, i) => this._tone(f, t + 0.08 + i * 0.05, 0.35, 0.04, 'sine', null, 0.45));
  }
  sparkle() { if (!this.ctx) return; const t = this._t; [2093, 2637, 3136, 4186].forEach((f, i) => this._tone(f, t + i * 0.055, 0.4, 0.045, 'sine', null, 0.5)); }
  lock() {
    if (!this.ctx) return; const t = this._t;
    this._burst(t, 0.02, 0.3, 'bandpass', 2600, 4, 0.05);
    this._burst(t + 0.07, 0.025, 0.35, 'bandpass', 1800, 4, 0.05);
    this._tone(880, t + 0.07, 0.25, 0.08, 'triangle', null, 0.3);
  }
  // laser zapping a spot away
  zap(pitch = 1) {
    if (!this.ctx) return; const t = this._t;
    this._tone(2600 * pitch, t, 0.12, 0.08, 'square', 500 * pitch, 0.1);
    this._burst(t, 0.03, 0.18, 'highpass', 4000, 0.8, 0.05);
  }
  // the little rubber mallet tapping a nose into shape
  knock(pitch = 1) {
    if (!this.ctx) return; const t = this._t;
    this._tone(520 * pitch, t, 0.06, 0.16, 'triangle', 260 * pitch, 0.08);
    this._burst(t, 0.02, 0.2, 'bandpass', 1300 * pitch, 3, 0.05);
  }
  // a nose shrunk too far
  oink() {
    if (!this.ctx) return; const t = this._t;
    this._tone(330, t, 0.11, 0.12, 'square', 220, 0.1);
    this._tone(350, t + 0.15, 0.13, 0.12, 'square', 210, 0.1);
  }
  drip() { if (!this.ctx) return; const t = this._t; this._tone(1100, t, 0.08, 0.07, 'sine', 500, 0.3); }
  tick() { if (!this.ctx) return; const t = this._t; this._tone(1760, t, 0.06, 0.06, 'triangle', null, 0.1); }
  whoosh(vol = 0.15) { if (!this.ctx) return; const t = this._t; this._burst(t, 0.4, vol, 'bandpass', 380, 1.2, 0.2, 1900); }
  stamp() {
    if (!this.ctx) return; const t = this._t;
    this._tone(260, t, 0.12, 0.2, 'sine', 120, 0.1);
    this._burst(t, 0.03, 0.2, 'highpass', 1500, 0.8, 0.05);
  }
  success() {
    if (!this.ctx) return; const t = this._t;
    this._tone(1046.5, t + 0.02, 0.2, 0.1, 'triangle', null, 0.3);
    this._tone(1568, t + 0.11, 0.35, 0.1, 'triangle', null, 0.35);
  }
  perfect() {
    if (!this.ctx) return; const t = this._t + 0.12;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this._tone(f, t + i * 0.06, 0.4, 0.06, 'triangle', null, 0.45));
  }
  fail() {
    // cartoon "wah-wah"
    if (!this.ctx) return; const t = this._t;
    this._tone(330, t, 0.26, 0.13, 'triangle', 300, 0.2);
    this._tone(262, t + 0.28, 0.5, 0.13, 'triangle', 220, 0.25);
  }
  fanfare() {
    if (!this.ctx) return; const t = this._t;
    [784, 1046.5, 1318.5, 1568].forEach((f, i) => this._tone(f, t + i * 0.11, 0.25, 0.07, 'square', null, 0.3));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this._tone(f, t + 0.5, 1.0, 0.045, 'triangle', null, 0.5));
  }
  cheer() {
    if (!this.ctx) return; const t = this._t;
    for (let i = 0; i < 10; i++) this._tone(1800 + Math.random() * 2400, t + i * 0.07, 0.25, 0.03, 'sine', null, 0.5);
  }
  thud() {
    if (!this.ctx) return; const t = this._t;
    this._tone(110, t, 0.5, 0.55, 'sine', 45, 0.3);
    this._burst(t, 0.2, 0.35, 'lowpass', 400, 1, 0.4);
    this._tone(1568, t + 0.02, 0.4, 0.05, 'triangle', null, 0.4);
  }
  flash() {
    if (!this.ctx) return; const t = this._t;
    this._tone(1400, t, 0.36, 0.025, 'sine', 6400, 0.05);
    this._burst(t + 0.4, 0.05, 0.45, 'highpass', 2600, 0.7, 0.3);
    this._burst(t + 0.47, 0.04, 0.3, 'bandpass', 1600, 2, 0.1);
  }
}
