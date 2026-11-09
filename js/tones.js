// Colours worked out from a person's own skin and hair, so their outlines and details sit
// in their own tones instead of one heavy ink line: a warm dark outline from the skin, a
// lighter one for creases and nostrils, lip shades, and the hair's own dark and light.
import { mixHex } from './draw.js';

export const LASH = '#2b1b2c'; // lash lines and pupils stay nearly black
export const OL = 3.6; // outline width for people (the props keep their bolder ink)

const skins = new WeakMap();
export function toneOf(sk) {
  let t = skins.get(sk);
  if (t) return t;
  t = {
    ink: mixHex(sk.deep, '#2a1626', 0.62), // outline of the face, ears, neck
    line: mixHex(sk.deep, '#2a1626', 0.3), // creases, nostrils, lids
    light: mixHex(sk.base, '#ffffff', 0.22),
    lid: mixHex(sk.base, sk.shade, 0.5),
    warm: mixHex(sk.base, '#ff6f7d', 0.32),
    mouth: mixHex(sk.lip, '#2a1626', 0.6),
    lipDeep: mixHex(sk.lip, sk.deep, 0.45),
  };
  skins.set(sk, t);
  return t;
}

const hairs = new Map();
export function hairTone(c, hi) {
  const key = c + hi;
  let t = hairs.get(key);
  if (t) return t;
  t = {
    ink: mixHex(c, '#2a1626', 0.58), // outline
    dark: mixHex(c, '#120a12', 0.32), // roots, strand shadows
    mid: mixHex(c, hi, 0.35), // the lit side
    hi,
  };
  if (hairs.size > 200) hairs.clear();
  hairs.set(key, t);
  return t;
}
