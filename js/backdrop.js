// The skin clinic behind the patient. Drawn in "room" units with a gentle parallax
// against the camera (the room moves and scales at K of the stage): mint walls with a
// tiled lower half, a window with blinds and drifting clouds, a medical plus sign, a
// wall clock, a ring exam lamp, a shelf of skincare bottles, a framed certificate, a
// cabinet, a potted plant and privacy curtains. Soap bubbles float up in screen space.
import { TAU, makeCanvas } from './draw.js';

const K = 0.62;
const LINE = '#557884';
const WALL = '#d6f3ec';

function cloudSprite() {
  const c = makeCanvas(300, 150), x = c.getContext('2d');
  const puffs = [[70, 92, 46], [120, 70, 58], [180, 66, 50], [228, 92, 42], [150, 104, 50], [96, 108, 36], [204, 110, 34]];
  const draw = (dy, col) => {
    x.fillStyle = col;
    x.beginPath();
    for (const [px, py, r] of puffs) { x.moveTo(px + r, py + dy); x.arc(px, py + dy, r, 0, TAU); }
    x.fill();
  };
  draw(8, '#d5f1ff');
  draw(0, '#ffffff');
  return c;
}

function rr(ctx, x, y, w, h, r, fill, stroke = LINE, lw = 5) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function circ(ctx, x, y, r, fill, stroke = LINE, lw = 5) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

export class Backdrop {
  constructor() {
    this.cloud = cloudSprite();
    this.bubbles = Array.from({ length: 12 }, (_, i) => ({ x: (i * 0.618 + 0.07) % 1, ph: i * 1.7, sp: 0.035 + (i % 4) * 0.012, r: 6 + (i % 5) * 3, off: (i * 0.37) % 1 }));
    this.grad = null; this.gradKey = '';
  }

