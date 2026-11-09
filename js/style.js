// Style tools: hair colour, lipstick, blush, piercings and face gems. Each unlocks at its
// own level. A patient can come in wanting a look (a wish, see rollWish): it sits in their
// order like a treatment and scores by how close the result is (wishScore). Otherwise the
// tools are free to play with between treatments. Everything lives on the patient's
// state (s.dye, s.lips, s.blush, s.pierced, s.gems), so the "before" patient on the
// results screen keeps their own look.
//   Colour tools (dye, lips, blush): pick a swatch, rub it in; it blends in as you rub.
//   Piercing: tap the head to add one, tap it again to take it out. Ones the patient
//             didn't ask for cost aura: a little on the usual spots (ears, nose, brows,
//             lip), more anywhere else.
//   Face gems: tap the face to stick one on (star, heart, diamond in turn), tap it again
//             to peel it off.
import { INK, ell, TAU, mixHex } from './draw.js';

// the colours on offer per tool; 'natural' brings back the patient's own
export const PALETTES = {
  dye: [
    { id: 'natural', name: 'Natural' },
    { id: 'pink', name: 'Pink', c: '#ff6fb5', hi: '#ffc2df' },
    { id: 'blue', name: 'Blue', c: '#4f93ff', hi: '#acd0ff' },
    { id: 'mint', name: 'Mint', c: '#3fd6a6', hi: '#b4f5e2' },
    { id: 'purple', name: 'Purple', c: '#8752e0', hi: '#c9aaff' },
    { id: 'red', name: 'Red', c: '#e8384f', hi: '#ff9aa8' },
    { id: 'platinum', name: 'Platinum', c: '#efe9dc', hi: '#ffffff' },
  ],
  lips: [
    { id: 'natural', name: 'Natural' },
    { id: 'red', name: 'Red', c: '#e0284f', hi: '#ff8aa0' },
    { id: 'pink', name: 'Pink', c: '#ff5fa2', hi: '#ffb3d4' },
    { id: 'coral', name: 'Coral', c: '#ff7a59', hi: '#ffbca8' },
    { id: 'plum', name: 'Plum', c: '#8e3a8e', hi: '#d39ad3' },
    { id: 'berry', name: 'Berry', c: '#b0245e', hi: '#f08ab4' },
  ],
  blush: [
    { id: 'natural', name: 'None' },
    { id: 'pink', name: 'Pink', c: '#ff7fb0', hi: '#ffc4dc' },
    { id: 'peach', name: 'Peach', c: '#ff9f7a', hi: '#ffd2c0' },
    { id: 'rose', name: 'Rose', c: '#ff5d7d', hi: '#ffb0bf' },
    { id: 'lilac', name: 'Lilac', c: '#c08bff', hi: '#e6d2ff' },
    { id: 'gold', name: 'Gold', c: '#ffc95e', hi: '#fff0c4' },
  ],
};
// head units of rubbing to fully take a new colour
const RUB = { dye: 650, lips: 260, blush: 380 };
export const rubLength = (id) => RUB[id];
// a colour's {c, hi}; the natural one is this patient's own (no blush: none at all)
function ownColour(s, id, d) {
  if (d.id !== 'natural') return { c: d.c, hi: d.hi };
  if (id === 'dye') return { c: s.who.hair, hi: s.who.hairHi };
  if (id === 'lips') { const c = s.who.lip || s.who.skin.lip; return { c, hi: c }; }
  return { c: '#ffffff', hi: '#ffffff', none: true };
}
// the swatches as this patient sees them (natural is their own)
export function swatchesFor(s, id) {
  return PALETTES[id].map((d) => ({ id: d.id, name: d.name, ...ownColour(s, id, d) }));
}

