// The skin clinic behind the patient. Drawn in "room" units with a gentle parallax
// against the camera (the room moves and scales at K of the stage): mint walls with a
// tiled lower half, a doorway into the waiting room (its window with blinds and
// drifting clouds, and the next patients on a bench: waiting.js), a medical plus sign,
// a wall clock, a ring exam lamp, a shelf of skincare bottles, a framed certificate, a
// cabinet and privacy curtains. Soap bubbles float up in screen space.
import { TAU, makeCanvas } from './draw.js';
import { DOOR, SEAT_Y, FLOOR_IN } from './waiting.js';

const FONT = 'Fredoka, ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';

export const K = 0.62; // the room moves this much slower than the patient (depth)
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

// the shelf and the bottles on it: each drawn standing at (x, its base y)
const SHELF_Y = -150;
const BOTTLES = [
  { x: 462, w: 64, h: 146, draw(ctx, x, y) { // dropper bottle
    rr(ctx, x - 32, y - 92, 64, 92, 16, '#ffb070', LINE, 5); rr(ctx, x - 16, y - 120, 32, 30, 6, '#ffffff', LINE, 4);
    rr(ctx, x - 10, y - 146, 20, 28, 10, '#ff6fae', LINE, 4); rr(ctx, x - 20, y - 62, 40, 30, 6, '#fffaf0', null);
  } },
  { x: 565, w: 70, h: 190, draw(ctx, x, y) { // tall pump bottle
    rr(ctx, x - 35, y - 150, 70, 150, 20, '#ffffff', LINE, 5); rr(ctx, x - 13, y - 176, 26, 28, 4, '#a6dcff', LINE, 4);
    ctx.beginPath(); ctx.moveTo(x, y - 176); ctx.lineTo(x, y - 190); ctx.lineTo(x + 33, y - 190); ctx.lineWidth = 6; ctx.strokeStyle = LINE; ctx.stroke();
    rr(ctx, x - 25, y - 104, 50, 46, 8, '#c6f2dc', null);
  } },
  { x: 678, w: 108, h: 86, draw(ctx, x, y) { // cream jar
    rr(ctx, x - 48, y - 66, 96, 66, 18, '#ffd5e4', LINE, 5); rr(ctx, x - 54, y - 86, 108, 26, 10, '#ff8fb4', LINE, 5);
  } },
  { x: 790, w: 92, h: 108, draw(ctx, x, y) { // round serum bottle
    circ(ctx, x, y - 46, 46, '#c8b6ff', LINE, 5); rr(ctx, x - 16, y - 108, 32, 26, 6, '#ffffff', LINE, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x - 16, y - 62, 10, 16, -0.4, 0, TAU); ctx.fill();
  } },
];

