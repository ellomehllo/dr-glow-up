// What every treatment tool does when it lands somewhere other than what it is for: the
// patient's hair, nose, mouth, clothes (and, on a free use, bare skin), or the room
// behind them (the doorway glass, the customers waiting through it, the clock, the lamp,
// the sign, the certificate, the shelf bottles, the cabinet, the curtains, the walls and
// the floor). Each tool does what the real object would (TOOL_STUDY.md). Marks on the
// room are cleared every level (Backdrop.fix); marks on the patient stay on them.
// touch(game, id, q, o) is called with the press (or, for a brush, each frame of the
// drag) in head and stage space; it returns true when it did something.
import { onFace, addBald, react } from './patient.js';
import { inMouth } from './extras.js';
import { onBody } from './outfits.js';
import { onHair, mark as skinMark, pinch, dab } from './tools/free.js';
import { rand } from './draw.js';

const onNose = (x, y) => Math.abs(x) < 30 && y > 24 && y < 96;
// tools that hurt whoever they hit: a customer hit with one runs off
const HARSH = new Set(['nose', 'drill', 'iron', 'laser']);
// a brush's own ground (it does its job there, not this)
const OWN = { scrub: ['skin', 'nose'], rasp: ['hair', 'skin', 'nose'], tbrush: ['mouth'], laser: ['hair', 'skin', 'nose', 'mouth'] };
// tools that pop a soap bubble they touch
const POPS = new Set(['pop', 'tweeze', 'pliers', 'drill', 'tbrush', 'gold', 'chisel', 'nose', 'circles', 'iron', 'polish', 'rasp']);

// where press q lands: on the patient (hair, nose, mouth, skin, clothes) or in the room
// (glass, customer, door, clock, lamp, sign, cert, bottleN, curtain, cabinet, wall, floor)
export function placeOf(game, q) {
  const s = game.s;
  if (onHair(q.x, q.y)) return { at: 'hair' };
  if (onFace(q.x, q.y)) return { at: inMouth(q.x, q.y) ? 'mouth' : onNose(q.x, q.y) ? 'nose' : 'skin' };
  if (onBody(s, q.sx, q.sy - s.hop)) return { at: 'clothes', bx: q.sx, by: q.sy - s.hop };
  const b = game.backdrop, sc = game.director.toScreen(q.sx, q.sy), p = b.roomAt(sc.x, sc.y);
  let at = b.thingAt(p);
  let w = null;
  if (at === 'door') { w = game.waiting.hitAt(p); if (w) at = 'customer'; }
  return { at, p, sc, w };
}

export function touch(game, id, q, o = {}) {
  const b = game.backdrop, s = game.s;
  // a soap bubble under the tip pops first
  if (POPS.has(id)) {
    const sc = game.director.toScreen(q.sx, q.sy), bub = b.popBubble(sc.x, sc.y, game.g.time);
    if (bub) { game.fx.ring(q.sx, q.sy, 4, 30, 0.3, '#ffffff', 3); game.fx.burst(q.sx, q.sy, 5, 160, { size: rand(6, 9) }); game.audio.pop(1.8); return true; }
  }
  const P = placeOf(game, q), at = P.at;
  if (OWN[id] && OWN[id].includes(at)) return false;
  if (at === 'mouth' && game.tool && game.tool.def.mouth) return false; // a dental tool in the mouth is at work
  if (at === 'skin' && !game.spare && !o.brush) return false; // a needed tool off its target: the usual hurt
  // a brush leaves a mark every so far, not every frame
  if (o.brush) {
    const key = `${id}:${at}`, last = game.worldLast;
    if (last && last.key === key && Math.hypot(last.x - q.sx, last.y - q.sy) < 26 && id !== 'scrub') return true;
    game.worldLast = { key, x: q.sx, y: q.sy };
  }
  if (at === 'glass' || at === 'customer' || at === 'door') game.lookWindow(); // the camera turns to see
  const W = new Touch(game, q, P);
  const fn = TOOLS[id];
  return fn ? fn(W, at, o) !== false : false;
}

