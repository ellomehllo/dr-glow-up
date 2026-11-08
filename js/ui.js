// DOM overlay, kept nearly text-free: level badge, AURA meter, treatment badges, a hold
// prompt with its progress meter (fill, sweet-zone band, star marker) and first-time
// hand hint, toasts, verdict stickers, a level splash, and the results card with the
// before/after slider. Line icons only (icons.js).
import { ICONS, STAR } from './icons.js';
import { RANKS } from './config.js';

const VERDICT = { perfect: 'PERFECT!', good: 'NICE!', early: 'TOO EARLY', late: 'TOO LATE', messy: 'MESSY!' };

export class UI {
  constructor(root, { onMute, onAgain, onNext, onSplit, onGesture }) {
    this.root = root;
    // logo letters; `o` keeps the wave delay running on across words
    const letters = (w, o = 0) => [...w].map((c, i) => `<span style="--i:${i + o}" aria-hidden="true">${c}</span>`).join('');
    root.innerHTML = `
      <div class="hud-top">
        <header class="bar">
          <div class="lvls" role="status" aria-label="Level 1"><span class="lv-k" aria-hidden="true">LV</span><b class="lv-n">1</b></div>
          <div class="aura" aria-label="Aura">
            <span class="aura-lbl">AURA</span>
            <div class="aura-track"><div class="aura-fill"></div>${RANKS.slice(1).map((r) => `<i style="left:${r.min}%"></i>`).join('')}<i class="pass" style="left:50%"></i></div>
            <span class="aura-num">0</span>
          </div>
          <button class="mute" data-ui type="button" aria-label="Mute sound" aria-pressed="false">${ICONS.soundOn}</button>
        </header>
        <ol class="steps"></ol>
      </div>
      <div class="title-card">
        <h1 class="tc-logo" aria-label="Dr. Glow Up"><span class="w0">${letters('DR.', 0)}</span><span class="w1">${letters('GLOW', 3)}</span><span class="w2">${letters('UP', 7)}</span></h1>
        <div class="tc-go">${ICONS.hand}<span>HOLD TO START</span></div>
      </div>
      <div class="splash" aria-live="polite"><div class="sp-in"><span class="sp-ch"></span><span class="sp-k">LEVEL</span><b class="sp-n">1</b></div><div class="sp-new"></div></div>
      <div class="dock">
        <div class="card">
          <div class="prompt">
            <div class="pr-row"><span class="pr-ico"></span><span class="pr-text"></span><span class="pr-ghost">${ICONS.hand}</span></div>
            <div class="meter"><div class="mt-zone"></div><div class="mt-fill"></div><div class="mt-star">${STAR}</div></div>
          </div>
        </div>
      </div>
      <div class="toast"></div>
      <div class="stamp"><div class="st-in"><div class="st-burst"></div><div class="st-verdict"></div><div class="st-score"></div></div></div>
      <div class="ba">
        <input class="ba-range" data-ui type="range" min="0" max="1000" value="0" aria-label="Before and after">
      </div>
      <section class="results" data-ui aria-live="polite">
        <div class="rs-badge"><span class="rs-rank"></span></div>
        <div class="rs-aura"><b></b><span class="rs-best">${ICONS.star}<span></span></span></div>
        <div class="rs-near"></div>
        <ol class="rs-bars"></ol>
        <div class="rs-new"></div>
        <div class="rs-btns">
          <button class="again" data-ui type="button" aria-label="Try again with a new patient">${ICONS.again}</button>
          <button class="next" data-ui type="button" aria-label="Next level">${ICONS.next}</button>
        </div>
      </section>`;
    const q = (s) => root.querySelector(s);
    this.el = {
      hud: q('.hud-top'), bar: q('.bar'), mute: q('.mute'), num: q('.aura-num'), fill: q('.aura-fill'), aura: q('.aura'),
      lvls: q('.lvls'), lvlN: q('.lv-n'), stepsList: q('.steps'), steps: [],
      title: q('.title-card'), splash: q('.splash'), spN: q('.sp-n'), spK: q('.sp-k'), spCh: q('.sp-ch'), spNew: q('.sp-new'),
      dock: q('.dock'), card: q('.card'), pass: q('.aura-track .pass'), rsNew: q('.rs-new'),
      prompt: q('.prompt'), prIco: q('.pr-ico'), prText: q('.pr-text'),
      zone: q('.mt-zone'), mfill: q('.mt-fill'), star: q('.mt-star'), toast: q('.toast'),
      stamp: q('.stamp'), stVerdict: q('.st-verdict'), stScore: q('.st-score'),
      ba: q('.ba'), range: q('.ba-range'), results: q('.results'), rsBadge: q('.rs-badge'), rsRank: q('.rs-rank'),
      rsAura: q('.rs-aura b'), rsBest: q('.rs-best'), rsBestN: q('.rs-best span'), rsNear: q('.rs-near'), rsBars: q('.rs-bars'),
      again: q('.again'), next: q('.next'),
    };
    const e = this.el;
    this.muted = false;
    e.mute.addEventListener('click', () => {
      onGesture && onGesture();
      this.setMuted(!this.muted);
      onMute(this.muted);
    });
    e.again.addEventListener('click', () => { onGesture && onGesture(); onAgain(); });
    e.next.addEventListener('click', () => { onGesture && onGesture(); onNext(); });
    e.range.addEventListener('input', () => onSplit(e.range.value / 1000));
    // keep the one-input rule honest: UI controls never start a hold
    for (const el of [e.mute, e.again, e.next, e.range, e.results]) el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.stampTimer = 0; this.toastTimer = 0; this.splashTimer = 0;
    // the overlay never scrolls (a focused button sliding off-screen must not drag it)
    root.addEventListener('scroll', () => { root.scrollTop = 0; root.scrollLeft = 0; });
  }

