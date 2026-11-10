// One-shots play recorded clips from sounds/sfx (made with ElevenLabs) once loaded, and
// fall back to the WebAudio synth versions below until then (or if a file fails).
// Loops and music stay synthesised. Characters speak short lines from sounds/voice.
// Nothing starts until the first user gesture calls init(); with ?debug (automated
// checks) init is a no-op and nothing plays.
const SFX = ['pop', 'splat', 'boing', 'tink', 'nick', 'shing', 'sparkle', 'lock', 'zap', 'knock', 'oink', 'drip',
  'tick', 'stamp', 'success', 'perfect', 'fail', 'cheer', 'thud', 'flash']; // fanfare is synth bells now
const PITCHED = new Set(['pop', 'boing', 'tink', 'zap', 'knock']); // first argument is a pitch
// recorded clips are mastered loud; these keep them under the music and the voices
const SFX_VOL = { pop: 0.26, splat: 0.28, boing: 0.18, tink: 0.14, nick: 0.24, shing: 0.13, sparkle: 0.15, lock: 0.24, zap: 0.16,
  knock: 0.24, oink: 0.28, drip: 0.22, tick: 0.18, stamp: 0.28, success: 0.26, perfect: 0.22, fail: 0.24, fanfare: 0.22,
  cheer: 0.18, thud: 0.3, flash: 0.17 };
// every clip plays a little lower than recorded: rounder, less piercing
const SFX_RATE = 0.93;
// big moments: while one rings, another of these is skipped instead of piling on
const STINGER = new Set(['success', 'perfect', 'fail', 'fanfare', 'cheer', 'thud', 'flash', 'stamp']);
// six adult voices (3 men, 3 women), each saying a handful of short words
const VOICES = { m: ['m1', 'm2', 'm3'], f: ['f1', 'f2', 'f3'] };
const FEMALE = new Set(['goth', 'punk', 'glam', 'foodie']), MALE = new Set(['bodybuilder', 'bookworm', 'brainiac', 'bully', 'gamer', 'grandpa']);
// what a character says, by moment: hurt, did something they didn't ask for, and how the session turned out
// good / great: a treatment that went well, during the session
// hurt -> sore -> angry as the same patient keeps getting hurt (see Game.ouch)
const LINES = { hurt: ['ouch', 'ow', 'stop'], sore: ['hurts', 'careful', 'stop'], angry: ['what', 'crazy', 'letgo'], wait: ['wait', 'hey'], good: ['yes', 'better', 'ahh'], great: ['wow', 'perfect'],
  happy: ['aha', 'mmhmm', 'nice'], mid: ['hmm', 'meh'] };
