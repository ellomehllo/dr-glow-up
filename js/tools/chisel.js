// III. Sculpt jaw: press on the jaw and hold. A jade roller glides along the planned
// jawline (the dotted guide) while the soft jaw firms into a sharp one. Stop on the
// star; carry on and the jaw turns red and irritated.
import { Tool, drawTapHint } from './base.js';
import { rand } from '../draw.js';
import { INK, applyHead, jawLine, onFace } from '../patient.js';
import { makeGuide, guideAt, drawGuide } from '../guide.js';

export class ChiselTool extends Tool {
  constructor(g, def) {
    super(g, def);
    this.pts = jawLine();
    this.outroLen = 0.8;
    this.reset();
  }
  reset() { super.reset(); this.tap = 0; this.roll = 0; this.segs = null; this.pos = null; }
  targets() { return [{ x: 0, y: 150, r: 160 }]; }
  // the lower face, the jaw and the roller itself
  hitTest(hx, hy, sx, sy, minR = 0) {
    if (this.done[0]) return -1;
    const onJaw = hy > 20 && onFace(hx, hy, 48);
    const onRoller = this.pos && Math.hypot(hx - this.pos.x, hy - this.pos.y) <= Math.max(70, minR);
    return onJaw || onRoller ? 0 : -1;
  }
  fixed() { return this.g.s.jaw >= 0.6; }
  enter() {
    super.enter();
    // the stretch after the sweet zone reads as "too far": drawn pink by the guide
    this.segs = makeGuide([{ pts: this.pts, t0: 0, t1: 1 }]);
    this.pos = guideAt(this.segs, 0);
  }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, def = this.def, s = g.s, sw = this.sw;
    s.jaw = Math.min(1.35, p / sw.c);
    s.nick = p > sw.c + sw.w ? (p - sw.c - sw.w) / (def.hold.max - sw.c - sw.w) : 0;
    this.pos = guideAt(this.segs, this.tOf(p));
    this.roll += dt * 9;
    s.lookAt = { x: this.pos.x * 0.6, y: this.pos.y };
    this.tap += dt;
    if (this.tap > 0.1) {
      this.tap = 0;
      const w = g.head(this.pos.x, this.pos.y);
      g.fx.spark(w.x + rand(-10, 10), w.y + rand(-10, 10), { size: rand(8, 14), col: '#3fe0b5', vy: -40 });
      if (Math.random() < 0.5) g.fx.glitter(w.x, w.y, 2, 140);
      if (s.nick > 0) g.fx.puff(w.x, w.y, 1, '255,150,170');
      g.audio.tink(0.6 + Math.random() * 0.2);
      g.shake(0.012);
      if (Math.random() < 0.25) g.react(s.nick > 0 ? 'squeeze' : 'happy', 0.15, 'flat');
    }
  }
  cancel() { const s = this.g.s; s.jaw = 0; s.nick = 0; this.pos = guideAt(this.segs, 0); }
  releaseTarget(i, p, result) {
    const { g } = this;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      g.fx.along(this.pts.filter((_, i) => i % 2 === 0).map((q) => g.head(q[0], q[1])), 12, { step: 0.025 });
      g.audio.shing();
      g.react('normal', 1.2, 'smirk');
    } else if (result.verdict === 'late') {
      const w = g.head(0, 180);
      g.fx.puff(w.x, w.y, 4, '255,150,170');
      g.fx.text(w.x + 110, w.y - 10, 'OUCH!', '#ff7d9a', 28);
      g.audio.nick();
      g.react('wide', 1, 'o');
    } else g.react('normal', 0.8, 'flat');
    return result;
  }
  draw(ctx, time) {
    if (this.alpha < 0.01 || !this.segs) return;
    const { g } = this;
    ctx.save();
    applyHead(ctx, g.s);
    drawGuide(ctx, this.segs, this.guideOpts(time));
    if (this.cur < 0 && !this.outro && (g.hint || this.nudge > 0.05)) drawTapHint(ctx, 0, 168, time, true, g.hint ? 1 : this.nudge, 0.9);
    // the jade roller: roller on the line, handle pointing away from the face
    const q = this.pos;
    let nx = q.ty, ny = -q.tx;
    if (nx * q.x + ny * (q.y - 40) < 0) { nx = -nx; ny = -ny; }
    const back = 14 + (this.outro ? this.outroT * 300 : 0) + (this.p > 0 ? 0 : Math.sin(time * 4) * 5);
    ctx.globalAlpha = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    ctx.translate(q.x + nx * back, q.y + ny * back);
    ctx.rotate(Math.atan2(ny, nx) - Math.PI / 2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
    // frame and handle
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-34, 0); ctx.lineTo(-34, 22); ctx.lineTo(0, 22); ctx.lineTo(0, 92);
    ctx.moveTo(30, 0); ctx.lineTo(34, 0); ctx.lineTo(34, 22); ctx.lineTo(0, 22);
    ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(-9, 50, 18, 54, 9); ctx.fillStyle = '#7ee0b8'; ctx.fill(); ctx.stroke();
    // roller with moving stripes
    ctx.beginPath(); ctx.roundRect(-30, -13, 60, 26, 13);
    ctx.fillStyle = '#5fd0a0'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = -2; i < 6; i++) { const x = -30 + ((i * 14 + this.roll * 14) % 84); ctx.moveTo(x, -13); ctx.lineTo(x - 6, 13); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-26, -9, 52, 5);
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(-30, -13, 60, 26, 13); ctx.stroke();
    ctx.restore();
  }
}
