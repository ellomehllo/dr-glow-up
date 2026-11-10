// A character's look as plain JSON, for multiplayer (MULTIPLAYER_PLAN.md): who they are
// (people.js), everything the tools have done to them (patient.js state) and how much of
// their grime is washed off. toLook() reads it off a live patient; fromLook() makes a
// patient state (and the grime) back from it. Animation and passing feelings (blinks,
// springs, the mood, tears) are left out: a loaded character starts calm.
import { makeState, CRACKS, WRINKLES } from './patient.js';

export const LOOK_VERSION = 1;
export const LOOK_MAX = 20000; // characters of JSON a look may take

// patient state that is motion or a passing feeling, not part of the look
const SKIP = new Set([
  'who', 'cracks', 'wrk', 'sweep',
  'look', 'lookAt', 'blink', 'blinkT', 'blinking', 'bob', 'sq', 'sqV', 'tilt', 'tiltV', 'hop', 'hopV',
  'sweat', 'flush', 'expr', 'mouth', 'exprT', 'exprBase', 'mouthBase',
  'mood', 'moodV', 'anger', 'angerV', 'cry', 'cryV', 'bored', 'boredV',
  'eyeRed', 'eyeShut', 'tears', 'pain',
]);
// numbers to two decimals: plenty for head-space positions and amounts, and much shorter
const trim = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);

// the look of patient s; dirt: the game's Dirt layer, setup: the patient's setup (its
// grime seed and amount)
export function toLook(s, dirt = null, setup = null) {
  const st = {};
  for (const k of Object.keys(s)) if (!SKIP.has(k)) st[k] = s[k];
  const look = {
    v: LOOK_VERSION,
    who: s.who,
    cracks: s.cracks.map((c) => CRACKS.indexOf(c)).filter((i) => i >= 0),
    wrk: s.wrk.map((w) => ({ i: w.i, f: w.f, red: w.red })),
    s: st,
    dirt: setup && setup.dirt > 0 ? { seed: setup.seed, amt: setup.dirt, jaw0: setup.jaw0 || 0, wiped: dirt ? dirt.wipedCode() : '' } : null,
  };
  return JSON.parse(JSON.stringify(look, trim));
}

export const lookText = (look) => JSON.stringify(look);

// is this a look we can load? (shape and size; anything from the network goes through this)
export function validLook(look) {
  if (!look || typeof look !== 'object' || look.v !== LOOK_VERSION) return false;
  if (!look.who || typeof look.who !== 'object' || !look.s || typeof look.s !== 'object') return false;
  if (!Array.isArray(look.cracks) || !Array.isArray(look.wrk)) return false;
  if (look.cracks.some((i) => !CRACKS[i]) || look.wrk.some((w) => !w || !WRINKLES[w.i])) return false;
  return lookText(look).length <= LOOK_MAX;
}

// a patient state from a look, and the setup the grime is painted from (dirt.setup(o.setup)
// then dirt.applyWiped(o.wiped))
export function fromLook(look) {
  if (!validLook(look)) throw new Error('bad look');
  const cracks = look.cracks.map((i) => CRACKS[i]);
  const s = makeState({ who: look.who, pimples: [], cracks, dirt: look.dirt ? look.dirt.amt : 0 });
  const base = makeState({ who: look.who, pimples: [], cracks }); // what each field should be
  for (const [k, v] of Object.entries(look.s)) {
    if (SKIP.has(k) || !(k in base)) continue; // unknown or not ours: keep the fresh value
    s[k] = v;
  }
  s.wrk = look.wrk.map((w) => ({ ...WRINKLES[w.i], f: w.f || 0, red: w.red || 0 }));
  const d = look.dirt;
  const setup = d ? { seed: d.seed, dirt: d.amt, jaw0: d.jaw0 } : { seed: 11, dirt: 0, jaw0: 0 };
  return { s, setup, wiped: d ? d.wiped || '' : '' };
}
