// VIII. Nose job: press on the big, bumpy nose and hold. A little rubber mallet taps it
// into shape while the solid ring around it shrinks toward the dotted one; let go when
// they meet (gold). Too early and it stays a bit big. Too long and it ends up a tiny
// upturned piggy nose. Oink.
import { Tool, drawTapHint } from './base.js';
import { TAU, rand, clamp01, smooth } from '../draw.js';
import { INK, COL, applyHead } from '../patient.js';
import { onSkin, mark } from './free.js';

const R0 = 34; // ring radius around a just-right nose
const PIVOT = { x: 124, y: -18 }; // where the mallet swings from (beside the right eye)
const TAPS = 7; // taps per second
// how big the nose is drawn at state k (the same scale drawNose uses), and its middle
const sizeOf = (k) => 1 + 0.5 * smooth(clamp01(1 - k)) - 0.42 * clamp01((k - 1) / 0.3);
const mid = (sz) => ({ x: 2, y: 40 + 22 * sz });
// the side of the nose the mallet lands on
const side = (sz) => ({ x: 4 + 26 * sz, y: 40 + 26 * sz });

export class NoseTool extends Tool {
  constructor(g, def) { super(g, def); this.outroLen = 0.8; this.reset(); }
  reset() { super.reset(); this.ph = 0.6; this.oinked = false; }
  get pushes() { return true; }
  value() { return this.g.s.nose; }
  targets() { return [{ x: 2, y: 58, r: 80 }]; }
  hitTest(hx, hy, sx, sy, minR = 0) {
    if (this.done[0]) return -1;
    const c = mid(sizeOf(this.g.s.nose));
    return Math.hypot(hx - c.x, hy - c.y) <= Math.max(84, minR) ? 0 : -1;
  }
  fixed() { return this.g.s.nose >= 0.9; }
  enter() { super.enter(); this.reset(); this.g.s.lookAt = { x: 0, y: 40 }; }
  begin() { this.startAt(this.g.s.nose); this.g.react('normal', 99, 'flat'); this.oinked = false; }
  hold(dt, p) {
    super.hold(dt, p);
    const { g } = this, s = g.s;
    s.nose = this.push(p);
    // the mallet comes down TAPS times a second; each landing is a knock and a squash
    const was = this.ph;
    this.ph += dt * TAPS;
    if (Math.floor(this.ph - 0.3) > Math.floor(was - 0.3)) this.land();
    const inZone = this.inZone(p);
    if (inZone && !this.wasIn) g.audio.tick();
    this.wasIn = inZone;
    if (s.nose > 1.2 && !this.oinked) { this.oinked = true; g.audio.oink(); g.react('wide', 0.6, 'o'); }
  }
  land() {
    const { g } = this, s = g.s, sz = sizeOf(s.nose);
    s.sqV += 0.35; // a little squash of the head on every tap
    const q = side(sz), w = g.head(q.x, q.y);
    g.fx.spark(w.x + rand(-8, 8), w.y + rand(-8, 8), { size: rand(8, 13), vy: -40 });
    if (Math.random() < 0.5) g.fx.glitter(w.x, w.y, 2, 140);
    g.audio.toolHit('nose', 0.94 + Math.min(1.5, s.nose) * 0.08);
    g.shake(0.01);
    if (Math.random() < 0.3) g.react('squeeze', 0.12, 'flat');
  }
  cancel() { this.g.s.nose = this.base; this.g.react('normal', 0.01); }
  releaseTarget(i, p, result) {
    const { g } = this, s = g.s, c = mid(sizeOf(s.nose)), w = g.head(c.x, c.y);
    this.wasIn = false;
    if (result.verdict === 'perfect' || result.verdict === 'good') {
      g.fx.ring(w.x, w.y, R0 * 0.8, R0 * 2.2, 0.5, COL.gold, 6);
      g.fx.burst(w.x, w.y, 7, 220, { size: rand(10, 15) });
      g.audio.toolDone('nose');
      g.react('happy', 1.1, 'grin');
    } else if (result.verdict === 'late') {
      g.audio.oink();
      g.fx.text(w.x + 110, w.y - 20, 'OINK!', '#ff7d9a', 28);
      g.fx.puff(w.x, w.y, 3, '255,170,190');
      g.react('wide', 1.2, 'o');
    } else g.react('normal', 0.9, 'flat');
    return result;
  }
  update(dt) { super.update(dt); if (this.cur < 0) this.ph = 0.6; }
  // off the nose: the mallet smashes the glass in the doorway, or bruises bare skin
  freeSpot(q) {
    if (this.g.smash(q)) return true;
    if (!this.free || !onSkin(this.g, q)) return false;
    mark(this.g, q, 'bruise', 'BONK!'); this.g.bump(0.4); return true;
  }
  draw(ctx, time) {
    if (this.alpha < 0.01) return;
    const { g } = this, s = g.s;
    const a = this.alpha * (this.outro ? Math.max(0, 1 - this.outroT * 2) : 1);
    if (a < 0.01) return;
    const sz = sizeOf(s.nose), c = mid(sz), held = this.cur >= 0;
    ctx.save();
    applyHead(ctx, s);
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    if (!this.outro && this.guides) {
      // dotted ring: the size to aim for; solid ring: the nose now, shrinking while held
      const zone = held && this.inZone(this.p), over = held && this.p > this.sw.c + this.sw.w;
      const ideal = mid(1);
      ctx.setLineDash([0.1, 12]); ctx.lineDashOffset = -time * 18;
      ctx.beginPath(); ctx.arc(ideal.x, ideal.y, R0, 0, TAU);
      ctx.lineWidth = 7; ctx.strokeStyle = zone ? COL.gold : 'rgba(255,255,255,0.95)'; ctx.stroke();
      ctx.setLineDash([]);
      const r = R0 * sz + (held ? 0 : Math.sin(time * 4) * 2 + this.nudge * 8 * Math.sin(time * 20));
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.lineWidth = zone ? 8 : 6.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = zone ? 4.5 : 3.5; ctx.strokeStyle = zone ? COL.gold : over ? '#ff7d9a' : '#ffffff';
      if (!held) { ctx.setLineDash([7, 7]); ctx.lineDashOffset = -time * 30; }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.cur < 0 && !this.outro && this.guides && (g.hint || this.nudge > 0.05)) drawTapHint(ctx, c.x, c.y, time, true, g.hint ? 1 : this.nudge, 0.9);
    // the mallet: raised and bobbing while waiting, tapping away while held
    const ph = this.ph % 1;
    const up = held ? (ph < 0.3 ? 1 - ph / 0.3 : (ph - 0.3) / 0.7) : 0.8 + Math.sin(time * 3) * 0.1;
    const fly = this.outro ? this.outroT * 3 : 0;
    const T = side(sz);
    const dx = T.x - PIVOT.x, dy = T.y - PIVOT.y, L = Math.hypot(dx, dy) - 14;
    ctx.translate(PIVOT.x + fly * 160, PIVOT.y - fly * 220);
    ctx.rotate(Math.atan2(dy, dx) - 0.55 * up - fly);
    drawMallet(ctx, L);
    ctx.restore();
  }
}

// handle from the origin along +x; the rubber head's striking face sits at x = L + 14
function drawMallet(ctx, L) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(L - 12, 0);
  ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 6; ctx.strokeStyle = '#f2b979'; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(L - 14, -24, 28, 48, 11);
  ctx.fillStyle = '#ff8fb8'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(L - 9, -18, 6, 30, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(L - 15, -6, 30, 12, 4); ctx.fillStyle = '#ffd36b'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
}
