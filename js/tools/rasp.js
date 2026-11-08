// V. Paint hair and brows: a paintbrush dipped in the patient's hair colour. Brush over
// the thin scalp and tufts of hair sprout wherever it passes; brush along each brow to
// thicken it. Stay on the lines: strokes over the face leave stray hairs, and brushing
// between the brows grows a unibrow. Fewer slips, higher score. With Space held the
// brush paints the hairline and brows on its own.
import { Tool, drawHand } from './base.js';
import { rand, clamp01, Poly } from '../draw.js';
import { INK, applyHead, CURLS, CAP_PATH, onFace } from '../patient.js';
import { makeGuide, guideAt } from '../guide.js';

const REACH = 46; // a tuft sprouts when the brush passes this close to its edge
const BROW_REACH = 24;
const BROW_N = 9;
const BROW_L = [[-98, -34], [-80, -40], [-60, -41], [-40, -36], [-28, -30]];
const BROW_R = BROW_L.map(([x, y]) => [-x, y]); // outer to inner, like the left one
const sample = (pts) => { const P = new Poly(pts); return Array.from({ length: BROW_N }, (_, i) => P.at((P.len * i) / (BROW_N - 1))); };
const BROWS = [sample(BROW_L), sample(BROW_R)];
const UNI = { x0: -22, x1: 22, y0: -48, y1: -8 }; // between the brows
const hairline = (x) => -124 + 84 * Math.min(1, (x / 158) ** 2);
const onScalp = (x, y) => y < hairline(x) + 10 && onFace(x, y, 26);
// Space autopilot: along the crown, then each brow
const HAIR_END = 0.45, AUTO_END = 0.9;