  setMuted(m) {
    this.muted = m;
    this.el.mute.innerHTML = m ? ICONS.soundOff : ICONS.soundOn;
    this.el.mute.setAttribute('aria-pressed', String(m));
    this.el.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  }
  titleCard(on) { this.el.title.classList.toggle('on', on); }
  // only the level being played is shown: a badge with its number that pops when it changes
  setLevel(n) {
    const t = String(n + 1);
    if (this.el.lvlN.textContent === t) return;
    this.el.lvlN.textContent = t;
    this.el.lvls.setAttribute('aria-label', `Level ${t}`);
    this.el.lvls.classList.remove('pop'); void this.el.lvls.offsetWidth; this.el.lvls.classList.add('pop');
  }

  // one badge per treatment of the level; one that is new on this level gets a NEW tag
  setSteps(defs, fresh = []) {
    const e = this.el;
    e.stepsList.innerHTML = defs.map((d) => `<li class="${fresh.includes(d.id) ? 'new' : ''}" aria-label="${d.name}">${ICONS[d.icon]}</li>`).join('');
    e.steps = [...e.stepsList.querySelectorAll('li')];
  }
  // the aura a level needs to pass, marked on the meter
  setPass(p) { this.el.pass.style.left = `${p}%`; }
  // info: { chapter, first (first level of a chapter), boss, fresh: [treatment defs] }
  levelSplash(n, info = {}) {
    const e = this.el, fresh = info.fresh || [];
    e.spN.textContent = String(n);
    e.spK.textContent = info.boss ? 'BOSS LEVEL' : 'LEVEL';
    e.spCh.textContent = info.first ? `CHAPTER ${info.chapter}` : '';
    e.spCh.hidden = !info.first;
    e.spNew.innerHTML = fresh.map((d) => `<span class="sp-nw" aria-label="New: ${d.name}"><span class="sp-ico">${ICONS[d.icon]}</span><b>NEW!</b></span>`).join('');
    e.spNew.hidden = !fresh.length;
    e.splash.classList.toggle('long', fresh.length > 0);
    e.splash.classList.toggle('boss', !!info.boss);
    e.splash.classList.remove('on'); void e.splash.offsetWidth;
    e.splash.classList.add('on');
    clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => e.splash.classList.remove('on'), fresh.length ? 2300 : 1500);
  }

  showTool(def, i) {
    const e = this.el;
    e.card.classList.remove('in');
    void e.card.offsetWidth; // restart the slide-in
    e.prIco.innerHTML = ICONS[def.icon] || '';
    e.prText.textContent = def.prompt;
    e.card.classList.add('in');
    e.steps.forEach((li, k) => li.classList.toggle('now', k === i));
    this._sweetKey = null;
    this.setHold(0, def.sweet, def.hold.max);
  }
  hideTool() { this.el.card.classList.remove('in'); this.el.steps.forEach((li) => li.classList.remove('now')); }

  prompt(text, ghost) {
    const e = this.el;
    e.prText.textContent = text;
    e.prompt.classList.toggle('ghost', !!ghost);
    e.prompt.classList.remove('in'); void e.prompt.offsetWidth;
    e.prompt.classList.add('in');
  }
  hidePrompt() { this.el.prompt.classList.remove('in', 'holding'); }
  holding(on) {
    this.el.prompt.classList.toggle('holding', on);
    this.el.card.classList.toggle('holding', on);
    if (on) this.el.prompt.classList.remove('ghost');
  }
  setHold(frac, sweet, max) {
    const e = this.el;
    e.mfill.style.transform = `scaleX(${Math.min(1, Math.max(0, frac)).toFixed(4)})`;
    const key = sweet ? `${sweet.c}/${sweet.w}/${max}` : 'none';
    if (key !== this._sweetKey) {
      this._sweetKey = key;
      if (sweet) {
        const a = (sweet.c - sweet.w) / max, b = (sweet.c + sweet.w) / max;
        e.zone.style.left = `${(a * 100).toFixed(2)}%`; e.zone.style.width = `${((b - a) * 100).toFixed(2)}%`;
        e.star.style.left = `${((sweet.c / max) * 100).toFixed(2)}%`;
        e.zone.hidden = false; e.star.hidden = false;
      } else { e.zone.hidden = true; e.star.hidden = true; }
    }
    e.prompt.classList.toggle('in-zone', !!sweet && Math.abs(frac * max - sweet.c) <= sweet.w);
  }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 1400);
  }
  stamp(score, kind, verdict, scored) {
    const e = this.el;
    e.stVerdict.textContent = VERDICT[verdict] || 'NICE!';
    e.stScore.textContent = scored ? `+${score}` : '';
    e.stamp.className = `stamp ${kind}`;
    void e.stamp.offsetWidth;
    e.stamp.classList.add('on');
    clearTimeout(this.stampTimer);
    this.stampTimer = setTimeout(() => e.stamp.classList.remove('on'), 1400);
  }
  setAura(v) {
    const e = this.el;
    e.num.textContent = String(v);
    e.fill.style.transform = `scaleX(${Math.min(1, v / 100)})`;
    e.aura.classList.remove('bump'); void e.aura.offsetWidth; e.aura.classList.add('bump');
  }
  stepDone(i, good) { const li = this.el.steps[i]; if (li) li.classList.add(good ? 'ok' : 'bad'); }

  showResults(r) {
    const e = this.el;
    this.root.classList.add('final');
    e.toast.classList.remove('on');
    e.stamp.classList.remove('on');
    e.splash.classList.remove('on');
    e.rsRank.textContent = r.rank;
    e.rsBadge.dataset.rank = r.rank;
    e.rsAura.textContent = String(r.aura);
    e.rsBestN.textContent = String(r.best);
    e.rsBest.classList.toggle('new', r.newBest);
    e.rsNear.innerHTML = r.near ? `${ICONS.up}<span>${r.toNext}</span><b>${r.next}</b>` : '';
    e.rsNear.hidden = !r.near;
    e.rsBars.innerHTML = r.bars.map((b, i) => `
      <li class="${i === r.worst ? 'worst' : ''}" aria-label="${b.name}: ${b.score}">
        <span class="rb-ico">${ICONS[b.icon]}</span>
        <span class="rb-bar"><i style="--s:${(b.score / 100).toFixed(3)};animation-delay:${(0.5 + i * 0.07).toFixed(2)}s"></i></span>
        <span class="rb-sc">${b.score}</span>
      </li>`).join('');
    const unlock = r.unlock || [];
    e.rsNew.innerHTML = unlock.map((d) => `<span class="rs-nw" aria-label="Unlocked: ${d.name}"><b>NEW</b><span class="sp-ico">${ICONS[d.icon]}</span></span>`).join('');
    e.rsNew.hidden = !unlock.length;
    e.next.disabled = !r.passed;
    e.next.innerHTML = r.passed ? ICONS.next : ICONS.lock;
    e.results.classList.toggle('passed', r.passed);
    e.range.value = '0';
    e.results.classList.remove('in'); void e.results.offsetWidth;
    e.results.classList.add('in');
    e.ba.classList.add('in');
  }
  // free screen area left around the UI (CSS px), used by the camera framing
  obstruction(mode) {
    const W = window.innerWidth, H = window.innerHeight;
    const hud = this.el.hud;
    const top = hud.offsetTop + hud.offsetHeight + 6;
    if (mode === 'results') {
      const p = this.el.results;
      const wide = W >= 760 && W / H > 1.05;
      const bar = hud.offsetTop + this.el.bar.offsetHeight;
      if (wide) return { top: bar + 20, bottom: 20, left: 16, right: p.offsetWidth + 40 };
      return { top: bar + 14, bottom: p.offsetHeight + 22, left: 0, right: 0 };
    }
    if (mode === 'intro') {
      const t = this.el.title;
      return { top, bottom: Math.min(H * 0.42, t.offsetHeight + 40), left: 0, right: 0 };
    }
    return { top, bottom: this.el.dock.offsetHeight + 14, left: 0, right: 0 };
  }
  // position the slider strip over the free area
  layoutSplit(o) {
    const W = window.innerWidth, H = window.innerHeight, s = this.el.ba.style;
    const aw = W - o.left - o.right, ah = H - o.top - o.bottom;
    const y = ah * 0.8 - 22; // handle sits on the chest, not over the face
    s.left = `${o.left}px`; s.width = `${aw}px`;
    s.top = `${o.top + y}px`;
    this.baLeft = o.left; this.baWidth = aw;
  }
  setSplit(v) { this.el.range.value = String(Math.round(v * 1000)); }
  // range thumbs are inset by half their width at both ends; match that exactly
  splitScreenX(v, W) {
    const thumb = 48;
    return (this.baLeft + thumb / 2 + v * (this.baWidth - thumb)) / W;
  }
  reset() {
    const e = this.el;
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.scrollTop = 0; this.root.scrollLeft = 0;
    this.root.classList.remove('final');
    e.results.classList.remove('in');
    e.ba.classList.remove('in');
    e.stamp.classList.remove('on');
    e.toast.classList.remove('on');
    e.card.classList.remove('in');
    e.steps.forEach((li) => li.classList.remove('ok', 'bad', 'now'));
    this.setAura(0);
    this.hidePrompt();
  }
}
