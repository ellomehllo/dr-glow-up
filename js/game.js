// The run. Fifty levels in five chapters, each with a new patient. The player picks each
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
// Style tools (hair colour, piercings; style.js) sit in their own row of the kit: picked
// between treatments, they put the game in `style` until the player is done, and stay
// out of the order. Piercings cost aura.
// A treatment pressed where there is nothing to treat hurts the patient there (mood.js):
// a mark, an ouch in their own words, and aura; an eye hurts most. At the end the patient
// takes the job by the aura and the hurts, in their own temper: happy hops for a good job,
// anger, tears, a cold shoulder or grumbling for a bad one.
import { TOOLS, LEVELS, VIEWS, CHAPTER_SIZE, KIT, INTRO, STYLES } from './config.js';
import { REGISTRY } from './tools/index.js';
import { scoreRelease, rankFor, auraOf, loadProgress, saveProgress } from './scoring.js';
import { makeState, resetState, drawPatient, tickPatient, headToStage, stageToHead, headBase, headY, react, onFace, eyeSide, PIMPLE_SPOTS, CRACKS, WRINKLES, SPOT_SPOTS } from './patient.js';
import { patientFor, randomPatient, pickKind } from './people.js';
import { rollExtras, inMouth } from './extras.js';
import { DYES, DYE_RUB, setDye, hairNow, onHair, pierceSpot, pierceCost, PIERCE } from './style.js';
import { HURT, HURT_KIND, temperOf, lineFor, feelingFor, faceFor, BAD } from './mood.js';
import { easeIO, rand, TAU } from './draw.js';
import { WaitingRoom, DOOR } from './waiting.js';
import { K as ROOM_K } from './backdrop.js';

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

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
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
      prog: 0, ghost: -1, hint: false, fail: 0, hit: 0,
      head: (x, y) => headToStage(s, x, y),
      shake: (a) => this.director.shake(a),
      bump: (a) => this.director.bump(a),
      toast: (t) => this.ui.toast(t),
      react: (e, d, m) => react(s, e, d, m),
      hurt: (x, y, kind, free) => this.hurtAt(x, y, kind, free),
      sting: (side) => this.sting(side),
    };
    this.tools = []; this.defs = [];
    this.spares = {}; this.spare = false; // free uses of tools (by id), and whether the one out is one
    this.buildTools();
    this.entered = new Set();
    this.used = new Set(); // treatments (index into defs) finished on this patient
    this.tool = null; this.idx = -1;
    this.style = null; // the style tool out: { def, down, last } (style mode)
    this.dyeId = 'pink'; // the dye picked last
    this.clearHurts();
    this.seenHint = new Set();
    this.mode = 'boot';
    this.modeT = 0;
    this.timers = [];
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
    const ex = rollExtras({ open: (id) => INTRO[id] <= level, must: L.extra, who, carry: from });
    // only some come in muddy and need a wash (always on the first level, to learn it)
    const muddy = from ? from.dirt > 0 : level === 0 || Math.random() < 0.3;
    const mid = L.tools.slice(1, -1);
    return {
      level, who, pimples, ...ex,
      tools: [...(muddy ? ['scrub'] : []), ...mid, ...ex.extras, L.tools[L.tools.length - 1]], // the glow stays last
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
      fresh: L.fresh.map((id) => TOOLS.find((t) => t.id === id)),
    };
  }
  // the patient's treatments (the level's and their extras) with the level's difficulty
  buildTools() {
    this.defs = this.setup.tools.map((id) => this.defFor(id));
    this.tools = this.defs.map((def) => new REGISTRY[def.id](this.g, def));
  }
  // a treatment with the level's difficulty applied
  defFor(id) {
    const L = LEVELS[this.level], base = BY_ID[id];
    // each target nudges its own sweet centre by up to `jitter` (see Tool.enter)
    const def = { ...base, hold: { ...base.hold, time: base.hold.time / L.speed }, jitter: base.fixed ? 0 : L.jitter };
    if (base.sweet) def.sweet = { c: base.sweet.c, w: base.sweet.w * L.zone };
    return def;
  }
  // unlocked: reached by the player (any level opened so far)
  isOpen(id) { return INTRO[id] < Math.max(this.progress.unlocked, this.level + 1); }

  view(v) { return { x: v.x || 0, y: v.y + (v.rel ? headBase(this.s) : 0), r: v.r }; }

  // ---------- flow ----------
  setMode(m) { this.mode = m; this.modeT = 0; this.syncKit(); }
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
    react(this.s, 'normal', 0.01);
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
      if (INTRO[id] >= reached) state = 'locked';
      else if (this.tool && this.tool.def.id === id) state = 'now';
      else if (i < 0) state = 'free';
      else if (this.used.has(i)) state = 'done';
      return { id, icon: t.icon, name: t.name, state, lv: INTRO[id] + 1 };
    });
  }
  // the style row of the kit: the one out, the colour the hair has, what piercings cost
  styleKit() {
    const s = this.s, cost = pierceCost(s);
    return STYLES.map((d) => ({
      id: d.id, icon: d.icon, name: d.name, state: this.style && this.style.def.id === d.id ? 'now' : 'style',
      dot: d.id === 'dye' && s.dye ? hairNow(s).c : '', tag: d.id === 'pierce' && cost ? `-${cost}` : '',
    }));
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
    this.director.setObstruction(this.ui.obstruction('kit'));
  }
  closeKit() {
    if (!this.ui.kitOpen) return;
    this.ui.closeKit();
    this.syncKit();
    this.director.setObstruction(this.ui.obstruction('play'));
  }
  // a slot in the kit was picked: start that treatment, or say why not (returns false)
  choose(id) {
    if (!this.canPick()) return false;
    if (STYLE_BY_ID[id]) return this.chooseStyle(id);
    if (!this.isOpen(id)) return false;
    const i = this.defs.findIndex((d) => d.id === id);
    if (this.tool && this.tool.def.id === id) { this.closeKit(); return true; } // the one already out
    if (this.tool) this.tool.exit(); // left as it is, to carry on later
    this.endStyle(false);
    if (i >= 0 && !this.used.has(i)) this.beginTool(i);
    else this.beginSpare(id);
    return true;
  }

  // ---------- style tools ----------
  chooseStyle(id) {
    const def = STYLE_BY_ID[id];
    if (this.style && this.style.def === def) { this.closeKit(); return true; }
    if (this.tool) { this.tool.exit(); this.tool = null; this.idx = -1; } // left as it is, to carry on later
    this.ui.closeKit();
    this.style = { def, down: false, last: null, rub: 0 };
    const s = this.s;
    if (id === 'dye' && !(s.dye && s.dye.id === this.dyeId)) setDye(s, DYES.find((d) => d.id === this.dyeId));
    s.lookAt = null;
    this.director.go(this.view(def.view), TRANSITION);
    this.director.setObstruction(this.ui.obstruction('play'));
    this.ui.titleCard(false);
    this.ui.showStyle(def, {
      dyes: id === 'dye' ? DYES.map((d) => ({ id: d.id, name: d.name, c: d.c || s.who.hair, hi: d.hi || s.who.hairHi })) : null,
      on: this.dyeId, t: id === 'dye' ? s.dye.t : 0, cost: pierceCost(s),
    });
    this.ui.markNext(this.nextIdx());
    this.audio.whoosh(0.1);
    this.setMode('style');
    this.refreshKit();
    return true;
  }
  // done styling: back to picking a treatment (or quietly, when one is picked instead)
  endStyle(back = true) {
    if (!this.style) return;
    this.style = null;
    this.ui.hideStyle();
    if (back) { this.audio.tick(); this.toPick(); }
  }
  // a swatch: the next rubs blend the hair toward that colour
  pickDye(id) {
    const d = DYES.find((x) => x.id === id);
    if (!d || !this.style || this.style.def.id !== 'dye') return;
    this.dyeId = id;
    setDye(this.s, d);
    this.ui.markDye(id);
    this.ui.setHold(0, null, 1);
    this.audio.tick();
    this.refreshKit();
  }
  stylePress(src) {
    const st = this.style;
    if (src === 'key') { this.endStyle(); return; } // Space: done
    const q = this.pointer();
    if (st.def.id === 'dye') { st.down = true; st.last = q; return; }
    this.pierce(q);
  }
  // rubbing the hair blends the dye in, by how far the finger travels over it
  rubDye() {
    const st = this.style, s = this.s, q = this.pointer(), last = st.last;
    st.last = q;
    if (!last || !s.dye || !onHair(q.x, q.y)) return;
    const d = Math.hypot(q.x - last.x, q.y - last.y);
    if (d < 0.5) return;
    const was = s.dye.t;
    s.dye.t = Math.min(1, was + d / DYE_RUB);
    st.rub += d;
    if (st.rub > 40) {
      st.rub = 0;
      this.fx.spark(q.sx, q.sy, { size: rand(9, 14), col: s.dye.to.hi, vy: -60 });
      this.fx.drops(q.sx, q.sy, 2, s.dye.to.c);
      this.audio.drip();
    }
    this.ui.setHold(s.dye.t, null, 1);
    if (was < 1 && s.dye.t >= 1) {
      const c = headToStage(s, 0, -150);
      this.fx.glitter(c.x, c.y, 16, 320);
      this.fx.burst(c.x, c.y, 8, 300);
      this.audio.sparkle();
      react(s, 'happy', 1.2, 'grin');
      this.refreshKit();
    }
  }
  // a tap on the head adds a piercing there (aura pays for it); a tap on one takes it out
  pierce(q) {
    const s = this.s;
    const k = s.pierced.findIndex((p) => Math.hypot(p.x - q.x, p.y - q.y) < 13);
    if (k >= 0) {
      const p = s.pierced.splice(k, 1)[0], at = headToStage(s, p.x, p.y);
      this.fx.ring(at.x, at.y, 4, 22, 0.3, '#ffffff', 4);
      this.fx.text(at.x, at.y - 34, `+${p.cost}`, '#3fe0b5', 24);
      this.audio.tick();
    } else {
      if (eyeSide(s, q.x, q.y) >= 0) { this.hurtAt(q.x, q.y, 'bruise'); this.refreshKit(); return; } // not the eye!
      const p = pierceSpot(q.x, q.y);
      if (!p) { this.miss(q); return; }
      if (s.pierced.length >= PIERCE.max) { this.ui.toast('NO MORE ROOM'); this.audio.tink(0.5); return; }
      s.pierced.push(p);
      const at = headToStage(s, p.x, p.y), odd = p.cost > PIERCE.usual;
      this.fx.ring(at.x, at.y, 3, 26, 0.32, '#ffffff', 5);
      this.fx.burst(at.x, at.y, 5, 200, { size: rand(8, 12) });
      this.fx.text(at.x, at.y - 36, `-${p.cost}`, odd ? '#ff7d9a' : '#ffffff', odd ? 30 : 22);
      this.audio.tink(1.7);
      this.director.bump(0.25);
      react(s, 'squeeze', odd ? 0.6 : 0.35, 'wince');
      if (odd) s.sweat = Math.max(s.sweat, 0.6);
    }
    this.updateAura();
    this.ui.styleCost(pierceCost(s), s.pierced.length);
    this.refreshKit();
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
    this.director.setObstruction(this.ui.obstruction(this.ui.kitOpen ? 'kit' : 'play'));
    this.ui.pickPrompt(this.used.size / this.tools.length);
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
    this.setup = o.setup || this.makeSetup(n, o);
    resetState(this.s, this.setup);
    resetState(this.before, this.setup);
    this.dirt.setup(this.setup);
    this.buildTools();
    this.fx.clear();
    this.audio.stopLoops();
    this.scores = []; this.verdicts = []; this.timers = [];
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
    this.setMode('arrive');
    this.retryMs = performance.now() - t0;
  }
  // a free use of a tool: one this patient doesn't need, or needs but has had already. It
  // scores nothing; it keeps its own progress until it is finished
  beginSpare(id) {
    if (!this.spares[id]) this.spares[id] = new REGISTRY[id](this.g, this.defFor(id));
    this.beginTool(-1, this.spares[id]);
  }
  beginTool(i, spare = null) {
    const tool = spare || this.tools[i], def = tool.def;
    this.spare = !!spare;
    this.ui.closeKit();
    // a glow carries on from what it had; everything else starts each target from zero
    this.idx = i; this.tool = tool; this.p = def.multiHold ? tool.p : 0; this.sweet = null;
    this.ghost = !this.seenHint.has(def.id);
    tool.outro = false; tool.outroT = 0;
    // first time out it sets up; picked again after being left, it carries on
    if (tool.begun) tool.resume(); else { tool.enter(); tool.begun = true; }
    this.entered.add(tool);
    if (spare && !def.brush) {
      // what is already fine needs nothing; with nothing left it says so (and stays out)
      tool.done = tool.done.map((d, k) => d || tool.fixed(k));
      if (tool.left() === 0) this.after(TRANSITION * 0.7, () => { if (this.tool === tool) this.ui.toast('NOTHING TO FIX'); });
    }
    this.director.go(this.view(def.view), TRANSITION);
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
  // a press that missed every target: on the face it hurts there (the eyes most), unless it
  // was only just off a target; off the face it is only a ripple
  wrongSpot(q, tool) {
    const minR = FINGER / this.director.out.s;
    const near = tool.targets().some((t, i) => !tool.done[i] && Math.hypot(q.x - t.x, q.y - t.y) <= Math.max(tool.hitR(t), minR) + 18);
    if (near || !(onFace(q.x, q.y, 4) || eyeSide(this.s, q.x, q.y) >= 0)) { this.miss(q); return; }
    if (tool.def.mouth && inMouth(q.x, q.y)) { this.miss(q); return; } // a wrong tooth: no harm
    tool.nudge = 1;
    this.hurtAt(q.x, q.y, HURT_KIND[tool.def.id] || 'bruise');
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
  // a tap on the mouth while picking: they open wide for a moment, teeth and all
  peek() {
    const q = this.pointer(), s = this.s;
    if (!inMouth(q.x, q.y)) return false;
    react(s, 'normal', 1.8, 'aah');
    s.lookAt = { x: 0, y: 200 };
    this.after(1.8, () => { if (this.mode === 'pick') s.lookAt = null; });
    this.director.go(this.view({ x: 0, y: 120, r: 170, rel: true }), 0.5);
    this.after(1.7, () => { if (this.mode === 'pick') this.director.go(this.view(VIEWS.pick), 0.6); });
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
    let r = scoreRelease(this.p, this.sweet);
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
    this.finishTool({ score: avg, verdict });
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
  feedback(r) {
    const s = this.s;
    const good = r.verdict === 'perfect' || r.verdict === 'good';
    this.ui.stamp(r.score, good ? r.verdict : 'fail', r.verdict, !!this.tool.def.scored && !this.spare);
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
    this.tool.exit();
    if (this.used.size >= this.tools.length) this.startFinale();
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
    this.timers = [];
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
    } else this.director.setObstruction(this.ui.obstruction(this.mode === 'intro' ? 'intro' : this.ui.kitOpen ? 'kit' : 'play'), true);
  }

  // ---------- input ----------
  onDown(src) {
    this.audio.init();
    const m = this.mode;
    // with the kit open, presses land on the kit; only Space gets here (it closes the kit)
    if (this.ui.kitOpen) this.closeKit();
    // waiting for a tool: a press on the mouth says "aah" (a look at the teeth), anywhere
    // else opens the kit; Space takes the next treatment
    if (m === 'intro' || m === 'arrive' || m === 'pick') {
      if (src === 'key') this.chooseNext();
      else if (m === 'pick' && this.peek()) return;
      else this.openKit();
      return;
    }
    if (m === 'style') { this.stylePress(src); return; }
    if (m === 'ready') this.press(src);
  }
  onUp(src) {
    const m = this.mode;
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
    const tool = this.tool, def = tool && tool.def;
    let prog = g.prog;
    switch (this.mode) {
      case 'intro':
        if (this.modeT > 2.4) this.toPick();
        break;
      case 'arrive':
        if (this.modeT > ARRIVE) this.toPick();
        break;
      case 'pick':
        prog = 0;
        break;
      case 'style':
        prog = 0;
        if (this.style.down) this.rubDye();
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
        tool.brush(dt, this.brushKey ? null : this.pointer());
        prog = tool.coverage();
        this.ui.setHold(prog, null, 1);
        if (tool.complete() && !this.spare) this.finishTool(tool.result()); // a free use brushes on until put away
        break;
      }
      case 'outro':
        if (tool.outroDone() && this.modeT > 0.7) this.nextTool();
        break;
      case 'finale':
        this.fit(dt);
        break;
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
    if (this.mode === 'results') tickPatient(this.before, dt, time);
    this.waiting.update(dt, time);
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
    const split = this.mode === 'results' && this.splitV > 0.001;
    if (split) {
      const sx = this.ui.splitScreenX(this.splitV, W) * W;
      this.splitScreenPx = sx;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip();
      d.apply(ctx); drawPatient(ctx, s, time, this.dirt.canvas);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip();
      d.apply(ctx); drawPatient(ctx, this.before, time, this.dirt.start);
      ctx.restore();
    } else {
      this.splitScreenPx = -1;
      ctx.save(); d.apply(ctx); drawPatient(ctx, s, time, this.dirt.canvas); ctx.restore();
    }
    ctx.save();
    d.apply(ctx);
    const tool = this.tool;
    if (tool && this.entered.has(tool) && this.mode !== 'finale' && this.mode !== 'results') tool.draw(ctx, time);
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
    if (this.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash * 1.2)})`; ctx.fillRect(0, 0, W, H); }
  }
}
