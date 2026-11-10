// The patient in the treatment chair, drawn with Canvas 2D paths in "stage" units:
// origin at the head's ideal resting centre, y pointing down. Every draw reads one
// plain state object (with the person's look in `s.who`), so the results screen can
// draw the untreated "before" patient from a second copy.
import { TAU, clamp01, lerp, smooth, easeOutBack, Poly, cubic, INK, ell, star4, soft, mixHex, rgba } from './draw.js';
import { toneOf, LASH, OL } from './tones.js';
import { CURLS, CAP, tuftKept, drawHair, drawBackHair } from './hair.js';
import { drawBody, drawNeck, drawBehind } from './outfits.js';
import { mix } from './people.js';
import { hairNow, paintNow, drawPierced, drawGems, drawShadow, drawMakeup, drawClips, drawShades } from './style.js';
import { makeDent, drawDebris, drawWorms, drawOwn, drawTeeth, AAH, OWN_PIERCINGS } from './extras.js';

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
const SLOUCH = 56; // how far the head sinks into the shoulders before mewing
export const EYE = { x: 58, y: 16, rx: 26, ry: 21 };

// ---------- head outline ----------
// Right half of the outline, crown to chin centre, as four cubic segments
// [c1x, c1y, c2x, c2y, x, y] per jaw keyframe: soft (0), sharp (1), over-done (1.35).
const CROWN = [0, -202];
const JAW_SOFT = [[92, -202, 156, -142, 156, -30], [156, 44, 150, 118, 104, 156], [74, 184, 44, 194, 22, 195], [12, 196, 6, 196, 0, 196]];
const JAW_SHARP = [[92, -202, 156, -142, 156, -30], [156, 30, 140, 72, 132, 122], [106, 140, 76, 170, 44, 178], [30, 182, 14, 182, 0, 182]];
const JAW_OVER = [[92, -202, 156, -142, 156, -30], [154, 30, 142, 70, 112, 116], [86, 150, 38, 190, 12, 204], [7, 206, 3, 207, 0, 207]];
const SEGS = JAW_SOFT.map((s) => s.slice());

