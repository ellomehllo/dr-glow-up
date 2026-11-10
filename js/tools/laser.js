// XII. Laser: drag the laser pen over the face and the beam zaps the sun spots away.
// Keep it moving: a beam that rests in one place leaves a pink mark, and every mark
// costs points. Never across the eyes: that hurts (mood.js). With Space held the laser
// hops from spot to spot on its own.
import { Tool, drawHand } from './base.js';
import { rand, TAU } from '../draw.js';
import { INK, applyHead, onFace, eyeSide, addBald } from '../patient.js';
import { onHair } from './free.js';

const REACH = 24; // a spot this close to the beam (plus its size) is being zapped
const ZAP = 0.14; // seconds under the beam to zap a spot
const HOT = 0.7; // seconds of resting in one place before the skin gets marked
const SLOW = 70; // head units per second: slower than this counts as resting
const PEN = { x: 70, y: -128 }; // the pen sits up and to the right of the beam's end
const REST = { x: 150, y: -190 };

export class LaserTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() {
    super.reset();
    this.tip = null; this.firing = false; this.heat = 0; this.zapped = 0; this.route = null; this.wait = 0;
    this.last = null; this.acc = 0; this.env = null;
  }
  enter() {
    super.enter(); this.reset();
    // the autopilot's route: nearest spot next, starting top right
    const left = this.g.s.spots.slice();
    const route = [];
    let at = { x: 120, y: -120 };
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((p, i) => { const d = Math.hypot(p.x - at.x, p.y - at.y); if (d < bd) { bd = d; bi = i; } });
      at = left.splice(bi, 1)[0]; route.push(at);
    }
    this.route = route;
    this.g.s.lookAt = { x: 0, y: -40 };
  }
  begin() { this.last = null; }
  burn(x, y) {
    const { g } = this, s = g.s;
    if (s.burns.length >= 24 || !onFace(x, y, -6)) return;
    s.burns.push({ x, y, t: 0 });
    g.hurt(x, y, 'burn', true); // it hurts (the laser's own score pays for the mark)
  }
  brush(dt, pos) {
    const { g } = this, s = g.s;
    let to;
    if (!pos) {
      // Space: glide to the next spot still there and rest on it just long enough
      const next = this.route.find((p) => p.z < 1);
      if (!next) { this.done[0] = true; return; }
      const from = this.tip || { x: 120, y: -120 }, dx = next.x - from.x, dy = next.y - from.y, d = Math.hypot(dx, dy);
      const step = 700 * dt;
      to = d <= step ? { x: next.x, y: next.y } : { x: from.x + (dx / d) * step, y: from.y + (dy / d) * step };
      this.heat = 0;
    } else to = { x: pos.x, y: pos.y };
    const prev = this.last || to;
    const speed = Math.hypot(to.x - prev.x, to.y - prev.y) / Math.max(dt, 1e-4);
    this.last = to; this.tip = to; this.firing = true;
    // zap whatever is under the beam
    for (const p of s.spots) {
      if (p.z >= 1) continue;
      if (Math.hypot(p.x - to.x, p.y - to.y) <= REACH + p.r) {
        p.z = Math.min(1, p.z + dt / ZAP);
        if (p.z >= 1) this.pop(p);
      }
    }
    // the beam in an eye hurts at once; resting anywhere else heats the skin up
    if (pos && eyeSide(s, to.x, to.y) >= 0) { this.heat = 0; g.hurt(to.x, to.y, 'burn'); }
    else if (pos && onHair(to.x, to.y)) {
      // resting on the hair burns it away: a scorched bald patch and a wisp of smoke
      if (speed < SLOW) this.heat += dt * 2.5; else this.heat = Math.max(0, this.heat - dt * 3);
      if (this.heat >= HOT) {
        this.heat = 0;
        addBald(s, to.x, to.y, 22, 'burn');
        const w = g.head(to.x, to.y);
        g.fx.puff(w.x, w.y, 3, '120,110,120');
        g.fx.text(w.x, w.y - 34, 'SIZZLE!', '#ffb36b', 22, 0.8);
        g.react('wide', 0.7, 'o');
        g.audio.nick();
      }
    } else if (pos && onFace(to.x, to.y)) {
      // a real laser marks skin it rests on (a free use, with nothing to aim at, faster)
      if (speed < SLOW) this.heat += dt * (this.free ? 2 : 1); else this.heat = Math.max(0, this.heat - dt * 3);
      if (this.heat >= HOT) { this.heat = 0; this.burn(to.x, to.y); }
    } else {
      // off the patient: the room (the glass, the bubbles, the waiting room; game.js)
      this.heat = 0;
      this.env = pos ? g.env(pos, dt) : null;
    }
    if (!pos || onFace(to.x, to.y) || onHair(to.x, to.y)) this.env = null;
    s.lookAt = { x: to.x * 0.4, y: to.y };
    g.audio.toolLoop('laser', 1);
    this.acc += dt;
    if (this.acc > 0.06) {
      this.acc = 0;
      const w = g.head(to.x, to.y);
      g.fx.spark(w.x + rand(-6, 6), w.y + rand(-6, 6), { size: rand(6, 10), col: '#ff6fae', vy: -60, life: 0.35 });
    }
  }
  pop(p) {
    const { g } = this, w = g.head(p.x, p.y);
    this.zapped++;
    g.fx.ring(w.x, w.y, 6, 34, 0.35, '#ff9fc4', 5);
    g.fx.burst(w.x, w.y, 5, 170, { size: rand(8, 12) });
    g.audio.toolHit('laser', 0.95 + Math.random() * 0.1);
  }
  lift() { this.firing = false; this.last = null; this.heat = 0; this.env = null; this.idle(); }
  idle() { this.g.audio.toolLoop('laser', 0); }
  coverage() { const n = this.g.s.spots.length; return n ? this.zapped / n : 1; }
  complete() { return this.zapped >= this.g.s.spots.length || this.done[0]; }
  result() {
    const b = this.g.s.burns.length, score = Math.max(0, 100 - 14 * b);
    return { score, verdict: b === 0 ? 'perfect' : score >= 70 ? 'good' : 'messy' };
  }
  finish(result) {
    super.finish(result);
    const { g } = this, s = g.s;
    this.firing = false; this.idle();
    for (const p of s.spots) p.z = 1;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU, w = g.head(Math.cos(a) * rand(50, 130), -10 + Math.sin(a) * rand(50, 150));
        g.fx.spark(w.x, w.y, { delay: i * 0.03, size: rand(11, 17), vy: -50 });
      }
      g.audio.toolDone('laser');
      g.react('happy', 1.1, 'grin');
    } else { g.react('normal', 1, 'wince'); }
    return result;
  }
  update(dt) {
    super.update(dt);
    for (const b of this.g.s.burns) b.t += dt;
  }
  exit() { super.exit(); this.idle(); }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (a < 0.01) return;
    ctx.save();
    applyHead(ctx, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // first use: every spot still there gets a dotted target ring
    if (!this.outro && this.guides) {
      ctx.globalAlpha = a * 0.85;
      ctx.setLineDash([0.1, 9]); ctx.lineDashOffset = -time * 14;
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff';
      for (const p of s.spots) {
        if (p.z >= 1) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9 + Math.sin(time * 4 + p.x) * 1.5, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // first time: a hand sweeps across the nearest spots
    if (this.guides && g.hint && !this.tip && this.route && this.route.length) {
      const p0 = this.route[0], p1 = this.route[Math.min(1, this.route.length - 1)], k = 0.5 - 0.5 * Math.cos(time * 2.4);
      ctx.globalAlpha = a;
      drawHand(ctx, p0.x + (p1.x - p0.x) * k, p0.y + (p1.y - p0.y) * k, 0.9);
    }
    const at = this.firing && this.tip ? this.tip : null;
    const end = at || { x: REST.x - PEN.x, y: REST.y - PEN.y + Math.sin(time * 3) * 6 };
    const pen = { x: end.x + PEN.x, y: end.y + PEN.y - (this.outro ? this.outroT * 300 : 0) };
    ctx.globalAlpha = a;
    if (at) {
      // the beam, with a hot glowing dot where it lands
      const hot = Math.min(1, this.heat / HOT);
      ctx.beginPath(); ctx.moveTo(pen.x, pen.y); ctx.lineTo(at.x, at.y);
      ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,90,150,0.3)'; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = '#ff4f8b'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      const r = 10 + Math.sin(time * 40) * 1.5 + hot * 8;
      ctx.beginPath(); ctx.arc(at.x, at.y, r * 1.8, 0, TAU); ctx.fillStyle = `rgba(255,${Math.round(120 - 60 * hot)},170,0.35)`; ctx.fill();
      ctx.beginPath(); ctx.arc(at.x, at.y, r * 0.6, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      if (this.env === 'glass') {
        // off the glass: the beam glances back out, mirrored, with a star of light
        const dx = at.x - pen.x, dy = at.y - pen.y, L = Math.hypot(dx, dy) || 1, R = 700, c = Math.cos(0.6), n = Math.sin(0.6);
        const ux = -dx / L, uy = -dy / L, out = { x: at.x + (ux * c - uy * n) * R, y: at.y + (ux * n + uy * c) * R };
        const gr = ctx.createLinearGradient(at.x, at.y, out.x, out.y);
        gr.addColorStop(0, 'rgba(255,79,139,0.95)'); gr.addColorStop(1, 'rgba(255,79,139,0)');
        ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(out.x, out.y);
        ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,90,150,0.18)'; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = gr; ctx.stroke();
        const k = 18 + Math.sin(time * 30) * 4;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(at.x - k, at.y); ctx.lineTo(at.x + k, at.y); ctx.moveTo(at.x, at.y - k); ctx.lineTo(at.x, at.y + k); ctx.stroke();
      }
    }
    ctx.translate(pen.x, pen.y);
    ctx.rotate(Math.atan2(-PEN.y, -PEN.x) - Math.PI / 2);
    drawPen(ctx, !!at);
    ctx.restore();
  }
}

// a laser pen with its nozzle at the origin pointing down (+y), body going up
function drawPen(ctx, on) {
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.roundRect(-13, -104, 26, 86, 12); ctx.fillStyle = '#c9b6ff'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.roundRect(-7, -96, 5, 60, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-9, -64, 18, 12, 5); ctx.fillStyle = on ? '#ff4f8b' : '#ff9fc4'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-13, -20); ctx.lineTo(13, -20); ctx.lineTo(7, 2); ctx.lineTo(-7, 2); ctx.closePath();
  ctx.fillStyle = '#e3e8f4'; ctx.fill(); ctx.stroke();
}
