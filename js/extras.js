// Extra troubles a patient can walk in with, on top of what their level treats. Each one
// is fixed by one of the extra tools (config.js EXTRAS), which unlock early in chapter 1:
//   tweeze  leaves, twigs and feathers stuck in the hair, a worm wriggling out of a
//           nostril or an ear, and the patient's own piercings: pull each one out
//   tbrush  plaque and bits of food on the teeth: brush them off
//   drill   cavities: drill and fill each one
//   pliers  a rotten tooth: pull it, and a shiny new one grows in
// The teeth only show with the mouth open wide ('aah'): while a teeth tool is out, or for
// a moment when the player taps the mouth.
// rollExtras decides what a new patient brings (a few at random once the tools are
// unlocked, always the one a level introduces); makeState copies the result onto the
// patient, and the draw functions here are called from patient.js in head space.
import { INK, TAU, ell, clamp01, rand, pick } from './draw.js';

export const EXTRA_IDS = ['tweeze', 'tbrush', 'drill', 'pliers'];
const DENTAL = new Set(['tbrush', 'drill', 'pliers']);
export const isDental = (id) => DENTAL.has(id);

// ---------- where things go (head space) ----------
// on the hair, around the crown and along the fringe
const DEBRIS_SPOTS = [
  { x: -112, y: -150, a: -0.8 }, { x: -52, y: -194, a: -0.3 }, { x: 34, y: -198, a: 0.2 },
  { x: 104, y: -160, a: 0.7 }, { x: 146, y: -88, a: 1.2 }, { x: -146, y: -82, a: -1.2 },
  { x: -20, y: -150, a: 0 }, { x: 70, y: -130, a: 0.4 },
];
const DEBRIS_KINDS = ['leaf', 'leaf', 'autumn', 'twig', 'feather'];
// a worm pokes out of a nostril or an ear canal, pointing outward
const WORM_SPOTS = [
  { at: 'nose', x: -11, y: 86, a: Math.PI / 2 + 0.45 }, // the left nostril (a nose ring goes on the right)
  { at: 'ear', x: -150, y: 40, a: Math.PI + 0.2 }, { at: 'ear', x: 150, y: 40, a: -0.2 },
];
// the punk's own piercings (and anyone else's): a nostril ring and two brow studs
export const OWN_PIERCINGS = [
  { x: 15, y: 84, ring: true }, { x: 84, y: -54, ring: false }, { x: 88, y: -20, ring: false },
];

// teeth in the open mouth: six on top, six smaller ones below
export const TEETH = [];
for (let i = 0; i < 6; i++) {
  const x = -32.5 + i * 13;
  TEETH.push({ x, y: 104 + Math.abs(x) * 0.08, w: 12, h: 18, up: true });
}
for (let i = 0; i < 6; i++) {
  const x = -27 + i * 10.8;
  TEETH.push({ x, y: 147 - Math.abs(x) * 0.12, w: 10.4, h: 14, up: false });
}
// the middle of a tooth's face, where a tool aims
export const toothAt = (i) => { const t = TEETH[i]; return { x: t.x, y: t.y + t.h / 2 }; };
// the open mouth (head space), shared by the drawing and the hit tests
export const AAH = new Path2D('M -48 106 Q 0 92 48 106 C 54 142 32 178 0 178 C -32 178 -54 142 -48 106 Z');
export const inMouth = (x, y) => Math.abs(x) < 56 && y > 92 && y < 180;

// per tooth: plaque (0..1), a bit of food, a cavity (0 none, 1 open, 2 filled, with how
// full it got), rotten, and the new tooth that grows in once a rotten one is pulled
export function makeDent(d) {
  return TEETH.map((_, i) => ({
    plaque: d ? d.plaque[i] || 0 : 0,
    food: (d && d.food.find((f) => f.i === i)) || null,
    cav: d && d.cav.includes(i) ? 1 : 0, fill: 0,
    rot: !!(d && d.rot.includes(i)), out: 0, gone: false, grow: 0, wob: rand(0, TAU),
  }));
}

