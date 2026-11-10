// The character creator (multiplayer, MULTIPLAYER_PLAN.md phase 1): the player makes the
// character they will bring to the salon. The patient in the chair is the live preview;
// this is the panel under it. Tabs: who (a kind sets the outfit and features), skin, hair
// colour, hairstyle, eyes, build, and the problems they come in with. Saved on this
// device as picks + problems (to keep editing) and as a look (look.js, what others see).
import { MAKER, whoPicks, makeWho } from './people.js';
import { MESS, MESS_BY_ID } from './mess.js';
import { ICONS } from './icons.js';
import { CURLS, tuftKept } from './hair.js';
import { headToStage, react } from './patient.js';
import { OWN_PIERCINGS } from './extras.js';

const KEY = 'drglowup.mp.me';
const KIND_NAMES = {
  goth: 'Goth', bodybuilder: 'Muscles', bookworm: 'Bookworm', brainiac: 'Brainiac', foodie: 'Foodie',
  punk: 'Punk', bully: 'Bully', gamer: 'Gamer', glam: 'Glam', grandpa: 'Grandpa', regular: 'Patient',
};
const STYLE_NAMES = {
  straight: 'Straight', neat: 'Neat', wavy: 'Wavy', curly: 'Curly', afro: 'Afro', bob: 'Bob', bun: 'Bun', locs: 'Locs',
  messy: 'Messy', spiky: 'Spiky', mohawk: 'Mohawk', slick: 'Slick', buzz: 'Buzz', bald: 'Bald',
};
const BUILD_NAMES = { skinny: 'Skinny', medium: 'Medium', chubby: 'Chubby', broad: 'Broad', huge: 'Huge' };
// what the dice may give them to start with (game.customSetup); after that the reverse
// tools (mess.js) make it worse by hand
export const PROBLEMS = [
  ['pimples', 'Pimples'], ['scars', 'Scars'], ['spots', 'Sun spots'], ['wrinkles', 'Wrinkles'],
  ['circles', 'Dark circles'], ['nose', 'Bumpy nose'], ['teeth', 'Yellow teeth'], ['hair', 'Thin hair'],
  ['jaw', 'Soft jaw'], ['slouch', 'Slouch'], ['grime', 'Grime'],
];