// a colour tool's paint right now: { c, hi, a } (a: how strong, 0..1), or null while the
// patient has their own look
export function paintNow(s, id) {
  const p = s[id];
  if (!p) return null;
  return { c: mixHex(p.from.c, p.to.c, p.t), hi: mixHex(p.from.hi, p.to.hi, p.t), a: p.fromA + (p.toA - p.fromA) * p.t };
}
export function hairNow(s) { return paintNow(s, 'dye') || { c: s.who.hair, hi: s.who.hairHi }; }
// start blending toward a new colour from whatever shows now
export function setPaint(s, id, swatchId) {
  const d = PALETTES[id].find((x) => x.id === swatchId), to = ownColour(s, id, d);
  const now = paintNow(s, id) || { ...ownColour(s, id, PALETTES[id][0]), a: id === 'blush' ? 0 : 1 };
  // blush has no colour of its own: it fades in from nothing in the new colour, and back out
  const from = now.a <= 0 ? to : now;
  s[id] = { id: swatchId, from: { c: from.c, hi: from.hi }, to: { c: to.c, hi: to.hi }, fromA: now.a, toA: to.none ? 0 : 1, t: 0 };
}
// where rubbing counts (head space) for each colour tool
export function onPaint(id, x, y) {
  if (id === 'dye') {
    if (Math.hypot(x / 1.05, (y + 30) / 1.12) > 255) return false;
    return y < -70 || Math.abs(x) > 118; // the crown and the sides, not the face
  }
  if (id === 'lips') return (x / 46) ** 2 + ((y - 126) / 26) ** 2 <= 1;
  return ((Math.abs(x) - 96) / 52) ** 2 + ((y - 68) / 40) ** 2 <= 1; // a cheek
}

// ---------- piercings ----------
export const PIERCE = { usual: 3, odd: 10, max: 12 };
const EAR = { x: 150, y: 36, rx: 25, ry: 38 };
// the usual spots (right side; mirrored for the left), each with the jewellery it gets
const USUAL = [
  { x: 16, y: 80, r: 12, ring: true, spot: 'nose' }, // nostril
  { x: 0, y: 92, r: 8, ring: true, spot: 'nose' }, // septum
  { x: 86, y: -52, r: 18, ring: false, spot: 'brow' }, // eyebrow
  { x: 0, y: 140, r: 13, ring: true, spot: 'lip' }, // lip, centre
  { x: 30, y: 132, r: 11, ring: true, spot: 'lip' }, // lip, side
  { x: 30, y: 104, r: 10, ring: false, spot: 'lip' }, // above the lip
];
export const SPOTS = ['ear', 'nose', 'brow', 'lip'];
const inEar = (x, y) => ((Math.abs(x) - EAR.x) / EAR.rx) ** 2 + ((y - EAR.y) / EAR.ry) ** 2 <= 1;
const inHead = (x, y) => (x / 156) ** 2 + ((y + 4) / 206) ** 2 <= 1;
// a piercing at head-space (x, y), or null when that is off the head
export function pierceSpot(x, y) {
  if (inEar(x, y)) return { x, y, cost: PIERCE.usual, ring: y > EAR.y + 16, spot: 'ear' };
  if (!inHead(x, y)) return null;
  for (const u of USUAL) {
    for (const side of u.x ? [-1, 1] : [1]) {
      if (Math.hypot(x - u.x * side, y - u.y) <= u.r) return { x, y, cost: PIERCE.usual, ring: u.ring, spot: u.spot };
    }
  }
  return { x, y, cost: PIERCE.odd, ring: false, spot: null };
}
// a spot of each kind, for the scripted test run
export const SPOT_AT = { ear: { x: 150, y: 60 }, nose: { x: 16, y: 80 }, brow: { x: 86, y: -52 }, lip: { x: 0, y: 140 } };
export const pierceCost = (s) => s.pierced.reduce((a, p) => a + p.cost, 0);

// ---------- face gems ----------
export const GEMS = { max: 8, kinds: ['star', 'heart', 'diamond'] };
const GEM_COL = { star: ['#ffd25e', '#fff3c4'], heart: ['#ff6fb5', '#ffc2df'], diamond: ['#6fd3ff', '#d8f4ff'] };

