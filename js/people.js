// Patients: the first patient of a session is the level's own (patientFor); after that
// they come in from the waiting room, each a new random character (pickKind) who keeps
// their look on a retry.
// Ten characters (goth, bodybuilder, bookworm, brainiac, foodie, punk, bully, gamer,
// glam, grandpa) plus regular patients in a clinic gown, dealt down the levels from a
// shuffled deck so everyone shows up before anyone repeats, and never the same kind
// twice in a row. Skin tone, hair colour and the rest come from the level's seed. A look is a plain object
// of colours and small choices that patient.js, hair.js and outfits.js draw from:
//   build      skinny | medium | chubby | broad | huge (shoulders, neck, arms)
//   face       {sx, sy} head proportions
//   style      hairstyle; hair / hairHi colour and sheen
//   eyeSize, lids (droop), liner, lashes, bags, brows, nose, lip, cheeks, glasses,
//   piercings, earring, mustache, wrinkles, blush, mouth (resting mouth)
//   outfit     {type, c, d, a, pat, print}; extra: headset | choker
// every random choice here goes through R, so a seed can stand in for Math.random
let R = Math.random;
const pick = (arr) => arr[(R() * arr.length) | 0];
const rand = (a, b) => a + R() * (b - a);
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKINS = [
  { base: '#ffe3d2', shade: '#f6c6ad', deep: '#e7a88a', lip: '#e57a86', freckle: '#d9906f' },
  { base: '#fbd3b5', shade: '#edb390', deep: '#d9946d', lip: '#d96b77', freckle: '#c98059' },
  { base: '#efbd93', shade: '#dd9f73', deep: '#c78457', lip: '#c9606a', freckle: '#b46e47' },
  { base: '#d79d6f', shade: '#c08155', deep: '#a8693f', lip: '#b0535a', freckle: '#94572f' },
  { base: '#b77a4f', shade: '#9f633d', deep: '#86502e', lip: '#94444c', freckle: '#74431f' },
  { base: '#8d5536', shade: '#774428', deep: '#61361e', lip: '#7a3239', freckle: '#5a311a' },
  { base: '#683d25', shade: '#56301c', deep: '#452515', lip: '#6a2a30', freckle: '#3e2112' },
];

// hair colours with a lighter sheen colour for highlights; w = how common
const NATURAL = [
  { c: '#18131b', hi: '#7f78a6', w: 5 }, // black, with a cool sheen so it reads on any skin
  { c: '#4a2f24', hi: '#94684f', w: 4 }, // dark brown
  { c: '#7b4b2d', hi: '#b98052', w: 3 }, // brown
  { c: '#b4532c', hi: '#e8905c', w: 2 }, // auburn
  { c: '#e5b35b', hi: '#fde4a6', w: 3 }, // blonde
];
const JET = NATURAL[0];
const DYE = {
  pink: { c: '#ff6fb5', hi: '#ffc2df', w: 1 }, blue: { c: '#4f93ff', hi: '#acd0ff', w: 1 },
  green: { c: '#62d64a', hi: '#b9f59f', w: 1 }, purple: { c: '#8752e0', hi: '#c9aaff', w: 1 },
  plum: { c: '#45225a', hi: '#a072c4', w: 1 },
};
const GREYS = [{ c: '#f1eef4', hi: '#ffffff', w: 2 }, { c: '#c7c3cf', hi: '#efedf3', w: 2 }, { c: '#9a96a5', hi: '#d6d3dd', w: 1 }];

const EYES = [
  { c: '#7a4a2a', d: '#4f2e19' }, { c: '#46302a', d: '#2a1b17' }, { c: '#9a7834', d: '#6a5020' },
  { c: '#47a565', d: '#2c7444' }, { c: '#4b98e0', d: '#2c69a8' }, { c: '#8496a9', d: '#5a6b7c' },
];

