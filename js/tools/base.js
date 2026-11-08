// Common base for treatments. Two kinds:
//
// Target treatments (pimples, scars, jaw, posture, glow): the player presses ON a
// target and holds; the shared controller (game.js) runs that target's progress and
// scores its release against the target's own sweet zone. When every target is done
// the treatment ends with the average score.
//   targets()                 every target, {x, y, r} in head space
//   hitTest(hx, hy, sx, sy, minR)  index of the undone target under the press, or -1
//   begin(i)                  press on target i
//   hold(dt, p)               every frame while held; p = progress (0..def.hold.max)
//   idle(dt, p)               every frame while not held
//   cancel()                  a false-start tap on the current target was ignored
//   releaseTarget(i, p, r)    target i released; may adjust and return the result
//   finish(r)                 every target done; may adjust r; starts the outro
//
// Brush treatments (def.brush: wash, hair): the player drags over the patient.
//   brush(dt, pos)            every frame while pressed; pos = head-space finger point,
//                             or null when Space is held (the tool moves on its own)
//   lift()                    finger lifted
//   coverage()                0..1 for the meter
//   complete()                true once the job is done
//   result()                  {score, verdict} when complete
//
// Both: enter(), update(dt), outroDone(), draw(ctx, time) (stage space, over the
// patient), exit(), reset(). `g` is the shared context from game.js: patient state
// `s`, `fx`, `audio`, `dirt`, `head(x, y)` (head to stage), `prog`, `ghost`, `hint`,
// `fail`, `hit`, `shake`, `bump`, `react`, `toast`, `time`.
import { rand, TAU } from '../draw.js';
import { INK } from '../patient.js';

export class Tool {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.outroT = 0;
    this.outroLen = 0.6;
    this.outro = false; // set by the controller once the treatment is finished
    this.alpha = 0; this.alphaGoal = 0;
    this.p = 0;
    this.cur = -1; // target being held
    this.done = [];
    this.sweets = null;
    this.nudge = 0; // flashes the targets after a press that missed them
  }

  // ---------- targets ----------
  targets() { return [{ x: 0, y: 0, r: 200 }]; }
  hitR(t) { return t.r; }
  hitTest(hx, hy, sx, sy, minR = 0) {
    let best = -1, bd = Infinity;
    const T = this.targets();
    for (let i = 0; i < T.length; i++) {
      if (this.done[i]) continue;
      const d = Math.hypot(hx - T[i].x, hy - T[i].y);
      if (d <= Math.max(this.hitR(T[i]), minR) && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  nextIndex() { const n = this.targets().length; for (let i = 0; i < n; i++) if (!this.done[i]) return i; return -1; }
  left() { const n = this.targets().length; let k = 0; for (let i = 0; i < n; i++) if (!this.done[i]) k++; return k; }
  sweetFor(i) { return (this.sweets && this.sweets[i]) || this.def.sweet; }
  // sweet zone of the held target (or the next one), in progress units
  get sw() { return this.sweetFor(this.cur >= 0 ? this.cur : this.nextIndex()); }
  tOf(p) { return Math.min(1, p / this.def.hold.max); }
  get sweet() { const s = this.sw; return s ? { t: s.c / this.def.hold.max, w: s.w / this.def.hold.max } : null; }
  inZone(p) { const s = this.sw; return !!s && Math.abs(p - s.c) <= s.w; }

  enter() {
    this.alphaGoal = 1; this.p = 0; this.cur = -1;
    const n = this.def.brush ? 0 : this.targets().length, sw = this.def.sweet, j = this.def.jitter || 0;
    this.done = new Array(n).fill(false);
    // every target gets its own timing on harder levels
    this.sweets = sw ? Array.from({ length: n }, () => ({ c: sw.c + rand(-j, j), w: sw.w })) : null;
  }
  begin() {}
  hold(dt, p) { this.p = p; }
  idle() {}
  cancel() {}
  releaseTarget(i, p, result) { return result; }
  finish(result) { this.outroT = 0; return result; }

  // ---------- brushes ----------
  brush() {}
  lift() {}
  coverage() { return 0; }
  complete() { return false; }
  result() { return { score: 100, verdict: 'perfect' }; }

  update(dt) {
    if (this.outro) this.outroT += dt;
    this.alpha += (this.alphaGoal - this.alpha) * (1 - Math.exp(-dt * 9));
    this.nudge = Math.max(0, this.nudge - dt * 1.4);
  }
  outroDone() { return this.outro && this.outroT >= this.outroLen; }
  draw() {}
  exit() { this.alphaGoal = 0; this.alpha = 0; }
  reset() { this.p = 0; }
  // true while the controller waits for a press on a target
  get waiting() { return !this.outro && this.cur < 0; }
  guideOpts(time) {
    const g = this.g;
    return {
      prog: g.prog, sweet: this.sweet, alpha: this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2.2) : 1),
      fail: g.fail, hit: g.hit, ghost: g.ghost, time, inZone: this.inZone(this.p),
    };
  }
}

// "press here": soft pulsing rings, plus a pointing hand for first-timers or after a
// missed press. Head (or stage) space, whatever transform is current.
export function drawTapHint(ctx, x, y, time, hand, alpha = 1, size = 1) {
  const k = (time * 0.9) % 1;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 2; i++) {
    const q = (k + i * 0.5) % 1;
    ctx.globalAlpha = alpha * (1 - q) * 0.9;
    ctx.beginPath(); ctx.arc(x, y, (16 + q * 34) * size, 0, TAU);
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  if (hand) {
    const press = Math.max(0, Math.sin(time * 5.6));
    ctx.globalAlpha = alpha;
    drawHand(ctx, x + 4, y + 6 + press * 4, size);
  }
  ctx.restore();
}

// a white cartoon hand whose index fingertip sits at (x, y)
export function drawHand(ctx, x, y, size = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(size, size); ctx.rotate(-0.4);
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(-4, 30, 50, 46, [14, 14, 18, 18]); ctx.fill(); ctx.stroke();
  for (const [fx, h] of [[16, 26], [28, 24], [40, 20]]) { ctx.beginPath(); ctx.roundRect(fx - 7, 46 - h, 14, h + 6, 7); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.roundRect(-11, 44, 16, 26, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-8, 0, 16, 52, 8); ctx.fill(); ctx.stroke();
  ctx.restore();
}