// ---------- wishes ----------
// a look the patient asks for with an open style tool: a colour, a spot, a count
export function rollWish(id) {
  const pick = (a) => a[(Math.random() * a.length) | 0];
  if (id === 'pierce') return { id, want: pick(SPOTS) };
  if (id === 'gems') return { id, want: 2 + ((Math.random() * 3) | 0) };
  return { id, want: pick(PALETTES[id].filter((d) => d.id !== 'natural')).id };
}
const colourName = (w) => PALETTES[w.id].find((d) => d.id === w.want).name.toUpperCase();
// what they ask for when they sit down
export function wishLine(w) {
  if (w.id === 'pierce') return `${w.want.toUpperCase()} PIERCING PLEASE!`;
  if (w.id === 'gems') return `${w.want} FACE GEMS PLEASE!`;
  return `${colourName(w)} ${{ dye: 'HAIR', lips: 'LIPS', blush: 'BLUSH' }[w.id]} PLEASE!`;
}
// the prompt while the wished tool is out
export function wishPrompt(w) {
  if (w.id === 'pierce') return `PIERCE THE ${w.want.toUpperCase()}`;
  if (w.id === 'gems') return `STICK ${w.want} GEMS`;
  return `${{ dye: 'DYE IT', lips: 'LIPS', blush: 'BLUSH' }[w.id]} ${colourName(w)}`;
}
// the colour dot (colour wishes) or the number (gems, pierce spot) on the wish's badge
export function wishMark(w) {
  if (PALETTES[w.id]) return { dot: PALETTES[w.id].find((d) => d.id === w.want).c };
  if (w.id === 'gems') return { tag: String(w.want) };
  return { tag: w.want.toUpperCase() };
}
// whether this tool has done anything to the patient yet (an untouched wish isn't scored)
export function touched(s, id) {
  if (PALETTES[id]) return !!s[id] && s[id].t > 0.02;
  if (id === 'pierce') return s.pierced.length > 0;
  return s.gems.length > 0;
}
// how close the look is to the wish, 0..100, and a verdict for the stamp
export function wishScore(s, w) {
  let score;
  if (PALETTES[w.id]) {
    const p = s[w.id], t = p ? p.t : 0;
    score = Math.round((p && p.id === w.want ? 100 : 35) * t);
  } else if (w.id === 'pierce') {
    score = s.pierced.some((p) => p.spot === w.want) ? 100 : s.pierced.length && s.pierced.every((p) => p.spot) ? 40 : 15;
  } else score = Math.max(0, 100 - 30 * Math.abs(s.gems.length - w.want));
  return { score, verdict: score >= 95 ? 'perfect' : score >= 80 ? 'good' : 'messy' };
}

// ---------- drawing ----------
const SILVER = '#e3e8f4';
export function drawPierced(ctx, s) {
  if (!s.pierced.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of s.pierced) {
    if (p.ring) {
      // a little hoop through the skin, hanging from the spot
      const r = p.spot === 'ear' ? 8.5 : 7;
      ctx.beginPath(); ctx.arc(p.x, p.y + r, r, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + TAU);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = SILVER; ctx.stroke();
    }
    // the stud (or the bead where the ring goes in)
    ell(ctx, p.x, p.y, 5.4, 5.4); ctx.fillStyle = SILVER; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, p.x - 1.6, p.y - 1.7, 1.7, 1.7); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
}
// one gem centred at (0, 0)
export function drawGem(ctx, kind, r = 9) {
  const [c, hi] = GEM_COL[kind];
  const p = new Path2D();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, R = i % 2 ? r * 0.5 : r * 1.2;
      if (i) p.lineTo(Math.cos(a) * R, Math.sin(a) * R); else p.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    p.closePath();
  } else if (kind === 'heart') {
    p.moveTo(0, r);
    p.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.7, -r * 1.3, 0, -r * 0.45);
    p.bezierCurveTo(r * 0.7, -r * 1.3, r * 1.6, -r * 0.1, 0, r);
  } else {
    p.moveTo(0, -r * 1.15); p.lineTo(r * 0.85, 0); p.lineTo(0, r * 1.15); p.lineTo(-r * 0.85, 0); p.closePath();
  }
  ctx.lineJoin = 'round';
  ctx.fillStyle = c; ctx.fill(p);
  ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke(p);
  ell(ctx, -r * 0.3, -r * 0.35, r * 0.24, r * 0.16, -0.5); ctx.fillStyle = hi; ctx.fill();
}
export function drawGems(ctx, s) {
  for (const g of s.gems) { ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot); drawGem(ctx, g.kind); ctx.restore(); }
}
