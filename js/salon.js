// The salon session's own screen bits (multiplayer, MULTIPLAYER_PLAN.md phase 3 and 4): a
// countdown pill while the turn runs, and at the bell a reveal bar under the before and
// after slider with Again (another turn on the character as it is now) and Done.
// The game runs the turn itself (game.startSalon / endSalon); this is only the overlay.
const I = (d) => `<svg class="sl-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  clock: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  again: I('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  done: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};

export class SalonUI {
  constructor(root, { onAgain, onDone }) {
    const el = (this.el = document.createElement('div'));
    el.className = 'sl';
    el.innerHTML = `
      <div class="sl-time" role="timer" aria-live="off">${ICON.clock}<b class="sl-n">90</b></div>
      <div class="sl-end" role="group" aria-label="Turn over">
        <p class="sl-say">TIME'S UP</p>
        <div class="sl-btns">
          <button class="sl-btn sl-again" data-act="again">${ICON.again}<span>AGAIN</span></button>
          <button class="sl-btn sl-done" data-act="done">${ICON.done}<span>DONE</span></button>
        </div>
      </div>`;
    root.appendChild(el);
    this.n = el.querySelector('.sl-n');
    this.time = el.querySelector('.sl-time');
    this.end = el.querySelector('.sl-end');
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.act === 'again') onAgain();
      else if (b && b.dataset.act === 'done') onDone();
    });
  }
  show() { document.body.classList.add('sl-on'); this.el.classList.add('in'); this.el.classList.remove('over'); this.end.classList.remove('in'); this.time.classList.remove('low'); }
  hide() { document.body.classList.remove('sl-on'); this.el.classList.remove('in', 'over'); this.end.classList.remove('in'); }
  // seconds left (rounded up); the last ten turn the pill coral
  tick(left) {
    const n = Math.max(0, Math.ceil(left));
    if (this.shown !== n) { this.shown = n; this.n.textContent = String(n); }
    this.time.classList.toggle('low', left <= 10);
  }
  // the bell: the pill goes; bar: the Again/Done bar comes up (not in multiplayer)
  over(bar = true) { this.el.classList.add('over'); this.end.classList.toggle('in', bar); }
  // room the reveal bar takes at the bottom (for the camera and the slider)
  endHeight() { return this.end.offsetHeight; }
}
