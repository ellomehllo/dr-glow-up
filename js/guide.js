// The in-world progress line: a dotted path that fills with gold as the hold goes on,
// a sweet-zone band with a star on its centre, a pink "too far" stretch after it, and
// a travelling ghost dot for first-time players. A guide is a list of segments, each
// a polyline covering a slice [t0, t1] of the tool's progress (gaps are hops).
import { Poly, star5, TAU } from './draw.js';
import { INK, COL } from './patient.js';

export function makeGuide(list) {
  return list.map((g) => ({ poly: new Poly(g.pts), t0: g.t0, t1: g.t1, over: !!g.over }));
}

// point on the guide at progress t (interpolates across gaps)
export function guideAt(segs, t) {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (t <= s.t1 || i === segs.length - 1) {
      if (t < s.t0 && i > 0) {
        const a = segs[i - 1], pa = a.poly.at(a.poly.len), pb = s.poly.at(0);
        const k = (t - a.t1) / Math.max(1e-6, s.t0 - a.t1);
        return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k - Math.sin(k * Math.PI) * 36, tx: pb.tx, ty: pb.ty, hop: true };
      }
      const k = Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0)));
      return s.poly.at(k * s.poly.len);
    }
  }
  return segs[0].poly.at(0);
}

function strokeRange(ctx, s, a, b) {
  const lo = Math.max(a, s.t0), hi = Math.min(b, s.t1);
  if (hi <= lo) return false;
  const L = s.poly.len, k = 1 / (s.t1 - s.t0);
  s.poly.trace(ctx, (lo - s.t0) * k * L, (hi - s.t0) * k * L);
  return true;
}

// o: { prog, sweet: {t, w} | null, alpha, fail, hit, ghost, time, inZone }
export function drawGuide(ctx, segs, o) {
  if (o.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sw = o.sweet;
  const overFrom = sw ? sw.t + sw.w : 2;
  // dotted track (ink dots, pink after the sweet zone)
  ctx.setLineDash([0.1, 13]);
  ctx.lineWidth = 6.5;
  ctx.beginPath(); for (const s of segs) strokeRange(ctx, s, 0, overFrom);
  ctx.strokeStyle = 'rgba(58,39,71,0.45)'; ctx.stroke();
  if (sw) { ctx.beginPath(); for (const s of segs) strokeRange(ctx, s, overFrom, 1); ctx.strokeStyle = '#ff5d7d'; ctx.stroke(); }
  ctx.setLineDash([]);
  // sweet band
  if (sw) {
    ctx.beginPath(); for (const s of segs) strokeRange(ctx, s, sw.t - sw.w, sw.t + sw.w);
    ctx.lineWidth = 15; ctx.strokeStyle = o.inZone ? 'rgba(63,224,181,0.85)' : 'rgba(63,224,181,0.45)'; ctx.stroke();
  }
  // progress fill
  if (o.prog > 0.001) {
    ctx.beginPath(); let any = false;
    for (const s of segs) any = strokeRange(ctx, s, 0, o.prog) || any;
    if (any) {
      ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 6.5; ctx.strokeStyle = o.fail > 0.05 ? '#ff7d9a' : COL.gold; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = COL.goldHi; ctx.stroke();
    }
  }
  // star on the sweet centre
  if (sw) {
    const q = guideAt(segs, sw.t);
    const pulse = 1 + 0.12 * Math.sin(o.time * 7) + (o.inZone ? 0.25 : 0) + o.hit * 0.5;
    star5(ctx, q.x, q.y, 15 * pulse, -Math.PI / 2 + Math.sin(o.time * 2) * 0.15);
    ctx.fillStyle = o.inZone || o.hit > 0.05 ? '#fff3b0' : COL.gold; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  }
  // head of the line
  if (o.prog > 0.001 && o.prog < 1) {
    const q = guideAt(segs, o.prog);
    ctx.beginPath(); ctx.arc(q.x, q.y, 7.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  }
  // first-time ghost dot
  if (o.ghost >= 0) {
    const q = guideAt(segs, o.ghost);
    ctx.globalAlpha = o.alpha * (0.55 + 0.45 * Math.sin(o.time * 9));
    ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = COL.gold; ctx.stroke();
  }
  ctx.restore();
}
