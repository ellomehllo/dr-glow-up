// The patient in the treatment chair, drawn with Canvas 2D paths in "stage" units:
// origin at the head's ideal resting centre, y pointing down. Every draw reads one
// plain state object (with the person's look in `s.who`), so the results screen can
// draw the untreated "before" patient from a second copy.
import { TAU, clamp01, lerp, smooth, easeOutBack, Poly, cubic, INK, ell } from './draw.js';
import { CURLS, CAP, tuftKept, drawHair, drawBackHair } from './hair.js';
import { drawBody, drawNeck, drawBehind } from './outfits.js';

export { INK, CURLS };
export const CAP_PATH = CAP;
export const COL = {
  pimple: '#ff5d7d', pimpleHead: '#fff4c9', mark: '255,96,120',
  gold: '#ffc93c', goldDeep: '#f39a12', goldHi: '#fff3b0',
  gel: '#7ff0d2', gelDeep: '#2fc79f', gelHi: '#eafff9',
  scar: '#d9606f', scarHi: '#f6a3ad',
  chair: '#ff9fb8', chairDeep: '#f27a9b', chairHi: '#ffd0dc',
};
const LW = 6;
export const SLOUCH = 56; // how far the head sinks into the shoulders before mewing
export const EYE = { x: 58, y: 16, rx: 26, ry: 21 };

// ---------- head outline ----------
// Right half of the outline, crown to chin centre, as four cubic segments
// [c1x, c1y, c2x, c2y, x, y] per jaw keyframe: soft (0), sharp (1), over-done (1.35).
const CROWN = [0, -202];
const JAW_SOFT = [[92, -202, 156, -142, 156, -30], [156, 44, 150, 118, 104, 156], [74, 184, 44, 194, 22, 195], [12, 196, 6, 196, 0, 196]];
const JAW_SHARP = [[92, -202, 156, -142, 156, -30], [156, 30, 140, 72, 132, 122], [106, 140, 76, 170, 44, 178], [30, 182, 14, 182, 0, 182]];
const JAW_OVER = [[92, -202, 156, -142, 156, -30], [154, 30, 142, 70, 112, 116], [86, 150, 38, 190, 12, 204], [7, 206, 3, 207, 0, 207]];
const SEGS = JAW_SOFT.map((s) => s.slice());

export function jawSegs(j, out = SEGS) {
  let a, b, t;
  if (j <= 1) { a = JAW_SOFT; b = JAW_SHARP; t = smooth(clamp01(j)); }
  else { a = JAW_SHARP; b = JAW_OVER; t = clamp01((j - 1) / 0.35); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) out[i][k] = lerp(a[i][k], b[i][k], t);
  return out;
}

const pathCache = new Map();
export function headPath(j) {
  const key = Math.round(j * 400);
  let p = pathCache.get(key);
  if (p) return p;
  const segs = jawSegs(key / 400, JAW_SOFT.map((s) => s.slice()));
  p = new Path2D();
  p.moveTo(CROWN[0], CROWN[1]);
  for (const s of segs) p.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
  const ends = [CROWN, ...segs.map((s) => [s[4], s[5]])];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], a = ends[i];
    p.bezierCurveTo(-s[2], s[3], -s[0], s[1], -a[0], a[1]);
  }
  p.closePath();
  if (pathCache.size > 600) pathCache.clear();
  pathCache.set(key, p);
  return p;
}

// the target jawline (sharp keyframe), ear to ear, slightly inside the outline
export function jawLine() {
  const right = [];
  let prev = [JAW_SHARP[0][4], JAW_SHARP[0][5]];
  for (let i = 1; i < 4; i++) {
    const s = JAW_SHARP[i];
    for (let k = 1; k <= 10; k++) {
      const q = cubic(prev, [s[0], s[1]], [s[2], s[3]], [s[4], s[5]], k / 10);
      if (q[1] >= 40) right.push(q);
    }
    prev = [s[4], s[5]];
  }
  const inset = (q) => [q[0] * 0.95, 40 + (q[1] - 40) * 0.96];
  const r = right.map(inset); // right ear -> chin
  const l = r.map((q) => [-q[0], q[1]]); // left ear -> chin
  return l.concat(r.reverse().slice(1)); // left ear -> chin -> right ear
}

// ---------- fixed features ----------
// where pimples can show up; each patient gets a random handful (more on later levels)
export const PIMPLE_SPOTS = [
  { x: -70, y: 86, r: 12 }, { x: 94, y: 78, r: 13 }, { x: -48, y: -78, r: 10 }, { x: -118, y: 118, r: 8 },
  { x: 8, y: -70, r: 8 }, { x: -16, y: 152, r: 9 }, { x: 118, y: 36, r: 8 }, { x: 34, y: 166, r: 8 },
  { x: -128, y: 4, r: 8 }, { x: 70, y: 132, r: 8 },
];

