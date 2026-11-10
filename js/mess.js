// The creator's reverse tools (multiplayer, creator.js): the same tools the clinic fixes a
// face with, used the other way round to make the character worse before they go into
// the salon. Each mirrors its fix tool's hand: rub where it rubs, hold where it holds,
// tap where it taps. Head-space points (q.x, q.y); everything lands in the patient state,
// so it saves with the look (look.js).
import { onFace, react, CRACKS, WRINKLES } from './patient.js';
import { CURLS } from './hair.js';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const mid = (pts) => ({ x: pts.reduce((a, p) => a + p[0], 0) / pts.length, y: pts.reduce((a, p) => a + p[1], 0) / pts.length });
const onHair = (x, y) => y < -96 + 70 * Math.min(1, (x / 158) ** 2) && onFace(x, y, 40);

// kind: 'rub' (drag over it), 'hold' (press and keep holding), 'tap' (one each press)
// icon: the fix tool's own picture; does(g, q, dt): true when something changed
export const MESS = [
  {
    id: 'grime', of: 'scrub', icon: 'sponge', name: 'Grime', kind: 'rub',
    does(g, q) { return onFace(q.x, q.y, 20) && g.dirt.grime(q.x, q.y, 34); },
  },
  {
    id: 'pimples', of: 'pop', icon: 'pop', name: 'Add pimples', kind: 'tap',
    does(g, q) {
      const s = g.s;
      if (!onFace(q.x, q.y, -10) || onHair(q.x, q.y) || s.pimples.length >= 14) return false;
      if (s.pimples.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < p.r + 14)) return false;
      s.pimples.push({ x: Math.round(q.x), y: Math.round(q.y), r: Math.round(rand(8, 13)), swell: 0, popped: false, mark: 0, shrink: 0, wob: rand(0, 6) });
      return true;
    },
  },
  {
    id: 'scars', of: 'gold', icon: 'tube', name: 'Add scars', kind: 'tap',
    does(g, q) {
      const s = g.s;
      let best = null, bd = 110;
      for (const c of CRACKS) {
        if (s.cracks.includes(c)) continue;
        const m = mid(c.pts), d = Math.hypot(m.x - q.x, m.y - q.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) return false;
      // kept in CRACKS order, with their gel and healing alongside
      const keep = CRACKS.filter((c) => c === best || s.cracks.includes(c));
      s.scarF = keep.map((c) => (c === best ? 0 : s.scarF[s.cracks.indexOf(c)]));
      s.scarH = keep.map((c) => (c === best ? 0 : s.scarH[s.cracks.indexOf(c)]));
      s.cracks = keep;
      return true;
    },
  },
  {
    id: 'spots', of: 'laser', icon: 'laser', name: 'Add sun spots', kind: 'tap',
    does(g, q) {
      const s = g.s;
      if (!onFace(q.x, q.y, -14) || onHair(q.x, q.y) || s.spots.length >= 16) return false;
      if (s.spots.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 26)) return false;
      s.spots.push({ x: Math.round(q.x), y: Math.round(q.y), r: rand(7, 11.5), rot: rand(0, TAU), z: 0 });
      return true;
    },
  },
  {
    id: 'wrinkles', of: 'iron', icon: 'iron', name: 'Add wrinkles', kind: 'tap',
    does(g, q) {
      const s = g.s;
      let best = null, bd = 90;
      for (const w of WRINKLES) {
        if (s.wrk.some((x) => x.i === w.i)) continue;
        const m = mid(w.pts), d = Math.hypot(m.x - q.x, m.y - q.y);
        if (d < bd) { bd = d; best = w; }
      }
      if (!best) return false;
      s.wrk = [...s.wrk, { ...best, f: 0, red: 0 }].sort((a, b) => a.i - b.i);
      return true;
    },
  },
  {
    id: 'nose', of: 'nose', icon: 'nose', name: 'Bumpy nose', kind: 'hold',
    does(g, q, dt) { const s = g.s; if (s.nose <= 0) return false; s.nose = Math.max(0, s.nose - dt * 0.7); return true; },
  },
  {
    id: 'circles', of: 'circles', icon: 'cucumber', name: 'Dark circles', kind: 'rub',
    does(g, q, dt) {
      const s = g.s;
      if (q.y < -40 || q.y > 60 || Math.abs(q.x) > 130) return false;
      const i = q.x < 0 ? 0 : 1;
      if (s.circ[i] >= 1) return false;
      s.circ[i] = Math.min(1, s.circ[i] + dt * 1.4);
      return true;
    },
  },
  {
    id: 'teeth', of: 'teeth', icon: 'tooth', name: 'Yellow teeth', kind: 'hold',
    does(g, q, dt) {
      const s = g.s;
      react(s, 'normal', 0.4, 'aah'); // open wide while it works
      if (s.teeth <= 0) return false;
      s.teeth = Math.max(0, s.teeth - dt * 0.6);
      return true;
    },
  },
  {
    id: 'hair', of: 'rasp', icon: 'brush', name: 'Thin hair', kind: 'rub',
    does(g, q, dt) {
      const s = g.s;
      let hit = false;
      for (let i = 0; i < CURLS.length; i++) {
        const c = CURLS[i];
        if (s.curls[i] >= 0 && Math.hypot(c.x - q.x, c.y - q.y) <= 36 + c.r * 0.5) { s.curls[i] = -1; hit = true; }
      }
      if (hit) s.hair = Math.min(s.hair, s.curls.filter((t) => t >= 0).length / CURLS.length);
      // and the brows thin out where it passes
      if (q.y > -80 && q.y < -18 && Math.abs(q.x) > 16 && Math.abs(q.x) < 112) {
        const k = q.x < 0 ? 'browL' : 'browR';
        if (s[k] > 0) { s[k] = Math.max(0, s[k] - dt * 1.5); hit = true; }
      }
      return hit;
    },
  },
  {
    id: 'jaw', of: 'chisel', icon: 'roller', name: 'Soft jaw', kind: 'hold',
    does(g, q, dt) { const s = g.s; if (s.jaw <= 0) return false; s.jaw = Math.max(0, s.jaw - dt * 0.7); return true; },
  },
  {
    id: 'slouch', of: 'mew', icon: 'mew', name: 'Slouch', kind: 'hold',
    does(g, q, dt) { const s = g.s; if (s.mew <= 0) return false; s.mew = Math.max(0, s.mew - dt * 0.7); return true; },
  },
];
export const MESS_BY_ID = Object.fromEntries(MESS.map((t) => [t.id, t]));
