// First-time coach marks on level 1: a spotlight on one part of the screen and a short
// tip beside it, one at a time, each closed with GOT IT (or Space / Enter). Each moment
// (the first pick, the open kit, the first hold, the first rub, the results) shows once
// per device. The game keeps running underneath, but no press reaches it while a tip is
// up. Off in ?debug runs unless &tutorial is given.
const KEY = 'marblemaxx.tutorial';

const TIPS = {
  pick: [
    { at: '.steps', title: 'THE ORDER', text: 'This patient wants these treatments, left to right. The glowing one is up next.' },
    { at: '.aura', title: 'AURA', text: 'Every treatment adds to your aura. Fill it past the dark line to pass the level.' },
    { at: '.kit', title: 'THE KIT', text: 'Tap the kit to pick a tool. Space picks the next one in the order for you.' },
  ],
  kit: [
    { at: '.tray-sheet', title: 'YOUR TOOLS', text: 'Gold-ringed tools are in the order and score. The rest are free to try: they really work on the face but score nothing. More tools, and style tools, unlock as you level up.' },
  ],
  hold: [
    { at: '.card', title: 'HOLD, THEN LET GO', text: 'Press and hold to fill the bar. Let go right on the STAR for a PERFECT. Too early or too late scores less.' },
  ],
  brush: [
    { at: '.card', title: 'RUB IT IN', text: 'Hold and drag over the face. The bar fills as you go. Keep off the eyes: hurting the patient costs aura.' },
  ],
  results: [
    { at: '.rs-bars', title: 'YOUR SCORE', text: 'Each treatment scores up to 100. Your aura is their average, minus any hurts. Pass to unlock the next level, and come back to beat your best.' },
  ],
};

export class Tutorial {
  constructor(root, on) {
    this.root = root;
    this.on = on;
    this.queue = [];
    this.cur = null;
    this.seen = new Set();
    try { this.seen = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* storage blocked: shows again */ }
    const el = document.createElement('div');
    el.className = 'tut';
    el.setAttribute('data-ui', '');
    el.innerHTML = `<div class="tut-hole"></div>
      <div class="tut-card" role="dialog" aria-modal="true" aria-labelledby="tut-k" aria-describedby="tut-t">
        <span class="tut-n"></span><b class="tut-k" id="tut-k"></b><p class="tut-t" id="tut-t"></p>
        <button class="tut-go" type="button">GOT IT</button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.hole = el.querySelector('.tut-hole');
    this.card = el.querySelector('.tut-card');
    el.querySelector('.tut-go').addEventListener('click', () => this.next());
    // Space / Enter close the tip; the game's own Space never sees them while one is up
    const keys = (e) => {
      if (!this.cur || (e.code !== 'Space' && e.code !== 'Enter')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'keydown' && !e.repeat) this.next();
    };
    window.addEventListener('keydown', keys, { capture: true });
    window.addEventListener('keyup', keys, { capture: true });
    window.addEventListener('resize', () => this.place());
  }
  get active() { return !!this.cur; }
  // a moment in the first level: show its tips once
  moment(id) {
    if (!this.on || this.seen.has(id) || !TIPS[id]) return;
    this.seen.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* not saved */ }
    const all = TIPS[id].length;
    TIPS[id].forEach((t, k) => this.queue.push({ ...t, n: all > 1 ? `${k + 1}/${all}` : '' }));
    if (!this.cur) this.next();
  }
  next() {
    this.cur = this.queue.shift() || null;
    this.el.classList.toggle('on', !!this.cur);
    if (!this.cur) return;
    this.card.querySelector('.tut-k').textContent = this.cur.title;
    this.card.querySelector('.tut-t').textContent = this.cur.text;
    this.card.querySelector('.tut-n').textContent = this.cur.n;
    this.card.classList.remove('in'); void this.card.offsetWidth; this.card.classList.add('in');
    this.place();
    this.card.querySelector('.tut-go').focus({ preventScroll: true });
  }
  // the spotlight round the target, and the card on whichever side has more room
  place() {
    if (!this.cur) return;
    const t = this.root.querySelector(this.cur.at), W = innerWidth, H = innerHeight;
    const r = t ? t.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
    const pad = 8;
    Object.assign(this.hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const cw = Math.min(340, W - 32);
    this.card.style.width = `${cw}px`;
    this.card.style.left = `${Math.max(16, Math.min(W - cw - 16, r.left + r.width / 2 - cw / 2))}px`;
    const ch = this.card.offsetHeight, below = H - (r.top + r.height), above = r.top;
    let y = below >= above ? r.top + r.height + pad + 14 : r.top - pad - 14 - ch;
    y = Math.max(16, Math.min(H - ch - 16, y));
    this.card.style.top = `${y}px`;
  }
}
