// I. Wash: no-fail. Rub the foamy sponge over the face (drag) to wash off grime, oil
// and blackheads; bubbles fly and clean skin sparkles. Done once most of the face is
// clean, then the last of the grime rinses away. With Space held the sponge zigzags
// over the face on its own.
import { Tool, drawHand } from './base.js';
import { Poly, rand, TAU } from '../draw.js';
import { INK, applyHead, onFace, eyeSide } from '../patient.js';

const REACH = 56; // cells this close to the sponge count as washed
const DONE = 0.9;

function rowHalf(y) {
  if (y < -30) return 150 * Math.sqrt(Math.max(0, 1 - ((y + 30) / 176) ** 2));
  if (y < 80) return 150;
  return 150 - (y - 80) * 0.95;
}

// a coarse grid over the face that tracks what has been washed
const CELLS = [];
for (let y = -196; y <= 196; y += 28) for (let x = -148; x <= 148; x += 28) if (onFace(x, y, -12)) CELLS.push({ x, y });

export class ScrubTool extends Tool {
  constructor(g, def) {
    super(g, def);
    const rows = [-182, -132, -82, -32, 18, 68, 118, 166];
    const pts = [];
    rows.forEach((y, i) => {
      const w = Math.max(30, rowHalf(y) - 26);
      if (i % 2) pts.push([w, y], [-w, y]); else pts.push([-w, y], [w, y]);
    });
    this.path = new Poly(pts);
    this.outroLen = 0.9;
    this.reset();
  }
  reset() {
    super.reset();
    this.acc = 0; this.sparkAcc = 0; this.fading = false; this.fly = 0; this.auto = 0;
    this.tip = null; this.moving = false; this.scrubbing = false;
    this.clean = new Array(CELLS.length).fill(false); this.nClean = 0;
    this.pos = { x: 116, y: -150 };
  }
  enter() { super.enter(); this.reset(); this.g.s.lookAt = { x: this.pos.x, y: this.pos.y }; }
  begin() { this.tip = null; this.scrubbing = true; }
  scrubAt(x, y) {
    this.g.dirt.erase(x + rand(-3, 3), y + rand(-3, 3), 64);
    for (let i = 0; i < CELLS.length; i++) {
      if (!this.clean[i] && Math.hypot(CELLS[i].x - x, CELLS[i].y - y) <= REACH) { this.clean[i] = true; this.nClean++; }
    }
  }
  brush(dt, pos) {
    const { g } = this;
    let to;
    if (!pos) {
      this.auto = Math.min(1, this.auto + dt / this.def.hold.time);
      const q = this.path.at(this.auto * this.path.len);
      to = { x: q.x, y: q.y };
    } else to = { x: pos.x, y: pos.y };
    const from = this.tip || to;
    const d = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(1, Math.ceil(d / 7));
    for (let k = 1; k <= n; k++) this.scrubAt(from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n);
    this.tip = to;
    this.moving = d > 0.6 || !pos;
    this.pos = { x: to.x + (this.moving ? Math.sin(g.time * 26) * 9 : 0), y: to.y + (this.moving ? Math.cos(g.time * 26) * 6 : 0) };
    g.s.lookAt = { x: to.x, y: to.y };
    if (this.moving) g.react('happy', 0.25, 'grin');
    if (pos) { const e = eyeSide(g.s, to.x, to.y); if (e >= 0) g.sting(e); } // soap in the eye
    const w = g.head(this.pos.x, this.pos.y);
    this.acc += dt;
    while (this.acc > 0.05) { this.acc -= 0.05; if (this.moving) g.fx.bubbles(w.x, w.y + 10, 1, 34); }
    this.sparkAcc += dt;
    if (this.moving && this.sparkAcc > 0.13) {
      this.sparkAcc = 0;
      const sw = g.head(from.x + rand(-30, 30), from.y + rand(-24, 24));
      g.fx.spark(sw.x, sw.y, { size: rand(9, 15), vy: -40 });
    }
    g.audio.level('scrub', this.moving ? 0.32 : 0.05);
    g.audio.grains.bubble = this.moving ? 14 : 0;
    this.scrubbing = true;
  }
  lift() { this.tip = null; this.idle(); }
  idle() {
    this.scrubbing = false; this.moving = false;
    this.g.audio.level('scrub', 0);
    this.g.audio.grains.bubble = 0;
  }
  coverage() { return Math.min(1, this.nClean / (CELLS.length * DONE)); }
  complete() { return this.nClean >= CELLS.length * DONE || this.auto >= 1; }
  finish(result) {
    super.finish(result);
    const { g } = this;
    this.fading = true; this.idle();
    g.audio.sparkle();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, w = g.head(Math.cos(a) * rand(40, 130), -20 + Math.sin(a) * rand(40, 160));
      g.fx.spark(w.x, w.y, { delay: i * 0.03, size: rand(12, 20), vy: -50 });
    }
    g.react('happy', 1.1, 'grin');
    return result;
  }
  update(dt) {
    super.update(dt);
    const s = this.g.s;
    if (this.fading && s.dirtAlpha > 0) s.dirtAlpha = Math.max(0, s.dirtAlpha - dt * 2.4);
    if (this.outro) this.fly += dt;
  }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    ctx.save();
    applyHead(ctx, s);
    // first time: a hand rubs back and forth over a cheek
    if (this.guides && g.hint && !this.tip) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      drawHand(ctx, Math.sin(time * 3.2) * 70, 40 + Math.cos(time * 6.4) * 10, 0.95);
      ctx.restore();
    }
    const bob = this.scrubbing ? 0 : Math.sin(time * 4) * 6;
    const x = this.pos.x + this.fly * 420, y = this.pos.y - 26 + bob - this.fly * 380;
    ctx.globalAlpha = this.alpha * Math.max(0, 1 - this.fly * 1.6);
    ctx.translate(x, y);
    ctx.rotate(-0.18 + (this.moving ? Math.sin(time * 26) * 0.12 : 0) + this.fly * 3);
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(0, 6, 44, 28, 0, 0, TAU); ctx.fillStyle = '#ffa8c8'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#f37aa7';
    for (const [hx, hy, r] of [[-24, 10, 5], [-6, 18, 4], [12, 8, 5], [26, 16, 3.5], [-28, 22, 3], [4, 0, 3]]) { ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill(); }
    // foam on top
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const [fx, fy, r] of [[-26, -16, 12], [-8, -22, 15], [12, -20, 13], [28, -12, 10], [2, -10, 12]]) { ctx.moveTo(fx + r, fy); ctx.arc(fx, fy, r, 0, TAU); }
    ctx.fill();
    ctx.lineWidth = 3.5; ctx.stroke();
    ctx.restore();
  }
}
