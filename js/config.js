// Data-driven treatments and levels. A new treatment = one entry in TOOLS plus one module
// registered in js/tools/index.js; levels list which treatments the patient needs.
//
// view:      stage point to centre {x, y} and radius r to fit into the free screen area;
//            rel: y is relative to the head's current height (it moves while mewing).
// hold:      seconds of holding to go from progress 0 to 1 (per target), auto-release
//            point. Brushes use `time` only for the Space-key autopilot.
// sweet:     ideal release window {c: centre, w: half width} in progress units, or
//            null. Each target's centre is nudged per level (LEVELS jitter).
// fixed:     the sweet centre never moves (its visuals depend on the exact value).
// brush:     dragged over the patient instead of pressed on targets.
// multiHold: one target filled over several presses; no timing.
// scored:    counts toward AURA.
// name:      accessible label only; the game shows icons, not names.

export const TOOLS = [
  {
    id: 'scrub', name: 'Wash', prompt: 'RUB TO WASH', icon: 'sponge',
    view: { x: 0, y: -12, r: 262, rel: true },
    hold: { time: 3.6, max: 1.0 }, sweet: null, brush: true, scored: false,
  },
  {
    id: 'pop', name: 'Pop pimples', prompt: 'HOLD TO SQUEEZE', icon: 'pop',
    view: { x: 0, y: 4, r: 236, rel: true },
    hold: { time: 1.6, max: 1.15 }, sweet: { c: 0.8, w: 0.1 }, scored: true,
  },
  {
    id: 'chisel', name: 'Sculpt jaw', prompt: 'HOLD TO SCULPT', icon: 'roller',
    view: { x: 0, y: 100, r: 220, rel: true },
    hold: { time: 3.0, max: 1.12 }, sweet: { c: 0.84, w: 0.07 }, scored: true,
  },
  {
    id: 'mew', name: 'Sit up', prompt: 'HOLD TO MEW', icon: 'mew',
    view: { x: 0, y: 70, r: 330 },
    hold: { time: 2.5, max: 1.15 }, sweet: { c: 0.72, w: 0.06 }, scored: true,
  },
  {
    id: 'rasp', name: 'Paint hair and brows', prompt: 'PAINT THE HAIR', icon: 'brush',
    view: { x: 0, y: -84, r: 232, rel: true },
    hold: { time: 3.2, max: 1 }, sweet: null, brush: true, scored: true,
  },
  {
    id: 'gold', name: 'Heal scars', prompt: 'HOLD TO HEAL', icon: 'tube',
    view: { x: 0, y: 30, r: 345 },
    hold: { time: 1.5, max: 1.25 }, sweet: { c: 1.0, w: 0.09 }, fixed: true, scored: true,
  },
  {
    id: 'polish', name: 'Glow', prompt: 'HOLD TO GLOW', icon: 'glow',
    view: { x: 0, y: 20, r: 300, rel: true },
    hold: { time: 2.4, max: 1.0 }, sweet: null, multiHold: true, scored: false,
  },
  {
    id: 'nose', name: 'Nose job', prompt: 'HOLD TO RESHAPE', icon: 'nose',
    view: { x: 0, y: 46, r: 205, rel: true },
    hold: { time: 2.4, max: 1.15 }, sweet: { c: 0.78, w: 0.07 }, scored: true,
  },
  {
    id: 'circles', name: 'Dark circles', prompt: 'HOLD TO BRIGHTEN', icon: 'cucumber',
    view: { x: 0, y: 34, r: 205, rel: true },
    hold: { time: 1.5, max: 1.2 }, sweet: { c: 0.85, w: 0.09 }, scored: true,
  },
  {
    id: 'laser', name: 'Laser spots', prompt: 'ZAP THE SPOTS', icon: 'laser',
    view: { x: 0, y: 0, r: 255, rel: true },
    hold: { time: 4.2, max: 1 }, sweet: null, brush: true, scored: true,
  },
  {
    id: 'teeth', name: 'Whiten teeth', prompt: 'HOLD TO WHITEN', icon: 'tooth',
    view: { x: 0, y: 118, r: 200, rel: true },
    hold: { time: 2.2, max: 1.15 }, sweet: { c: 0.8, w: 0.08 }, scored: true,
  },
  {
    id: 'iron', name: 'Iron wrinkles', prompt: 'HOLD TO IRON', icon: 'iron',
    view: { x: 0, y: 4, r: 262, rel: true },
    hold: { time: 1.2, max: 1.25 }, sweet: { c: 1.0, w: 0.09 }, fixed: true, scored: true,
  },
];

