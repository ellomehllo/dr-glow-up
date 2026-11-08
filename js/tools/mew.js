// IV. Mew: press on the patient and hold. The slouched patient sits up and the head
// rises out of the shoulders (a slide whistle rises with it). Let go when the head
// meets the dotted outline. Too far: giraffe neck.
import { Tool, drawTapHint } from './base.js';
import { rand } from '../draw.js';
import { INK, COL, headPath, headY, applyHead } from '../patient.js';

export class MewTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; }
  targets() { return [{ x: 0, y: 60, r: 260 }]; }
  // anywhere on the patient: head, neck or body
  hitTest(hx, hy, sx, sy) { return !this.done[0] && Math.abs(sx) < 300 && sy > headY(this.g.s) - 230 ? 0 : -1; }
  enter() { super.enter(); this.g.s.lookAt = { x: 0, y: -60 }; }
  begin() { this.g.react('normal', 99, 'flat'); }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s;
    s.mew = p / this.sw.c;
    s.lookAt = { x: 0, y: -80 - 60 * Math.min(1.6, s.mew) };
    g.audio.whistle(s.mew);
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    if (inZone && Math.random() < 0.3) g.fx.spark(rand(-150, 150), rand(-200, 180), { size: rand(7, 11), life: 0.4 });
    this.wasIn = inZone;
  }
  cancel() { this.g.s.mew = 0; this.g.audio.whistle(-1); this.g.react('normal', 0.01); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s;
    g.audio.whistle(-1);
    s.lookAt = null;
    s.sqV -= 1.6;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      g.audio.lock();
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 10)); pts.push(g.head(Math.cos(a) * 150, 60 + Math.sin(a) * 130)); }
      g.fx.along(pts, 11, { step: 0.03 });
      g.react('normal', 1.3, 'smirk');
    } else if (result.verdict === 'late') {
      g.audio.boing(0.8);
      g.react('wide', 1.3, 'o');
      const w = g.head(0, 230);
      g.fx.text(w.x + 120, w.y, 'BOING!', '#45c8ff', 28);
    } else {
      g.react('normal', 0.9, 'wince');
    }
    return result;
  }
  exit() { super.exit(); this.g.audio.whistle(-1); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    const zone = this.inZone(this.p) || g.hit > 0.05;
    // dotted outline where the head belongs
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2.2) : 1);
    if (a < 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, s.bob);
    const hp = headPath(s.jaw);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([0.1, 14]); ctx.lineDashOffset = -time * 20;
    ctx.lineWidth = 9; ctx.strokeStyle = zone ? COL.gold : INK; ctx.globalAlpha = a * (zone ? 1 : 0.55);
    ctx.save(); ctx.scale(s.fx, s.fy); ctx.lineWidth = 9 / Math.max(s.fx, s.fy); ctx.stroke(hp); ctx.restore();
    ctx.setLineDash([]);
    ctx.globalAlpha = a;
    // up chevrons above the head while waiting, a nudge for the direction
    if (!this.outro && this.p < 0.05) {
      const top = headY(s) - s.bob - 240, k = (time * 1.5) % 1;
      ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff';
      for (let i = 0; i < 2; i++) {
        const y = top - i * 22 - k * 16;
        ctx.globalAlpha = a * (1 - k) * (i ? 0.6 : 1);
        ctx.beginPath(); ctx.moveTo(-20, y + 12); ctx.lineTo(0, y); ctx.lineTo(20, y + 12); ctx.stroke();
      }
    }
    ctx.restore();
    if (this.cur < 0 && !this.outro && (g.hint || this.nudge > 0.05)) {
      ctx.save(); applyHead(ctx, s);
      drawTapHint(ctx, 0, 40, time, true, a * (g.hint ? 1 : this.nudge), 1);
      ctx.restore();
    }
  }
}