// scratch scars the healing gel fills (level 3 and up)
export const CRACKS = [
  { head: true, pts: [[40, -94], [58, -88], [76, -80], [94, -72]] },
  { head: true, pts: [[-148, 40], [-136, 50], [-122, 56], [-106, 58]] },
  { head: true, pts: [[-146, 70], [-134, 80], [-120, 86], [-106, 88]] },
  { head: true, pts: [[134, 94], [124, 106], [114, 118], [106, 132]] },
].map((c) => ({ ...c, poly: new Poly(c.pts) }));

const FRECKLES = [[-70, 48], [-84, 58], [-58, 60], [-96, 46], [-76, 66], [-62, 44], [-90, 70]];

// ---------- state ----------
const DEFAULT_SETUP = {
  who: null, pimples: PIMPLE_SPOTS.slice(0, 6), scars: true, jaw0: 0, mew0: 0, hair0: 0, brow0: 0,
};
export function makeState(setup = DEFAULT_SETUP) {
  const st = setup;
  return {
    who: st.who, scars: !!st.scars,
    // face proportions: the head is drawn (and touched) through this scale
    fx: (st.who && st.who.face && st.who.face.sx) || 1, fy: (st.who && st.who.face && st.who.face.sy) || 1,
    jaw: st.jaw0, mew: st.mew0, hair: st.hair0, browL: st.brow0, browR: st.brow0, uni: 0, puff: 0,
    nick: 0, shine: 0, sweep: -999, glow: 0, dirtAlpha: 1,
    // per scar: how far the gel has run (0..1.25) and how healed it is (0..1)
    scarF: CRACKS.map(() => 0), scarH: CRACKS.map(() => 0),
    strays: [], // stray hairs painted onto the face by a sloppy brush (head space)
    pimples: st.pimples.map((p, i) => ({ ...p, swell: 0, popped: false, mark: 0, shrink: 0, wob: i * 1.3 })),
    curls: CURLS.map((_, i) => (st.hair0 >= 1 && tuftKept(st.who && st.who.style, i) ? 9 : -1)), // seconds since each tuft grew in (-1: not yet)
    drips: [],
    mood: -0.8, moodV: -0.8,
    expr: 'normal', mouth: (st.who && st.who.mouth) || null, exprT: 0, exprBase: 'normal', mouthBase: (st.who && st.who.mouth) || null,
    look: { x: 0, y: 0.2 }, lookAt: null,
    blink: 0, blinkT: 1.6, blinking: 0,
    bob: 0, sq: 0, sqV: 0, tilt: 0, tiltV: 0, hop: 0, hopV: 0,
    sweat: 0, flush: 0,
  };
}
export function resetState(s, setup) { Object.assign(s, makeState(setup)); }

export function react(s, expr, dur = 0.8, mouth = null) {
  s.expr = expr; s.mouth = mouth; s.exprT = dur;
}

// head origin offset: sunk into the shoulders before mewing, raised past ideal after
export function headBase(s) { const m = s.mew; return m <= 1 ? SLOUCH * (1 - m) : -(m - 1) * 130; }
export function headY(s) { return headBase(s) + s.bob + s.hop; }
export function applyHead(ctx, s) { ctx.translate(0, headY(s)); if (s.tilt) ctx.rotate(s.tilt); if (s.fx !== 1 || s.fy !== 1) ctx.scale(s.fx, s.fy); }
export function headToStage(s, x, y) {
  const c = Math.cos(s.tilt), sn = Math.sin(s.tilt), X = x * s.fx, Y = y * s.fy;
  return { x: X * c - Y * sn, y: X * sn + Y * c + headY(s) };
}
export function stageToHead(s, x, y) {
  const c = Math.cos(s.tilt), sn = Math.sin(s.tilt), dy = y - headY(s);
  return { x: (x * c + dy * sn) / s.fx, y: (-x * sn + dy * c) / s.fy };
}
// rough face area (head space), used for hit tests and the brushes
export function onFace(x, y, pad = 0) { return (x / (152 + pad)) ** 2 + ((y + 8) / (204 + pad)) ** 2 <= 1; }

