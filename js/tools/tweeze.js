// XIII. Tweezers: pull out whatever doesn't belong. Leaves, twigs and feathers stuck in
// the hair, a worm wriggling out of a nostril or an ear, and the patient's own
// piercings. Press on one and hold: it stretches and lifts as the tweezers pull; let go
// on the star and it pops out clean. Too early and it comes out with a struggle; too
// late and it yanks, which stings.
import { Tool, drawTapHint } from './base.js';
import { TAU, rand, ell } from '../draw.js';
import { INK, COL, applyHead } from '../patient.js';
import { drawBit, drawWorm } from '../extras.js';
import { onSkin, pinch, pluck } from './free.js';

const SILVER = '#e3e8f4';

export class TweezeTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() { super.reset(); this.list = null; this.fly = []; this.k = 0; this.at = null; }
  // every pluckable thing, fixed for this patient: debris, worms, piercings
  targets() {
    if (!this.list) {
      const s = this.g.s;
      this.list = [
        ...s.debris.map((d) => ({ x: d.x, y: d.y, r: 20, kind: 'debris', ref: d })),
        ...s.worms.map((w) => ({ x: w.x + Math.cos(w.a) * 22, y: w.y + Math.sin(w.a) * 22, r: 20, kind: 'worm', ref: w })),
        ...s.own.map((p) => ({ x: p.x, y: p.y + (p.ring ? 5 : 0), r: 10, kind: 'pierce', ref: p })),
      ];
    }
    return this.list;
  }
  hitR(t) { return t.r + 8; }
  fixed(i) { return !!this.targets()[i].ref.gone; }
  // off every target the tweezers still pluck: a hair, a brow hair; on a free use a
  // pinch of skin too
  freeSpot(q) {
    if (pluck(this.g, q)) return true;
    if (!this.free || !onSkin(this.g, q)) return false;
    pinch(this.g, q); return true;
  }
  enter() { super.enter(); this.reset(); this.targets(); this.g.s.lookAt = { x: 0, y: -120 }; }
  // where the tweezers grip target t, pulled by k
  grip(t, k) {
    const r = t.ref;
    if (t.kind === 'debris') return { x: t.x + Math.sin(r.a) * k * 22, y: t.y - Math.cos(r.a) * k * 22 };
    if (t.kind === 'worm') return { x: t.x + Math.cos(r.a) * k * 34, y: t.y + Math.sin(r.a) * k * 34 };
    return { x: t.x + (r.x > 0 ? 1 : -1) * k * 6, y: t.y + (r.ring ? 8 : -6) * k };
  }
  begin(i) {
    const t = this.targets()[i];
    this.k = 0;
    this.g.s.lookAt = { x: t.x, y: t.y };
    this.g.react('squeeze', 99, t.kind === 'debris' ? 'flat' : 'grit');
  }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, t = this.targets()[this.cur];
    this.k = p / this.sw.c;
    t.ref.pull = this.k;
    g.audio.tension(this.k * 0.8);
    if (this.k > 0.75) g.shake(0.004 * this.k);
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() {
    const t = this.targets()[this.cur];
    if (t) t.ref.pull = 0;
    this.k = 0; this.g.audio.tension(-1); this.g.react('normal', 0.01);
  }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s, t = this.targets()[i], r = t.ref, k = Math.max(0.6, this.k);
    const at = this.grip(t, k), w = g.head(at.x, at.y);
    g.audio.tension(-1);
    this.k = 0; this.wasIn = false;
    r.gone = true; r.pull = 0;
    // it flies off the way it was pulled, spinning
    const out = { x: at.x - t.x, y: at.y - t.y }, d = Math.hypot(out.x, out.y) || 1;
    const sp = result.verdict === 'early' ? 160 : 420;
    this.fly.push({ t, x: at.x, y: at.y, vx: (out.x / d) * sp + rand(-60, 60), vy: (out.y / d) * sp - 260, rot: 0, vr: rand(-9, 9), life: 0 });
    if (result.verdict === 'late') {
      // yanked: a sting where it was
      g.fx.ring(w.x, w.y, 4, 30, 0.35, '#ff7d9a', 5);
      g.react('squeeze', 0.9, 'wince');
      s.pain += 0.5; s.flush = 1; s.sweat = Math.max(s.sweat, 0.6);
      g.audio.nick();
    } else if (result.verdict === 'early') {
      g.fx.puff(w.x, w.y, 2, '255,255,255');
      g.react('normal', 0.6, 'flat');
      g.audio.boing(0.8);
    } else {
      g.fx.ring(w.x, w.y, 3, 26, 0.3, '#ffffff', 5);
      g.fx.burst(w.x, w.y, 5, 220, { size: rand(9, 13) });
      if (result.verdict === 'perfect') g.audio.sparkle();
      g.audio.pop(1.3);
      g.react('happy', 0.6, 'o');
    }
    if (t.kind === 'worm' && result.verdict !== 'early') g.fx.text(w.x, w.y - 40, 'EWW!', '#7fe0a0', 26);
    g.bump(0.3);
    return result;
  }
  finish(result) {
    super.finish(result);
    const { g } = this;
    if (result.verdict === 'perfect' || result.verdict === 'good') { g.react('happy', 1, 'grin'); g.audio.sparkle(); } else g.react('normal', 0.9, 'flat');
    return result;
  }
  update(dt) {
    super.update(dt);
    for (const f of this.fly) { f.life += dt; f.vy += 1400 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
    this.fly = this.fly.filter((f) => f.life < 1.1);
  }
  exit() { super.exit(); this.g.audio.tension(-1); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s, T = this.targets();
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = this.alpha;
    ctx.lineCap = 'round';
    // first use: a dashed ring round each thing still to pull
    if (!this.outro && this.guides) {
      for (let i = 0; i < T.length; i++) {
        if (this.done[i] || i === this.cur) continue;
        const t = T[i], R = t.r + 6 + Math.sin(time * 4 + i) * 2 + this.nudge * 10 * Math.sin(time * 20);
        ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU);
        ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 3.2; ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -time * 30; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // the ones pulled, flying off
    for (const f of this.fly) {
      ctx.save();
      ctx.globalAlpha = this.alpha * Math.max(0, 1 - f.life / 1.1);
      ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      if (f.t.kind === 'debris') drawBit(ctx, f.t.ref.kind);
      else if (f.t.kind === 'worm') drawWorm(ctx, -30, 0, 0, 60, time * 14, 1.35);
      else flyingPiercing(ctx, f.t.ref.ring);
      ctx.restore();
    }
    // the tweezers: on the one held, or hovering by the next one
    if (!this.outro) {
      let at, pinch = 0;
      if (this.cur >= 0) { at = this.grip(T[this.cur], Math.min(1.3, this.k)); pinch = 1; }
      else {
        const i = this.nextIndex();
        if (i >= 0) { at = { x: T[i].x + 14, y: T[i].y - 18 + Math.sin(time * 4) * 5 }; }
      }
      if (at) drawTweezers(ctx, at.x, at.y, pinch, this.cur >= 0 ? Math.sin(time * 30) * 0.04 * this.k : 0);
      if (this.cur < 0 && this.guides && (g.hint || this.nudge > 0.05)) {
        const i = this.nextIndex();
        if (i >= 0) drawTapHint(ctx, T[i].x, T[i].y, time, true, this.alpha * (g.hint ? 1 : this.nudge), 0.9);
      }
    }
    ctx.restore();
  }
}

function flyingPiercing(ctx, ring) {
  ctx.lineCap = 'round';
  if (ring) {
    ctx.beginPath(); ctx.arc(0, 0, 7, -0.4, Math.PI * 1.15);
    ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = SILVER; ctx.stroke();
  } else {
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.lineWidth = 2.6; ctx.strokeStyle = SILVER; ctx.stroke();
    for (const x of [-6, 6]) { ell(ctx, x, 0, 4, 4); ctx.fillStyle = SILVER; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); }
  }
}

