// What a tool does when it lands where there is nothing for it to treat: the real thing,
// small and harmless, instead of a hurt (used by Tool.freeSpot). q: the press in head
// space, with its stage position (sx, sy).
import { rand } from '../draw.js';
import { onFace, eyeSide, addBald } from '../patient.js';
import { onPaint } from '../style.js';

// the hair: above the forehead, or out at the sides past the face
export const onHair = (x, y) => onPaint('dye', x, y) && (y < -168 || !onFace(x, y, -10));
// over either eyebrow
export const onBrow = (x, y) => Math.abs(x) > 22 && Math.abs(x) < 104 && y > -58 && y < -16;
export const onSkin = (g, q) => onFace(q.x, q.y) && eyeSide(g.s, q.x, q.y) < 0;

// a squeeze or a pinch: the skin goes pink for a moment
export function pinch(g, q) {
  g.fx.ring(q.sx, q.sy, 4, 26, 0.3, '#ff9fb8', 4);
  g.s.flush = Math.max(g.s.flush, 0.5);
  g.react('squeeze', 0.35, 'flat');
  g.audio.tink(0.8);
}
// what a tool really does to bare skin it lands on: a mark that fades (a bruise from the
// mallet, a graze from the drill, a red patch from the hot iron), a wince; it costs no aura
export function mark(g, q, kind, text) {
  const s = g.s;
  s.hurts.push({ x: q.x, y: q.y, kind, t: 0 }); if (s.hurts.length > 16) s.hurts.shift();
  s.flush = Math.max(s.flush, 0.6); s.pain += 0.4;
  g.fx.ring(q.sx, q.sy, 4, 30, 0.32, '#ff7d9a', 4);
  if (text) g.fx.text(q.sx, q.sy - 34, text, '#ffffff', 22, 0.8);
  g.react('squeeze', 0.7, 'wince');
  g.audio.nick();
}
// a dab of something soothing (gel, a cool slice, steam): sparkles, a happy face
export function dab(g, q, col = '#3fe0b5', puff = false) {
  if (puff) g.fx.puff(q.sx, q.sy, 2, '255,255,255');
  for (let k = 0; k < 4; k++) g.fx.spark(q.sx + rand(-14, 14), q.sy + rand(-14, 14), { size: rand(7, 11), col, vy: -50, life: 0.45 });
  g.react('happy', 0.5, 'flat');
  g.audio.tick();
}
// a hair pulled out (scalp) or a brow hair plucked (thinner brows): a strand flies off
export function pluck(g, q) {
  const s = g.s, brow = onBrow(q.x, q.y);
  if (!brow && !onHair(q.x, q.y)) return false;
  if (brow) {
    const k = q.x < 0 ? 'browL' : 'browR';
    s[k] = Math.max(0.3, s[k] - 0.12);
  } else addBald(s, q.x, q.y, 11, 'pluck'); // the scalp: a little bald patch that grows with every pluck
  g.fx.text(q.sx, q.sy - 30, 'PLUCK!', '#ffffff', 20, 0.7);
  g.fx.spark(q.sx, q.sy, { size: 8, col: s.who.hair, vy: -160, life: 0.5 });
  g.react('squeeze', 0.45, 'wince');
  s.flush = Math.max(s.flush, 0.35);
  g.audio.pop(1.6);
  return true;
}
