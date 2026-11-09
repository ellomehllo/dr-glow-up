// Bodies and clothes. A build sets the shoulders, neck and arms (skinny to huge); an
// outfit paints the torso, the sleeves and whatever sits at the neck. Everything is in
// stage units below the head: the neck meets the torso at y 250. Clothes are lit from the
// upper left with soft shading and folds, and outlined finer than the props.
import { TAU, INK, ell, star5, soft } from './draw.js';
import { mix } from './people.js';
import { toneOf, OL } from './tones.js';

const LW = 4;
const FOLD = 'rgba(40,20,60,0.16)';
//   W: half-width at the chest, n: half-width of the neck, A: arm thickness,
//   tr: trapezius rise beside the neck, sl: shoulder slope, bulge: deltoid bulge
const BUILDS = {
  skinny: { W: 198, n: 54, A: 64, tr: 0, sl: 16, bulge: 0 },
  medium: { W: 230, n: 66, A: 80, tr: 0, sl: 0, bulge: 0 },
  chubby: { W: 266, n: 76, A: 98, tr: -4, sl: 8, bulge: 4 },
  broad: { W: 262, n: 78, A: 96, tr: 8, sl: -6, bulge: 8 },
  huge: { W: 292, n: 92, A: 124, tr: 30, sl: -10, bulge: 24 },
};

const SLEEVE = { gown: 'short', tee: 'short', tank: 'none', glam: 'none' }; // the rest: long

