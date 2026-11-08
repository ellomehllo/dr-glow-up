// YouTube Playables shim. Every call is a safe no-op when window.ytgame is absent
// (local dev, other hosts), and a throwing SDK call never breaks the game.
export class Playables {
  constructor() { this.yt = typeof window !== 'undefined' ? window.ytgame || null : null; }
  get present() { return !!this.yt; }
  _try(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch(() => {});
      return r;
    } catch { return undefined; }
  }
  firstFrameReady() { this._try(() => this.yt && this.yt.game.firstFrameReady()); }
  gameReady() { this._try(() => this.yt && this.yt.game.gameReady()); }
  onPause(cb) { this._try(() => this.yt && this.yt.system.onPause(cb)); }
  onResume(cb) { this._try(() => this.yt && this.yt.system.onResume(cb)); }
  audioEnabled() {
    const v = this._try(() => this.yt && this.yt.system.isAudioEnabled());
    return v === undefined || v === null ? true : !!v;
  }
  onAudioChange(cb) { this._try(() => this.yt && this.yt.system.onAudioEnabledChange(cb)); }
  sendScore(value) { this._try(() => this.yt && this.yt.engagement.sendScore({ value })); }
  async load() {
    if (!this.yt) return null;
    try { const s = await this.yt.game.loadData(); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  save(obj) { this._try(() => this.yt && this.yt.game.saveData(JSON.stringify(obj))); }
}
