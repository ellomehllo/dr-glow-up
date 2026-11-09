// The waiting room: the next few patients sit on a bench through a doorway at the back
// of the clinic (drawn by backdrop.js, in the room's own space) and react to what the
// player does to the patient in the chair: a hurt makes them flinch and sweat, a perfect
// makes them lean in, the finale gets a cheer or a groan. When the player moves on, the
// camera turns to the doorway, the front one gets up and walks to the chair, the rest
// shuffle up a seat and a new patient walks in at the back (callNext).
// They are the real upcoming patients: each waiter holds the setup the game made for them
// (a new random character, their troubles, the leaf in their hair, the worm in their
// ear), and the one called walks into the chair with it (callNext returns it). They are
// drawn with the same drawPatient at 0.4 of the size, without the treatment chair,
// clipped at the bench seat.
import { makeState, tickPatient, drawPatient, react, headY } from './patient.js';
import { easeIO } from './draw.js';

// room coordinates (backdrop.js): the doorway and the bench inside it
export const DOOR = { x: -1050, y: -560, w: 650, h: 1440 }; // opening, down to the floor line
// the waiting room is further back, so its floor sits higher in the picture than the
// clinic's (880): that keeps the bench in view even when the camera is close on the face
export const FLOOR_IN = 640;
export const SEAT_Y = 420; // top of the bench seat
const SEATS = [-525, -730, -935]; // nearest the clinic first
const ENTER_X = -1210; // where a newcomer walks in from (behind the door frame)
const EXIT_X = -260; // where the one called walks out to (behind the frame on the clinic side)
const SCALE = 0.4;
const SIT_Y = 162; // where a seated patient's origin sits: shoulders just above the bench back
const QUEUE = 3;
// a waiting patient's drawing bounds (patient units: any build, hair and lift)
const BX0 = -520, BX1 = 520, BY0 = -600, BY1 = 900;
const SPRITE_MAX = 1.6e6; // cached pictures up to this many pixels; bigger ones draw live

class Waiter {
  constructor(setup, x) {
    this.setup = setup;
    this.s = makeState(setup);
    this.s.noChair = true;
    this.s.mood = -0.2;
    this.x = x; this.tx = x;
    this.lift = 0; // 0 seated .. 1 standing (walking)
    this.walk = 0; // walk cycle time while moving
    this.gone = false;
    this.idleT = 1 + Math.random() * 3;
  }
}

export class WaitingRoom {
  // make(level, avoid): a setup for a new patient, for the level they will probably play
  // (the game re-fits it if the level turns out different), not one of the `avoid` kinds
  constructor(make) { this.make = make; this.list = []; this.cool = {}; }
  kinds() { return this.list.filter((w) => !w.gone).map((w) => w.setup.who.kind); }
  // a full bench of new patients, for the queue behind level n
  fill(n) {
    this.list = [];
    for (let i = 0; i < QUEUE; i++) this.list.push(new Waiter(this.make(n + 1 + i, this.kinds()), SEATS[i]));
  }

  // the queue as it stands (not the one already on the way to the chair)
  get seated() { return this.list.filter((w) => !w.gone && !w.calling && !w.fled); }

  // the waiter at room point p (their head and shoulders), or null
  hitAt(p) {
    for (const w of this.seated) {
      const hy = SIT_Y + headY(w.s) * SCALE - w.lift * 70;
      if (Math.abs(p.x - w.x) < 75 && p.y > hy - 110 && p.y < SEAT_Y + 10) return w; // head (hair too) down to the seat
    }
    return null;
  }
  // something done to them that doesn't hurt much: how they take it
  //   happy (a cucumber to eat, a giggle), annoyed (paint, gel, paste, a poke, a tug),
  //   wet (splashed), dazzled (a bright lamp), sneeze (powder)
  poke(w, how) {
    const s = w.s;
    if (how === 'happy') { react(s, 'happy', 1.4, 'grin'); s.hopV = -260; s.mood = Math.min(1, s.mood + 0.3); }
    else if (how === 'dazzled') { react(s, 'squeeze', 1.4, 'flat'); s.tiltV += 1.6; }
    else if (how === 'sneeze') { react(s, 'squeeze', 0.6, 'o'); s.tiltV -= 2.6; s.sqV += 1.8; }
    else if (how === 'wet') { react(s, 'normal', 1.4, 'flat'); s.sweat = 1; s.mood = Math.max(-1, s.mood - 0.2); }
    else { react(s, 'wide', 1, 'grit'); s.tiltV += (Math.random() < 0.5 ? -1 : 1) * 1.8; s.mood = Math.max(-1, s.mood - 0.25); }
  }
  // a laser hit: they yelp, and run out the back; they won't be back this level
  zap(w) {
    react(w.s, 'squeeze', 2, 'wince');
    w.s.eyeShut = [1.2, 1.2]; w.s.tears = [1, 1]; w.s.sweat = 1; w.s.mood = -1;
    w.s.hopV = -420;
    w.fled = true;
    setTimeout(() => { w.tx = ENTER_X - 260; w.run = true; react(w.s, 'wide', 3, 'o'); }, 350);
    this.react('eye');
  }

