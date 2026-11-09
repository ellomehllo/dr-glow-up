// Style tools: hair colour, lipstick, blush, glitter, eyeshadow, freckles, mascara, brow
// tint, highlighter (colour tools), and piercings, face gems, hair clips and sunglasses
// (tap tools). Each unlocks at its
// own level. A patient can come in wanting a look (a wish, see rollWish): it sits in their
// order like a treatment and scores by how close the result is (wishScore). Otherwise the
// tools are free to play with between treatments. Everything lives on the patient's
// state (s.dye, s.lips, s.blush, ..., s.pierced, s.gems, s.clips, s.shades), so the
// "before" patient on the results screen keeps their own look.
//   Colour tools: pick a swatch, rub it in; it blends in as you rub.
//   Piercing: tap the head to add one, tap it again to take it out. Ones the patient
//             didn't ask for cost aura: a little on the usual spots (ears, nose, brows,
//             lip), more anywhere else.
//   Face gems: tap the face to stick one on (star, heart, diamond in turn), tap it again
//             to peel it off.
//   Hair clips: the same on the hair (bow, star, heart in turn).
//   Sunglasses: tap the eyes to put a pair on; each tap tries the next frame, then off.
import { INK, ell, TAU, mixHex, soft } from './draw.js';

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
  glitter: [
    { id: 'natural', name: 'None' },
    { id: 'gold', name: 'Gold', c: '#ffc93c', hi: '#fff3c4' },
    { id: 'silver', name: 'Silver', c: '#cfd8ea', hi: '#ffffff' },
    { id: 'pink', name: 'Pink', c: '#ff6fb5', hi: '#ffd0e6' },
    { id: 'holo', name: 'Holo', c: '#b48cff', hi: '#d8fff4' },
    { id: 'blue', name: 'Blue', c: '#4fb6ff', hi: '#d2efff' },
  ],
  shadow: [
    { id: 'natural', name: 'None' },
    { id: 'pink', name: 'Pink', c: '#ff7fb0', hi: '#ffc4dc' },
    { id: 'purple', name: 'Purple', c: '#9a5ce6', hi: '#d6b8ff' },
    { id: 'blue', name: 'Blue', c: '#4f8fff', hi: '#b8d4ff' },
    { id: 'gold', name: 'Gold', c: '#e8b23c', hi: '#fff0b8' },
    { id: 'smoky', name: 'Smoky', c: '#5a4a66', hi: '#a596b4' },
  ],
  freckles: [
    { id: 'natural', name: 'None' },
    { id: 'brown', name: 'Brown', c: '#9a5a36', hi: '#c98a62' },
    { id: 'ginger', name: 'Ginger', c: '#d9773a', hi: '#f2a874' },
    { id: 'pink', name: 'Pink', c: '#ff7f9e', hi: '#ffc0cf' },
    { id: 'gold', name: 'Gold', c: '#e6b34a', hi: '#fff0b8' },
  ],
  lashes: [
    { id: 'natural', name: 'None' },
    { id: 'black', name: 'Black', c: '#1b1218', hi: '#4a3a48' },
    { id: 'blue', name: 'Blue', c: '#3a63e0', hi: '#8fb0ff' },
    { id: 'purple', name: 'Purple', c: '#7a3fd0', hi: '#c0a0ff' },
    { id: 'pink', name: 'Pink', c: '#ff4fa0', hi: '#ffb0d4' },
  ],
  brows: [
    { id: 'natural', name: 'Natural' },
    { id: 'black', name: 'Black', c: '#2a1e1e', hi: '#5a4646' },
    { id: 'brown', name: 'Brown', c: '#6b4128', hi: '#a0735a' },
    { id: 'blonde', name: 'Blonde', c: '#d9b061', hi: '#f6dfa8' },
    { id: 'pink', name: 'Pink', c: '#ff6fb5', hi: '#ffc2df' },
    { id: 'blue', name: 'Blue', c: '#4f93ff', hi: '#acd0ff' },
  ],
  highlight: [
    { id: 'natural', name: 'None' },
    { id: 'pearl', name: 'Pearl', c: '#fff4e6', hi: '#ffffff' },
    { id: 'gold', name: 'Gold', c: '#ffd98a', hi: '#fff6dc' },
    { id: 'rose', name: 'Rose', c: '#ffc4d6', hi: '#fff0f5' },
    { id: 'lilac', name: 'Lilac', c: '#e3cfff', hi: '#f8f2ff' },
  ],
};
// head units of rubbing to fully take a new colour
const RUB = { dye: 650, lips: 260, blush: 380, glitter: 380, shadow: 220, freckles: 380, lashes: 200, brows: 240, highlight: 300 };
export const rubLength = (id) => RUB[id];
// where each colour tool's sparkle bursts once it has fully taken (head-space y)
export const PAINT_AT = { dye: -150, lips: 126, blush: 68, glitter: 68, shadow: 0, freckles: 60, lashes: 8, brows: -40, highlight: 36 };
// the colour tools a patient has a colour of their own for; the rest start as nothing
const OWN = new Set(['dye', 'lips', 'brows']);
// a colour's {c, hi}; the natural one is this patient's own (or, for makeup, none at all)
function ownColour(s, id, d) {
  if (d.id !== 'natural') return { c: d.c, hi: d.hi };
  if (id === 'dye') return { c: s.who.hair, hi: s.who.hairHi };
  if (id === 'lips') { const c = s.who.lip || s.who.skin.lip; return { c, hi: c }; }
  if (id === 'brows') return { c: s.who.brow, hi: s.who.brow };
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
  const now = paintNow(s, id) || { ...ownColour(s, id, PALETTES[id][0]), a: OWN.has(id) ? 1 : 0 };
  // makeup has no colour of its own: it fades in from nothing in the new colour, and back out
  const from = now.a <= 0 ? to : now;
  s[id] = { id: swatchId, from: { c: from.c, hi: from.hi }, to: { c: to.c, hi: to.hi }, fromA: now.a, toA: to.none ? 0 : 1, t: 0 };
}
// where rubbing counts (head space) for each colour tool
export function onPaint(id, x, y) {
  if (id === 'dye') {
    if (Math.hypot(x / 1.05, (y + 30) / 1.12) > 255) return false;
    return y < -70 || Math.abs(x) > 118; // the crown and the sides, not the face
  }
  const ax = Math.abs(x);
  if (id === 'lips') return (x / 46) ** 2 + ((y - 126) / 26) ** 2 <= 1;
  if (id === 'shadow') return ((ax - 58) / 42) ** 2 + ((y - 2) / 26) ** 2 <= 1; // the lids
  if (id === 'lashes') return ((ax - 58) / 40) ** 2 + ((y - 10) / 26) ** 2 <= 1; // the eyes
  if (id === 'brows') return ax > 18 && ax < 108 && y > -62 && y < -14;
  if (id === 'freckles') return (x / 130) ** 2 + ((y - 62) / 34) ** 2 <= 1; // across the nose
  if (id === 'highlight') return ((ax - 84) / 42) ** 2 + ((y - 38) / 24) ** 2 <= 1 || (ax < 16 && y > -12 && y < 72);
  return ((ax - 96) / 52) ** 2 + ((y - 68) / 40) ** 2 <= 1; // a cheek (blush, glitter)
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

// ---------- hair clips ----------
export const CLIPS = { max: 6, kinds: ['bow', 'star', 'heart'] };
// ---------- sunglasses ----------
export const SHADES = [
  { id: 'round', name: 'Round' },
  { id: 'star', name: 'Star' },
  { id: 'heart', name: 'Heart' },
  { id: 'cat', name: 'Cat-eye' },
];
// the next pair after this one (null: none on, after the last)
export function nextShades(id) {
  const k = SHADES.findIndex((d) => d.id === id);
  return k + 1 < SHADES.length ? SHADES[k + 1].id : null;
}
// a tap over the eyes (or the brow line between them), where the shades go
export const onEyes = (x, y) => Math.abs(x) < 104 && y > -26 && y < 48;

// ---------- wishes ----------
// a look the patient asks for with an open style tool: a colour, a spot, a count
export function rollWish(id) {
  const pick = (a) => a[(Math.random() * a.length) | 0];
  if (id === 'pierce') return { id, want: pick(SPOTS) };
  if (id === 'gems') return { id, want: 2 + ((Math.random() * 3) | 0) };
  if (id === 'clips') return { id, want: 1 + ((Math.random() * 3) | 0) };
  if (id === 'shades') return { id, want: pick(SHADES).id };
  return { id, want: pick(PALETTES[id].filter((d) => d.id !== 'natural')).id };
}
const colourName = (w) => PALETTES[w.id].find((d) => d.id === w.want).name.toUpperCase();
const shadesName = (id) => SHADES.find((d) => d.id === id).name.toUpperCase();
// what each colour tool is called in a wish, and in its prompt
const NOUN = { dye: 'HAIR', lips: 'LIPS', blush: 'BLUSH', glitter: 'GLITTER', shadow: 'EYESHADOW', freckles: 'FRECKLES', lashes: 'LASHES', brows: 'BROWS', highlight: 'GLOW' };
const VERB = { dye: 'DYE IT', lips: 'LIPS', blush: 'BLUSH', glitter: 'GLITTER', shadow: 'SHADOW', freckles: 'FRECKLES', lashes: 'MASCARA', brows: 'TINT BROWS', highlight: 'HIGHLIGHT' };
// what they ask for when they sit down
export function wishLine(w) {
  if (w.id === 'pierce') return `${w.want.toUpperCase()} PIERCING PLEASE!`;
  if (w.id === 'gems') return `${w.want} FACE GEMS PLEASE!`;
  if (w.id === 'clips') return w.want > 1 ? `${w.want} HAIR CLIPS PLEASE!` : 'A HAIR CLIP PLEASE!';
  if (w.id === 'shades') return `${shadesName(w.want)} SHADES PLEASE!`;
  return `${colourName(w)} ${NOUN[w.id]} PLEASE!`;
}
// the prompt while the wished tool is out
export function wishPrompt(w) {
  if (w.id === 'pierce') return `PIERCE THE ${w.want.toUpperCase()}`;
  if (w.id === 'gems') return `STICK ${w.want} GEMS`;
  if (w.id === 'clips') return `CLIP IN ${w.want}`;
  if (w.id === 'shades') return `TAP FOR ${shadesName(w.want)}`;
  return `${VERB[w.id]} ${colourName(w)}`;
}
// the colour dot (colour wishes) or the number / word (gems, clips, pierce spot, shades)
// on the wish's badge
export function wishMark(w) {
  if (PALETTES[w.id]) return { dot: PALETTES[w.id].find((d) => d.id === w.want).c };
  if (w.id === 'gems' || w.id === 'clips') return { tag: String(w.want) };
  return { tag: w.want.toUpperCase() };
}
// whether this tool has done anything to the patient yet (an untouched wish isn't scored)
export function touched(s, id) {
  if (PALETTES[id]) return !!s[id] && s[id].t > 0.02;
  if (id === 'pierce') return s.pierced.length > 0;
  if (id === 'clips') return s.clips.length > 0;
  if (id === 'shades') return !!s.shades;
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
  } else if (w.id === 'shades') score = s.shades === w.want ? 100 : s.shades ? 45 : 0;
  else score = Math.max(0, 100 - 30 * Math.abs((w.id === 'clips' ? s.clips : s.gems).length - w.want));
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

// ---------- makeup on the face ----------
// fixed spots so the dots don't jump around between frames (head space)
const seeded = (n, f) => { let k = 7; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647); return Array.from({ length: n }, () => f(r)); };
const FRECKLES = seeded(26, (r) => { const side = r() < 0.5 ? -1 : 1, t = r(); return { x: side * (14 + t * 104), y: 50 + r() * 30 - t * 10 + (t < 0.12 ? -10 : 0), r: 1.8 + r() * 1.6 }; });
const GLITTER = seeded(30, (r) => { const side = r() < 0.5 ? -1 : 1, a = r() * TAU, d = Math.sqrt(r()); return { x: side * 96 + Math.cos(a) * 46 * d, y: 68 + Math.sin(a) * 32 * d, r: 1.6 + r() * 2.2, ph: r() * TAU, star: r() < 0.25 }; });
// eyeshadow on the lids: drawn before the eyes, so it shows above them
export function drawShadow(ctx, s) {
  const p = paintNow(s, 'shadow');
  if (!p || p.a < 0.01) return;
  for (const side of [-1, 1]) {
    soft(ctx, side * 60, -2, 44, 24, p.c, 0.85 * p.a);
    soft(ctx, side * 70, -8, 22, 10, p.hi, 0.5 * p.a);
  }
}
// freckles, highlighter and glitter, over the blush
export function drawMakeup(ctx, s, time) {
  const f = paintNow(s, 'freckles');
  if (f && f.a > 0.01) {
    ctx.fillStyle = f.c; ctx.globalAlpha = 0.8 * f.a;
    for (const d of FRECKLES) { ell(ctx, d.x, d.y, d.r, d.r * 0.85); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const h = paintNow(s, 'highlight');
  if (h && h.a > 0.01) {
    for (const side of [-1, 1]) { soft(ctx, side * 84, 38, 36, 15, h.c, 0.85 * h.a, side * -0.25); soft(ctx, side * 80, 34, 14, 6, h.hi, 0.9 * h.a); }
    soft(ctx, 0, 30, 7, 30, h.hi, 0.75 * h.a);
  }
  const g = paintNow(s, 'glitter');
  if (g && g.a > 0.01) {
    for (const d of GLITTER) {
      const tw = 0.55 + 0.45 * Math.sin(time * 4 + d.ph);
      ctx.globalAlpha = g.a * (0.6 + 0.4 * tw);
      if (d.star) {
        const r = d.r * 1.8 * tw + 1;
        ctx.fillStyle = g.hi; ctx.beginPath();
        ctx.moveTo(d.x, d.y - r); ctx.quadraticCurveTo(d.x, d.y, d.x + r, d.y); ctx.quadraticCurveTo(d.x, d.y, d.x, d.y + r);
        ctx.quadraticCurveTo(d.x, d.y, d.x - r, d.y); ctx.quadraticCurveTo(d.x, d.y, d.x, d.y - r); ctx.fill();
      } else { ell(ctx, d.x, d.y, d.r, d.r); ctx.fillStyle = tw > 0.8 ? g.hi : g.c; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- clips and shades ----------
const CLIP_COL = { bow: ['#ff6fb5', '#ffc2df'], star: ['#ffd25e', '#fff3c4'], heart: ['#b48cff', '#e3d2ff'] };
// one clip centred at (0, 0): a bow, or a star or heart on a little bar
export function drawClip(ctx, kind) {
  const [c, hi] = CLIP_COL[kind];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'bow') {
    const p = new Path2D('M0 0 C-6 -12 -22 -14 -20 0 C-22 14 -6 12 0 0 C6 -12 22 -14 20 0 C22 14 6 12 0 0 Z');
    ctx.fillStyle = c; ctx.fill(p); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke(p);
    ell(ctx, 0, 0, 4.5, 5.5); ctx.fillStyle = hi; ctx.fill(); ctx.stroke();
    ell(ctx, -12, -4, 3.5, 2, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    return;
  }
  ctx.beginPath(); ctx.roundRect(-16, -2.5, 32, 5, 2.5); ctx.fillStyle = '#e3e8f4'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.save(); ctx.translate(6, -1); drawGem(ctx, kind === 'star' ? 'star' : 'heart', 8.5); ctx.restore();
}
export function drawClips(ctx, s) {
  for (const c of s.clips) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); drawClip(ctx, c.kind); ctx.restore(); }
}
// sunglasses over both eyes (eye centres at +-ex, ey; e: eye size)
export function drawShades(ctx, kind, ex, ey, e = 1) {
  if (!kind) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const R = 28 * Math.max(1, e), lens = new Path2D();
  for (const side of [-1, 1]) {
    const x = side * ex, y = ey;
    if (kind === 'round') lens.ellipse(x, y, R, R * 0.92, 0, 0, TAU);
    else if (kind === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.62 : R * 1.22;
        if (i) lens.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else lens.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      lens.closePath();
    } else if (kind === 'heart') {
      lens.moveTo(x, y + R * 1.02);
      lens.bezierCurveTo(x - R * 1.7, y - R * 0.05, x - R * 0.75, y - R * 1.35, x, y - R * 0.45);
      lens.bezierCurveTo(x + R * 0.75, y - R * 1.35, x + R * 1.7, y - R * 0.05, x, y + R * 1.02);
    } else { // cat-eye: wide, swept up at the outer corner
      lens.moveTo(x - side * R * 0.95, y - R * 0.35);
      lens.quadraticCurveTo(x, y - R * 0.75, x + side * R * 1.25, y - R * 0.95);
      lens.quadraticCurveTo(x + side * R * 1.05, y + R * 0.85, x, y + R * 0.75);
      lens.quadraticCurveTo(x - side * R * 1.05, y + R * 0.6, x - side * R * 0.95, y - R * 0.35);
      lens.closePath();
    }
  }
  const frame = { round: '#3a2747', star: '#ff6fb5', heart: '#ff3f7f', cat: '#9a5ce6' }[kind];
  ctx.fillStyle = 'rgba(30,20,40,0.82)'; ctx.fill(lens);
  // a shine across each lens
  ctx.save(); ctx.clip(lens);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * ex - R * 0.35, ey - R * 0.4, R * 0.5, R * 0.16, -0.6, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(lens);
  ctx.lineWidth = 3.6; ctx.strokeStyle = frame; ctx.stroke(lens);
  // the bridge
  ctx.beginPath(); ctx.moveTo(-ex + R * 0.7, ey - R * 0.25); ctx.quadraticCurveTo(0, ey - R * 0.6, ex - R * 0.7, ey - R * 0.25);
  ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.6; ctx.strokeStyle = frame; ctx.stroke();
  ctx.restore();
}
