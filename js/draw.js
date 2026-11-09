// Small shared drawing and maths helpers for the Canvas 2D renderer.
export const TAU = Math.PI * 2;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function easeOutBack(t) {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
// shuffles the array in place and returns it
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// four-point sparkle with concave sides
export function star4(ctx, x, y, r, rot = 0, pinch = 0.16) {
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(tx, ty);
    else {
      const m = a - Math.PI / 4;
      ctx.quadraticCurveTo(x + Math.cos(m) * r * pinch, y + Math.sin(m) * r * pinch, tx, ty);
    }
  }
  ctx.closePath();
}

// classic five-point star
export function star5(ctx, x, y, r, rot = -Math.PI / 2, inner = 0.5) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function heart(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
}

// polyline with arc-length lookup
export class Poly {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.len = this.cum[this.cum.length - 1];
  }
  // point and unit tangent at distance d along the line
  at(d) {
    const { pts, cum } = this;
    d = Math.max(0, Math.min(this.len, d));
    let i = 1;
    while (i < pts.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1;
    const k = (d - cum[i - 1]) / seg;
    const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, tx, ty };
  }
  // append the first `d` units of the line to the current path
  trace(ctx, d0, d1) {
    const { pts, cum } = this;
    d0 = Math.max(0, d0); d1 = Math.min(this.len, d1);
    if (d1 <= d0) return;
    const p0 = this.at(d0);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] <= d0) continue;
      if (cum[i] >= d1) { const p = this.at(d1); ctx.lineTo(p.x, p.y); return; }
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
  }
}

// sample a cubic bezier
export function cubic(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// soft round sprite used for glows
export function glowSprite(size = 64, color = '255,255,255') {
  const c = makeCanvas(size, size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.35, `rgba(${color},0.45)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}

// the outline colour used for every drawn shape
export const INK = '#3a2747';
export function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }

// ---------- colour and soft shading ----------
const rgbCache = new Map();
// [r, g, b] of '#rrggbb' or 'rgb(r,g,b)'
function rgbOf(c) {
  let v = rgbCache.get(c);
  if (v) return v;
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  else v = (c.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  if (rgbCache.size > 400) rgbCache.clear();
  rgbCache.set(c, v);
  return v;
}
// mix two colours into a '#rrggbb'
export function mixHex(a, b, t) {
  const p = rgbOf(a), q = rgbOf(b);
  return '#' + [0, 1, 2].map((i) => Math.round(p[i] + (q[i] - p[i]) * t).toString(16).padStart(2, '0')).join('');
}
export const rgba = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
// a soft-edged oval of colour fading out to nothing: shading and highlights without lines
export function soft(ctx, x, y, rx, ry, col, a, rot = 0) {
  if (a <= 0.003) return;
  const [r, g, b] = rgbOf(col);
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(rx, ry);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(0.55, `rgba(${r},${g},${b},${a * 0.55})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();
}