const geoCache = new Map();
function geo(name) {
  const key = BUILDS[name] ? name : 'medium';
  let G = geoCache.get(key);
  if (G) return G;
  const { W, n, A, tr, sl, bulge } = BUILDS[key], k = W / 230;
  const sy = 318 + sl - tr * 0.3;
  const torsoD = `M ${-n} 250 C ${-(n + 60)} ${258 - tr} ${-190 * k} ${266 - tr * 0.6} ${-210 * k} ${sy} C ${-222 * k} ${348 + sl} ${-228 * k} 390 ${-W} 440 L ${-(W + 6)} 1400 `
    + `L ${W + 6} 1400 L ${W} 440 C ${228 * k} 390 ${222 * k} ${348 + sl} ${210 * k} ${sy} C ${190 * k} ${266 - tr * 0.6} ${n + 60} ${258 - tr} ${n} 250`;
  const I = W - 42, O = I + A, T = W * 0.652, ty = 268 - tr * 0.5;
  const outer = `M ${-T} ${ty} C ${-(T + (O - T) * 0.6 + bulge)} ${278 - tr * 0.5} ${-(O + bulge)} 330 ${-O} 432 L ${-(O + 6)} 1400`;
  const inner = `M ${-(I + 2)} 1400 L ${-I} 452 C ${-I} 404 ${-(I - 10)} 330 ${-T} ${ty}`;
  G = {
    W, n, nn: n + 4, A, I, O, T, ty, tr,
    torso: new Path2D(`${torsoD} Z`),
    edge: new Path2D(torsoD), // no top edge, so no line crosses the base of the neck
    arm: new Path2D(`${outer} L ${-(I + 2)} 1400 L ${-I} 452 C ${-I} 404 ${-(I - 10)} 330 ${-T} ${ty} Z`),
    armOut: new Path2D(outer), armIn: new Path2D(inner),
    necks: new Map(),
  };
  geoCache.set(key, G);
  return G;
}
// the opening at the neck: a U down to `depth`, `wide` past the neck on each side
function neckD(G, depth, wide = 0) {
  const a = G.nn + wide, mid = 250 + (depth - 250) * 0.68;
  return `M ${-a} 250 C ${-a * 0.8} ${mid} ${-a * 0.37} ${depth - 2} 0 ${depth} C ${a * 0.37} ${depth - 2} ${a * 0.8} ${mid} ${a} 250`;
}
function neckPath(G, depth, wide = 0, closed = true) {
  const key = `${depth}|${wide}|${closed}`;
  let p = G.necks.get(key);
  if (!p) { p = new Path2D(neckD(G, depth, wide) + (closed ? ' Z' : '')); G.necks.set(key, p); }
  return p;
}
// skin showing through the neck opening, with the shadow under the chin
function skinNeck(ctx, G, sk, depth, wide = 0, edge = true) {
  const p = neckPath(G, depth, wide);
  ctx.fillStyle = sk.base; ctx.fill(p);
  ctx.save(); ctx.clip(p);
  soft(ctx, 0, 262, G.n + wide + 10, 24, sk.shade, 0.55);
  ctx.restore();
  if (edge) { ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(neckPath(G, depth, wide, false)); }
}
function pattern(ctx, G, col, kind, alpha = 0.55) {
  ctx.fillStyle = col; ctx.globalAlpha = alpha;
  for (let y = 270, row = 0; y < 980; y += 44, row++) {
    for (let x = -G.W - 10 + (row % 2) * 24; x < G.W + 20; x += 48) {
      if (kind === 'dots') { ell(ctx, x, y, 5, 5); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}
function ribs(ctx, G, col, alpha, step = 22) {
  ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = 3;
  ctx.beginPath(); for (let x = -G.W; x <= G.W; x += step) { ctx.moveTo(x, 240); ctx.lineTo(x * 1.02, 1400); } ctx.stroke();
  ctx.globalAlpha = 1;
}
function stud(ctx, x, y, r = 5) {
  ell(ctx, x, y, r, r); ctx.fillStyle = '#dfe3ee'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke();
  ell(ctx, x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.3); ctx.fillStyle = '#fff'; ctx.fill();
}
function collarPoints(ctx, G, col) {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (G.n - 2), 236); ctx.lineTo(side * G.n * 0.12, 292); ctx.lineTo(side * (G.n + 30), 294); ctx.lineTo(side * (G.n + 20), 246);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
  }
}

// ---------- torsos: drawn inside the torso clip ----------
const TORSO = {
  gown(ctx, G, o, d, sk) {
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    pattern(ctx, G, o.d, o.pat);
    skinNeck(ctx, G, sk, 324);
    ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(58,39,71,0.35)';
    ctx.beginPath(); ctx.moveTo(-(G.nn + 12), 252); ctx.bezierCurveTo(-(G.nn + 12) * 0.8, 314, -30, 338, 0, 340); ctx.bezierCurveTo(30, 338, (G.nn + 12) * 0.8, 314, G.nn + 12, 252); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(G.W * 0.3, 400, 80, 70, [4, 4, 16, 16]); ctx.stroke();
  },
  tee(ctx, G, o, d, sk) {
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    skinNeck(ctx, G, sk, 290, 0, false);
    const rim = neckPath(G, 290, 0, false);
    ctx.lineWidth = 13.5; ctx.strokeStyle = INK; ctx.stroke(rim);
    ctx.lineWidth = 9.5; ctx.strokeStyle = d; ctx.stroke(rim);
    if (o.print === 'donut') donut(ctx, 0, 440);
  },
  tank(ctx, G, o, d, sk) {
    ctx.fillStyle = sk.base; ctx.fill(G.torso);
    ctx.fillStyle = sk.shade; ctx.fillRect(G.W * 0.5, 200, G.W, 1300);
    // collarbones and chest
    ctx.strokeStyle = toneOf(sk).line; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * (G.n + 6), 268); ctx.quadraticCurveTo(s * (G.n + 30), 262, s * (G.n + 64), 272);
      ctx.moveTo(s * (G.n + 70), 300); ctx.quadraticCurveTo(s * (G.n + 46), 390, s * 8, 378);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    const n = G.n, W = G.W;
    const p = new Path2D(`M ${-(n + 12)} 200 L ${-(n + 50)} 200 C ${-(n + 54)} 300 ${-(W - 64)} 380 ${-(W - 26)} 470 L ${-(W - 26)} 1400 L ${W - 26} 1400 L ${W - 26} 470 C ${W - 64} 380 ${n + 54} 300 ${n + 50} 200 L ${n + 12} 200 C ${n + 8} 330 ${n * 0.55} 400 0 402 C ${-n * 0.55} 400 ${-(n + 8)} 330 ${-(n + 12)} 200 Z`);
    ctx.fillStyle = o.c; ctx.fill(p);
    ctx.save(); ctx.clip(p); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-W * 0.62, 380, 26, 1000); ctx.restore();
    ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(p);
  },
  vest(ctx, G, o, d, sk) {
    ctx.fillStyle = '#fbfbff'; ctx.fill(G.torso);
    const n = G.n, W = G.W;
    // tie
    ctx.lineWidth = 2.8; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(-15, 254); ctx.lineTo(15, 254); ctx.lineTo(10, 286); ctx.lineTo(-10, 286); ctx.closePath(); ctx.fillStyle = o.a; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 286); ctx.lineTo(10, 286); ctx.lineTo(22, 420); ctx.lineTo(0, 446); ctx.lineTo(-22, 420); ctx.closePath(); ctx.fill(); ctx.stroke();
    // the sweater vest with a V neck and argyle diamonds
    const v = new Path2D(`M ${-(W + 20)} 1400 L ${-(W + 20)} 290 L ${-(n + 22)} 258 L 0 452 L ${n + 22} 258 L ${W + 20} 290 L ${W + 20} 1400 Z`);
    ctx.fillStyle = o.c; ctx.fill(v);
    ctx.save(); ctx.clip(v);
    ctx.fillStyle = d; ctx.globalAlpha = 0.5;
    for (let y = 330, row = 0; y < 1100; y += 84, row++) for (let x = -W + (row % 2) * 48; x <= W + 48; x += 96) {
      ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 42); ctx.lineTo(x - 30, y); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.45; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
    ctx.beginPath(); for (let x = -W - 300; x < W + 300; x += 96) { ctx.moveTo(x, 288); ctx.lineTo(x + 560, 1100); ctx.moveTo(x, 288); ctx.lineTo(x - 560, 1100); } ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.restore();
    const vEdge = new Path2D(`M ${-(n + 22)} 258 L 0 452 L ${n + 22} 258`);
    ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(vEdge);
    ctx.lineWidth = 8.5; ctx.strokeStyle = d; ctx.stroke(vEdge);
  },
  turtleneck(ctx, G, o, d) {
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    ribs(ctx, G, '#ffffff', 0.06, 26);
  },
  leather(ctx, G, o, d, sk) {
    const n = G.n, W = G.W;
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    // the tee underneath, then the open jacket
    ctx.fillStyle = o.a; ctx.beginPath(); ctx.moveTo(-(n + 2), 200); ctx.lineTo(-n * 0.72, 1400); ctx.lineTo(n * 0.72, 1400); ctx.lineTo(n + 2, 200); ctx.closePath(); ctx.fill();
    skinNeck(ctx, G, sk, 284);
    ctx.lineWidth = 3.2; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(-n * 0.74, 470); ctx.lineTo(-n * 0.72, 1400); ctx.moveTo(n * 0.74, 470); ctx.lineTo(n * 0.72, 1400); ctx.stroke();
    ctx.setLineDash([4, 7]); ctx.lineWidth = 5; ctx.strokeStyle = '#c9cfdc';
    ctx.beginPath(); ctx.moveTo(-n * 0.74 - 8, 480); ctx.lineTo(-n * 0.72 - 8, 1400); ctx.stroke(); ctx.setLineDash([]);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * (n + 2), 248); ctx.lineTo(s * (n + 56), 254); ctx.lineTo(s * (n + 46), 332); ctx.lineTo(s * (n + 22), 324); ctx.lineTo(s * n * 0.74, 470); ctx.lineTo(s * n * 0.9, 300);
      ctx.closePath(); ctx.fillStyle = d; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
      stud(ctx, s * (n + 34), 300); stud(ctx, s * (n + 26), 360);
      for (let i = 0; i < 4; i++) stud(ctx, s * (n + 86 + i * ((W * 0.8 - n - 86) / 3)), 270 + i * 12, 5.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-W * 0.86, 380, 34, 1000);
  },
  varsity(ctx, G, o, d, sk) {
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    skinNeck(ctx, G, sk, 290, 0, false);
    const rim = neckPath(G, 290, 0, false);
    ctx.lineWidth = 18; ctx.strokeStyle = INK; ctx.stroke(rim);
    ctx.lineWidth = 14; ctx.strokeStyle = o.c; ctx.stroke(rim);
    ctx.lineWidth = 4; ctx.strokeStyle = o.a; ctx.stroke(rim);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(58,39,71,0.45)';
    ctx.beginPath(); ctx.moveTo(0, 306); ctx.lineTo(0, 1400); ctx.stroke();
    for (const y of [340, 420, 500]) { ell(ctx, 8, y, 7, 7); ctx.fillStyle = o.a; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); }
    star5(ctx, -G.W * 0.48, 410, 34, -Math.PI / 2, 0.5); ctx.fillStyle = o.a; ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.stroke();
    star5(ctx, -G.W * 0.48, 412, 16, -Math.PI / 2, 0.5); ctx.fillStyle = o.c; ctx.fill();
  },
  hoodie(ctx, G, o, d, sk) {
    const n = G.n;
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    skinNeck(ctx, G, sk, 278, 0, false);
    const rim = neckPath(G, 278, 0, false);
    ctx.lineWidth = 15; ctx.strokeStyle = INK; ctx.stroke(rim);
    ctx.lineWidth = 11; ctx.strokeStyle = d; ctx.stroke(rim);
    for (const s of [-1, 1]) {
      const x = s * n * 0.42;
      ctx.beginPath(); ctx.moveTo(x, 286); ctx.quadraticCurveTo(x + s * 6, 330, x + s * 2, 382);
      ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + s * 2 - 5, 380, 10, 18, 3); ctx.fillStyle = o.a; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.lineWidth = 3.5; ctx.strokeStyle = d;
    ctx.beginPath(); ctx.roundRect(-G.W * 0.55, 600, G.W * 1.1, 170, [40, 40, 10, 10]); ctx.stroke();
  },
  goth(ctx, G, o, d, sk) {
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    skinNeck(ctx, G, sk, 322, 26, false);
    const rim = neckPath(G, 322, 26, false);
    // lace edge
    ctx.setLineDash([0.1, 13]); ctx.lineWidth = 12; ctx.strokeStyle = '#5b4a70'; ctx.stroke(rim); ctx.setLineDash([]);
    ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(rim);
    // lacing down the front
    ctx.lineWidth = 3; ctx.strokeStyle = o.a;
    ctx.beginPath(); for (let y = 344; y < 460; y += 26) { ctx.moveTo(-12, y); ctx.lineTo(12, y + 20); ctx.moveTo(12, y); ctx.lineTo(-12, y + 20); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(-G.W * 0.8, 360, 40, 1000);
  },
  glam(ctx, G, o, d, sk) {
    const n = G.n, W = G.W;
    ctx.fillStyle = sk.base; ctx.fill(G.torso);
    ctx.fillStyle = sk.shade; ctx.fillRect(W * 0.5, 200, W, 1300);
    ctx.strokeStyle = toneOf(sk).line; ctx.globalAlpha = 0.5; ctx.lineWidth = 2.6;
    ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(s * (n + 6), 270); ctx.quadraticCurveTo(s * (n + 30), 264, s * (n + 66), 274); } ctx.stroke();
    ctx.globalAlpha = 1;
    // straps, then the satin top with a sweetheart neckline
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * W * 0.42, 380); ctx.lineTo(s * (n + 34), 240);
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = o.c; ctx.stroke();
    }
    const p = new Path2D(`M ${-(W + 20)} 1400 L ${-(W + 20)} 410 C ${-W * 0.7} 380 ${-W * 0.42} 356 ${-W * 0.2} 376 Q ${-W * 0.06} 388 0 404 Q ${W * 0.06} 388 ${W * 0.2} 376 C ${W * 0.42} 356 ${W * 0.7} 380 ${W + 20} 410 L ${W + 20} 1400 Z`);
    ctx.fillStyle = o.c; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineCap = 'round';
    ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-W * 0.7, 420); ctx.quadraticCurveTo(-W * 0.5, 520, -W * 0.62, 700); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W * 0.2, 430); ctx.quadraticCurveTo(W * 0.32, 520, W * 0.24, 680); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(p);
    // necklace with a little gem
    ctx.beginPath(); ctx.moveTo(-(n + 4), 258); ctx.quadraticCurveTo(0, 340, n + 4, 258);
    ctx.lineWidth = 4.6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#ffc93c'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 296); ctx.lineTo(10, 310); ctx.lineTo(0, 328); ctx.lineTo(-10, 310); ctx.closePath();
    ctx.fillStyle = '#ff6fb5'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    ell(ctx, -3, 306, 2.5, 2.5); ctx.fillStyle = '#fff'; ctx.fill();
  },
  cardigan(ctx, G, o, d, sk) {
    const n = G.n;
    ctx.fillStyle = o.c; ctx.fill(G.torso);
    ribs(ctx, G, d, 0.25, 18);
    const v = new Path2D(`M ${-(n + 14)} 236 L 0 480 L ${n + 14} 236 Z`);
    ctx.fillStyle = o.a; ctx.fill(v);
    skinNeck(ctx, G, sk, 272, -4);
    const vEdge = new Path2D(`M ${-(n + 14)} 236 L 0 480 L ${n + 14} 236`);
    ctx.lineWidth = 16.5; ctx.strokeStyle = INK; ctx.stroke(vEdge);
    ctx.lineWidth = 12.5; ctx.strokeStyle = d; ctx.stroke(vEdge);
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(0, 480); ctx.lineTo(0, 1400); ctx.stroke();
    for (const y of [530, 610, 690]) {
      ell(ctx, -16, y, 9, 9); ctx.fillStyle = '#f4ead7'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = 'rgba(58,39,71,0.45)'; ell(ctx, -19, y - 2, 1.6, 1.6); ctx.fill(); ell(ctx, -13, y + 2, 1.6, 1.6); ctx.fill();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = d; ctx.beginPath(); ctx.roundRect(G.W * 0.28, 640, 86, 80, [4, 4, 16, 16]); ctx.stroke();
  },
};

