// Hairstyles. Every style is built from the same 15 tufts the hair brush grows (10 around
// the crown, 5 along the fringe), a cap over the scalp and, for long styles, hair behind
// the head. Nothing hangs below the hairline, so pimples and scars stay in the clear.
// The cap always carries a light sheen so dark hair reads as hair on dark skin.
import { TAU, clamp01, easeOutBack, INK, ell } from './draw.js';
import { mix } from './people.js';

const LW = 6;

function makeCurls() {
  const out = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (1.06 + (0.88 * i) / (N - 1));
    out.push({ x: Math.cos(a) * 150, y: -36 + Math.sin(a) * 168, r: i === 0 || i === N - 1 ? 27 : 33, rot: i * 1.7 });
  }
  for (let i = 0; i < 5; i++) {
    const x = -96 + i * 48;
    out.push({ x, y: -122 - 12 * Math.cos(((x / 110) * Math.PI) / 2), r: 26, rot: 2 + i * 2.3 });
  }
  out.forEach((c) => { c.u = (c.x + 172) / 344; c.a = Math.atan2(c.y + 40, c.x); });
  return out;
}
export const CURLS = makeCurls();
export const CAP = new Path2D('M -158 -40 C -160 -150 -92 -206 0 -206 C 92 -206 160 -150 158 -40 C 140 -76 116 -100 92 -110 C 60 -124 30 -126 0 -124 C -30 -126 -60 -124 -92 -110 C -116 -100 -140 -76 -158 -40 Z');

const BACK_LONG = new Path2D('M -164 -80 C -196 30 -206 160 -186 236 C -150 262 -70 268 0 268 C 70 268 150 262 186 236 C 206 160 196 30 164 -80 Z');
const BACK_BOB = new Path2D('M -162 -70 C -190 10 -196 100 -184 150 C -170 176 -134 170 -118 160 L 118 160 C 134 170 170 176 184 150 C 196 100 190 10 162 -70 Z');
const BACK_STRAIGHT = new Path2D('M -164 -92 C -184 0 -190 130 -190 272 L 190 272 C 190 130 184 0 164 -92 Z');
const OUTSIDE_CAP = new Path2D(); OUTSIDE_CAP.rect(-600, -600, 1200, 1200); OUTSIDE_CAP.addPath(CAP);
const MOHAWK = new Path2D('M -42 -118 L -44 -196 Q 0 -214 44 -196 L 42 -118 Z');
// fixed stubble dots inside the cap (shaved sides, buzz cuts)
const STUBBLE = (() => {
  const out = []; let sd = 7;
  const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  while (out.length < 46) {
    const x = -150 + r() * 300, y = -200 + r() * 170;
    if ((x / 150) ** 2 + ((y + 36) / 168) ** 2 < 0.92 && y < -124 + 84 * Math.min(1, (x / 158) ** 2) - 6) out.push([x, y]);
  }
  return out;
})();

// a bald patient keeps the hair over the ears; the rest only grows with the brush
const SIDES = [0, 1, 8, 9];
export const tuftKept = (style, i) => style !== 'bald' || SIDES.includes(i);

function fillStroke(ctx, w, lw = 5) { ctx.fillStyle = w.hair; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
function hiStroke(ctx, w, lw = 3) { ctx.lineWidth = lw; ctx.strokeStyle = w.hairHi; ctx.stroke(); }
function dots(ctx, pts, r, col, alpha) {
  ctx.fillStyle = col; ctx.globalAlpha *= alpha;
  ctx.beginPath(); for (const [x, y] of pts) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
  ctx.globalAlpha /= alpha;
}
// a pointed lock from (x, y) toward angle a
function spike(ctx, x, y, a, L, b, bend = 0) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  ctx.beginPath();
  ctx.moveTo(x + nx * b - dx * 6, y + ny * b - dy * 6);
  ctx.quadraticCurveTo(x + dx * L * 0.5 + nx * b * (0.4 + bend), y + dy * L * 0.5 + ny * b * (0.4 + bend), x + dx * L + nx * (6 + bend * 14), y + dy * L + ny * (6 + bend * 14));
  ctx.quadraticCurveTo(x + dx * L * 0.45 - nx * b * (0.2 - bend), y + dy * L * 0.45 - ny * b * (0.2 - bend), x - nx * b - dx * 6, y - ny * b - dy * 6);
  ctx.closePath();
}

