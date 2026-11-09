// X. Whiten teeth: the patient grins wide. Press on the teeth and hold: a little blue
// lamp glides along under the smile while the yellow teeth turn white; let go on the
// star. Too long and they glow a blinding ice-blue.
import { Tool, drawTapHint } from './base.js';
import { rand, star4 } from '../draw.js';
import { INK, applyHead } from '../patient.js';
import { makeGuide, guideAt, drawGuide } from '../guide.js';

const LINE = [[-46, 157], [-24, 160], [0, 161], [24, 160], [46, 157]]; // just under the lower lip

export class TeethTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() { super.reset(); this.acc = 0; this.pos = null; this.segs = null; this.prevMouth = null; }
  targets() { return [{ x: 0, y: 120, r: 80 }]; }
  hitTest(hx, hy, sx, sy, minR = 0) {
    if (this.done[0]) return -1;
    const onMouth = Math.abs(hx) < 92 && hy > 78 && hy < 200;
    const onLamp = this.pos && Math.hypot(hx - this.pos.x, hy - this.pos.y - 50) <= Math.max(50, minR);
    return onMouth || onLamp ? 0 : -1;
  }
  fixed() { return this.g.s.teeth >= 0.95; }
  enter() {
    super.enter();
    this.segs = makeGuide([{ pts: LINE, t0: 0, t1: 1 }]);
    this.pos = guideAt(this.segs, 0);
    this.cheese();
  }
  resume() { super.resume(); this.cheese(); }
  // say cheese: the grin stays on for the whole treatment
  cheese() {
    const s = this.g.s;
    this.prevMouth = s.mouthBase;
    s.mouthBase = 'grin';
    this.g.react('normal', 0.01, 'grin');
    s.lookAt = { x: 0, y: 160 };
  }
  get pushes() { return true; }
  value() { return this.g.s.teeth; }
  begin() { this.startAt(this.g.s.teeth); this.g.react('normal', 99, 'grin'); }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s;
    s.teeth = this.push(p);
    this.pos = guideAt(this.segs, this.tOf(p));
    g.audio.level('hum', 0.22);
    this.acc += dt;
    if (this.acc > 0.08) {
      this.acc = 0;
      const w = g.head(this.pos.x + rand(-14, 14), 110 + rand(-6, 6));
      g.fx.spark(w.x, w.y, { size: rand(7, 12), col: s.teeth > 1.05 ? '#9fe2ff' : '#ffffff', vy: -50, life: 0.45 });
    }
    // past the star the smile is too bright to look at
    if (s.teeth > 1.12) g.react('squeeze', 0.15, 'grin');
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { const s = this.g.s; s.teeth = this.base; this.pos = guideAt(this.segs, 0); this.idle(); this.g.react('normal', 0.01, 'grin'); }
  idle() { this.g.audio.level('hum', 0); }
  releaseTarget(i, p, result) {
    const { g } = this;
    this.idle(); this.wasIn = false;
    const w = g.head(0, 110);
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      for (let k = 0; k < 5; k++) { const q = g.head(-32 + k * 16, 108); g.fx.spark(q.x, q.y, { delay: k * 0.05, size: rand(12, 18), vy: -60 }); }
      g.audio.shing();
      g.react('happy', 1.2, 'grin');
    } else if (result.verdict === 'late') {
      g.fx.text(w.x + 120, w.y - 30, 'BLING!', '#45c8ff', 28);
      g.audio.sparkle();
      g.react('squeeze', 1.1, 'grin');
    } else g.react('normal', 0.9, 'grin');
    return result;
  }
  finish(result) {
    super.finish(result);
    // the grin lasts a moment longer, then back to their usual face
    this.g.s.mouthBase = this.prevMouth;
    return result;
  }
  exit() {
    super.exit(); this.idle();
    if (this.prevMouth !== null && this.g.s.mouthBase === 'grin' && !this.done[0]) this.g.s.mouthBase = this.prevMouth;
  }
  draw(ctx, time) {
    if (this.alpha < 0.01 || !this.segs) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (a < 0.01) return;
    ctx.save();
    applyHead(ctx, s);
    if (this.guides) drawGuide(ctx, this.segs, this.guideOpts(time));
    if (this.cur < 0 && !this.outro && this.guides && (g.hint || this.nudge > 0.05)) drawTapHint(ctx, 0, 114, time, true, g.hint ? 1 : this.nudge, 0.9);
    const held = this.cur >= 0, q = this.pos;
    ctx.globalAlpha = a;
    const bob = held ? 0 : Math.sin(time * 4) * 4;
    const y = q.y + 26 + bob + (this.outro ? this.outroT * 260 : 0);
    ctx.translate(q.x, y);
    // blue light shining up on the teeth
    if (held) {
      const top = 112 - y;
      ctx.save();
      ctx.globalAlpha = a * (0.3 + 0.08 * Math.sin(time * 30));
      ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(14, -16); ctx.lineTo(30, top); ctx.lineTo(-30, top); ctx.closePath();
      ctx.fillStyle = '#7fd8ff'; ctx.fill();
      ctx.restore();
    }
    drawLamp(ctx, held, time);
    ctx.restore();
  }
}

// a little handheld whitening lamp, its glowing head at the top
function drawLamp(ctx, on, time) {
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.roundRect(-10, 0, 20, 60, 9); ctx.fillStyle = '#b9a6ff'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.roundRect(-5, 8, 4, 38, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-22, -18, 44, 20, 9); ctx.fillStyle = '#4d5470'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-16, -16, 32, 8, 4); ctx.fillStyle = on ? '#bff0ff' : '#5fc6f0'; ctx.fill();
  if (on) {
    ctx.globalAlpha *= 0.9;
    star4(ctx, 0, -14, 10 + Math.sin(time * 20) * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
}
