// Boot: build everything (all procedural, a few ms), draw the first frame, then tell
// Playables we are ready. One RAF loop; pauses on hidden tab or Playables pause.
import { HoldInput } from './input.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Playables } from './playables.js';
import { Game } from './game.js';
import { Director } from './camera.js';
import { Backdrop } from './backdrop.js';
import { FX } from './fx.js';
import { Dirt } from './dirt.js';
import { VIEWS } from './config.js';
import { headToStage } from './patient.js';

const T0 = performance.now();
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const audio = new Sound();
// automated checks (?debug) never open an AudioContext unless &sound is given
const qs = new URLSearchParams(location.search);
if (qs.has('debug') && !qs.has('sound')) { audio.init = () => {}; audio.muted = true; }
const playables = new Playables();
const input = new HoldInput(document.body);
let game = null;

const ui = new UI(document.getElementById('ui'), {
  onGesture: () => audio.init(),
  onMute: (m) => audio.setMuted(m),
  onAgain: () => game && game.retry(),
  onNext: () => game && game.nextLevel(),
  onSplit: (v) => game && game.setSplit(v),
});
input.on('first', () => audio.init());
if (audio.muted) ui.setMuted(true);
audio.setPlatformAudio(playables.audioEnabled());
playables.onAudioChange((on) => audio.setPlatformAudio(on));
if (document.fonts && document.fonts.load) document.fonts.load('700 32px Fredoka').catch(() => {});

const director = new Director(VIEWS.intro);
game = new Game({ ui, audio, input, fx: new FX(), dirt: new Dirt(), director, backdrop: new Backdrop(), playables });
window.__game = game;

// ---------- sizing and adaptive resolution ----------
let W = 1, H = 1, dpr = 1;
const dprCap = Math.min(window.devicePixelRatio || 1, 2);
let quality = 1; // scales the pixel ratio down when frames run long
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.max(0.75, dprCap * quality);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  game.resize();
}
window.addEventListener('resize', resize);
resize();
game.start();
window.__bootMs = performance.now() - T0;

// ---------- pause ----------
let paused = false;
function setPaused(p) {
  if (p === paused) return;
  paused = p;
  if (p) { input.cancel(); audio.suspend(); } else audio.resume();
}
document.addEventListener('visibilitychange', () => setPaused(document.hidden));
playables.onPause(() => setPaused(true));
playables.onResume(() => setPaused(document.hidden));

// ---------- loop ----------
let last = performance.now(), time = 0, frames = 0, slow = 0, acc = 0, firstDone = false;
function afterFirstFrame() {
  firstDone = true;
  window.__firstFrameMs = performance.now() - T0;
  playables.firstFrameReady();
  playables.load().then((saved) => { if (saved && typeof saved === 'object') game.mergeProgress(saved); }).finally(() => playables.gameReady());
}
function step(dt) {
  time += dt;
  game.update(dt, time);
  game.render(ctx, W, H, dpr, time, dt);
  if (!firstDone) afterFirstFrame();
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  if (paused || window.__mmFreeze) return;
  step(Math.min(0.05, Math.max(0, raw)));
  // adaptive resolution: if frames average over ~20ms for a while, render fewer pixels
  if (raw < 0.25) {
    frames++; acc += raw;
    if (frames >= 90) {
      const avg = acc / frames;
      if (avg > 0.0205 && quality > 0.6) { slow++; if (slow >= 2) { quality = Math.max(0.6, quality - 0.15); slow = 0; resize(); } }
      else slow = 0;
      frames = 0; acc = 0;
    }
  }
}
requestAnimationFrame(frame);

// ?debug: deterministic stepping and a synced benchmark for automated checks
if (qs.has('debug')) {
  const sync = () => ctx.getImageData(0, 0, 1, 1);
  window.__mm = {
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
    bench(n = 60) { sync(); const t = performance.now(); this.step(n); sync(); return (performance.now() - t) / n; },
    get game() { return game; },
    info: () => ({ W, H, dpr, quality, first: window.__firstFrameMs, boot: window.__bootMs, fx: game.fx.count }),
    key(type) { window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true })); },
    until(mode, max = 900) { let i = 0; while (game.mode !== mode && i < max) { this.step(1); i++; } return i; },
    // fast-forward CSS transitions so a screenshot shows the settled UI
    settle() { document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite */ } }); },
    // hold Space for `sec` of game time, then release
    hold(sec) { this.key('keydown'); this.step(Math.round(sec * 60)); this.key('keyup'); },
    // jump to a level (0-based) with a fresh patient (optionally a given character kind)
    level(n, kind) { game.startLevel(n, kind); return game.defs.map((d) => d.id); },
    // scripted run of the current level from its first treatment, with Space: every
    // target is released at its own sweet centre plus off[id] (progress units, or a
    // function of the target index); brushes run on autopilot
    play(off = {}, stopAt = null) {
      const waitFor = (ms) => { let i = 0; while (!ms.includes(game.mode) && i < 900) { this.step(1); i++; } };
      for (const tool of game.tools) {
        waitFor(['ready']);
        const def = tool.def;
        if (stopAt === def.id) return game.mode;
        if (def.brush) {
          this.key('keydown');
          let i = 0; while (game.mode === 'brushing' && i < 900) { this.step(1); i++; }
          this.key('keyup');
        } else {
          let guard = 0;
          while (game.mode === 'ready' && game.tool === tool && guard++ < 20) {
            const k = tool.nextIndex(), sw = tool.sweetFor(k), o = off[def.id];
            const target = sw ? sw.c + (typeof o === 'function' ? o(k) : o || 0) : def.hold.max + 0.05;
            this.key('keydown');
            let i = 0; while (game.mode === 'holding' && game.p < target && i < 900) { this.step(1); i++; }
            this.key('keyup');
            this.step(2);
          }
        }
        waitFor(['ready', 'finale', 'results']);
      }
      waitFor(['results']);
      return game.mode;
    },
    // a real finger: press at head-space (hx, hy), optionally drag through more
    // head-space points, over `sec` seconds of game time, then lift
    toScreen(hx, hy) { const st = headToStage(game.s, hx, hy); return game.director.toScreen(st.x, st.y); },
    ptr(type, hx, hy) {
      const q = this.toScreen(hx, hy);
      document.body.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: q.x, clientY: q.y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
    },
    drag(pts, sec, lift = true) {
      const n = Math.max(1, Math.round(sec * 60));
      this.ptr('pointerdown', pts[0][0], pts[0][1]);
      for (let i = 1; i <= n; i++) {
        const u = (i / n) * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(u)), f = u - j;
        const a = pts[j], b = pts[Math.min(pts.length - 1, j + 1)];
        this.ptr('pointermove', a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
        this.step(1);
      }
      if (lift) { const e = pts[pts.length - 1]; this.ptr('pointerup', e[0], e[1]); }
    },
    tap(hx, hy, sec) { this.drag([[hx, hy], [hx, hy]], sec); },
    ready() { window.__mmFreeze = true; },
  };
}
