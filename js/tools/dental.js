// The teeth tools. With any of them out the patient opens wide ('aah') and the camera
// comes in close on the mouth.
//   XIV.  Brush teeth: no-fail. Scrub the toothbrush over the teeth (drag) to brush off
//         the plaque and the bits of food; foam flies. With Space held it brushes on its
//         own along both rows.
//   XV.   Fill cavities: press on a cavity and hold; the drill whirs and the hole fills
//         with silver. Let go on the star. Too early and a bit of the hole is left; too
//         late and it drills into a nerve: ouch.
//   XVI.  Pull a bad tooth: press on the rotten tooth and hold; the pliers rock it looser
//         and looser. Let go on the star and it pops out, and a shiny new tooth grows in.
//         Too early and it won't budge; too late and it comes out with a yelp.
import { Tool, drawHand, drawTapHint } from './base.js';
import { Poly, TAU, rand, ell } from '../draw.js';
import { INK, applyHead } from '../patient.js';
import { TEETH, toothAt, inMouth, grime } from '../extras.js';

const SILVER = '#e3e8f4';

// open wide while out; back to their own mouth when put away
class MouthTool extends Tool {
  open() {
    const s = this.g.s;
    if (s.mouthBase !== 'aah') { this.prevMouth = s.mouthBase; s.mouthBase = 'aah'; }
    this.g.react('normal', 0.01, 'aah');
    s.lookAt = { x: 0, y: 220 };
  }
  enter() { super.enter(); this.open(); }
  resume() { super.resume(); this.open(); }
  exit() {
    super.exit();
    const s = this.g.s;
    if (s.mouthBase === 'aah') { s.mouthBase = this.prevMouth ?? null; this.g.react('normal', 0.01, s.mouthBase); }
  }
}

// ---------- brush ----------
const REACH = 13;
// Space: along the top row and back, then the bottom row and back
const ROUTE = new Poly([[-38, 108], [38, 110], [38, 120], [-38, 120], [-30, 150], [30, 150], [30, 158], [-30, 158]]);

export class BrushTeethTool extends MouthTool {
  constructor(g, def) { super(g, def); this.outroLen = 0.9; this.reset(); }
  reset() { super.reset(); this.tip = null; this.moving = false; this.auto = 0; this.acc = 0; this.fly = 0; this.total = 1; this.pos = { x: 30, y: 136 }; }
  enter() { super.enter(); this.reset(); this.total = Math.max(0.01, grime(this.g.s)); }
  brushAt(x, y, d) {
    const s = this.g.s;
    for (let i = 0; i < TEETH.length; i++) {
      const t = TEETH[i], q = s.dent[i];
      if (q.gone) continue;
      if (Math.abs(x - t.x) > t.w / 2 + REACH * 0.6 || y < t.y - REACH || y > t.y + t.h + REACH) continue;
      if (q.plaque > 0) q.plaque = Math.max(0, q.plaque - d * 0.02);
      if (q.food) {
        q.foodRub = (q.foodRub || 0) + d * 0.025;
        if (q.foodRub >= 1) {
          q.food = null;
          const w = this.g.head(t.x, t.y + t.h / 2);
          this.g.fx.spark(w.x, w.y, { size: rand(10, 14), vy: -50 });
          this.g.audio.tick();
        }
      }
    }
  }
  brush(dt, pos) {
    const { g } = this;
    let to;
    if (!pos) {
      this.auto = Math.min(1, this.auto + dt / this.def.hold.time);
      const q = ROUTE.at(this.auto * ROUTE.len);
      to = { x: q.x + Math.sin(g.time * 30) * 6, y: q.y };
    } else to = { x: pos.x, y: pos.y };
    const from = this.tip || to;
    const d = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(1, Math.ceil(d / 4));
    for (let k = 1; k <= n; k++) this.brushAt(from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n, d / n + (pos ? 0 : 1.2));
    this.tip = to;
    this.moving = d > 0.6 || !pos;
    this.pos = { x: to.x + (this.moving ? Math.sin(g.time * 28) * 4 : 0), y: to.y };
    g.react('normal', 0.25, 'aah');
    this.acc += dt;
    while (this.acc > 0.16) {
      this.acc -= 0.16;
      if (this.moving && inMouth(to.x, to.y)) { const w = g.head(this.pos.x, this.pos.y - 10); g.fx.bubbles(w.x, w.y, 1, 14); }
    }
    g.audio.level('scrub', this.moving ? 0.26 : 0.04);
    g.audio.grains.bubble = this.moving ? 10 : 0;
  }
  lift() { this.tip = null; this.idle(); }
  idle() { this.moving = false; this.g.audio.level('scrub', 0); this.g.audio.grains.bubble = 0; }
  coverage() { return Math.min(1, (1 - grime(this.g.s) / this.total) / 0.94); }
  complete() { return grime(this.g.s) <= this.total * 0.06 || this.auto >= 1; }
  finish(result) {
    super.finish(result);
    const { g } = this, s = g.s;
    this.idle();
    for (const q of s.dent) { q.plaque = 0; q.food = null; }
    for (let k = 0; k < 6; k++) { const w = g.head(-30 + k * 12, 112 + (k % 2) * 40); g.fx.spark(w.x, w.y, { delay: k * 0.05, size: rand(10, 16), vy: -60 }); }
    g.audio.shing(); g.audio.sparkle();
    g.react('happy', 0.9, 'aah');
    return result;
  }
  update(dt) { super.update(dt); if (this.outro) this.fly += dt; }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    ctx.save();
    applyHead(ctx, s);
    if (g.hint && !this.tip) { // first time: a hand scrubs back and forth over the teeth
      ctx.save(); ctx.globalAlpha = this.alpha;
      drawHand(ctx, Math.sin(time * 4) * 30, 120 + Math.cos(time * 8) * 4, 0.6);
      ctx.restore();
    }
    const bob = this.moving ? 0 : Math.sin(time * 4) * 3;
    ctx.globalAlpha = this.alpha * Math.max(0, 1 - this.fly * 1.6);
    ctx.translate(this.pos.x + this.fly * 260, this.pos.y + bob + this.fly * 200);
    drawToothbrush(ctx);
    ctx.restore();
  }
}

