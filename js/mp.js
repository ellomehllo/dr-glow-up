// Multiplayer calls (MULTIPLAYER_PLAN.md): the mp_* functions in
// supabase/migrations/20261111090000_multiplayer.sql, over the same anonymous player and
// session as the cloud save (cloud.js). It runs where the cloud runs (doctorglowup.site,
// or ?cloud locally). Every call returns the match as this player sees it (a "view"):
//   { id, state: 'create'|'preview'|'playing'|'reveal'|'over', round, starts_at, ends_at, now,
//     side, partner, me_ok, they_ok, me_again, they_again,
//     mine, theirs, mine_after, theirs_after, reactions: [{ from: 'me'|'them', kind }] }
// mine: my character this round; theirs: the one I work on; *_after: what came of each.
// Looks from the network go through validLook: one that fails comes back as null.
import { validLook } from './look.js';

export const REACTIONS = ['love', 'funny', 'ruined'];
const LOOKS = ['mine', 'theirs', 'mine_after', 'theirs_after'];

export class Mp {
  constructor(cloud) {
    this.cloud = cloud;
    this.on = cloud.on;
    this.skew = 0; // server clock minus ours (ms), from the last view
  }

  async rpc(name, args = {}) {
    if (!this.on) throw new Error('multiplayer is off');
    return this.cloud.call('POST', `/rest/v1/rpc/${name}`, args);
  }

  // a server view, checked; null stays null (no match yet)
  view(v) {
    if (!v || typeof v !== 'object') return null;
    for (const k of LOOKS) if (v[k] != null && !validLook(v[k])) v[k] = null;
    if (Array.isArray(v.results)) {
      v.results = v.results.filter((r) => r && validLook(r.look));
      for (const r of v.results) { if (!validLook(r.first)) r.first = null; if (!Array.isArray(r.by)) r.by = []; if (!REACTIONS.includes(r.kind)) r.kind = null; }
    }
    v.reactions = Array.isArray(v.reactions) ? v.reactions.filter((r) => r && REACTIONS.includes(r.kind)) : [];
    if (v.now) this.skew = Date.parse(v.now) - Date.now();
    v.startsAt = v.starts_at ? Date.parse(v.starts_at) - this.skew : null; // in our clock
    v.endsAt = v.ends_at ? Date.parse(v.ends_at) - this.skew : null;
    return v;
  }

  // { name, has_character, look (the character I bring, as it is now), gen }
  async me() {
    const r = await this.rpc('mp_me');
    if (r && r.look && !validLook(r.look)) r.look = null;
    return r;
  }
  // the character I bring, version by version back to how I made it (newest first):
  // [{ gen, by (who had that turn; null: I made it), at, look }]
  async history() {
    const r = await this.rpc('mp_history');
    return Array.isArray(r) ? r.filter((h) => h && validLook(h.look)) : [];
  }
  // my username (shown as @name): { name }; throws with e.msg 'bad name' | 'not allowed' | 'name taken'
  setName(name) { return this.rpc('mp_set_name', { p_name: name }); }
  // keep the creator's character as the one I bring
  save(look) {
    if (!validLook(look)) return Promise.reject(new Error('bad look'));
    return this.rpc('mp_save', { p_look: look });
  }
  // call every couple of seconds while searching: a view once matched, else null
  async join() { return this.view(await this.rpc('mp_join')); }
  leave() { return this.rpc('mp_leave'); }
  async state(id) { return this.view(await this.rpc('mp_state', { p_match: id })); }
  async ready(id) { return this.view(await this.rpc('mp_ready', { p_match: id })); }
  skip(id) { return this.rpc('mp_skip', { p_match: id }); }
  // what I made of their character; mine: true hands in my own character as they last
  // showed it (they dropped out), allowed from 10 s after the bell
  async submit(id, look, mine = false) {
    if (!validLook(look)) throw new Error('bad look');
    return this.view(await this.rpc('mp_submit', { p_match: id, p_look: look, p_mine: mine }));
  }
  async react(id, kind) {
    if (!REACTIONS.includes(kind)) throw new Error('bad reaction');
    return this.view(await this.rpc('mp_react', { p_match: id, p_kind: kind }));
  }
  async again(id) { return this.view(await this.rpc('mp_again', { p_match: id })); }
  end(id) { return this.rpc('mp_end', { p_match: id }); }

  // ---------- room games (2 to 4 players: make characters, then pass them round) ----------
  // a game view: { id, game: true, n, state: 'create'|'playing'|'reveal'|'over', round, rounds,
  //   seat, players: [{ seat, name, made, done }], partner, theirs_seat, worker, me_done,
  //   mine_done, mine, theirs, results: [{ seat, name, first, look, by: [names], kind }] }
  async gameState(id) { return this.view(await this.rpc('mp_game_state', { p_game: id })); }
  async gameMade(id, look) {
    if (!validLook(look)) throw new Error('bad look');
    return this.view(await this.rpc('mp_game_made', { p_game: id, p_look: look }));
  }
  // what I made of this round's character; mine: hand in my own as it was last shown (whoever had it left)
  async gameSubmit(id, look, mine = false) {
    if (!validLook(look)) throw new Error('bad look');
    return this.view(await this.rpc('mp_game_submit', { p_game: id, p_look: look, p_mine: mine }));
  }
  async gameReact(id, kind) {
    if (!REACTIONS.includes(kind)) throw new Error('bad reaction');
    return this.view(await this.rpc('mp_game_react', { p_game: id, p_kind: kind }));
  }
  gameEnd(id) { return this.rpc('mp_game_end', { p_game: id }); }

  // ---------- rooms (play with friends) ----------
  // a room: { code, role: 'host'|'guest', max, players: [{ name, ready, host, you }], game (a view, or null) }
  room(r) {
    if (r && r.game) r.game = this.view(r.game);
    if (r && !Array.isArray(r.players)) r.players = [];
    return r;
  }
  // a new room of mine
  async roomCreate() { return this.room(await this.rpc('mp_room_create')); }
  // into a friend's room by code: the room, or throws with e.msg 'no such room' | 'room is full' | 'game on' | 'your own room' | 'too many tries'
  async roomEnter(code) {
    const r = await this.rpc('mp_room_enter', { p_code: code });
    if (r && r.error) { const e = new Error(r.error); e.msg = r.error; throw e; }
    return this.room(r);
  }
  // the room now (call every couple of seconds while in it); throws 'room closed' once it's gone
  async roomView(code) { return this.room(await this.rpc('mp_room_view', { p_code: code })); }
  async roomReady(code, ready) { return this.room(await this.rpc('mp_room_ready', { p_code: code, p_ready: !!ready })); }
  roomLeave(code) { return this.rpc('mp_room_leave', { p_code: code }); }
}

// room codes: 6 characters with no look-alikes (as the database makes them)
export const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const cleanCode = (t) => String(t || '').toUpperCase()
  .split('').filter((c) => CODE_ABC.includes(c)).join('').slice(0, 6);
export const roomLink = (code) => `${location.origin}${location.pathname}?room=${code}`;