// springs, blinks, timers. Runs every frame for the live patient.
export function tickPatient(s, dt, time) {
  s.blinkT -= dt;
  if (s.blinkT <= 0) { s.blinking = 0.16; s.blinkT = 2.2 + Math.random() * 2.6; }
  if (s.blinking > 0) { s.blinking -= dt; s.blink = Math.sin(clamp01(1 - s.blinking / 0.16) * Math.PI); } else s.blink = 0;
  if (s.exprT > 0) { s.exprT -= dt; if (s.exprT <= 0) { s.expr = s.exprBase; s.mouth = s.mouthBase; } }
  s.moodV += (s.mood - s.moodV) * (1 - Math.exp(-dt * 3));
  let tx, ty;
  if (s.lookAt) {
    const dx = s.lookAt.x, dy = s.lookAt.y - EYE.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 120);
    tx = (dx / d) * k; ty = (dy / d) * k;
  } else { tx = Math.sin(time * 0.7) * 0.35; ty = 0.1 + Math.sin(time * 0.53) * 0.15; }
  const kl = 1 - Math.exp(-dt * 10);
  s.look.x += (tx - s.look.x) * kl; s.look.y += (ty - s.look.y) * kl;
  s.sqV += (-s.sq * 190 - s.sqV * 9) * dt; s.sq += s.sqV * dt;
  s.tiltV += (-s.tilt * 130 - s.tiltV * 7) * dt; s.tilt += s.tiltV * dt;
  s.bob = Math.sin(time * 2.1) * 2.5;
  if (s.hop < 0 || s.hopV !== 0) {
    s.hopV += 2600 * dt; s.hop += s.hopV * dt;
    if (s.hop >= 0) { if (s.hopV > 150) s.sqV -= s.hopV * 0.004; s.hop = 0; s.hopV = 0; }
  }
  for (let i = 0; i < s.curls.length; i++) if (s.curls[i] >= 0) s.curls[i] += dt;
  for (const d of s.drips) if (d.len < d.max) d.len = Math.min(d.max, d.len + dt * d.v);
  for (const t of s.strays) t.t += dt;
  if (s.sweat > 0) s.sweat = Math.max(0, s.sweat - dt * 0.7);
  if (s.flush > 0) s.flush = Math.max(0, s.flush - dt * 0.5);
}

// ---------- drawing ----------
const grads = new WeakMap();
function G(ctx) {
  let g = grads.get(ctx);
  if (g) return g;
  const gloss = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gloss.addColorStop(0, 'rgba(255,255,255,0.9)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  const band = ctx.createLinearGradient(-44, 0, 44, 0);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.7)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  halo.addColorStop(0, 'rgba(255,246,190,0.9)'); halo.addColorStop(0.55, 'rgba(255,214,140,0.35)'); halo.addColorStop(1, 'rgba(255,214,140,0)');
  const vinyl = ctx.createLinearGradient(-330, 0, 330, 0);
  vinyl.addColorStop(0, COL.chairHi); vinyl.addColorStop(0.35, COL.chair); vinyl.addColorStop(1, COL.chairDeep);
  g = { gloss, band, halo, vinyl };
  grads.set(ctx, g);
  return g;
}

// the treatment chair: padded back and a headrest that peeks out beside the jaw
function drawChair(ctx) {
  const g = G(ctx);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.roundRect(-336, 168, 672, 1300, [120, 120, 40, 40]);
  ctx.fillStyle = g.vinyl; ctx.fill();
  ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-300, 204, 600, 1240, [96, 96, 30, 30]);
  ctx.setLineDash([2, 16]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(58,39,71,0.3)'; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.roundRect(-286, 214, 70, 300, 35); ctx.fill();
  // headrest post and pad
  ctx.beginPath(); ctx.roundRect(-30, 150, 60, 50, 10); ctx.fillStyle = '#d9d2e6'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-206, -10, 412, 182, 70);
  ctx.fillStyle = g.vinyl; ctx.fill(); ctx.lineWidth = LW; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.roundRect(-190, 6, 60, 120, 30); ctx.fill();
}