  // something happened to the patient in the chair
  react(what) {
    // a rub across the face can hurt many times a second: they flinch once
    const now = performance.now();
    if ((this.cool[what] || 0) > now) return;
    this.cool[what] = now + 800;
    const ws = this.seated;
    ws.forEach((w, i) => {
      const s = w.s, delay = i * 0.08;
      const go = () => {
        switch (what) {
          case 'eye':
          case 'skin':
            // a wince and a nervous sweat; an eye is worse: they all shrink back
            react(s, what === 'eye' ? 'squeeze' : 'normal', what === 'eye' ? 0.9 : 0.6, 'wince');
            s.sweat = 1; s.mood = Math.max(-1, s.mood - (what === 'eye' ? 0.4 : 0.2));
            s.tiltV += (Math.random() < 0.5 ? -1 : 1) * (what === 'eye' ? 2.6 : 1.4);
            break;
          case 'perfect':
            // the front one leans in to see; the others look impressed
            if (i === 0) { s.tiltV += 2.2; react(s, 'normal', 0.9, 'o'); }
            else react(s, 'normal', 0.7, 'o');
            s.mood = Math.min(1, s.mood + 0.12);
            break;
          case 'thrilled':
          case 'pleased':
            react(s, 'happy', 1.4, 'grin'); s.hopV = -(what === 'thrilled' ? 520 : 360); s.sqV += 1.6;
            s.mood = Math.min(1, s.mood + 0.35);
            break;
          case 'meh':
            react(s, 'normal', 1, 'flat');
            break;
          case 'upset':
          case 'furious':
            react(s, 'squeeze', 1, 'grit'); s.sweat = 1; s.mood = Math.max(-1, s.mood - 0.45);
            if (what === 'furious' && i === 0) s.hopV = -300; // half gets up to leave
            break;
        }
      };
      if (delay) setTimeout(go, delay * 1000); else go();
    });
  }

  // the front one walks through to the clinic (their setup is returned: they are the next
  // patient); the rest move up; a new one walks in. n: the level the next patient plays
  callNext(n) {
    const ws = this.seated;
    if (!ws.length) { // everyone ran off: a fresh bench walks in, and the game finds a patient itself
      for (let i = 0; i < QUEUE; i++) { const nw = new Waiter(this.make(n + 1 + i, this.kinds()), ENTER_X - i * 160); nw.tx = SEATS[i]; nw.lift = 1; this.list.push(nw); }
      return null;
    }
    const [first, ...rest] = ws;
    first.tx = EXIT_X; first.calling = true;
    react(first.s, 'happy', 1.2, 'grin'); first.s.mood = 0.6;
    rest.forEach((w, i) => { w.tx = SEATS[i]; });
    // new patients walk in to fill the bench back up (more if some ran off)
    for (let i = rest.length; i < QUEUE; i++) {
      const nw = new Waiter(this.make(n + 1 + i, this.kinds()), ENTER_X - (i - rest.length) * 160);
      nw.tx = SEATS[i];
      nw.lift = 1;
      this.list.push(nw);
    }
    return first.setup;
  }

