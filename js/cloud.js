// Cloud save on Supabase (project "Dr Glow Up"; tables and rules in supabase/migrations).
// No sign-up: the first time a player finishes a level, the game signs in as an anonymous
// Supabase user and keeps that session in this browser. After every level the progress
// goes up through save_progress(), which merges and never lowers anything; at start the
// saved progress comes back down and is merged into the local one.
// It runs only on the real site (doctorglowup.site) or with ?cloud, so local runs, ?debug
// checks, YouTube Playables and the iOS app never touch it. Every failure is silent: the
// game always plays from its local progress.
const API = 'https://gawytyorlxeoicczwobj.supabase.co';
const KEY = 'sb_publishable_va8G3OF6qQtNe4yoEkYyew_wkQHD49z'; // public by design: the rules live in the database
const STORE = 'drglowup.cloud.v1';
const HOME = 'doctorglowup.site';

function readSession() {
  try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s && s.refresh_token ? s : null; } catch { return null; }
}
function writeSession(s) {
  try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch { /* storage unavailable */ }
}
const headers = (token) => {
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

export class Cloud {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.on = typeof fetch === 'function' && !window.ytgame && !q.has('nocloud')
      && (q.has('cloud') || (location.hostname === HOME && !q.has('debug')));
    this.session = this.on ? readSession() : null;
    this.want = null; // the newest progress waiting to go up
    this.sending = null;
    this.auth = null;
    if (this.on) window.addEventListener('online', () => this.flush());
  }

  // the player's saved progress ({ unlocked, best }), or null. Never signs in: a
  // browser with no session has nothing saved yet.
  async load() {
    if (!this.on || !this.session) return null;
    try {
      const rows = await this.call('GET', '/rest/v1/saves?select=unlocked,best');
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch { return null; }
  }

  // queue the progress to go up; only the newest one is sent (progress only ever grows)
  save(p) {
    if (!this.on || !p) return;
    // only up to the last level played: the save stays short (and within what the
    // database takes) however many levels the game has
    const best = p.best.slice();
    while (best.length && !best[best.length - 1]) best.pop();
    this.want = { p_unlocked: p.unlocked, p_best: best };
    this.flush();
  }

  flush() {
    if (!this.want || this.sending) return;
    const body = this.want;
    this.want = null;
    let ok = false;
    this.sending = this.call('POST', '/rest/v1/rpc/save_progress', body)
      .then(() => { ok = true; })
      .catch(() => { if (!this.want) this.want = body; }) // goes again with the next save or when back online
      .finally(() => { this.sending = null; if (ok && this.want) this.flush(); });
  }

  // keepalive: the request outlives the page (a goodbye as the tab closes)
  async call(method, path, body, keepalive = false) {
    const send = async (token) => fetch(API + path, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined, keepalive });
    let r = await send(await this.token());
    if (r.status === 401) { this.session = { ...this.session, expires_at: 0 }; r = await send(await this.token()); }
    // the player behind this session is gone (removed on the server): a new one, once
    if (r.status === 409 && this.session && !this.renewed) {
      let gone = false;
      try { gone = /foreign key/i.test((await r.clone().json()).message || ''); } catch { /* not json */ }
      if (gone) { this.renewed = true; this.session = null; writeSession(null); r = await send(await this.token()); }
    }
    if (!r.ok) {
      const e = new Error(`cloud ${r.status}`);
      e.status = r.status;
      try { e.msg = (await r.json()).message || ''; } catch { e.msg = ''; } // the database's reason, if any
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }

  // a valid access token: the stored one, a refreshed one, or a new anonymous player
  async token() {
    const s = this.session;
    if (s && s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    if (!this.auth) this.auth = (s ? this.refresh() : this.signIn()).finally(() => { this.auth = null; });
    return this.auth;
  }

  async refresh() {
    // another tab may have refreshed already: its tokens are in storage
    const stored = readSession();
    if (stored && stored.refresh_token !== this.session.refresh_token) {
      this.session = stored;
      if (stored.expires_at - 60 > Date.now() / 1000) return stored.access_token;
    }
    const r = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: this.session.refresh_token }) });
    if (r.ok) return this.keep(await r.json());
    if (r.status >= 400 && r.status < 500) { // the session is gone for good: start a new player (local progress goes up again)
      this.session = null; writeSession(null);
      return this.signIn();
    }
    throw new Error(`refresh ${r.status}`);
  }

  async signIn() {
    const r = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: headers(), body: '{}' });
    if (!r.ok) throw new Error(`sign-in ${r.status}`);
    return this.keep(await r.json());
  }

  keep(d) {
    this.session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    };
    writeSession(this.session);
    return d.access_token;
  }
}