// a toothbrush, its bristles centred on the origin, the handle down to the right
function drawToothbrush(ctx) {
  ctx.save();
  ctx.rotate(-0.25);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(8, 6); ctx.quadraticCurveTo(40, 12, 96, 40); ctx.lineWidth = 16; ctx.stroke();
  ctx.lineWidth = 10; ctx.strokeStyle = '#45c8ff'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(24, 6); ctx.quadraticCurveTo(46, 10, 80, 27); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-16, 0, 34, 10, 5); ctx.fillStyle = '#45c8ff'; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
  // bristles, two colours, with a dab of foam
  for (let k = 0; k < 5; k++) {
    ctx.beginPath(); ctx.roundRect(-14 + k * 6.4, -10, 5, 11, 2);
    ctx.fillStyle = k % 2 ? '#ffffff' : '#ff9fc4'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); for (const [x, y, r] of [[-6, -12, 5], [4, -14, 6], [12, -11, 4]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
  ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// ---------- drill ----------
export class DrillTool extends MouthTool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() { super.reset(); this.list = null; this.acc = 0; this.k = 0; }
  // the cavities this patient came in with (tooth indices), fixed once out
  teeth() { if (!this.list) this.list = this.g.s.dent.map((d, i) => (d.cav === 1 ? i : -1)).filter((i) => i >= 0); return this.list; }
  targets() { return this.teeth().map((i) => ({ ...toothAt(i), r: 8 })); }
  hitR() { return 13; }
  enter() { super.enter(); this.reset(); }
  begin() { this.k = 0; this.g.react('squeeze', 99, 'aah'); }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s, i = this.teeth()[this.cur], d = s.dent[i], sw = this.sw;
    this.k = p / sw.c;
    d.fill = Math.min(1, this.k);
    g.audio.level('hum', 0.2 + 0.1 * Math.min(1, this.k));
    this.acc += dt;
    if (this.acc > 0.06) {
      this.acc = 0;
      const q = toothAt(i), w = g.head(q.x + rand(-4, 4), q.y + rand(-4, 4));
      g.fx.spark(w.x, w.y, { size: rand(5, 9), col: '#ffffff', vy: -40, life: 0.35 });
    }
    // past the star it hits a nerve
    if (p > sw.c + sw.w) { g.react('squeeze', 0.2, 'aah'); s.sweat = Math.max(s.sweat, 0.7); g.shake(0.01); }
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { const i = this.teeth()[this.cur]; if (i !== undefined) this.g.s.dent[i].fill = 0; this.idle(); }
  idle() { this.g.audio.level('hum', 0); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s, d = s.dent[this.teeth()[i]], q = toothAt(this.teeth()[i]), w = g.head(q.x, q.y);
    this.idle(); this.wasIn = false; this.k = 0;
    d.cav = 2;
    if (result.verdict === 'early') { d.fill = Math.min(d.fill, 0.6); g.react('normal', 0.6, 'aah'); g.audio.boing(0.8); return result; }
    d.fill = 1;
    if (result.verdict === 'late') {
      g.fx.text(w.x + 40, w.y - 50, 'OUCH!', '#ff7d9a', 26);
      g.react('squeeze', 1, 'aah'); s.pain += 0.5; s.flush = 1;
      g.audio.nick();
    } else {
      g.fx.ring(w.x, w.y, 3, 22, 0.3, '#ffffff', 4);
      if (result.verdict === 'perfect') { g.fx.burst(w.x, w.y, 5, 180, { size: rand(8, 12) }); g.audio.sparkle(); }
      g.audio.shing();
      g.react('normal', 0.5, 'aah');
    }
    return result;
  }
  finish(result) {
    super.finish(result);
    if (result.verdict === 'perfect' || result.verdict === 'good') this.g.react('happy', 0.9, 'aah');
    return result;
  }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s, T = this.targets();
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (!this.outro) {
      for (let k = 0; k < T.length; k++) {
        if (this.done[k] || k === this.cur) continue;
        ringAt(ctx, T[k].x, T[k].y, 10 + Math.sin(time * 4 + k) * 1.5 + this.nudge * 6 * Math.sin(time * 20), time);
      }
    }
    let at = null;
    if (this.cur >= 0) at = T[this.cur];
    else { const k = this.nextIndex(); if (k >= 0) at = { x: T[k].x + 6, y: T[k].y + 10 + Math.sin(time * 4) * 3 }; }
    if (at && !this.outro) drawDrill(ctx, at.x, at.y, this.cur >= 0, time);
    if (this.cur < 0 && !this.outro && (g.hint || this.nudge > 0.05)) {
      const k = this.nextIndex();
      if (k >= 0) drawTapHint(ctx, T[k].x, T[k].y, time, true, this.alpha * (g.hint ? 1 : this.nudge), 0.55);
    }
    ctx.restore();
  }
}