export class RaspTool extends Tool {
  constructor(g, def) {
    super(g, def);
    const arc = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * (1.06 + 0.88 * (i / 24));
      arc.push([Math.cos(a) * 150, -36 + Math.sin(a) * 168]);
    }
    this.guide = makeGuide([
      { pts: arc, t0: 0, t1: HAIR_END },
      { pts: BROW_L, t0: 0.5, t1: 0.68 },
      { pts: BROW_R, t0: 0.72, t1: AUTO_END },
    ]);
    this.outroLen = 0.85;
    this.reset();
  }
  reset() {
    super.reset();
    this.tip = null; this.trail = []; this.auto = 0; this.spill = 0; this.moving = false; this.wag = 0;
    this.browHit = [new Array(BROW_N).fill(false), new Array(BROW_N).fill(false)];
    this.browDone = [false, false];
    this.grown = 0;
  }
  enter() { super.enter(); this.reset(); this.grown = this.g.s.curls.filter((t) => t >= 0).length; }
  sprout(i) {
    const { g } = this, s = g.s, c = CURLS[i], w = g.head(c.x, c.y);
    s.curls[i] = 0;
    this.grown++;
    s.hair = Math.max(s.hair, this.grown / CURLS.length);
    g.fx.spark(w.x, w.y, { size: rand(12, 18), vy: -60 });
    g.fx.glitter(w.x, w.y, 3, 160);
    g.audio.boing(0.9 + (c.x + 172) / 344 * 0.6);
  }
  // paint one small step of a stroke at head-space (x, y)
  paintAt(x, y, step) {
    const { g } = this, s = g.s;
    let safe = onScalp(x, y);
    for (let i = 0; i < CURLS.length; i++) {
      const c = CURLS[i], d = Math.hypot(c.x - x, c.y - y);
      if (s.curls[i] < 0 && d <= REACH + c.r * 0.5) this.sprout(i);
      if (d <= REACH + c.r) safe = true;
    }
    for (let b = 0; b < 2; b++) {
      const B = BROWS[b], hit = this.browHit[b];
      for (let k = 0; k < BROW_N; k++) {
        const d = Math.hypot(B[k].x - x, B[k].y - y);
        if (d <= BROW_REACH) hit[k] = true;
        if (d <= BROW_REACH + 14) safe = true;
      }
      const f = hit.filter(Boolean).length / BROW_N;
      const key = b ? 'browR' : 'browL';
      if (!this.browDone[b] && f >= 0.8) {
        this.browDone[b] = true;
        const m = g.head(B[4].x, B[4].y);
        g.fx.burst(m.x, m.y, 5, 160, { size: rand(8, 12) });
        g.audio.tink(1.2);
      }
      s[key] = Math.max(s[key], this.browDone[b] ? 1 : f / 0.8);
    }
    // between the brows a unibrow grows instead
    if (x > UNI.x0 && x < UNI.x1 && y > UNI.y0 && y < UNI.y1) {
      const was = s.uni;
      s.uni = Math.min(1, s.uni + step / 85); // one swipe across costs ~20 points, two ~40
      if (was < 0.05 && s.uni >= 0.05) { g.audio.boing(0.6); g.react('wide', 0.8, 'o'); }
      return;
    }
    // anywhere else on the face: stray hairs
    if (!safe && onFace(x, y)) {
      this.spill += step;
      if (this.spill >= 34 && s.strays.length < 14) {
        this.spill = 0;
        s.strays.push({ x, y, rot: rand(-0.7, 0.7), t: 0 });
        const w = g.head(x, y);
        g.fx.puff(w.x, w.y, 1, '255,190,200');
        g.audio.boing(0.55);
        g.react('wide', 0.5, 'o');
        g.fail = Math.max(g.fail, 0.6);
      }
    }
  }
  begin() { this.tip = null; }
  brush(dt, pos) {
    const { g } = this, s = g.s;
    let to, lifted = false;
    if (!pos) {
      // Space: the brush follows the crown, then each brow, on its own (lifted
      // while it hops from one to the next)
      this.auto = Math.min(AUTO_END, this.auto + dt / this.def.hold.time);
      const q = guideAt(this.guide, this.auto);
      to = { x: q.x, y: q.y }; lifted = !!q.hop;
      const h = clamp01(this.auto / HAIR_END);
      CURLS.forEach((c, i) => { if (s.curls[i] < 0 && h >= c.u * 0.94 + 0.03) this.sprout(i); });
    } else to = { x: pos.x, y: pos.y };
    const from = this.tip || to;
    const d = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(1, Math.ceil(d / 8));
    if (!lifted) for (let k = 1; k <= n; k++) this.paintAt(from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n, d / n);
    this.moving = d > 0.6;
    this.wag += ((to.x - from.x) * 0.012 - this.wag) * Math.min(1, dt * 12);
    this.tip = to;
    this.trail.push({ x: to.x, y: to.y, t: g.time });
    s.lookAt = { x: to.x * 0.5, y: Math.min(-60, to.y) };
    g.audio.level('rasp', this.moving ? 0.2 : 0.04);
  }
  lift() { this.tip = null; this.moving = false; this.g.audio.level('rasp', 0); }
  idle() { this.g.audio.level('rasp', 0); }
  coverage() {
    const hair = Math.min(1, this.grown / (CURLS.length - 2));
    const brow = (b) => (this.browDone[b] ? 1 : this.browHit[b].filter(Boolean).length / (BROW_N * 0.8));
    return 0.6 * hair + 0.2 * Math.min(1, brow(0)) + 0.2 * Math.min(1, brow(1));
  }
  complete() {
    return (this.grown >= CURLS.length - 2 && this.browDone[0] && this.browDone[1]) || this.auto >= AUTO_END;
  }
  result() {
    const s = this.g.s;
    const score = Math.max(0, Math.min(100, Math.round(100 - 9 * s.strays.length - 40 * s.uni)));
    return { score, verdict: score >= 95 ? 'perfect' : score >= 70 ? 'good' : 'messy' };
  }
  finish(result) {
    super.finish(result);
    const { g } = this, s = g.s;
    // the last stragglers fill in, the brows settle
    CURLS.forEach((c, i) => { if (s.curls[i] < 0) this.sprout(i); });
    s.hair = 1; s.browL = 1; s.browR = 1;
    g.audio.level('rasp', 0);
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      for (const side of [-1, 1]) {
        const w = g.head(side * 86, 10);
        g.fx.spark(w.x, w.y, { size: 24, life: 0.9 });
        g.fx.burst(w.x, w.y, 5, 160, { size: rand(8, 12) });
      }
      g.audio.shing();
      g.react('normal', 1.4, 'smirk');
    } else { g.react('wide', 1.2, 'o'); g.audio.boing(0.6); }
    return result;
  }
  exit() { super.exit(); this.g.audio.level('rasp', 0); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (a < 0.01) return;
    ctx.save();
    applyHead(ctx, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // where to paint: the scalp and the two brows, dotted until they are done
    if (!this.outro) {
      ctx.globalAlpha = a * 0.75;
      ctx.setLineDash([0.1, 13]); ctx.lineDashOffset = -time * 16;
      ctx.lineWidth = 6.5; ctx.strokeStyle = '#ffffff';
      if (this.grown < CURLS.length - 2) ctx.stroke(CAP_PATH);
      for (let b = 0; b < 2; b++) {
        if (this.browDone[b]) continue;
        ctx.beginPath(); BROWS[b].forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.lineWidth = 9; ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // wet paint: the last moments of the stroke, fading
    const now = g.time;
    this.trail = this.trail.filter((q) => now - q.t < 0.32);
    if (this.trail.length > 1) {
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = s.who.hair; ctx.lineWidth = 20;
      ctx.beginPath();
      this.trail.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    // first time: a hand shows the stroke along the hairline
    if (g.hint && !this.tip) {
      const k = (time * 0.32) % 1, q = guideAt(this.guide, 0.04 + k * (HAIR_END - 0.08));
      ctx.globalAlpha = a * Math.min(1, Math.sin(k * Math.PI) * 2.5);
      drawHand(ctx, q.x + 4, q.y + 8, 0.9);
    }
    // the brush: resting beside the head, or tip on the finger
    const rest = { x: 128, y: -236 + Math.sin(time * 3) * 6 };
    const at = this.tip || rest;
    ctx.globalAlpha = a;
    ctx.translate(at.x, at.y + (this.outro ? -this.outroT * 300 : 0));
    ctx.rotate(0.55 + (this.tip ? this.wag + Math.sin(time * 18) * (this.moving ? 0.06 : 0) : 0));
    drawBrush(ctx, s.who.hair, s.who.hairHi);
    ctx.restore();
  }
}

// a paintbrush with its tip at the origin and the handle going up
function drawBrush(ctx, paint, hi) {
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.roundRect(-8, -150, 16, 102, 8); ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.roundRect(-4, -142, 4, 70, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-13, -54, 26, 20, 4); ctx.fillStyle = '#e3dcec'; ctx.fill(); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, -44); ctx.lineTo(12, -44); ctx.stroke();
  ctx.lineWidth = 5;
  const tuft = new Path2D('M 0 3 C -11 -5 -16 -20 -13 -35 L 13 -35 C 16 -20 11 -5 0 3 Z');
  ctx.fillStyle = paint; ctx.fill(tuft); ctx.stroke(tuft);
  ctx.strokeStyle = hi; ctx.lineWidth = 2.5; ctx.globalAlpha *= 0.8;
  ctx.beginPath(); ctx.moveTo(-5, -30); ctx.quadraticCurveTo(-7, -16, -2, -6); ctx.stroke();
}