  draw(ctx, W, H, time, cam, hx, hy) {
    ctx.fillStyle = WALL; ctx.fillRect(0, 0, W, H);
    const s = Math.max(0.12, cam.s * K);
    const ox = cam.x * K, oy = cam.y * K;
    // visible room rectangle, for skipping off-screen pattern work
    const x0 = ox - cam.cx / s, x1 = ox + (W - cam.cx) / s, y0 = oy - cam.cy / s, y1 = oy + (H - cam.cy) / s;
    ctx.save();
    ctx.translate(cam.cx, cam.cy);
    ctx.scale(s, s);
    ctx.translate(-ox, -oy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    this.walls(ctx, x0, x1, y0, y1);
    this.windowAt(ctx, time);
    this.sign(ctx);
    this.clock(ctx, time);
    this.certificate(ctx);
    this.shelf(ctx);
    this.cabinet(ctx);
    this.plant(ctx, time);
    this.curtains(ctx, y1);
    this.lamp(ctx, time);
    ctx.restore();
    // warm light around the patient
    const hr = Math.max(160, 380 * cam.s);
    const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    h.addColorStop(0, 'rgba(255,253,232,0.55)'); h.addColorStop(1, 'rgba(255,253,232,0)');
    ctx.fillStyle = h; ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
    this.drawBubbles(ctx, W, H, time);
  }

  walls(ctx, x0, x1, y0, y1) {
    // faint plus-sign wallpaper
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 6;
    ctx.beginPath();
    const step = 150;
    for (let y = Math.floor(y0 / step) * step; y < Math.min(y1, 290); y += step) {
      const row = Math.round(y / step);
      for (let x = Math.floor(x0 / step) * step + (row % 2 ? step / 2 : 0); x < x1 + step; x += step) {
        ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11);
      }
    }
    ctx.stroke();
    // tiled lower wall, rail, skirting, floor
    const L = x0 - 20, R = x1 + 20;
    ctx.fillStyle = '#b9e6dc'; ctx.fillRect(L, 300, R - L, 600);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = 380; y < 900; y += 80) { ctx.moveTo(L, y); ctx.lineTo(R, y); }
    for (let x = Math.floor(L / 80) * 80; x < R; x += 80) { ctx.moveTo(x, 300); ctx.lineTo(x, 900); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(L, 286, R - L, 24);
    ctx.strokeStyle = LINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L, 286); ctx.lineTo(R, 286); ctx.moveTo(L, 310); ctx.lineTo(R, 310); ctx.stroke();
    if (y1 > 880) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(L, 880, R - L, 34);
      ctx.fillStyle = '#f5e6d2'; ctx.fillRect(L, 914, R - L, Math.max(0, y1 - 914 + 20));
      ctx.fillStyle = '#ecd8bf';
      for (let y = 914, r = 0; y < y1 + 120; y += 110, r++) {
        for (let x = Math.floor(L / 220) * 220 + (r % 2) * 110; x < R; x += 220) ctx.fillRect(x, y, 110, 110);
      }
      ctx.strokeStyle = LINE; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(L, 880); ctx.lineTo(R, 880); ctx.moveTo(L, 914); ctx.lineTo(R, 914); ctx.stroke();
    }
  }

  windowAt(ctx, time) {
    const x = -800, y = -640, w = 380, h = 470;
    // sunbeams falling into the room
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(x + 40, y + h); ctx.lineTo(x + 200, y + h); ctx.lineTo(x + 620, y + h + 700); ctx.lineTo(x + 330, y + h + 700); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 240, y + h); ctx.lineTo(x + 330, y + h); ctx.lineTo(x + 820, y + h + 700); ctx.lineTo(x + 690, y + h + 700); ctx.closePath(); ctx.fill();
    rr(ctx, x - 22, y - 22, w + 44, h + 44, 26, '#ffffff', LINE, 6);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#6fd0ff'); g.addColorStop(1, '#c8f1ff');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    circ(ctx, x + w - 90, y + 150, 46, '#fff3a6', null);
    ctx.globalAlpha = 0.95;
    for (const [k, cy, sc] of [[0.012, y + 220, 0.75], [0.008, y + 330, 0.55]]) {
      const cw = 300 * sc, cx = x - cw + (((time * k) % 1) * (w + cw * 2));
      ctx.drawImage(this.cloud, cx, cy - cw / 4, cw, cw / 2);
    }
    ctx.globalAlpha = 1;
    // blinds pulled half way
    const bh = h * 0.36;
    ctx.fillStyle = '#fffaf2'; ctx.fillRect(x, y, w, bh);
    ctx.strokeStyle = 'rgba(85,120,132,0.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); for (let yy = y + 18; yy < y + bh; yy += 18) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); } ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + bh); ctx.lineTo(x + w, y + bh); ctx.lineWidth = 8; ctx.stroke();
    ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x + w / 2, y + bh + 4); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = LINE;
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 6, y + bh + 4); ctx.lineTo(x + w / 2 - 6, y + h); ctx.moveTo(x + w / 2 + 6, y + bh + 4); ctx.lineTo(x + w / 2 + 6, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 40, y + bh); ctx.lineTo(x + w - 40, y + bh + 120); ctx.stroke();
    circ(ctx, x + w - 40, y + bh + 128, 9, '#ffc93c', LINE, 3);
    rr(ctx, x - 46, y + h + 18, w + 92, 30, 10, '#ffffff', LINE, 5);
    // a little succulent on the sill
    rr(ctx, x + 40, y + h - 30, 56, 48, [4, 4, 14, 14], '#ff9a76', LINE, 4);
    ctx.fillStyle = '#5fd08f'; ctx.strokeStyle = LINE; ctx.lineWidth = 4;
    for (const [dx, a] of [[-14, -0.5], [0, 0], [14, 0.5]]) {
      ctx.save(); ctx.translate(x + 68 + dx, y + h - 32); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -18, 11, 22, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  sign(ctx) {
    const x = -250, y = -600;
    rr(ctx, x - 78, y - 78, 156, 156, 36, '#ffffff', LINE, 6);
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 52, 36, 104, 10); ctx.roundRect(x - 52, y - 18, 104, 36, 10);
    ctx.fillStyle = '#2fc79f'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.0)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 12, y - 46, 8, 34);
  }

  clock(ctx, time) {
    const x = 170, y = -620, r = 66;
    circ(ctx, x, y, r + 10, '#ffb0c8', LINE, 6);
    circ(ctx, x, y, r, '#ffffff', LINE, 4);
    ctx.strokeStyle = LINE; ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, k = i % 3 === 0 ? 0.72 : 0.82; ctx.moveTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); }
    ctx.stroke();
    const m = time * 0.3, hh = time * 0.025;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(hh) * r * 0.42, y - Math.cos(hh) * r * 0.42); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ff6fae';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(m) * r * 0.66, y - Math.cos(m) * r * 0.66); ctx.stroke();
    circ(ctx, x, y, 7, LINE, null);
  }

  certificate(ctx) {
    const x = 470, y = -560, w = 230, h = 170;
    rr(ctx, x, y, w, h, 10, '#ffcf7a', LINE, 6);
    rr(ctx, x + 18, y + 18, w - 36, h - 36, 4, '#fffaf0', null);
    ctx.strokeStyle = 'rgba(85,120,132,0.55)'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 50, y + 52); ctx.lineTo(x + w - 50, y + 52);
    for (const yy of [y + 80, y + 100]) { ctx.moveTo(x + 40, yy); for (let xx = x + 40; xx <= x + w - 70; xx += 20) ctx.quadraticCurveTo(xx + 5, yy - 4, xx + 10, yy); }
    ctx.stroke();
    ctx.fillStyle = '#ff6fae';
    ctx.beginPath(); ctx.moveTo(x + w - 60, y + 128); ctx.lineTo(x + w - 70, y + 160); ctx.lineTo(x + w - 58, y + 152); ctx.lineTo(x + w - 50, y + 164); ctx.lineTo(x + w - 46, y + 130); ctx.fill();
    circ(ctx, x + w - 56, y + 124, 18, '#ffc93c', LINE, 4);
  }

  shelf(ctx) {
    const y = -150;
    rr(ctx, 400, y, 520, 22, 6, '#ffffff', LINE, 5);
    ctx.lineWidth = 5; ctx.strokeStyle = LINE;
    ctx.beginPath(); ctx.moveTo(440, y + 22); ctx.lineTo(460, y + 60); ctx.moveTo(880, y + 22); ctx.lineTo(860, y + 60); ctx.stroke();
    // dropper bottle
    rr(ctx, 430, y - 92, 64, 92, 16, '#ffb070', LINE, 5);
    rr(ctx, 446, y - 120, 32, 30, 6, '#ffffff', LINE, 4);
    rr(ctx, 452, y - 146, 20, 28, 10, '#ff6fae', LINE, 4);
    rr(ctx, 442, y - 62, 40, 30, 6, '#fffaf0', null);
    // tall pump bottle
    rr(ctx, 530, y - 150, 70, 150, 20, '#ffffff', LINE, 5);
    rr(ctx, 552, y - 176, 26, 28, 4, '#a6dcff', LINE, 4);
    ctx.beginPath(); ctx.moveTo(565, y - 176); ctx.lineTo(565, y - 190); ctx.lineTo(598, y - 190); ctx.lineWidth = 6; ctx.stroke();
    rr(ctx, 540, y - 104, 50, 46, 8, '#c6f2dc', null);
    // cream jar
    rr(ctx, 630, y - 66, 96, 66, 18, '#ffd5e4', LINE, 5);
    rr(ctx, 624, y - 86, 108, 26, 10, '#ff8fb4', LINE, 5);
    // round serum bottle
    circ(ctx, 790, y - 46, 46, '#c8b6ff', LINE, 5);
    rr(ctx, 774, y - 108, 32, 26, 6, '#ffffff', LINE, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(774, y - 62, 10, 16, -0.4, 0, TAU); ctx.fill();
  }

  cabinet(ctx) {
    const x = 400, y = 330, w = 540, h = 560;
    rr(ctx, x, y, w, h, 18, '#ffffff', LINE, 6);
    rr(ctx, x + 24, y + 70, (w - 72) / 2, h - 96, 14, '#a6dcff', LINE, 5);
    rr(ctx, x + 48 + (w - 72) / 2, y + 70, (w - 72) / 2, h - 96, 14, '#a6dcff', LINE, 5);
    rr(ctx, x + w / 2 - 34, y + 220, 14, 70, 7, '#ffffff', LINE, 4);
    rr(ctx, x + w / 2 + 20, y + 220, 14, 70, 7, '#ffffff', LINE, 4);
    rr(ctx, x - 16, y - 14, w + 32, 40, 12, '#eef3f8', LINE, 6);
    // cotton jar and tissue box on the counter
    rr(ctx, x + 50, y - 120, 100, 108, 20, 'rgba(220,245,255,0.85)', LINE, 5);
    ctx.fillStyle = '#ffffff';
    for (const [cx, cy] of [[x + 76, y - 44], [x + 104, y - 40], [x + 126, y - 52], [x + 90, y - 70], [x + 118, y - 78]]) circ(ctx, cx, cy, 16, '#ffffff', 'rgba(85,120,132,0.5)', 3);
    rr(ctx, x + 40, y - 136, 120, 24, 10, '#3fe0b5', LINE, 5);
    rr(ctx, x + 330, y - 84, 150, 72, 14, '#ffc93c', LINE, 5);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = LINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 380, y - 84); ctx.quadraticCurveTo(x + 384, y - 140, x + 410, y - 128); ctx.quadraticCurveTo(x + 440, y - 150, x + 432, y - 84); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  plant(ctx, time) {
    const x = -560, y = 900;
    const sway = Math.sin(time * 0.8) * 0.04;
    ctx.save(); ctx.translate(x, y - 150); ctx.rotate(sway);
    ctx.fillStyle = '#5fd08f'; ctx.strokeStyle = LINE; ctx.lineWidth = 5;
    for (const [a, l] of [[-0.9, 250], [-0.45, 320], [0, 360], [0.45, 310], [0.9, 240], [-0.2, 280], [0.25, 270]]) {
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(48, -l * 0.5, 0, -l); ctx.quadraticCurveTo(-48, -l * 0.5, 0, 0);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -l * 0.85); ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 5;
      ctx.restore();
    }
    ctx.restore();
    rr(ctx, x - 90, y - 170, 180, 170, [10, 10, 34, 34], '#ff9a76', LINE, 6);
    rr(ctx, x - 104, y - 186, 208, 36, 12, '#ffb594', LINE, 6);
  }

  curtains(ctx, y1) {
    const bottom = Math.min(Math.max(y1, 0), 900);
    ctx.fillStyle = '#c9ccd8'; ctx.fillRect(-1700, -1130, 3400, 18);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -1520 : 1060, w = 460;
      ctx.beginPath();
      ctx.moveTo(x0, -1110);
      ctx.lineTo(x0 + w, -1110);
      ctx.lineTo(x0 + w, bottom);
      for (let i = 0; i < 8; i++) ctx.quadraticCurveTo(x0 + w - (i + 0.5) * (w / 8), bottom + 26, x0 + w - (i + 1) * (w / 8), bottom);
      ctx.closePath();
      ctx.fillStyle = '#ffc2d8'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = LINE; ctx.stroke();
      ctx.strokeStyle = 'rgba(232,120,160,0.55)'; ctx.lineWidth = 12;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) { const xx = x0 + i * (w / 8); ctx.moveTo(xx, -1100); ctx.lineTo(xx, bottom - 6); }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i <= 8; i++) circ(ctx, x0 + i * (w / 8), -1112, 9, '#ffffff', LINE, 3);
    }
  }

  lamp(ctx, time) {
    const hx = 400, hy = -380;
    ctx.strokeStyle = LINE; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(980, -1200); ctx.lineTo(700, -800); ctx.lineTo(hx + 70, hy - 70); ctx.stroke();
    ctx.strokeStyle = '#e6e9f2'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(980, -1200); ctx.lineTo(700, -800); ctx.lineTo(hx + 70, hy - 70); ctx.stroke();
    circ(ctx, 700, -800, 16, '#ffc93c', LINE, 5);
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.2);
    const g = ctx.createRadialGradient(hx, hy, 40, hx, hy, 260);
    g.addColorStop(0, `rgba(255,248,210,${0.75 * pulse})`); g.addColorStop(1, 'rgba(255,248,210,0)');
    ctx.fillStyle = g; ctx.fillRect(hx - 260, hy - 260, 520, 520);
    circ(ctx, hx, hy, 92, '#ffffff', LINE, 7);
    circ(ctx, hx, hy, 70, null, '#fff3a6', 18);
    circ(ctx, hx, hy, 48, '#e8f8ff', LINE, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(hx - 16, hy - 16, 12, 20, -0.6, 0, TAU); ctx.fill();
  }

  drawBubbles(ctx, W, H, time) {
    const base = Math.min(W, H) / 700;
    ctx.lineWidth = 2;
    for (const b of this.bubbles) {
      const k = (b.off + time * b.sp) % 1;
      const y = H * (1.05 - k * 1.15), x = b.x * W + Math.sin(time * 1.3 + b.ph) * 18;
      const r = b.r * Math.max(0.8, base);
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2) * 0.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
