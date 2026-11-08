// 2D camera: eases between views ({x, y, r} = stage point and radius to fit), fits that
// circle into whatever part of the screen the UI leaves free, and adds a gentle sway,
// a punchy zoom "bump" and trauma-based shake.
import { easeIO } from './draw.js';

export class Director {
  constructor(view) {
    this.cur = { ...view }; this.from = null; this.to = null;
    this.t = 1; this.dur = 1;
    this.trauma = 0; this.bumpV = 0; this.bumpX = 0;
    this.obs = { top: 0, bottom: 0, left: 0, right: 0 }; this.obsGoal = { ...this.obs };
    this.out = { s: 1, cx: 0, cy: 0, x: 0, y: 0, rot: 0 };
    this.free = { x: 0, y: 0, w: 1, h: 1 };
  }
  snap(v) { this.cur = { ...v }; this.t = 1; }
  go(v, dur) { this.from = { ...this.cur }; this.to = { ...v }; this.t = 0; this.dur = dur; }
  get moving() { return this.t < 1; }
  setObstruction(o, snap = false) { Object.assign(this.obsGoal, o); if (snap) Object.assign(this.obs, o); }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  bump(a) { this.bumpV += a * 6; }
  update(dt, time, W, H) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = easeIO(this.t);
      for (const key of ['x', 'y', 'r']) this.cur[key] = this.from[key] + (this.to[key] - this.from[key]) * k;
    }
    const ko = 1 - Math.exp(-dt * 6);
    for (const key in this.obs) this.obs[key] += (this.obsGoal[key] - this.obs[key]) * ko;
    // zoom bump: a damped spring kicked by bump()
    this.bumpV += (-this.bumpX * 160 - this.bumpV * 11) * dt;
    this.bumpX += this.bumpV * dt;
    const o = this.obs;
    const aw = Math.max(80, W - o.left - o.right), ah = Math.max(80, H - o.top - o.bottom);
    this.free = { x: o.left, y: o.top, w: aw, h: ah };
    const s = (Math.min(aw, ah) / (2 * this.cur.r)) * (1 + this.bumpX * 0.05);
    let sx = 0, sy = 0, rot = 0;
    if (this.trauma > 0) {
      const q = this.trauma * this.trauma;
      sx = Math.sin(time * 61) * 14 * q; sy = Math.sin(time * 47 + 2) * 10 * q; rot = Math.sin(time * 37 + 4) * 0.03 * q;
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }
    const out = this.out;
    out.s = s; out.rot = rot;
    out.cx = o.left + aw / 2 + sx; out.cy = o.top + ah / 2 + sy;
    out.x = this.cur.x + Math.sin(time * 0.45) * 4; out.y = this.cur.y + Math.sin(time * 0.37 + 1) * 3;
  }
  apply(ctx) {
    const o = this.out;
    ctx.translate(o.cx, o.cy);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(o.s, o.s);
    ctx.translate(-o.x, -o.y);
  }
  toScreen(x, y) {
    const o = this.out;
    return { x: o.cx + (x - o.x) * o.s, y: o.cy + (y - o.y) * o.s };
  }
  // screen px to stage units (ignores the tiny shake rotation)
  toStage(px, py) {
    const o = this.out;
    return { x: o.x + (px - o.cx) / o.s, y: o.y + (py - o.cy) / o.s };
  }
}