  update(dt, time) {
    for (const w of this.list) {
      const s = w.s, d = w.tx - w.x, moving = Math.abs(d) > 2;
      if (moving) {
        // stand, then walk (a brisk bob), then sit back down when there
        w.lift = Math.min(1, w.lift + dt * 4);
        if (w.lift > 0.6) { const v = Math.sign(d) * Math.min(Math.abs(d), dt * (w.run ? 1100 : 560)); w.x += v; w.walk += dt * (w.run ? 1.8 : 1); }
      } else {
        w.x = w.tx;
        if (w.calling || w.run) w.gone = true;
        w.lift = Math.max(0, w.lift - dt * 3.5);
      }
      // idle life: look around, at the doorway, at each other; now and then a sigh
      w.idleT -= dt;
      if (w.idleT <= 0 && !moving) {
        w.idleT = 2 + Math.random() * 4;
        const r = Math.random();
        s.lookAt = r < 0.45 ? { x: 160, y: 0 } : r < 0.7 ? { x: -160, y: 20 } : null; // toward the chair, along the bench
        if (Math.random() < 0.15) react(s, 'normal', 1.1, 'flat');
      }
      tickPatient(s, dt, time);
    }
    this.list = this.list.filter((w) => !w.gone);
  }

  // draw inside the room transform, after the waiting room's back wall and before the
  // bench front and the door frame
  draw(ctx, time) {
    // farthest first, so the ones nearer the clinic overlap
    const order = this.list.slice().sort((a, b) => a.x - b.x);
    const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) * SCALE; // device px per patient unit
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const bottom = SEAT_Y + 4;
    this.frame = (this.frame || 0) + 1;
    for (let i = 0; i < order.length; i++) {
      const w = order[i];
      const bob = w.lift > 0 ? Math.abs(Math.sin(w.walk * 9)) * -16 * w.lift : 0;
      const y = SIT_Y - easeIO(w.lift) * 70 + bob;
      // off screen (or outside the doorway): nothing to draw
      const l = Math.max(DOOR.x, w.x + BX0 * SCALE), r = Math.min(DOOR.x + DOOR.w, w.x + BX1 * SCALE);
      const t = Math.max(DOOR.y, y + BY0 * SCALE), btm = Math.min(bottom, y + BY1 * SCALE);
      if (l >= r || t >= btm) continue;
      const p0 = m.transformPoint({ x: l, y: t }), p1 = m.transformPoint({ x: r, y: btm });
      if (Math.max(p0.x, p1.x) < 0 || Math.min(p0.x, p1.x) > cw || Math.max(p0.y, p1.y) < 0 || Math.min(p0.y, p1.y) > ch) continue;
      ctx.save();
      // inside the doorway only (walking in and out passes behind the frame), and always
      // behind the bench: cut at its seat, standing or sitting, so no one shows below it
      ctx.beginPath(); ctx.rect(DOOR.x, DOOR.y, DOOR.w, bottom - DOOR.y); ctx.clip();
      ctx.translate(w.x, y);
      ctx.scale(SCALE, SCALE);
      // small on screen: draw from a cached picture, redrawn a few at a time (each one
      // about 20 times a second) and whenever the zoom has moved on; close up, draw live
      if ((BX1 - BX0) * (BY1 - BY0) * k * k < SPRITE_MAX) this.sprite(ctx, w, time, k, (this.frame + i) % order.length === 0);
      else drawPatient(ctx, w.s, time, null);
      ctx.restore();
    }
  }
  sprite(ctx, w, time, k, turn) {
    let sp = w.sprite;
    // a new one is drawn now; otherwise only on its turn (zoomed since: stretched until then,
    // so a zoom never redraws all of them in the same frame)
    const fresh = !sp;
    if (!sp) sp = w.sprite = { c: document.createElement('canvas'), k: 0 };
    if (fresh || turn) {
      const c = sp.c, pw = Math.ceil((BX1 - BX0) * k), ph = Math.ceil((BY1 - BY0) * k);
      // resizing a canvas is slow (a new buffer): grow with room to spare, shrink only a lot
      if (pw > c.width || ph > c.height || pw < c.width * 0.5) { c.width = Math.ceil(pw * 1.25); c.height = Math.ceil(ph * 1.25); }
      sp.pw = pw; sp.ph = ph;
      const x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      x.setTransform(k, 0, 0, k, -BX0 * k, -BY0 * k);
      x.lineJoin = 'round'; x.lineCap = 'round';
      drawPatient(x, w.s, time, null);
      sp.k = k;
    }
    ctx.drawImage(sp.c, 0, 0, sp.pw, sp.ph, BX0, BY0, BX1 - BX0, BY1 - BY0);
  }
}
