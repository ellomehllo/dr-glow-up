// The run. A hundred levels in ten chapters, each with a new patient. The player picks each
// treatment the patient needs from the tool kit, in any order, and one controller drives it:
//   intro | arrive -> pick -> transition -> ready <-> holding | brushing -> outro -> pick ...
// The kit holds every treatment; ones not unlocked yet are empty slots. Any unlocked one
// can be picked at any time the finger is up, even halfway through another: the one left
// keeps its progress (the targets done, their scores) and carries on where it was when
// picked again. The row of badges under the aura is what this patient needs (and what
// scores); Space picks the first one not done yet. A tool they don't need, or one already
// done, comes out as a free use (beginSpare): no score, and it skips whatever is already
// fine (Tool.fixed), so with nothing left it only says so.
// Besides the level's own treatments a patient can bring extras (extras.js): debris in
// the hair, a worm, piercings, plaque, cavities, a rotten tooth. Tapping the mouth while
// picking makes them open wide to show their teeth.
// After the results the next patient comes in from the waiting room (waiting.js), passed
// or not: a pass moves on to the next level, a fail plays the same level again with a new
// patient. The retry button keeps the same patient.
// In `ready` the player presses ON a target (a pimple, a scar, the jaw...) and holds;
// each target is scored on its own release, and the treatment ends once all of its
// targets are done. Brush treatments (wash, hair) are dragged over the patient instead.
// Then the finale (happy hops, sparkle shower, camera flash) and the results screen
// with a before/after split. Treatments only react through the hooks in tools/base.js.
// Style tools (hair colour, makeup, piercings, gems, clips, shades; style.js) sit in their
// own row of the kit and unlock by level like treatments. A patient can ask for a look (a
// wish): it joins their order before the glow and scores by how close the result is when
// the player taps done. Picked otherwise they are free to play with; piercings nobody
// asked for cost aura.
// A treatment pressed where there is nothing to treat hurts the patient there (mood.js):
// a mark, an ouch in their own words, and aura; an eye hurts most. At the end the patient
// takes the job by the aura and the hurts, in their own temper: happy hops for a good job,
// anger, tears, a cold shoulder or grumbling for a bad one.
import { ICONS } from './icons.js';
import { touch, placeOf } from './world.js';
import { TOOLS, LEVELS, VIEWS, CHAPTER_SIZE, KIT, INTRO, STYLES, STYLE_IDS } from './config.js';
import { REGISTRY } from './tools/index.js';
import { scoreRelease, rankFor, auraOf, loadProgress, saveProgress } from './scoring.js';
import { makeState, resetState, drawPatient, tickPatient, headToStage, stageToHead, headBase, headY, react, onFace, eyeSide, PIMPLE_SPOTS, CRACKS, WRINKLES, SPOT_SPOTS } from './patient.js';
import { patientFor, randomPatient, pickKind, makeWho } from './people.js';
import { Creator } from './creator.js';
import { SalonUI } from './salon.js';
import { rollExtras, inMouth } from './extras.js';
import { toLook, fromLook } from './look.js';
import { Dirt } from './dirt.js';
import { PALETTES, PAINT_AT, swatchesFor, setPaint, paintNow, onPaint, rubLength, pierceSpot, pierceCost, PIERCE, GEMS, CLIPS, SHADES, nextShades, onEyes, SPOT_AT, rollWish, wishLine, wishPrompt, touched, wishScore } from './style.js';
import { HURT, HURT_KIND, temperOf, lineFor, feelingFor, faceFor, BAD } from './mood.js';
import { easeIO, rand, TAU, shuffle } from './draw.js';
import { WaitingRoom, DOOR } from './waiting.js';
import { K as ROOM_K } from './backdrop.js';