function donut(ctx, x, y) {
  ell(ctx, x, y, 50, 44); ctx.fillStyle = '#e9a25a'; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, r = 40 + (i % 2 ? 4 : -1); ctx.lineTo(x + Math.cos(a) * r, y - 3 + Math.sin(a) * r * 0.86); }
  ctx.closePath(); ctx.fillStyle = '#ff7fb6'; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
  ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  [['#fff36b', -24, -20, 0.5], ['#6aa6ff', 18, -24, -0.6], ['#ffffff', 28, 8, 0.9], ['#62d64a', -26, 14, -0.3], ['#ffffff', 2, 24, 0.2], ['#6aa6ff', -6, -30, 1.2]]
    .forEach(([c, dx, dy, r]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x + dx - Math.cos(r) * 5, y + dy - Math.sin(r) * 5); ctx.lineTo(x + dx + Math.cos(r) * 5, y + dy + Math.sin(r) * 5); ctx.stroke(); });
  ell(ctx, x, y - 3, 14, 11); ctx.fillStyle = '#ffd95e'; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
}

// things worn in front of the neck, drawn after the torso and arms
const FRONT = {
  vest(ctx, G) { collarPoints(ctx, G, '#fbfbff'); },
  cardigan(ctx, G, o) { collarPoints(ctx, G, o.a); },
  turtleneck(ctx, G, o, d) {
    const n = G.n + 8;
    const p = new Path2D(`M ${-n} 264 L ${-(n - 4)} 208 Q 0 196 ${n - 4} 208 L ${n} 264 Q 0 280 ${-n} 264 Z`);
    ctx.fillStyle = o.c; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = d; ctx.lineWidth = 4; ctx.beginPath(); for (let x = -n + 8; x < n; x += 13) { ctx.moveTo(x, 196); ctx.lineTo(x * 1.03, 282); } ctx.stroke();
    ctx.strokeStyle = 'rgba(58,39,71,0.4)'; ctx.beginPath(); ctx.moveTo(-n, 236); ctx.quadraticCurveTo(0, 246, n, 236); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(p);
  },
};