const GOWNS = [
  { c: '#bfe2ff', d: '#86bdf0', pat: 'dots' },
  { c: '#c6f2dc', d: '#86d6ae', pat: 'diamonds' },
  { c: '#e1d3ff', d: '#ad97ef', pat: 'dots' },
  { c: '#ffd5e4', d: '#f2a2c0', pat: 'diamonds' },
  { c: '#fff0b8', d: '#efcd6a', pat: 'dots' },
];

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
// far enough apart to tell hair from skin: a clear step in brightness, or a clearly different colour
function apart(a, b) {
  const p = rgb(a), q = rgb(b);
  return Math.abs(lum(a) - lum(b)) >= 0.18 || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) >= 90;
}
function weighted(list) {
  let r = R() * list.reduce((a, x) => a + (x.w || 1), 0);
  for (const x of list) { r -= x.w || 1; if (r <= 0) return x; }
  return list[list.length - 1];
}
// hair has to stand apart from the skin, or it reads as part of the head
function hairFor(skin, options) {
  const ok = options.filter((h) => apart(h.c, skin.base));
  if (ok.length) return weighted(ok);
  return lum(skin.base) < 0.6 ? JET : options.reduce((a, b) => (lum(a.c) < lum(b.c) ? a : b));
}

// mix two #rrggbb colours
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

// the ten characters: each returns the parts of the look that make them who they are
const CHARACTERS = {
  goth: () => ({
    build: 'skinny', face: { sx: 0.92, sy: 1.05 }, hairs: [JET, DYE.plum], style: 'straight',
    lids: 0.26, liner: true, lashes: true, brows: 'thin', nose: 'long', lip: '#4b2350', earring: 'silver',
    outfit: { type: 'goth', c: '#2b2433', d: '#1b1622', a: '#a274f0' }, extra: 'choker', mouth: 'flat',
  }),
  bodybuilder: () => ({
    build: 'huge', face: { sx: 1.08, sy: 0.98 }, hairs: NATURAL, style: 'buzz', eyeSize: 0.86, brows: 'thick', nose: 'wide',
    outfit: { type: 'tank', c: pick(['#ff6464', '#4d5470', '#ffc93c', '#3fbf8a']) },
  }),
  bookworm: () => ({
    build: 'skinny', face: { sx: 0.95, sy: 1.02 }, hairs: NATURAL, style: 'neat', eyeSize: 1.12, glasses: 'round', nose: 'button',
    freckles: R() < 0.7, outfit: { type: 'vest', c: pick(['#79b98a', '#b65a6c', '#5c7bc4']), a: '#e2463f' },
  }),
  brainiac: () => ({
    build: 'medium', face: { sx: 0.96, sy: 1.08 }, hairs: NATURAL, style: 'messy', glasses: 'square', nose: 'long',
    outfit: { type: 'turtleneck', c: pick(['#2e2a35', '#2f3a5c', '#5b3b4c']) },
  }),
  foodie: () => ({
    build: 'chubby', face: { sx: 1.13, sy: 0.97 }, cheeks: true, hairs: NATURAL, style: 'bun', eyeSize: 1.05, nose: 'button', blush: 0.22,
    outfit: { type: 'tee', c: pick(['#ffd95e', '#ff9f5a', '#8fd3ff', '#b6f08a']), print: 'donut' },
  }),
  punk: () => ({
    build: 'skinny', face: { sx: 0.94, sy: 1.03 }, hairs: [DYE.pink, DYE.green, DYE.blue, DYE.purple], style: 'mohawk',
    liner: true, brows: 'thin', piercings: true, earring: 'silver', darkBrows: true,
    outfit: { type: 'leather', c: '#2a2630', d: '#3d3745', a: pick(['#ff4d6d', '#ffffff', '#ffd23f']) },
  }),
  bully: () => ({
    build: 'broad', face: { sx: 1.08, sy: 1.0 }, hairs: NATURAL, style: 'slick', eyeSize: 0.86, brows: 'angry', nose: 'wide', mouth: 'smirk',
    outfit: { type: 'varsity', c: pick(['#d9434f', '#2f4a8a', '#2f8a5a', '#6b3fa0']), a: '#f4ead7' },
  }),
  gamer: () => ({
    build: 'skinny', face: { sx: 0.93, sy: 1.03 }, hairs: [...NATURAL, DYE.blue], style: 'locs', lids: 0.32, bags: true,
    outfit: { type: 'hoodie', c: pick(['#7c5cff', '#2fbf9b', '#ff7aa8', '#4d5470']), a: '#3dfcc3' }, extra: 'headset',
  }),
  glam: () => ({
    build: 'medium', face: { sx: 0.97, sy: 1.0 }, hairs: [...NATURAL, DYE.pink], style: 'wavy', eyeSize: 1.1, lashes: true, liner: true,
    brows: 'thin', lip: '#ff4f93', earring: 'hoop', blush: 0.18,
    outfit: { type: 'glam', c: pick(['#ff9ccc', '#c9a2ff', '#ffd36b', '#7fe0d0']) },
  }),
  grandpa: () => ({
    build: 'chubby', face: { sx: 1.04, sy: 1.0 }, hairs: GREYS, style: 'bald', brows: 'bushy', mustache: true, nose: 'wide', wrinkles: true,
    outfit: { type: 'cardigan', c: pick(['#c9a77c', '#9aa66b', '#9a4a5a', '#7d8fb8']), a: '#dcebff' },
  }),
};
const KINDS = Object.keys(CHARACTERS);
const PATIENT_KINDS = [...KINDS, 'regular'];

