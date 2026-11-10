// Multiplayer, start to finish (MULTIPLAYER_PLAN.md): the people button opens it (first
// time: pick a @username); from there a friend's room or anyone who is searching.
//   A room (2 to 4 players): the host makes it and sends the code or link; whoever opens it
//   is in the room at once, by name. Everyone presses Ready; then the game: 90 seconds for
//   each to make a character, then the characters go round, one round of 90 seconds per
//   other player (2 players: 1 round, 3: 2, 4: 3), the reveal of them all, back to the room.
//   Anyone: the character you bring (made beforehand), who you got (skip or ready), the
//   90 second turn, the reveal.
// During a turn a small window shows yours as they change it. Single player is the game as
// it always was: leaving multiplayer goes back to it.
// The database (mp.js) decides everything that counts; the live channel (live.js) only
// carries the character being worked on, for the window, and pokes to check the match now.
import { Mp, roomLink, cleanCode } from './mp.js';
import { Live } from './live.js';
import { Lobby, noteFor, REACT_LABEL, at } from './lobby.js';
import { Creator } from './creator.js';
import { lookText, validLook } from './look.js';

const SENT = 'drglowup.mp.sent'; // which creator character the server has (so it goes up once)
const POLL = 1.6; // seconds between checks while waiting on the other player or the queue
const SEND = 0.33; // seconds between live looks during a turn
const GRACE = 11; // seconds after the bell before handing in my own character for a partner who left
const MAKE_GRACE = 36; // seconds after making time before giving up on a partner who never handed theirs in