// the small things each effect is made of
class Touch {
  constructor(game, q, P) { this.g = game; this.q = q; this.P = P; this.s = game.s; }
  say(t, col = '#ffffff', size = 24) { this.g.fx.text(this.q.sx, this.q.sy - 36, t, col, size, 0.9); }
  sparkle(col = '#ffffff', n = 4) { for (let k = 0; k < n; k++) this.g.fx.spark(this.q.sx + rand(-14, 14), this.q.sy + rand(-14, 14), { size: rand(7, 11), col, vy: -50, life: 0.45 }); }
  puff(col = '255,255,255', n = 2) { this.g.fx.puff(this.q.sx, this.q.sy, n, col); }
  ring(col = '#ffffff') { this.g.fx.ring(this.q.sx, this.q.sy, 4, 30, 0.3, col, 4); }
  face(expr, d, mouth) { react(this.s, expr, d, mouth); }
  // a mark on the room at the press
  room(kind, o = {}) { return this.g.backdrop.mark(this.P.p, kind, o); }
  // a stain on the clothes at the press
  stain(kind, o = {}) {
    const st = this.s.stains;
    st.push({ x: this.P.bx, y: this.P.by, kind, col: o.col || null, r: o.r || 18, rot: rand(-0.6, 0.6) });
    if (st.length > 30) st.shift();
  }
  hair(kind) {
    const h = this.s.hairFx;
    h.push({ x: this.q.x, y: this.q.y, kind, rot: rand(-0.7, 0.7), t: 0 });
    if (h.length > 24) h.shift();
  }
  smear(kind, col, r = 14) {
    const m = this.s.smears;
    m.push({ x: this.q.x, y: this.q.y, kind, col, r, rot: rand(-0.6, 0.6) });
    if (m.length > 20) m.shift();
  }
  // a customer (glass gone): harsh tools send them running, the rest get a reaction
  customer(id, how, text) {
    const w = this.P.w;
    if (!w) return false;
    if (HARSH.has(id)) { this.g.waiting.zap(w); this.say('OUCH!', '#ff7d9a', 28); this.g.audio.nick(); this.face('wide', 1.2, 'o'); return true; }
    this.g.waiting.poke(w, how);
    if (text) this.say(text);
    this.g.audio.tick();
    return true;
  }
  // the room's things
  knockClock(stop) {
    const T = this.g.backdrop.things;
    T.clockTilt = Math.max(-0.5, Math.min(0.5, T.clockTilt + rand(-0.25, 0.25) || 0.2));
    if (stop && T.clockStop === null) T.clockStop = this.g.g.time;
    this.g.audio.tink(0.6);
  }
  smashLamp() {
    const T = this.g.backdrop.things;
    if (T.lampOut) return false;
    T.lampOut = true;
    this.g.fx.burst(this.q.sx, this.q.sy, 10, 380, { size: rand(8, 12), col: '#e8f8ff' });
    this.say('POP!', '#fff3a6', 28);
    this.g.audio.nick(); this.g.director.shake(0.01);
    this.g.waiting.react('skin');
    return true;
  }
  bottle(dir = 1) {
    const i = +this.P.at.slice(6);
    if (!this.g.backdrop.knockBottle(i, dir)) return false;
    this.g.audio.boing(1.2);
    this.say('OOPS!');
    return true;
  }
  tilt(which) { const T = this.g.backdrop.things; T[which] = Math.max(-0.3, Math.min(0.3, T[which] + rand(-0.18, 0.18))); this.g.audio.tink(0.7); }
}

const surface = (at) => at === 'wall' || at === 'cabinet' || at === 'floor' || at === 'sign' || at === 'cert' || at === 'clock' || at === 'lamp' || at === 'curtain' || at === 'door' || at.startsWith('bottle');
const wet = (at) => at === 'glass' || surface(at);

