// The run. Five levels, each with a new patient. One controller drives every
// treatment of the level in order:
//   intro | arrive -> transition -> ready <-> holding | brushing -> outro -> next
// In `ready` the player presses ON a target (a pimple, a scar, the jaw...) and holds;
// each target is scored on its own release, and the treatment ends once all of its
// targets are done. Brush treatments (wash, hair) are dragged over the patient instead.
// Then the finale (happy hops, sparkle shower, camera flash) and the results screen
// with a before/after split. Treatments only react through the hooks in tools/base.js.
import { TOOLS, LEVELS, PASS, VIEWS } from './config.js';
import { REGISTRY } from './tools/index.js';
import { scoreRelease, rankFor, auraOf, loadProgress, saveProgress } from './scoring.js';
import { makeState, resetState, drawPatient, tickPatient, headToStage, stageToHead, headBase, headY, react, PIMPLE_SPOTS } from './patient.js';
import { randomPatient } from './people.js';
import { easeIO, rand, TAU } from './draw.js';

const TAP_IGNORE = 0.06; // a release before this much progress is a false start, not a release
const TRANSITION = 0.9;
const FINALE = 2.2;
const ARRIVE = 1.5; // a new patient settles in before the first treatment
const FINGER = 30; // screen px: the smallest a target's hit area gets
const WORD = { perfect: 'PERFECT!', good: 'NICE!', early: 'TOO EARLY', late: 'TOO LATE', messy: 'MESSY!' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class Game {
  constructor(o) {
    // ui, audio, input, fx, dirt, director, backdrop, playables
    Object.assign(this, o);
    this.progress = loadProgress();
    this.level = Math.min(this.progress.unlocked, LEVELS.length) - 1;
    this.setup = this.makeSetup(this.level);
    const s = (this.s = makeState(this.setup));
    this.before = makeState(this.setup); // the patient exactly as they came in
    this.dirt.setup(this.setup);
    this.g = {
      s, fx: this.fx, audio: this.audio, dirt: this.dirt, time: 0,
      prog: 0, ghost: -1, hint: false, fail: 0, hit: 0,
      head: (x, y) => headToStage(s, x, y),
      shake: (a) => this.director.shake(a),
      bump: (a) => this.director.bump(a),
      toast: (t) => this.ui.toast(t),
      react: (e, d, m) => react(s, e, d, m),
    };
    this.tools = []; this.defs = [];
    this.buildTools();
    this.entered = new Set();
    this.seenHint = new Set();
    this.mode = 'boot';
    this.modeT = 0;
    this.timers = [];
    this.scores = [];
    this.verdicts = [];
    this.tScores = []; this.tVerdicts = []; // per target, current treatment
    this.flash = 0;
    this.glintT = 0;
    this.splitV = 0; this.splitUser = false;
    this.passed = false;
    this.input.on('down', (src) => this.onDown(src));
    this.input.on('up', (src) => this.onUp(src));
  }

  // a fresh patient for a level: who they are, which pimples, scars, starting pose
  makeSetup(level, kind) {
    const L = LEVELS[level], has = (id) => L.tools.includes(id);
    return {
      who: randomPatient(kind),
      pimples: shuffle(PIMPLE_SPOTS.slice()).slice(0, L.pimples),
      scars: has('gold'),
      jaw0: has('chisel') ? 0 : 0.7,
      mew0: has('mew') ? 0 : 1,
      hair0: has('rasp') ? 0 : 1,
      brow0: has('rasp') ? 0 : 0.75,
      dirt: L.dirt,
      seed: (Math.random() * 1e9) | 0,
    };
  }
  // the level's treatments with its difficulty applied
  buildTools() {
    const L = LEVELS[this.level];
    this.defs = L.tools.map((id) => {
      const base = TOOLS.find((t) => t.id === id);
      // each target nudges its own sweet centre by up to `jitter` (see Tool.enter)
      const def = { ...base, hold: { ...base.hold, time: base.hold.time / L.speed }, jitter: base.fixed ? 0 : L.jitter };
      if (base.sweet) def.sweet = { c: base.sweet.c, w: base.sweet.w * L.zone };
      return def;
    });
    this.tools = this.defs.map((def) => new REGISTRY[def.id](this.g, def));
  }

  view(v) { return { x: v.x || 0, y: v.y + (v.rel ? headBase(this.s) : 0), r: v.r }; }

  // ---------- flow ----------
  setMode(m) { this.mode = m; this.modeT = 0; }
  after(t, fn) { this.timers.push({ t: this.g.time + t, fn }); }
  start() {
    this.setMode('intro');
    this.director.snap(this.view(VIEWS.intro));
    this.director.setObstruction(this.ui.obstruction('intro'), true);
    this.ui.setLevel(this.level, this.progress.unlocked);
    this.ui.setSteps(this.defs);
    this.ui.titleCard(true);
    react(this.s, 'normal', 0.01);
  }
  startLevel(n, kind) {
    const t0 = performance.now();
    const g = this.g;
    for (const t of this.entered) { t.exit(); t.outro = false; }
    this.entered.clear();
    this.level = n;
    this.setup = this.makeSetup(n, kind);
    resetState(this.s, this.setup);
    resetState(this.before, this.setup);
    this.dirt.setup(this.setup);
    this.buildTools();
    this.fx.clear();
    this.audio.stopLoops();
    this.scores = []; this.verdicts = []; this.timers = [];
    this.tScores = []; this.tVerdicts = [];
    this.flash = 0; g.fail = 0; g.hit = 0; g.ghost = -1; g.prog = 0; g.hint = false;
    this.tool = null; this.idx = -1;
    this.ui.reset();
    this.ui.titleCard(false);
    this.ui.setLevel(n, this.progress.unlocked);
    this.ui.setSteps(this.defs);
    this.ui.levelSplash(n + 1);
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
  beginTool(i) {
    const tool = this.tools[i], def = tool.def;
    this.idx = i; this.tool = tool; this.p = 0; this.sweet = null;
    this.tScores = []; this.tVerdicts = [];
    this.ghost = !this.seenHint.has(def.id);
    tool.outro = false; tool.outroT = 0;
    tool.enter();
    this.entered.add(tool);
    this.director.go(this.view(def.view), TRANSITION);
    if (i === 0) this.director.setObstruction(this.ui.obstruction('play'));
    this.ui.titleCard(false);
    this.ui.showTool(def, i);
    this.ui.hidePrompt();
    this.audio.whoosh(0.12);
    this.setMode('transition');
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
    if (i >= 0) this.startHold(i); else this.miss(q);
  }
  // a press that missed every target: a ripple where it landed, and the targets flash
  miss(q) {
    this.tool.nudge = 1;
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
    this.tScores.push(r.score); this.tVerdicts.push(r.verdict);
    this.ui.holding(false);
    const sum = this.tScores.reduce((a, b) => a + b, 0);
    if (n > 1) {
      this.miniFeedback(r, tool.targets()[i]);
      if (tool.def.scored) { this.scores[this.idx] = sum / n; this.updateAura(); }
    }
    if (tool.left() > 0) { this.p = 0; tool.p = 0; this.g.prog = 0; this.setMode('ready'); return; }
    // every target done: the treatment scores their average
    const avg = Math.round(sum / n);
    let verdict = r.verdict;
    if (n > 1) {
      const count = (v) => this.tVerdicts.filter((x) => x === v).length;
      verdict = avg >= 95 ? 'perfect' : avg >= 80 ? 'good' : count('late') > count('early') ? 'late' : 'early';
    }
    this.finishTool({ score: avg, verdict });
  }
  finishTool(result) {
    const tool = this.tool;
    result = tool.finish(result) || result;
    tool.outro = true;
    this.scores[this.idx] = result.score;
    this.verdicts[this.idx] = result.verdict;
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
    if (idx.length) this.ui.setAura(Math.round(idx.reduce((a, i) => a + (this.scores[i] || 0), 0) / idx.length));
  }
  feedback(r) {
    const s = this.s;
    const good = r.verdict === 'perfect' || r.verdict === 'good';
    this.ui.stamp(r.score, good ? r.verdict : 'fail', r.verdict, !!this.tool.def.scored);
    this.audio.stamp();
    if (good) {
      this.audio.success();
      s.mood = Math.min(1, s.mood + 0.27);
      this.g.hit = 1;
      this.director.bump(1);
      s.sqV += 1.6;
      if (r.verdict === 'perfect') {
        this.audio.perfect();
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
    this.ui.stepDone(this.idx, good);
  }
  nextTool() {
    this.tool.exit();
    if (this.idx + 1 < this.tools.length) this.beginTool(this.idx + 1);
    else this.startFinale();
  }
  startFinale() {
    const s = this.s;
    this.setMode('finale');
    this.ui.hideTool();
    this.ui.hidePrompt();
    s.lookAt = null;
    s.exprBase = 'happy'; s.mouthBase = 'grin'; react(s, 'happy', 0.01, 'grin');
    this.director.go(this.view(VIEWS.reveal), 1.1);
    this.audio.fanfare();
    const hop = (v) => () => {
      s.hopV = -v; s.sqV += 2.4;
      const c = headToStage(s, 0, -40);
      this.fx.burst(c.x, c.y, 14, 420);
      this.fx.glitter(c.x, c.y + 140, 18, 380);
      this.audio.boing(1.1);
    };
    this.after(0.3, hop(820));
    this.after(0.95, hop(640));
    this.after(FINALE - 0.42, () => this.audio.flash());
    this.after(FINALE, () => this.showResults());
  }
  showResults() {
    const s = this.s, n = this.level;
    const idx = this.scored();
    const scores = idx.map((i) => this.scores[i] || 0);
    const aura = auraOf(scores);
    const { rank, next, toNext } = rankFor(aura);
    let worst = -1, ws = 101;
    scores.forEach((v, k) => { if (v < ws) { ws = v; worst = k; } });
    if (ws >= 100) worst = -1;
    const P = this.progress;
    const newBest = aura > (P.best[n] || 0);
    if (newBest) P.best[n] = aura;
    this.passed = aura >= PASS;
    if (this.passed && n + 1 < LEVELS.length) P.unlocked = Math.max(P.unlocked, n + 2);
    saveProgress(P);
    this.playables.save(P);
    this.playables.sendScore(P.best.reduce((a, b) => a + (b || 0), 0));
    this.flash = 1;
    this.director.go(this.view(VIEWS.results), 1.2);
    // final expression by rank
    const face = {
      LEGENDARY: ['wink', 'smirk', 1], MOGGER: ['happy', 'grin', 1], CHADLITE: ['normal', null, 0.85],
      NORMIE: ['normal', null, 0.45], NPC: ['normal', 'wince', 0.1],
    }[rank.name];
    s.exprBase = face[0]; s.mouthBase = face[1]; s.mood = face[2];
    react(s, face[0], 0.01, face[1]);
    this.rankName = rank.name;
    this.ui.setLevel(n, P.unlocked);
    this.ui.showResults({
      aura, rank: rank.name, next: next && next.name, toNext, near: !!next && toNext < 6, worst,
      bars: idx.map((i, k) => ({ icon: this.defs[i].icon, name: this.defs[i].name, score: scores[k] })),
      best: P.best[n], newBest, passed: this.passed, last: n + 1 === LEVELS.length,
    });
    this.director.setObstruction(this.ui.obstruction('results'));
    this.ui.layoutSplit(this.director.obsGoal);
    this.after(0.22, () => {
      this.audio.thud(); this.director.shake(0.35);
      const big = this.passed && n + 1 === LEVELS.length;
      if (aura >= 70 || big) { this.fx.confetti(window.innerWidth, big || aura >= 95 ? 150 : 80); this.audio.cheer(); }
    });
    this.splitV = 0; this.splitUser = false;
    this.setMode('results');
  }
  retry() { this.startLevel(this.level); }
  // progress saved on the platform (another device) merges with the local copy
  mergeProgress(o) {
    const P = this.progress;
    P.unlocked = Math.max(P.unlocked, Math.min(LEVELS.length, parseInt(o.unlocked, 10) || 1));
    if (Array.isArray(o.best)) P.best = P.best.map((v, i) => Math.max(v, Math.min(100, parseInt(o.best[i], 10) || 0)));
    saveProgress(P);
    if (this.mode === 'intro' || this.mode === 'results') this.ui.setLevel(this.level, P.unlocked);
  }
  nextLevel() {
    if (!this.passed) return;
    this.startLevel((this.level + 1) % LEVELS.length);
  }
  setSplit(v) { this.splitV = v; this.splitUser = true; }
  resize() {
    if (this.mode === 'results') {
      this.director.setObstruction(this.ui.obstruction('results'), true);
      this.ui.layoutSplit(this.director.obsGoal);
    } else this.director.setObstruction(this.ui.obstruction(this.mode === 'intro' ? 'intro' : 'play'), true);
  }

  // ---------- input ----------
  onDown(src) {
    this.audio.init();
    const m = this.mode;
    if (m === 'intro' || m === 'arrive') { this.beginTool(0); return; }
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
    // Space on the results screen: next level if it is unlocked, otherwise try again
    if (m === 'results' && src === 'key' && this.modeT > 1.2) { if (this.passed) this.nextLevel(); else this.retry(); }
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
        if (this.modeT > 2.4) this.beginTool(0);
        break;
      case 'arrive':
        if (this.modeT > ARRIVE) this.beginTool(0);
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
        if (tool.complete()) this.finishTool(tool.result());
        break;
      }
      case 'outro':
        if (tool.outroDone() && this.modeT > 0.7) this.nextTool();
        break;
      case 'results': {
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