function ringAt(ctx, x, y, R, time) {
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU);
  ctx.lineWidth = 3.6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([4, 4]); ctx.lineDashOffset = -time * 20; ctx.stroke(); ctx.setLineDash([]);
}

// a dentist's drill: the bur's tip at (x, y), the handpiece out of the mouth to the lower right
function drawDrill(ctx, x, y, on, time) {
  ctx.save();
  ctx.translate(x + (on ? Math.sin(time * 70) * 0.8 : 0), y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  // the bur
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, -12); ctx.stroke();
  ctx.lineWidth = 2.4; ctx.strokeStyle = SILVER; ctx.stroke();
  if (on) { // spinning
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 2; k++) { const a = time * 60 + k * Math.PI; ctx.beginPath(); ctx.ellipse(2, -6, 5, 2, -1.2, a, a + 1.6); ctx.stroke(); }
  }
  // the head, the neck and the handle
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.roundRect(-3, -22, 16, 11, 4); ctx.fillStyle = SILVER; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(34, 8); ctx.lineTo(72, 60); ctx.lineWidth = 15; ctx.stroke();
  ctx.lineWidth = 9.5; ctx.strokeStyle = '#b9a6ff'; ctx.stroke();
  ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(18, -12); ctx.lineTo(34, 5); ctx.lineTo(62, 42); ctx.stroke();
  ctx.beginPath(); ctx.arc(32, 6, 4, 0, TAU); ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
}