// Sleek styles are drawn as one shape: every tuft's outline first, then every fill on
// top, so the locks merge into smooth hair instead of separate puffs.
const SMOOTH = new Set(['straight', 'neat', 'slick', 'bun', 'wavy', 'bob']);
function tuftGeom(c, r, push) {
  const a = c.a, dx = Math.cos(a), dy = Math.sin(a);
  return { a, dx, dy, nx: -dy, ny: dx, x: c.x + dx * push, y: c.y + dy * push, k: r / c.r };
}
function smoothShape(ctx, st, c, r, push, i) {
  const { a, dx, dy, x, y, k } = tuftGeom(c, r, push), fringe = i >= 10, t = a + Math.PI / 2;
  ctx.beginPath();
  if (st === 'straight') {
    if (fringe) { // blunt bangs, ending well above the forehead's pimples and scars
      const top = y - 26, bot = top + (-106 - top) * Math.min(1, k), hw = 29 * Math.min(1.05, k);
      ctx.roundRect(x - hw, top, hw * 2, bot - top, [4, 4, 12, 12]);
    } else ctx.ellipse(x - dx * r * 0.12, y - dy * r * 0.12, r * 1.12, r * 0.62, t, 0, TAU);
  } else if (st === 'neat') {
    if (fringe) ctx.ellipse(x + 8 * k, y + 2, r * 1.3, r * 0.62, -0.38, 0, TAU);
    else ctx.ellipse(x - dx * r * 0.15, y - dy * r * 0.15, r * 1.15, r * 0.6, t, 0, TAU);
  } else if (st === 'slick') {
    if (fringe) ctx.ellipse(x, y - 14 * k, r * 1.32, r * 0.92, -0.2, 0, TAU); // a rolled pompadour
    else ctx.ellipse(x - dx * r * 0.2, y - dy * r * 0.2, r * 1.1, r * 0.62, t, 0, TAU);
  } else if (st === 'bun') ctx.ellipse(x - dx * r * 0.22, y - dy * r * 0.22, r * 0.95, r * 0.62, t, 0, TAU);
  else ctx.ellipse(x, y, r * 1.08, r * 0.82, t, 0, TAU); // wavy, bob
}
function smoothHi(ctx, w, c, r, push, i) {
  const { a, dx, dy, x, y, k } = tuftGeom(c, r, push), fringe = i >= 10, st = w.style;
  ctx.beginPath();
  if (st === 'straight') {
    if (fringe) { const top = y - 22, bot = top + (-112 - top) * Math.min(1, k); ctx.moveTo(x - 10, top); ctx.lineTo(x - 10, bot); ctx.moveTo(x + 12, top + 4); ctx.lineTo(x + 12, bot - 4); }
    else return;
  } else if (st === 'neat') { if (fringe) ctx.ellipse(x + 6 * k, y - 1, r * 0.75, r * 0.3, -0.38, Math.PI * 1.1, Math.PI * 1.75); else return; }
  else if (st === 'slick') { if (fringe) ctx.arc(x - 2, y - 14 * k, r * 0.55, 3.6, 5.4); else return; }
  else if (st === 'wavy' || st === 'bob') ctx.ellipse(x - dx * 4, y - dy * 4, r * 0.6, r * 0.33, a + Math.PI / 2, Math.PI * 1.1, Math.PI * 1.7);
  else return;
  hiStroke(ctx, w, 3);
}