// ---------- each tool ----------
const TOOLS = {
  // the soapy sponge: wipes marks off the glass and the walls (squeaky clean), foams the
  // hair, soaps the mouth, soaks the clothes, splashes the customers; bubbles as it goes
  scrub(W, at) {
    const g = W.g;
    if (Math.random() < 0.12) g.fx.spark(W.q.sx + rand(-20, 20), W.q.sy - 10, { size: rand(10, 16), col: 'rgba(255,255,255,0.9)', vy: -90, life: 0.9 });
    if (at === 'hair') { if (Math.random() < 0.15) W.hair('foam'); return; }
    if (at === 'mouth') { if (Math.random() < 0.05) { W.say('BLEH!'); W.face('squeeze', 0.8, 'grit'); } return; }
    if (at === 'clothes') { if (Math.random() < 0.08) W.stain('wet', { r: 26 }); return; }
    if (at === 'customer') { if (Math.random() < 0.08) W.customer('scrub', 'wet', 'SPLASH!'); return; }
    if (wet(at) && W.P.p) { if (g.backdrop.wipe(W.P.p, 50)) { W.sparkle('#ffffff', 3); g.audio.tink(2); } return; }
    return false;
  },
  // two fingers: a pinch on skin, a honk on the nose, a tug on the hair, a poke on the
  // clothes; a knock on the glass, the clock nudged, a bottle flicked off the shelf
  pop(W, at) {
    if (at === 'skin') { pinch(W.g.g, W.q); return; }
    if (at === 'nose') { W.say('HONK!', '#ffc93c', 28); W.face('wide', 0.8, 'o'); W.g.audio.boing(1.7); W.s.sqV += 1.2; return; }
    if (at === 'hair') { W.say('OW!'); W.face('squeeze', 0.5, 'wince'); W.g.audio.tink(1.4); return; }
    if (at === 'mouth') { W.face('wide', 0.6, 'o'); W.say('MMF!'); return; }
    if (at === 'clothes') { W.say('HEY!'); W.face('wide', 0.6, 'o'); W.g.audio.tick(); return; }
    if (at === 'glass') { W.ring('#d8f4ff'); W.g.audio.tink(1.1); W.g.waiting.react('perfect'); return; }
    if (at === 'customer') return W.customer('pop', 'annoyed', 'HEY!');
    if (at === 'clock') { W.knockClock(false); return; }
    if (at.startsWith('bottle')) return W.bottle(1);
    if (at === 'sign' || at === 'cert') { W.tilt(at === 'sign' ? 'signTilt' : 'certTilt'); return; }
    W.g.audio.tick(); return;
  },
  // the jade roller: soothing on skin, tangles hair, lint-rolls the clothes, smudges glass
  chisel(W, at) {
    if (at === 'skin') { dab(W.g.g, W.q, '#7ee0b8'); return; }
    if (at === 'hair') { W.hair('tangle'); W.say('TANGLED!'); W.face('squeeze', 0.6, 'wince'); return; }
    if (at === 'clothes') { W.sparkle('#7ee0b8', 5); W.say('LINT FREE!'); W.g.audio.tick(); return; }
    if (at === 'glass') { W.room('smudge', { r: 30 }); W.g.audio.tick(); return; }
    if (at === 'customer') return W.customer('chisel', 'happy', 'HEE!');
    return false;
  },
  // the dye brush: paint wherever it goes
  rasp(W, at) {
    const col = W.s.who.hair;
    if (at === 'clothes') { W.stain('paint', { col, r: 14 }); return; }
    if (at === 'customer') return W.customer('rasp', 'annoyed', 'MY SHIRT!');
    if (wet(at)) { W.room('paint', { col, r: 16 }); return; }
    return false;
  },
  // the gel tube: slicks the hair, a blob on clothes, glass and walls that runs
  gold(W, at) {
    if (at === 'hair') { W.hair('gel'); W.hair('shine'); W.say('SLICK!'); W.g.audio.drip(); return; }
    if (at === 'mouth') { W.say('YUCK!'); W.face('squeeze', 0.8, 'grit'); return; }
    if (at === 'nose') { W.smear('gel', 'rgba(63,224,181,0.6)', 10); W.face('wide', 0.6, 'o'); return; }
    if (at === 'clothes') { W.stain('gel'); W.g.audio.drip(); return; }
    if (at === 'customer') return W.customer('gold', 'annoyed', 'EWW!');
    if (wet(at)) { W.room('gel', { r: 18 }); W.g.audio.drip(); return; }
    return false;
  },
  // the powder puff: a cloud and a white print wherever it pats
  polish(W, at) {
    W.puff('255,240,248', 3);
    if (at === 'hair') { W.hair('powder'); return; }
    if (at === 'mouth' || at === 'nose') { W.say('ACHOO!'); W.face('squeeze', 0.7, 'o'); W.s.tiltV -= 2.5; return; }
    if (at === 'clothes') { W.stain('powder', { r: 22 }); return; }
    if (at === 'customer') return W.customer('polish', 'sneeze', 'ACHOO!');
    if (wet(at)) { W.room('powder', { r: 26 }); return; }
    return;
  },
  // the mallet: a lump on the head, a tooth knocked out, an "oof"; the clock knocked and
  // stopped, the lamp smashed, bottles knocked off, frames crooked, dents in the walls
  nose(W, at) {
    const g = W.g;
    g.director.bump(0.4);
    if (at === 'hair') { W.hair('lump'); W.say('BONK!', '#ffc93c', 28); W.face('squeeze', 1, 'wince'); W.s.pain += 0.6; g.audio.boing(0.7); return; }
    if (at === 'mouth') {
      const d = W.s.dent, k = d.findIndex((t, i) => !t.gone && i < 6);
      if (k >= 0) { d[k].gone = true; g.fx.burst(W.q.sx, W.q.sy, 4, 300, { size: 10, col: '#ffffff' }); }
      W.say('MY TOOTH!', '#ff7d9a', 26); W.face('squeeze', 1.4, 'grit'); W.s.pain += 1; g.audio.nick();
      return;
    }
    if (at === 'clothes') { W.say('OOF!'); W.face('squeeze', 0.8, 'o'); W.s.sqV += 2; g.audio.boing(0.6); return; }
    if (at === 'customer') return W.customer('nose');
    if (at === 'clock') { W.knockClock(true); W.say('CLONK!'); return; }
    if (at === 'lamp') { if (!W.smashLamp()) g.audio.tink(0.5); return; }
    if (at.startsWith('bottle')) return W.bottle(rand(-1, 1) < 0 ? -1 : 1);
    if (at === 'sign' || at === 'cert') { W.tilt(at === 'sign' ? 'signTilt' : 'certTilt'); W.say('CLONK!'); return; }
    if (at === 'wall' || at === 'cabinet' || at === 'door') { W.room('dent', { r: 20 }); W.say('THUD!'); g.audio.boing(0.5); g.director.shake(0.006); return; }
    if (at === 'floor') { W.say('THUD!'); g.audio.boing(0.4); return; }
    return false;
  },
  // the cucumber slice: they eat it; it sticks in the hair, on the glass (and slides
  // down), on the walls; a wet green spot on the clothes
  circles(W, at) {
    if (at === 'mouth') { W.say('MUNCH!', '#7fe0a0', 26); W.face('happy', 1.2, 'grin'); W.s.mood = Math.min(1, W.s.mood + 0.15); W.g.audio.pop(0.9); return; }
    if (at === 'hair') { W.hair('slice'); W.g.audio.tick(); return; }
    if (at === 'nose') { dab(W.g.g, W.q, '#c4ef94'); return; }
    if (at === 'clothes') { W.stain('green', { r: 20 }); return; }
    if (at === 'customer') return W.customer('circles', 'happy', 'YUM!');
    if (wet(at)) { W.room('slice', { r: 22 }); W.g.audio.drip(); return; }
    return false;
  },
  // the whitening lamp: sunburn on skin, a warm shine on hair, bleached clothes; glare
  // off the glass dazzles the customers
  teeth(W, at) {
    if (at === 'skin' || at === 'nose') { skinMark(W.g.g, W.q, 'rash', 'TOASTY!'); return; }
    if (at === 'hair') { W.hair('shine'); W.sparkle('#fff3a6', 4); return; }
    if (at === 'clothes') { W.stain('bleach', { r: 26 }); W.say('FADED!'); return; }
    if (at === 'glass') { W.g.fx.burst(W.q.sx, W.q.sy, 10, 300, { size: rand(10, 14), col: '#ffffff' }); W.say('GLARE!'); for (const w of W.g.waiting.seated) W.g.waiting.poke(w, 'dazzled'); return; }
    if (at === 'customer') return W.customer('teeth', 'dazzled', 'TOO BRIGHT!');
    return false;
  },
  // the hot iron: burns skin, straightens hair (sizzle), presses clothes crisp (press the
  // same spot again and it scorches), fogs the glass, presses then scorches the curtains
  iron(W, at) {
    W.puff('255,255,255', 2);
    if (at === 'hair') { W.hair('shine'); W.say('SIZZLE!', '#ffb36b'); W.face('wide', 0.7, 'o'); W.g.audio.nick(); return; }
    if (at === 'mouth' || at === 'nose') { skinMark(W.g.g, W.q, 'burn', 'HOT!'); return; }
    if (at === 'clothes') {
      const st = W.s.stains, near = st.find((m) => m.kind === 'pressed' && Math.hypot(m.x - W.P.bx, m.y - W.P.by) < 40);
      if (near) { near.kind = 'scorch'; near.r = 30; W.say('SCORCHED!', '#ffb36b'); W.puff('120,110,120', 3); W.face('wide', 1, 'o'); W.g.audio.nick(); }
      else { W.stain('pressed'); W.sparkle('#ffffff', 5); W.say('CRISP!'); W.g.audio.tick(); }
      return;
    }
    if (at === 'glass') { W.room('fog', { r: 30 }); return; }
    if (at === 'customer') return W.customer('iron');
    if (at === 'curtain') {
      const near = W.g.backdrop.markNear(W.P.p, 'pressed', 60);
      if (near) { near.kind = 'scorch'; near.r = 34; W.say('SCORCHED!', '#ffb36b'); W.puff('120,110,120', 3); }
      else { W.room('pressed'); W.sparkle('#ffffff', 5); W.say('CRISP!'); }
      return;
    }
    if (surface(at)) { W.g.audio.tick(); return; }
    return false;
  },
  // tweezers: hair and brows (free.js), a pinch of skin; a loose thread out of the
  // clothes or the curtains; a hair plucked off a customer
  tweeze(W, at) {
    if (at === 'clothes') { W.stain('thread'); W.say('THREAD!'); W.g.audio.tick(); return; }
    if (at === 'nose') { W.say('ACHOO!'); W.face('squeeze', 0.7, 'o'); W.s.tiltV -= 2; return; }
    if (at === 'customer') return W.customer('tweeze', 'annoyed', 'OW!');
    if (at === 'curtain') { W.say('THREAD!'); W.g.audio.tick(); return; }
    return false;
  },
  // the toothbrush and paste: paste smeared wherever it rubs
  tbrush(W, at) {
    if (at === 'skin' || at === 'nose') { W.smear('paste', 'rgba(255,255,255,0.92)', 12); return; }
    if (at === 'hair') { W.hair('paste'); return; }
    if (at === 'clothes') { W.stain('paste', { r: 14 }); return; }
    if (at === 'customer') return W.customer('tbrush', 'annoyed', 'MINTY!');
    if (wet(at)) { W.room('paste', { r: 14 }); return; }
    return false;
  },
  // the drill: winds hair into a tangle, a hole through the clothes; on the glass a
  // drilled hole that cracks it (toward breaking it), holes in walls; the clock stops, the
  // lamp smashes
  drill(W, at) {
    const g = W.g;
    if (at === 'hair') { W.hair('tangle'); W.say('YANK!', '#ff7d9a'); W.face('squeeze', 1, 'wince'); W.s.pain += 0.4; g.audio.nick(); return; }
    if (at === 'nose') { skinMark(g.g, W.q, 'rash', 'BZZT!'); return; }
    if (at === 'clothes') { W.stain('hole', { r: 12 }); W.say('RIP!'); g.audio.nick(); return; }
    if (at === 'glass') { W.room('hole', { r: 14 }); g.smash(W.q); return; }
    if (at === 'customer') return W.customer('drill');
    if (at === 'clock') { W.knockClock(true); W.room('hole', { r: 10 }); return; }
    if (at === 'lamp') { if (!W.smashLamp()) g.audio.tink(0.5); return; }
    if (at.startsWith('bottle')) { W.room('hole', { r: 8 }); W.room('gel', { r: 10 }); W.say('LEAK!'); return; }
    if (surface(at)) { W.room('hole', { r: 14 }); W.puff('230,230,230', 2); g.audio.nick(); return; }
    return false;
  },
  // the pliers: twist the nose, yank hair out, tug the clothes; pick a bottle off the
  // shelf and drop it, bend the clock's hand, scratch the glass
  pliers(W, at) {
    const g = W.g;
    if (at === 'nose') { W.say('HONK!', '#ffc93c', 28); W.face('squeeze', 1, 'wince'); W.s.tiltV += 2.5; g.audio.boing(1.5); return; }
    if (at === 'hair') { addBald(W.s, W.q.x, W.q.y, 18, 'pluck'); W.say('YANK!', '#ff7d9a'); W.face('squeeze', 1, 'wince'); W.s.pain += 0.4; g.audio.pop(1.4); return; }
    if (at === 'clothes') { W.stain('thread'); W.say('HEY!'); W.face('wide', 0.6, 'o'); return; }
    if (at === 'glass') { W.room('scratch', { r: 30 }); g.audio.tink(2.2); return; }
    if (at === 'customer') return W.customer('pliers', 'annoyed', 'OW!');
    if (at === 'clock') { W.knockClock(true); W.say('BENT!'); return; }
    if (at.startsWith('bottle')) return W.bottle(-1);
    return false;
  },
  // the laser (a brush, steady): scorch marks, a burnt hole in the curtains and clothes,
  // the lamp's bulb popped. o.hot: it has rested long enough to burn.
  laser(W, at, o) {
    if (!o.hot) return true;
    if (at === 'clothes') { W.stain('burn', { r: 14 }); W.puff('120,110,120', 2); W.face('wide', 1, 'o'); W.say('MY SHIRT!', '#ffb36b'); W.g.audio.nick(); return; }
    if (at === 'lamp') { W.smashLamp(); return; }
    if (at === 'curtain') { W.room('burnhole', { r: 26 }); W.puff('90,80,90', 5); W.say('FIRE!', '#ff7d4a', 28); W.g.audio.nick(); W.g.waiting.react('skin'); return; }
    if (surface(at)) { W.room('scorch', { r: 16 }); W.puff('120,110,120', 2); W.g.audio.nick(); return; }
    return false;
  },
};