// behind the neck: a hoodie's hood and the band of a headset worn around the neck
export function drawBehind(ctx, s) {
  const w = s.who, o = w.outfit, G = geo(w.build);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.type === 'hoodie') {
    const d = o.d || mix(o.c, '#1a1020', 0.28);
    ell(ctx, 0, 236, G.n + 80, 52); ctx.fillStyle = d; ctx.fill(); ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke();
    ctx.save(); ell(ctx, 0, 236, G.n + 80, 52); ctx.clip(); soft(ctx, -40, 216, G.n + 30, 24, '#ffffff', 0.14); ctx.restore();
    ell(ctx, 0, 230, G.n + 40, 32); ctx.fillStyle = 'rgba(30,20,40,0.35)'; ctx.fill();
  }
  if (w.extra === 'headset') {
    ctx.beginPath(); ctx.ellipse(0, 244, G.n + 30, 46, 0, Math.PI, TAU);
    ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#4d5470'; ctx.stroke();
  }
}

export function drawBody(ctx, s) {
  const w = s.who, sk = w.skin, o = w.outfit, G = geo(w.build), t = TORSO[o.type] ? o.type : 'gown';
  const d = o.d || mix(o.c, '#1a1020', 0.28);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.clip(G.torso);
  TORSO[t](ctx, G, o, d, sk, w);
  // lit from the upper left, deeper toward the right; a shadow under the chin
  const lg = ctx.createLinearGradient(-G.W, 0, G.W, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0.14)'); lg.addColorStop(0.42, 'rgba(255,255,255,0)'); lg.addColorStop(0.68, 'rgba(40,20,60,0.05)'); lg.addColorStop(1, 'rgba(40,20,60,0.22)');
  ctx.fillStyle = lg; ctx.fillRect(-G.W - 30, 200, G.W * 2 + 60, 1300);
  soft(ctx, 0, 266, G.n + 50, 30, '#2a1626', 0.2);
  if (t !== 'tank' && t !== 'glam') { // soft folds pulling from under the arms
    ctx.strokeStyle = FOLD; ctx.lineWidth = 3;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * (G.I - 6), 470); ctx.quadraticCurveTo(side * (G.I - 54), 530, side * (G.I - 40), 630);
      ctx.moveTo(side * (G.I - 4), 520); ctx.quadraticCurveTo(side * (G.I - 30), 556, side * (G.I - 26), 600);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke(G.edge);
  // arms
  const sleeve = SLEEVE[t] || 'long';
  const sc = t === 'vest' ? '#fbfbff' : t === 'varsity' ? o.a : o.c;
  const { I, O, A } = G;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1);
    ctx.save(); ctx.clip(G.arm);
    ctx.fillStyle = sleeve === 'long' ? sc : sk.base; ctx.fillRect(-O - 60, 200, A + 140, 1300);
    // the arm rounds away from the light: shade on its inner side, a lit edge outside
    const ag = ctx.createLinearGradient(-I + 6, 0, -I - A * 0.6, 0);
    ag.addColorStop(0, sleeve === 'long' ? 'rgba(40,20,60,0.26)' : rgbaSkin(sk.deep, 0.55)); ag.addColorStop(1, 'rgba(40,20,60,0)');
    ctx.fillStyle = ag; ctx.fillRect(-O - 60, 200, A + 140, 1300);
    soft(ctx, -O + 14, 420, 16, 160, '#ffffff', 0.14);
    if (sleeve === 'long') { // a crease at the elbow
      ctx.strokeStyle = FOLD; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-I - A * 0.15, 640); ctx.quadraticCurveTo(-I - A * 0.45, 620, -O + 12, 650); ctx.stroke();
    }
    if (sleeve === 'short') {
      const hem = () => { ctx.moveTo(-O - 40, 486); ctx.quadraticCurveTo(-(I + O) / 2, 500, -I + 40, 478); };
      ctx.fillStyle = sc; ctx.beginPath(); ctx.moveTo(-O - 40, 200); hem(); ctx.lineTo(-I + 40, 200); ctx.closePath(); ctx.fill();
      if (t === 'gown') {
        ctx.fillStyle = o.d; ctx.globalAlpha = 0.5;
        for (const [f, y] of [[0.65, 330], [0.33, 380], [0.78, 420], [0.48, 456]]) { ell(ctx, -(I + A * f), y, 5, 5); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.beginPath(); hem(); ctx.stroke();
    } else if (sleeve === 'none' && w.build === 'huge') {
      // big shoulders and arms
      ctx.strokeStyle = toneOf(sk).line; ctx.globalAlpha = 0.55; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-G.T - 8, G.ty + 40); ctx.bezierCurveTo(-I - 10, 330, -I + 4, 400, -I - A * 0.3, 440);
      ctx.moveTo(-I - A * 0.15, 520); ctx.quadraticCurveTo(-I - A * 0.5, 470, -O + 10, 540); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (t === 'leather') {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-O + 14, 300, 16, 1100);
      stud(ctx, -(I + A * 0.55), 330, 5);
    }
    ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.stroke(G.armOut);
    ctx.lineWidth = 3.2; ctx.stroke(G.armIn);
    ctx.restore();
  }
  if (FRONT[t]) FRONT[t](ctx, G, o, d, sk);
  if (w.extra === 'headset') {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * (G.n + 26), 252); ctx.rotate(side * 0.35);
      ctx.beginPath(); ctx.roundRect(-17, -24, 34, 48, 14); ctx.fillStyle = '#4d5470'; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke();
      soft(ctx, -6, -10, 8, 14, '#ffffff', 0.25);
      ctx.beginPath(); ctx.roundRect(-9, -15, 18, 30, 8); ctx.lineWidth = 3; ctx.strokeStyle = o.a || '#3dfcc3'; ctx.stroke();
      ctx.restore();
    }
  }
}

