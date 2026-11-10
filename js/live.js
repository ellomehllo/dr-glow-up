// Live messages between the two players in a match (MULTIPLAYER_PLAN.md, milestone 4):
// Supabase Realtime broadcast, spoken over a plain WebSocket (the Phoenix protocol it
// uses), so no library is needed. One channel per match, named by its id (a random uuid
// only the two players know). What goes over it:
//   look  { look }  the character I'm working on, a few times a second, for their live window
//   poke  {}        I changed the match (ready, handed in, again...): fetch it now
//   bye   {}        I left
// Everything that counts is in the database (mp.js); a lost message only delays things,
// since both players also poll the match.
const WS = 'wss://gawytyorlxeoicczwobj.supabase.co/realtime/v1/websocket';
const KEY = 'sb_publishable_va8G3OF6qQtNe4yoEkYyew_wkQHD49z';

export class Live {
  // on(event, payload) gets every message from the other player
  constructor(token, on) {
    this.token = token;
    this.on = on;
    this.ws = null;
    this.topic = null;
    this.ref = 0;
    this.joined = false;
    this.closed = false;
    this.wait = 1000; // reconnect delay, grows while it keeps failing
  }

  open(match) {
    this.topic = `realtime:mp-${match}`;
    this.closed = false;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    let ws;
    try { ws = this.ws = new WebSocket(`${WS}?apikey=${encodeURIComponent(KEY)}&vsn=1.0.0`); } catch { this.retry(); return; }
    ws.onopen = () => {
      this.wait = 1000;
      this.push(this.topic, 'phx_join', {
        config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false },
        access_token: this.token,
      });
      this.beat = setInterval(() => this.push('phoenix', 'heartbeat', {}), 25000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.topic !== this.topic) return;
      if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !this.joined) { this.joined = true; return; }
      if (m.event === 'broadcast' && m.payload && typeof m.payload.event === 'string') this.on(m.payload.event, m.payload.payload || {});
    };
    ws.onclose = () => { this.drop(); this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch { /* closing */ } };
  }

  drop() {
    clearInterval(this.beat);
    this.joined = false;
    this.ws = null;
  }

  retry() {
    if (this.closed) return;
    clearTimeout(this.again);
    this.again = setTimeout(() => this.connect(), this.wait);
    this.wait = Math.min(8000, this.wait * 2);
  }

  push(topic, event, payload) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref) }));
    return true;
  }

  // to the other player (dropped quietly when not connected)
  send(event, payload = {}) {
    if (!this.joined) return false;
    return this.push(this.topic, 'broadcast', { type: 'broadcast', event, payload });
  }

  close() {
    if (this.joined) this.send('bye');
    this.closed = true;
    clearTimeout(this.again);
    const ws = this.ws;
    this.drop();
    if (ws) { try { ws.close(); } catch { /* closing */ } }
  }
}
