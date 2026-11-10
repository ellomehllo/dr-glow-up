// The multiplayer screens (MULTIPLAYER_PLAN.md, milestone 4): a people button in the top
// bar (single player stays the game as it is; this opens multiplayer), and one sheet at the
// bottom that shows one screen at a time:
//   home     your name, three ways in: invite a friend, join with a code, play with anyone
//   room     a friend's room: its code and link, who is in, who is ready, a Ready button
//   name     type your username (@name)
//   join     type a friend's code
//   search   looking for someone to play with
//   preview  who you got: skip or ready
//   start    3, 2, 1
//   wait     time's up: waiting for the other player to finish
//   reveal   what they did to your character: again, next, leave
//   note     a message with one way on (offline, they left...)
// The patient in the chair is the character in question; this is only the overlay.
// multi.js drives it.
import { cleanCode } from './mp.js';

const I = (d) => `<svg class="lb-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const LB_ICON = {
  people: I('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2c2.4-.3 4.4 1.1 5 4.3"/>'),
  invite: I('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  code: I('<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10v4M10.5 10v4M14 10v4M17.5 10v4"/>'),
  anyone: I('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  share: I('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  skip: I('<path d="M5 6l7 6-7 6zM13 6l7 6-7 6z"/>'),
  again: I('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  next: I('<path d="M5 12h13M13 6l6 6-6 6"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  love: I('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>'),
  funny: I('<circle cx="12" cy="12" r="8.5"/><path d="M8 10.2l1.6-1.2M8 10.2l1.6 1.2M16 10.2l-1.6-1.2M16 10.2l-1.6 1.2"/><path d="M7.8 13.6h8.4a4.2 4.2 0 0 1-8.4 0z"/>'),
  ruined: I('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/><path d="M12 7.4l-1.6 3.4 3 2-1.8 3.4"/>'),
  dice: I('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r=".6"/><circle cx="15" cy="15" r=".6"/><circle cx="15" cy="9" r=".6"/><circle cx="9" cy="15" r=".6"/><circle cx="12" cy="12" r=".6"/>'),
  history: I('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4.5l3 1.8"/>'),
  older: I('<path d="M15 5l-7 7 7 7"/>'),
  newer: I('<path d="M9 5l7 7-7 7"/>'),
};
export const REACT_LABEL = { love: 'LOVE IT', funny: 'FUNNY', ruined: 'RUINED' };

const NOTE = {
  'no such room': 'No room with that code. Check it and try again.',
  'room is full': 'Someone else joined that room already.',
  'your own room': "That's your own room code.",
  'too many tries': 'Too many wrong codes. Wait a few minutes.',
  'room closed': 'The room closed.',
  'bad name': 'Use 3 to 20 letters, numbers or _.',
  'not allowed': "That name isn't allowed. Try another.",
  'name taken': 'Someone has that name already. Try another.',
};
// a username as typed: lower case, a-z 0-9 _ only, at most 20
export const cleanName = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
export const at = (name) => (name ? `@${name}` : 'They');
export const noteFor = (msg, fallback = 'Something went wrong. Try again.') => NOTE[msg] || fallback;

export class Lobby {
  // act(name, data): every button (multi.js)
  constructor(root, act) {
    this.act = act;
    // the people button, in the top bar next to the sound button
    const bar = root.querySelector('.bar'), mute = root.querySelector('.mute');
    const btn = (this.btn = document.createElement('button'));
    btn.className = 'mute mp-open';
    btn.type = 'button';
    btn.setAttribute('data-ui', '');
    btn.setAttribute('aria-label', 'Multiplayer');
    btn.title = 'Multiplayer';
    btn.innerHTML = LB_ICON.people;
    btn.hidden = true;
    btn.addEventListener('click', () => act('open'));
    bar.insertBefore(btn, mute);

    const el = (this.el = document.createElement('div'));
    el.className = 'lb';
    el.innerHTML = `<section class="lb-sheet" data-ui role="dialog" aria-label="Multiplayer" aria-live="polite"></section>`;
    root.appendChild(el);
    this.sheet = el.querySelector('.lb-sheet');
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button, input')) e.stopPropagation(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (b && !b.disabled) act(b.dataset.act, b.dataset.v);
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = this.sheet.querySelector('.lb-code-in'), nm = this.sheet.querySelector('.lb-name-in');
      if (inp) act('join-code', cleanCode(inp.value));
      else if (nm) act('name-save', nm.value);
    });
    this.screen = null;
    // Escape: the sheet's back button, when it has one
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.open) return;
      const back = this.sheet.querySelector('.lb-head .lb-x[data-act]');
      if (back) { e.preventDefault(); act(back.dataset.act); }
    });
  }

  showButton(on) { this.btn.hidden = !on; }
  get open() { return this.el.classList.contains('in'); }
  hide() {
    this.el.classList.remove('in');
    document.body.classList.remove('lb-on');
    this.screen = null;
  }
  // room the sheet takes at the bottom (for the camera)
  height() { return this.open ? this.sheet.offsetHeight + 14 : 0; }

  // one screen: d holds what it needs
  show(screen, d = {}) {
    this.screen = screen;
    this.el.classList.add('in');
    document.body.classList.add('lb-on');
    this.sheet.dataset.screen = screen;
    this.sheet.innerHTML = this.html(screen, d);
    if (screen === 'join') {
      const inp = this.sheet.querySelector('.lb-code-in');
      inp.addEventListener('input', () => {
        const c = cleanCode(inp.value);
        if (inp.value !== c) inp.value = c;
        this.sheet.querySelector('.lb-go').disabled = c.length !== 6;
      });
      if (!matchMedia('(pointer: coarse)').matches) inp.focus();
    }
    if (screen === 'name') {
      const inp = this.sheet.querySelector('.lb-name-in');
      inp.addEventListener('input', () => {
        const c = cleanName(inp.value);
        if (inp.value !== c) inp.value = c;
        this.sheet.querySelector('.lb-go').disabled = c.length < 3;
      });
      if (!matchMedia('(pointer: coarse)').matches) { inp.focus(); inp.select(); }
    }
    const first = this.sheet.querySelector('.lb-main:not(:disabled)');
    if (first && screen !== 'join' && screen !== 'name' && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  // just the status line of the screen showing (no rebuild)
  say(text) { const s = this.sheet.querySelector('.lb-say'); if (s) s.textContent = text; }

  html(screen, d) {
    const btn = (act, icon, label, cls = '', extra = '') => `<button type="button" class="lb-btn ${cls}" data-act="${act}" ${extra}>${LB_ICON[icon]}<span>${label}</span></button>`;
    const head = (title, back = 'home') => `<header class="lb-head">${back ? `<button type="button" class="lb-x" data-act="${back}" aria-label="Back">${LB_ICON.back}</button>` : '<span class="lb-x-gap"></span>'}<h2>${title}</h2><span class="lb-x-gap"></span></header>`;
    const spin = '<span class="lb-spin" aria-hidden="true"></span>';
    const tally = (g) => (g && (g.love || g.funny || g.ruined) ? `<p class="lb-tally" aria-label="Your work: ${g.love} love it, ${g.funny} funny, ${g.ruined} ruined">
      <span>YOUR WORK</span>${['love', 'funny', 'ruined'].map((k) => `<i>${LB_ICON[k]}<b>${g[k]}</b></i>`).join('')}</p>` : '');
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    switch (screen) {
      case 'home':
        return `${head('MULTIPLAYER', 'leave')}
          <p class="lb-who lb-me">You are <b>${esc(d.name ? at(d.name) : '...')}</b>${d.name ? `<button type="button" class="lb-x lb-pen" data-act="name" aria-label="Change your name">${LB_ICON.edit}</button>` : ''}</p>
          <div class="lb-col">
            ${btn('invite', 'invite', 'INVITE A FRIEND', 'lb-main lb-pink', d.busy ? 'disabled' : '')}
            ${btn('join', 'code', 'JOIN WITH A CODE', '', d.busy ? 'disabled' : '')}
            ${btn('search', 'anyone', 'PLAY WITH ANYONE', '', d.busy ? 'disabled' : '')}
          </div>
          <div class="lb-row lb-small">
            ${d.gen > 0 ? btn('history', 'history', 'HISTORY', 'lb-ghost') : ''}
            ${btn('edit', 'edit', 'NEW CHARACTER', 'lb-ghost')}
          </div>
          ${tally(d.got)}
          <p class="lb-say">${esc(d.say || '')}</p>`;
      case 'name':
        return `${head('YOUR NAME', d.back || 'home')}
          <form class="lb-form" autocomplete="off">
            <label class="lb-name"><span aria-hidden="true">@</span><input class="lb-name-in" type="text" maxlength="20" autocapitalize="none" autocorrect="off" spellcheck="false"
              aria-label="Username" placeholder="username" value="${esc(d.name || '')}"></label>
            <button type="submit" class="lb-btn lb-main lb-pink lb-go" ${(d.name || '').length >= 3 ? '' : 'disabled'}>${LB_ICON.check}<span>SAVE</span></button>
          </form>
          <p class="lb-say${d.bad ? ' bad' : ''}">${esc(d.say || 'Letters, numbers and _. Everyone you play with sees it.')}</p>`;
      case 'history': {
        const h = d.item || {};
        return `${head('YOUR CHARACTER')}
          <div class="lb-row lb-hist">
            <button type="button" class="lb-x" data-act="hist" data-v="older" aria-label="Older" ${d.i >= d.n - 1 ? 'disabled' : ''}>${LB_ICON.older}</button>
            <p class="lb-who"><b>${d.i === 0 ? 'NOW' : `${d.i} ${d.i === 1 ? 'TURN' : 'TURNS'} AGO`}</b><br>${esc(h.by ? `after ${at(h.by)}` : 'as you made it')}</p>
            <button type="button" class="lb-x" data-act="hist" data-v="newer" aria-label="Newer" ${d.i <= 0 ? 'disabled' : ''}>${LB_ICON.newer}</button>
          </div>
          <p class="lb-say">${esc(d.n > 1 ? `${d.n - 1} ${d.n === 2 ? 'player has' : 'players have'} worked on your character.` : 'No one has worked on it yet.')}</p>`;
      }
      case 'room': {
        const person = (p, you, host) => p
          ? `<li class="lb-person${p.ready ? ' ready' : ''}"><i class="lb-av" aria-hidden="true">${esc(p.name[0].toUpperCase())}</i>
              <b>${esc(at(p.name))}${you ? ' <em>YOU</em>' : ''}${host ? ' <em>HOST</em>' : ''}</b>
              <small>${p.ready ? `${LB_ICON.check}READY` : 'NOT READY'}</small></li>`
          : `<li class="lb-person empty"><span class="lb-spin" aria-hidden="true"></span><b>Waiting for a friend...</b></li>`;
        const host = d.room ? d.role === 'host' : true;
        const r = d.room || {};
        const me = host ? r.host : r.guest, them = host ? r.guest : r.host;
        const say = d.say || (!them ? 'Send the code or link to a friend.'
          : me && me.ready ? `Waiting for ${at(them.name)} to be ready...`
          : 'Ready? You each make a character in 90 seconds, then get 90 seconds on the other one.');
        return `${head('ROOM', 'leave-room')}
          ${d.code ? `<div class="lb-row lb-roomcode">
            <p class="lb-code" aria-label="Room code ${esc(d.code.split('').join(' '))}">${esc(d.code)}</p>
            <button type="button" class="lb-x" data-act="copy" aria-label="${d.copied ? 'Link copied' : 'Copy link'}">${LB_ICON[d.copied ? 'check' : 'copy']}</button>
            ${d.canShare ? `<button type="button" class="lb-x" data-act="share" aria-label="Share link">${LB_ICON.share}</button>` : ''}
          </div>` : `<p class="lb-wait">${spin}</p>`}
          ${d.room ? `<ul class="lb-people" aria-label="Players">${person(r.host, host, true)}${person(r.guest, !host, false)}</ul>
          <div class="lb-row">${me && me.ready ? btn('unready', 'close', 'CANCEL READY') : btn('ready-room', 'check', 'READY', 'lb-main lb-pink', them ? '' : 'disabled')}</div>` : ''}
          <p class="lb-say">${esc(say)}</p>`;
      }
      case 'join':
        return `${head('JOIN A FRIEND')}
          <form class="lb-form" autocomplete="off">
            <input class="lb-code-in" type="text" inputmode="text" maxlength="12" autocapitalize="characters" autocorrect="off" spellcheck="false"
              aria-label="Room code" placeholder="CODE" value="${esc(d.code || '')}">
            <button type="submit" class="lb-btn lb-main lb-pink lb-go" ${(d.code || '').length === 6 ? '' : 'disabled'}>${LB_ICON.next}<span>JOIN</span></button>
          </form>
          <p class="lb-say${d.bad ? ' bad' : ''}">${esc(d.say || 'Type the code your friend sent you.')}</p>`;
      case 'search':
        return `${head('PLAY WITH ANYONE', 'cancel-search')}
          <p class="lb-wait">${spin}</p>
          <p class="lb-say">${esc(d.say || 'Looking for someone to play with...')}</p>`;
      case 'preview':
        return `${head('YOU GOT', null)}
          <p class="lb-who lb-big"><b>${esc(d.partner)}</b></p>
          <p class="lb-say">${esc(d.say || 'This is their character. You have 90 seconds with it.')}</p>
          <div class="lb-row">
            ${btn('skip', 'skip', 'SKIP', '', d.ready ? 'disabled' : '')}
            ${btn('ready', 'check', d.ready ? 'READY' : "LET'S GO", 'lb-main lb-pink', d.ready ? 'disabled' : '')}
          </div>`;
      case 'start':
        return `<p class="lb-count" aria-live="assertive">${esc(d.n)}</p><p class="lb-say">${esc(d.text || `Work on ${d.partner}'s character`)}</p>`;
      case 'wait':
        return `<p class="lb-say lb-top">${esc(d.top || "TIME'S UP")}</p><p class="lb-wait">${spin}</p><p class="lb-say">${esc(d.say || `Waiting for ${d.partner}...`)}</p>`;
      case 'reveal': {
        const P = esc(String(d.partner || '').toUpperCase());
        const mine = d.seeing !== 'theirs';
        const rx = (k) => `<button type="button" class="lb-btn lb-rx${d.mine === k ? ' on' : ''}" data-act="react" data-v="${k}" aria-pressed="${d.mine === k}">${LB_ICON[k]}<span>${REACT_LABEL[k]}</span></button>`;
        return `<div class="lb-seg" role="tablist" aria-label="Whose character">
            <button type="button" role="tab" data-act="see" data-v="mine" aria-selected="${mine}" class="${mine ? 'on' : ''}">YOURS</button>
            <button type="button" role="tab" data-act="see" data-v="theirs" aria-selected="${!mine}" class="${mine ? '' : 'on'}">THEIRS</button>
          </div>
          <p class="lb-say lb-top">${mine ? `${P} WORKED ON YOURS` : `WHAT YOU DID TO ${P}'S`}</p>
          ${mine ? `<div class="lb-row lb-rxs" role="group" aria-label="What do you think?">${rx('love')}${rx('funny')}${rx('ruined')}</div>`
            : `<p class="lb-said">${d.theirs ? `${LB_ICON[d.theirs]}<span>${esc(d.partner)}: <b>${REACT_LABEL[d.theirs]}</b></span>` : `<span>Waiting for ${esc(d.partner)} to react...</span>`}</p>`}
          ${d.room ? `<div class="lb-row">${btn('room-again', 'again', 'BACK TO THE ROOM', 'lb-main lb-pink')}</div>` : `<div class="lb-row">
            ${btn('again', 'again', d.again ? 'WAITING' : 'AGAIN', '', d.again ? 'disabled' : '')}
            ${btn('next', 'next', 'NEXT', 'lb-main lb-pink')}
          </div>`}
          <div class="lb-row lb-small">${btn('home', 'close', 'LEAVE', 'lb-ghost')}</div>
          <p class="lb-say">${esc(d.say || (d.room ? 'Back in the room you can play a new game.' : d.theyAgain ? `${d.partner} wants to go again.` : mine && !d.mine ? 'What do you think?' : mine ? 'Your character keeps this look for the next player.' : `${d.partner} keeps this look for their next player.`))}</p>`;
      }
      case 'note':
        return `${head(d.title || 'MULTIPLAYER', d.back || 'home')}
          <p class="lb-say">${esc(d.say)}</p>
          <div class="lb-row">${btn(d.act || 'home', d.icon || 'next', d.label || 'OK', 'lb-main lb-pink')}</div>`;
      default: return '';
    }
  }
}