function jawSegs(j, out = SEGS) {
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

// scratch scars the healing gel fills; a patient gets one to four of them
export const CRACKS = [
  { head: true, pts: [[40, -94], [58, -88], [76, -80], [94, -72]] },
  { head: true, pts: [[-148, 40], [-136, 50], [-122, 56], [-106, 58]] },
  { head: true, pts: [[-146, 70], [-134, 80], [-120, 86], [-106, 88]] },
  { head: true, pts: [[134, 94], [124, 106], [114, 118], [106, 132]] },
].map((c) => {
  const poly = new Poly(c.pts), m = poly.at(poly.len / 2);
  return { ...c, poly, t: { x: m.x, y: m.y, r: poly.len / 2 + 16 } }; // t: its press target
});

// wrinkles the little iron smooths out, each a line it glides along
export const WRINKLES = [
  [[-52, -66], [-18, -72], [18, -72], [52, -66]], // forehead
  [[-42, -88], [-14, -93], [14, -93], [42, -88]],
  [[-36, 82], [-50, 100], [-50, 124]], // smile lines
  [[36, 82], [50, 100], [50, 124]],
  [[-118, -6], [-104, 12], [-118, 30]], // crow's feet
  [[118, -6], [104, 12], [118, 30]],
].map((pts, i) => ({ i, pts, poly: new Poly(pts) }));

// where sun spots can sit for the laser (clear of the eyes, nose, mouth and brows)
export const SPOT_SPOTS = [
  [-72, -66], [-22, -58], [30, -84], [76, -62], [-42, -98], [54, -100], [-124, -18], [124, -30],
  [-118, 34], [-100, 92], [-70, 112], [-128, 76], [112, 44], [96, 100], [70, 112], [126, 80], [118, 8],
  [-30, 170], [26, 176], [-96, 150], [92, 152],
].map(([x, y]) => ({ x, y }));

const FRECKLES = [[-70, 48], [-84, 58], [-58, 60], [-96, 46], [-76, 66], [-62, 44], [-90, 70]];

// ---------- state ----------
const DEFAULT_SETUP = {
  who: null, pimples: PIMPLE_SPOTS.slice(0, 6), cracks: CRACKS, jaw0: 0, mew0: 0, hair0: 0, brow0: 0,
};
export function makeState(setup = DEFAULT_SETUP) {
  const st = setup;
  return {
    who: st.who, cracks: st.cracks || [],
    // face proportions: the head is drawn (and touched) through this scale
    fx: (st.who && st.who.face && st.who.face.sx) || 1, fy: (st.who && st.who.face && st.who.face.sy) || 1,
    jaw: st.jaw0, mew: st.mew0, hair: st.hair0, browL: st.brow0, browR: st.brow0, uni: 0, puff: 0,
    nick: 0, shine: 0, sweep: -999, glow: 0, dirtAlpha: st.dirt === 0 ? 0 : 1,
    // per scar: how far the gel has run (0..1.25) and how healed it is (0..1)
    scarF: (st.cracks || []).map(() => 0), scarH: (st.cracks || []).map(() => 0),
    // nose: 0 big and bumpy, 1 just right, up to ~1.45 too small (a piggy nose)
    nose: st.nose0 ?? 1,
    // dark circles under the left and right eye (1 dark .. 0 gone), and the green
    // cucumber tint a too-long press leaves
    circ: [st.circ0 || 0, st.circ0 || 0], circG: [0, 0],
    // sun spots the laser zaps (z: 0 there .. 1 gone) and the burn marks lingering leaves
    spots: (st.spots || []).map((p) => ({ ...p, z: 0 })), burns: [], bald: [], // laser burns on the skin; bald patches burnt or plucked out of the hair
    stains: [], hairFx: [], smears: [], // what other tools left (world.js): on the clothes, in the hair, on the face
    // teeth: 0 yellow, 1 white, past 1 glowing too bright
    teeth: st.teeth0 ?? 1,
    // wrinkles: how far the iron has run along each (0..1.25) and the red mark of an overdone one
    wrk: (st.wrinkles || []).map((w) => ({ ...w, f: 0, red: 0 })),
    strays: [], // stray hairs painted onto the face by a sloppy brush (head space)
    // extras (extras.js): debris in the hair, worms, the patient's own piercings (each
    // with how far the tweezers have pulled it), and the teeth
    debris: (st.debris || []).map((d) => ({ ...d, pull: 0, gone: false })),
    worms: (st.worms || []).map((w) => ({ ...w, pull: 0, gone: false })),
    own: (st.own || (st.who && st.who.piercings ? OWN_PIERCINGS : [])).map((p) => ({ ...p, pull: 0, gone: false })),
    dent: makeDent(st.dent),
    dye: null, lips: null, blush: null, glitter: null, shadow: null, freckles: null, lashes: null, brows: null, highlight: null, // style tools (style.js): colours in progress
    pierced: [], gems: [], clips: [], shades: null, // ...and piercings, gems and clips added, the sunglasses on
    // hurts (mood.js): marks left where a tool hurt the skin, and per eye: how red it is,
    // how long it stays squeezed shut, how much it is watering
    hurts: [], eyeRed: [0, 0], eyeShut: [0, 0], tears: [0, 0], pain: 0,
    // how they feel, drawn on the face: anger (brows down, red face), crying (both eyes
    // streaming), bored (heavy lids); each eases toward its goal
    anger: 0, angerV: 0, cry: 0, cryV: 0, bored: 0, boredV: 0,
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
// which eye a head-space point is on (0 left, 1 right), or -1; a little wider than the
// eye itself, since a fingertip is not a pin
export function eyeSide(s, x, y) {
  const e = (s.who && s.who.eyeSize) || 1;
  for (const i of [0, 1]) {
    const cx = (i ? 1 : -1) * EYE.x;
    if (((x - cx) / (EYE.rx * e + 8)) ** 2 + ((y - EYE.y) / (EYE.ry * e + 8)) ** 2 <= 1) return i;
  }
  return -1;
}

// springs, blinks, timers. Runs every frame for the live patient.
export function tickPatient(s, dt, time) {
  for (const f of s.hairFx) f.t += dt;
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
  // gel runs down, then soaks in and fades
  for (const d of s.drips) { if (d.len < d.max) d.len = Math.min(d.max, d.len + dt * d.v); d.t = (d.t || 0) + dt; }
  if (s.drips.length && s.drips[0].t > DRIP_LIFE) s.drips = s.drips.filter((d) => d.t <= DRIP_LIFE);
  for (const t of s.strays) t.t += dt;
  if (s.sweat > 0) s.sweat = Math.max(0, s.sweat - dt * 0.7);
  if (s.flush > 0) s.flush = Math.max(0, s.flush - dt * 0.5);
  for (let i = 0; i < 2; i++) {
    if (s.eyeShut[i] > 0) s.eyeShut[i] = Math.max(0, s.eyeShut[i] - dt);
    if (s.tears[i] > 0) s.tears[i] = Math.max(0, s.tears[i] - dt * 0.22);
  }
  for (const h of s.hurts) h.t += dt;
  for (const d of s.dent) if (d.gone && d.grow < 1.6) d.grow += dt * 1.6; // a new tooth grows in
  const kf = 1 - Math.exp(-dt * 4);
  s.angerV += (s.anger - s.angerV) * kf; s.cryV += (s.cry - s.cryV) * kf; s.boredV += (s.bored - s.boredV) * kf;
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
  ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-300, 204, 600, 1240, [96, 96, 30, 30]);
  ctx.setLineDash([2, 16]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(58,39,71,0.3)'; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.roundRect(-286, 214, 70, 300, 35); ctx.fill();
  // headrest post and pad
  ctx.beginPath(); ctx.roundRect(-30, 150, 60, 50, 10); ctx.fillStyle = '#d9d2e6'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-206, -10, 412, 182, 70);
  ctx.fillStyle = g.vinyl; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.roundRect(-190, 6, 60, 120, 30); ctx.fill();
}

// scratch scars; the healing gel runs along them, then the healed part fades away
function drawScars(ctx, s, time) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 0; i < s.cracks.length; i++) {
    const P = s.cracks[i].poly, L = P.len, f = clamp01(s.scarF[i]), heal = clamp01(s.scarH[i]), Lf = L * f;
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
  const w = s.who, e = w.eyeSize || 1, T = toneOf(w.skin), m = paintNow(s, 'lashes'), mas = m && m.a > 0.02 ? m : null;
  const hunter = clamp01((s.browL + s.browR) / 2);
  const sad = clamp01(-s.moodV) * (1 - hunter) * (1 - s.angerV);
  for (const side of [-1, 1]) {
    const cx = side * EYE.x, cy = EYE.y, i = side < 0 ? 0 : 1, red = s.eyeRed[i];
    let kind = s.expr;
    if (kind === 'wink') kind = side > 0 ? 'happy' : 'normal';
    if (s.eyeShut[i] > 0) kind = 'squeeze'; // just hurt: squeezed shut
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'happy') {
      // closed and smiling: the lash line arches up, with a soft crease above it
      ctx.lineWidth = 4.4; ctx.strokeStyle = LASH;
      ctx.beginPath(); ctx.arc(cx, cy + 10, 20 * e, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.lineWidth = 2.2; ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.arc(cx, cy + 8, 27 * e, Math.PI * 1.26, Math.PI * 1.74); ctx.stroke();
      ctx.globalAlpha = 1;
      const ox = cx + side * 18.6 * e, oy = cy + 10 - 7.4 * e;
      ctx.lineWidth = w.lashes ? 3.2 : 2.4; ctx.strokeStyle = LASH;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + side * 7, oy - 5);
      if (w.lashes) { ctx.moveTo(ox - side * 6, oy - 6); ctx.lineTo(ox - side * 3, oy - 13); }
      ctx.stroke();
      continue;
    }
    if (kind === 'squeeze') {
      if (red > 0.02) soft(ctx, cx, cy, 32, 24, '#ff5064', 0.5 * red);
      ctx.lineWidth = 4.4; ctx.strokeStyle = LASH;
      ctx.beginPath();
      ctx.moveTo(cx + side * 14, cy - 11); ctx.lineTo(cx - side * 12, cy); ctx.lineTo(cx + side * 14, cy + 11);
      ctx.stroke();
      // crinkles at the outer corner
      ctx.globalAlpha = 0.55; ctx.lineWidth = 2.2; ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(cx + side * 23, cy - 7); ctx.lineTo(cx + side * 31, cy - 12); ctx.moveTo(cx + side * 24, cy + 6); ctx.lineTo(cx + side * 32, cy + 10); ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    const wide = kind === 'wide';
    const rx = EYE.rx * e * (wide ? 1.1 : 1), ry = EYE.ry * e * (wide ? 1.25 : 1);
    ctx.save(); ctx.translate(cx, cy);
    const eye = new Path2D(); eye.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = red > 0.02 ? mix('#ffffff', '#ffb0bb', red) : '#fbf7fa'; ctx.fill(eye);
    ctx.save(); ctx.clip(eye);
    // the corners of the eyeball sit in a little shadow
    soft(ctx, -rx, 0, rx * 0.5, ry, w.skin.deep, 0.22); soft(ctx, rx, 0, rx * 0.5, ry, w.skin.deep, 0.22);
    if (red > 0.02) { // bloodshot: little red veins from the corners
      ctx.globalAlpha = red; ctx.strokeStyle = '#e8384f'; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const k of [-1, 1]) {
        ctx.moveTo(k * rx, -3); ctx.lineTo(k * rx * 0.62, -6); ctx.lineTo(k * rx * 0.45, -2);
        ctx.moveTo(k * rx, 5); ctx.lineTo(k * rx * 0.66, 8); ctx.lineTo(k * rx * 0.5, 12);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // the iris: lighter low down, a dark rim, fine fibres, the pupil and two catchlights
    const lx = s.look.x * 9, ly = s.look.y * 6 + 2, ir = (wide ? 10 : 13) * e;
    const ig = ctx.createRadialGradient(lx - ir * 0.1, ly + ir * 0.4, 0, lx, ly, ir);
    ig.addColorStop(0, mixHex(w.eye.c, '#ffffff', 0.4)); ig.addColorStop(0.55, w.eye.c); ig.addColorStop(1, w.eye.d);
    ell(ctx, lx, ly, ir, ir); ctx.fillStyle = ig; ctx.fill();
    ctx.globalAlpha = 0.4; ctx.lineWidth = 1.1; ctx.strokeStyle = mixHex(w.eye.c, '#ffffff', 0.55);
    ctx.beginPath();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.2; ctx.moveTo(lx + Math.cos(a) * ir * 0.56, ly + Math.sin(a) * ir * 0.56); ctx.lineTo(lx + Math.cos(a) * ir * 0.86, ly + Math.sin(a) * ir * 0.86); }
    ctx.stroke(); ctx.globalAlpha = 1;
    ell(ctx, lx, ly, ir, ir); ctx.lineWidth = 1.8; ctx.strokeStyle = w.eye.d; ctx.stroke();
    ell(ctx, lx, ly, ir * 0.46, ir * 0.46); ctx.fillStyle = '#1b1218'; ctx.fill();
    ell(ctx, lx - ir * 0.36, ly - ir * 0.4, ir * 0.3, ir * 0.3); ctx.fillStyle = '#fff'; ctx.fill();
    ell(ctx, lx + ir * 0.34, ly + ir * 0.3, ir * 0.13, ir * 0.13); ctx.fill();
    // the lid's shadow across the top of the eyeball
    const sh = ctx.createLinearGradient(0, -ry, 0, -ry * 0.05);
    sh.addColorStop(0, rgba(w.skin.deep, 0.5)); sh.addColorStop(1, rgba(w.skin.deep, 0));
    ctx.fillStyle = sh; ctx.fillRect(-rx, -ry, rx * 2, ry);
    // upper lid: droops when sad, settles low and tilted up at the outer corner with hunter eyes
    let dIn = 0.05, dOut = 0.05;
    dIn = lerp(dIn, 0.12, sad); dOut = lerp(dOut, 0.36, sad);
    dIn = lerp(dIn, 0.22, hunter); dOut = lerp(dOut, 0.12, hunter);
    if (w.lids) { dIn += w.lids * 0.8; dOut += w.lids; } // sleepy, heavy lids
    dIn = lerp(dIn, 0.4, s.angerV); // angry: lids slant down to the nose
    dIn += 0.34 * s.boredV; dOut += 0.34 * s.boredV; // bored: half shut
    if (wide) { dIn = 0; dOut = 0; }
    dIn = lerp(dIn, 1.05, s.blink); dOut = lerp(dOut, 1.05, s.blink);
    const xi = -side * rx * 1.08, xo = side * rx * 1.08;
    const yi = -ry + dIn * 2 * ry, yo = -ry + dOut * 2 * ry;
    ctx.beginPath();
    ctx.moveTo(xi, -ry - 6); ctx.lineTo(xi, yi); ctx.quadraticCurveTo(0, (yi + yo) / 2 - 4, xo, yo); ctx.lineTo(xo, -ry - 6);
    ctx.closePath(); ctx.fillStyle = T.lid; ctx.fill();
    ctx.restore();
    // a fine rim and a soft lower lid instead of a heavy ring
    ctx.lineWidth = 1.6; ctx.strokeStyle = T.line; ctx.globalAlpha = 0.6; ctx.stroke(eye);
    ctx.globalAlpha = 0.45; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, 2, rx * 1.03, ry * 1.06, 0, Math.PI * 0.16, Math.PI * 0.84); ctx.stroke();
    ctx.globalAlpha = 1;
    if (red > 0.02) { // sore, puffy lower lid
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,80,100,${0.55 * red})`;
      ctx.beginPath(); ctx.arc(0, -ry * 0.2, rx * 1.08, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
    // the crease of the lid above
    ctx.globalAlpha = 0.42 * (1 - s.blink); ctx.lineWidth = 2.2; ctx.strokeStyle = T.line;
    ctx.beginPath(); ctx.moveTo(xi * 0.86, Math.min(yi, -ry * 0.6) - 9); ctx.quadraticCurveTo(0, Math.min(yi, yo) - ry * 0.55 - 8, xo * 0.96, Math.min(yo, -ry * 0.6) - 8); ctx.stroke();
    ctx.globalAlpha = 1;
    // the lash line along the upper lid; eyeliner makes it bolder with a wing
    const liner = w.liner && s.blink < 0.5;
    ctx.strokeStyle = LASH; ctx.lineWidth = liner ? 5.6 : 3.8;
    ctx.beginPath(); ctx.moveTo(xi * 0.96, yi + 1); ctx.quadraticCurveTo(0, (yi + yo) / 2 - 4, xo, yo);
    ctx.lineTo(xo + side * (liner ? 16 : 7), yo - (liner ? 12 : 6));
    ctx.stroke();
    if (w.bags) {
      ctx.globalAlpha = 0.4; ctx.lineWidth = 2.6; ctx.strokeStyle = '#7a5a9a';
      ctx.beginPath(); ctx.arc(0, ry * 0.15, rx * 1.02, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (mas && s.blink < 0.5) { // mascara: a fan of lashes along the lid in its colour
      ctx.globalAlpha = mas.a; ctx.lineWidth = 2.8; ctx.strokeStyle = mas.c;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const t = 0.15 + k * 0.15, u = 1 - t, x = u * u * xi * 0.96 + 2 * u * t * 0 + t * t * xo, y = u * u * (yi + 1) + 2 * u * t * ((yi + yo) / 2 - 4) + t * t * yo;
        const len = 7 + 7 * t, lean = side * (2 + 7 * t);
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.3, y - len * 0.7, x + lean, y - len);
      }
      ctx.stroke();
      ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(xi * 0.96, yi + 1); ctx.quadraticCurveTo(0, (yi + yo) / 2 - 4, xo, yo); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (w.lashes && s.blink < 0.5) { // three lashes at the outer corner
      ctx.lineWidth = 2.6; ctx.strokeStyle = LASH;
      ctx.beginPath();
      ctx.moveTo(xo - side * 3, yo - 1); ctx.quadraticCurveTo(xo + side * 4, yo - 6, xo + side * 7, yo - 13);
      ctx.moveTo(xo - side * 11, yo - 4); ctx.quadraticCurveTo(xo - side * 6, yo - 10, xo - side * 4, yo - 16);
      ctx.moveTo(xo - side * 19, yo - 6); ctx.quadraticCurveTo(xo - side * 16, yo - 11, xo - side * 15, yo - 16);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// a brow as a tapered shape along a curve: full at the inner end, fine at the tail
function browPath(ctx, x0, y0, cx, cy, x1, y1, wd) {
  const N = 14, top = [], bot = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy), L = Math.hypot(dx, dy) || 1;
    const h = (wd / 2) * (t < 0.22 ? 0.78 + t : 1 - 0.74 * Math.pow((t - 0.22) / 0.78, 1.4));
    top.push([x - (dy / L) * h, y + (dx / L) * h]); bot.push([x + (dy / L) * h, y - (dx / L) * h]);
  }
  ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
  for (const q of top) ctx.lineTo(q[0], q[1]);
  for (let k = N; k >= 0; k--) ctx.lineTo(bot[k][0], bot[k][1]);
  ctx.closePath();
}

function drawBrows(ctx, s) {
  const tint = paintNow(s, 'brows'), col = tint ? tint.c : s.who.brow, kind = s.who.brows || 'normal';
  const wk = { thin: 0.62, thick: 1.45, bushy: 1.6 }[kind] || 1, angry = kind === 'angry';
  ctx.lineCap = 'round'; ctx.strokeStyle = col;
  for (const side of [-1, 1]) {
    const b = clamp01(side < 0 ? s.browL : s.browR), mad = s.angerV;
    const sad = clamp01(-s.moodV) * (1 - b) * (1 - mad);
    const yIn = lerp(lerp(-36, -44, sad), -26, b) + (angry ? 4 + 8 * b : 0) + 14 * mad, yOut = lerp(-32, -31, b) - (angry ? 5 : 0) - 8 * mad;
    const xIn = side * 28, xOut = side * 98;
    ctx.globalAlpha = lerp(0.35, 1, b);
    const wd = lerp(5, 14.5, b) * wk + s.uni * 5, ccx = side * 64, ccy = Math.min(yIn, yOut) - lerp(9, 5, b);
    browPath(ctx, xIn, yIn, ccx, ccy, xOut, yOut, wd);
    ctx.fillStyle = col; ctx.fill();
    // fine hairs slanting out along it
    ctx.globalAlpha *= 0.55; ctx.lineWidth = 1.3; ctx.strokeStyle = mixHex(col, '#ffffff', 0.32);
    ctx.beginPath();
    for (let k = 1; k < 8; k++) {
      const t = k / 8.5, u = 1 - t, x = u * u * xIn + 2 * u * t * ccx + t * t * xOut, y = u * u * yIn + 2 * u * t * ccy + t * t * yOut;
      ctx.moveTo(x - side * 3, y + wd * 0.22); ctx.lineTo(x + side * 4, y - wd * 0.28);
    }
    ctx.stroke();
    ctx.strokeStyle = col;
    if (kind === 'bushy' && b > 0.3) { // wispy ends sticking up
      ctx.globalAlpha = 1; ctx.lineWidth = 3;
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

const GRIN = new Path2D('M -38 110 Q 0 122 38 110 Q 32 146 0 148 Q -32 146 -38 110 Z');
function drawMouth(ctx, s, time) {
  const m = s.moodV, y = 120, T = toneOf(s.who.skin), lips = s.lips && !(s.lips.id === 'natural' && s.lips.t >= 1) ? paintNow(s, 'lips') : null, paint = lips ? lips.c : s.who.lip, lip = paint || s.who.skin.lip;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = T.mouth; ctx.lineWidth = 3.6;
  const kind = s.mouth;
  if (s.talk > 0.06 && kind !== 'grit' && kind !== 'aah') { // speaking: the mouth opens with each syllable
    const o = s.talk, h = 3 + 19 * o, w = 22 + 7 * o + 4 * Math.max(0, m);
    const p = new Path2D(); p.ellipse(0, y + 4 + h * 0.35, w, h, 0, 0, TAU);
    ctx.fillStyle = '#7a2535'; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-w, y + 4 + h * 0.35 - h, w * 2, Math.min(7, h * 0.45)); // top teeth
    ell(ctx, 0, y + 4 + h * 1.15, w * 0.6, h * 0.5); ctx.fillStyle = '#ff8fa8'; ctx.fill(); // tongue
    ctx.restore();
    soft(ctx, 0, y + 6 + h * 1.3, w * 0.8, 6, lip, paint ? 0.7 : 0.45); // the lower lip
    ctx.strokeStyle = T.mouth; ctx.lineWidth = 3.4; ctx.stroke(p);
    return;
  }
  if (kind === 'grit') { // clenched teeth
    const t = s.teeth, p = new Path2D(); p.roundRect(-33, 107, 66, 24, 10);
    ctx.fillStyle = t >= 1 ? '#ffffff' : mix('#e2b948', '#ffffff', smooth(clamp01(t))); ctx.fill(p);
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(58,39,71,0.6)';
    ctx.beginPath(); ctx.moveTo(-31, 119); ctx.lineTo(31, 119);
    for (const x of [-17, -6, 6, 17]) { ctx.moveTo(x, 109); ctx.lineTo(x, 129); }
    ctx.stroke();
    ctx.lineWidth = 3.4; ctx.strokeStyle = T.mouth; ctx.stroke(p);
    return;
  }
  if (kind === 'aah') { // wide open for the dentist: both rows of teeth and the tongue
    const t = s.teeth, over = clamp01((t - 1) / 0.4);
    const base = t >= 1 ? mix('#ffffff', '#d8f3ff', over) : mix('#e2b948', '#ffffff', smooth(clamp01(t)));
    ctx.fillStyle = '#7a2535'; ctx.fill(AAH);
    ctx.save(); ctx.clip(AAH);
    ell(ctx, 0, 112, 60, 14); ctx.fillStyle = '#e86a83'; ctx.fill(); // gums
    ell(ctx, 0, 176, 60, 26); ctx.fill();
    ell(ctx, 0, 160, 28, 14); ctx.fillStyle = '#ff8fa8'; ctx.fill(); // tongue
    ctx.strokeStyle = 'rgba(122,37,53,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(0, 162); ctx.stroke();
    drawTeeth(ctx, s, base, time);
    ctx.restore();
    soft(ctx, 0, 180, 30, 7, lip, paint ? 0.7 : 0.45); // the lower lip
    ctx.strokeStyle = T.mouth; ctx.lineWidth = 3.4; ctx.stroke(AAH);
    return;
  }
  if (kind === 'sob') { // a wobbling, wailing open frown
    const wob = Math.sin((time || 0) * 15) * 2.5;
    const p = new Path2D(`M -32 ${134 + wob} Q 0 ${96 - wob} 32 ${134 + wob} Q 0 ${142 + wob} -32 ${134 + wob} Z`);
    ctx.fillStyle = '#7a2535'; ctx.fill(p);
    ctx.save(); ctx.clip(p); ell(ctx, 0, 140 + wob, 16, 9); ctx.fillStyle = '#ff8fa8'; ctx.fill(); ctx.restore();
    ctx.stroke(p);
    return;
  }
  if (kind === 'grin') {
    const p = GRIN, t = s.teeth, over = clamp01((t - 1) / 0.4);
    ctx.fillStyle = '#7a2535'; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    // teeth: yellow and stained before whitening, white after, glowing ice-blue if overdone
    ctx.fillStyle = t >= 1 ? mix('#ffffff', '#d8f3ff', over) : mix('#e2b948', '#ffffff', smooth(clamp01(t)));
    ctx.beginPath(); ctx.moveTo(-40, 104); ctx.lineTo(40, 104); ctx.lineTo(40, 122); ctx.quadraticCurveTo(0, 132, -40, 122); ctx.closePath(); ctx.fill();
    if (t < 0.6) {
      ctx.fillStyle = `rgba(150,100,40,${0.55 * (1 - t / 0.6)})`;
      ell(ctx, -15, 121, 4, 3); ctx.fill(); ell(ctx, 17, 119, 3.5, 2.5); ctx.fill(); ell(ctx, 2, 124, 3, 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(58,39,71,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); for (const x of [-22, -8, 8, 22]) { ctx.moveTo(x, 104); ctx.lineTo(x, 125 - Math.abs(x) * 0.15); } ctx.stroke();
    ell(ctx, 0, 146, 18, 10); ctx.fillStyle = '#ff8fa8'; ctx.fill();
    ctx.restore();
    soft(ctx, 0, 152, 24, 7, lip, paint ? 0.7 : 0.45); // the lower lip
    ctx.strokeStyle = T.mouth; ctx.lineWidth = 3.4; ctx.stroke(p);
    if (over > 0.02) { // dazzling: a blue halo and twinkles
      ctx.save();
      ctx.globalAlpha = 0.45 * over; ell(ctx, 0, 116, 56 + 20 * over, 26 + 10 * over); ctx.fillStyle = '#bfe9ff'; ctx.fill();
      ctx.globalAlpha = over;
      for (const [x, y, r] of [[-30, 100, 11], [32, 102, 9], [4, 92, 7]]) { star4(ctx, x, y, r * (0.6 + 0.4 * over)); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.restore();
    }
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
  // lips: a full lower lip under the line and a thin upper lip with a cupid's bow over it
  const lw2 = paint ? 21 : 18;
  ctx.save();
  ctx.globalAlpha = paint ? 0.95 : 0.72; ctx.fillStyle = lip;
  const lp = new Path2D(); lp.ellipse(0, mid + 8, lw2, paint ? 8.5 : 6.5, 0, 0, TAU); ctx.fill(lp);
  ctx.globalAlpha = paint ? 0.9 : 0.5; ctx.fillStyle = paint ? lip : T.lipDeep;
  ctx.fill(new Path2D(`M ${-lw2 + 3} ${mid} Q -8 ${mid - 9} 0 ${mid - 5} Q 8 ${mid - 9} ${lw2 - 3} ${mid} Q 0 ${mid + 2} ${-lw2 + 3} ${mid} Z`));
  ctx.globalAlpha = paint ? 0.7 : 0.4; ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(`M -12 ${mid + 6} Q -6 ${mid + 3.5} 0 ${mid + 5.5} Q -6 ${mid + 8} -12 ${mid + 6} Z`)); // gloss
  ctx.restore();
  ctx.stroke();
}

// ---------- the little things that make each patient who they are ----------
// k: 0 big and bumpy (before a nose job), 1 the patient's own, past 1 shrunk too far
function drawNose(ctx, kind, k = 1, sk = null) {
  const big = smooth(clamp01(1 - k)), tiny = clamp01((k - 1) / 0.3);
  const sz = 1 + 0.5 * big - 0.42 * tiny, T = sk ? toneOf(sk) : null;
  // the big nose stays solid while it shrinks and only hands over to the patient's own
  // nose at the very end, so the two are never seen on top of each other
  const solid = sk ? clamp01(big / 0.15) : 0, own = 1 - solid;
  ctx.save();
  if (sz !== 1) { ctx.translate(0, 40); ctx.scale(sz, sz); ctx.translate(0, -40); }
  if (sk) { // shading: the shadow side of the bridge, the shadow under the tip, a lit tip
    soft(ctx, 10, 44, 9, 28, sk.deep, 0.3);
    soft(ctx, 2, 82, 22, 7, sk.deep, 0.32);
    soft(ctx, -3, 64, 10, 8, '#ffffff', 0.26);
  }
  if (own > 0.01) drawOwnNose(ctx, kind, T, own);
  if (solid > 0.01) drawBigNose(ctx, sk, big, solid);
  if (tiny > 0.02) { // upturned piggy nostrils
    ctx.globalAlpha = tiny; ctx.fillStyle = '#5a2a35';
    ell(ctx, -8, 74, 4.5, 6); ctx.fill(); ell(ctx, 8, 74, 4.5, 6); ctx.fill();
  }
  ctx.restore();
}
// the patient's own nose, drawn as lines (a: opacity)
function drawOwnNose(ctx, kind, T, a) {
  ctx.lineWidth = 3; ctx.strokeStyle = T ? T.line : INK; ctx.globalAlpha = 0.85 * a;
  ctx.beginPath();
  if (kind === 'button') {
    ctx.moveTo(-12, 64); ctx.quadraticCurveTo(-17, 79, -6, 80); ctx.moveTo(12, 64); ctx.quadraticCurveTo(17, 79, 6, 80); ctx.stroke();
    nostrils(ctx, T, 6, 77, 3.4, a);
  } else if (kind === 'wide') {
    ctx.moveTo(-6, 30); ctx.bezierCurveTo(-8, 44, -12, 54, -20, 62); ctx.quadraticCurveTo(-34, 77, -17, 81);
    ctx.moveTo(20, 62); ctx.quadraticCurveTo(34, 77, 17, 81);
    ctx.stroke();
    nostrils(ctx, T, 10, 81, 4, a);
  } else {
    const t = kind === 'long' ? -14 : 0;
    const d = t ? 6 : 0;
    ctx.moveTo(-6, 34 + t * 0.5); ctx.bezierCurveTo(-9, 46 + t * 0.4, -20, 58, -16, 72 + d); ctx.quadraticCurveTo(-12, 79 + d, -5, 80 + d); ctx.stroke();
    ctx.globalAlpha = 0.6 * a; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(16, 69 + d); ctx.quadraticCurveTo(23, 76 + d, 13, 81 + d); ctx.stroke();
    nostrils(ctx, T, 7, 79 + d, 3.4, a);
  }
}
// two small nostrils either side of x = 0
function nostrils(ctx, T, dx, y, r, a = 1) {
  ctx.save(); ctx.globalAlpha = 0.6 * a; ctx.fillStyle = T ? T.ink : INK;
  for (const side of [-1, 1]) { ell(ctx, side * dx, y, r, r * 0.6, side * 0.35); ctx.fill(); }
  ctx.restore();
}
// the big, bumpy, red-tipped nose a patient comes in with for a nose job; it fades into
// their own nose as the job goes on (big: how far from done, solid: its opacity)
function drawBigNose(ctx, sk, big, solid) {
  ctx.save();
  ctx.globalAlpha = solid;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = toneOf(sk).ink;
  // bridge, with a bump on it
  const bridge = new Path2D('M -6 18 C -8 25 -19 30 -17 39 C -15 45 -17 50 -16 54 L 16 54 C 15 44 11 30 6 18 Z');
  ctx.fillStyle = sk.base; ctx.fill(bridge);
  ctx.beginPath(); ctx.moveTo(-6, 18); ctx.bezierCurveTo(-8, 25, -19, 30, -17, 39); ctx.bezierCurveTo(-15, 45, -17, 50, -16, 54);
  ctx.moveTo(6, 18); ctx.bezierCurveTo(11, 30, 15, 44, 16, 54); ctx.stroke();
  // nostril wings, then the round tip over them
  for (const side of [-1, 1]) { ell(ctx, side * 25, 74, 13, 11); ctx.fillStyle = sk.shade; ctx.fill(); ctx.stroke(); }
  ell(ctx, 1, 64, 27, 23); ctx.fillStyle = sk.base; ctx.fill(); ctx.stroke();
  ell(ctx, 3, 68, 18, 13); ctx.fillStyle = `rgba(255,100,115,${(0.32 * big).toFixed(3)})`; ctx.fill(); // the red tip calms down
  ell(ctx, -8, 56, 7, 5, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  ctx.fillStyle = '#5a2a35';
  for (const side of [-1, 1]) { ell(ctx, side * 11, 84, 5, 3.5, side * 0.3); ctx.fill(); }
  ctx.restore();
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
    ctx.lineWidth = kind === 'round' ? 4 : 5.5; ctx.strokeStyle = INK; ctx.stroke(p);
    ctx.beginPath(); ctx.moveTo(side * (EYE.x + R - 2), y - 4); ctx.lineTo(side * (EYE.x + R + 14), y - 9); ctx.stroke();
    ctx.globalAlpha = 0.75; ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x - R * 0.55, y - R * 0.1); ctx.lineTo(x - R * 0.2, y - R * 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = kind === 'round' ? 4 : 5.5; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(-(EYE.x - R), y - 2); ctx.quadraticCurveTo(0, y - 14, EYE.x - R, y - 2); ctx.stroke();
}
function drawMustache(ctx, w) {
  const p = new Path2D('M 0 96 C -18 86 -46 88 -60 108 C -46 104 -30 112 -16 110 C -8 109 -2 106 0 104 C 2 106 8 109 16 110 C 30 112 46 104 60 108 C 46 88 18 86 0 96 Z');
  ctx.fillStyle = w.hair; ctx.fill(p); ctx.lineWidth = 2.8; ctx.strokeStyle = mixHex(w.hair, '#2a1626', 0.55); ctx.lineJoin = 'round'; ctx.stroke(p);
  // combed hairs
  ctx.lineWidth = 1.6; ctx.strokeStyle = w.hairHi; ctx.globalAlpha = 0.8;
  ctx.beginPath();
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) { const x = side * (10 + k * 9); ctx.moveTo(x, 97 + k * 0.6); ctx.quadraticCurveTo(x + side * 6, 100 + k, x + side * 8, 106 + k); }
  ctx.stroke(); ctx.globalAlpha = 1;
}
function drawWrinkles(ctx, T) {
  ctx.globalAlpha = 0.55; ctx.strokeStyle = T.line; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
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

// dark circles under the eyes (purple) and the green tint of a cucumber left on too long
function drawCircles(ctx, s) {
  const e = s.who.eyeSize || 1;
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const d = s.circ[i], gr = s.circG[i];
    if (d < 0.01 && gr < 0.01) continue;
    ctx.beginPath(); ctx.ellipse((i ? 1 : -1) * EYE.x, EYE.y + 4, EYE.rx * e * 1.14, EYE.ry * e * 1.28, 0, Math.PI * 0.1, Math.PI * 0.9);
    if (d > 0.01) {
      ctx.lineWidth = 16; ctx.strokeStyle = `rgba(96,58,122,${0.5 * d})`; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = `rgba(70,36,92,${0.4 * d})`; ctx.stroke();
    }
    if (gr > 0.01) { ctx.lineWidth = 17; ctx.strokeStyle = `rgba(110,205,80,${0.6 * gr})`; ctx.stroke(); }
  }
  ctx.restore();
}
// sun spots, and pink marks where the laser lingered
function drawSpots(ctx, s) {
  if (!s.spots.length && !s.burns.length) return;
  // a soft ink rim keeps them readable on every skin tone
  const col = mix(s.who.skin.deep, '#2a160c', 0.5);
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
  for (const p of s.spots) {
    const a = 1 - p.z, k = 0.55 + 0.45 * a;
    if (a <= 0.01) continue;
    const blob = new Path2D();
    blob.ellipse(p.x, p.y, p.r * k, p.r * 0.82 * k, p.rot, 0, TAU);
    if (p.r > 9) {
      const x = p.x + p.r * 0.72 * k, y = p.y + p.r * 0.5 * k, rx = p.r * 0.4 * k;
      blob.moveTo(x + rx, y); blob.ellipse(x, y, rx, p.r * 0.34 * k, 0, 0, TAU);
    }
    ctx.globalAlpha = 0.9 * a; ctx.fillStyle = col; ctx.fill(blob);
    ctx.globalAlpha = 0.4 * a; ctx.stroke(blob);
  }
  ctx.globalAlpha = 1;
  for (const b of s.burns) {
    const k = easeOutBack(clamp01(b.t / 0.25));
    ell(ctx, b.x, b.y, 12 * k, 9 * k); ctx.fillStyle = 'rgba(255,70,100,0.42)'; ctx.fill();
    ell(ctx, b.x, b.y, 5 * k, 4 * k); ctx.fillStyle = 'rgba(255,70,100,0.5)'; ctx.fill();
  }
}
// wrinkle lines still to iron (the ironed stretch is gone), and pink where it stayed too long
function drawWrinkleLines(ctx, s) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const w of s.wrk) {
    const P = w.poly, L = P.len, a = L * Math.min(1, w.f);
    if (w.red > 0.01) {
      const e = w.pts[w.pts.length - 1];
      ell(ctx, e[0], e[1], 24, 16); ctx.fillStyle = `rgba(255,90,110,${0.38 * w.red})`; ctx.fill();
    }
    if (L - a < 1) continue;
    ctx.globalAlpha = 0.55; ctx.strokeStyle = INK; ctx.lineWidth = 4.5;
    ctx.beginPath(); P.trace(ctx, a, L); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.save(); ctx.translate(0, 4); ctx.beginPath(); P.trace(ctx, a, L); ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// where a tool hurt the skin: a burn, a bruise or a rash (mood.js HURT_KIND)
function drawHurts(ctx, s) {
  for (const h of s.hurts) {
    const k = easeOutBack(clamp01(h.t / 0.3));
    if (k <= 0) continue;
    if (h.kind === 'burn') {
      ell(ctx, h.x, h.y, 17 * k, 13 * k); ctx.fillStyle = 'rgba(255,70,90,0.45)'; ctx.fill();
      ell(ctx, h.x, h.y, 9 * k, 7 * k); ctx.fillStyle = 'rgba(120,30,40,0.5)'; ctx.fill();
      ell(ctx, h.x - 3 * k, h.y - 3 * k, 3 * k, 2 * k); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    } else if (h.kind === 'bruise') {
      ell(ctx, h.x, h.y, 17 * k, 14 * k); ctx.fillStyle = 'rgba(170,90,205,0.55)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,130,170,0.6)'; ctx.stroke();
      ell(ctx, h.x + 2, h.y + 1, 9 * k, 7 * k); ctx.fillStyle = 'rgba(120,45,140,0.5)'; ctx.fill();
    } else { // rash: a few angry red dots
      ell(ctx, h.x, h.y, 17 * k, 13 * k); ctx.fillStyle = 'rgba(255,90,110,0.3)'; ctx.fill();
      ctx.fillStyle = 'rgba(230,50,70,0.6)';
      for (const [dx, dy, r] of [[-6, -4, 3.5], [5, -6, 3], [7, 5, 3.5], [-4, 6, 3], [1, 0, 2.5]]) { ell(ctx, h.x + dx * k, h.y + dy * k, r * k, r * k); ctx.fill(); }
    }
  }
}
// tears: a stream down from each watering eye, with drops running down it
function drawTears(ctx, s, time) {
  for (let i = 0; i < 2; i++) {
    const a = Math.max(s.cryV, s.tears[i]);
    if (a < 0.03) continue;
    const side = i ? 1 : -1, x0 = side * (EYE.x + 10), y0 = EYE.y + 16, len = 40 + 90 * a;
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + side * 12, y0 + len * 0.5, x0 + side * 6, y0 + len);
    ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(58,39,71,0.35)'; ctx.stroke();
    ctx.lineWidth = 9; ctx.strokeStyle = '#9fe2ff'; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#e8fbff'; ctx.stroke();
    const k = (time * 1.3 + i * 0.5) % 1, dy = y0 + len + 34 * k;
    ctx.globalAlpha *= 1 - k;
    ctx.beginPath(); ctx.moveTo(x0 + side * 6, dy - 12); ctx.quadraticCurveTo(x0 + side * 6 + 8, dy, x0 + side * 6, dy + 6); ctx.quadraticCurveTo(x0 + side * 6 - 8, dy, x0 + side * 6, dy - 12);
    ctx.fillStyle = '#9fe2ff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
}
// the cartoon anger mark: four red curves throbbing on the forehead
function drawVein(ctx, s, time) {
  const k = 0.9 + 0.12 * Math.sin(time * 12), a = clamp01((s.angerV - 0.45) * 3);
  ctx.save(); ctx.translate(-92, -128); ctx.rotate(-0.2); ctx.scale(k, k); ctx.globalAlpha = a;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(sx * 5, sy * 17); ctx.quadraticCurveTo(sx * 5, sy * 5, sx * 17, sy * 5);
  }
  ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 5.5; ctx.strokeStyle = '#ff4d6d'; ctx.stroke();
  ctx.restore();
}

function drawHead(ctx, s, time, dirtImg) {
  const w = s.who, sk = w.skin;
  const j = s.jaw, chin = jawSegs(j)[3][5];
  const hp = headPath(j);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const T = toneOf(sk);
  // ears: shaded in their bowl, warm in the middle, with the fold of the rim
  for (const side of [-1, 1]) {
    ell(ctx, side * 150, 36, 20, 32); ctx.fillStyle = sk.base; ctx.fill();
    ctx.save(); ctx.clip();
    soft(ctx, side * 160, 44, 16, 30, sk.deep, 0.55);
    soft(ctx, side * 147, 30, 9, 15, T.warm, 0.5);
    ctx.restore();
    ell(ctx, side * 150, 36, 20, 32); ctx.lineWidth = OL; ctx.strokeStyle = T.ink; ctx.stroke();
    ctx.lineWidth = 2.6; ctx.strokeStyle = T.line; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(side * 152, 38, 11, side > 0 ? -1.3 : Math.PI - 1.8, side > 0 ? 1.8 : Math.PI + 1.3); ctx.stroke();
    ctx.globalAlpha = 1;
    if (w.earring) drawEarring(ctx, w.earring, side);
  }
  // face: lit from the upper left, deepening toward the edges
  ctx.fillStyle = sk.shade; ctx.fill(hp);
  ctx.save(); ctx.clip(hp);
  const lit = ctx.createRadialGradient(-40, -70, 10, -20, -30, 250);
  lit.addColorStop(0, T.light); lit.addColorStop(0.55, sk.base); lit.addColorStop(1, mixHex(sk.base, sk.shade, 0.6));
  ctx.save(); ctx.translate(-13, -11); ctx.fillStyle = lit; ctx.fill(hp); ctx.restore();
  // soft modelling: temples, eye sockets, under the cheekbones; light on the forehead and chin
  for (const side of [-1, 1]) {
    soft(ctx, side * 142, -40, 30, 92, sk.deep, side > 0 ? 0.3 : 0.2);
    soft(ctx, side * 56, -6, 46, 20, sk.deep, 0.16);
    soft(ctx, side * 124, 78, 26, 40, sk.deep, 0.11, side * 0.3);
  }
  soft(ctx, -46, -118, 80, 42, '#ffffff', 0.2, -0.3);
  soft(ctx, -88, 46, 26, 15, '#ffffff', 0.1);
  soft(ctx, 0, 158, 26, 9, sk.deep, 0.26);
  soft(ctx, 0, chin - 22, 26, 10, '#ffffff', 0.12);
  { // the jawline turns away from the light: shade along the edge, fading in toward the chin;
    // a sculpted jaw gets a deeper contour
    const g = ctx.createLinearGradient(0, 20, 0, 160);
    g.addColorStop(0, rgba(sk.deep, 0)); g.addColorStop(1, rgba(sk.deep, 0.05 + 0.08 * clamp01(j)));
    ctx.strokeStyle = g;
    for (const lw of [48, 30, 16]) { ctx.lineWidth = lw; ctx.stroke(hp); }
  }
  if (w.freckles) {
    ctx.fillStyle = sk.freckle; ctx.globalAlpha = 0.65;
    for (const [fx, fy] of FRECKLES) for (const side of [-1, 1]) { ell(ctx, fx * side, fy, 2.6, 2.4); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  drawSpots(ctx, s);
  drawHurts(ctx, s);
  if (s.angerV > 0.02) { // seeing red: the face flushes from the forehead down
    const g = ctx.createLinearGradient(0, -210, 0, 150);
    g.addColorStop(0, `rgba(255,60,70,${0.5 * s.angerV})`); g.addColorStop(1, `rgba(255,60,70,${0.1 * s.angerV})`);
    ctx.fillStyle = g; ctx.fill(hp);
  }
  ctx.restore();
  ctx.lineWidth = OL; ctx.strokeStyle = T.ink; ctx.stroke(hp);
  if (j > 0.6 && s.nick < 0.05) {
    ctx.strokeStyle = T.line; ctx.globalAlpha = 0.5 * clamp01((j - 0.6) * 3); ctx.lineWidth = 2.6;
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
  // a patient here for the iron has their wrinkles drawn as lines to iron instead
  if (s.wrk.length) drawWrinkleLines(ctx, s); else if (w.wrinkles) drawWrinkles(ctx, T);
  drawPimples(ctx, s, time);
  drawScars(ctx, s, time);
  drawCircles(ctx, s);
  drawShadow(ctx, s);
  drawEyes(ctx, s);
  drawTears(ctx, s, time);
  drawBrows(ctx, s);
  if (s.angerV > 0.45) drawVein(ctx, s, time);
  drawNose(ctx, w.nose, s.nose, sk);
  if (w.glasses && !s.shades) drawGlasses(ctx, w.glasses, w.eyeSize || 1);
  drawOwn(ctx, s);
  if (s.worms.length) drawWorms(ctx, s, time);
  if (w.mole && !w.mustache) { ell(ctx, w.mole * 48, 104, 4.5, 4.5); ctx.fillStyle = '#4a2a24'; ctx.fill(); }
  drawMouth(ctx, s, time);
  if (w.mustache) drawMustache(ctx, w);
  const blush = (w.blush || 0.16) + clamp01(s.moodV) * 0.4 + s.flush * 0.45;
  for (const side of [-1, 1]) soft(ctx, side * 96, 68, w.cheeks ? 38 : 32, w.cheeks ? 22 : 18, '#ff6b81', Math.min(0.85, blush * 1.35));
  const bl = paintNow(s, 'blush');
  if (bl && bl.a > 0.01) for (const side of [-1, 1]) { soft(ctx, side * 96, 70, 46, 28, bl.c, 0.8 * bl.a); soft(ctx, side * 92, 62, 18, 10, bl.hi, 0.5 * bl.a); }
  if (w.cheeks) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; for (const side of [-1, 1]) { ell(ctx, side * 90 - 6, 56, 9, 5, -0.3); ctx.fill(); } }
  drawMakeup(ctx, s, time);
  if (s.smears.length) drawSmears(ctx, s);
  drawShades(ctx, s.shades, EYE.x, EYE.y, w.eyeSize || 1);
  ctx.save(); clipBald(ctx, s); drawHair(ctx, s); ctx.restore();
  if (s.bald.length) drawBald(ctx, s);
  if (s.hairFx.length) drawHairFx(ctx, s, time);
  drawPierced(ctx, s);
  drawGems(ctx, s);
  drawClips(ctx, s);
  if (s.debris.length) drawDebris(ctx, s, time);
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
  // gel drips from overfilled scars: one soft teardrop each (a thin run into a round
  // bead), fading as it soaks in
  for (const d of s.drips) {
    const a = Math.min(1, (DRIP_LIFE - d.t) / 0.8), w = d.w, y1 = d.y + d.len;
    if (a <= 0) continue;
    const drop = new Path2D(`M ${d.x - w * 0.35} ${d.y} L ${d.x + w * 0.35} ${d.y} C ${d.x + w * 0.4} ${y1 - w * 2} ${d.x + w * 1.05} ${y1 - w * 0.6} ${d.x + w * 1.05} ${y1}`
      + ` A ${w * 1.05} ${w * 1.05} 0 0 1 ${d.x - w * 1.05} ${y1} C ${d.x - w * 1.05} ${y1 - w * 0.6} ${d.x - w * 0.4} ${y1 - w * 2} ${d.x - w * 0.35} ${d.y} Z`);
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = COL.gel; ctx.fill(drop);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(31,150,120,0.75)'; ctx.stroke(drop);
    ell(ctx, d.x - w * 0.35, y1 - w * 0.25, w * 0.3, w * 0.38); ctx.fillStyle = COL.gelHi; ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (s.sweat > 0.02) {
    const y = -92 + (1 - s.sweat) * 46;
    ctx.globalAlpha = Math.min(1, s.sweat * 2);
    ctx.beginPath(); ctx.moveTo(132, y - 16); ctx.quadraticCurveTo(144, y, 132, y + 8); ctx.quadraticCurveTo(120, y, 132, y - 16);
    ctx.fillStyle = '#9fe2ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// in the hair (world.js): soap foam, gel, powder, toothpaste, a cucumber slice, a tangle,
// a lump from the mallet, a straightened shine
function drawHairFx(ctx, s, time) {
  for (const f of s.hairFx) {
    const { x, y } = f;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (f.kind) {
      case 'foam':
        for (const [dx, dy, r] of [[-10, 2, 11], [6, -6, 13], [16, 6, 9], [-2, 10, 8]]) { ell(ctx, x + dx, y + dy, r, r); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(58,39,71,0.35)'; ctx.stroke(); }
        break;
      case 'gel': ell(ctx, x, y, 16, 11, f.rot); ctx.fillStyle = 'rgba(63,224,181,0.6)'; ctx.fill(); ell(ctx, x - 5, y - 4, 5, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); break;
      case 'powder': soft(ctx, x, y, 22, 16, '#ffffff', 0.85); break;
      case 'paste': ell(ctx, x, y, 14, 7, f.rot); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#6fd3c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.stroke(); break;
      case 'slice':
        ctx.translate(x, y); ctx.rotate(f.rot);
        ell(ctx, 0, 0, 20, 20); ctx.fillStyle = '#3f9a4a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ell(ctx, 0, 0, 16, 16); ctx.fillStyle = '#c4ef94'; ctx.fill();
        break;
      case 'tangle':
        ctx.strokeStyle = s.who.hair; ctx.lineWidth = 4;
        ctx.beginPath(); for (let k = 0; k < 4; k++) ctx.ellipse(x + (k % 2) * 6 - 3, y + (k > 1 ? 5 : -5), 14, 8, f.rot + k, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
        break;
      case 'lump': {
        const k = Math.min(1, f.t * 4) * (1 + 0.05 * Math.sin(time * 6));
        ell(ctx, x, y, 22 * k, 16 * k); ctx.fillStyle = mix(s.who.skin.base, '#ff7d9a', 0.35); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ell(ctx, x - 6, y - 6, 6 * k, 3.5 * k); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
        break;
      }
      case 'shine': ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 18, y - 6); ctx.quadraticCurveTo(x, y + 4, x + 18, y - 6); ctx.stroke(); break;
    }
    ctx.restore();
  }
}
// on the face (world.js): toothpaste, gel and paint smears
function drawSmears(ctx, s) {
  for (const m of s.smears) {
    ell(ctx, m.x, m.y, m.r, m.r * 0.65, m.rot);
    ctx.fillStyle = m.col; ctx.fill();
    if (m.kind === 'paste') { ctx.strokeStyle = '#6fd3c0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(m.x - m.r * 0.6, m.y); ctx.lineTo(m.x + m.r * 0.6, m.y); ctx.stroke(); }
  }
}
// bald patches: the hair is cut away there (clipBald), the scalp shows through. A laser
// patch is scorched (a dark frizzy rim, a red burn); a plucked one is pink and bumpy.
export function addBald(s, x, y, r, kind) {
  const near = s.bald.find((b) => b.kind === kind && Math.hypot(b.x - x, b.y - y) < b.r + 6);
  if (near) { near.r = Math.min(kind === 'burn' ? 46 : 36, near.r + (kind === 'burn' ? 6 : 3)); return near; }
  if (s.bald.length >= 16) return null;
  const b = { x, y, r, kind, rot: Math.random() * TAU };
  s.bald.push(b);
  return b;
}
function clipBald(ctx, s) {
  for (const b of s.bald) {
    const p = new Path2D(); p.rect(-2000, -2000, 4000, 4000); p.ellipse(b.x, b.y, b.r, b.r * 0.9, b.rot, 0, TAU);
    ctx.clip(p, 'evenodd');
  }
}
function drawBald(ctx, s) {
  const hair = s.who.hair;
  for (const b of s.bald) {
    ctx.save();
    const p = new Path2D(); p.ellipse(b.x, b.y, b.r, b.r * 0.9, b.rot, 0, TAU);
    ctx.save(); ctx.clip(p);
    if (b.kind === 'burn') soft(ctx, b.x, b.y, b.r * 0.8, b.r * 0.7, '#e2453f', 0.45);
    else soft(ctx, b.x, b.y, b.r * 0.9, b.r * 0.8, '#ff7d9a', 0.3);
    // stubble (or, plucked, little red bumps)
    ctx.fillStyle = b.kind === 'burn' ? 'rgba(40,24,20,0.55)' : 'rgba(230,80,100,0.5)';
    for (let k = 0; k < 9; k++) {
      const a = b.rot + k * 2.4, d = b.r * 0.25 + (k % 3) * b.r * 0.22;
      ell(ctx, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1.6, 1.6); ctx.fill();
    }
    ctx.restore();
    // the cut edge of the hair: scorched frizz, or a fine line of the hair colour
    ctx.lineCap = 'round';
    if (b.kind === 'burn') {
      ctx.strokeStyle = 'rgba(40,24,20,0.8)'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = b.rot + (k / 12) * TAU, x = b.x + Math.cos(a) * b.r, y = b.y + Math.sin(a) * b.r * 0.9;
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * 6, y + Math.sin(a + 0.6) * 6, x + Math.cos(a) * 9, y + Math.sin(a) * 9);
      }
      ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,24,20,0.45)'; ctx.stroke(p);
    } else { ctx.lineWidth = 2; ctx.strokeStyle = rgba(hair, 0.6); ctx.stroke(p); }
    ctx.restore();
  }
}
const DRIP_LIFE = 3.2; // seconds a gel drip shows before it has soaked in
export const DIRT_BOX = { x: -200, y: -250, w: 400, h: 500 };

// a dyed patient is drawn with the dye's colour in place of their own (the look object is
// shared with the "before" copy, so it is put back right after)
export function drawPatient(ctx, s, time, dirtImg) {
  const w = s.who;
  if (!s.dye) { drawPatientNow(ctx, s, time, dirtImg); return; }
  const c = w.hair, hi = w.hairHi, h = hairNow(s);
  w.hair = h.c; w.hairHi = h.hi;
  try { drawPatientNow(ctx, s, time, dirtImg); } finally { w.hair = c; w.hairHi = hi; }
}
function drawPatientNow(ctx, s, time, dirtImg) {
  if (!s.noChair) drawChair(ctx); // the waiting room draws patients on a bench
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
  ctx.save(); headXf(); clipBald(ctx, s); drawBackHair(ctx, s); ctx.restore();
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
