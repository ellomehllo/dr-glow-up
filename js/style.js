// Style tools: hair colour and piercings. Neither is a treatment: they sit in their own
// row of the kit, can be used between treatments as often as the player likes, and are
// not part of the level's order. Both live on the patient's state (s.dye, s.pierced),
// so the "before" patient on the results screen keeps their own hair and no piercings.
//   Hair colour: pick a dye, rub it into the hair; the colour blends in as you rub.
//   Piercing:    tap anywhere on the head to add one, tap it again to take it out.
//                Each one costs aura: a little on the usual spots (ears, nose, brows,
//                lip), more anywhere else.
import { INK, ell, TAU } from './draw.js';

// the dyes on offer; 'natural' brings back the patient's own colour
export const DYES = [
  { id: 'natural', name: 'Natural' },
  { id: 'pink', name: 'Pink', c: '#ff6fb5', hi: '#ffc2df' },
  { id: 'blue', name: 'Blue', c: '#4f93ff', hi: '#acd0ff' },
  { id: 'mint', name: 'Mint', c: '#3fd6a6', hi: '#b4f5e2' },
  { id: 'purple', name: 'Purple', c: '#8752e0', hi: '#c9aaff' },
  { id: 'red', name: 'Red', c: '#e8384f', hi: '#ff9aa8' },
  { id: 'platinum', name: 'Platinum', c: '#efe9dc', hi: '#ffffff' },
];
export const DYE_RUB = 650; // head units of rubbing to fully take a new colour

// mix two #rrggbb colours into another #rrggbb
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (const sh of [16, 8, 0]) {
    const x = (pa >> sh) & 255, y = (pb >> sh) & 255;
    out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  }
  return out;
}
// a dye's colours; the natural one is this patient's own
export function dyeColours(s, d) { return d.id === 'natural' ? { c: s.who.hair, hi: s.who.hairHi } : { c: d.c, hi: d.hi }; }
// the hair colour showing right now
export function hairNow(s) {
  const d = s.dye;
  if (!d) return { c: s.who.hair, hi: s.who.hairHi };
  return { c: mixHex(d.from.c, d.to.c, d.t), hi: mixHex(d.from.hi, d.to.hi, d.t) };
}
// start a new dye from whatever colour the hair is now
export function setDye(s, d) { s.dye = { id: d.id, from: hairNow(s), to: dyeColours(s, d), t: 0 }; }
// where rubbing counts as rubbing the hair (head space): the crown and the sides,
// not the middle of the face
export function onHair(x, y) {
  if (Math.hypot(x / 1.05, (y + 30) / 1.12) > 255) return false;
  return y < -70 || Math.abs(x) > 118;
}

// ---------- piercings ----------
export const PIERCE = { usual: 3, odd: 10, max: 12 };
const EAR = { x: 150, y: 36, rx: 25, ry: 38 };
// the usual spots (right side; mirrored for the left), each with the jewellery it gets
const USUAL = [
  { x: 16, y: 80, r: 12, ring: true }, // nostril
  { x: 0, y: 92, r: 8, ring: true }, // septum
  { x: 86, y: -52, r: 18, ring: false }, // eyebrow
  { x: 0, y: 140, r: 13, ring: true }, // lip, centre
  { x: 30, y: 132, r: 11, ring: true }, // lip, side
  { x: 30, y: 104, r: 10, ring: false }, // above the lip
];
const inEar = (x, y) => ((Math.abs(x) - EAR.x) / EAR.rx) ** 2 + ((y - EAR.y) / EAR.ry) ** 2 <= 1;
const inHead = (x, y) => (x / 156) ** 2 + ((y + 4) / 206) ** 2 <= 1;
// a piercing at head-space (x, y), or null when that is off the head
export function pierceSpot(x, y) {
  if (inEar(x, y)) return { x, y, cost: PIERCE.usual, ring: y > EAR.y + 16, ear: true };
  if (!inHead(x, y)) return null;
  for (const u of USUAL) {
    for (const side of u.x ? [-1, 1] : [1]) {
      if (Math.hypot(x - u.x * side, y - u.y) <= u.r) return { x, y, cost: PIERCE.usual, ring: u.ring };
    }
  }
  return { x, y, cost: PIERCE.odd, ring: false };
}
export const pierceCost = (s) => s.pierced.reduce((a, p) => a + p.cost, 0);

const SILVER = '#e3e8f4';
export function drawPierced(ctx, s) {
  if (!s.pierced.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of s.pierced) {
    if (p.ring) {
      // a little hoop through the skin, hanging from the spot
      const r = p.ear ? 8.5 : 7;
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