// silver tweezers, tips at (x, y), the handle up and to the right; pinch closes the tips
function drawTweezers(ctx, x, y, pinch, wob = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(-0.75 + wob);
  const gap = 7 * (1 - pinch) + 1.2;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const p = new Path2D(`M ${side * gap} 0 L ${side * (gap + 2.5)} -10 L ${side * 13} -86 L ${side * 4} -92 L ${side * (gap - 1)} -10 Z`);
    ctx.fillStyle = SILVER; ctx.fill(p);
    ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke(p);
    // grip ridges
    ctx.lineWidth = 1.6; ctx.beginPath();
    for (let k = 0; k < 3; k++) { const yy = -44 - k * 8, xx = side * (6 + 0.1 * (44 + k * 8)); ctx.moveTo(xx - 2.5, yy); ctx.lineTo(xx + 2.5, yy); }
    ctx.stroke();
  }
  // the joined end and a shine
  ctx.beginPath(); ctx.roundRect(-14, -100, 28, 12, 6); ctx.fillStyle = COL.gold || '#ffc93c'; ctx.fill(); ctx.lineWidth = 3.4; ctx.stroke();
  ctx.globalAlpha *= 0.7; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-9, -97, 10, 3.5, 1.7); ctx.fill();
  ctx.restore();
}
