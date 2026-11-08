// Data-driven level definitions. A new treatment = one entry in TOOLS plus one module
// registered in js/tools/index.js; levels list which treatments they use, in order.
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
];

// Each level adds a treatment, narrows the sweet zones (zone), speeds up the bars
// (speed), nudges sweet centres around (jitter) and brings more pimples and grime.
export const LEVELS = [
  { tools: ['scrub', 'pop', 'polish'], pimples: 3, dirt: 0.45, zone: 1.6, speed: 0.85, jitter: 0 },
  { tools: ['scrub', 'pop', 'chisel', 'polish'], pimples: 4, dirt: 0.6, zone: 1.3, speed: 1, jitter: 0.02 },
  { tools: ['scrub', 'pop', 'chisel', 'gold', 'polish'], pimples: 5, dirt: 0.75, zone: 1.1, speed: 1.12, jitter: 0.04 },
  { tools: ['scrub', 'pop', 'chisel', 'mew', 'gold', 'polish'], pimples: 6, dirt: 0.9, zone: 0.95, speed: 1.25, jitter: 0.05 },
  { tools: ['scrub', 'pop', 'chisel', 'mew', 'rasp', 'gold', 'polish'], pimples: 7, dirt: 1, zone: 0.8, speed: 1.38, jitter: 0.06 },
];
export const PASS = 50; // aura needed to unlock the next level

export const VIEWS = {
  intro: { x: 0, y: 130, r: 420 },
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