// one tuft; its shape depends on the hairstyle. k is how far it has grown in (0..~1.1)
function drawTuft(ctx, w, c, r, push, i) {
  const a = c.a, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const x = c.x + dx * push, y = c.y + dy * push, k = r / c.r, fringe = i >= 10;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (w.style) {
    case 'afro': {
      const R = r * 1.22, X = x + dx * r * 0.32, Y = y + dy * r * 0.32;
      ell(ctx, X, Y, R, R); fillStroke(ctx, w);
      ctx.beginPath(); ctx.arc(X - R * 0.2, Y - R * 0.2, R * 0.45, 3.4, 4.6); hiStroke(ctx, w);
      return;
    }
    case 'spiky': {
      spike(ctx, x, y, a, r * 1.55, r * 0.78); fillStroke(ctx, w);
      ctx.beginPath(); ctx.moveTo(x + dx * 4, y + dy * 4); ctx.lineTo(x + dx * r * 0.93 + nx * 3, y + dy * r * 0.93 + ny * 3); hiStroke(ctx, w);
      return;
    }
    case 'messy': {
      const aa = a + Math.sin(c.rot * 3.1) * 0.55;
      spike(ctx, x, y, aa, r * 1.35, r * 0.74, Math.sin(c.rot * 5.3) * 0.5); fillStroke(ctx, w);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aa) * r * 0.8, y + Math.sin(aa) * r * 0.8); hiStroke(ctx, w);
      return;
    }
    case 'mohawk': {
      if (Math.abs(c.x) > 56) return; // shaved
      const aa = -Math.PI / 2 + (a + Math.PI / 2) * 0.45;
      spike(ctx, x, y, aa, r * 3.1, r * 0.72); fillStroke(ctx, w);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aa) * r * 1.9, y + Math.sin(aa) * r * 1.9); hiStroke(ctx, w, 4);
      return;
    }
    case 'buzz': {
      dots(ctx, [[x - dx * 16, y - dy * 16], [x - dx * 26 + nx * 9, y - dy * 26 + ny * 9], [x - dx * 24 - nx * 10, y - dy * 24 - ny * 10]], 2.2 * Math.min(1, k), w.hairHi, 0.8);
      return;
    }
    case 'locs': {
      const R = r * (fringe ? 0.62 : 0.72);
      ell(ctx, x, y, R, R); fillStroke(ctx, w);
      ctx.beginPath(); ctx.moveTo(x - nx * R * 0.7, y - ny * R * 0.7); ctx.quadraticCurveTo(x - dx * R * 0.2, y - dy * R * 0.2, x + nx * R * 0.7, y + ny * R * 0.7); hiStroke(ctx, w);
      return;
    }
    case 'bald': { // soft, fluffy puffs
      const P = [[x + nx * r * 0.45, y + ny * r * 0.45, r * 0.6], [x - nx * r * 0.45, y - ny * r * 0.45, r * 0.6], [x + dx * r * 0.28, y + dy * r * 0.28, r * 0.68]];
      ctx.beginPath(); for (const [px, py, pr] of P) { ctx.moveTo(px + pr, py); ctx.arc(px, py, pr, 0, TAU); }
      ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = w.hair; ctx.fill();
      ctx.beginPath(); ctx.arc(x - dx * 2, y - dy * 2, r * 0.4, a + 2.4, a + 3.6); hiStroke(ctx, w);
      return;
    }
    default: { // curly
      ell(ctx, x, y, r, r); ctx.fillStyle = w.hair; ctx.fill();
      ell(ctx, x - r * 0.18, y - r * 0.2, r * 0.5, r * 0.42); ctx.fillStyle = w.hairHi; ctx.globalAlpha *= 0.55; ctx.fill(); ctx.globalAlpha /= 0.55;
      ell(ctx, x, y, r, r); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x + r * 0.06, y + r * 0.04, r * 0.5, c.rot, c.rot + 4.3); ctx.stroke();
    }
  }
}

// hair behind the head: long styles, afros, locs, and the sides a bald patient keeps
export function drawBackHair(ctx, s) {
  const w = s.who, h = clamp01(s.hair), st = w.style;
  if (h <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = h;
  ctx.translate(0, -40); ctx.scale(0.8 + 0.2 * h, 0.8 + 0.2 * h); ctx.translate(0, 40);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  let p = null;
  if (st === 'wavy') p = BACK_LONG;
  else if (st === 'bob') p = BACK_BOB;
  else if (st === 'straight') p = BACK_STRAIGHT;
  else if (st === 'afro') { p = new Path2D(); p.ellipse(0, -70, 206, 190, 0, 0, TAU); }
  if (p) {
    ctx.fillStyle = w.hair; ctx.fill(p);
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke(p);
    if (st === 'straight' || st === 'wavy') {
      ctx.strokeStyle = w.hairHi; ctx.lineWidth = 4; ctx.globalAlpha = h * 0.7;
      ctx.beginPath();
      for (const side of [-1, 1]) { ctx.moveTo(side * 172, -20); ctx.quadraticCurveTo(side * (st === 'wavy' ? 192 : 180), 90, side * 174, 200); }
      ctx.stroke();
    }
  } else if (st === 'locs') {
    for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
      const x = side * (142 + j * 13), y0 = -90 + j * 8, y1 = 150 + ((j * 37) % 5) * 14;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + side * 8, (y0 + y1) / 2, x + side * 3, y1);
      ctx.lineWidth = 23; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 15; ctx.strokeStyle = w.hair; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = w.hairHi;
      ctx.beginPath(); for (let y = y0 + 20; y < y1 - 6; y += 18) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y + 6); } ctx.stroke();
    }
  } else if (st === 'bald') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (const [x, y, r] of [[150, -40, 30], [160, 4, 28]]) { ctx.moveTo(side * x + r, y); ctx.arc(side * x, y, r, 0, TAU); }
      ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = w.hair; ctx.fill();
    }
  }
  ctx.restore();
}

