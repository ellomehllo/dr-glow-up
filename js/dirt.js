// Grime on the patient's face (mud smudges, oily patches, blackheads), painted per
// patient into an offscreen canvas in head space. Washing erases it with a soft brush;
// `start` keeps the untouched copy for the "before" side of the results slider.
import { TAU, makeCanvas } from './draw.js';
import { headPath, CAP_PATH, DIRT_BOX } from './patient.js';

const RES = 1.5;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smudge(c, x, y, r, R) {
  const blobs = [[0, 0, r]];
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, d = r * (0.45 + R() * 0.55);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.3 + R() * 0.32)]);
  }
  for (let i = 0; i < 4; i++) {
    const a = R() * TAU, d = r * (1.2 + R() * 0.5);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.08 + R() * 0.08)]);
  }
  const fill = (dx, dy, col, k = 1) => {
    c.fillStyle = col;
    c.beginPath();
    for (const b of blobs) { c.moveTo(x + b[0] * k + dx + b[2] * k, y + b[1] * k + dy); c.arc(x + b[0] * k + dx, y + b[1] * k + dy, b[2] * k, 0, TAU); }
    c.fill();
  };
  fill(2, 4, 'rgba(92,62,38,0.85)');
  fill(0, 0, 'rgba(150,104,64,0.92)');
  fill(-r * 0.18, -r * 0.22, 'rgba(255,226,180,0.25)', 0.5);
}

function oily(c, x, y, r) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,248,205,0.42)'); g.addColorStop(0.7, 'rgba(250,236,170,0.2)'); g.addColorStop(1, 'rgba(250,236,170,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

const SMUDGES = [[-70, -150, 38], [62, -44, 32], [-110, 40, 30], [34, 116, 34], [112, 150, 26], [-46, 170, 28], [118, -120, 26], [-18, 30, 20], [-130, 120, 24], [90, -170, 24]];
const OILS = [[-20, -110, 60], [0, 40, 38], [96, 70, 42], [-96, 74, 40]];

function paint(cv, setup) {
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.setTransform(RES, 0, 0, RES, -DIRT_BOX.x * RES, -DIRT_BOX.y * RES);
  const R = rng(setup.seed || 11), amt = setup.dirt ?? 1;
  const clip = new Path2D();
  clip.addPath(headPath(setup.jaw0 || 0));
  clip.addPath(CAP_PATH);
  c.save();
  c.clip(clip);
  // dull, grey-ish film over the whole face
  c.fillStyle = `rgba(120,108,84,${0.18 + 0.14 * amt})`;
  c.fillRect(DIRT_BOX.x, DIRT_BOX.y, DIRT_BOX.w, DIRT_BOX.h);
  c.fillStyle = 'rgba(100,88,60,0.12)';
  for (let i = 0; i < 30; i++) { c.beginPath(); c.arc(-190 + R() * 380, -240 + R() * 470, 20 + R() * 30, 0, TAU); c.fill(); }
  for (const [x, y, r] of OILS) oily(c, x + (R() - 0.5) * 30, y + (R() - 0.5) * 30, r);
  // blackheads around the nose and chin
  c.fillStyle = 'rgba(52,40,34,0.75)';
  const nb = Math.round(16 + 26 * amt);
  for (let i = 0; i < nb; i++) {
    const a = R() * TAU, d = R();
    const x = Math.cos(a) * (30 + d * 70), y = 70 + Math.sin(a) * (20 + d * 40) + (i % 3 === 0 ? -70 : 0);
    c.beginPath(); c.arc(x, y, 1.4 + R() * 1.6, 0, TAU); c.fill();
  }
  const ns = Math.max(3, Math.round(SMUDGES.length * amt));
  const order = SMUDGES.map((_, i) => i).sort(() => R() - 0.5).slice(0, ns);
  for (const i of order) {
    const [x, y, r] = SMUDGES[i];
    smudge(c, x + (R() - 0.5) * 24, y + (R() - 0.5) * 24, r * (0.8 + R() * 0.35), R);
  }
  c.restore();
}

export class Dirt {
  constructor() {
    const w = DIRT_BOX.w * RES, h = DIRT_BOX.h * RES;
    this.start = makeCanvas(w, h);
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.brush = makeCanvas(64, 64);
    const b = this.brush.getContext('2d'), g = b.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g; b.fillRect(0, 0, 64, 64);
    this.setup({ seed: 11, dirt: 1, jaw0: 0 });
  }
  // paint fresh grime for a new patient
  setup(o) { paint(this.start, o); this.reset(); }
  reset() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy';
    c.drawImage(this.start, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.setTransform(RES, 0, 0, RES, -DIRT_BOX.x * RES, -DIRT_BOX.y * RES);
  }
  // erase a soft round patch (head-space units)
  erase(x, y, r) {
    const c = this.ctx;
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(this.brush, x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
  }
}
