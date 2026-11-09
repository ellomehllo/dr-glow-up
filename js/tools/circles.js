// IX. Dark circles: press under an eye and hold. A cool cucumber slice settles on the
// dark circle and it fades while the gauge under the eye fills; let go on the star and
// the cucumber flips away. Too early leaves a shadow; too long and the cucumber leaves
// a green ring.
import { Tool, drawTapHint } from './base.js';
import { TAU, rand, clamp01 } from '../draw.js';
import { INK, EYE, applyHead } from '../patient.js';
import { makeGuide, drawGuide } from '../guide.js';
import { onSkin, dab } from './free.js';

// one target under each eye, and a gauge arc that hangs below it
const SPOTS = [-1, 1].map((side) => ({ x: side * EYE.x, y: EYE.y + 32, r: 46 }));
const arc = (cx) => {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const a = Math.PI * (0.94 - 0.88 * (i / 20)); pts.push([cx + Math.cos(a) * 52, 26 + Math.sin(a) * 54]); }
  return pts;
};
const GAUGES = SPOTS.map((t) => makeGuide([{ pts: arc(t.x), t0: 0, t1: 1 }]));

export class CirclesTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.9; this.reset(); }
  reset() { super.reset(); this.fly = []; this.acc = 0; this.press = 0; }
  targets() { return SPOTS; }
  hitR(t) { return t.r + 6; }
  fixed(i) { return this.g.s.circ[i] < 0.05; }
  freeSpot(q) { if (!this.free || !onSkin(this.g, q)) return false; dab(this.g, q, '#c4ef94'); return true; } // a cool slice
  enter() { super.enter(); this.reset(); this.g.s.lookAt = { x: 0, y: -40 }; }
  begin(i) { this.g.react('happy', 99, null); this.press = 0; this.g.s.lookAt = null; void i; }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s, i = this.cur, sw = this.sw, max = this.def.hold.max;
    s.circ[i] = clamp01(1 - p / sw.c);
    s.circG[i] = p > sw.c + sw.w ? clamp01((p - sw.c - sw.w) / (max - sw.c - sw.w)) : 0;
    this.press = Math.min(1, this.press + dt * 8);
    g.audio.level('steam', 0.06);
    this.acc += dt;
    if (this.acc > 0.09) {
      this.acc = 0;
      const t = SPOTS[i], w = g.head(t.x + rand(-26, 26), t.y + rand(-14, 14));
      g.fx.spark(w.x, w.y, { size: rand(7, 11), col: s.circG[i] > 0 ? '#7fd06a' : '#ffffff', vy: -40, life: 0.45 });
    }
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { const s = this.g.s; if (this.cur >= 0) { s.circ[this.cur] = 1; s.circG[this.cur] = 0; } this.idle(); this.g.react('normal', 0.01); }
  idle() { this.g.audio.level('steam', 0); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s, t = SPOTS[i], w = g.head(t.x, t.y), side = t.x < 0 ? -1 : 1;
    this.idle(); this.wasIn = false;
    // the cucumber flips off the face
    this.fly.push({ x: w.x, y: w.y, vx: side * rand(220, 300), vy: -rand(520, 620), rot: 0, vr: side * rand(7, 10), t: 0 });
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      s.circ[i] = 0;
      g.fx.burst(w.x, w.y, 6, 180, { size: rand(9, 14) });
      g.audio.shing();
      g.react('happy', 0.8, 'grin');
    } else if (result.verdict === 'late') {
      g.fx.puff(w.x, w.y, 3, '150,220,120');
      g.audio.boing(0.7);
      g.react('wide', 0.9, 'o');
    } else g.react('normal', 0.8, 'flat');
    return result;
  }
  update(dt) {
    super.update(dt);
    for (const f of this.fly) { f.t += dt; f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
    this.fly = this.fly.filter((f) => f.t < 1.2);
    if (this.cur < 0) this.press = 0;
  }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 1.5) : 1);
    ctx.save();
    ctx.globalAlpha = a;
    // flipped-off cucumbers, in stage space
    for (const f of this.fly) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(Math.cos(f.rot * 0.6), 1);
      drawCucumber(ctx, 1); ctx.restore();
    }
    if (this.outro) { ctx.restore(); return; }
    applyHead(ctx, s);
    const held = this.cur;
    SPOTS.forEach((t, i) => {
      if (this.done[i]) return;
      if (i === held) {
        if (this.guides) drawGuide(ctx, GAUGES[i], this.guideOpts(time));
        ctx.save(); ctx.translate(t.x, t.y - 6); ctx.scale(1 + 0.08 * (1 - this.press), 1 - 0.1 * this.press); drawCucumber(ctx, 1); ctx.restore();
        return;
      }
      // waiting: the gauge under the eye as a breathing dotted arc (first use only)
      if (!this.guides) return;
      const P = GAUGES[i][0].poly, k = 1 + 0.04 * Math.sin(time * 4 + i) + this.nudge * 0.06 * Math.sin(time * 20);
      ctx.save(); ctx.translate(t.x, 26); ctx.scale(k, k); ctx.translate(-t.x, -26);
      ctx.lineCap = 'round'; ctx.setLineDash([0.1, 13]); ctx.lineDashOffset = -time * 16;
      ctx.beginPath(); P.trace(ctx, 0, P.len);
      ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    });
    if (held < 0) {
      const i = this.nextIndex();
      if (i >= 0) {
        const t = SPOTS[i];
        ctx.save(); ctx.translate(t.x + (t.x < 0 ? -64 : 64), t.y + 34 + Math.sin(time * 3) * 6); ctx.rotate(Math.sin(time * 2) * 0.2);
        drawCucumber(ctx, 0.8); ctx.restore();
        if (this.guides && (g.hint || this.nudge > 0.05)) drawTapHint(ctx, t.x, t.y, time, true, g.hint ? 1 : this.nudge, 0.9);
      }
    }
    ctx.restore();
  }
}

// a cucumber slice centred on the origin
function drawCucumber(ctx, k) {
  ctx.save(); ctx.scale(k, k);
  ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fillStyle = '#3f9a4a'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.fillStyle = '#c4ef94'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fillStyle = '#e6ffc8'; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(58,39,71,0.35)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    ctx.beginPath(); ctx.ellipse(Math.cos(a) * 14, Math.sin(a) * 14, 3.4, 2, a, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-9, -12, 7, 3.5, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}