export class Backdrop {
  constructor() {
    this.cloud = cloudSprite();
    this.bubbles = Array.from({ length: 12 }, (_, i) => ({ x: (i * 0.618 + 0.07) % 1, ph: i * 1.7, sp: 0.035 + (i % 4) * 0.012, r: 6 + (i % 5) * 3, off: (i * 0.37) % 1 }));
    this.grad = null; this.gradKey = '';
    this.cam = null;
    this.fix();
  }
  // a new level: the glass is put back and every bubble floats again
  fix() {
    this.glass = { hits: 0, cracks: [], broken: false, shards: [] };
    for (const b of this.bubbles) b.gone = -1;
    // the room's things: the clock (knocked crooked, stopped at a time), the lamp (bulb
    // smashed), the sign and the certificate (crooked), the shelf bottles (knocked off:
    // falling, then lying on the floor), and marks left on the walls, objects and glass
    this.things = { clockTilt: 0, clockStop: null, lampOut: false, signTilt: 0, certTilt: 0, bottles: BOTTLES.map(() => null) };
    this.marks = [];
  }
  // what is at room point p: the glass, a thing, the curtains, the wall or the floor
  thingAt(p) {
    if (!p) return 'none';
    if (this.inDoor(p)) return this.glass.broken ? 'door' : 'glass';
    const T = this.things;
    if (Math.hypot(p.x - 170, p.y + 620) < 80) return 'clock';
    if (Math.hypot(p.x - 400, p.y + 380) < 96) return 'lamp';
    if (Math.abs(p.x + 250) < 82 && Math.abs(p.y + 600) < 82) return 'sign';
    if (p.x > 466 && p.x < 704 && p.y > -564 && p.y < -386) return 'cert';
    for (let i = 0; i < BOTTLES.length; i++) {
      const b = BOTTLES[i];
      if (!T.bottles[i] && Math.abs(p.x - b.x) < b.w / 2 + 8 && p.y > SHELF_Y - b.h - 10 && p.y < SHELF_Y + 4) return `bottle${i}`;
    }
    if ((p.x > -1520 && p.x < -1060) || (p.x > 1060 && p.x < 1520)) return 'curtain';
    if (p.x > 400 && p.x < 940 && p.y > 330 && p.y < 890) return 'cabinet';
    return p.y > 880 ? 'floor' : 'wall';
  }
  // a mark left on the room at p (kind: scorch, paint, gel, powder, paste, hole, dent,
  // slice, fog, smudge, scratch, burnhole); one on the glass goes with the glass
  mark(p, kind, o = {}) {
    if (!p) return null;
    const glass = this.thingAt(p) === 'glass';
    const m = { x: p.x, y: p.y, kind, col: o.col || null, r: o.r || 22, rot: Math.random() * TAU, glass, t: 0, slide: kind === 'slice' && glass ? 1 : 0, drip: kind === 'gel' || kind === 'paint' ? 1 : 0, len: 0 };
    this.marks.push(m);
    if (this.marks.length > 80) this.marks.shift();
    return m;
  }
  // the nearest mark of a kind within r of p
  markNear(p, kind, r) { return this.marks.find((m) => m.kind === kind && Math.hypot(m.x - p.x, m.y - p.y) < r) || null; }
  // wipe the marks within r of p (the sponge); holes and dents stay
  wipe(p, r = 60) {
    const n = this.marks.length;
    this.marks = this.marks.filter((m) => m.kind === 'hole' || m.kind === 'burnhole' || m.kind === 'dent' || m.kind === 'scorch' || Math.hypot(m.x - p.x, m.y - p.y) > r);
    return n - this.marks.length;
  }
  // knock bottle i off the shelf (it falls to the floor and stays there)
  knockBottle(i, dir = 1) {
    const T = this.things;
    if (T.bottles[i]) return false;
    T.bottles[i] = { x: BOTTLES[i].x, y: SHELF_Y, vx: dir * (120 + Math.random() * 120), vy: -260, rot: 0, vr: dir * (5 + Math.random() * 4), rest: false };
    return true;
  }
  // screen px to room units (as last drawn)
  roomAt(x, y) {
    const c = this.cam;
    if (!c) return null;
    return { x: c.ox + (x - c.cx) / c.s, y: c.oy + (y - c.cy) / c.s };
  }
  // room units to screen px
  screenAt(x, y) { const c = this.cam; return { x: c.cx + (x - c.ox) * c.s, y: c.cy + (y - c.oy) * c.s }; }
  // inside the doorway's opening (room units), above the waiting room's floor
  inDoor(p) { return !!p && p.x > DOOR.x + 6 && p.x < DOOR.x + DOOR.w - 6 && p.y > DOOR.y + 6 && p.y < FLOOR_IN + 40; }
  // the mallet hits the glass at room point p: it cracks, and the third hit shatters it
  hitGlass(p) {
    const gl = this.glass;
    if (gl.broken) return 'open';
    gl.hits++;
    const rays = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + Math.random() * 0.5, L = 60 + Math.random() * 120;
      rays.push([a, L, (Math.random() - 0.5) * 0.5]);
    }
    gl.cracks.push({ x: p.x, y: p.y, rays });
    if (gl.hits < 3) return 'crack';
    gl.broken = true;
    for (let k = 0; k < 26; k++) {
      gl.shards.push({ x: DOOR.x + 40 + Math.random() * (DOOR.w - 80), y: DOOR.y + 60 + Math.random() * 500, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200, r: 10 + Math.random() * 22, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, rest: false });
    }
    return 'break';
  }
  // the bubble under screen point (x, y), popped (returns its centre), or null
  popBubble(x, y, time) {
    for (const b of this.bubbles) {
      const q = this.bubbleAt(b, time);
      if (q && Math.hypot(q.x - x, q.y - y) <= q.r + 12) { b.gone = q.cycle; return q; }
    }
    return null;
  }
  bubbleAt(b, time) {
    const W = this.W, H = this.H;
    if (!W) return null;
    const t = b.off + time * b.sp, k = t % 1, cycle = Math.floor(t);
    if (b.gone === cycle) return null; // popped: back on its next float up
    return { x: b.x * W + Math.sin(time * 1.3 + b.ph) * 18, y: H * (1.05 - k * 1.15), r: b.r * Math.max(0.8, Math.min(W, H) / 700), k, cycle };
  }
  update(dt) {
    for (const b of this.things.bottles) {
      if (!b || b.rest) continue;
      b.vy += 1800 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
      if (b.y > 900) { b.y = 900; b.rest = true; b.rot = Math.sign(b.vr || 1) * Math.PI / 2; }
    }
    for (const m of this.marks) {
      m.t += dt;
      if (m.slide) { m.y += dt * 60; if (m.y > FLOOR_IN) m.slide = 0; } // a slice sliding down the glass
      if (m.drip && m.t < 2.5) m.len = Math.min(60, m.len + dt * 28); // gel and paint run a little
    }
    for (const p of this.glass.shards) {
      if (p.rest) continue;
      p.vy += 1600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > FLOOR_IN + 20 + p.r * 0.3) { p.y = FLOOR_IN + 20 + p.r * 0.3; p.rest = true; }
    }
  }

  draw(ctx, W, H, time, cam, hx, hy) {
    ctx.fillStyle = WALL; ctx.fillRect(0, 0, W, H);
    const s = Math.max(0.12, cam.s * K);
    const ox = cam.x * K, oy = cam.y * K;
    this.cam = { s, ox, oy, cx: cam.cx, cy: cam.cy }; this.W = W; this.H = H;
    // visible room rectangle, for skipping off-screen pattern work
    const x0 = ox - cam.cx / s, x1 = ox + (W - cam.cx) / s, y0 = oy - cam.cy / s, y1 = oy + (H - cam.cy) / s;
    ctx.save();
    ctx.translate(cam.cx, cam.cy);
    ctx.scale(s, s);
    ctx.translate(-ox, -oy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    this.walls(ctx, x0, x1, y0, y1);
    this.waitingRoom(ctx, time);
    this.sign(ctx);
    this.clock(ctx, time);
    this.certificate(ctx);
    this.shelf(ctx);
    this.cabinet(ctx);
    this.curtains(ctx, y1);
    this.lamp(ctx, time);
    this.fallen(ctx);
    this.drawMarks(ctx, false);
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

  windowAt(ctx, time, x = -800, y = -640, w = 380, h = 470) {
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

  // the waiting room through a doorway in the back wall: a peach room with the window,
  // a bench, and the next patients on it (waiting.js draws them)
  waitingRoom(ctx, time) {
    const { x, y, w, h } = DOOR, b = y + h, r = 70;
    const inside = () => { ctx.beginPath(); archPath(ctx, x, y, w, b, r); ctx.closePath(); ctx.clip(); };
    ctx.save();
    inside();
    ctx.fillStyle = '#ffeadf'; ctx.fillRect(x, y, w, h);
    const rail = 120, f = FLOOR_IN;
    ctx.fillStyle = '#ffd9c7'; ctx.fillRect(x, rail, w, f - rail);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let yy = rail + 70; yy < f; yy += 70) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
    for (let xx = x + 20; xx < x + w; xx += 70) { ctx.moveTo(xx, rail); ctx.lineTo(xx, f); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, rail - 12, w, 22);
    // its floor: the clinic's checks, smaller with the distance
    ctx.fillStyle = '#f5e6d2'; ctx.fillRect(x, f, w, b - f);
    ctx.fillStyle = '#ecd8bf';
    for (let yy = f + 24, r = 0; yy < b; yy += 80, r++) for (let xx = x + (r % 2) * 80; xx < x + w; xx += 160) ctx.fillRect(xx, yy, 80, 80);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, f, w, 24);
    ctx.strokeStyle = LINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, f); ctx.lineTo(x + w, f); ctx.moveTo(x, f + 24); ctx.lineTo(x + w, f + 24); ctx.stroke();
    this.windowAt(ctx, time, x + 175, y + 120, 300, 290);
    // a shadow cast by the door frame, so the room reads as further back
    const sh = ctx.createLinearGradient(x + w - 90, 0, x + w, 0);
    sh.addColorStop(0, 'rgba(85,120,132,0)'); sh.addColorStop(1, 'rgba(85,120,132,0.22)');
    ctx.fillStyle = sh; ctx.fillRect(x + w - 90, y, 90, h);
    // bench back
    rr(ctx, x + 34, SEAT_Y - 150, w - 68, 130, 26, '#9fdccf', LINE, 5);
    ctx.restore();
    if (this.waiting) this.waiting.draw(ctx, time);
    ctx.save();
    inside();
    // bench seat and legs, in front of the people on it
    rr(ctx, x + 22, SEAT_Y, w - 44, 48, 18, '#7ccabd', LINE, 5);
    for (const lx of [x + 70, x + w / 2 - 13, x + w - 96]) rr(ctx, lx, SEAT_Y + 48, 26, FLOOR_IN + 14 - SEAT_Y - 48, 8, '#ffffff', LINE, 4);
    this.drawGlass(ctx, time, x, y, w, h);
    ctx.restore();
    // the frame
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    ctx.beginPath(); archPath(ctx, x, y, w, b + 34, r); ctx.lineWidth = 36; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.beginPath(); archPath(ctx, x - 18, y - 18, w + 36, b + 34, r + 18); ctx.lineWidth = 6; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.beginPath(); archPath(ctx, x + 18, y + 18, w - 36, b, Math.max(10, r - 18)); ctx.lineWidth = 4; ctx.stroke();
    ctx.lineCap = 'round';
    // and its sign
    rr(ctx, x + w / 2 - 136, y - 112, 272, 66, 22, '#ffffff', LINE, 5);
    ctx.fillStyle = LINE; ctx.font = `700 38px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WAITING', x + w / 2, y - 78);
  }

  sign(ctx) {
    const x = -250, y = -600;
    ctx.save(); ctx.translate(x, y - 78); ctx.rotate(this.things.signTilt); ctx.translate(-x, -(y - 78));
    rr(ctx, x - 78, y - 78, 156, 156, 36, '#ffffff', LINE, 6);
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 52, 36, 104, 10); ctx.roundRect(x - 52, y - 18, 104, 36, 10);
    ctx.fillStyle = '#2fc79f'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.0)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 12, y - 46, 8, 34);
    ctx.restore();
  }

  clock(ctx, time) {
    const x = 170, y = -620, r = 66, T = this.things;
    if (T.clockStop !== null) time = T.clockStop; // stopped: the hands stay put
    ctx.save(); ctx.translate(x, y); ctx.rotate(T.clockTilt); ctx.translate(-x, -y);
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
    if (T.clockStop !== null) { // a cracked face
      ctx.strokeStyle = 'rgba(85,120,132,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 20, y - 50); ctx.lineTo(x - 6, y - 24); ctx.lineTo(x - 26, y - 8); ctx.moveTo(x - 6, y - 24); ctx.lineTo(x + 14, y - 34); ctx.stroke();
    }
    ctx.restore();
  }

  certificate(ctx) {
    const x = 470, y = -560, w = 230, h = 170;
    ctx.save(); ctx.translate(x + w / 2, y); ctx.rotate(this.things.certTilt); ctx.translate(-(x + w / 2), -y);
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
    ctx.restore();
  }

  shelf(ctx) {
    const y = SHELF_Y;
    rr(ctx, 400, y, 520, 22, 6, '#ffffff', LINE, 5);
    ctx.lineWidth = 5; ctx.strokeStyle = LINE;
    ctx.beginPath(); ctx.moveTo(440, y + 22); ctx.lineTo(460, y + 60); ctx.moveTo(880, y + 22); ctx.lineTo(860, y + 60); ctx.stroke();
    BOTTLES.forEach((b, i) => { if (!this.things.bottles[i]) b.draw(ctx, b.x, y); });
  }
  // bottles knocked off the shelf: falling, then lying on the floor
  fallen(ctx) {
    this.things.bottles.forEach((f, i) => {
      if (!f) return;
      const b = BOTTLES[i];
      ctx.save(); ctx.translate(f.x, f.y - b.h / 2); ctx.rotate(f.rot); ctx.translate(-b.x, -(SHELF_Y - b.h / 2));
      b.draw(ctx, b.x, SHELF_Y);
      ctx.restore();
    });
  }
  // marks on the room (glass: only the ones on the pane, inside its clip)
  drawMarks(ctx, glass) {
    for (const m of this.marks) {
      if (m.glass !== glass) continue;
      const { x, y, r } = m;
      ctx.save();
      ctx.lineCap = 'round';
      switch (m.kind) {
        case 'scorch':
          ctx.fillStyle = 'rgba(40,24,20,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, m.rot, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(40,24,20,0.3)'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.7, r * 0.7, r * 1.1, 0, 0, TAU); ctx.fill();
          break;
        case 'burnhole':
          ctx.fillStyle = '#4a2f36'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.85, m.rot, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(40,24,20,0.8)'; ctx.lineWidth = 7; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,140,60,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
          break;
        case 'hole':
          ctx.fillStyle = 'rgba(210,210,210,0.55)'; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a2a35'; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
          ctx.strokeStyle = m.glass ? 'rgba(255,255,255,0.95)' : 'rgba(85,120,132,0.7)'; ctx.lineWidth = 2.5; ctx.beginPath();
          for (let k = 0; k < 5; k++) { const a = m.rot + k * 1.26; ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); ctx.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4); }
          ctx.stroke();
          break;
        case 'dent':
          ctx.fillStyle = 'rgba(85,120,132,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, m.rot, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(85,120,132,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * 0.8, m.rot, m.rot + 2.4); ctx.stroke();
          break;
        case 'paint': case 'gel': case 'paste': {
          ctx.fillStyle = m.kind === 'paint' ? m.col : m.kind === 'gel' ? 'rgba(63,224,181,0.75)' : 'rgba(255,255,255,0.92)';
          ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, m.rot, 0, TAU); ctx.fill();
          if (m.len > 1) { ctx.beginPath(); ctx.roundRect(x - 4, y, 8, m.len, 4); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + m.len, 6, 0, TAU); ctx.fill(); }
          if (m.kind === 'paste') { ctx.strokeStyle = '#6fd3c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.quadraticCurveTo(x, y - 6, x + r * 0.6, y); ctx.stroke(); }
          break;
        }
        case 'powder':
          ctx.fillStyle = 'rgba(255,240,248,0.75)';
          for (let k = 0; k < 7; k++) { const a = m.rot + k * 0.9, d = (k % 3) * r * 0.35; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.45, 0, TAU); ctx.fill(); }
          break;
        case 'fog':
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0.18, 0.65 - m.t * 0.02)})`; ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 1.2, 0, 0, TAU); ctx.fill();
          break;
        case 'smudge': case 'scratch':
          ctx.strokeStyle = m.kind === 'smudge' ? 'rgba(126,224,184,0.5)' : 'rgba(255,255,255,0.95)'; ctx.lineWidth = m.kind === 'smudge' ? 14 : 2.5;
          ctx.beginPath(); ctx.moveTo(x - r * Math.cos(m.rot), y - r * Math.sin(m.rot)); ctx.lineTo(x + r * Math.cos(m.rot), y + r * Math.sin(m.rot)); ctx.stroke();
          break;
        case 'slice':
          ctx.translate(x, y); ctx.rotate(m.rot);
          ctx.fillStyle = '#3f9a4a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#c4ef94'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff';
          for (let k = 0; k < 6; k++) { const a = k * 1.05; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 2.6, 1.6, a, 0, TAU); ctx.fill(); }
          ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
          break;
      }
      ctx.restore();
    }
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
    const hx = 400, hy = -380, out = this.things.lampOut;
    ctx.strokeStyle = LINE; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(980, -1200); ctx.lineTo(700, -800); ctx.lineTo(hx + 70, hy - 70); ctx.stroke();
    ctx.strokeStyle = '#e6e9f2'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(980, -1200); ctx.lineTo(700, -800); ctx.lineTo(hx + 70, hy - 70); ctx.stroke();
    circ(ctx, 700, -800, 16, '#ffc93c', LINE, 5);
    if (!out) {
      const pulse = 0.85 + 0.15 * Math.sin(time * 2.2);
      const g = ctx.createRadialGradient(hx, hy, 40, hx, hy, 260);
      g.addColorStop(0, `rgba(255,248,210,${0.75 * pulse})`); g.addColorStop(1, 'rgba(255,248,210,0)');
      ctx.fillStyle = g; ctx.fillRect(hx - 260, hy - 260, 520, 520);
    }
    circ(ctx, hx, hy, 92, '#ffffff', LINE, 7);
    circ(ctx, hx, hy, 70, null, out ? '#c9ccd8' : '#fff3a6', 18);
    circ(ctx, hx, hy, 48, out ? '#6b6f80' : '#e8f8ff', LINE, 4);
    if (out) { // the smashed bulb
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(hx - 30, hy - 20); ctx.lineTo(hx - 4, hy + 2); ctx.lineTo(hx - 18, hy + 30); ctx.moveTo(hx - 4, hy + 2); ctx.lineTo(hx + 28, hy - 8); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(hx - 16, hy - 16, 12, 20, -0.6, 0, TAU); ctx.fill();
  }

  // a glass pane across the doorway (clipped to it): a faint blue sheen with two glints,
  // cracks where the mallet hit; once broken, a few jagged pieces left in the frame and
  // shards on the waiting room floor
  drawGlass(ctx, time, x, y, w, h) {
    const gl = this.glass;
    ctx.save();
    if (!gl.broken) {
      ctx.fillStyle = 'rgba(190,235,255,0.16)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      for (const [gx, gw] of [[x + 120, 60], [x + 210, 22]]) {
        ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.lineTo(gx + gw - 420, y + h); ctx.lineTo(gx - 420, y + h); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineCap = 'round';
      for (const c of gl.cracks) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [a, L, bend] of c.rays) {
          ctx.moveTo(c.x, c.y);
          const mx = c.x + Math.cos(a + bend) * L * 0.5, my = c.y + Math.sin(a + bend) * L * 0.5;
          ctx.lineTo(mx, my); ctx.lineTo(c.x + Math.cos(a) * L, c.y + Math.sin(a) * L);
        }
        ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, TAU); ctx.stroke();
      }
      this.drawMarks(ctx, true);
    } else {
      // jagged leftovers round the frame
      ctx.fillStyle = 'rgba(190,235,255,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 140, y); ctx.lineTo(x + 60, y + 90); ctx.lineTo(x + 30, y + 260); ctx.lineTo(x, y + 320); ctx.closePath();
      ctx.moveTo(x + w, y + 40); ctx.lineTo(x + w, y + 380); ctx.lineTo(x + w - 50, y + 240); ctx.lineTo(x + w - 110, y + 120); ctx.closePath();
      ctx.fill(); ctx.stroke();
      for (const p of gl.shards) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(-p.r, p.r * 0.3); ctx.lineTo(0, -p.r * 0.7); ctx.lineTo(p.r * 0.8, p.r * 0.4); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  drawBubbles(ctx, W, H, time) {
    ctx.lineWidth = 2;
    for (const b of this.bubbles) {
      const q = this.bubbleAt(b, time);
      if (!q) continue;
      const { x, y, r, k } = q;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2) * 0.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// a doorway's outline: up the left side, round the top corners, down the right side
function archPath(ctx, x, y, w, b, r) {
  ctx.moveTo(x, b); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, b);
}