// ---------- 50 levels in 5 chapters of 10 ----------
// Every patient comes in dirty, so every level starts with the wash and ends with the
// glow; the treatments in between are the level's own, in its own shuffled order.
// A level that brings in a new treatment has just that one between the wash and the
// glow; the next two practise it mixed in with older ones, and the rest mix it with
// what came before (the chapter's own treatments come up more often). Level 10 of each
// chapter is a boss: everything the chapter unlocked, more treatments, and a higher
// pass mark.
// Difficulty climbs in a sawtooth: each chapter starts a little easier than the last
// boss. It narrows the sweet zones (zone), speeds up the bars (speed), nudges sweet
// centres around (jitter), and brings more dirt, pimples, scars, spots and wrinkles.
// Generated from a fixed seed per level, so a level always has the same treatments in
// the same order (and the same patient, see people.js patientFor).
export const CHAPTER_SIZE = 10;
// 0-based level where each treatment first shows up
export const INTRO = {
  scrub: 0, pop: 0, polish: 0, chisel: 1, gold: 4, // chapter 1
  circles: 10, nose: 14, // chapter 2
  laser: 20, mew: 24, // chapter 3
  teeth: 30, rasp: 34, // chapter 4
  iron: 40, // chapter 5
};
// the tool kit: every treatment, in the order they unlock (the slots fill up left to
// right as the player progresses; ties keep the TOOLS order)
export const KIT = TOOLS.map((t) => t.id).sort((a, b) => INTRO[a] - INTRO[b]);
// style tools: in the kit from the start, used between treatments, outside the order.
// Hair colour is free; every piercing costs aura (more away from the usual spots).
export const STYLES = [
  { id: 'dye', name: 'Hair colour', prompt: 'RUB THE HAIR', icon: 'dye', view: { x: 0, y: -96, r: 250, rel: true } },
  { id: 'pierce', name: 'Piercing', prompt: 'TAP TO PIERCE', icon: 'pierce', view: { x: 0, y: -4, r: 250, rel: true } },
];
// every scored treatment in a fixed reference order; each level shuffles its own set
// into the order the player has to follow (shown in the HUD, auto-played by Space)
const SCORED = ['laser', 'pop', 'gold', 'circles', 'iron', 'nose', 'teeth', 'chisel', 'mew', 'rasp'];
const PER_CHAPTER = [2, 2, 3, 3, 4]; // scored treatments in a chapter's early levels

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const round = (v, k) => Math.round(v * k) / k;

// a level's own order: a seeded shuffle, never the same as the level before when they
// have the same treatments
function orderFor(n, ids, prev) {
  const R = rng(n * 104729 + 7);
  let out = ids;
  for (let tries = 0; tries < 12; tries++) {
    out = ids.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    if (!prev || out.join() !== prev.join()) break;
  }
  return out;
}

function makeLevel(n, prev) {
  const R = rng(n * 7919 + 101);
  const c = Math.floor(n / CHAPTER_SIZE), k = n % CHAPTER_SIZE, boss = k === CHAPTER_SIZE - 1;
  const pool = SCORED.filter((id) => INTRO[id] <= n);
  const fresh = pool.filter((id) => INTRO[id] === n);
  const recent = pool.filter((id) => n - INTRO[id] >= 1 && n - INTRO[id] <= 2);
  const mine = pool.filter((id) => Math.floor(INTRO[id] / CHAPTER_SIZE) === c);
  // a new treatment's first level: only that one, so it can be learnt on its own
  const set = new Set(fresh.length ? fresh : [...recent, ...(boss ? mine : [])]);
  if (!fresh.length) {
    const count = Math.min(pool.length, PER_CHAPTER[c] + (k >= 4 ? 1 : 0) + (boss ? 1 : 0));
    const rest = pool.filter((id) => !set.has(id));
    while (set.size < count && rest.length) {
      const w = rest.map((id) => (mine.includes(id) ? 3 : 1) * (id === 'pop' ? 1.5 : 1));
      let r = R() * w.reduce((a, b) => a + b, 0), i = 0;
      for (; i < rest.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
      set.add(rest.splice(i, 1)[0]);
    }
  }
  // the wash always first, the glow always last, the rest shuffled in between
  const mid = orderFor(n, SCORED.filter((id) => set.has(id)), prev && prev.tools.slice(1, -1));
  const tools = ['scrub', ...mid, 'polish'];
  const d = Math.max(0, Math.min(1, c * 0.19 + k * 0.03 + (boss ? 0.03 : 0) - (fresh.length ? 0.04 : 0)));
  const since = (id) => Math.max(0, n - INTRO[id]);
  return {
    tools, chapter: c, boss, fresh,
    pass: 50 + 5 * c + (boss ? 5 : 0), // aura needed to unlock the next level
    zone: round(lerp(1.6, 0.75, d), 100), speed: round(lerp(0.85, 1.42, d), 100), jitter: round(lerp(0, 0.07, d), 1000),
    dirt: round(lerp(0.45, 1, d), 100),
    pimples: Math.min(10, 3 + Math.floor(n / 6) + (n >= 3 && R() < 0.3 ? 1 : 0)),
    scars: Math.min(4, 1 + Math.floor(since('gold') / 5)),
    spots: Math.min(12, 6 + Math.floor(since('laser') / 3)),
    wrinkles: Math.min(6, 3 + Math.floor(since('iron') / 3)),
  };
}
export const LEVELS = [];
for (let n = 0; n < 50; n++) LEVELS.push(makeLevel(n, LEVELS[n - 1]));
export const CHAPTERS = LEVELS.length / CHAPTER_SIZE;

export const VIEWS = {
  intro: { x: 0, y: 130, r: 420 },
  pick: { x: 0, y: -10, r: 300, rel: true }, // the whole face, while choosing a tool
  reveal: { x: 0, y: 70, r: 400, rel: true },
  results: { x: 0, y: 40, r: 330, rel: true },
};

export const RANKS = [
  { name: 'NPC', min: 0 },
  { name: 'NORMIE', min: 50 },
  { name: 'CHADLITE', min: 70 },
  { name: 'MOGGER', min: 85 },
  { name: 'LEGENDARY', min: 95 },
];