// what a new patient brings. open(id): the tool is unlocked at this level; must: tools
// the level introduces (always brought); carry: a setup to keep the extras of (the
// patient walked in from the waiting room with them).
export function rollExtras({ open, must = [], who, carry = null }) {
  const want = new Set(must.filter(open));
  if (carry) {
    for (const id of carry.extras || []) if (open(id)) want.add(id);
  } else {
    for (const id of shuffled(EXTRA_IDS.filter((id) => open(id) && !want.has(id)))) {
      if (want.size >= 2) break;
      if (Math.random() < 0.42) want.add(id);
    }
  }
  const out = { extras: [], debris: [], worms: [], own: null, dent: null };
  const keep = (k) => carry && (carry.extras || []).includes(k);
  if (open('tweeze')) {
    if (want.has('tweeze')) {
      if (keep('tweeze')) { out.debris = carry.debris; out.worms = carry.worms; } else {
        const n = 1 + ((Math.random() * 3) | 0);
        out.debris = shuffled(DEBRIS_SPOTS.slice()).slice(0, n).map((p) => ({ ...p, kind: pick(DEBRIS_KINDS), rot: p.a + rand(-0.5, 0.5), flip: Math.random() < 0.5 }));
        if (Math.random() < 0.55) { const w = pick(WORM_SPOTS); out.worms = [{ ...w, ph: rand(0, TAU) }]; }
      }
    }
    // a patient with piercings of their own wants them out
    out.own = who && who.piercings ? OWN_PIERCINGS.map((p) => ({ ...p })) : [];
    if (out.debris.length || out.worms.length || out.own.length) out.extras.push('tweeze');
  }
  const dental = ['tbrush', 'drill', 'pliers'].filter((id) => want.has(id));
  if (dental.length) {
    const d = keep('tbrush') || keep('drill') || keep('pliers') ? carry.dent : null;
    const dent = { plaque: Array(TEETH.length).fill(0), food: [], cav: [], rot: [] };
    const free = shuffled(TEETH.map((_, i) => i));
    if (want.has('pliers')) dent.rot = d && d.rot.length ? d.rot : [free.find((i) => TEETH[i].up && Math.abs(TEETH[i].x) > 10)];
    const others = free.filter((i) => !dent.rot.includes(i));
    if (want.has('drill')) dent.cav = d && d.cav.length ? d.cav : others.slice(0, 1 + ((Math.random() * 3) | 0));
    if (want.has('tbrush')) {
      if (d && d.plaque.some((v) => v > 0)) { dent.plaque = d.plaque; dent.food = d.food; } else {
        dent.plaque = TEETH.map(() => (Math.random() < 0.7 ? rand(0.5, 1) : 0));
        dent.food = others.filter((i) => !dent.cav.includes(i)).slice(0, 2 + ((Math.random() * 2) | 0)).map((i) => ({ i, kind: pick(['leaf', 'seed', 'crumb']), dx: rand(-2, 2) }));
      }
    }
    out.dent = dent;
    out.extras.push(...dental);
  }
  return out;
}
function shuffled(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- drawing (head space) ----------
// pull: 0..1+ how far the tweezers have pulled it; it lifts away from the head
export function drawDebris(ctx, s, time) {
  for (const d of s.debris) {
    if (d.gone) continue;
    const k = Math.min(1.3, d.pull || 0);
    // pulled outward, away from the middle of the head
    const ox = Math.sin(d.a) * k * 22, oy = -Math.cos(d.a) * k * 22;
    const sway = Math.sin(time * 1.6 + d.x) * 0.06 + (k ? Math.sin(time * 30) * 0.06 * k : 0);
    ctx.save();
    ctx.translate(d.x + ox, d.y + oy);
    ctx.rotate(d.rot + sway);
    ctx.scale(d.flip ? -1.35 : 1.35, 1.35);
    drawBit(ctx, d.kind);
    ctx.restore();
  }
}
// one piece of debris, about 34 units long, centred on the origin
export function drawBit(ctx, kind) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  if (kind === 'twig') {
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-18, 6); ctx.lineTo(18, -6); ctx.moveTo(2, 0); ctx.lineTo(10, 12); ctx.stroke();
    ctx.lineWidth = 4.5; ctx.strokeStyle = '#9a6a3c'; ctx.stroke();
    ctx.beginPath(); ell(ctx, 13, 13, 5, 3.2, 0.6); ctx.fillStyle = '#7ccf5a'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    return;
  }
  if (kind === 'feather') {
    const p = new Path2D('M -20 8 Q -6 -14 20 -8 Q 4 6 -20 8 Z');
    ctx.fillStyle = '#ffffff'; ctx.fill(p); ctx.lineWidth = 2.6; ctx.stroke(p);
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#b9c4dd';
    ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = -10 + i * 7; ctx.moveTo(x, 4 - i * 2.4); ctx.lineTo(x + 3, -3 - i * 1.6); } ctx.stroke();
    ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-24, 10); ctx.quadraticCurveTo(-2, -2, 20, -8); ctx.stroke();
    return;
  }
  // a leaf: green, or orange for autumn, with a midrib and a stalk
  const p = new Path2D('M -18 0 Q -4 -14 18 0 Q -4 14 -18 0 Z');
  ctx.fillStyle = kind === 'autumn' ? '#ff9a3c' : '#6fd35a'; ctx.fill(p);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-2, -4, 8, 2.6, -0.1, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke(p);
  ctx.lineWidth = 1.8; ctx.strokeStyle = kind === 'autumn' ? '#c4561c' : '#2f8a3a';
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.moveTo(-4, 0); ctx.lineTo(2, -6); ctx.moveTo(4, 0); ctx.lineTo(9, 5); ctx.stroke();
  ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(25, 3); ctx.stroke();
}