const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) | 0; return String(h >>> 0); };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Multi {
  constructor(game, cloud, root) {
    this.game = game;
    game.multi = this;
    this.cloud = cloud;
    this.mp = new Mp(cloud);
    this.lobby = new Lobby(root, (a, v) => this.act(a, v));
    this.lobby.showButton(this.mp.on);
    this.on = false;
    this.phase = null; // home | room | join | search | match | note | name | history | creator
    this.epoch = 0; // bumps on every phase change: late answers for an old phase are dropped
    this.me = null;
    this.match = null; // the last view of the match
    this.how = null; // how we got the match: 'room' | 'anyone'
    this.code = null;
    this.live = null;
    this.poll = 0; this.polling = false;
    this.turn = null; this.shown = null; this.handedIn = false; this.fellBack = false;
    this.theirLive = null; this.sendT = 0; this.lastSent = '';
    this.below = () => this.lobby.height();
    // waiting, searching and checking the match run on a timer, not the game's frames: they
    // keep going in a hidden tab (a host off sending the link, say)
    this.nextCheck = 0;
    setInterval(() => this.pump(), 250);
  }
  get available() { return this.mp.on; }

  // ---------- coming and going ----------
  // o.code: into that room straight away (an invite link); o.search: play with anyone
  async open(o = {}) {
    if (!this.mp.on) return;
    this.game.closeMenu();
    this.on = true;
    this.game.showLook(null, this.below);
    this.setPhase('home');
    this.lobby.show('home', { busy: true, say: 'Getting ready...' });
    this.game.frameLook(true);
    if (!(await this.prepare())) return;
    const go = o.code ? { code: o.code } : o.search ? { search: true } : null;
    if (!this.me.named) this.nameScreen(go); // first time: their name before anything else
    else this.go(go);
  }
  // where open() was headed: a room, the search, or the multiplayer home
  go(to) {
    if (to && to.code) this.joinCode(to.code);
    else if (to && to.search) this.search();
    else this.home();
  }
  // who I am, and the character made on this device up on the server (once per creator save)
  async prepare() {
    const local = Creator.saved();
    const ep = this.epoch;
    try {
      let me = await this.mp.me();
      if (local) {
        const sig = hash(lookText(local.look));
        let sent = null;
        try { sent = localStorage.getItem(SENT); } catch { /* no storage */ }
        if (!me.has_character || sent !== sig) {
          await this.mp.save(local.look);
          try { localStorage.setItem(SENT, sig); } catch { /* no storage */ }
          me = await this.mp.me();
        }
      }
      if (ep !== this.epoch) return false;
      this.me = me;
      this.seated = null;
      this.sit(this.myLook(), `me:${this.me ? this.me.gen : ''}`);
      return true;
    } catch {
      if (ep === this.epoch) this.note('Could not reach the game. Check your connection and try again.', { act: 'retry', label: 'TRY AGAIN', icon: 'again', back: 'leave' });
      return false;
    }
  }
  // the creator closed (multiplayer sent the player there, outside a match)
  fromCreator(saved) {
    const search = this.toSearch;
    this.toSearch = false;
    this.open(saved && search ? { search: true } : {});
  }
  // back to single player
  leave() {
    this.drop();
    this.on = false;
    this.lobby.hide();
    this.game.belowFn = null;
    this.game.setLive(null);
    if (this.game.menuWanted) this.game.toMenu(); else this.game.startLevel(this.game.level);
  }
  // let go of whatever we were in (room, queue, match)
  drop() {
    const { phase, code, match } = this;
    if (phase === 'search') this.mp.leave().catch(() => {});
    if (match && match.state !== 'over') this.api.end(match.id).catch(() => {});
    if (code) this.mp.roomLeave(code).catch(() => {});
    this.closeMatch();
    this.code = null; this.room = null;
  }
  closeMatch() {
    if (this.live) { this.live.close(); this.live = null; }
    this.match = null; this.turn = null; this.shown = null; this.handedIn = false; this.fellBack = false; this.theirLive = null;
    this.making = null; this.madeIn = false;
    if (this.game.creator && this.game.creator.on && this.game.creator.timed) { // making time cut short (they left)
      this.game.creator.dismiss();
      this.game.showLook(null, this.below);
    }
    this.game.setLive(null);
  }
  // the character I bring: as it is on the server (maybe as my last partner left it), else as made
  myLook() {
    if (this.me && this.me.look) return this.me.look;
    const sv = Creator.saved();
    return sv ? sv.look : null;
  }
  // put a character in the chair (tag: whose, so the same one isn't seated twice)
  sit(look, tag) {
    if (!look || (this.seated === tag && this.game.mode === 'lobby')) return;
    this.seated = tag;
    this.game.showLook(look, this.below);
  }
  // the calls for what we're in: a room game (mp_game_*) or a one-on-one match (mp_*)
  get api() {
    const mp = this.mp;
    return this.match && this.match.game
      ? { state: (id) => mp.gameState(id), submit: (id, l, m) => mp.gameSubmit(id, l, m), react: (id, k) => mp.gameReact(id, k), end: (id) => mp.gameEnd(id) }
      : { state: (id) => mp.state(id), submit: (id, l, m) => mp.submit(id, l, m), react: (id, k) => mp.react(id, k), end: (id) => mp.end(id) };
  }
  setPhase(p) { this.phase = p; this.epoch++; this.poll = 0; this.since = performance.now(); }

  // ---------- screens ----------
  home(say = '') {
    this.drop();
    this.setPhase('home');
    this.sit(this.myLook(), `me:${this.me ? this.me.gen : ''}`);
    this.showHome(say);
    // what I bring and how my work went may have changed (a match just ended)
    const ep = this.epoch;
    this.mp.me().then((me) => {
      if (ep !== this.epoch || !me) return;
      this.me = me;
      this.sit(this.myLook(), `me:${me.gen}`);
      this.showHome(say);
    }, () => {});
  }
  showHome(say = '') {
    const me = this.me || {};
    this.lobby.show('home', { name: me.name, gen: me.gen || 0, got: me.got, say });
    this.game.frameLook();
  }
  // ---------- naming: a username, typed (shown as @name) ----------
  // then: where to go after saving (open()'s), or null for the multiplayer home
  nameScreen(then = null) {
    this.setPhase('name');
    this.afterName = then;
    this.lobby.show('name', { name: (this.me && this.me.name) || '', back: then ? 'leave' : 'home' });
    this.game.frameLook();
  }
  async nameSave(value) {
    const ep = this.epoch;
    this.lobby.say('Saving...');
    try {
      const r = await this.mp.setName(value);
      if (ep !== this.epoch) return;
      if (this.me) { this.me.name = r.name; this.me.named = true; }
      const then = this.afterName;
      this.afterName = null;
      if (then) this.go(then); else this.home(`You are now ${at(r.name)}.`);
    } catch (e) {
      if (ep === this.epoch) this.lobby.show('name', { name: value, back: this.afterName ? 'leave' : 'home', bad: true, say: noteFor(e.msg, 'Could not save the name. Try again.') });
    }
  }
  // my character's history, one version at a time in the chair
  async history() {
    this.setPhase('history');
    const ep = this.epoch;
    this.lobby.show('history', { i: 0, n: 1, item: {} });
    try {
      const list = await this.mp.history();
      if (ep !== this.epoch) return;
      this.hist = list;
      this.histAt(0);
    } catch { if (ep === this.epoch) this.home('Could not load the history. Try again.'); }
  }
  histAt(i) {
    const list = this.hist || [];
    if (!list.length) return;
    i = Math.max(0, Math.min(list.length - 1, i));
    this.histI = i;
    this.sit(list[i].look, `hist:${i}`);
    this.lobby.show('history', { i, n: list.length, item: list[i] });
    this.game.frameLook();
  }
  note(say, o = {}) {
    this.setPhase('note');
    this.lobby.show('note', { say, ...o });
    this.game.frameLook();
  }
  // ---------- a friend's room ----------
  async invite() {
    this.drop();
    this.setPhase('room');
    const ep = this.epoch;
    this.lobby.show('room', {});
    this.game.frameLook();
    try {
      const r = await this.mp.roomCreate();
      if (ep !== this.epoch) { this.mp.roomLeave(r.code).catch(() => {}); return; }
      this.code = r.code;
      this.setRoom(r);
    } catch (e) {
      if (ep === this.epoch) this.home(e.msg === 'too many rooms' ? 'Too many rooms for now. Try again later.' : 'Could not make a room. Try again.');
    }
  }
  async joinCode(code) {
    code = cleanCode(code);
    this.drop();
    this.setPhase('join');
    const ep = this.epoch;
    if (code.length !== 6) { this.lobby.show('join', { code }); this.game.frameLook(); return; }
    this.lobby.show('join', { code, say: 'Joining...' });
    this.game.frameLook();
    try {
      const r = await this.mp.roomEnter(code);
      if (ep !== this.epoch) return;
      this.code = r.code;
      this.setPhase('room');
      this.setRoom(r);
    } catch (e) {
      if (ep === this.epoch) this.lobby.show('join', { code, say: noteFor(e.msg, 'Could not join. Check your connection and try again.'), bad: true });
    }
  }
  // the room as it is now: who is in, who is ready; once both were, the match
  setRoom(r, say = '') {
    if (!r || this.phase !== 'room') return;
    if (r.game) { this.enter(r.game, 'room'); return; }
    const old = this.room;
    this.room = r;
    const key = (x) => (x ? JSON.stringify(x.players) : '');
    if (say || !old || key(old) !== key(r) || this.lobby.screen !== 'room') this.showRoom(false, say);
  }
  showRoom(copied = false, say = '') {
    this.sit(this.myLook(), `me:${this.me ? this.me.gen : ''}`);
    this.lobby.show('room', { code: this.code, room: this.room, role: this.room && this.room.role, canShare: !!navigator.share, copied, say });
    this.game.frameLook();
  }
  // back to the room after a match there (the match ends for both)
  backToRoom(say = '') {
    const m = this.match;
    if (m && m.state !== 'over') this.api.end(m.id).catch(() => {});
    if (this.live) this.live.send('poke');
    this.closeMatch();
    if (!this.code) { this.home(say); return; }
    this.setPhase('room');
    this.room = null;
    this.lobby.show('room', { code: this.code, say: say || 'Back in the room...' });
    this.game.frameLook();
  }
  async roomReady(ready) {
    const ep = this.epoch;
    try {
      const r = await this.mp.roomReady(this.code, ready);
      if (ep === this.epoch) this.setRoom(r);
    } catch { if (ep === this.epoch) this.poll = 0; }
  }
  search(say = '') {
    if (this.me && !this.me.has_character && !Creator.saved()) { // anyone needs a character to bring: make one first
      this.drop(); this.setPhase('creator'); this.lobby.hide(); this.toSearch = true;
      this.game.afterCreator = 'mp'; this.game.openCreator();
      return;
    }
    this.drop();
    this.setPhase('search');
    this.sit(this.myLook(), `me:${this.me ? this.me.gen : ''}`);
    this.searchSay = say;
    this.lobby.show('search', { say: say || 'Looking for someone to play with...' });
    this.game.frameLook();
  }

  // every button on the sheet
  act(a, v) {
    switch (a) {
      case 'open': this.open(); break;
      case 'leave': this.leave(); break;
      case 'retry': this.open(); break;
      case 'home': this.home(); break;
      case 'history': this.history(); break;
      case 'name': this.nameScreen(); break;
      case 'name-save': this.nameSave(v); break;
      case 'hist': this.histAt(this.histI + (v === 'older' ? 1 : -1)); break;
      case 'see': this.see(v); break;
      case 'react': this.call((id) => this.api.react(id, v)); break;
      case 'invite': this.invite(); break;
      case 'join': this.drop(); this.setPhase('join'); this.lobby.show('join', {}); this.game.frameLook(); break;
      case 'join-code': this.joinCode(v); break;
      case 'search': this.search(); break;
      case 'leave-room': this.home(); break;
      case 'ready-room': this.roomReady(true); break;
      case 'unready': this.roomReady(false); break;
      case 'room-again': this.backToRoom(); break;
      case 'cancel-search': this.home(); break;
      case 'edit': this.drop(); this.setPhase('creator'); this.lobby.hide(); this.game.afterCreator = 'mp'; this.game.openCreator(); break;
      case 'copy': this.copy(); break;
      case 'share': navigator.share({ title: 'Dr. Glow Up', text: `Play Dr. Glow Up with me! Room code ${this.code}`, url: roomLink(this.code) }).catch(() => {}); break;
      case 'skip': this.skip(); break;
      case 'ready': this.call((id) => this.mp.ready(id)); break;
      case 'again': this.call((id) => this.mp.again(id)); break;
      case 'next': { const how = this.how; this.drop(); if (how === 'anyone') this.search(); else this.home(); break; }
      default: break;
    }
  }
  copy() {
    const link = roomLink(this.code);
    const done = () => this.showRoom(true);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => this.lobby.say(link));
    else this.lobby.say(link);
  }
  async skip() {
    const m = this.match, how = this.how;
    if (!m) return;
    this.closeMatch();
    try { await this.mp.skip(m.id); } catch { /* it ends on its own */ }
    if (how === 'anyone') this.search('Skipped. Looking for someone else...');
    else this.home('You skipped. Invite someone else, or play with anyone.');
  }
  // a change to the match: tell the other player to look now
  async call(fn) {
    const m = this.match;
    if (!m) return;
    const ep = this.epoch;
    try {
      const v = await fn(m.id);
      if (this.live) this.live.send('poke');
      if (ep === this.epoch) this.setView(v);
    } catch { if (ep === this.epoch) this.poll = 0; }
  }

  // ---------- the match ----------
  enter(v, how) {
    this.closeMatch();
    this.setPhase('match');
    this.how = how;
    this.live = new Live(this.cloud.session && this.cloud.session.access_token, (ev, p) => this.onLive(ev, p));
    this.live.open(v.id);
    this.setView(v);
    this.live.send('poke');
  }
  onLive(ev, p) {
    const m = this.match;
    if (ev === 'look' && p && validLook(p.look) && !(m && m.game && p.of !== m.seat)) { // in a room game: only looks of my character
      this.theirLive = p.look;
      if (this.game.salon && !this.game.salon.over) this.game.setLive(p.look);
    } else if (ev === 'poke' || ev === 'bye') { this.poll = 0; this.poked = true; }
  }
  setView(v) {
    if (!v || this.phase !== 'match') return;
    const old = this.match;
    this.match = v;
    const partner = at(v.partner);
    const key = `${v.id}:${v.round}`;
    if (v.state === 'over') {
      const how = this.how, made = old && old.state === 'reveal';
      this.closeMatch();
      if (how === 'anyone') this.search(`${partner} left. Looking for someone else...`);
      else if (how === 'room') this.backToRoom(made ? '' : v.game && v.n > 2 ? 'Someone left, so the game ended.' : `${partner} left the game.`);
      else this.home(`${partner} left.`);
      return;
    }
    if (v.state === 'create') { // the first 90 seconds: each makes a character
      const mk = `${v.id}:make`;
      if (this.making === mk) { if (this.madeIn) this.showMade(v); return; }
      if (Date.now() >= v.startsAt) this.beginMake(v);
      else if (this.lobby.screen !== 'start') {
        this.lobby.show('start', { n: Math.ceil((v.startsAt - Date.now()) / 1000), text: this.makeText(v) });
        this.game.frameLook();
      }
      return;
    }
    if (v.state === 'preview') {
      this.sit(v.theirs, `theirs:${key}`);
      if (!old || old.me_ok !== v.me_ok || this.lobby.screen !== 'preview') {
        this.lobby.show('preview', { partner, ready: v.me_ok, say: v.me_ok ? `Waiting for ${partner}...` : '' });
        this.game.frameLook();
      }
      return;
    }
    if (v.state === 'playing') {
      if (this.turn === key) { if (this.handedIn && v.game) this.showWaitRound(v); return; } // the turn is on, or handed in and waiting
      if (Date.now() >= v.startsAt) this.beginTurn(v);
      else if (this.game.mode !== 'lobby' || this.lobby.screen !== 'start') {
        this.sit(v.theirs, `theirs:${key}`);
        this.lobby.show('start', { n: Math.ceil((v.startsAt - Date.now()) / 1000), partner, text: v.game ? `Round ${v.round} of ${v.rounds}: work on ${partner}'s character` : '' });
        this.game.frameLook();
      }
      return;
    }
    if (v.state === 'reveal' && v.game) { this.groupReveal(v, old, key); return; }
    if (v.state === 'reveal') {
      const rx = (who, view) => { const r = view && view.reactions.find((x) => x.from === who); return r ? r.kind : null; };
      if (this.shown !== key) {
        this.shown = key;
        this.turn = key;
        this.seeing = 'both';
        if (this.game.salon) this.game.leaveSalon();
        if (this.me && v.mine_after) { this.me.look = v.mine_after; this.me.gen = (this.me.gen || 0) + 1; } // what I bring next
        this.showReveal(true);
      } else if (!old || old.me_again !== v.me_again || old.they_again !== v.they_again || rx('me', old) !== rx('me', v) || rx('them', old) !== rx('them', v)) {
        this.showReveal(false);
      }
      // they just said what they think of my work
      const got = rx('them', v);
      if (got && got !== rx('them', old && old.id === v.id && old.round === v.round ? old : null)) {
        this.game.ui.toast(`${partner}: ${REACT_LABEL[got]}`);
        this.game.cheer(got);
      }
    }
  }
  // the reveal sheet, and which character is in the chair (relook: put it there again)
  showReveal(relook) {
    const v = this.match;
    if (!v) return;
    if (v.game) { this.showGroupReveal(relook); return; }
    const rx = (who) => { const r = v.reactions.find((x) => x.from === who); return r ? r.kind : null; };
    this.lobby.show('reveal', {
      room: this.how === 'room',
      partner: at(v.partner), seeing: this.seeing, mine: rx('me'), theirs: rx('them'),
      again: v.me_again, theyAgain: v.they_again,
    });
    if (relook) {
      this.seated = null;
      const P = at(v.partner);
      if (this.seeing === 'both') {
        if (v.mine_after && v.theirs_after) {
          this.game.pairLooks([
            { look: v.mine_after, title: 'Yours', by: `by ${P}` },
            { look: v.theirs_after, title: `${P}'s`, by: 'by you' },
          ], this.below);
          this.game.frameLook(true);
        }
      } else {
        const [a, b] = this.seeing === 'theirs' ? [v.theirs, v.theirs_after] : [v.mine, v.mine_after];
        if (a && b) this.game.revealLooks(a, b, this.below);
      }
    }
    if (this.seeing === 'both') this.game.frameLook(); else this.game.reframeReveal();
  }
  // switch the reveal between my character and theirs
  see(which) {
    if (!this.match || this.match.state !== 'reveal' || which === this.seeing) return;
    this.seeing = ['both', 'mine', 'theirs', 'all'].includes(which) ? which : 'both';
    this.showReveal(true);
  }
  // making my character, on the clock (the creator, timed)
  beginMake(v) {
    this.making = `${v.id}:make`;
    this.madeIn = false;
    this.lobby.hide();
    this.seated = null;
    this.game.openCreator({ timed: { endsAt: v.endsAt, done: (look) => this.madeChar(look) } });
  }
  // the creator closed: what I made goes in (null: I quit the match)
  async madeChar(look) {
    const m = this.match;
    if (!m || this.phase !== 'match') return;
    if (!look) { this.backToRoom(); return; }
    this.madeIn = true;
    this.game.showLook(look, this.below);
    this.seated = 'made';
    this.showMade(m);
    const ep = this.epoch;
    for (let i = 0; i < 4; i++) {
      try {
        const v = await this.mp.gameMade(m.id, look);
        try { localStorage.setItem(SENT, hash(lookText(look))); } catch { /* no storage */ }
        if (this.live) this.live.send('poke');
        if (ep === this.epoch) this.setView(v);
        return;
      } catch (e) {
        if (e.msg === 'not now') return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  showMade(v) {
    if (this.lobby.screen === 'wait') return;
    const left = (v.players || []).filter((p) => !p.made && p.seat !== v.seat).map((p) => at(p.name));
    this.lobby.show('wait', { top: 'CHARACTER DONE', say: `Waiting for ${left.join(', ') || 'the others'} to finish...` });
    this.game.frameLook();
  }
  makeText(v) {
    const others = (v.players || []).filter((p) => p.seat !== v.seat);
    return others.length === 1 ? `Make a character for ${at(others[0].name)}` : 'Make a character to pass around';
  }
  // handed in this round: who we're still waiting for
  showWaitRound(v) {
    const left = (v.players || []).filter((p) => !p.done && p.seat !== v.seat).map((p) => at(p.name));
    const say = `Waiting for ${left.join(', ') || 'the others'}...`;
    if (this.lobby.screen === 'wait') this.lobby.say(say);
    else { this.lobby.show('wait', { say }); this.game.reframeReveal(); }
  }
  // ---------- the end of a room game: every character as it came out ----------
  groupReveal(v, old, key) {
    const mineR = (x) => x && x.results && x.results.find((r) => r.seat === x.seat);
    if (this.shown !== key) {
      this.shown = key; this.turn = key; this.seeing = 'all';
      if (this.game.salon) this.game.leaveSalon();
      const r = mineR(v);
      if (this.me && r) { this.me.look = r.look; this.me.gen = (this.me.gen || 0) + v.rounds; } // what I bring next
      this.showGroupReveal(true);
    } else {
      const ks = (x) => JSON.stringify((x && x.results || []).map((r) => r.kind));
      if (ks(old) !== ks(v)) this.showGroupReveal(this.seeing === 'all');
    }
    // someone said what they think of how theirs turned out (I worked on it)
    const before = old && old.id === v.id && old.results ? old.results : [];
    for (const r of v.results || []) {
      if (r.seat === v.seat || !r.kind) continue;
      const was = before.find((b) => b.seat === r.seat);
      if (old && old.state === 'reveal' && (!was || was.kind !== r.kind)) {
        this.game.ui.toast(`${at(r.name)}: ${REACT_LABEL[r.kind]}`);
        this.game.cheer(r.kind);
      }
    }
  }
  showGroupReveal(relook) {
    const v = this.match;
    const res = v.results || [], mine = res.find((r) => r.seat === v.seat);
    this.lobby.show('reveal', { group: true, room: true, seeing: this.seeing, mine: mine && mine.kind, n: v.n });
    if (relook) {
      this.seated = null;
      if (this.seeing === 'all') {
        const by = (r) => `by ${r.by.map((n) => (this.me && n === this.me.name ? 'you' : at(n))).join(', ')}`;
        // mine first, then the others in seat order
        const list = [...res].sort((a, b) => (a.seat === v.seat ? -1 : b.seat === v.seat ? 1 : a.seat - b.seat));
        this.game.pairLooks(list.map((r) => ({ look: r.look, title: r.seat === v.seat ? 'Yours' : `${at(r.name)}'s`, by: by(r) })), this.below);
      } else if (mine && mine.first) this.game.revealLooks(mine.first, mine.look, this.below);
    }
    if (this.seeing === 'all') this.game.frameLook(); else this.game.reframeReveal();
  }
  beginTurn(v) {
    this.turn = `${v.id}:${v.round}`;
    this.handedIn = false; this.fellBack = false;
    this.theirLive = null; this.lastSent = ''; this.sendT = 0;
    this.lobby.hide();
    this.seated = null;
    const secs = Math.max(5, (v.endsAt - Date.now()) / 1000);
    this.game.startSalon(v.theirs, { mp: true, secs, endsAt: v.endsAt, onEnd: (after) => this.handIn(after) });
    this.game.setLive(v.mine);
  }
  // the bell: what I made of their character goes in
  async handIn(after) {
    const m = this.match;
    if (!m || this.handedIn) return;
    this.handedIn = true;
    this.lobby.show('wait', { partner: at(m.partner) });
    this.game.reframeReveal();
    const ep = this.epoch;
    for (let i = 0; i < 4; i++) {
      try {
        const v = await this.api.submit(m.id, after);
        if (this.live) this.live.send('poke');
        if (ep === this.epoch) this.setView(v);
        return;
      } catch (e) {
        if (e.msg === 'not now') return; // too late: the match moved on without it
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // ---------- every frame (from game.update): my work goes to them a few times a second ----------
  update(dt) {
    if (!this.on) return;
    const g = this.game;
    if (g.salon && !g.salon.over && g.salon.o.mp && this.live) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = SEND;
        const look = g.lookNow(), t = lookText(look);
        const m = this.match, of = m && m.game ? m.theirs_seat : undefined;
        if (t !== this.lastSent && this.live.send('look', { look, of })) this.lastSent = t;
      }
    }
  }
  // ---------- four times a second, visible or not ----------
  pump() {
    if (!this.on) return;
    const m = this.match;
    // the countdown before a turn
    if (this.phase === 'match' && m && m.state === 'playing' && this.turn !== `${m.id}:${m.round}`) {
      const left = m.startsAt - Date.now();
      if (left <= 0) this.beginTurn(m);
      else if (this.lobby.screen === 'start') {
        const n = String(Math.ceil(left / 1000));
        const el = this.lobby.sheet.querySelector('.lb-count');
        if (el && el.textContent !== n) el.textContent = n;
      }
    }
    if (this.phase === 'match' && m && m.state === 'create' && this.making !== `${m.id}:make`) {
      const left = m.startsAt - Date.now();
      if (left <= 0) this.beginMake(m);
      else if (this.lobby.screen === 'start') {
        const n = String(Math.ceil(left / 1000));
        const el = this.lobby.sheet.querySelector('.lb-count');
        if (el && el.textContent !== n) el.textContent = n;
      }
    }
    // made mine, and they never handed theirs in: they're gone
    if (this.phase === 'match' && m && m.state === 'create' && this.madeIn && Date.now() > m.endsAt + MAKE_GRACE * 1000) {
      this.backToRoom('Someone never finished their character, so the game ended.');
      return;
    }
    // handed in, they haven't, and they're gone: my character goes in as they last showed it
    if (this.phase === 'match' && m && m.state === 'playing' && this.handedIn && !this.fellBack && !(m.game ? m.mine_done : m.mine_after) && Date.now() > m.endsAt + GRACE * 1000) {
      this.fellBack = true;
      this.api.submit(m.id, this.theirLive || m.mine, true).then((v) => this.setView(v), () => { this.poll = 0; });
    }
    if (this.phase === 'search') {
      const s = (performance.now() - this.since) / 1000;
      if (s > 2) this.lobby.say(`${this.searchSay || 'Looking for someone to play with...'} ${mmss(s)}`);
    }
    const now = performance.now();
    if (this.poll === 0) this.nextCheck = 0; // asked to check now (a poke, a new phase)
    if (now < this.nextCheck || this.polling) return;
    this.poll = POLL;
    this.nextCheck = now + POLL * 1000;
    this.check();
  }
  async check() {
    const ep = this.epoch, phase = this.phase;
    let fn = null;
    if (phase === 'room' && this.code) fn = () => this.mp.roomView(this.code);
    else if (phase === 'search') fn = () => this.mp.join();
    else if (phase === 'match' && this.match) {
      const g = this.game;
      if (g.salon && !g.salon.over && !this.poked) return; // mid-turn: only when they signal (they may have left)
      fn = () => this.api.state(this.match.id);
    }
    if (!fn) return;
    this.poked = false;
    this.polling = true;
    try {
      const v = await fn();
      if (ep !== this.epoch) return;
      if (phase === 'match') this.setView(v);
      else if (phase === 'room') this.setRoom(v);
      else if (v) this.enter(v, 'anyone');
    } catch (e) {
      if (ep !== this.epoch) return;
      if (phase === 'room' && e.msg === 'room closed') { this.code = null; this.home(noteFor('room closed')); }
      else if (phase === 'search' && e.msg === 'no character') this.open();
    } finally { this.polling = false; }
  }
}