// tools the player has finished a real treatment with; their in-world guides stop then
const KNOWN_KEY = new URLSearchParams(location.search).has('debug') ? 'marblemaxx.known.debug' : 'marblemaxx.known';
function loadKnown() { try { return new Set(JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')); } catch { return new Set(); } }
// tools with no in-world tool of their own: their kit icon is held instead (drawHeld)
const HELD_ICON = new Set(['pop', 'mew']);
const HELD = {};
// the icon of the tool in hand, drawn once (with its soft shadow) into a canvas: drawing
// the SVG with a blurred shadow every frame is slow on phones. null until it has loaded
function heldImage(icon) {
  if (!(icon in HELD)) {
    HELD[icon] = null;
    const img = new Image();
    const svg = (ICONS[icon] || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" ');
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = HELD_PX;
      const x = c.getContext('2d'), pad = (HELD_PX - 192) / 2;
      x.shadowColor = 'rgba(58,39,71,0.25)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
      x.drawImage(img, pad, pad, 192, 192);
      HELD[icon] = c;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return HELD[icon];
}
const HELD_PX = 256; // the cached icon: 192 px of icon and room for its shadow
const SALON_SECS = 90; // a multiplayer turn
const PEEK = 1.7; // seconds a look in the mouth (or at the waiting room window) lasts
const TAP_IGNORE = 0.06; // a release before this much progress is a false start, not a release
const TRANSITION = 0.9;
const FINALE = 2.2;
const ARRIVE = 1.5; // a new patient settles in before the first treatment
const CALL = 2.0; // "Next!": the camera visits the waiting room before the next patient sits down
// the camera on the waiting room's doorway (the room moves at ROOM_K, so its point is scaled up)
const WAIT_VIEW = { x: (DOOR.x + DOOR.w / 2) / ROOM_K, y: 250 / ROOM_K, r: 235 };
const FINGER = 30; // screen px: the smallest a target's hit area gets
const WORD = { perfect: 'PERFECT!', good: 'NICE!', early: 'TOO EARLY', late: 'TOO LATE', messy: 'MESSY!' };
const PLAYING = new Set(['arrive', 'pick', 'transition', 'ready', 'holding', 'brushing', 'outro', 'style']); // the kit button shows
const BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const STYLE_BY_ID = Object.fromEntries(STYLES.map((t) => [t.id, t]));

// n of the list, at random, kept in the list's own order
const some = (list, n) => shuffle(list.slice()).slice(0, n).sort((a, b) => list.indexOf(a) - list.indexOf(b));
// sun spots for the laser, apart from each other and from the pimples
function pickSpots(n, pimples) {
  const out = [];
  for (const c of shuffle(SPOT_SPOTS.slice())) {
    if (out.length >= n) break;
    if (pimples.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < p.r + 26)) continue;
    if (out.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 34)) continue;
    out.push({ x: c.x + rand(-5, 5), y: c.y + rand(-5, 5), r: rand(7, 11.5), rot: rand(0, TAU) });
  }
  return out;
}

export class Game {
  constructor(o) {
    // ui, audio, input, fx, dirt, director, backdrop, playables, cloud
    Object.assign(this, o);
    this.progress = loadProgress();
    this.level = Math.min(this.progress.unlocked, LEVELS.length) - 1;
    this.setup = this.makeSetup(this.level);
    const s = (this.s = makeState(this.setup));
    this.before = makeState(this.setup); // the patient exactly as they came in
    this.dirt.setup(this.setup);
    // the next patients, on a bench through the back doorway: new characters, never the
    // same kind as anyone already there or in the chair
    this.waiting = new WaitingRoom((n, avoid) => this.makeSetup(n % LEVELS.length, { avoid: [...avoid, this.s ? this.s.who.kind : null] }));
    this.backdrop.waiting = this.waiting;
    this.waiting.fill(this.level);
    this.g = {
      s, fx: this.fx, audio: this.audio, dirt: this.dirt, time: 0,
      prog: 0, ghost: -1, hint: false, fail: 0, hit: 0, known: loadKnown(),
      head: (x, y) => headToStage(s, x, y),
      shake: (a) => this.director.shake(a),
      bump: (a) => this.director.bump(a),
      toast: (t) => this.ui.toast(t),
      react: (e, d, m) => react(s, e, d, m),
      hurt: (x, y, kind, free) => this.hurtAt(x, y, kind, free),
      sting: (side) => this.sting(side),
      env: (q, dt) => this.env(q, dt),
      smash: (q) => this.smash(q),
    };
    this.tools = []; this.defs = [];
    this.spares = {}; this.spare = false; // free uses of tools (by id), and whether the one out is one
    this.buildTools();
    // a returning player already knows every tool from the levels they've passed
    if (!this.g.known.size) for (const id of Object.keys(REGISTRY)) if (INTRO[id] < this.progress.unlocked - 1) this.learn(id);
    this.entered = new Set();
    this.used = new Set(); // treatments (index into defs) finished on this patient
    this.tool = null; this.idx = -1;
    this.style = null; // the style tool out: { def, i, down, last, rub } (style mode; i: its place in the order, or -1)
    this.swatch = { dye: 'pink', lips: 'red', blush: 'pink', glitter: 'gold', shadow: 'pink', freckles: 'brown', lashes: 'black', brows: 'brown', highlight: 'pearl' }; // the colour picked last, per tool
    this.clearHurts();
    this.seenHint = new Set();
    this.mode = 'boot';
    this.modeT = 0;
    this.timers = []; this.windowT = 0; // until when the camera looks at the waiting room window
    this.scores = [];
    this.verdicts = [];
    this.flash = 0;
    this.glintT = 0;
    this.splitV = 0; this.splitUser = false;
    this.passed = false;
    this.input.on('down', (src) => this.onDown(src));
    this.input.on('up', (src) => this.onUp(src));
  }

  // a fresh patient for a level: who they are and what they came in with (what this
  // level treats: pimples, scars, spots, wrinkles, a big nose, dark circles..., plus any
  // extras). o: { kind } a given kind (testing), { avoid } a new random patient of none of
  // those kinds, { from } a patient from the waiting room, made for some level: the same
  // person with the same extras, fitted to this level. Neither: the level's own patient.
  makeSetup(level, o = {}) {
    const L = LEVELS[level], has = (id) => L.tools.includes(id), from = o.from;
    if (from && from.level === level) return from;
    const who = from ? from.who : o.kind ? patientFor(level, o.kind) : o.avoid ? randomPatient(pickKind(o.avoid)) : patientFor(level);
    // pimples: the ones they sat in the waiting room with first
    const had = from ? from.pimples : [];
    const pimples = has('pop') ? [...had, ...shuffle(PIMPLE_SPOTS.filter((p) => !had.includes(p)))].slice(0, L.pimples) : [];
    // the order fits the level's size (short at a chapter's start, longest on its boss):
    // the treatments, the glow and anything new this level come first, then the rest only
    // while there's room
    const mid = L.tools.slice(1, -1);
    const must = L.extra.length; // this level's new extra: always in
    let room = L.size - mid.length - 1 - (L.style ? 1 : 0) - must;
    // only some come in muddy and need a wash (always on the first level, to learn it)
    const muddy = level === 0 || (room > 0 && (from ? from.dirt > 0 : Math.random() < 0.3));
    if (muddy && level !== 0) room--;
    const ex = rollExtras({ open: (id) => INTRO[id] <= level, must: L.extra, who, carry: from, max: must + Math.max(0, room) });
    room -= ex.extras.length - must;
    // a look they want: the style tool this level brings in, or now and then (always for a
    // boss) one already open; a waiting-room patient keeps the one they came with
    const open = STYLE_IDS.filter((id) => INTRO[id] <= level);
    let wish = from && from.wish && INTRO[from.wish.id] <= level && room > 0 ? from.wish : null;
    if (L.style) wish = wish && wish.id === L.style ? wish : rollWish(L.style);
    else if (!wish && room > 0 && open.length && (L.boss || Math.random() < 0.45)) wish = rollWish(open[(Math.random() * open.length) | 0]);
    return {
      level, who, pimples, ...ex, wish,
      tools: [...(muddy ? ['scrub'] : []), ...mid, ...ex.extras, ...(wish ? [wish.id] : []), L.tools[L.tools.length - 1]], // the glow stays last
      cracks: has('gold') ? some(CRACKS, L.scars) : [],
      spots: has('laser') ? pickSpots(L.spots, pimples) : [],
      wrinkles: has('iron') ? some(WRINKLES, L.wrinkles) : [],
      jaw0: has('chisel') ? 0 : 0.7,
      mew0: has('mew') ? 0 : 1,
      hair0: has('rasp') ? 0 : 1,
      brow0: has('rasp') ? 0 : 0.75,
      nose0: has('nose') ? 0 : 1,
      circ0: has('circles') ? 1 : 0,
      teeth0: has('teeth') ? 0 : 1,
      dirt: muddy ? L.dirt : 0,
      seed: (Math.random() * 1e9) | 0,
    };
  }
  // what the level splash and the HUD show about a level
  levelInfo(n) {
    const L = LEVELS[n];
    return {
      chapter: L.chapter + 1, first: n % CHAPTER_SIZE === 0, boss: L.boss, pass: L.pass,
      fresh: L.fresh.map((id) => BY_ID[id] || STYLE_BY_ID[id]),
    };
  }
  // the patient's treatments (the level's, their extras and their wish) with the level's
  // difficulty; a wish has no tool object (style mode runs it)
  buildTools() {
    this.defs = this.setup.tools.map((id) => this.defFor(id));
    this.tools = this.defs.map((def) => (def.style ? null : new REGISTRY[def.id](this.g, def)));
  }
  // a treatment with the level's difficulty applied, or the patient's wish
  defFor(id) {
    if (STYLE_BY_ID[id]) return { ...STYLE_BY_ID[id], style: true, scored: true, wish: this.setup.wish, prompt: wishPrompt(this.setup.wish) };
    const L = LEVELS[this.level], base = BY_ID[id];
    // each target nudges its own sweet centre by up to `jitter` (see Tool.enter)
    const def = { ...base, hold: { ...base.hold, time: base.hold.time / L.speed }, jitter: base.fixed ? 0 : L.jitter };
    if (base.sweet) def.sweet = { c: base.sweet.c, w: base.sweet.w * L.zone };
    return def;
  }
  // unlocked: reached by the player (any level opened so far)
  isOpen(id) { return this.allTools || INTRO[id] < Math.max(this.progress.unlocked, this.level + 1); }
  // a multiplayer turn: every tool is there, whatever level the player reached
  get allTools() { return !!(this.salon && this.salon.o && this.salon.o.mp); }

  view(v) { return { x: v.x || 0, y: v.y + (v.rel ? headBase(this.s) : 0), r: v.r }; }
  // where the camera goes for a tool: the mouth tools (teeth, lipstick) zoom in on the
  // mouth; everything else keeps the close view of the face, so the camera never pulls
  // back while the player works (posture follows the head from a little lower)
  viewFor(def) {
    if (def.mouth || def.id === 'teeth' || def.id === 'lips') return def.view;
    return def.id === 'mew' ? { ...VIEWS.pick, y: VIEWS.pick.y + 40 } : VIEWS.pick;
  }

  // ---------- flow ----------
  setMode(m) { this.mode = m; this.modeT = 0; this.syncKit(); this.coach(m); }
  // level 1 teaches as it goes: the order, aura and kit at the first pick, how to hold or
  // rub at the first of each, the scoring on the results (tutorial.js; each shows once)
  coach(m) {
    if (!this.tut || this.level !== 0) return;
    if (m === 'pick') this.after(0.35, () => { if (this.mode === 'pick') this.tut.moment('pick'); });
    else if (m === 'ready') this.tut.moment(this.tool.def.brush ? 'brush' : 'hold');
    else if (m === 'results') this.after(1.4, () => { if (this.mode === 'results') this.tut.moment('results'); });
  }
  after(t, fn) { this.timers.push({ t: this.g.time + t, fn }); }
  start() {
    this.setMode('intro');
    this.director.snap(this.view(VIEWS.intro));
    this.director.setObstruction(this.ui.obstruction('intro'), true);
    this.ui.setLevel(this.level, this.progress.unlocked);
    this.ui.setSteps(this.defs, LEVELS[this.level].fresh);
    this.ui.setPass(LEVELS[this.level].pass);
    this.refreshKit();
    this.ui.titleCard(true);
    if (this.menuWanted) this.openMenu();
    this.sayWish(2.6);
    react(this.s, 'normal', 0.01);
  }
  // ---------- the start menu (single player or multiplayer; only where multiplayer runs) ----------
  openMenu() {
    this.menuOn = true;
    this.ui.showModes(true, this.level + 1);
    this.director.setObstruction(this.ui.obstruction('intro'));
  }
  closeMenu() {
    if (!this.menuOn) return;
    this.menuOn = false;
    this.ui.showModes(false);
  }
  chooseMode(m) {
    if (!this.menuOn) return;
    this.closeMenu();
    if (m === 'multi' && this.multi) this.multi.open();
    else this.toPick();
  }
  // back from multiplayer: the clinic with the start menu up
  toMenu() {
    this.startLevel(this.level);
    this.timers = [];
    this.setMode('intro');
    this.ui.titleCard(true);
    this.openMenu();
  }

  // ---------- the kit ----------
  // every treatment, in unlock order, with what it means for this patient
  kit() {
    const reached = Math.max(this.progress.unlocked, this.level + 1); // levels the player has opened
    return KIT.map((id) => {
      const t = BY_ID[id], i = this.defs.findIndex((d) => d.id === id);
      // need: this patient needs it; done: needed and done; free: not needed (both can be
      // used freely); now: the one out
      let state = 'need';
      if (!this.allTools && INTRO[id] >= reached) state = 'locked';
      else if (this.tool && this.tool.def.id === id) state = 'now';
      else if (i < 0) state = 'free';
      else if (this.used.has(i)) state = 'done';
      return { id, icon: t.icon, name: t.name, state, lv: INTRO[id] + 1 };
    });
  }
  // the style row of the kit: locked until its level, the wish (need, then done), the one
  // out, the colour each colour tool shows now, what piercings cost
  styleKit() {
    const s = this.s, cost = pierceCost(s), i = this.defs.findIndex((d) => d.style);
    return STYLES.map((d) => {
      let state = 'style';
      if (!this.isOpen(d.id)) state = 'locked';
      else if (this.style && this.style.def.id === d.id) state = 'now';
      else if (i >= 0 && this.defs[i].id === d.id) state = this.used.has(i) ? 'done' : 'need';
      const paint = PALETTES[d.id] && paintNow(s, d.id);
      return {
        id: d.id, icon: d.icon, name: d.name, state, lv: INTRO[d.id] + 1,
        dot: paint && paint.a > 0.05 ? paint.c : '', tag: d.id === 'pierce' && cost ? `-${cost}` : '',
      };
    });
  }
  refreshKit() { this.ui.setKit(this.kit(), this.styleKit()); }
  // a tool can be picked whenever the finger is up: between treatments, or halfway
  // through one (it keeps its progress)
  canPick() {
    const m = this.mode;
    return m === 'intro' || m === 'arrive' || m === 'pick' || m === 'style' || m === 'transition' || m === 'ready';
  }
  syncKit() { this.ui.kitButton({ on: PLAYING.has(this.mode), busy: !this.canPick(), call: this.mode === 'pick' }); }
  openKit() {
    if (!this.canPick()) { this.ui.shake(); this.audio.tink(0.5); return; }
    if (this.mode === 'intro' || this.mode === 'arrive') this.toPick();
    this.refreshKit();
    this.ui.openKit();
    this.syncKit();
    this.audio.tick();
    if (this.tut && this.level === 0) this.after(0.4, () => { if (this.ui.kitOpen) this.tut.moment('kit'); });
  }
  closeKit() {
    if (!this.ui.kitOpen) return;
    this.ui.closeKit();
    this.syncKit();
  }
  // a slot in the kit was picked: start that treatment, or say why not (returns false)
  choose(id) {
    if (!this.canPick()) return false;
    if (!this.isOpen(id)) return false;
    if (STYLE_BY_ID[id]) return this.chooseStyle(id);
    const i = this.defs.findIndex((d) => d.id === id);
    if (this.tool && this.tool.def.id === id) { this.closeKit(); return true; } // the one already out
    if (this.tool) this.tool.exit(); // left as it is, to carry on later
    this.endStyle(false);
    if (i >= 0 && !this.used.has(i)) this.beginTool(i);
    else this.beginSpare(id);
    return true;
  }

  // the patient asks for their look as they sit down
  sayWish(at) {
    const w = this.setup.wish;
    if (!w) return;
    this.after(at, () => {
      const h = headToStage(this.s, 0, -262);
      this.fx.text(h.x, h.y, wishLine(w), '#ffffff', 26, 1.6);
    });
  }
  // ---------- style tools ----------
  chooseStyle(id) {
    const def = STYLE_BY_ID[id];
    if (this.style && this.style.def === def) { this.closeKit(); return true; }
    if (this.tool) { this.tool.exit(); this.tool = null; this.idx = -1; } // left as it is, to carry on later
    this.endStyle(false);
    this.ui.closeKit();
    // the patient's wish (not yet scored) is in their order; anything else is a free play
    const i = this.defs.findIndex((d, k) => d.id === id && !this.used.has(k));
    const wish = i >= 0 ? this.defs[i].wish : null;
    this.style = { def, i, down: false, last: null, rub: 0 };
    const s = this.s, colour = !!PALETTES[id];
    if (colour && !(s[id] && s[id].id === this.swatch[id])) setPaint(s, id, this.swatch[id]);
    s.lookAt = null;
    this.director.go(this.view(this.viewFor(def)), TRANSITION);
    this.director.setObstruction(this.ui.obstruction('play'));
    this.ui.titleCard(false);
    this.ui.showStyle(def, {
      prompt: wish ? wishPrompt(wish) : def.prompt, i,
      swatches: colour ? swatchesFor(s, id) : null, on: this.swatch[id], want: wish && colour ? wish.want : null,
      t: colour ? s[id].t : 0, cost: pierceCost(s), count: this.styleCount(id),
    });
    this.ui.markNext(-1);
    this.audio.whoosh(0.1);
    this.setMode('style');
    this.refreshKit();
    return true;
  }
  // done styling (the done button, Space): a wish is scored on what was done, then back
  // to picking; quietly (back = false) when another tool is picked instead, unscored
  endStyle(back = true) {
    const st = this.style;
    if (!st) return;
    this.style = null;
    this.ui.hideStyle();
    if (!back) return;
    if (st.i >= 0 && touched(this.s, st.def.id)) this.finishWish(st.i);
    else { this.audio.tick(); this.afterTool(); }
  }
  // the wish scored like a finished treatment: a stamp, the badge, the aura
  finishWish(i) {
    const r = wishScore(this.s, this.defs[i].wish);
    this.idx = i; this.spare = false;
    this.scores[i] = r.score; this.verdicts[i] = r.verdict;
    this.used.add(i);
    this.feedback(r, true);
    this.refreshKit();
    this.setMode('outro');
  }
  // a swatch: the next rubs blend toward that colour
  pickSwatch(id) {
    const st = this.style;
    if (!st || !PALETTES[st.def.id] || !PALETTES[st.def.id].some((d) => d.id === id)) return;
    this.swatch[st.def.id] = id;
    setPaint(this.s, st.def.id, id);
    this.ui.markSwatch(id);
    this.ui.setHold(0, null, 1);
    this.audio.tick();
    this.refreshKit();
  }
  stylePress(src) {
    const st = this.style;
    if (src === 'key') { this.endStyle(); return; } // Space: done
    const q = this.pointer();
    if (PALETTES[st.def.id]) { st.down = true; st.last = q; return; }
    const id = st.def.id;
    if (id === 'pierce') this.pierce(q); else if (id === 'clips') this.clip(q); else if (id === 'shades') this.shade(q); else this.stick(q);
  }
  // what a tap tool's counter shows: gems or clips on, or the sunglasses' name
  styleCount(id) {
    const s = this.s;
    if (id === 'clips') return String(s.clips.length);
    if (id === 'shades') return s.shades ? SHADES.find((d) => d.id === s.shades).name : 'OFF';
    return String(s.gems.length);
  }
  // rubbing blends the colour in, by how far the finger travels over the hair, lips or cheeks
  rub() {
    const st = this.style, id = st.def.id, s = this.s, p = s[id], q = this.pointer(), last = st.last;
    st.last = q;
    if (!last || !p || !onPaint(id, q.x, q.y)) return;
    const d = Math.hypot(q.x - last.x, q.y - last.y);
    if (d < 0.5) return;
    const was = p.t;
    p.t = Math.min(1, was + d / rubLength(id));
    st.rub += d;
    if (st.rub > 40) {
      st.rub = 0;
      this.fx.spark(q.sx, q.sy, { size: rand(9, 14), col: p.to.hi, vy: -60 });
      if (id === 'dye') { this.fx.drops(q.sx, q.sy, 2, p.to.c); this.audio.drip(); } else this.audio.tick();
    }
    this.ui.setHold(p.t, null, 1);
    if (was < 1 && p.t >= 1) {
      const c = headToStage(s, 0, PAINT_AT[id]);
      this.fx.glitter(c.x, c.y, 16, 320);
      this.fx.burst(c.x, c.y, 8, 300);
      this.audio.sparkle();
      react(s, 'happy', 1.2, 'grin');
      this.refreshKit();
    }
  }
  // a tap on the head adds a piercing there (aura pays for one they didn't ask for); a tap
  // on one takes it out
  pierce(q) {
    const s = this.s, wish = this.style.i >= 0 ? this.defs[this.style.i].wish : null;
    const k = s.pierced.findIndex((p) => Math.hypot(p.x - q.x, p.y - q.y) < 13);
    if (k >= 0) {
      const p = s.pierced.splice(k, 1)[0], at = headToStage(s, p.x, p.y);
      this.fx.ring(at.x, at.y, 4, 22, 0.3, '#ffffff', 4);
      if (p.cost) this.fx.text(at.x, at.y - 34, `+${p.cost}`, '#3fe0b5', 24);
      this.audio.tick();
    } else {
      if (eyeSide(s, q.x, q.y) >= 0) { this.hurtAt(q.x, q.y, 'bruise'); this.refreshKit(); return; } // not the eye!
      const p = pierceSpot(q.x, q.y);
      if (!p) { this.miss(q); return; }
      if (s.pierced.length >= PIERCE.max) { this.ui.toast('NO MORE ROOM'); this.audio.tink(0.5); return; }
      if (wish && wish.want === p.spot && !s.pierced.some((x) => x.spot === p.spot)) p.cost = 0; // the one they asked for
      s.pierced.push(p);
      const at = headToStage(s, p.x, p.y), odd = p.cost > PIERCE.usual;
      this.fx.ring(at.x, at.y, 3, 26, 0.32, '#ffffff', 5);
      this.fx.burst(at.x, at.y, 5, 200, { size: rand(8, 12) });
      if (p.cost) this.fx.text(at.x, at.y - 36, `-${p.cost}`, odd ? '#ff7d9a' : '#ffffff', odd ? 30 : 22);
      this.audio.tink(1.7);
      this.director.bump(0.25);
      react(s, 'squeeze', odd ? 0.6 : 0.35, 'wince');
      if (odd) s.sweat = Math.max(s.sweat, 0.6);
    }
    this.updateAura();
    this.ui.styleCost(pierceCost(s));
    this.refreshKit();
  }
  // a tap on the face sticks on a gem (star, heart, diamond in turn); a tap on one peels it off
  stick(q) {
    const s = this.s;
    const k = s.gems.findIndex((g) => Math.hypot(g.x - q.x, g.y - q.y) < 16);
    if (k >= 0) {
      const g = s.gems.splice(k, 1)[0], at = headToStage(s, g.x, g.y);
      this.fx.ring(at.x, at.y, 4, 22, 0.3, '#ffffff', 4);
      this.audio.tick();
    } else {
      if (eyeSide(s, q.x, q.y) >= 0) { this.hurtAt(q.x, q.y, 'bruise'); this.refreshKit(); return; } // not on the eye!
      if (!onFace(q.x, q.y, 0)) { this.miss(q); return; }
      if (s.gems.length >= GEMS.max) { this.ui.toast('NO MORE ROOM'); this.audio.tink(0.5); return; }
      this.gemN = (this.gemN || 0) + 1;
      s.gems.push({ x: q.x, y: q.y, kind: GEMS.kinds[this.gemN % GEMS.kinds.length], rot: rand(-0.35, 0.35) });
      const at = headToStage(s, q.x, q.y);
      this.fx.burst(at.x, at.y, 6, 220, { size: rand(8, 12) });
      this.audio.tink(1.9);
      this.director.bump(0.2);
      react(s, 'happy', 0.6, 'o');
    }
    this.ui.styleCost(null, this.styleCount('gems'));
    this.refreshKit();
  }
  // a tap on the hair clips one in (bow, star, heart in turn); a tap on one takes it out
  clip(q) {
    const s = this.s;
    const k = s.clips.findIndex((c) => Math.hypot(c.x - q.x, c.y - q.y) < 20);
    if (k >= 0) {
      const c = s.clips.splice(k, 1)[0], at = headToStage(s, c.x, c.y);
      this.fx.ring(at.x, at.y, 4, 22, 0.3, '#ffffff', 4);
      this.audio.tick();
    } else {
      if (!onPaint('dye', q.x, q.y)) { this.miss(q); return; }
      if (s.clips.length >= CLIPS.max) { this.ui.toast('NO MORE ROOM'); this.audio.tink(0.5); return; }
      this.clipN = (this.clipN || 0) + 1;
      s.clips.push({ x: q.x, y: q.y, kind: CLIPS.kinds[this.clipN % CLIPS.kinds.length], rot: rand(-0.5, 0.5) });
      const at = headToStage(s, q.x, q.y);
      this.fx.burst(at.x, at.y, 6, 220, { size: rand(8, 12) });
      this.audio.tink(1.6);
      this.director.bump(0.2);
      react(s, 'happy', 0.6, 'o');
    }
    this.ui.styleCost(null, this.styleCount('clips'));
    this.refreshKit();
  }
  // a tap over the eyes puts sunglasses on; each tap tries the next pair, then takes them off
  shade(q) {
    const s = this.s;
    if (!onEyes(q.x, q.y)) { this.miss(q); return; }
    s.shades = nextShades(s.shades);
    const at = headToStage(s, 0, 16);
    if (s.shades) {
      this.fx.burst(at.x, at.y, 8, 260, { size: rand(8, 12) });
      this.audio.tink(1.4);
      react(s, 'happy', 0.9, 'grin');
    } else { this.fx.ring(at.x, at.y, 6, 60, 0.3, '#ffffff', 4); this.audio.tick(); }
    this.director.bump(0.2);
    this.ui.styleCost(null, this.styleCount('shades'));
    this.refreshKit();
  }
  // scripted (?debug test runs): the wish done just as asked
  autoStyle() {
    const st = this.style;
    if (!st || st.i < 0) return;
    const w = this.defs[st.i].wish, s = this.s;
    if (PALETTES[w.id]) { this.pickSwatch(w.want); s[w.id].t = 1; }
    else if (w.id === 'pierce') { const a = SPOT_AT[w.want], p = pierceSpot(a.x, a.y); p.cost = 0; s.pierced.push(p); }
    else if (w.id === 'shades') s.shades = w.want;
    else if (w.id === 'clips') for (let k = 0; k < w.want; k++) s.clips.push({ x: -80 + k * 60, y: -180, kind: CLIPS.kinds[k % 3], rot: 0 });
    else for (let k = 0; k < w.want; k++) s.gems.push({ x: -60 + k * 40, y: -110, kind: GEMS.kinds[k % 3], rot: 0 });
  }
  // the first unfinished treatment in the row: the one to do next
  nextIdx() { return this.defs.findIndex((d, k) => !this.used.has(k)); }
  // Space: the next treatment in the level's own order
  chooseNext() {
    const i = this.nextIdx();
    if (i >= 0) this.choose(this.defs[i].id);
  }
  // between treatments: show the whole face and wait for a tool
  toPick() {
    this.tool = null; this.idx = -1; this.p = 0; this.spare = false;
    this.s.lookAt = null;
    this.ui.titleCard(false);
    this.director.go(this.view(VIEWS.pick), TRANSITION);
    this.director.setObstruction(this.ui.obstruction('play'));
    this.ui.pickPrompt(this.used.size / this.defs.length);
    this.ui.markNext(this.nextIdx());
    this.setMode('pick');
    this.refreshKit();
  }
  // o: a kind (testing), or { setup } the same patient again, or { from } a patient from
  // the waiting room (see makeSetup)
  startLevel(n, o = {}) {
    const t0 = performance.now();
    const g = this.g;
    if (typeof o === 'string') o = { kind: o };
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.level = n;
    if (this.salon) this.leaveSalon();
    this.setup = o.setup || this.makeSetup(n, o);
    resetState(this.s, this.setup);
    resetState(this.before, this.setup);
    this.dirt.setup(this.setup);
    this.buildTools();
    this.backdrop.fix(); // the room is put right for every level
    this.fx.clear();
    this.audio.stopLoops();
    this.scores = []; this.verdicts = []; this.timers = []; this.windowT = 0; // no look at the window carries over
    this.flash = 0; g.fail = 0; g.hit = 0; g.ghost = -1; g.prog = 0; g.hint = false;
    this.tool = null; this.idx = -1; this.style = null;
    this.used = new Set(); this.spares = {}; this.spare = false;
    this.clearHurts();
    this.ui.reset();
    this.refreshKit();
    this.ui.titleCard(false);
    this.ui.setLevel(n, this.progress.unlocked);
    this.ui.setSteps(this.defs, LEVELS[n].fresh);
    this.ui.setPass(LEVELS[n].pass);
    this.ui.levelSplash(n + 1, this.levelInfo(n));
    this.director.setObstruction(this.ui.obstruction('play'));
    this.director.go(this.view(VIEWS.intro), 0.6);
    // the new patient hops into the chair
    const s = this.s;
    s.hopV = -720;
    this.after(0.12, () => {
      const c = headToStage(s, 0, -40);
      this.fx.burst(c.x, c.y, 10, 360);
      this.fx.glitter(c.x, c.y + 120, 12, 300);
      this.audio.boing(1.05);
    });
    this.audio.whoosh(0.14);
    this.sayWish(1.1);
    this.setMode('arrive');
    this.retryMs = performance.now() - t0;
  }
  // ---------- the character creator (multiplayer, creator.js) ----------
  // a made patient's setup: who (people.js makeWho picks) and the problems they come in
  // with (creator.js PROBLEMS ids); seed keeps where the pimples, scars... sit while the
  // player changes other things
  customSetup(picks, problems, seed) {
    const has = (id) => problems.includes(id), rnd = Math.random;
    let r = seed | 0;
    Math.random = () => { r = (r + 0x6d2b79f5) | 0; let t = Math.imul(r ^ (r >>> 15), 1 | r); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try {
      const pimples = has('pimples') ? shuffle(PIMPLE_SPOTS.slice()).slice(0, 6) : [];
      return {
        level: -1, who: makeWho(picks), pimples, wish: null, extras: [], debris: [], worms: [], own: [], dent: null, tools: [],
        cracks: has('scars') ? some(CRACKS, 2) : [],
        spots: has('spots') ? pickSpots(8, pimples) : [],
        wrinkles: has('wrinkles') ? some(WRINKLES, 4) : [],
        jaw0: has('jaw') ? 0 : 0.7, mew0: has('slouch') ? 0 : 1,
        hair0: has('hair') ? 0 : 1, brow0: has('hair') ? 0 : 0.75,
        nose0: has('nose') ? 0 : 1, circ0: has('circles') ? 1 : 0, teeth0: has('teeth') ? 0 : 1,
        dirt: 0.8, seed: seed | 0, // grime is always there to rub back on; washed off unless they came in grimy (creator.js)
      };
    } finally { Math.random = rnd; }
  }
  // dress the patient in the chair as this setup (the creator's live preview)
  dressUp(setup, hop = true) {
    this.setup = setup;
    resetState(this.s, setup);
    resetState(this.before, setup);
    this.dirt.setup(setup);
    if (hop) this.s.hopV = -380;
  }
  // open the creator: the game steps aside (no HUD, no tools) and the patient in the chair
  // becomes the character being made
  // o: Creator.open's (o.timed: the making part of a multiplayer match)
  openCreator(o = {}) {
    if (this.mode === 'creator') return;
    this.closeKit();
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.tool = null; this.style = null; this.timers = []; this.windowT = 0;
    this.fx.clear(); this.audio.stopLoops();
    this.ui.reset();
    this.setMode('creator');
    this.director.setObstruction(this.ui.obstruction('creator'), true);
    this.director.go(this.view({ x: 0, y: 40, r: 360, rel: true }), 0.6);
    if (!this.creator) this.creator = new Creator(document.getElementById('ui'), this);
    this.creator.open(o);
  }
  // the creator closed (saved or not): back to the clinic, on the level the player was on,
  // or (?salon) straight into a salon turn on the character
  closeCreator() {
    const sv = Creator.saved(), after = this.afterCreator;
    if (after === 'mp' && this.multi) { this.afterCreator = null; this.multi.fromCreator(sv); }
    else if (after === 'salon' && sv) this.startSalon(sv.look);
    else this.startLevel(this.level);
  }
  // a salon turn on the player's own character (made now if there isn't one yet)
  trySalon() {
    const sv = Creator.saved();
    if (sv) this.startSalon(sv.look);
    else { this.afterCreator = 'salon'; this.openCreator(); }
  }
  // ---------- the salon (multiplayer turn, salon.js) ----------
  // a turn on a character: they sit down as their look, every unlocked tool is free to use
  // (no order, no scoring, no guides), and a countdown runs; at the bell the before and
  // after. o: { secs, onEnd(after look), again, done }
  startSalon(look, o = {}) {
    const t0 = performance.now();
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.setup = { level: this.level, who: look.who, tools: [], pimples: [], wish: null, extras: [], cracks: [], seed: 11, dirt: 0, jaw0: 0 };
    resetState(this.s, this.setup); resetState(this.before, this.setup);
    this.wearLook(look);
    this.buildTools(); // no order: everything is a free use
    // the grime as they came in, for the "before" side
    const bd = this.beforeDirt || (this.beforeDirt = document.createElement('canvas'));
    bd.width = this.dirt.canvas.width; bd.height = this.dirt.canvas.height;
    bd.getContext('2d').drawImage(this.dirt.canvas, 0, 0);
    this.backdrop.fix();
    this.fx.clear(); this.audio.stopLoops();
    this.scores = []; this.verdicts = []; this.timers = []; this.windowT = 0;
    this.flash = 0; this.g.fail = 0; this.g.hit = 0; this.g.ghost = -1; this.g.prog = 0; this.g.hint = false;
    this.tool = null; this.idx = -1; this.style = null;
    this.used = new Set(); this.spares = {}; this.spare = false;
    this.clearHurts();
    this.ui.reset();
    this.ui.setSteps([], []);
    this.refreshKit();
    this.ui.titleCard(false);
    this.salon = { left: o.secs || SALON_SECS, secs: o.secs || SALON_SECS, look, o };
    if (!this.salonUI) this.salonUI = new SalonUI(document.getElementById('ui'), { onAgain: () => this.salonAgain(), onDone: () => this.salonDone() });
    this.salonUI.show();
    this.salonUI.tick(this.salon.left);
    this.director.setObstruction(this.ui.obstruction('play'));
    this.director.go(this.view(VIEWS.pick), 0.6);
    this.s.hopV = -720;
    this.audio.whoosh(0.14);
    this.toPick();
    this.retryMs = performance.now() - t0;
  }
  // the bell: tools down, the before and after
  endSalon() {
    const sl = this.salon;
    if (!sl || sl.over) return;
    sl.over = true;
    this.closeKit();
    if (this.tool) { if (this.mode === 'holding' || this.mode === 'brushing') this.tool.cancel(); this.tool.exit(); }
    this.endStyle(false);
    this.tool = null; this.style = null;
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.ui.hidePrompt(); this.ui.hideTool(); this.ui.holding(false);
    sl.after = this.lookNow();
    this.salonUI.over(!sl.o.mp); // a multiplayer turn: no Again/Done (multi.js shows what's next)
    this.live = null;
    this.flash = 1;
    this.audio.thud(); this.director.shake(0.35);
    this.director.go(this.view(VIEWS.results), 1.2);
    this.director.setObstruction(this.ui.obstruction('reveal', this.revealBelow()));
    this.ui.layoutSplit(this.director.obsGoal);
    this.ui.el.ba.classList.add('in'); this.ui.setSplit(0);
    this.splitV = 0; this.splitUser = false;
    react(this.s, 'happy', 1.4, 'grin');
    this.setMode('reveal');
    if (sl.o.onEnd) sl.o.onEnd(sl.after);
  }
  // another turn on the character as it is now
  salonAgain() { if (this.salon && this.salon.over) this.startSalon(this.salon.after, this.salon.o); }
  // out of the salon: back to the clinic
  salonDone() {
    const sl = this.salon;
    this.leaveSalon();
    if (sl && sl.o.done) sl.o.done(sl.after); else this.startLevel(this.level);
  }
  leaveSalon() {
    this.salon = null; this.beforeDirt = null; this.live = null;
    if (this.salonUI) this.salonUI.hide();
    this.ui.el.ba.classList.remove('in');
  }
  // room the bar under a before and after takes (the salon's own, or the multiplayer sheet)
  revealBelow() {
    if (this.belowFn) return this.belowFn();
    return this.salonUI ? this.salonUI.endHeight() : 0;
  }
  // ---------- multiplayer (multi.js) ----------
  // step aside for the multiplayer screens with a character in the chair (look; null keeps
  // the one there). below(): room the screens take at the bottom
  showLook(look, below) {
    this.closeKit();
    if (this.salon) this.leaveSalon();
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.tool = null; this.style = null; this.timers = []; this.windowT = 0;
    this.fx.clear(); this.audio.stopLoops();
    this.ui.reset(); this.ui.titleCard(false);
    this.splitV = 0;
    this.pair = null;
    this.belowFn = below || null;
    if (look) {
      this.setup = { level: this.level, who: look.who, tools: [], pimples: [], wish: null, extras: [], cracks: [], seed: 11, dirt: 0, jaw0: 0 };
      resetState(this.s, this.setup); resetState(this.before, this.setup);
      this.wearLook(look);
      this.s.hopV = -380;
      this.audio.whoosh(0.1);
    }
    this.setMode('lobby');
    this.frameLook(true);
  }
  // keep the character clear of the multiplayer sheet (after it changes size)
  frameLook(snap = false) {
    this.director.setObstruction(this.ui.obstruction('reveal', this.revealBelow()), snap);
    this.director.go(this.view({ x: 0, y: -30, r: 200, rel: true }), snap ? 0.6 : 0.4);
  }
  // the other player's reaction to my work lands: a little show on the character in the chair
  cheer(kind) {
    const c = headToStage(this.s, 0, -80);
    if (kind === 'love') { this.fx.glitter(c.x, c.y, 18, 380); this.fx.burst(c.x, c.y, 10, 300); this.audio.boing(1.2); }
    else if (kind === 'funny') { this.fx.burst(c.x, c.y, 14, 420); this.s.hopV = -520; this.audio.boing(1.4); }
    else { this.director.shake(0.25); this.audio.thud(); }
  }
  // the sheet under a before and after changed size
  reframeReveal() {
    this.director.setObstruction(this.ui.obstruction('reveal', this.revealBelow()));
    if (this.mode === 'reveal') this.ui.layoutSplit(this.director.obsGoal);
  }
  // characters as they came out, side by side (3 or 4: two rows): [{ look, title, by }, ...]
  pairLooks(items, below) {
    this.showLook(null, below);
    this.pair = items.map((it) => {
      const r = fromLook(it.look), dirt = new Dirt();
      dirt.setup(r.setup); dirt.applyWiped(r.wiped);
      return { s: r.s, dirt, title: it.title, by: it.by };
    });
  }
  drawPair(ctx, W, H, time) {
    const F = this.director.free, n = this.pair.length;
    const cols = n <= 2 ? n : 2, rows = Math.ceil(n / cols), w = F.w / cols, h = F.h / rows;
    this.pair.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      // a short last row sits in the middle
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const x = F.x + (F.w - inRow * w) / 2 + w * col, f = { x, y: F.y + h * row, w, h };
      ctx.save();
      ctx.beginPath(); ctx.rect(x, f.y, w, f.h); ctx.clip();
      const k = Math.min((f.h - 56) / 700, w / 470), c = headToStage(p.s, 0, 10);
      ctx.translate(x + w / 2, f.y + (f.h - 56) * 0.5); ctx.scale(k, k); ctx.translate(-c.x, -c.y);
      drawPatient(ctx, p.s, time, p.dirt.canvas);
      ctx.restore();
      // whose, and who worked on it
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 13px Fredoka, system-ui, sans-serif';
      const t1 = p.title.toUpperCase(), t2 = p.by;
      const tw = Math.min(w - 12, Math.max(ctx.measureText(t1).width, (ctx.font = '500 12px Fredoka, system-ui, sans-serif', ctx.measureText(t2).width)) + 22);
      const cx = x + w / 2, y = f.y + f.h - 48;
      ctx.beginPath(); ctx.roundRect(cx - tw / 2, y, tw, 40, 14); ctx.fillStyle = 'rgba(58,39,71,.8)'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 13px Fredoka, system-ui, sans-serif'; ctx.fillText(t1, cx, y + 17, tw - 12);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.font = '500 12px Fredoka, system-ui, sans-serif'; ctx.fillText(t2, cx, y + 32, tw - 12);
      ctx.restore();
    });
    if (n === 2) { // a thin line between them
      ctx.save(); ctx.strokeStyle = 'rgba(58,39,71,.14)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(F.x + w, F.y + 24); ctx.lineTo(F.x + w, F.y + F.h - 70); ctx.stroke(); ctx.restore();
    }
  }
  // my character before and after the other player's turn on it
  revealLooks(before, after, below) {
    this.showLook(before, below);
    const bd = this.beforeDirt || (this.beforeDirt = document.createElement('canvas'));
    bd.width = this.dirt.canvas.width; bd.height = this.dirt.canvas.height;
    bd.getContext('2d').drawImage(this.dirt.canvas, 0, 0);
    this.wearLook(after, false);
    this.flash = 1;
    this.audio.thud(); this.director.shake(0.35);
    this.director.go(this.view(VIEWS.results), 1.2);
    this.director.setObstruction(this.ui.obstruction('reveal', this.revealBelow()));
    this.ui.layoutSplit(this.director.obsGoal);
    this.ui.el.ba.classList.add('in'); this.ui.setSplit(0);
    this.splitV = 0; this.splitUser = false;
    react(this.s, 'happy', 1.4, 'grin');
    this.setMode('reveal');
  }
  // the small live window: my character as the other player has it right now (null: none)
  setLive(look) {
    if (!look) { this.live = null; return; }
    try {
      const r = fromLook(look);
      const lv = this.live || (this.live = { s: null, dirt: this.liveDirt || (this.liveDirt = new Dirt()), key: '' });
      const key = `${r.setup.seed}|${r.setup.dirt}|${r.setup.jaw0}`;
      if (lv.key !== key) { lv.dirt.setup(r.setup); lv.key = key; }
      lv.dirt.applyWiped(r.wiped);
      if (lv.s) { for (const k of ['look', 'lookAt', 'blink', 'blinkT', 'bob', 'expr', 'mouth']) if (k in lv.s) r.s[k] = lv.s[k]; }
      lv.s = r.s;
    } catch { /* a look that doesn't load: keep the last one */ }
  }
  drawLive(ctx, W, H, time) {
    const lv = this.live;
    if (!lv || !lv.s || !this.salon || this.salon.over) return;
    const w = Math.round(Math.min(132, W * 0.26)), h = Math.round(w * 1.2);
    const x = W - w - 12, y = Math.max(64, this.ui.obstruction('play').top);
    ctx.save();
    ctx.shadowColor = 'rgba(58,39,71,.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fillStyle = '#fff4fa'; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    const k = h / 560, c = headToStage(lv.s, 0, 30);
    ctx.translate(x + w / 2, y + h * 0.5); ctx.scale(k, k); ctx.translate(-c.x, -c.y);
    drawPatient(ctx, lv.s, time, lv.dirt.canvas);
    ctx.restore();
    ctx.save();
    ctx.font = '700 12px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center';
    const lw = ctx.measureText('YOURS').width + 16;
    ctx.beginPath(); ctx.roundRect(x + w / 2 - lw / 2, y + h - 26, lw, 20, 10); ctx.fillStyle = 'rgba(58,39,71,.78)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('YOURS', x + w / 2, y + h - 12);
    ctx.restore();
  }
  // ---------- looks (multiplayer, look.js) ----------
  // the patient in the chair as a look
  lookNow() { return toLook(this.s, this.dirt, this.setup); }
  // put a look on the patient in the chair (its grime too); before: also as the "before"
  wearLook(look, before = true) {
    const r = fromLook(look);
    Object.assign(this.s, r.s);
    if (before) Object.assign(this.before, fromLook(look).s);
    this.setup = { ...this.setup, who: r.s.who, seed: r.setup.seed, dirt: r.setup.dirt, jaw0: r.setup.jaw0 };
    this.dirt.setup(r.setup);
    this.dirt.applyWiped(r.wiped);
  }
  // a free use of a tool: one this patient doesn't need, or needs but has had already. It
  // scores nothing; it keeps its own progress until it is finished
  beginSpare(id) {
    if (!this.spares[id]) { this.spares[id] = new REGISTRY[id](this.g, this.defFor(id)); this.spares[id].free = true; }
    this.beginTool(-1, this.spares[id]);
  }
  beginTool(i, spare = null) {
    const tool = spare || this.tools[i], def = tool.def;
    this.spare = !!spare;
    this.ui.closeKit();
    // a glow carries on from what it had; everything else starts each target from zero
    this.idx = i; this.tool = tool; this.p = def.multiHold ? tool.p : 0; this.sweet = null;
    this.ghost = !spare && !this.g.known.has(def.id) && !this.seenHint.has(def.id);
    tool.outro = false; tool.outroT = 0;
    // first time out it sets up; picked again after being left, it carries on
    if (tool.begun) tool.resume(); else { tool.enter(); tool.begun = true; }
    this.entered.add(tool);
    if (spare && !def.brush) {
      // what is already fine is skipped, except by the one-value treatments, which carry
      // on from how the patient is (and can overdo it); with nothing left it says so
      tool.done = tool.done.map((d, k) => d || (!tool.pushes && tool.fixed(k)));
      if (tool.left() === 0) this.after(TRANSITION * 0.7, () => { if (this.tool === tool) this.ui.toast('NOTHING TO FIX'); });
    }
    this.director.go(this.view(this.viewFor(def)), TRANSITION);
    this.director.setObstruction(this.ui.obstruction('play'));
    this.ui.titleCard(false);
    this.ui.showTool(def, i);
    this.ui.markNext(-1);
    this.ui.hidePrompt();
    this.audio.whoosh(0.12);
    this.setMode('transition');
    this.refreshKit();
  }
  ready() {
    const def = this.tool.def;
    this.setMode('ready');
    this.ui.prompt(def.prompt, this.ghost);
    // still pressing from before the treatment was ready: treat it as a fresh press
    if (this.input.held) this.press(this.input.src);
  }
  // where the finger is, in stage and head space
  pointer() {
    const st = this.director.toStage(this.input.x, this.input.y);
    const h = stageToHead(this.s, st.x, st.y);
    return { x: h.x, y: h.y, sx: st.x, sy: st.y };
  }
  press(src) {
    const tool = this.tool;
    if (tool.def.brush) { this.startBrush(src); return; }
    if (src === 'key') { const i = tool.nextIndex(); if (i >= 0) this.startHold(i); return; }
    const q = this.pointer();
    const i = tool.hitTest(q.x, q.y, q.sx, q.sy, FINGER / this.director.out.s);
    if (i >= 0) this.startHold(i); else this.wrongSpot(q, tool);
  }
  // a press that missed every target: whatever the tool does there anyway (tweezers pluck
  // a hair...); a free use never hurts, only ripples; a needed tool on the face hurts there
  // (the eyes most), unless it was only just off a target; off the face only a ripple
  wrongSpot(q, tool) {
    if (eyeSide(this.s, q.x, q.y) >= 0) { tool.nudge = 0; this.hurtAt(q.x, q.y, HURT_KIND[tool.def.id] || 'bruise'); return; } // any tool in an eye hurts
    if (tool.freeSpot(q)) return;
    if (touch(this, tool.def.id, q)) { tool.nudge = 0; return; } // what the real tool does there (world.js)
    if (this.spare) { this.miss(q); return; }
    const minR = FINGER / this.director.out.s;
    const near = tool.targets().some((t, i) => !tool.done[i] && Math.hypot(q.x - t.x, q.y - t.y) <= Math.max(tool.hitR(t), minR) + 18);
    if (near || !(onFace(q.x, q.y, 4) || eyeSide(this.s, q.x, q.y) >= 0)) { this.miss(q); return; }
    if (tool.def.mouth && inMouth(q.x, q.y)) { this.miss(q); return; } // a wrong tooth: no harm
    tool.nudge = 1;
    this.hurtAt(q.x, q.y, HURT_KIND[tool.def.id] || 'bruise');
  }

  // ---------- the tool in hand ----------
  // tools that don't draw themselves (pop, mew, every style tool) show their kit icon:
  // at the finger while it is down, bobbing beside the face while it is up
  drawHeld(ctx, time) {
    const mk = this.mode === 'creator' && this.creator && this.creator.tool;
    const id = mk ? mk.icon : this.style ? this.style.def.icon : this.tool && HELD_ICON.has(this.tool.def.id) && this.entered.has(this.tool) && !this.tool.outro ? this.tool.def.icon : null;
    if (!id || (!mk && !PLAYING.has(this.mode)) || this.mode === 'transition') return;
    const img = heldImage(id);
    if (!img) return;
    const S = 92 / this.director.out.s; // about 92 px on screen at any zoom
    let x, y;
    if (this.input.held && this.input.src === 'pointer') { const q = this.pointer(); x = q.sx + S * 0.18; y = q.sy - S * 0.62; }
    else { const h = headToStage(this.s, 168, -40); x = h.x; y = h.y + Math.sin(time * 3) * 8; }
    const F = S * HELD_PX / 192; // the canvas is a little bigger than the icon (the shadow)
    ctx.drawImage(img, x - F / 2, y - F / 2, F, F);
  }

  // ---------- the room ----------
  // the laser off the patient (q: the finger, stage and head space): it pops a bubble,
  // glances off the glass in the doorway, or (the glass gone) hits whoever waits there,
  // who runs off. Returns what it hit, for the beam.
  env(q, dt) {
    const sc = this.director.toScreen(q.sx, q.sy), b = this.backdrop, time = this.g.time;
    const pop = b.popBubble(sc.x, sc.y, time);
    if (pop) {
      this.fx.ring(q.sx, q.sy, 4, 30, 0.3, '#ffffff', 3);
      this.fx.burst(q.sx, q.sy, 5, 160, { size: rand(6, 9) });
      this.audio.pop(1.8);
      return 'bubble';
    }
    const P = placeOf(this, q);
    if (P.at === 'glass' || P.at === 'customer') this.lookWindow();
    if (P.at === 'glass') {
      this.glintT = (this.glintT || 0) - dt;
      if (this.glintT <= 0) { this.glintT = 0.12; this.fx.spark(q.sx + rand(-8, 8), q.sy + rand(-8, 8), { size: rand(8, 12), col: '#ffffff', vy: -40, life: 0.3 }); }
      return 'glass';
    }
    if (P.at === 'customer') {
      this.zapT = (this.zapT || 0) + dt;
      if (this.zapT > 0.2) {
        this.zapT = 0;
        this.waiting.zap(P.w);
        this.fx.text(q.sx, q.sy - 40, 'OUCH!', '#ff7d9a', 28, 1);
        this.fx.puff(q.sx, q.sy, 3, '120,110,120');
        this.audio.nick();
        react(this.s, 'wide', 1.2, 'o'); // the patient in the chair can't believe it
      }
      return 'customer';
    }
    this.zapT = 0;
    // anything else it rests on burns: the clothes, the walls, the curtains, the lamp
    const h = this.laserHot;
    if (h && Math.hypot(h.x - q.sx, h.y - q.sy) < 24 / this.director.out.s) h.t += dt;
    else this.laserHot = { x: q.sx, y: q.sy, t: 0 };
    if (this.laserHot.t > 0.6) { this.laserHot.t = 0; this.worldLast = null; touch(this, 'laser', q, { brush: true, hot: true }); }
    return P.at === 'none' ? null : 'room';
  }
  // the mallet off the patient: on the glass it cracks it, the third hit shatters it.
  // Returns true when it hit the glass.
  smash(q) {
    const sc = this.director.toScreen(q.sx, q.sy), b = this.backdrop, p = b.roomAt(sc.x, sc.y);
    if (!b.inDoor(p) || b.glass.broken) return false;
    const r = b.hitGlass(p);
    this.lookWindow();
    this.director.shake(r === 'break' ? 0.02 : 0.008);
    if (r === 'break') {
      this.fx.burst(q.sx, q.sy, 14, 520, { size: rand(10, 16), col: '#d8f4ff' });
      this.fx.text(q.sx, q.sy - 50, 'SMASH!', '#ffffff', 34, 1.1);
      this.audio.nick(); this.audio.boing(0.6);
      this.waiting.react('eye');
      react(this.s, 'wide', 1.4, 'o');
    } else {
      this.fx.ring(q.sx, q.sy, 6, 40, 0.3, '#ffffff', 4);
      this.fx.text(q.sx, q.sy - 40, 'CRACK!', '#ffffff', 24, 0.8);
      this.audio.tink(0.7);
      this.waiting.react('skin');
    }
    return true;
  }

  // ---------- hurts and feelings (mood.js) ----------
  clearHurts() {
    this.hurtCost = 0; this.hurtList = []; this.eyeHits = 0;
    this.eyeCool = [0, 0]; this.sayCool = 0; this.stingCool = 0;
    this.feel = null; this.temper = null; this.fitT = 0; this.fits = 0;
  }
  // aura lost to piercings and hurts
  minus() { return pierceCost(this.s) + this.hurtCost; }
  // a tool where there is nothing to treat hurts (head-space x, y): it leaves a mark (kind:
  // burn, bruise, rash) and costs aura; in an eye it squeezes shut, waters, stays red, and
  // costs much more. `free`: the treatment scores the mark itself (the laser's burns).
  hurtAt(x, y, kind, free = false) {
    const s = this.s, who = s.who, side = eyeSide(s, x, y), at = headToStage(s, x, y), t = this.g.time;
    if (side >= 0) {
      if (t < this.eyeCool[side]) return false; // one sweep across an eye counts once
      this.eyeCool[side] = t + 1.2;
      this.eyeHits++;
      s.eyeRed[side] = Math.min(1, s.eyeRed[side] + 0.7);
      s.eyeShut[side] = 2.2; s.tears[side] = 1;
      s.pain += 2.5;
      s.mood = Math.max(-1, s.mood - 0.5);
      react(s, 'squeeze', 1.2, 'wince');
      s.tiltV += (side ? 1 : -1) * 3.2; s.sqV += 1.4;
      this.fx.drops(at.x, at.y, 7, '#9fe2ff');
      this.fx.ring(at.x, at.y, 6, 54, 0.4, '#ff4d6d', 6);
      this.director.shake(0.55);
      this.audio.nick(); this.audio.boing(0.5);
    } else {
      if (!free) { s.hurts.push({ x, y, kind, t: 0 }); if (s.hurts.length > 16) s.hurts.shift(); }
      s.pain += 1;
      s.mood = Math.max(-1, s.mood - 0.25);
      react(s, 'squeeze', 0.7, 'wince');
      s.tiltV += (x < 0 ? -1 : 1) * 1.6;
      this.fx.ring(at.x, at.y, 5, 34, 0.35, '#ff7d9a', 5);
      if (kind === 'burn') this.fx.puff(at.x, at.y, 3, '190,180,200');
      this.director.shake(0.25);
      this.audio.nick();
    }
    s.sweat = 1; s.flush = 1; this.g.fail = 1;
    // it stays with them: a temper builds (sad ones just sink, through the mood above)
    if (['angry', 'grumpy', 'cold'].includes(temperOf(who))) s.anger = Math.min(0.55, s.pain * 0.1);
    this.waiting.react(side >= 0 ? 'eye' : 'skin');
    const cost = free ? 0 : side >= 0 ? HURT.eye : HURT.skin;
    if (cost) {
      this.hurtCost += cost;
      this.hurtList.push(side >= 0 ? 'eye' : 'skin');
      this.fx.text(at.x, at.y - 34, `-${cost}`, '#ff7d9a', 24);
      this.updateAura();
    }
    // and they say so, in their own words
    if (t >= this.sayCool) {
      this.sayCool = t + 0.9;
      const h = headToStage(s, (side >= 0 ? side * 2 - 1 : x < 0 ? -1 : 1) * 60, -190);
      this.fx.text(h.x, h.y, lineFor(who, side >= 0 ? 'eye' : 'skin'), '#ffffff', 26, 1.3);
    }
    return true;
  }
  // soap in an eye while washing: it stings and waters for a moment, no harm done
  sting(side) {
    const s = this.s, t = this.g.time;
    if (t < this.stingCool) return;
    this.stingCool = t + 3;
    s.eyeShut[side] = Math.max(s.eyeShut[side], 0.8);
    s.tears[side] = Math.max(s.tears[side], 0.5);
  }
  // the face for how they feel about the job; `final`: the one held on the results screen
  setFace(final) {
    const s = this.s;
    let [expr, mouth, mood, anger, cry, bored] = faceFor(this.feel, this.temper);
    if (!final && (this.feel === 'thrilled' || this.feel === 'pleased')) { expr = 'happy'; mouth = 'grin'; } // the reveal: delighted
    if (final && this.feel === 'thrilled' && this.rankName === 'LEGENDARY') { expr = 'wink'; mouth = 'smirk'; }
    s.exprBase = expr; s.mouthBase = mouth; s.mood = mood; s.anger = anger; s.cry = cry; s.bored = bored;
    react(s, expr, 0.01, mouth);
  }
  // a bad job keeps showing on the face and in fits, by temper: steam and head shakes,
  // sobs, a cold look away with a sigh, a grumbling head shake
  fit(dt) {
    if (!BAD.has(this.feel)) return;
    this.fitT -= dt;
    if (this.fitT > 0) return;
    const s = this.s, T = this.temper, hard = this.feel === 'furious', k = ++this.fits;
    if (T === 'angry' || (hard && (T === 'grumpy' || T === 'cold'))) {
      this.fitT = hard ? 0.26 : 0.42;
      for (const side of [-1, 1]) { const e = headToStage(s, side * 166, 12); this.fx.puff(e.x, e.y, 1, '255,255,255'); }
      if (k % 6 === 1) { s.tiltV += (k % 12 === 1 ? 1 : -1) * (hard ? 3 : 2); s.sqV -= 0.9; if (hard) this.director.shake(0.2); }
    } else if (T === 'sad' || T === 'drama') {
      this.fitT = 0.5;
      s.sqV += hard || T === 'drama' ? 1.4 : 0.8; // sobbing
    } else if (T === 'grumpy') {
      this.fitT = 0.3;
      if (k % 8 < 4) s.tiltV += (k % 2 ? 1 : -1) * 1.6; // shakes the head
    } else { // cold: looks away, sighs
      this.fitT = 1.6;
      s.lookAt = { x: (k % 2 ? 1 : -1) * 120, y: -130 };
      const m = headToStage(s, 30, 132); this.fx.puff(m.x, m.y, 1, '235,235,245');
    }
  }
  // the camera turns to the waiting room window for as long as a look in the mouth lasts
  // (a tap on it, or a tool at the glass or the customers), then back to what it was on
  lookWindow() {
    const t = this.g.time, first = !(this.windowT > t);
    this.windowT = t + PEEK;
    if (!first) return; // already looking: the hold just runs longer
    this.director.go(WAIT_VIEW, 0.5);
    const back = () => {
      if (this.g.time < this.windowT) { this.after(this.windowT - this.g.time, back); return; } // looked again since
      this.windowT = 0;
      if (PLAYING.has(this.mode)) this.director.go(this.view(this.backView()), 0.6);
    };
    this.after(PEEK, back);
  }
  // the view the game is on when it isn't looking at the window
  backView() {
    if (this.style) return this.viewFor(this.style.def);
    if (this.tool && this.mode !== 'pick' && this.mode !== 'outro') return this.viewFor(this.tool.def);
    return VIEWS.pick;
  }
  // a tap on the room by the doorway while picking: a look at the window
  peekWindow() {
    const P = placeOf(this, this.pointer());
    if (!P.p || P.p.x > DOOR.x + DOOR.w + 150) return false;
    this.lookWindow();
    this.waiting.react('perfect');
    this.audio.tick();
    return true;
  }
  // a tap on the mouth while picking: they open wide for a moment, teeth and all
  peek() {
    const q = this.pointer(), s = this.s;
    if (!inMouth(q.x, q.y)) return false;
    react(s, 'normal', 1.8, 'aah');
    s.lookAt = { x: 0, y: 200 };
    this.after(PEEK + 0.1, () => { if (this.mode === 'pick') s.lookAt = null; });
    this.director.go(this.view({ x: 0, y: 120, r: 170, rel: true }), 0.5);
    this.after(PEEK, () => { if (this.mode === 'pick') this.director.go(this.view(VIEWS.pick), 0.6); });
    this.audio.boing(1.2);
    return true;
  }
  // a press that missed every target: a ripple where it landed, and the targets flash
  miss(q) {
    if (this.tool) this.tool.nudge = 1;
    this.fx.ring(q.sx, q.sy, 8, 46, 0.35, '#ff9fb8', 5);
    this.audio.tink(0.5);
  }
  startHold(i) {
    const tool = this.tool, def = tool.def;
    tool.cur = i;
    if (!def.multiHold) { this.p = 0; tool.p = 0; }
    this.sweet = tool.sweetFor(i);
    this.setMode('holding');
    this.seenHint.add(def.id);
    this.ghost = false;
    this.g.ghost = -1;
    tool.begin(i);
    this.ui.holding(true);
  }
  startBrush(src) {
    this.brushKey = src === 'key';
    this.setMode('brushing');
    this.seenHint.add(this.tool.def.id);
    this.ghost = false;
    this.tool.begin(-1);
    this.ui.holding(true);
  }
  // one target let go: score it against its own sweet zone
  releaseTarget() {
    const tool = this.tool, i = tool.cur, n = tool.targets().length;
    // a free use of a one-value treatment: no timing to judge, only whether it went too far
    let r = this.spare && tool.pushes ? { score: 0, verdict: tool.over() ? 'late' : 'good', free: true } : scoreRelease(this.p, this.sweet);
    r = tool.releaseTarget(i, this.p, r) || r;
    tool.done[i] = true; tool.cur = -1;
    tool.tScores.push(r.score); tool.tVerdicts.push(r.verdict);
    this.ui.holding(false);
    const sum = tool.tScores.reduce((a, b) => a + b, 0);
    if (n > 1) {
      this.miniFeedback(r, tool.targets()[i]);
      if (tool.def.scored && !this.spare) { this.scores[this.idx] = sum / n; this.updateAura(); }
    }
    if (tool.left() > 0) { this.p = 0; tool.p = 0; this.g.prog = 0; this.setMode('ready'); return; }
    // every target done: the treatment scores their average
    const avg = Math.round(sum / n);
    let verdict = r.verdict;
    if (n > 1) {
      const count = (v) => tool.tVerdicts.filter((x) => x === v).length;
      verdict = avg >= 95 ? 'perfect' : avg >= 80 ? 'good' : count('late') > count('early') ? 'late' : 'early';
    }
    this.finishTool({ score: avg, verdict, free: r.free });
  }
  // a tool's first real treatment is done: from now on it shows no guides
  learn(id) {
    const k = this.g.known;
    if (k.has(id)) return;
    k.add(id);
    try { localStorage.setItem(KNOWN_KEY, JSON.stringify([...k])); } catch { /* not saved: guides again next visit */ }
  }
  finishTool(result) {
    const tool = this.tool;
    result = tool.finish(result) || result;
    tool.outro = true;
    if (this.spare) delete this.spares[tool.def.id]; // a free use: next time is a fresh one
    else {
      this.scores[this.idx] = result.score;
      this.verdicts[this.idx] = result.verdict;
      this.used.add(this.idx);
      this.learn(tool.def.id);
    }
    this.refreshKit();
    this.feedback(result);
    this.ui.holding(false);
    this.ui.hidePrompt();
    this.setMode('outro');
  }
  // a small word over each target as it is done
  miniFeedback(r, t) {
    const s = this.s, w = headToStage(s, t.x, t.y);
    const good = r.verdict === 'perfect' || r.verdict === 'good';
    this.fx.text(w.x, w.y - 44, WORD[r.verdict], r.verdict === 'perfect' ? '#ffc93c' : good ? '#ffffff' : '#ff7d9a', 24);
    if (good) { this.g.hit = 1; this.director.bump(0.35); s.mood = Math.min(1, s.mood + 0.05); }
    else { this.g.fail = 1; this.director.shake(0.14); }
  }
  scored() { return this.defs.map((d, i) => i).filter((i) => this.defs[i].scored); }
  updateAura() {
    const idx = this.scored();
    if (idx.length) this.ui.setAura(this.auraNow());
  }
  auraNow() { return auraOf(this.scored().map((i) => this.scores[i] || 0), this.minus()); }
  // scored: it counts toward the aura (a free use or an unscored treatment doesn't)
  feedback(r, scored = !!this.tool.def.scored && !this.spare) {
    const s = this.s;
    const good = r.verdict === 'perfect' || r.verdict === 'good';
    this.ui.stamp(r.score, good ? r.verdict : 'fail', r.free && !good ? 'over' : r.verdict, scored);
    this.audio.stamp();
    if (good) {
      this.audio.success();
      s.mood = Math.min(1, s.mood + 0.27);
      this.g.hit = 1;
      this.director.bump(1);
      s.sqV += 1.6;
      if (r.verdict === 'perfect') {
        this.audio.perfect();
        this.waiting.react('perfect');
        const c = headToStage(s, 0, -60);
        this.fx.hearts(c.x, c.y - 120, 3);
        for (let i = 0; i < 2; i++) this.fx.burst(c.x + rand(-160, 160), c.y + rand(-120, 120), 6, 220);
      }
    } else {
      this.audio.fail();
      s.mood = Math.min(1, s.mood + 0.06);
      this.g.fail = 1;
      this.director.shake(0.3);
      s.sweat = 1;
      s.tiltV += 2.2;
    }
    this.updateAura();
    if (!this.spare) this.ui.stepDone(this.idx, good);
  }
  nextTool() {
    if (this.tool) this.tool.exit();
    this.afterTool();
  }
  // everything in the order done: the finale; else pick the next
  afterTool() {
    if (this.salon) { this.toPick(); return; } // the salon has no order: just the next tool
    if (this.used.size >= this.defs.length) this.startFinale();
    else this.toPick();
  }
  startFinale() {
    const s = this.s;
    this.setMode('finale');
    this.ui.markNext(-1);
    this.ui.hideTool();
    this.ui.hidePrompt();
    s.lookAt = null;
    // how they take the job: the aura and the hurts decide, their temper shows it
    this.feel = feelingFor(this.auraNow(), LEVELS[this.level].pass, s.pain, this.eyeHits);
    this.temper = temperOf(s.who);
    this.fitT = 0.3; this.fits = 0;
    this.setFace(false);
    this.director.go(this.view(VIEWS.reveal), 1.1);
    const bad = BAD.has(this.feel);
    this.after(bad ? 0.35 : 0.55, () => {
      const h = headToStage(s, 0, -262);
      this.fx.text(h.x, h.y, lineFor(s.who, this.feel), bad ? '#ff7d9a' : '#ffffff', 30, 1.7);
    });
    const feel = this.feel;
    this.after(0.7, () => this.waiting.react(feel));
    if (bad) { this.audio.fail(); this.director.shake(this.feel === 'furious' ? 0.5 : 0.25); }
    else if (this.feel === 'meh') { s.sqV += 1.2; this.audio.boing(0.8); } // a shrug
    else {
      this.audio.fanfare();
      const hop = (v) => () => {
        s.hopV = -v; s.sqV += 2.4;
        const c = headToStage(s, 0, -40);
        this.fx.burst(c.x, c.y, 14, 420);
        this.fx.glitter(c.x, c.y + 140, 18, 380);
        this.audio.boing(1.1);
      };
      this.after(0.3, hop(820));
      if (this.feel === 'thrilled') this.after(0.95, hop(640));
    }
    this.after(FINALE - 0.42, () => this.audio.flash());
    this.after(FINALE, () => this.showResults());
  }
  showResults() {
    const s = this.s, n = this.level;
    const idx = this.scored();
    const scores = idx.map((i) => this.scores[i] || 0);
    const minus = this.minus();
    const aura = auraOf(scores, minus);
    const { rank, next, toNext } = rankFor(aura);
    let worst = -1, ws = 101;
    scores.forEach((v, k) => { if (v < ws) { ws = v; worst = k; } });
    if (ws >= 100) worst = -1;
    const P = this.progress;
    const newBest = aura > (P.best[n] || 0);
    if (newBest) P.best[n] = aura;
    this.passed = aura >= LEVELS[n].pass;
    const had = P.unlocked;
    if (this.passed && n + 1 < LEVELS.length) P.unlocked = Math.max(P.unlocked, n + 2);
    // passing opens the next level; the treatment it brings in, if any
    const unlock = this.passed && n + 1 < LEVELS.length ? this.levelInfo(n + 1).fresh : [];
    saveProgress(P);
    this.playables.save(P);
    this.playables.sendScore(P.best.reduce((a, b) => a + (b || 0), 0));
    if (this.cloud) this.cloud.save(P);
    this.flash = 1;
    this.director.go(this.view(VIEWS.results), 1.2);
    // the face they leave with: how they feel about the job (set at the finale)
    this.rankName = rank.name;
    if (!this.feel) { this.feel = feelingFor(aura, LEVELS[n].pass, s.pain, this.eyeHits); this.temper = temperOf(s.who); }
    this.setFace(true);
    this.ui.setLevel(n, P.unlocked);
    this.ui.showResults({
      aura, rank: rank.name, next: next && next.name, toNext, near: !!next && toNext < 6, worst,
      bars: idx.map((i, k) => ({ icon: this.defs[i].icon, name: this.defs[i].name, score: scores[k] })),
      pierce: { count: s.pierced.length, minus: pierceCost(s) },
      hurt: { list: this.hurtList, minus: this.hurtCost },
      say: { text: lineFor(s.who, this.feel), feel: this.feel },
      best: P.best[n], newBest, passed: this.passed, last: n + 1 === LEVELS.length, unlock,
    });
    // a new tool unlocked for the first time: a pop-up with a button straight into its level
    if (unlock.length && P.unlocked > had) this.after(1.6, () => { if (this.mode === 'results') this.ui.showUnlock(unlock[0], n + 2); });
    this.director.setObstruction(this.ui.obstruction('results'));
    this.ui.layoutSplit(this.director.obsGoal);
    this.after(0.22, () => {
      this.audio.thud(); this.director.shake(0.35);
      const big = this.passed && n + 1 === LEVELS.length;
      if ((aura >= 70 && !BAD.has(this.feel)) || big) { this.fx.confetti(window.innerWidth, big || aura >= 95 ? 150 : 80); this.audio.cheer(); }
    });
    this.splitV = 0; this.splitUser = false;
    this.setMode('results');
  }
  retry() { if (this.mode !== 'next') this.startLevel(this.level, { setup: this.setup }); } // the same patient, a fresh start
  // progress saved on the platform (another device) merges with the local copy
  mergeProgress(o) {
    const P = this.progress;
    P.unlocked = Math.max(P.unlocked, Math.min(LEVELS.length, parseInt(o.unlocked, 10) || 1));
    if (Array.isArray(o.best)) P.best = P.best.map((v, i) => Math.max(v, Math.min(100, parseInt(o.best[i], 10) || 0)));
    saveProgress(P);
    if (this.mode === 'intro' || this.mode === 'results') this.ui.setLevel(this.level, P.unlocked);
  }
  // "Next!": the camera turns to the waiting room, the front patient gets up and walks
  // through, the rest move up a seat, and then the new patient hops into the chair. A
  // pass moves on a level; a fail plays the same level with this new patient.
  nextLevel() {
    if (this.mode !== 'results') return;
    const n = this.passed ? (this.level + 1) % LEVELS.length : this.level;
    this.setMode('next');
    this.timers = []; this.windowT = 0;
    this.ui.reset();
    this.director.setObstruction(this.ui.obstruction('play'));
    this.director.go(WAIT_VIEW, 0.75);
    this.audio.whoosh(0.14);
    let from = null;
    this.after(0.75, () => { from = this.waiting.callNext(n); this.audio.boing(0.9); });
    this.after(CALL, () => this.startLevel(n, from ? { from } : { avoid: [this.s.who.kind] }));
  }
  setSplit(v) { this.splitV = v; this.splitUser = true; }
  resize() {
    if (this.mode === 'results') {
      this.director.setObstruction(this.ui.obstruction('results'), true);
      this.ui.layoutSplit(this.director.obsGoal);
    } else if (this.mode === 'reveal' || this.mode === 'lobby') {
      this.director.setObstruction(this.ui.obstruction('reveal', this.revealBelow()), true);
      if (this.mode === 'reveal') this.ui.layoutSplit(this.director.obsGoal);
    } else this.director.setObstruction(this.ui.obstruction(this.mode === 'intro' ? 'intro' : 'play'), true);
  }

  // ---------- input ----------
  onDown(src) {
    this.audio.init();
    if (this.tut && this.tut.active) return; // a coach mark is up: it takes the press
    if (this.menuOn) return; // the start menu takes a choice, not a press
    const m = this.mode;
    if (m === 'creator') { if (src !== 'key') this.creator.down(this.pointer()); return; }
    // with the kit open, presses land on the kit; only Space gets here (it closes the kit)
    if (this.ui.kitOpen) this.closeKit();
    // waiting for a tool: a press on the mouth says "aah" (a look at the teeth), anywhere
    // else opens the kit; Space takes the next treatment
    if (m === 'intro' || m === 'arrive' || m === 'pick') {
      if (src === 'key') this.chooseNext();
      else if (m === 'pick' && (this.peek() || this.peekWindow())) return;
      else this.openKit();
      return;
    }
    if (m === 'style') { this.stylePress(src); return; }
    if (m === 'ready') this.press(src);
  }
  onUp(src) {
    const m = this.mode;
    if (m === 'creator') { this.creator.up(); return; }
    if (m === 'holding') {
      const tool = this.tool, def = tool.def;
      // a multi-hold treatment keeps its progress between presses
      if (def.multiHold) { tool.cur = -1; this.setMode('ready'); this.ui.holding(false); return; }
      // a dropped hold (tab hidden, pause) or a quick tap does not count as a release
      if (src === 'cancel' || this.p < TAP_IGNORE) {
        tool.cancel(); tool.cur = -1; tool.p = 0; this.p = 0;
        if (src !== 'cancel') this.ui.toast('KEEP HOLDING!');
        this.setMode('ready');
        this.ui.holding(false);
        return;
      }
      this.releaseTarget();
      return;
    }
    if (m === 'brushing') { this.tool.lift(); this.setMode('ready'); this.ui.holding(false); return; }
    if (m === 'style') { this.style.down = false; this.style.last = null; return; }
    // Space on the results screen: the next patient
    if (m === 'results' && src === 'key' && this.modeT > 1.2) this.nextLevel();
  }

  // ---------- per frame ----------
  update(dt, time) {
    const g = this.g, s = this.s;
    g.time = time;
    this.modeT += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.t <= time);
      if (due.length) { this.timers = this.timers.filter((t) => t.t > time); due.forEach((t) => t.fn()); }
    }
    if (this.mode === 'creator' && this.creator) this.creator.tick(dt, this.pointer());
    if (this.salon && !this.salon.over && PLAYING.has(this.mode)) {
      // a multiplayer turn ends when the server says, even if this tab was hidden a while
      this.salon.left = this.salon.o.endsAt ? (this.salon.o.endsAt - Date.now()) / 1000 : this.salon.left - dt;
      this.salonUI.tick(this.salon.left);
      if (this.salon.left <= 0) this.endSalon();
    }
    const tool = this.tool, def = tool && tool.def;
    let prog = g.prog;
    switch (this.mode) {
      case 'intro':
        if (this.modeT > 2.4 && !this.menuOn) this.toPick(); // with the start menu up, it waits for a choice
        break;
      case 'arrive':
        if (this.modeT > ARRIVE) this.toPick();
        break;
      case 'pick':
        prog = 0;
        break;
      case 'style':
        prog = 0;
        if (this.style.down) this.rub();
        break;
      case 'transition':
        tool.idle(dt, this.p);
        if (this.modeT >= TRANSITION) this.ready();
        prog = 0;
        break;
      case 'ready': {
        tool.idle(dt, this.p);
        if (def.brush) { prog = tool.coverage(); this.ui.setHold(prog, null, 1); break; }
        const sw = tool.sw;
        prog = this.p / def.hold.max;
        if (this.ghost) {
          // travelling ghost dot: runs to the star (or the path end) and waits there
          const end = sw ? sw.c / def.hold.max : 1;
          const k = (this.modeT % 2.6) / 1.7;
          g.ghost = k <= 1 ? k * end : end;
        }
        this.ui.setHold(prog, sw, def.hold.max);
        break;
      }
      case 'holding': {
        this.p = Math.min(def.hold.max, this.p + dt / def.hold.time);
        tool.hold(dt, this.p);
        prog = this.p / def.hold.max;
        this.ui.setHold(prog, this.sweet, def.hold.max);
        if (this.p >= def.hold.max) this.releaseTarget();
        break;
      }
      case 'brushing': {
        const bq = this.brushKey ? null : this.pointer();
        tool.brush(dt, bq);
        if (bq && def.id !== 'laser') touch(this, def.id, bq, { brush: true, dt }); // off its own ground (world.js)
        // any brush dragged into an eye hurts (soap and the laser have their own sting)
        if (bq && def.id !== 'scrub' && def.id !== 'laser' && eyeSide(this.s, bq.x, bq.y) >= 0) this.hurtAt(bq.x, bq.y, HURT_KIND[def.id] || 'rash');
        prog = tool.coverage();
        this.ui.setHold(prog, null, 1);
        if (tool.complete() && !this.spare) this.finishTool(tool.result()); // a free use brushes on until put away
        break;
      }
      case 'outro':
        if ((!tool || tool.outroDone()) && this.modeT > 0.7) this.nextTool();
        break;
      case 'finale':
        this.fit(dt);
        break;
      case 'reveal':
      case 'results': {
        this.fit(dt);
        if (!this.splitUser) {
          // demonstrate the slider once: wipe from all-after to the middle
          const k = Math.min(1, Math.max(0, (this.modeT - 1.1) / 0.9));
          this.splitV = 0.5 * easeIO(k);
          this.ui.setSplit(this.splitV);
        }
        break;
      }
    }
    g.prog = prog;
    g.hint = this.mode === 'ready' && this.ghost; // first time: show where to press
    tickPatient(s, dt, time);
    if (this.mode === 'results' || this.mode === 'reveal') tickPatient(this.before, dt, time);
    if (this.live && this.live.s) tickPatient(this.live.s, dt, time);
    if (this.pair) for (const p of this.pair) tickPatient(p.s, dt, time);
    if (this.multi) this.multi.update(dt);
    this.waiting.update(dt, time);
    this.backdrop.update(dt);
    if (tool && this.entered.has(tool) && this.mode !== 'finale' && this.mode !== 'results') tool.update(dt);
    // once glowing, the skin keeps twinkling
    if (s.shine >= 1 && this.mode !== 'boot') {
      this.glintT += dt;
      if (this.glintT > 0.42) {
        this.glintT = 0;
        const a = rand(0, TAU), w = headToStage(s, Math.cos(a) * rand(60, 160), -20 + Math.sin(a) * rand(60, 200));
        if (this.mode === 'results' && this.splitV > 0.02 && this.director.toScreen(w.x, w.y).x < this.splitScreenPx) { /* before side stays dull */ }
        else this.fx.spark(w.x, w.y, { size: rand(10, 18), vy: -20 });
      }
    }
    this.fx.update(dt);
    g.fail = Math.max(0, g.fail - dt * 1.6);
    g.hit = Math.max(0, g.hit - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.4);
  }

  render(ctx, W, H, dpr, time, dt) {
    const d = this.director, s = this.s;
    d.update(dt, time, W, H);
    this.audio.update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hs = d.toScreen(0, headY(s));
    this.backdrop.draw(ctx, W, H, time, d.out, hs.x, hs.y);
    const split = (this.mode === 'results' || this.mode === 'reveal') && this.splitV > 0.001;
    if (split) {
      const sx = this.ui.splitScreenX(this.splitV, W) * W;
      this.splitScreenPx = sx;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip();
      d.apply(ctx); drawPatient(ctx, s, time, this.dirt.canvas);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip();
      d.apply(ctx); drawPatient(ctx, this.before, time, this.beforeDirt || this.dirt.start);
      ctx.restore();
    } else if (this.pair && this.mode === 'lobby') {
      this.splitScreenPx = -1;
      this.drawPair(ctx, W, H, time);
    } else {
      this.splitScreenPx = -1;
      ctx.save(); d.apply(ctx); drawPatient(ctx, s, time, this.dirt.canvas); ctx.restore();
    }
    ctx.save();
    d.apply(ctx);
    const tool = this.tool;
    if (tool && this.entered.has(tool) && this.mode !== 'finale' && this.mode !== 'results') tool.draw(ctx, time);
    this.drawHeld(ctx, time);
    this.fx.draw(ctx);
    ctx.restore();
    if (split) {
      const sx = this.splitScreenPx, f = d.free;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, f.y + 6); ctx.lineTo(sx, f.y + f.h - 6);
      ctx.lineWidth = 9; ctx.strokeStyle = '#3a2747'; ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    this.fx.drawScreen(ctx);
    this.drawLive(ctx, W, H, time);
    if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash * 1.2)})`; ctx.fillRect(0, 0, W, H); }
  }
}