// a worm wriggling out of a nostril or an ear: its tail stays inside, and a pull
// stretches it out further
export function drawWorms(ctx, s, time) {
  for (const w of s.worms) {
    if (w.gone) continue;
    const k = Math.min(1.35, w.pull || 0);
    const len = (w.at === 'ear' ? 34 : 30) + 10 * Math.sin(time * 1.3 + w.ph) + k * 44;
    drawWorm(ctx, w.x, w.y, w.a, len, time * (5 + k * 6) + w.ph, w.at === 'ear' ? 1.5 : 1.35);
  }
}
// a pink segmented worm from (x, y) along angle a, `len` long, wiggling by phase ph
export function drawWorm(ctx, x, y, a, len, ph, size = 1) {
  const pts = [], n = 10, ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i <= n; i++) {
    const t = i / n, along = t * len, side = Math.sin(ph - t * 5) * 6 * t * size;
    pts.push([x + ca * along - sa * side, y + sa * along + ca * side]);
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  path(); ctx.lineWidth = 12 * size; ctx.strokeStyle = INK; ctx.stroke();
  path(); ctx.lineWidth = 7 * size; ctx.strokeStyle = '#ff9fb2'; ctx.stroke();
  // rings along the body
  ctx.strokeStyle = '#e06a86'; ctx.lineWidth = 1.6;
  for (let i = 2; i < n; i += 2) {
    const [px, py] = pts[i], [qx, qy] = pts[i + 1], dx = qx - px, dy = qy - py, d = Math.hypot(dx, dy) || 1;
    ctx.beginPath(); ctx.moveTo(px - (dy / d) * 3.4 * size, py + (dx / d) * 3.4 * size); ctx.lineTo(px + (dy / d) * 3.4 * size, py - (dx / d) * 3.4 * size); ctx.stroke();
  }
  // the head: a rounded tip with two dot eyes, looking about
  const [hx, hy] = pts[n];
  ell(ctx, hx, hy, 5.6 * size, 5.6 * size); ctx.fillStyle = '#ff9fb2'; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK;
  const [px, py] = pts[n - 1], ux = hx - px, uy = hy - py, ud = Math.hypot(ux, uy) || 1;
  for (const sd of [-1, 1]) { ell(ctx, hx + (uy / ud) * 2.4 * sd * size, hy - (ux / ud) * 2.4 * sd * size, 1.2 * size, 1.2 * size); ctx.fill(); }
  ctx.restore();
}