// scratch scars; the healing gel runs along them, then the healed part fades away
function drawScars(ctx, s, time) {
  if (!s.scars) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 0; i < CRACKS.length; i++) {
    const P = CRACKS[i].poly, L = P.len, f = clamp01(s.scarF[i]), heal = clamp01(s.scarH[i]), Lf = L * f;
    const scar = (a, b, alpha) => {
      if (b - a < 0.5 || alpha < 0.01) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); P.trace(ctx, a, b);
      ctx.strokeStyle = COL.scar; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = COL.scarHi; ctx.lineWidth = 2.5; ctx.stroke();
    };
    scar(Lf, L, 1);
    scar(0, Lf, 1 - heal);
    ctx.globalAlpha = 1;
    if (f <= 0 || heal >= 1) continue;
    ctx.globalAlpha = 1 - heal;
    ctx.beginPath(); P.trace(ctx, 0, Lf);
    ctx.strokeStyle = INK; ctx.lineWidth = 13; ctx.stroke();
    ctx.strokeStyle = COL.gel; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = COL.gelHi; ctx.lineWidth = 3; ctx.stroke();
    const sp = ((time * 140 + L * 0.37) % (L + 60)) - 30;
    if (sp > 0 && sp < Lf) {
      ctx.beginPath(); P.trace(ctx, sp - 10, Math.min(Lf, sp + 10));
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawPimples(ctx, s, time) {
  for (const p of s.pimples) {
    if (p.popped) {
      if (p.mark > 0) { ell(ctx, p.x, p.y, p.r * 1.3, p.r * 1.1); ctx.fillStyle = `rgba(${COL.mark},${0.5 * p.mark})`; ctx.fill(); }
      continue;
    }
    const sw = p.swell;
    const wob = sw > 0.15 ? Math.sin(time * 22 + p.wob) * Math.min(1, sw) * 0.07 : 0;
    const r = p.r * (1 + 0.6 * Math.min(1.4, sw) - 0.42 * p.shrink) * (1 + wob);
    ell(ctx, p.x, p.y, r * 1.75, r * 1.55); ctx.fillStyle = `rgba(${COL.mark},${0.26 + 0.2 * Math.min(1, sw)})`; ctx.fill();
    ell(ctx, p.x, p.y, r, r * (0.92 - wob)); ctx.fillStyle = COL.pimple; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, p.x - r * 0.15, p.y - r * 0.3, r * 0.45 * (0.7 + 0.5 * Math.min(1, sw)), r * 0.38 * (0.7 + 0.5 * Math.min(1, sw)));
    ctx.fillStyle = COL.pimpleHead; ctx.fill();
    ell(ctx, p.x - r * 0.35, p.y - r * 0.42, r * 0.16, r * 0.12); ctx.fillStyle = '#fff'; ctx.fill();
  }
}