export function drawHair(ctx, s) {
  const w = s.who, st = w.style, h = clamp01(s.hair);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (st === 'bald') {
    // a shiny scalp; before the treatment a few thin strands comb over it
    ell(ctx, -48, -168, 34, 13, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fill();
    if (h < 1) {
      ctx.globalAlpha = 0.8 * (1 - h); ctx.strokeStyle = w.hair; ctx.lineWidth = 4;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = -176 + i * 12; ctx.moveTo(-100, y + 30); ctx.quadraticCurveTo(-10, y - 16, 96, y + 26); } ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    const capA = 0.4 + 0.6 * h;
    if (st === 'mohawk') {
      // shaved sides with stubble, a stripe of colour down the middle
      ctx.globalAlpha = capA * 0.55; ctx.fillStyle = mix(w.skin.base, '#2a1a20', 0.3); ctx.fill(CAP); ctx.globalAlpha = capA;
      ctx.save(); ctx.clip(CAP); dots(ctx, STUBBLE, 1.8, '#2a1a20', 0.4); ctx.fillStyle = w.hair; ctx.fill(MOHAWK); ctx.restore();
    } else {
      ctx.globalAlpha = capA; ctx.fillStyle = w.hair; ctx.fill(CAP);
    }
    ctx.globalAlpha = 1;
    // sheen, so the hair reads as hair whatever the skin tone
    ctx.save(); ctx.clip(CAP);
    ctx.globalAlpha = 0.55 * h; ctx.strokeStyle = w.hairHi;
    if (st === 'slick') {
      ctx.lineWidth = 3.5; ctx.beginPath();
      for (let x = -100; x <= 100; x += 25) { ctx.moveTo(x, -122 + Math.abs(x) * 0.25); ctx.quadraticCurveTo(x * 0.9, -170, x * 0.55, -204); }
      ctx.stroke();
    } else if (st === 'buzz') {
      dots(ctx, STUBBLE, 2, w.hairHi, 0.7);
    } else if (st !== 'mohawk') {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-118, -128); ctx.quadraticCurveTo(-70, -188, 10, -188); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(32, -186); ctx.quadraticCurveTo(72, -180, 98, -160); ctx.stroke();
    }
    if (st === 'neat' && h > 0.5) { ctx.globalAlpha = 0.6 * h; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-58, -198); ctx.quadraticCurveTo(-62, -160, -70, -124); ctx.stroke(); }
    ctx.restore();
    ctx.globalAlpha = 1;
    // thinning hair before treatment: a few strands over the see-through cap
    if (h < 1) {
      ctx.globalAlpha = 0.85 * (1 - h); ctx.strokeStyle = w.hair; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const x = -110 + i * 27; ctx.moveTo(x, -180 + Math.abs(x) * 0.25); ctx.quadraticCurveTo(x + 8, -150, x + 4, -126 + Math.abs(x) * 0.2); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.globalAlpha = 0.5 + 0.5 * h; ctx.stroke(CAP); ctx.globalAlpha = 1;
  }
  // a bun on top, tied with a band, once the crown has grown in
  if (st === 'bun' && s.curls[4] >= 0) {
    const k = easeOutBack(clamp01(s.curls[4] / 0.32));
    ell(ctx, 0, -236 + 10 * (1 - k), 50 * k, 44 * k); fillStroke(ctx, w, LW);
    ctx.beginPath(); ctx.arc(-4, -240, 26 * k, 3.3, 5.6); hiStroke(ctx, w, 4);
    ctx.beginPath(); ctx.roundRect(-30 * k, -204, 60 * k, 13, 6); ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  }
  const grown = [];
  for (let i = 0; i < CURLS.length; i++) {
    const t = s.curls[i];
    if (t >= 0) grown.push([i, CURLS[i].r * easeOutBack(clamp01(t / 0.32)) * (1 + 0.5 * s.puff)]);
  }
  const push = s.puff * 26;
  if (SMOOTH.has(st)) {
    // outlines only where they edge the hair, not across the scalp underneath
    ctx.save(); ctx.clip(OUTSIDE_CAP, 'evenodd');
    ctx.lineJoin = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = INK;
    for (const [i, r] of grown) { smoothShape(ctx, st, CURLS[i], r, push, i); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = w.hair;
    for (const [i, r] of grown) { smoothShape(ctx, st, CURLS[i], r, push, i); ctx.fill(); }
    for (const [i, r] of grown) smoothHi(ctx, w, CURLS[i], r, push, i);
  } else for (const [i, r] of grown) drawTuft(ctx, w, CURLS[i], r, push, i);
}
