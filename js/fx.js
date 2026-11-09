// Particles: sparkles, glitter, pop rings, bubbles, chips, dust puffs, comic
// words, droplets, hearts (all in stage space) and confetti (screen space).
import { TAU, star4, heart, easeOutBack, smooth, clamp01, rand, pick, glowSprite } from './draw.js';
import { INK } from './patient.js';

const SPARK = ['#ffc93c', '#ff6fae', '#45c8ff', '#ffe066', '#b18cff'];
const GLIT = ['#ffc93c', '#ff6fae', '#45c8ff', '#3fe0b5', '#b18cff', '#ffffff'];
const CONF = ['#ff6fae', '#ffc93c', '#45c8ff', '#3fe0b5', '#b18cff', '#ff8a5c'];
const FONT = 'Fredoka, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';

export class FX {
  constructor() {
    this.p = [];
    this.c = [];
    this.glow = glowSprite(64);
  }
  clear() { this.p.length = 0; this.c.length = 0; }
  _add(o) {
    o.t = -(o.delay || 0);
    if (this.p.length >= 900) this.p.splice(0, 120);
    this.p.push(o);
    return o;
  }
  spark(x, y, o = {}) {
    return this._add({
      k: 'spark', x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || rand(0.55, 0.95), size: o.size || rand(10, 20),
      rot: rand(-0.3, 0.3), vr: rand(-2.5, 2.5), col: o.col || pick(SPARK), drag: o.drag ?? 3.2, g: o.g || 0, delay: o.delay,
    });
  }
  burst(x, y, n = 10, spd = 300, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3), v = spd * rand(0.45, 1.1);
      this.spark(x, y, { ...o, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
  }
  glitter(x, y, n = 10, spd = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = spd * rand(0.3, 1);
      this._add({ k: 'glit', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.4, life: rand(0.6, 1.1), size: rand(3, 6), rot: rand(0, TAU), vr: rand(-9, 9), col: pick(GLIT), drag: 1.6, g: 700 });
    }
  }
  ring(x, y, r0, r1, life = 0.45, col = '#ffffff', w = 6) { this._add({ k: 'ring', x, y, r0, r1, life, col, w }); }
  bubbles(x, y, n = 3, spread = 30) {
    for (let i = 0; i < n; i++) {
      this._add({ k: 'bub', x: x + rand(-spread, spread), y: y + rand(-spread, spread) * 0.6, vx: rand(-40, 40), vy: rand(-150, -60), life: rand(0.7, 1.4), size: rand(6, 17), ph: rand(0, TAU), drag: 1.2, g: -40 });
    }
  }
  chips(x, y, n = 3, dx = 0, dy = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + rand(-0.9, 0.9), v = rand(160, 380);
      this._add({ k: 'chip', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: rand(0.5, 0.85), size: rand(4, 9), rot: rand(0, TAU), vr: rand(-14, 14), drag: 0.8, g: 1300 });
    }
  }
  puff(x, y, n = 2, col = '255,255,255') {
    for (let i = 0; i < n; i++) this._add({ k: 'puff', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-60, 60), vy: rand(-70, -10), life: rand(0.4, 0.7), size: rand(10, 20), col, drag: 3 });
  }
  text(x, y, str, col = '#ffc93c', size = 34, life = 0.85) {
    this._add({ k: 'txt', x, y, vx: 0, vy: -70 * (0.85 / life), life, str, col, size, rot: rand(-0.22, 0.22) * (life > 1 ? 0.4 : 1), drag: 2 });
  }
  drops(x, y, n = 5, col = '#ff7d9a') {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0), v = rand(120, 300);
      this._add({ k: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.45, 0.8), size: rand(4, 8), col, drag: 1, g: 1100 });
    }
  }
  hearts(x, y, n = 3) {
    for (let i = 0; i < n; i++) this._add({ k: 'heart', x: x + rand(-40, 40), y: y + rand(-20, 20), vx: rand(-30, 30), vy: rand(-160, -90), life: rand(0.9, 1.4), size: rand(9, 15), ph: rand(0, TAU), drag: 1, delay: i * 0.08 });
  }
  // a pimple popping: ring, sparkle star, glitter and a comic word
  pop(x, y, r, word, messy) {
    this.ring(x, y, r, r * 4.2, 0.42, messy ? '#ff7d9a' : '#ffffff', 7);
    this.burst(x, y, messy ? 5 : 9, 280, { size: rand(10, 16) });
    this.glitter(x, y, messy ? 6 : 12, 300);
    if (messy) this.drops(x, y, 7);
    if (word) this.text(x, y - r * 2.4, word, messy ? '#ff7d9a' : '#ffc93c', 30);
  }
  // sparkles strung along a polyline (head- or stage-space points already mapped)
  along(pts, n = 8, o = {}) {
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(pts.length - 1, Math.round((i / Math.max(1, n - 1)) * (pts.length - 1)))];
      this.spark(q.x + rand(-6, 6), q.y + rand(-6, 6), { delay: i * (o.step ?? 0.04), size: rand(11, 19), vy: -30, ...o });
    }
  }
  confetti(W, n = 70) {
    for (let i = 0; i < n; i++) {
      this.c.push({ x: rand(0, W), y: rand(-160, -10), vx: rand(-40, 40), vy: rand(130, 280), w: rand(7, 12), h: rand(11, 18), rot: rand(0, TAU), vr: rand(-6, 6), ph: rand(0, TAU), fs: rand(6, 12), col: pick(CONF), t: 0, life: rand(2.6, 3.8) });
    }
  }
  get count() { return this.p.length + this.c.length; }

  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      if (p.t > 0 && p.vx !== undefined) {
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy = p.vy * d + (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      P[w++] = p;
    }
    P.length = w;
    const C = this.c;
    w = 0;
    for (let i = 0; i < C.length; i++) {
      const c = C[i];
      c.t += dt;
      if (c.t >= c.life) continue;
      c.x += (c.vx + Math.sin(c.t * 3 + c.ph) * 40) * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      C[w++] = c;
    }
    C.length = w;
  }

  draw(ctx) {
    const P = this.p;
    if (!P.length) return;
    // glows first, additive
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      if (p.t <= 0 || p.k !== 'spark') continue;
      const s = sparkScale(p.t / p.life), r = p.size * s * 2.3;
      ctx.globalAlpha = 0.55 * s;
      ctx.drawImage(this.glow, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const p of P) {
      if (p.t <= 0) continue;
      const k = p.t / p.life;
      switch (p.k) {
        case 'spark': {
          const s = sparkScale(k), r = p.size * s;
          if (r < 0.5) break;
          ctx.globalAlpha = 1;
          star4(ctx, p.x, p.y, r, p.rot);
          ctx.fillStyle = p.col; ctx.fill();
          ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = INK; ctx.globalAlpha = 0.55; ctx.stroke();
          ctx.globalAlpha = 1;
          star4(ctx, p.x, p.y, r * 0.42, p.rot); ctx.fillStyle = '#ffffff'; ctx.fill();
          break;
        }
        case 'glit': {
          ctx.globalAlpha = 1 - k * k;
          const r = p.size, c = Math.cos(p.rot);
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * c, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * c, p.y); ctx.closePath();
          ctx.fillStyle = p.col; ctx.fill();
          break;
        }
        case 'ring': {
          const e = 1 - Math.pow(1 - k, 3);
          ctx.globalAlpha = 1 - k;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, TAU);
          ctx.lineWidth = p.w * (1 - k) + 1; ctx.strokeStyle = p.col; ctx.stroke();
          break;
        }
        case 'bub': {
          const r = p.size * (0.6 + 0.4 * Math.min(1, k * 4));
          const x = p.x + Math.sin(p.t * 6 + p.ph) * 5;
          ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 0.95;
          ctx.beginPath(); ctx.arc(x, p.y, r, 0, TAU);
          ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = '#7fd6ff'; ctx.stroke();
          ctx.beginPath(); ctx.arc(x - r * 0.35, p.y - r * 0.35, r * 0.25, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
          break;
        }
        case 'chip': {
          ctx.globalAlpha = 1 - smooth(clamp01((k - 0.6) / 0.4));
          const r = p.size, c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.beginPath();
          ctx.moveTo(p.x + c * r, p.y + s * r); ctx.lineTo(p.x - s * r * 0.8, p.y + c * r * 0.8); ctx.lineTo(p.x - c * r * 0.7, p.y - s * r * 0.6);
          ctx.closePath(); ctx.fillStyle = '#fffaf4'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
          break;
        }
        case 'puff': {
          ctx.globalAlpha = 0.75 * (1 - k);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, TAU);
          ctx.fillStyle = `rgba(${p.col},1)`; ctx.fill();
          break;
        }
        case 'txt': {
          const s = k < 0.3 ? easeOutBack(k / 0.3) : 1;
          ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(s, s);
          ctx.font = `700 ${p.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(p.str, 0, 0);
          ctx.fillStyle = p.col; ctx.fillText(p.str, 0, 0);
          ctx.restore();
          break;
        }
        case 'drop': {
          ctx.globalAlpha = 1 - k * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fillStyle = p.col; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
          break;
        }
        case 'heart': {
          ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          const s = k < 0.2 ? easeOutBack(k / 0.2) : 1;
          heart(ctx, p.x + Math.sin(p.t * 5 + p.ph) * 8, p.y, p.size * s);
          ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawScreen(ctx) {
    for (const c of this.c) {
      ctx.save();
      ctx.globalAlpha = c.t > c.life - 0.5 ? (c.life - c.t) / 0.5 : 1;
      ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.cos(c.t * c.fs + c.ph));
      ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function sparkScale(k) {
  return k < 0.22 ? easeOutBack(k / 0.22) : 1 - smooth((k - 0.22) / 0.78);
}
