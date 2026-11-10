// Multiplayer, start to finish (MULTIPLAYER_PLAN.md, milestone 4): the people button opens
// it; from there a friend's room (invite with a code or link, or join one) or anyone who is
// searching; then the match: who you got (skip or ready), 3-2-1, a 90 second turn on their
// character while a small window shows yours as they change it, and at the end what they
// did to your character. Single player is the game as it always was: leaving multiplayer
// goes back to it.
// The database (mp.js) decides everything that counts; the live channel (live.js) only
// carries the character being worked on, for the window, and pokes to check the match now.
import { Mp, roomLink, cleanCode } from './mp.js';
import { Live } from './live.js';
import { Lobby, noteFor, REACT_LABEL } from './lobby.js';
import { Creator } from './creator.js';
import { lookText, validLook } from './look.js';

const SENT = 'drglowup.mp.sent'; // which creator character the server has (so it goes up once)
const POLL = 1.6; // seconds between checks while waiting on the other player or the queue
const SEND = 0.33; // seconds between live looks during a turn
const GRACE = 11; // seconds after the bell before handing in my own character for a partner who left

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
    this.phase = null; // home | invite | join | search | match | note
    this.epoch = 0; // bumps on every phase change: late answers for an old phase are dropped
    this.me = null;
    this.match = null; // the last view of the match
    this.how = null; // how we got the match: 'host' | 'room' | 'anyone'
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
  // o.code: join that room straight away (an invite link)
  async open(o = {}) {
    if (!this.mp.on) return;
    this.game.closeMenu();
    this.on = true;
    this.pendingCode = o.code || null;
    this.game.showLook(null, this.below);
    this.setPhase('home');
    this.lobby.show('home', { busy: true, say: 'Getting ready...' });
    this.game.frameLook(true);
    if (!(await this.prepare())) return;
    const code = this.pendingCode;
    this.pendingCode = null;
    if (code) this.joinCode(code); else this.home();
  }
  // my character up on the server (once per creator save), and who I am
  async prepare() {
    const local = Creator.saved();
    if (!local) { // make one first; the creator comes back here (fromCreator)
      this.lobby.hide();
      this.game.afterCreator = 'mp';
      this.game.openCreator();
      return false;
    }
    const ep = this.epoch;
    try {
      let me = await this.mp.me();
      const sig = hash(lookText(local.look));
      let sent = null;
      try { sent = localStorage.getItem(SENT); } catch { /* no storage */ }
      if (!me.has_character || sent !== sig) {
        await this.mp.save(local.look);
        try { localStorage.setItem(SENT, sig); } catch { /* no storage */ }
        me = await this.mp.me();
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
  // the creator closed (multiplayer sent the player there)
  fromCreator(saved) {
    if (saved) this.open({ code: this.pendingCode });
    else this.leave();
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
    if (phase === 'invite' && code) this.mp.roomCancel(code).catch(() => {});
    if (phase === 'search') this.mp.leave().catch(() => {});
    if (match && match.state !== 'over') this.mp.end(match.id).catch(() => {});
    this.closeMatch();
    this.code = null;
  }
  closeMatch() {
    if (this.live) { this.live.close(); this.live = null; }
    this.match = null; this.turn = null; this.shown = null; this.handedIn = false; this.fellBack = false; this.theirLive = null;
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
  // ---------- naming: one word from each of two lists ----------
  async nameScreen() {
    this.setPhase('name');
    const ep = this.epoch;
    const [first = '', second = ''] = ((this.me && this.me.name) || '').split(' ');
    this.naming = { first, second, words: this.words || null };
    this.showName({ say: 'Loading...' });
    try {
      if (!this.words) this.words = await this.mp.nameWords();
      if (ep !== this.epoch) return;
      this.naming.words = this.words;
      this.showName();
    } catch { if (ep === this.epoch) this.home('Could not load names. Try again.'); }
  }
  showName(o = {}) {
    const n = this.naming;
    this.lobby.show('name', { first: n.first, second: n.second, words: n.words, ...o });
    this.game.frameLook();
    // keep the chosen words in view in their rows
    for (const c of this.lobby.sheet.querySelectorAll('.lb-chip.on')) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  nameDice() {
    const w = this.naming.words;
    if (!w) return;
    const any = (l) => l[Math.floor(Math.random() * l.length)];
    this.naming.first = any(w.first); this.naming.second = any(w.second);
    this.showName();
  }
  async nameSave() {
    const n = this.naming, ep = this.epoch;
    try {
      const r = await this.mp.setName(n.first, n.second);
      if (ep !== this.epoch) return;
      if (this.me) this.me.name = r.name;
      this.home(`You are now ${r.name}.`);
    } catch { if (ep === this.epoch) this.showName({ say: 'Could not save the name. Try again.', bad: true }); }
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
  async invite() {
    this.setPhase('invite');
    const ep = this.epoch;
    this.lobby.show('invite', {});
    this.game.frameLook();
    try {
      const r = await this.mp.roomCreate();
      if (ep !== this.epoch) { this.mp.roomCancel(r.code).catch(() => {}); return; }
      this.code = r.code;
      this.showInvite();
    } catch (e) {
      if (ep === this.epoch) this.home(e.msg === 'too many rooms' ? 'Too many rooms for now. Try again later.' : 'Could not make a room. Try again.');
    }
  }
  showInvite(copied = false) {
    this.lobby.show('invite', { code: this.code, canShare: !!navigator.share, copied, say: copied ? 'Link copied. Send it to a friend.' : '' });
    this.game.frameLook();
  }
  async joinCode(code) {
    code = cleanCode(code);
    this.setPhase('join');
    const ep = this.epoch;
    if (code.length !== 6) { this.lobby.show('join', { code }); this.game.frameLook(); return; }
    this.lobby.show('join', { code, say: 'Joining...' });
    this.game.frameLook();
    try {
      const v = await this.mp.roomJoin(code);
      if (ep === this.epoch) this.enter(v, 'room');
    } catch (e) {
      if (ep === this.epoch) this.lobby.show('join', { code, say: noteFor(e.msg, 'Could not join. Check your connection and try again.'), bad: true });
    }
  }
  search(say = '') {
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
      case 'name-first': this.naming.first = v; this.showName(); break;
      case 'name-second': this.naming.second = v; this.showName(); break;
      case 'name-dice': this.nameDice(); break;
      case 'name-save': this.nameSave(); break;
      case 'hist': this.histAt(this.histI + (v === 'older' ? 1 : -1)); break;
      case 'see': this.see(v); break;
      case 'react': this.call((id) => this.mp.react(id, v)); break;
      case 'invite': this.invite(); break;
      case 'join': this.drop(); this.setPhase('join'); this.lobby.show('join', {}); this.game.frameLook(); break;
      case 'join-code': this.joinCode(v); break;
      case 'search': this.search(); break;
      case 'cancel-room': this.home(); break;
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
    const done = () => this.showInvite(true);
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
    if (ev === 'look' && p && validLook(p.look)) {
      this.theirLive = p.look;
      if (this.game.salon && !this.game.salon.over) this.game.setLive(p.look);
    } else if (ev === 'poke' || ev === 'bye') { this.poll = 0; this.poked = true; }
  }
  setView(v) {
    if (!v || this.phase !== 'match') return;
    const old = this.match;
    this.match = v;
    const partner = v.partner || 'They';
    const key = `${v.id}:${v.round}`;
    if (v.state === 'over') {
      const how = this.how;
      this.closeMatch();
      if (how === 'anyone') this.search(`${partner} left. Looking for someone else...`);
      else this.home(`${partner} left the room.`);
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
      if (this.turn === key) return; // the turn is on, or handed in and waiting
      if (Date.now() >= v.startsAt) this.beginTurn(v);
      else if (this.game.mode !== 'lobby' || this.lobby.screen !== 'start') {
        this.sit(v.theirs, `theirs:${key}`);
        this.lobby.show('start', { n: Math.ceil((v.startsAt - Date.now()) / 1000), partner });
        this.game.frameLook();
      }
      return;
    }
    if (v.state === 'reveal') {
      const rx = (who, view) => { const r = view && view.reactions.find((x) => x.from === who); return r ? r.kind : null; };
      if (this.shown !== key) {
        this.shown = key;
        this.turn = key;
        this.seeing = 'mine';
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
    const rx = (who) => { const r = v.reactions.find((x) => x.from === who); return r ? r.kind : null; };
    this.lobby.show('reveal', {
      partner: v.partner || 'They', seeing: this.seeing, mine: rx('me'), theirs: rx('them'),
      again: v.me_again, theyAgain: v.they_again,
    });
    if (relook) {
      const [a, b] = this.seeing === 'theirs' ? [v.theirs, v.theirs_after] : [v.mine, v.mine_after];
      this.seated = null;
      if (a && b) this.game.revealLooks(a, b, this.below);
    }
    this.game.reframeReveal();
  }
  // switch the reveal between my character and theirs
  see(which) {
    if (!this.match || this.match.state !== 'reveal' || which === this.seeing) return;
    this.seeing = which === 'theirs' ? 'theirs' : 'mine';
    this.showReveal(true);
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
    this.lobby.show('wait', { partner: m.partner });
    this.game.reframeReveal();
    const ep = this.epoch;
    for (let i = 0; i < 4; i++) {
      try {
        const v = await this.mp.submit(m.id, after);
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
        if (t !== this.lastSent && this.live.send('look', { look })) this.lastSent = t;
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
    // handed in, they haven't, and they're gone: my character goes in as they last showed it
    if (this.phase === 'match' && m && m.state === 'playing' && this.handedIn && !this.fellBack && !m.mine_after && Date.now() > m.endsAt + GRACE * 1000) {
      this.fellBack = true;
      this.mp.submit(m.id, this.theirLive || m.mine, true).then((v) => this.setView(v), () => { this.poll = 0; });
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
    if (phase === 'invite' && this.code) fn = () => this.mp.roomWait(this.code);
    else if (phase === 'search') fn = () => this.mp.join();
    else if (phase === 'match' && this.match) {
      const g = this.game;
      if (g.salon && !g.salon.over && !this.poked) return; // mid-turn: only when they signal (they may have left)
      fn = () => this.mp.state(this.match.id);
    }
    if (!fn) return;
    this.poked = false;
    this.polling = true;
    try {
      const v = await fn();
      if (ep !== this.epoch) return;
      if (phase === 'match') this.setView(v);
      else if (v) this.enter(v, phase === 'invite' ? 'host' : 'anyone');
    } catch (e) {
      if (ep !== this.epoch) return;
      if (phase === 'invite' && e.msg === 'room closed') { this.code = null; this.home(noteFor('room closed')); }
      else if (phase === 'search' && e.msg === 'no character') this.open();
    } finally { this.polling = false; }
  }
}