// the neck: wider on bigger builds; a choker sits just under the chin
export function drawNeck(ctx, s, hy, chin) {
  const w = s.who, sk = w.skin, G = geo(w.build);
  const fx = s.fx || 1, fy = s.fy || 1;
  const top = hy + 100 * fy, bot = 290 + s.hop, nt = G.n - 6, nb = G.n + 4;
  const p = new Path2D();
  p.moveTo(-nt, top);
  p.bezierCurveTo(-nt - 2, top + 60, -nb + 4, bot - 40, -nb, bot);
  p.lineTo(nb, bot);
  p.bezierCurveTo(nb - 4, bot - 40, nt + 2, top + 60, nt, top);
  p.closePath();
  ctx.fillStyle = sk.shade; ctx.fill(p);
  ctx.save(); ctx.clip(p); ctx.translate(-12, 0); ctx.fillStyle = sk.base; ctx.fill(p); ctx.restore();
  ctx.save(); ctx.clip(p);
  soft(ctx, 0, hy + (chin + 10) * fy, 96 * fx, 40, sk.deep, 0.7);
  soft(ctx, nt * 0.7, (top + bot) / 2, 22, 70, sk.deep, 0.25);
  if (w.extra === 'choker') {
    const y = hy + (chin + 26) * fy, a = nt + 6;
    ctx.beginPath(); ctx.moveTo(-a, y - 9); ctx.quadraticCurveTo(0, y + 3, a, y - 9); ctx.lineTo(a, y + 7); ctx.quadraticCurveTo(0, y + 19, -a, y + 7); ctx.closePath();
    ctx.fillStyle = '#1b1622'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = OL; ctx.strokeStyle = toneOf(sk).ink;
  ctx.beginPath();
  ctx.moveTo(-nt, top); ctx.bezierCurveTo(-nt - 2, top + 60, -nb + 4, bot - 40, -nb, bot);
  ctx.moveTo(nt, top); ctx.bezierCurveTo(nt + 2, top + 60, nb - 4, bot - 40, nb, bot);
  ctx.stroke();
  if (w.extra === 'choker') { // a little silver moon hanging from it
    const y = hy + (chin + 26) * fy + 24;
    ctx.beginPath(); ctx.arc(0, y, 9, Math.PI * 0.25, Math.PI * 1.75, false); ctx.arc(4, y, 7.3, Math.PI * 1.6, Math.PI * 0.4, true); ctx.closePath();
    ctx.fillStyle = '#dfe3ee'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
}

const rgbaSkin = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
