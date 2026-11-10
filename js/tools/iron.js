// XI. Iron wrinkles, one at a time: press on a wrinkle and hold. A tiny steam iron
// glides along it and the skin behind it comes out smooth; let go when it reaches the
// star at the end. Too early leaves part of the line; too long and the iron sits there
// steaming and leaves a pink mark. Hot!
import { Tool, drawTapHint } from './base.js';
import { rand, star5 } from '../draw.js';
import { INK, COL, applyHead } from '../patient.js';
import { onSkin, dab, mark } from './free.js';

export class IronTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() { super.reset(); this.acc = 0; this.at = null; this.ang = 0; }
  targets() {
    return this.g.s.wrk.map((w) => { const m = w.poly.at(w.poly.len / 2); return { x: m.x, y: m.y, r: w.poly.len / 2 + 14 }; });
  }
  // anywhere close to the line of a wrinkle counts
  hitTest(hx, hy, sx, sy, minR = 0) {
    let best = -1, bd = Infinity;
    this.g.s.wrk.forEach((w, i) => {
      if (this.done[i]) return;
      for (let k = 0; k <= 8; k++) {
        const q = w.poly.at((w.poly.len * k) / 8), d = Math.hypot(hx - q.x, hy - q.y);
        if (d <= Math.max(30, minR) && d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }
  // head-space point (with direction) at fraction f along wrinkle i
  front(i, f) { const w = this.g.s.wrk[i]; return w.poly.at(w.poly.len * Math.min(1, Math.max(0, f))); }
  fixed(i) { return this.g.s.wrk[i].f >= 1; }
  // a hot iron on bare skin burns it (a puff of steam, a red mark that fades)
  freeSpot(q) { if (!this.free || !onSkin(this.g, q)) return false; dab(this.g, q, '#ffffff', true); mark(this.g, q, 'burn', 'SSS!'); return true; }
  enter() { super.enter(); this.reset(); const i = this.nextIndex(); if (i >= 0) this.g.s.lookAt = this.front(i, 0.5); }
  begin(i) { this.g.react('normal', 99, 'flat'); this.g.s.lookAt = this.front(i, 0.5); }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s, i = this.cur, w = s.wrk[i], sw = this.sw, max = this.def.hold.max;
    w.f = p;
    w.red = p > sw.c + sw.w ? Math.min(1, (p - sw.c - sw.w) / (max - sw.c - sw.w)) : 0;
    g.audio.toolLoop('iron', 1);
    this.acc += dt;
    if (this.acc > (w.red > 0 ? 0.05 : 0.11)) {
      this.acc = 0;
      const q = this.front(i, p), st = g.head(q.x, q.y - 20);
      g.fx.puff(st.x, st.y, 1, w.red > 0 ? '255,190,200' : '255,255,255');
      if (w.red <= 0 && Math.random() < 0.6) g.fx.spark(st.x + rand(-10, 10), st.y + 14, { size: rand(7, 11), vy: -40, life: 0.45 });
    }
    if (w.red > 0.25) g.react('squeeze', 0.15, 'wince');
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
  }
  cancel() { const s = this.g.s; if (this.cur >= 0) { s.wrk[this.cur].f = 0; s.wrk[this.cur].red = 0; } this.idle(); this.g.react('normal', 0.01); }
  idle() { this.g.audio.toolLoop('iron', 0); }
  releaseTarget(i, p, result) {
    const { g } = this, w = this.g.s.wrk[i];
    this.idle(); this.wasIn = false;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      w.f = 1.25; // the last of it smooths out
      const pts = [];
      for (let k = 0; k <= 5; k++) { const q = this.front(i, k / 5); pts.push(g.head(q.x, q.y)); }
      g.fx.along(pts, 5, { step: 0.035 });
      g.audio.toolDone('iron');
      g.react('happy', 0.9, 'grin');
    } else if (result.verdict === 'late') {
      const e = this.front(i, 1), q = g.head(e.x, e.y);
      g.fx.puff(q.x, q.y, 4, '255,170,190');
      g.fx.text(q.x + 70, q.y - 40, 'HOT!', '#ff7d9a', 26);
      g.audio.nick();
      g.react('wide', 0.9, 'o');
    } else g.react('normal', 0.8, 'flat');
    return result;
  }
  update(dt) {
    super.update(dt);
    const s = this.g.s;
    if (!s.wrk.length) return;
    // the iron rides the held wrinkle, or hovers over the start of the next one
    const i = this.cur >= 0 ? this.cur : Math.max(0, this.nextIndex());
    const q = this.front(i, this.cur >= 0 ? this.p : 0);
    const goal = { x: q.x, y: q.y - (this.cur >= 0 ? 0 : 26) };
    if (!this.at) this.at = { ...goal };
    const k = this.cur >= 0 ? 1 : 1 - Math.exp(-dt * 10);
    this.at.x += (goal.x - this.at.x) * k; this.at.y += (goal.y - this.at.y) * k;
    let ga = Math.atan2(q.ty, q.tx);
    if (Math.cos(ga) < 0) ga += Math.PI; // keep it the right way up
    this.ang += (ga - this.ang) * (1 - Math.exp(-dt * 12));
  }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    const { g } = this, s = g.s;
    if (this.alpha < 0.01 || !this.at || !s.wrk.length) return;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (a < 0.01) return;
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = a;
    // a star at the end of every wrinkle still to iron
    s.wrk.forEach((w, i) => {
      if (this.done[i] || !this.guides) return;
      const e = this.front(i, 1), held = i === this.cur, zone = held && this.inZone(this.p);
      const r = (zone ? 13 : 10) * (1 + 0.1 * Math.sin(time * 7 + i)) + this.nudge * 4 * Math.sin(time * 20);
      star5(ctx, e.x + e.tx * 8, e.y + e.ty * 8, r, -Math.PI / 2);
      ctx.fillStyle = zone ? '#fff3b0' : COL.gold; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    });
    if (this.cur < 0 && !this.outro && this.guides && (g.hint || this.nudge > 0.05)) {
      const i = this.nextIndex();
      if (i >= 0) { const m = this.front(i, 0.5); drawTapHint(ctx, m.x, m.y, time, true, g.hint ? 1 : this.nudge, 0.9); }
    }
    const held = this.cur >= 0;
    const bob = held ? Math.sin(time * 40) * 1.2 : Math.sin(time * 3) * 5;
    ctx.translate(this.at.x, this.at.y + bob - (this.outro ? this.outroT * 300 : 0));
    ctx.rotate(this.ang);
    drawIron(ctx, held);
    ctx.restore();
  }
}

// a tiny steam iron seen from the side, gliding along +x: its sole sits on the origin
// line and the body and handle rise above it
function drawIron(ctx, on) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  // handle loop
  ctx.beginPath(); ctx.moveTo(-22, -24); ctx.bezierCurveTo(-24, -50, 18, -50, 12, -26);
  ctx.lineWidth = 13; ctx.stroke(); ctx.lineWidth = 6.5; ctx.strokeStyle = on ? '#ff6fae' : '#ff8fb8'; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  // body: flat back, flat sole, pointed front
  const body = new Path2D('M -32 0 L 38 0 Q 24 -22 -2 -27 L -30 -27 Q -35 -14 -32 0 Z');
  ctx.fillStyle = '#8fd6ff'; ctx.fill(body);
  ctx.fillStyle = '#e3e8f4'; ctx.save(); ctx.clip(body); ctx.fillRect(-40, -7, 84, 8); ctx.restore();
  ctx.stroke(body);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(-24, -22, 22, 5, 2.5); ctx.fill();
  // dial, red while hot
  ctx.beginPath(); ctx.arc(8, -15, 4.5, 0, Math.PI * 2); ctx.fillStyle = on ? '#ff4f7b' : '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
}