// line icons (stroke: currentColor), 24 px grid
const I = (d) => `<svg class="mk-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  who: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.5 8-6.5s7 2.3 8 6.5"/>'),
  skin: I('<path d="M12 3.5c3.6 4.2 6 7.4 6 10.4a6 6 0 0 1-12 0c0-3 2.4-6.2 6-10.4z"/>'),
  hair: I('<path d="M5 14c0-6 3.2-9.5 7-9.5s7 3.5 7 9.5"/><path d="M9 5.5c-.6 3 .2 5.4 2.2 7"/><path d="M14 5c1 2.6.8 5-.6 7"/><path d="M5 14v5M19 14v5"/>'),
  style: I('<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7 18 4M15.7 15.7 6 4"/>'),
  eyes: I('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/>'),
  build: I('<circle cx="12" cy="5" r="2.2"/><path d="M5 9.5h14M12 9.5V15M12 15l-3.5 6M12 15l3.5 6"/>'),
  issues: I('<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M10.6 10.6h.01M13.4 13.4h.01M10.6 13.4h.01M13.4 10.6h.01"/>'),
  tools: I('<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16v4h4l5.5-5.5a4 4 0 0 0 5-5l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  clean: I('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  dice: I('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  done: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};
const TABS = [['tools', 'Make it worse'], ['who', 'Who'], ['skin', 'Skin'], ['hair', 'Hair colour'], ['style', 'Hairstyle'], ['eyes', 'Eyes'], ['build', 'Build']];
// how each reverse tool is used, shown under the tray
const HOW = { rub: 'RUB IT ON', hold: 'PRESS AND HOLD', tap: 'TAP TO ADD' };

const rnd = (n) => (Math.random() * n) | 0;
const newSeed = () => (Math.random() * 1e9) | 0;

export class Creator {
  constructor(root, game) {
    this.game = game;
    const el = (this.el = document.createElement('div'));
    el.className = 'mk';
    el.innerHTML = `
      <div class="mk-panel" role="dialog" aria-label="Make your character">
        <div class="mk-tabs" role="tablist">${TABS.map(([id, name]) => `<button class="mk-tab" role="tab" data-tab="${id}" aria-label="${name}" title="${name}">${ICON[id]}</button>`).join('')}</div>
        <div class="mk-opts" role="tabpanel"></div>
        <div class="mk-bar">
          <button class="mk-btn mk-x" data-act="close" aria-label="Back">${ICON.close}</button>
          <button class="mk-btn mk-dice" data-act="dice" aria-label="Random character">${ICON.dice}</button>
          <button class="mk-btn mk-clean" data-act="clean" aria-label="Start clean">${ICON.clean}</button>
          <span class="mk-time" role="timer" aria-label="Time left" hidden></span>
          <button class="mk-btn mk-done" data-act="done" aria-label="Done">${ICON.done}<span>DONE</span></button>
        </div>
      </div>`;
    root.appendChild(el);
    this.opts = el.querySelector('.mk-opts');
    el.addEventListener('pointerdown', (e) => e.stopPropagation()); // the game below doesn't get these presses
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) this.showTab(b.dataset.tab);
      else if (b.dataset.act === 'close') this.close(false);
      else if (b.dataset.act === 'dice') this.randomise();
      else if (b.dataset.act === 'clean') this.fresh([]);
      else if (b.dataset.mess) this.hold(b.dataset.mess);
      else if (b.dataset.act === 'done') this.close(true);
      else if (b.dataset.opt) this.pick(b.dataset.opt, b.dataset.v);
    });
    addEventListener('resize', () => { if (this.on) this.fit(); });
  }
  // the character saved on this device (or null)
  static saved() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.picks && v.look ? v : null; } catch { return null; }
  }
  // o.timed: { endsAt (ms, our clock), done(look, or null: they quit) }: the making part of a
  // multiplayer match. A clock runs; at 0 (or DONE) the character goes in as it is.
  open(o = {}) {
    const sv = Creator.saved();
    this.timed = o.timed || null;
    clearInterval(this.clock);
    const time = this.el.querySelector('.mk-time');
    time.hidden = !this.timed;
    this.el.classList.toggle('timed', !!this.timed);
    if (this.timed) {
      const tick = () => {
        const left = Math.max(0, Math.ceil((this.timed.endsAt - Date.now()) / 1000));
        const t = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (time.textContent !== t) time.textContent = t;
        time.classList.toggle('low', left <= 10);
        if (left <= 0) this.close(true);
      };
      tick();
      this.clock = setInterval(tick, 250);
    }
    this.tool = null; this.held = false;
    if (sv) {
      this.picks = { ...sv.picks }; this.pseed = sv.pseed;
      this.fresh([], false);
      try { this.game.wearLook(sv.look); } catch { /* an old or broken save: start clean */ }
    } else this.randomise(false);
    this.on = true;
    document.body.classList.add('mk-on');
    this.el.classList.add('in');
    this.showTab(this.tab || 'tools');
    this.fit();
  }
  // keep the patient in view above the panel
  fit() { const h = this.el.querySelector('.mk-panel').offsetHeight; this.game.director.setObstruction({ top: 12, bottom: h + 18, left: 0, right: 0 }); }
  // a random character, with a random few problems to start from
  randomise(show = true) {
    const kind = MAKER.kinds[rnd(MAKER.kinds.length)];
    this.picks = whoPicks(kind, newSeed());
    this.pseed = newSeed();
    this.fresh(PROBLEMS.map(([id]) => id).filter(() => Math.random() < 0.35), show);
    if (show) this.showTab(this.tab);
  }
  // this character from scratch with these problems (none: a clean face)
  fresh(problems, hop = true) {
    const g = this.game;
    g.dressUp(g.customSetup(this.picks, problems, this.pseed), hop);
    if (!problems.includes('grime')) g.dirt.wipeAll();
    if (hop) g.audio.tick();
  }
  // a new look for the same character: everything done to them stays
  pick(opt, v) {
    const p = this.picks, was = { kind: p.kind, style: p.style };
    if (opt === 'kind') this.picks = whoPicks(v, p.seed); // a kind brings its own look; tweak from there
    else p[opt] = opt === 'skin' || opt === 'eye' ? +v : v;
    const g = this.game, s = g.s, who = makeWho(this.picks);
    s.who = who; g.setup.who = who;
    s.fx = (who.face && who.face.sx) || 1; s.fy = (who.face && who.face.sy) || 1;
    s.mouth = s.mouthBase = who.mouth || null;
    if (this.picks.kind !== was.kind) s.own = who.piercings ? OWN_PIERCINGS.map((x) => ({ ...x, pull: 0, gone: false })) : [];
    // a new hairstyle comes in full
    if (this.picks.style !== was.style || this.picks.kind !== was.kind) { s.curls = CURLS.map((_, i) => (tuftKept(who.style, i) ? 9 : -1)); s.hair = 1; }
    s.hopV = -380;
    g.audio.tick();
    this.showTab(this.tab);
  }
  // pick up a reverse tool (again: put it down)
  hold(id) {
    this.tool = this.tool && this.tool.id === id ? null : MESS_BY_ID[id];
    this.showTab('tools');
  }
  // the finger on the character with a tool in hand
  down(q) {
    if (!this.tool) { // nothing in hand: point at the tray
      this.showTab('tools');
      const how = this.el.querySelector('.mk-how');
      if (how) { how.classList.remove('nudge'); void how.offsetWidth; how.classList.add('nudge'); }
      return;
    }
    this.held = true; this.last = null; this.beat = 0;
    if (this.tool.kind === 'tap') this.use(q, 0);
  }
  up() { this.held = false; }
  tick(dt, q) {
    if (!this.held || !this.tool || this.tool.kind === 'tap') return;
    this.use(q, dt);
  }
  use(q, dt) {
    const g = this.game, t = this.tool;
    if (!t.does(g, q, dt)) return;
    // a little show of it now and then: a puff where it lands, a wince, a sound
    this.beat -= dt;
    if (this.beat > 0) return;
    this.beat = t.kind === 'tap' ? 0 : 0.18;
    const p = headToStage(g.s, q.x, q.y);
    g.fx.puff(p.x, p.y, 2, '200,170,190');
    if (t.kind === 'tap' || Math.random() < 0.35) react(g.s, 'squeeze', 0.5, 'wince');
    g.audio.tick();
  }
  showTab(id) {
    this.tab = id;
    this.el.querySelectorAll('.mk-tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const p = this.picks;
    const chip = (opt, v, label, on) => `<button class="mk-chip${on ? ' on' : ''}" data-opt="${opt}" data-v="${v}" aria-pressed="${on}">${label}</button>`;
    const dot = (opt, v, c, on, label) => `<button class="mk-sw${on ? ' on' : ''}" data-opt="${opt}" data-v="${v}" style="--c:${c}" aria-pressed="${on}" aria-label="${label}"></button>`;
    let html = '';
    if (id === 'tools') {
      html = MESS.map((t) => `<button class="mk-tool${this.tool === t ? ' on' : ''}" data-mess="${t.id}" aria-pressed="${this.tool === t}" aria-label="${t.name}" title="${t.name}">${ICONS[t.icon] || ''}<b class="mk-worse" aria-hidden="true"></b></button>`).join('')
        + `<p class="mk-how">${this.tool ? `${this.tool.name.toUpperCase()}: ${HOW[this.tool.kind]}` : 'PICK A TOOL TO MAKE THEM WORSE'}</p>`;
    } else if (id === 'who') html = MAKER.kinds.map((k) => chip('kind', k, KIND_NAMES[k] || k, p.kind === k)).join('');
    else if (id === 'skin') html = MAKER.skins.map((c, i) => dot('skin', i, c, p.skin === i, `Skin ${i + 1}`)).join('');
    else if (id === 'hair') html = MAKER.hairs.map((h) => dot('hair', h.id, h.c, p.hair === h.id, `Hair ${h.id}`)).join('');
    else if (id === 'style') html = MAKER.styles.map((s) => chip('style', s, STYLE_NAMES[s], p.style === s)).join('');
    else if (id === 'eyes') html = MAKER.eyes.map((c, i) => dot('eye', i, c, p.eye === i, `Eyes ${i + 1}`)).join('');
    else if (id === 'build') html = MAKER.builds.map((b) => chip('build', b, BUILD_NAMES[b], p.build === b)).join('');
    this.opts.innerHTML = html;
    this.opts.dataset.kind = id === 'tools' ? 'tools' : id === 'skin' || id === 'hair' || id === 'eyes' ? 'dots' : 'chips';
  }
  // put away without a word to anyone (multiplayer cut the making time short)
  dismiss() {
    if (!this.on) return;
    this.timed = null; this.on = false; this.held = false; this.tool = null;
    clearInterval(this.clock);
    document.body.classList.remove('mk-on');
    this.el.classList.remove('in');
  }
  // done: keep the character (picks to edit later, the look to bring to the salon); back: as it was
  close(save) {
    if (!this.on) return;
    let look = null;
    if (save) {
      look = this.game.lookNow();
      try { localStorage.setItem(KEY, JSON.stringify({ picks: this.picks, pseed: this.pseed, look })); } catch { /* not saved */ }
    }
    this.on = false; this.held = false; this.tool = null;
    clearInterval(this.clock);
    document.body.classList.remove('mk-on');
    this.el.classList.remove('in');
    const timed = this.timed;
    this.timed = null;
    if (timed) { timed.done(look); return; }
    this.game.closeCreator();
    if (save) this.game.ui.toast('CHARACTER SAVED');
  }
}
