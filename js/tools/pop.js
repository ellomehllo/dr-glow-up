// II. Pop pimples, one at a time: press on a pimple and hold. It swells while a ring
// closes in on it; let go when the ring hugs it (gold) and it pops clean in a burst of
// sparkles. Too early and it sinks back, stubborn. Too late and it pops messy and
// leaves a red mark. Each pimple has its own timing on harder levels.
import { Tool, drawTapHint } from './base.js';
import { TAU, rand } from '../draw.js';
import { INK, COL, applyHead } from '../patient.js';

export class PopTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.9; this.reset(); }
  reset() { super.reset(); this.k = 0; }
  targets() { return this.g.s.pimples; }
  hitR(t) { return t.r * 1.8 + 16; }
  enter() { super.enter(); this.k = 0; this.g.s.lookAt = { x: 0, y: 40 }; }
  begin(i) {
    const pm = this.g.s.pimples[i];
    this.k = 0;
    this.g.s.lookAt = { x: pm.x, y: pm.y };
    this.g.react('squeeze', 99, 'flat');
  }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, pm = g.s.pimples[this.cur];
    this.k = p / this.sw.c;
    pm.swell = Math.min(1.45, this.k);
    g.audio.tension(this.k);
    if (this.k > 0.7) g.shake(0.005 * this.k);
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() {
    const pm = this.g.s.pimples[this.cur];
    if (pm) pm.swell = 0;
    this.k = 0; this.g.audio.tension(-1); this.g.react('normal', 0.01);
  }
  releaseTarget(i, p, result) {
    const { g } = this, pm = g.s.pimples[i], w = g.head(pm.x, pm.y);
    g.audio.tension(-1);
    this.k = 0; this.wasIn = false;
    if (result.verdict === 'early') {
      // sinks back into a smaller, stubborn bump
      pm.deflate = true; pm.shrink = 0.35;
      g.fx.puff(w.x, w.y, 2, '255,200,210');
      g.audio.boing(0.7);
      g.react('normal', 0.7, 'wince');
      return result;
    }
    const messy = result.verdict === 'late';
    pm.popped = true; pm.mark = messy ? 1 : 0;
    g.fx.pop(w.x, w.y, pm.r * 1.4, null, messy);
    if (messy) { g.audio.splat(); g.react('normal', 0.8, 'wince'); }
    else {
      g.audio.pop(1 + Math.random() * 0.3);
      if (result.verdict === 'perfect') { g.fx.burst(w.x, w.y, 6, 200, { size: rand(10, 15) }); g.audio.sparkle(); }
      g.react('wide', 0.45, 'o');
    }
    g.bump(0.35);
    return result;
  }
  finish(result) {
    super.finish(result);
    const { g } = this;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      g.react('happy', 0.9, 'grin');
      g.s.flush = 1;
      for (const side of [-1, 1]) { const w = g.head(side * 96, 64); g.fx.burst(w.x, w.y, 6, 200, { size: rand(10, 16) }); }
      g.audio.sparkle();
    } else g.react('normal', 1, 'wince');
    return result;
  }
  update(dt) {
    super.update(dt);
    for (const pm of this.g.s.pimples) if (pm.deflate) pm.swell = Math.max(0, pm.swell - dt * 4);
  }
  exit() { super.exit(); this.g.audio.tension(-1); }
  draw(ctx, time) {
    if (this.alpha < 0.01 || this.outro) return;
    const { g } = this, s = g.s, P = s.pimples;
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = this.alpha;
    ctx.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      if (this.done[i]) continue;
      const pm = P[i], held = i === this.cur;
      const base = pm.r * 1.25;
      let R, zone = false, over = false;
      if (held) {
        // the ring closes in as the pimple swells; gold while it hugs the pimple
        const sw = this.sw, k = Math.min(1.45, this.k);
        zone = this.inZone(this.p); over = this.p > sw.c + sw.w;
        const r = pm.r * (1 + 0.6 * Math.min(1.4, pm.swell));
        R = k < 1 ? r * 1.25 + pm.r * 2.6 * (1 - k) : r * (1.25 - 0.35 * (k - 1));
      } else {
        // waiting: a gently breathing dashed ring that says "press me"
        R = base + pm.r * 1.6 + Math.sin(time * 4 + i) * 2 + this.nudge * 10 * Math.sin(time * 20);
      }
      ctx.beginPath(); ctx.arc(pm.x, pm.y, R, 0, TAU);
      ctx.lineWidth = zone ? 8 : 6.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = zone ? 4.5 : 3.5;
      ctx.strokeStyle = zone ? COL.gold : over ? '#ff7d9a' : '#ffffff';
      ctx.setLineDash(zone ? [] : [7, 7]); ctx.lineDashOffset = -time * 30; ctx.stroke(); ctx.setLineDash([]);
    }
    // first time (or after a miss): a hand points at the next pimple
    if (this.cur < 0 && (g.hint || this.nudge > 0.05)) {
      const i = this.nextIndex();
      if (i >= 0) drawTapHint(ctx, P[i].x, P[i].y, time, true, this.alpha * (g.hint ? 1 : this.nudge), 0.9);
    }
    ctx.restore();
  }
}
