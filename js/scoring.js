import { RANKS, LEVELS } from './config.js';

// Score a release against a sweet zone. Inside the zone: 88-100 by distance from the
// centre. Outside: falls off quickly so a sloppy release is clearly worse.
export function scoreRelease(p, sweet) {
  if (!sweet) return { score: 100, verdict: 'perfect', d: 0 };
  const d = p - sweet.c;
  const ad = Math.abs(d);
  let score, verdict;
  if (ad <= sweet.w) {
    score = 100 - 12 * (ad / sweet.w) ** 2;
    verdict = ad <= sweet.w * 0.35 ? 'perfect' : 'good';
  } else {
    score = Math.max(0, 88 - (ad - sweet.w) * 240);
    verdict = d < 0 ? 'early' : 'late';
  }
  return { score: Math.round(score), verdict, d };
}

export function rankFor(aura) {
  let r = RANKS[0];
  for (const k of RANKS) if (aura >= k.min) r = k;
  const i = RANKS.indexOf(r);
  const next = RANKS[i + 1] || null;
  return { rank: r, next, toNext: next ? next.min - aura : 0 };
}

// Aura points lost for each treatment done out of order (the order is the row of
// treatment badges under the aura). A treatment is in order when it is the first
// unfinished one in that row at the moment it is picked. Wash and glow count too.
export const ORDER_PENALTY = 20;

// a patient's aura: the average treatment score, minus ORDER_PENALTY per treatment done
// out of turn and minus `minus` more (piercings, style.js)
export function auraOf(scores, misses = 0, minus = 0) {
  if (!scores.length) return 0;
  return Math.max(0, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) - misses * ORDER_PENALTY - minus);
}

// saved progress: highest unlocked level (1-based) and the best aura per level.
// The key keeps the game's old name so progress saved before the rename survives.
// Automated ?debug runs save under their own key so they never touch a player's progress.
const DEBUG = new URLSearchParams(location.search).has('debug');
const KEY = DEBUG ? 'marblemaxx.progress.debug' : 'marblemaxx.progress.v2';
const LEVEL_COUNT = LEVELS.length;
export function loadProgress() {
  const fresh = { unlocked: 1, best: Array(LEVEL_COUNT).fill(0) };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!o || typeof o !== 'object') return fresh;
    const unlocked = Math.min(LEVEL_COUNT, Math.max(1, parseInt(o.unlocked, 10) || 1));
    const best = fresh.best.map((_, i) => Math.max(0, Math.min(100, parseInt((o.best || [])[i], 10) || 0)));
    return { unlocked, best };
  } catch { return fresh; }
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ unlocked: p.unlocked, best: p.best })); } catch { /* storage unavailable */ }
}
