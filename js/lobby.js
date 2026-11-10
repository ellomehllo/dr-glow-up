// The multiplayer screens (MULTIPLAYER_PLAN.md, milestone 4): a people button in the top
// bar (single player stays the game as it is; this opens multiplayer), and one sheet at the
// bottom that shows one screen at a time:
//   home     your name, three ways in: invite a friend, join with a code, play with anyone
//   invite   your room code and link (copy, share), waiting for the friend
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
};

const NOTE = {
  'no such room': 'No room with that code. Check it and try again.',
  'room is full': 'Someone else joined that room already.',
  'your own room': "That's your own room code.",
  'too many tries': 'Too many wrong codes. Wait a few minutes.',
  'room closed': 'Your room closed. Make a new one.',
};
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
      const inp = this.sheet.querySelector('.lb-code-in');
      if (inp) act('join-code', cleanCode(inp.value));
    });
    this.screen = null;
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
    const first = this.sheet.querySelector('.lb-main:not(:disabled)');
    if (first && screen !== 'join' && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  // just the status line of the screen showing (no rebuild)
  say(text) { const s = this.sheet.querySelector('.lb-say'); if (s) s.textContent = text; }

  html(screen, d) {
    const btn = (act, icon, label, cls = '', extra = '') => `<button type="button" class="lb-btn ${cls}" data-act="${act}" ${extra}>${LB_ICON[icon]}<span>${label}</span></button>`;
    const head = (title, back = 'home') => `<header class="lb-head">${back ? `<button type="button" class="lb-x" data-act="${back}" aria-label="Back">${LB_ICON.back}</button>` : '<span class="lb-x-gap"></span>'}<h2>${title}</h2><span class="lb-x-gap"></span></header>`;
    const spin = '<span class="lb-spin" aria-hidden="true"></span>';
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    switch (screen) {
      case 'home':
        return `${head('MULTIPLAYER', 'leave')}
          <p class="lb-who">You are <b>${esc(d.name || '...')}</b></p>
          <div class="lb-col">
            ${btn('invite', 'invite', 'INVITE A FRIEND', 'lb-main lb-pink', d.busy ? 'disabled' : '')}
            ${btn('join', 'code', 'JOIN WITH A CODE', '', d.busy ? 'disabled' : '')}
            ${btn('search', 'anyone', 'PLAY WITH ANYONE', '', d.busy ? 'disabled' : '')}
          </div>
          <div class="lb-row lb-small">
            ${btn('edit', 'edit', 'NEW CHARACTER', 'lb-ghost')}
          </div>
          <p class="lb-say">${esc(d.say || '')}</p>`;
      case 'invite':
        return `${head('INVITE A FRIEND', 'cancel-room')}
          ${d.code ? `<p class="lb-code" aria-label="Room code ${esc(d.code.split('').join(' '))}">${esc(d.code)}</p>
          <div class="lb-row">
            ${btn('copy', 'copy', d.copied ? 'COPIED' : 'COPY LINK', 'lb-main lb-pink')}
            ${d.canShare ? btn('share', 'share', 'SHARE') : ''}
          </div>` : `<p class="lb-wait">${spin}</p>`}
          <p class="lb-say">${esc(d.say || 'Send the code or link to a friend.')}</p>`;
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
        return `<p class="lb-count" aria-live="assertive">${esc(d.n)}</p><p class="lb-say">Work on ${esc(d.partner)}'s character</p>`;
      case 'wait':
        return `<p class="lb-say lb-top">TIME'S UP</p><p class="lb-wait">${spin}</p><p class="lb-say">${esc(d.say || `Waiting for ${d.partner}...`)}</p>`;
      case 'reveal':
        return `<p class="lb-say lb-top">${esc(String(d.partner || '').toUpperCase())} WORKED ON YOUR CHARACTER</p>
          <div class="lb-row">
            ${btn('again', 'again', d.again ? 'WAITING' : 'AGAIN', '', d.again ? 'disabled' : '')}
            ${btn('next', 'next', 'NEXT', 'lb-main lb-pink')}
          </div>
          <div class="lb-row lb-small">${btn('home', 'close', 'LEAVE', 'lb-ghost')}</div>
          <p class="lb-say">${esc(d.say || (d.theyAgain ? `${d.partner} wants to go again.` : 'Your character keeps this look for the next player.'))}</p>`;
      case 'note':
        return `${head(d.title || 'MULTIPLAYER', d.back || 'home')}
          <p class="lb-say">${esc(d.say)}</p>
          <div class="lb-row">${btn(d.act || 'home', d.icon || 'next', d.label || 'OK', 'lb-main lb-pink')}</div>`;
      default: return '';
    }
  }
}
