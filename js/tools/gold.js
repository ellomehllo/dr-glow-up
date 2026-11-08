// VI. Heal scars, one at a time: press on a scratch and hold. The gel tube floats over
// and runs mint gel along it toward the star at its end; let go when the gel reaches
// the star and the scar heals away in sparkles. Too early leaves part of it; too long
// and the gel spills over and drips.
import { Tool, drawTapHint } from './base.js';
import { rand, star5 } from '../draw.js';
import { INK, COL, CRACKS, headToStage, applyHead } from '../patient.js';

// one target per scar: its middle, and a radius that covers its length
const SCARS = CRACKS.map((c) => { const m = c.poly.at(c.poly.len / 2); return { x: m.x, y: m.y, r: c.poly.len / 2 + 16 }; });

export class GoldTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.9; this.reset(); }
  reset() { super.reset(); this.dripT = 0; this.glit = 0; this.pour = 0; this.healing = new Set(); this.tube = null; }
  targets() { return this.g.s.scars ? SCARS : []; }
  // anywhere close to the line of a scar counts
  hitTest(hx, hy, sx, sy, minR = 0) {
    let best = -1, bd = Infinity;
    CRACKS.forEach((c, i) => {
      if (this.done[i] || !this.g.s.scars) return;
      for (let k = 0; k <= 8; k++) {
        const q = c.poly.at((c.poly.len * k) / 8), d = Math.hypot(hx - q.x, hy - q.y);
        if (d <= Math.max(30, minR) && d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }
  enter() { super.enter(); this.g.s.lookAt = { x: 40, y: -200 }; this.tube = null; }
  // stage-space point at fraction f along scar i
  front(i, f) {
    const c = CRACKS[i], q = c.poly.at(c.poly.len * Math.min(1, f));
    return headToStage(this.g.s, q.x, q.y);
  }
  begin(i) { this.g.s.lookAt = { x: SCARS[i].x, y: SCARS[i].y }; this.dripT = 0.2; } // first drip right at overflow
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s, i = this.cur;
    s.scarF[i] = p;
    this.pour = Math.min(1, this.pour + dt * 6);
    g.audio.level('pour', 0.28);
    g.audio.grains.bloop = 7;
    this.glit += dt;
    if (this.glit > 0.07) {
      this.glit = 0;
      const w = this.front(i, p);
      g.fx.spark(w.x, w.y, { size: rand(6, 10), col: '#3fe0b5', life: 0.4 });
    }
    if (p > 1.02) {
      this.dripT += dt;
      if (this.dripT > 0.16 && s.drips.length < 12) {
        this.dripT = 0;
        const e = CRACKS[i].pts[CRACKS[i].pts.length - 1];
        s.drips.push({ x: e[0] + rand(-8, 8), y: e[1], len: 0, max: rand(22, 48), v: rand(50, 90), w: rand(4, 6) });
        if (Math.random() < 0.5) g.audio.drip();
      }
    }
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { if (this.cur >= 0) this.g.s.scarF[this.cur] = 0; this.pour = 0; this.idle(); }
  idle() { this.g.audio.level('pour', 0); this.g.audio.grains.bloop = 0; }
  releaseTarget(i, p, result) {
    const { g } = this;
    this.idle(); this.wasIn = false;
    this.healing.add(i);
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      const pts = [];
      for (let k = 0; k <= 6; k++) pts.push(this.front(i, k / 6));
      g.fx.along(pts, 6, { step: 0.035 });
      g.audio.shing();
      g.react('happy', 0.9, 'grin');
    } else if (result.verdict === 'late') g.react('normal', 0.9, 'wince');
    else g.react('normal', 0.8, 'flat');
    return result;
  }
  update(dt) {
    super.update(dt);
    const { g } = this, s = g.s;
    if (this.cur < 0) this.pour = Math.max(0, this.pour - dt * 5);
    for (const i of this.healing) {
      if (s.scarH[i] >= 1) continue;
      s.scarH[i] = Math.min(1, s.scarH[i] + dt * 1.8);
      if (Math.random() < 0.5) {
        const w = this.front(i, Math.random() * Math.min(1, s.scarF[i]));
        g.fx.spark(w.x, w.y, { size: rand(8, 14), vy: -50 });
      }
    }
    // the tube floats over the scar being treated (or the next one)
    const i = this.cur >= 0 ? this.cur : Math.max(0, this.nextIndex());
    const st = this.front(i, 0), goal = { x: st.x + 34 + 44, y: st.y - 60 - 47 };
    if (!this.tube) this.tube = { ...goal };
    const k = 1 - Math.exp(-dt * 9);
    this.tube.x += (goal.x - this.tube.x) * k; this.tube.y += (goal.y - this.tube.y) * k;
  }
  exit() { super.exit(); this.idle(); for (const i of this.healing) this.g.s.scarH[i] = 1; }
  draw(ctx, time) {
    if (this.alpha < 0.01 || !this.tube) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 1.8) : 1);
    if (a < 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    // a star at the end of every scar still to treat
    CRACKS.forEach((c, i) => {
      if (this.done[i]) return;
      const e = this.front(i, 1), held = i === this.cur;
      const zone = held && this.inZone(this.p), full = held && s.scarF[i] >= 0.995;
      const r = (zone || full ? 14 : 11) * (1 + 0.1 * Math.sin(time * 7 + e.x)) + this.nudge * 4 * Math.sin(time * 20);
      star5(ctx, e.x, e.y, r, -Math.PI / 2);
      ctx.fillStyle = full ? '#fff3b0' : COL.gold; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    });
    if (this.cur < 0 && !this.outro && (g.hint || this.nudge > 0.05)) {
      const i = this.nextIndex();
      if (i >= 0) {
        ctx.save(); applyHead(ctx, s);
        drawTapHint(ctx, SCARS[i].x, SCARS[i].y, time, true, g.hint ? 1 : this.nudge, 0.9);
        ctx.restore();
      }
    }
    // the tube and its gel stream, landing on the gel front of the held scar
    const bob = Math.sin(time * 3) * 4, px = this.tube.x, top = this.tube.y, squeeze = this.pour;
    const tipX = px - 44, tipY = top + 47 + bob;
    if (this.pour > 0.02 && this.cur >= 0) {
      const target = this.front(this.cur, Math.max(0.02, this.p));
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tipX, tipY);
      ctx.bezierCurveTo(tipX - 6, tipY + 26, target.x + Math.sin(time * 18) * 3, target.y - 34, target.x, target.y);
      ctx.globalAlpha = a * this.pour;
      ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = COL.gel; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = COL.gelHi; ctx.stroke();
      ctx.globalAlpha = a;
    }
    ctx.translate(px, top + bob);
    ctx.rotate(0.75);
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
    // tube body (squashed while squeezing), crimped end, cap and nozzle
    const pinch = 1 - 0.25 * squeeze;
    ctx.beginPath();
    ctx.moveTo(-26, -70); ctx.lineTo(26, -70);
    ctx.quadraticCurveTo(30 * pinch, -10, 20, 34); ctx.lineTo(-20, 34); ctx.quadraticCurveTo(-30 * pinch, -10, -26, -70);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-24, -40, 48, 40, 8); ctx.fillStyle = '#c6f2dc'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -28); ctx.lineTo(6, -28); ctx.moveTo(0, -34); ctx.lineTo(0, -22); ctx.lineWidth = 4; ctx.strokeStyle = '#2fc79f'; ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.roundRect(-30, -80, 60, 12, 4); ctx.fillStyle = '#e3dcec'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-14, 34, 28, 16, 4); ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 50); ctx.lineTo(-3, 64); ctx.lineTo(3, 64); ctx.lineTo(6, 50); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
