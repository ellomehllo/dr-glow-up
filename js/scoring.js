import { RANKS } from './config.js';

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

export function auraOf(scores) {
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// saved progress: highest unlocked level (1-based) and the best aura per level.
// The key keeps the game's old name so progress saved before the rename survives.
// Automated ?debug runs save under their own key so they never touch a player's progress.
const DEBUG = new URLSearchParams(location.search).has('debug');
const KEY = DEBUG ? 'marblemaxx.progress.debug' : 'marblemaxx.progress.v2';
const LEVEL_COUNT = 5;
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