const COOL = { hurt: 1.4, sore: 1.6, angry: 1.8, wait: 4, good: 2, great: 2, happy: 0, mid: 0 };
function voiceOf(who) {
  const seed = (who && who.seed) || 0, k = who && who.kind;
  const g = FEMALE.has(k) ? 'f' : MALE.has(k) ? 'm' : (seed >> 3) % 2 ? 'f' : 'm';
  return VOICES[g][seed % 3];
}
const base = new URL('../sounds/', import.meta.url);
// loudness of a clip, ENV_RATE steps a second, 0..1 (drives the talking mouth)
const ENV_RATE = 30;
function envelope(b) {
  const d = b.getChannelData(0), step = Math.floor(b.sampleRate / ENV_RATE), out = [];
  let top = 1e-6;
  for (let i = 0; i < d.length; i += step) {
    let sum = 0; const e = Math.min(d.length, i + step);
    for (let j = i; j < e; j++) sum += d[j] * d[j];
    const r = Math.sqrt(sum / Math.max(1, e - i)); out.push(r); if (r > top) top = r;
  }
  return out.map((r) => Math.min(1, Math.pow(r / top, 0.7)));
}
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.platformOn = true;
    this.loops = {};
    this.grains = { bubble: 0, bloop: 0 };
    this._acc = { bubble: 0, bloop: 0 };
    this.musicOn = false;
    this.buf = {}; this.last = {}; this.vbuf = {}; this.venv = {}; this.voiceUntil = 0; this.lineAt = {};
    this.stingUntil = 0; this.talk = null;
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
    if (t - (this.last[n] || -1) < 0.12) return true; // the same clip stacked up just gets louder and harsher
    if (STINGER.has(n)) { if (t < this.stingUntil) return true; this.stingUntil = t + Math.min(0.9, b.duration * 0.8); }
    this.last[n] = t;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    // the synth pitches went up to 2x; on recordings that turns squeaky, so only nudge them
    // the synth pitches went up to 2x; on recordings that turns squeaky, so only nudge them, and never above the base
    const nudge = PITCHED.has(n) && typeof pitch === 'number' ? Math.max(0.88, Math.min(1, Math.pow(pitch, 0.2))) : 1;
    src.playbackRate.value = SFX_RATE * nudge;
    const g = this.ctx.createGain(); g.gain.value = SFX_VOL[n] || 0.22;
    src.connect(g).connect(this.sfxBus); src.start(t);
    return true;
  }
  // a character speaks: what = 'hurt' | 'wait' | 'good' | 'great' | 'happy' | 'mid'. One short word, one
  // voice at a time; s (the patient state) gets s.talk so the mouth moves with the word.
  say(s, what) {
    if (!this.ctx || this.muted || !LINES[what]) return;
    const t = this.ctx.currentTime;
    if (t < this.voiceUntil || t < (this.lineAt[what] || 0)) return;
    const v = voiceOf(s && s.who), opts = LINES[what], word = opts[(Math.random() * opts.length) | 0], key = `${v}-${word}`;
    const b = this.vbuf[key];
    if (!b) { this.prepVoice(s && s.who); return; }
    const rate = s && s.who && s.who.kind === 'grandpa' ? 0.92 : 1;
    this.voiceUntil = t + b.duration / rate + 0.25;
    this.lineAt[what] = t + COOL[what];
    const src = this.ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = 0.85;
    src.connect(g).connect(this.voiceBus); src.start(t);
    this.sfxBus.gain.cancelScheduledValues(t);
    this.sfxBus.gain.setTargetAtTime(0.5, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(1, t + b.duration / rate, 0.1);
    if (this.talk && this.talk.who) this.talk.who.talk = 0;
    this.talk = s ? { who: s, env: this.venv[key], t0: t, rate } : null;
  }
  _loadVoice(key) {
    if (this.vbuf[key] !== undefined) return;
    this.vbuf[key] = null;
    this._load(new URL(`voice/${key}.mp3`, base)).then((x) => { this.vbuf[key] = x; this.venv[key] = envelope(x); }, () => {});
  }
  // load the patient's voice ahead of time (when they sit down)
  prepVoice(who) {
    if (!this.ctx) return;
    const v = voiceOf(who);
    for (const w of Object.values(LINES).flat()) this._loadVoice(`${v}-${w}`);
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
    // clips go through a warm low-pass (no ear-piercing top end) and duck under voices
    this.sfxBus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.4;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2000; shelf.gain.value = -9;
    this.sfxBus.connect(shelf).connect(lp).connect(this.master);
    // voices: quieter, with the hard 's' and shout edges taken off
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = 0.45;
    const vlp = ctx.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 4200; vlp.Q.value = 0.4;
    const vsh = ctx.createBiquadFilter(); vsh.type = 'highshelf'; vsh.frequency.value = 2400; vsh.gain.value = -7;
    const vcomp = ctx.createDynamicsCompressor(); vcomp.threshold.value = -26; vcomp.ratio.value = 5; vcomp.attack.value = 0.004; vcomp.release.value = 0.15;
    this.voiceBus.connect(vcomp).connect(vsh).connect(vlp).connect(this.master);
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
    // the tool loops (scrub, laser, polish, hum...) share a soft bus: quieter, no harsh top end
    const soft = ctx.createGain(); soft.gain.value = 0.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.3;
    soft.connect(lp); this._out(lp, 0.12);
    const mk = (name, chain, verb = 0.1) => {
      const g = ctx.createGain(); g.gain.value = 0;
      chain(g);
      g.connect(soft);
      this.loops[name] = g;
    };
    // scrub: soft soapy hiss (bubble blips come from grains)
    mk('scrub', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.5;
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
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.8;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 9;
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
      [523.25, 783.99, 1046.5].forEach((fr, i) => { const o = ctx.createOscillator(); o.frequency.value = fr; o.detune.value = (i - 1) * 7; const og = ctx.createGain(); og.gain.value = 0.13 / (i + 1); o.connect(og).connect(trem); o.start(); });
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2; const ng = ctx.createGain(); ng.gain.value = 0.15;
      n.connect(f).connect(ng).connect(trem); n.start();
      trem.connect(g);
    }, 0.35);
    // laser: a thin electric buzz
    mk('laser', (g) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 196;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 392;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
      const g2 = ctx.createGain(); g2.gain.value = 0.15;
      const trem = ctx.createGain(); trem.gain.value = 0.32;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const d = ctx.createGain(); d.gain.value = 0.2; lfo.connect(d).connect(trem.gain); lfo.start();
      o.connect(f); o2.connect(g2).connect(f); f.connect(trem).connect(g); o.start(); o2.start();
    }, 0.1);
    // iron: a steamy hiss
    mk('steam', (g) => {
      const n = this._noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.5;
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
    this.whOsc.frequency.setTargetAtTime(330 + 380 * Math.min(1.6, m), this.ctx.currentTime, 0.02);
    this.level('whistle', 0.08);
  }

  // ---------- music: a gentle marimba loop over C, G, Am, F ----------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.mNext = this.ctx.currentTime + 0.15; this.mStep = 0;
    this.music.gain.setTargetAtTime(0.75, this.ctx.currentTime, 2);
  }
  // a slow, soft lullaby: rounded bell notes over a warm pad and a quiet bass, through a
  // low-pass so nothing is bright or clinky. 4 bars of 16 steps at 76 bpm.
  _musicTick() {
    const ctx = this.ctx, sp = 60 / 76 / 4;
    if (!this.mBus) {
      this.mBus = ctx.createGain(); this.mBus.gain.value = 1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.4;
      this.mBus.connect(lp).connect(this.music);
    }
    while (this.mNext < ctx.currentTime + 0.3) {
      this._mStep(this.mStep, this.mNext, sp);
      this.mNext += sp; this.mStep = (this.mStep + 1) % 64;
    }
  }
  _mStep(i, t, sp) {
    const bar = i >> 4, st = i & 15;
    // C - Am - F - G, gentle and resolving
    const roots = [130.81, 110.0, 87.31, 98.0];
    const PADS = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
    const P = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    const MEL = [
      [2, -1, -1, -1, 4, -1, -1, 3, 2, -1, -1, -1, 0, -1, -1, -1],
      [1, -1, -1, -1, 2, -1, -1, 4, 3, -1, -1, -1, -1, -1, -1, -1],
      [0, -1, -1, -1, 2, -1, -1, 3, 4, -1, -1, 5, 4, -1, -1, -1],
      [3, -1, -1, -1, 1, -1, -1, 2, 3, -1, -1, -1, -1, -1, -1, -1],
    ];
    const n = MEL[bar][st];
    if (n >= 0) this._bell(P[n], t, 0.045);
    if (st === 0) { this._pad(PADS[bar], t, sp * 16); this._bass(roots[bar], t, sp * 8); }
    if (st === 8) this._bass(roots[bar] * 1.5, t, sp * 7);
  }
  // music-box bell: sine with a soft attack and a long, gentle tail (no metallic overtones)
  _bell(f, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol * 0.12, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.mBus); o2.connect(g2).connect(this.mBus);
    o.start(t); o.stop(t + 1.5); o2.start(t); o2.stop(t + 0.6);
  }
  // warm pad chord that swells in and fades over the bar
  _pad(chord, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.016, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    g.connect(this.mBus);
    for (const f of chord) for (const d of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = d;
      o.connect(g); o.start(t); o.stop(t + dur * 1.1);
    }
  }
  _bass(f, t, dur = 0.8) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.mBus); o.start(t); o.stop(t + dur + 0.05);
  }

  update(dt) {
    if (!this.ctx) return;
    if (this.talk) { // mouth follows the line's loudness
      const k = this.talk, i = Math.floor((this.ctx.currentTime - k.t0) * k.rate * ENV_RATE);
      if (!k.env || i >= k.env.length) { if (k.who) k.who.talk = 0; this.talk = null; }
      else if (i >= 0 && k.who) k.who.talk = k.env[i];
    }
    if (this.musicOn && this.ctx.state === 'running') this._musicTick();
    for (const k of ['bubble', 'bloop']) {
      const rate = this.grains[k];
      if (rate <= 0) continue;
      this._acc[k] += dt * rate;
      while (this._acc[k] > 1) {
        this._acc[k] -= 1;
        const t = this.ctx.currentTime;
        if (k === 'bubble') this._tone(330 + Math.random() * 280, t, 0.06, 0.035, 'sine', 650 + Math.random() * 350, 0.1);
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
  // a good job: soft rising bells (C E G C) with a warm chord under them, no brass
  fanfare() {
    if (!this.ctx) return; const ctx = this.ctx, t = this._t;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.3;
    const bus = ctx.createGain(); bus.gain.value = 0.2; bus.connect(lp); this._out(lp, 0.3);
    const note = (f, at, vol, len) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(bus); o.start(at); o.stop(at + len + 0.05);
    };
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + i * 0.14, 0.22, 1.2));
    [261.63, 329.63, 392.0].forEach((f) => note(f, t + 0.42, 0.08, 1.6));
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