// ---------- pliers ----------
export class PliersTool extends MouthTool {
  constructor(g, def) { super(g, def); this.outroLen = 0.9; this.reset(); }
  reset() { super.reset(); this.list = null; this.k = 0; this.fly = []; }
  teeth() { if (!this.list) this.list = this.g.s.dent.map((d, i) => (d.rot ? i : -1)).filter((i) => i >= 0); return this.list; }
  targets() { return this.teeth().map((i) => ({ ...toothAt(i), r: 9 })); }
  fixed(i) { return this.g.s.dent[this.teeth()[i]].gone; }
  hitR() { return 14; }
  enter() { super.enter(); this.reset(); }
  begin() { this.k = 0; this.g.react('squeeze', 99, 'aah'); }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, d = g.s.dent[this.teeth()[this.cur]];
    this.k = p / this.sw.c;
    d.out = this.k;
    g.audio.tension(this.k);
    if (this.k > 0.6) g.shake(0.006 * this.k);
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { const i = this.teeth()[this.cur]; if (i !== undefined) this.g.s.dent[i].out = 0; this.k = 0; this.g.audio.tension(-1); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s, ti = this.teeth()[i], d = s.dent[ti], q = toothAt(ti), w = g.head(q.x, q.y);
    g.audio.tension(-1);
    this.k = 0; this.wasIn = false;
    if (result.verdict === 'early') { // won't budge: it stays, rotten as ever
      d.out = 0;
      g.react('normal', 0.6, 'aah'); g.audio.boing(0.7);
      g.fx.text(w.x, w.y - 50, 'STUCK!', '#ffffff', 24);
      return result;
    }
    // out it comes, spinning away; a new tooth grows in its place (patient.js ticks it)
    d.gone = true; d.out = 0; d.grow = -0.45;
    this.fly.push({ x: q.x, y: q.y, vx: rand(-120, 120), vy: 260, rot: 0, vr: rand(-12, 12), life: 0 });
    if (result.verdict === 'late') {
      g.fx.text(w.x + 40, w.y - 50, 'YOWCH!', '#ff7d9a', 26);
      g.react('squeeze', 1.1, 'aah'); s.pain += 0.6; s.flush = 1; s.sweat = 1;
      g.audio.nick();
    } else {
      g.fx.ring(w.x, w.y, 3, 30, 0.35, '#ffffff', 5);
      g.fx.burst(w.x, w.y, 6, 240, { size: rand(9, 14) });
      g.audio.pop(0.8);
      g.react('normal', 0.6, 'aah');
      g.audio.sparkle();
    }
    g.bump(0.35);
    return result;
  }
  finish(result) {
    super.finish(result);
    if (result.verdict === 'perfect' || result.verdict === 'good') { this.g.react('happy', 1, 'aah'); this.g.audio.sparkle(); }
    return result;
  }
  update(dt) {
    super.update(dt);
    for (const f of this.fly) { f.life += dt; f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
    this.fly = this.fly.filter((f) => f.life < 1);
  }
  exit() { super.exit(); this.g.audio.tension(-1); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s, T = this.targets();
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = this.alpha;
    for (const f of this.fly) { // the old tooth, tumbling away
      ctx.save(); ctx.globalAlpha = this.alpha * Math.max(0, 1 - f.life);
      ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      const p = new Path2D(); p.roundRect(-6, -9, 12, 22, [2, 2, 5, 5]);
      ctx.fillStyle = '#9c7a3e'; ctx.fill(p); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(p);
      ctx.fillStyle = '#5f4520'; ell(ctx, -1, 2, 3, 2.6); ctx.fill();
      ctx.restore();
    }
    if (!this.outro) {
      for (let k = 0; k < T.length; k++) {
        if (this.done[k] || k === this.cur) continue;
        ringAt(ctx, T[k].x, T[k].y, 12 + Math.sin(time * 4 + k) * 1.5 + this.nudge * 6 * Math.sin(time * 20), time);
      }
      let at = null, held = this.cur >= 0;
      if (held) { const d = s.dent[this.teeth()[this.cur]]; at = { x: T[this.cur].x + Math.sin(time * 38 + d.wob) * 2.2 * Math.min(1.2, d.out), y: T[this.cur].y + Math.min(1.3, d.out) * 7 }; }
      else { const k = this.nextIndex(); if (k >= 0) at = { x: T[k].x, y: T[k].y + 14 + Math.sin(time * 4) * 3 }; }
      if (at) drawPliers(ctx, at.x, at.y, held);
      if (!held && (g.hint || this.nudge > 0.05)) {
        const k = this.nextIndex();
        if (k >= 0) drawTapHint(ctx, T[k].x, T[k].y, time, true, this.alpha * (g.hint ? 1 : this.nudge), 0.55);
      }
    }
    ctx.restore();
  }
}

// dental pliers: the beaks round (x, y), the handles down out of the mouth; held: closed
function drawPliers(ctx, x, y, held) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const open = held ? 0 : 4;
  for (const side of [-1, 1]) {
    // a beak curling round the tooth, then a handle bowing out and down
    const p = new Path2D(`M ${side * (7 + open)} -6 Q ${side * (10 + open)} 6 ${side * 4} 16 L ${side * (8 + open * 2)} 60 Q ${side * (16 + open * 3)} 90 ${side * (12 + open * 3)} 110`);
    ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke(p);
    ctx.lineWidth = 5; ctx.strokeStyle = SILVER; ctx.stroke(p);
  }
  // the hinge, and grips on the handles
  ell(ctx, 0, 18, 6, 6); ctx.fillStyle = SILVER; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * (11 + open * 2.5), 74); ctx.quadraticCurveTo(side * (17 + open * 3), 92, side * (13 + open * 3), 108);
    ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6.5; ctx.strokeStyle = '#ff6fae'; ctx.stroke();
  }
  ctx.restore();
}
