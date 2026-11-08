// The game's single input: press-and-hold, then release, by pointer/touch on the
// play surface or the Space key. The finger's position (x, y, client px) is tracked
// while it is down, so the game can tell what was pressed and follow a drag. UI
// controls opt out with [data-ui].
export class HoldInput {
  constructor(surface) {
    this.held = false;
    this.pointerId = null;
    this.keyHeld = false;
    this.enabled = true;
    this.listeners = { down: [], up: [], first: [] };
    this.firstDone = false;
    this.x = 0; this.y = 0; this.src = null;
    const isUi = (e) => e.target && e.target.closest && e.target.closest('[data-ui]');
    surface.addEventListener('pointerdown', (e) => {
      if (isUi(e)) return;
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      this._first();
      if (this.pointerId !== null) {
        // a second finger while one is holding: ignore it
        if (e.pointerId !== this.pointerId && !e.isPrimary) return;
        // a fresh first press while we think one is still down means its release was
        // lost (let go outside the page, a system gesture): drop it so this press counts
        this.cancel();
      }
      this.pointerId = e.pointerId;
      this.x = e.clientX; this.y = e.clientY;
      try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this._down('pointer');
    }, { passive: false });
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this._up('pointer');
    };
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) { this.x = e.clientX; this.y = e.clientY; }
    });
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    surface.addEventListener('lostpointercapture', up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (e.repeat || this.keyHeld) return;
      this._first();
      this.keyHeld = true;
      this._down('key');
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!this.keyHeld) return;
      this.keyHeld = false;
      this._up('key');
    });
    window.addEventListener('blur', () => this.cancel());
  }
  on(type, fn) { this.listeners[type].push(fn); }
  _first() { if (!this.firstDone) { this.firstDone = true; this.listeners.first.forEach((f) => f()); } }
  _down(src) {
    if (this.held) return;
    this.held = true;
    this.src = src;
    if (this.enabled) this.listeners.down.forEach((f) => f(src));
  }
  _up(src) {
    if (!this.held) return;
    if (this.pointerId !== null || this.keyHeld) return; // another source still holding
    this.held = false;
    if (this.enabled) this.listeners.up.forEach((f) => f(src));
  }
  // drop any hold (tab hidden, pause) without treating it as a deliberate release
  cancel() {
    this.pointerId = null; this.keyHeld = false;
    if (this.held) { this.held = false; this.listeners.up.forEach((f) => f('cancel')); }
  }
}
