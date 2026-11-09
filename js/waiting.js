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
import { makeState, tickPatient, drawPatient, react } from './patient.js';
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
  get seated() { return this.list.filter((w) => !w.gone && !w.calling); }

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
    if (!ws.length) return null;
    const [first, ...rest] = ws;
    first.tx = EXIT_X; first.calling = true;
    react(first.s, 'happy', 1.2, 'grin'); first.s.mood = 0.6;
    rest.forEach((w, i) => { w.tx = SEATS[i]; });
    const nw = new Waiter(this.make(n + QUEUE, this.kinds()), ENTER_X);
    nw.tx = SEATS[QUEUE - 1];
    nw.lift = 1;
    this.list.push(nw);
    return first.setup;
  }

  update(dt, time) {
    for (const w of this.list) {
      const s = w.s, d = w.tx - w.x, moving = Math.abs(d) > 2;
      if (moving) {
        // stand, then walk (a brisk bob), then sit back down when there
        w.lift = Math.min(1, w.lift + dt * 4);
        if (w.lift > 0.6) { const v = Math.sign(d) * Math.min(Math.abs(d), dt * 560); w.x += v; w.walk += dt; }
      } else {
        w.x = w.tx;
        if (w.calling) w.gone = true;
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
    for (const w of order) {
      const bob = w.lift > 0 ? Math.abs(Math.sin(w.walk * 9)) * -16 * w.lift : 0;
      const y = SIT_Y - easeIO(w.lift) * 70 + bob;
      ctx.save();
      // inside the doorway only (walking in and out passes behind the frame); seated,
      // cut at the bench seat; standing, a little lower
      const bottom = SEAT_Y + 4 + w.lift * 120;
      ctx.beginPath(); ctx.rect(DOOR.x, DOOR.y, DOOR.w, bottom - DOOR.y); ctx.clip();
      ctx.translate(w.x, y);
      ctx.scale(SCALE, SCALE);
      drawPatient(ctx, w.s, time, null);
      ctx.restore();
    }
  }
}
