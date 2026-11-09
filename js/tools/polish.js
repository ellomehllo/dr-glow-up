// VII. Glow: no-fail. Press on the face and hold (as many presses as you like): a
// fluffy puff swirls glow serum over it, a shine band sweeps across, glints pop up,
// and at the end the skin glows like glass.
import { Tool, drawTapHint } from './base.js';
import { TAU, rand } from '../draw.js';
import { INK, applyHead, onFace } from '../patient.js';

export class PolishTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 1.0; this.reset(); }
  reset() { super.reset(); this.acc = 0; this.pos = { x: -60, y: -40 }; this.rubbing = false; this.fly = 0; }
  targets() { return [{ x: 0, y: 0, r: 210 }]; }
  hitTest(hx, hy) { return !this.done[0] && onFace(hx, hy, 36) ? 0 : -1; }
  fixed() { return this.g.s.shine >= 1; }
  enter() { super.enter(); }
  begin() { this.rubbing = true; }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s, t = p / this.def.hold.max;
    s.shine = t;
    // swirl over the face, drifting left to right and top to bottom
    const a = t * 22;
    const cx = -90 + 180 * t, cy = -90 + 170 * (0.5 - 0.5 * Math.cos(t * Math.PI * 3));
    this.pos = { x: cx + Math.cos(a) * 46, y: cy + Math.sin(a) * 34 };
    s.sweep = -260 + 520 * ((t * 2.2) % 1);
    s.lookAt = { x: this.pos.x, y: this.pos.y };
    g.react('happy', 0.25, null);
    this.acc += dt;
    if (this.acc > 0.07) {
      this.acc = 0;
      const w = g.head(this.pos.x + rand(-40, 40), this.pos.y + rand(-40, 40));
      g.fx.spark(w.x, w.y, { size: rand(9, 16), vy: -40 });
    }
    g.audio.level('polish', 0.3);
    this.rubbing = true;
  }
  idle() { this.rubbing = false; this.g.audio.level('polish', 0); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s;
    this.rubbing = false;
    g.audio.level('polish', 0);
    s.sweep = -999; s.shine = 1; s.glow = 1;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU, w = g.head(Math.cos(a) * 175, -20 + Math.sin(a) * 215);
      g.fx.spark(w.x, w.y, { delay: i * 0.02, size: rand(14, 22), vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 });
    }
    const c = g.head(0, 0);
    g.fx.hearts(c.x, c.y - 60, 4);
    g.react('happy', 1.3, 'grin');
    s.sqV += 2.2;
    return result;
  }
  update(dt) { super.update(dt); if (this.outro) this.fly += dt; }
  exit() { super.exit(); this.g.audio.level('polish', 0); this.g.s.sweep = -999; }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    ctx.save();
    applyHead(ctx, s);
    if (this.cur < 0 && !this.outro && (g.hint || this.nudge > 0.05)) drawTapHint(ctx, 10, 30, time, true, this.alpha * (g.hint ? 1 : this.nudge), 1);
    ctx.globalAlpha = this.alpha * Math.max(0, 1 - this.fly * 1.8);
    const bob = this.rubbing ? 0 : Math.sin(time * 4) * 6;
    ctx.translate(this.pos.x - this.fly * 380, this.pos.y + bob - this.fly * 300);
    ctx.rotate(Math.sin(time * (this.rubbing ? 14 : 2)) * 0.25);
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
    const blob = new Path2D('M -46 -8 C -50 -34 -20 -40 -4 -30 C 10 -46 44 -38 44 -14 C 60 -2 54 26 30 28 C 18 44 -16 44 -26 28 C -50 30 -60 6 -46 -8 Z');
    ctx.fillStyle = '#ffe1ee'; ctx.fill(blob); ctx.stroke(blob);
    ctx.fillStyle = 'rgba(255,170,205,0.6)'; ctx.beginPath(); ctx.ellipse(6, 10, 30, 16, 0, 0, TAU); ctx.fill();
    // ribbon loop on top
    ctx.lineWidth = 5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, -34, 20, 11, 0, 0, TAU); ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe1ee'; ctx.beginPath(); ctx.ellipse(0, -34, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-22, -10, 9, 6, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