function regular() {
  return {
    build: pick(['skinny', 'medium', 'medium', 'chubby']), face: { sx: rand(0.95, 1.05), sy: rand(0.97, 1.04) },
    hairs: [...NATURAL, DYE.pink, DYE.blue], style: pick(['curly', 'afro', 'spiky', 'wavy', 'bob']),
    lashes: R() < 0.5, earring: R() < 0.4 ? 'gold' : null,
    outfit: { type: 'gown', ...pick(GOWNS) },
  };
}

// the kind of patient on each level: shuffled decks of all ten characters and two
// regular patients, dealt down the levels with no kind twice in a row
const SEQ = [];
{
  const D = seeded(20261109);
  while (SEQ.length < 120) {
    const deck = [...KINDS, 'regular', 'regular'];
    for (let i = deck.length - 1; i > 0; i--) { const j = (D() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
    for (let i = 0; i < deck.length; i++) {
      // no repeat of the one before: swap in a later card
      if (deck[i] === SEQ[SEQ.length - 1]) {
        const j = deck.findIndex((x, k) => k > i && x !== deck[i]);
        if (j > 0) [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      SEQ.push(deck[i]);
    }
  }
}
const kindFor = (level) => SEQ[level % SEQ.length];
// level n's patient: always the same person (kind overrides who it is, for testing)
export function patientFor(level, kind = kindFor(level)) {
  R = seeded(level * 7717 + 31);
  try { return randomPatient(kind); } finally { R = Math.random; }
}

// a kind of patient other than the ones in `avoid` (regular patients can repeat)
export function pickKind(avoid = []) {
  const open = KINDS.filter((k) => !avoid.includes(k));
  return Math.random() < 0.18 || !open.length ? 'regular' : open[(Math.random() * open.length) | 0];
}

export function randomPatient(kind = pick(PATIENT_KINDS)) {
  const si = (R() * SKINS.length) | 0;
  const skin = SKINS[si];
  const base = kind === 'regular' ? regular() : CHARACTERS[kind]();
  const hair = hairFor(skin, base.hairs);
  const dyed = Object.values(DYE).includes(hair), grey = GREYS.includes(hair);
  const who = {
    kind, skin, hair: hair.c, hairHi: hair.hi,
    // brows follow the hair, except dyed hair keeps natural dark brows
    brow: grey ? hair.c : dyed || base.darkBrows ? '#2c1f24' : mix(hair.c, '#2a1a20', 0.45),
    eye: pick(EYES),
    freckles: base.freckles ?? (si <= 3 && R() < 0.35),
    mole: R() < 0.22 ? (R() < 0.5 ? -1 : 1) : 0,
    eyeSize: 1, lids: 0, lashes: false, brows: 'normal', nose: 'normal', glasses: null, earring: null,
    seed: (R() * 1e9) | 0,
    tilt: rand(-0.04, 0.04),
    ...base,
  };
  delete who.hairs;
  return who;
}