const SILVER = '#dfe3ee';
// the patient's own piercings that are still in; a pull draws one outward
export function drawOwn(ctx, s) {
  ctx.lineCap = 'round';
  for (const p of s.own) {
    if (p.gone) continue;
    const k = Math.min(1.3, p.pull || 0), oy = p.ring ? k * 8 : -k * 6, ox = p.x > 0 ? k * 6 : -k * 6;
    const x = p.x + ox, y = p.y + oy;
    if (p.ring) {
      ctx.beginPath(); ctx.arc(x, y, 7, -0.4, Math.PI * 1.15);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = SILVER; ctx.stroke();
    } else {
      ell(ctx, x, y, 4.5, 4.5); ctx.fillStyle = SILVER; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    }
    if (k > 0.05) { // the skin tugged red around it
      ctx.globalAlpha = Math.min(0.5, k * 0.4); ell(ctx, p.x, p.y, 7, 5); ctx.fillStyle = '#ff6b81'; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

// the teeth inside the open mouth (clipped to it by the caller). base: the colour the
// whitening gives the teeth
export function drawTeeth(ctx, s, base, time) {
  const D = s.dent;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 0; i < TEETH.length; i++) {
    const t = TEETH[i], d = D[i];
    let x = t.x, y = t.y, sc = 1;
    if (d.gone) {
      if (d.grow <= 0) continue;
      sc = clamp01(d.grow);
    } else if (d.out > 0) {
      // loose: wobbles harder the further it is pulled, and slides out of the gum
      x += Math.sin(time * 38 + d.wob) * 2.2 * Math.min(1.2, d.out);
      y += (t.up ? 1 : -1) * Math.min(1.3, d.out) * 7;
    }
    ctx.save();
    ctx.translate(x, y + (t.up ? 0 : t.h));
    ctx.scale(sc, sc);
    ctx.translate(0, t.up ? 0 : -t.h);
    const p = new Path2D();
    if (t.up) p.roundRect(-t.w / 2, -4, t.w, t.h + 4, [2, 2, 5, 5]); else p.roundRect(-t.w / 2, 0, t.w, t.h + 4, [5, 5, 2, 2]);
    const col = d.gone ? '#ffffff' : d.rot ? '#9c7a3e' : base;
    ctx.fillStyle = col; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    if (d.rot && !d.gone) { // rotten: dark patches, a greenish edge
      ctx.fillStyle = '#5f4520'; ell(ctx, -2, t.up ? 10 : 6, 3.4, 3); ctx.fill(); ell(ctx, 3, t.up ? 4 : 11, 2, 1.8); ctx.fill();
      ctx.fillStyle = 'rgba(120,170,60,0.55)'; ctx.fillRect(-t.w / 2, t.up ? t.h - 4 : -4, t.w, 6);
    }
    if (d.plaque > 0.01) { // plaque builds up along the gumline
      ctx.globalAlpha = Math.min(1, d.plaque) * 0.8; ctx.fillStyle = '#d8b44a';
      const gy = t.up ? -4 : t.h + 4, dir = t.up ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(-t.w / 2, gy);
      for (let k = 0; k <= 4; k++) ctx.lineTo(-t.w / 2 + (k / 4) * t.w, gy + dir * (8 + 2.5 * Math.sin(k * 2.3 + i)) * Math.min(1, d.plaque + 0.3));
      ctx.lineTo(t.w / 2, gy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (d.cav) { // a cavity: a dark hole, shrinking as it is filled, then a silver filling
      const cy = t.h * 0.5;
      if (d.cav === 2) {
        ell(ctx, 0, cy, 3.6, 3.2); ctx.fillStyle = '#cfd6e6'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(58,39,71,0.6)'; ctx.stroke();
        ell(ctx, -1, cy - 1, 1.1, 0.9); ctx.fillStyle = '#ffffff'; ctx.fill();
        if (d.fill < 0.8) { ell(ctx, 1, cy + 1, 1.8 * (1 - d.fill), 1.6 * (1 - d.fill)); ctx.fillStyle = '#2a1626'; ctx.fill(); }
      } else {
        const r = 3.6 * (1 - 0.7 * clamp01(d.fill));
        ell(ctx, 0, cy, r, r * 0.9); ctx.fillStyle = '#2a1626'; ctx.fill();
        if (d.fill > 0.05) { ell(ctx, 0, cy, 3.6, 3.2); ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 2 * d.fill; ctx.stroke(); }
      }
    }
    ctx.restore();
    if (d.gone && d.grow < 1.6) { // a brand new tooth: it sparkles
      ctx.globalAlpha = clamp01(1.6 - d.grow); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, t.h * 0.2 - 6); ctx.lineTo(1.6, t.h * 0.2 - 1.6); ctx.lineTo(6, t.h * 0.2); ctx.lineTo(1.6, t.h * 0.2 + 1.6); ctx.lineTo(0, t.h * 0.2 + 6); ctx.lineTo(-1.6, t.h * 0.2 + 1.6); ctx.lineTo(-6, t.h * 0.2); ctx.lineTo(-1.6, t.h * 0.2 - 1.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(58,39,71,0.55)'; ctx.stroke(p);
    if (d.food && !d.gone) drawFood(ctx, d.food, t);
    ctx.restore();
  }
}
function drawFood(ctx, f, t) {
  const y = t.up ? t.h - 3 : 3, x = f.dx;
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
  if (f.kind === 'leaf') { // a scrap of spinach
    const p = new Path2D(`M ${x - 6} ${y} Q ${x - 2} ${y - 6} ${x + 6} ${y - 1} Q ${x + 1} ${y + 5} ${x - 6} ${y} Z`);
    ctx.fillStyle = '#3f9a3a'; ctx.fill(p); ctx.stroke(p);
  } else if (f.kind === 'seed') { // a poppy or berry seed
    ell(ctx, x, y, 2.4, 1.6, 0.4); ctx.fillStyle = '#3a2747'; ctx.fill();
    ell(ctx, x + 4, y - 3, 2, 1.4, -0.3); ctx.fill();
  } else { // a crumb
    ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x - 1, y - 3); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x + 3, y + 3); ctx.closePath();
    ctx.fillStyle = '#e8b45c'; ctx.fill(); ctx.stroke();
  }
}
// how much brushing is left: plaque plus the food bits
export function grime(s) { return s.dent.reduce((a, d) => a + (d.gone ? 0 : d.plaque + (d.food ? 1 : 0)), 0); }