function drawEyes(ctx, s) {
  const w = s.who, e = w.eyeSize || 1;
  const hunter = clamp01((s.browL + s.browR) / 2);
  const sad = clamp01(-s.moodV) * (1 - hunter);
  for (const side of [-1, 1]) {
    const cx = side * EYE.x, cy = EYE.y;
    let kind = s.expr;
    if (kind === 'wink') kind = side > 0 ? 'happy' : 'normal';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK;
    if (kind === 'happy') {
      ctx.lineWidth = LW + 1;
      ctx.beginPath(); ctx.arc(cx, cy + 10, 20 * e, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      if (w.lashes) { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + side * 19, cy + 2); ctx.lineTo(cx + side * 27, cy - 4); ctx.stroke(); }
      continue;
    }
    if (kind === 'squeeze') {
      ctx.lineWidth = LW + 1;
      ctx.beginPath();
      ctx.moveTo(cx + side * 14, cy - 11); ctx.lineTo(cx - side * 12, cy); ctx.lineTo(cx + side * 14, cy + 11);
      ctx.stroke();
      continue;
    }
    const wide = kind === 'wide';
    const rx = EYE.rx * e * (wide ? 1.1 : 1), ry = EYE.ry * e * (wide ? 1.25 : 1);
    ctx.save(); ctx.translate(cx, cy);
    const eye = new Path2D(); eye.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill(eye);
    ctx.save(); ctx.clip(eye);
    const lx = s.look.x * 9, ly = s.look.y * 6 + 2, ir = (wide ? 10 : 13) * e;
    ell(ctx, lx, ly, ir, ir); ctx.fillStyle = w.eye.c; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = w.eye.d; ctx.stroke();
    ell(ctx, lx, ly, ir * 0.5, ir * 0.5); ctx.fillStyle = '#1e1418'; ctx.fill();
    ell(ctx, lx - ir * 0.36, ly - ir * 0.4, ir * 0.3, ir * 0.3); ctx.fillStyle = '#fff'; ctx.fill();
    ell(ctx, lx + ir * 0.32, ly + ir * 0.3, ir * 0.13, ir * 0.13); ctx.fill();
    // upper lid: droops when sad, settles low and tilted up at the outer corner with hunter eyes
    let dIn = 0.05, dOut = 0.05;
    dIn = lerp(dIn, 0.12, sad); dOut = lerp(dOut, 0.36, sad);
    dIn = lerp(dIn, 0.22, hunter); dOut = lerp(dOut, 0.12, hunter);
    if (w.lids) { dIn += w.lids * 0.8; dOut += w.lids; } // sleepy, heavy lids
    if (wide) { dIn = 0; dOut = 0; }
    dIn = lerp(dIn, 1.05, s.blink); dOut = lerp(dOut, 1.05, s.blink);
    const xi = -side * rx * 1.08, xo = side * rx * 1.08;
    const yi = -ry + dIn * 2 * ry, yo = -ry + dOut * 2 * ry;
    ctx.beginPath();
    ctx.moveTo(xi, -ry - 6); ctx.lineTo(xi, yi); ctx.quadraticCurveTo(0, (yi + yo) / 2 - 4, xo, yo); ctx.lineTo(xo, -ry - 6);
    ctx.closePath(); ctx.fillStyle = w.skin.shade; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(eye);
    // upper lid line; eyeliner makes it bolder with a wing
    const liner = w.liner && s.blink < 0.5;
    ctx.lineWidth = liner ? LW + 3 : LW;
    ctx.beginPath(); ctx.moveTo(xi * 0.98, yi); ctx.quadraticCurveTo(0, (yi + yo) / 2 - 4, xo, yo);
    ctx.lineTo(xo + side * (liner ? 18 : 9), yo - (liner ? 13 : 8));
    ctx.stroke();
    if (w.bags) {
      ctx.globalAlpha = 0.45; ctx.lineWidth = 4; ctx.strokeStyle = '#7a5a9a';
      ctx.beginPath(); ctx.arc(0, ry * 0.15, rx * 1.02, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = INK;
    }
    if (w.lashes && s.blink < 0.5) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(xo - side * 4, yo - 2); ctx.lineTo(xo + side * 5, yo - 12);
      ctx.moveTo(xo - side * 13, yo - 5); ctx.lineTo(xo - side * 8, yo - 15);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBrows(ctx, s) {
  const col = s.who.brow, kind = s.who.brows || 'normal';
  const wk = { thin: 0.62, thick: 1.45, bushy: 1.6 }[kind] || 1, angry = kind === 'angry';
  ctx.lineCap = 'round'; ctx.strokeStyle = col;
  for (const side of [-1, 1]) {
    const b = clamp01(side < 0 ? s.browL : s.browR);
    const sad = clamp01(-s.moodV) * (1 - b);
    const yIn = lerp(lerp(-36, -44, sad), -26, b) + (angry ? 4 + 8 * b : 0), yOut = lerp(-32, -31, b) - (angry ? 5 : 0);
    const xIn = side * 28, xOut = side * 98;
    ctx.globalAlpha = lerp(0.35, 1, b);
    ctx.lineWidth = lerp(4.5, 13, b) * wk + s.uni * 5;
    ctx.beginPath(); ctx.moveTo(xIn, yIn);
    ctx.quadraticCurveTo(side * 64, Math.min(yIn, yOut) - lerp(9, 5, b), xOut, yOut);
    ctx.stroke();
    if (kind === 'bushy' && b > 0.3) { // wispy ends sticking up
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) { const x = side * (34 + k * 15), y = lerp(yIn, yOut, (k + 0.5) / 5) - 10; ctx.moveTo(x, y + 6); ctx.lineTo(x + side * 7, y - 6); }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // stray hairs from brushing off the hairline: little three-hair flicks
  if (s.strays.length) {
    ctx.lineCap = 'round';
    for (const t of s.strays) {
      const k = easeOutBack(clamp01(t.t / 0.25));
      if (k <= 0) continue;
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.rot); ctx.scale(k, k);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 5, 8); ctx.quadraticCurveTo(i * 9 + 4, -4, i * 7 + 8, -16); }
      ctx.lineWidth = 6.5; ctx.strokeStyle = 'rgba(58,39,71,0.55)'; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = col; ctx.stroke();
      ctx.restore();
    }
  }
  if (s.uni > 0.01) {
    ctx.globalAlpha = clamp01(s.uni * 1.6);
    ctx.lineWidth = 10 + s.uni * 8;
    ctx.beginPath(); ctx.moveTo(-30, -25); ctx.quadraticCurveTo(0, -19 - s.uni * 4, 30, -25); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawMouth(ctx, s) {
  const m = s.moodV, y = 120, paint = s.who.lip, lip = paint || s.who.skin.lip;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW;
  const kind = s.mouth;
  if (kind === 'grin') {
    const p = new Path2D('M -38 110 Q 0 122 38 110 Q 32 146 0 148 Q -32 146 -38 110 Z');
    ctx.fillStyle = '#7a2535'; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.fillStyle = '#fff'; ctx.fillRect(-40, 104, 80, 14);
    ell(ctx, 0, 146, 18, 10); ctx.fillStyle = '#ff8fa8'; ctx.fill();
    ctx.restore();
    ctx.stroke(p);
    return;
  }
  ctx.beginPath();
  if (kind === 'o') { ell(ctx, 0, y + 4, 11, 14); ctx.fillStyle = '#7a2535'; ctx.fill(); ctx.stroke(); return; }
  let mid = y;
  if (kind === 'wince') {
    ctx.moveTo(-30, y); ctx.lineTo(-18, y - 7); ctx.lineTo(-6, y + 4); ctx.lineTo(6, y - 7); ctx.lineTo(18, y + 4); ctx.lineTo(30, y - 3);
  } else if (kind === 'flat') {
    ctx.moveTo(-24, y + 2); ctx.quadraticCurveTo(0, y + 4, 26, y - 3); mid = y + 2;
  } else if (kind === 'smirk') {
    ctx.moveTo(-28, y + 3); ctx.quadraticCurveTo(6, y + 10, 32, y - 11);
    ctx.moveTo(32, y - 11); ctx.lineTo(36, y - 15); mid = y + 4;
  } else {
    const hw = 30 + 6 * Math.max(0, m), ye = y - 10 * m, yc = y + 17 * m;
    ctx.moveTo(-hw, ye); ctx.quadraticCurveTo(0, yc, hw, ye);
    if (m > 0.45) {
      ctx.moveTo(-hw - 5, ye - 4); ctx.quadraticCurveTo(-hw - 2, ye, -hw - 4, ye + 5);
      ctx.moveTo(hw + 5, ye - 4); ctx.quadraticCurveTo(hw + 2, ye, hw + 4, ye + 5);
    }
    mid = (ye + yc) / 2;
  }
  // a soft lower lip under the line
  ctx.save();
  ctx.globalAlpha = paint ? 0.92 : 0.55; ctx.fillStyle = lip;
  const lp = new Path2D(); lp.ellipse(0, mid + 9, paint ? 20 : 17, paint ? 8 : 6, 0, 0, TAU); ctx.fill(lp);
  if (paint) { // lipstick: an upper lip too, and a little gloss
    const up = new Path2D(); up.ellipse(0, mid - 4, 19, 5, 0, 0, TAU); ctx.fill(up);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff'; const g = new Path2D(); g.ellipse(-7, mid + 7, 5, 2.2, -0.2, 0, TAU); ctx.fill(g);
  }
  ctx.restore();
  ctx.stroke();
}

// ---------- the little things that make each patient who they are ----------
function drawNose(ctx, kind) {
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.globalAlpha = 0.75;
  ctx.beginPath();
  if (kind === 'button') {
    ctx.moveTo(-12, 62); ctx.quadraticCurveTo(-16, 80, 0, 80); ctx.quadraticCurveTo(16, 80, 12, 62); ctx.stroke();
  } else if (kind === 'wide') {
    ctx.moveTo(-4, 20); ctx.bezierCurveTo(-6, 40, -12, 52, -22, 62); ctx.quadraticCurveTo(-36, 78, -16, 82); ctx.quadraticCurveTo(0, 88, 16, 82); ctx.quadraticCurveTo(36, 78, 22, 62);
    ctx.stroke();
  } else {
    const t = kind === 'long' ? -14 : 0;
    ctx.moveTo(-4, 16 + t); ctx.bezierCurveTo(-8, 38 + t * 0.5, -20, 56, -16, 72 + (t ? 6 : 0)); ctx.quadraticCurveTo(-4, 82 + (t ? 6 : 0), 8, 78 + (t ? 6 : 0)); ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(16, 70 + (t ? 6 : 0)); ctx.quadraticCurveTo(23, 76 + (t ? 6 : 0), 14, 81 + (t ? 6 : 0)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawEarring(ctx, kind, side) {
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  if (kind === 'hoop') {
    ctx.beginPath(); ctx.arc(side * 158, 84, 15, 0, TAU);
    ctx.lineWidth = 8; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = COL.gold; ctx.stroke();
    return;
  }
  const c = kind === 'silver' ? '#dfe3ee' : COL.gold;
  ell(ctx, side * 156, 66, 6, 6); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
  if (kind === 'silver') { ell(ctx, side * 163, 46, 4.5, 4.5); ctx.fill(); ctx.stroke(); }
}
function drawGlasses(ctx, kind, e) {
  const R = 30 * e + 8, y = EYE.y;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = side * EYE.x, p = new Path2D();
    if (kind === 'round') p.ellipse(x, y, R, R * 0.94, 0, 0, TAU); else p.roundRect(x - R, y - R * 0.78, R * 2, R * 1.56, 12);
    ctx.fillStyle = 'rgba(220,240,255,0.2)'; ctx.fill(p);
    ctx.lineWidth = kind === 'round' ? 6 : 8; ctx.strokeStyle = INK; ctx.stroke(p);
    ctx.beginPath(); ctx.moveTo(side * (EYE.x + R - 2), y - 4); ctx.lineTo(side * (EYE.x + R + 14), y - 9); ctx.stroke();
    ctx.globalAlpha = 0.75; ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x - R * 0.55, y - R * 0.1); ctx.lineTo(x - R * 0.2, y - R * 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = kind === 'round' ? 6 : 8; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(-(EYE.x - R), y - 2); ctx.quadraticCurveTo(0, y - 14, EYE.x - R, y - 2); ctx.stroke();
}
function silverDot(ctx, x, y, r) { ell(ctx, x, y, r, r); ctx.fillStyle = '#dfe3ee'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke(); }
function drawPiercings(ctx) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(15, 84, 7, -0.4, Math.PI * 1.15);
  ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#dfe3ee'; ctx.stroke();
  silverDot(ctx, 84, -54, 4.5); silverDot(ctx, 88, -20, 4.5);
}
function drawMustache(ctx, w) {
  const p = new Path2D('M 0 96 C -18 86 -46 88 -60 108 C -46 104 -30 112 -16 110 C -8 109 -2 106 0 104 C 2 106 8 109 16 110 C 30 112 46 104 60 108 C 46 88 18 86 0 96 Z');
  ctx.fillStyle = w.hair; ctx.fill(p); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(p);
  ctx.lineWidth = 3; ctx.strokeStyle = w.hairHi;
  ctx.beginPath(); ctx.moveTo(-40, 96); ctx.quadraticCurveTo(-24, 92, -10, 98); ctx.moveTo(14, 98); ctx.quadraticCurveTo(28, 93, 40, 97); ctx.stroke();
}
function drawWrinkles(ctx) {
  ctx.globalAlpha = 0.3; ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-40, -94); ctx.quadraticCurveTo(-4, -102, 32, -96);
  ctx.moveTo(-32, -112); ctx.quadraticCurveTo(0, -118, 28, -113);
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 96, 6); ctx.lineTo(side * 110, 0);
    ctx.moveTo(side * 97, 16); ctx.lineTo(side * 112, 17);
    ctx.moveTo(side * 95, 26); ctx.lineTo(side * 108, 33);
    ctx.moveTo(side * 34, 84); ctx.quadraticCurveTo(side * 50, 102, side * 46, 124);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHead(ctx, s, time, dirtImg) {
  const w = s.who, sk = w.skin;
  const j = s.jaw, chin = jawSegs(j)[3][5];
  const hp = headPath(j);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // ears
  for (const side of [-1, 1]) {
    ell(ctx, side * 150, 36, 20, 32); ctx.fillStyle = sk.base; ctx.fill();
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(side * 152, 38, 11, side > 0 ? -1.3 : Math.PI - 1.8, side > 0 ? 1.8 : Math.PI + 1.3); ctx.stroke();
    if (w.earring) drawEarring(ctx, w.earring, side);
  }
  // double chin while slouched
  const chub = clamp01(1 - s.mew);
  if (chub > 0.02) {
    ell(ctx, 0, chin + 2, 66 + 14 * chub, 26 * chub);
    ctx.fillStyle = sk.base; ctx.fill();
    ctx.lineWidth = LW; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, chin + 2, 66 + 14 * chub, 26 * chub, 0, 0.15, Math.PI - 0.15); ctx.stroke();
  }
  // face
  ctx.fillStyle = sk.shade; ctx.fill(hp);
  ctx.save(); ctx.clip(hp);
  ctx.save(); ctx.translate(-15, -12); ctx.fillStyle = sk.base; ctx.fill(hp); ctx.restore();
  ell(ctx, -58, -96, 40, 16, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
  ell(ctx, -4, 60, 5, 9); ctx.fill();
  if (j > 0.05) {
    ctx.fillStyle = sk.deep; ctx.globalAlpha = 0.22 * clamp01(j);
    for (const side of [-1, 1]) { ell(ctx, side * 112, 108, 28, 11, side * 0.55); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (w.freckles) {
    ctx.fillStyle = sk.freckle; ctx.globalAlpha = 0.75;
    for (const [fx, fy] of FRECKLES) for (const side of [-1, 1]) { ell(ctx, fx * side, fy, 3, 3); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke(hp);
  if (j > 0.6 && s.nick < 0.05) {
    ctx.globalAlpha = 0.45 * clamp01((j - 0.6) * 3); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-6, chin - 14); ctx.quadraticCurveTo(0, chin - 9, 6, chin - 14); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // over-sculpted: a red, irritated jawline
  if (s.nick > 0.02) {
    const n = clamp01(0.4 + s.nick);
    ctx.save(); ctx.clip(hp);
    ctx.fillStyle = `rgba(255,70,90,${0.32 * n})`;
    for (const side of [-1, 1]) for (const [x, y, r] of [[118, 112, 22], [94, 146, 20], [58, 170, 18]]) { ell(ctx, side * x, y, r, r * 0.7); ctx.fill(); }
    ctx.restore();
  }
  if (w.wrinkles) drawWrinkles(ctx);
  drawPimples(ctx, s, time);
  drawScars(ctx, s, time);
  drawEyes(ctx, s);
  drawBrows(ctx, s);
  drawNose(ctx, w.nose);
  if (w.glasses) drawGlasses(ctx, w.glasses, w.eyeSize || 1);
  if (w.piercings) drawPiercings(ctx);
  if (w.mole && !w.mustache) { ell(ctx, w.mole * 48, 104, 4.5, 4.5); ctx.fillStyle = '#4a2a24'; ctx.fill(); }
  drawMouth(ctx, s);
  if (w.mustache) drawMustache(ctx, w);
  const blush = (w.blush || 0.16) + clamp01(s.moodV) * 0.4 + s.flush * 0.45;
  ctx.fillStyle = `rgba(255,105,125,${Math.min(0.7, blush)})`;
  for (const side of [-1, 1]) { ell(ctx, side * 96, 66, w.cheeks ? 30 : 24, w.cheeks ? 17 : 13); ctx.fill(); }
  if (w.cheeks) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; for (const side of [-1, 1]) { ell(ctx, side * 90 - 6, 56, 9, 5, -0.3); ctx.fill(); } }
  drawHair(ctx, s);
  if (dirtImg && s.dirtAlpha > 0) {
    ctx.globalAlpha = s.dirtAlpha;
    ctx.drawImage(dirtImg, DIRT_BOX.x, DIRT_BOX.y, DIRT_BOX.w, DIRT_BOX.h);
    ctx.globalAlpha = 1;
  }
  if (s.shine > 0.01 || s.sweep > -900) {
    const g = G(ctx);
    ctx.save(); ctx.clip(hp);
    if (s.shine > 0.01) {
      ctx.globalAlpha = s.shine * 0.7;
      ctx.save(); ctx.translate(-62, -60); ctx.rotate(-0.5); ctx.scale(34, 76); ell(ctx, 0, 0, 1, 1); ctx.fillStyle = g.gloss; ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(70, 104); ctx.scale(26, 16); ell(ctx, 0, 0, 1, 1); ctx.fillStyle = g.gloss; ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(-6, 46); ctx.scale(8, 22); ell(ctx, 0, 0, 1, 1); ctx.fillStyle = g.gloss; ctx.fill(); ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (s.sweep > -900) {
      ctx.rotate(0.45); ctx.translate(s.sweep, 0); ctx.fillStyle = g.band; ctx.fillRect(-44, -420, 88, 840);
    }
    ctx.restore();
  }
  // gel drips from overfilled scars
  for (const d of s.drips) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.len);
    ctx.strokeStyle = INK; ctx.lineWidth = d.w + 4.5; ctx.stroke();
    ctx.strokeStyle = COL.gel; ctx.lineWidth = d.w; ctx.stroke();
    ell(ctx, d.x, d.y + d.len, d.w * 0.85, d.w * 0.95); ctx.fillStyle = COL.gel; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, d.x - d.w * 0.25, d.y + d.len - d.w * 0.3, d.w * 0.25, d.w * 0.25); ctx.fillStyle = COL.gelHi; ctx.fill();
  }
  if (s.sweat > 0.02) {
    const y = -92 + (1 - s.sweat) * 46;
    ctx.globalAlpha = Math.min(1, s.sweat * 2);
    ctx.beginPath(); ctx.moveTo(132, y - 16); ctx.quadraticCurveTo(144, y, 132, y + 8); ctx.quadraticCurveTo(120, y, 132, y - 16);
    ctx.fillStyle = '#9fe2ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export const DIRT_BOX = { x: -200, y: -250, w: 400, h: 500 };

export function drawPatient(ctx, s, time, dirtImg) {
  drawChair(ctx);
  if (s.glow > 0.01) {
    const g = G(ctx);
    ctx.save(); ctx.translate(0, headY(s) + 30); ctx.scale(330, 330);
    ctx.globalAlpha = s.glow * (0.75 + 0.25 * Math.sin(time * 3));
    ell(ctx, 0, 0, 1, 1); ctx.fillStyle = g.halo; ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const headXf = () => {
    applyHead(ctx, s);
    if (s.sq) { ctx.translate(0, 190); ctx.scale(1 - s.sq * 0.6, 1 + s.sq); ctx.translate(0, -190); }
  };
  ctx.save(); ctx.translate(0, s.hop); drawBehind(ctx, s); ctx.restore();
  ctx.save(); headXf(); drawBackHair(ctx, s); ctx.restore();
  // the neck goes in first so the clothes cover its base and the neckline frames it
  const chin = jawSegs(s.jaw)[3][5];
  drawNeck(ctx, s, headY(s), chin);
  ctx.save(); ctx.translate(0, s.hop);
  drawBody(ctx, s);
  ctx.restore();
  ctx.save(); headXf();
  drawHead(ctx, s, time, dirtImg);
  ctx.restore();
}
