// Multiplayer API check against the live Supabase functions (MULTIPLAYER_PLAN.md). Plays
// every flow with throwaway anonymous players and checks each answer. Run it through
// tests/mp-test.sh, which deletes the players afterwards. Each new player's id is appended
// to the file named in MP_IDS as soon as it exists, so cleanup works even after a crash.
import { appendFileSync } from 'node:fs';

const API = 'https://gawytyorlxeoicczwobj.supabase.co';
const KEY = 'sb_publishable_va8G3OF6qQtNe4yoEkYyew_wkQHD49z';
const WS = `wss://gawytyorlxeoicczwobj.supabase.co/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`;
const IDS = process.env.MP_IDS;

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}  got: ${JSON.stringify(got).slice(0, 200)}`); }
};
const H = (t) => ({ apikey: KEY, 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
const look = (tag) => ({ v: 1, who: { kind: 'girl', tag }, s: { nose: 1 }, cracks: [], wrk: [], dirt: null });

async function player() {
  const r = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: H(), body: '{}' });
  const d = await r.json();
  if (!d.access_token) throw new Error(`sign-up failed: ${JSON.stringify(d)}`);
  if (IDS) appendFileSync(IDS, `${d.user.id}\n`);
  const p = { id: d.user.id, t: d.access_token };
  p.rpc = async (name, args = {}) => {
    const res = await fetch(`${API}/rest/v1/rpc/${name}`, { method: 'POST', headers: H(p.t), body: JSON.stringify(args) });
    const text = await res.text();
    if (!res.ok) { let m = ''; try { m = JSON.parse(text).message; } catch { m = text; } return { err: m, status: res.status }; }
    return text ? JSON.parse(text) : null;
  };
  return p;
}

async function realtime() {
  const topic = `realtime:mp-test-${Math.random().toString(36).slice(2)}`;
  const join = (got) => new Promise((res, rej) => {
    const ws = new WebSocket(WS);
    const t = setTimeout(() => rej(new Error('realtime join timeout')), 8000);
    ws.onopen = () => ws.send(JSON.stringify({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' }, private: false } }, ref: '1' }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.event === 'phx_reply' && m.ref === '1') { clearTimeout(t); res(ws); }
      if (m.event === 'broadcast') got.push(m.payload);
    };
  });
  const got = [];
  const a = await join([]), b = await join(got);
  a.send(JSON.stringify({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'look', payload: { look: look('live') } }, ref: '2' }));
  await new Promise((r) => setTimeout(r, 1500));
  a.close(); b.close();
  ok('realtime: a look sent by one player reaches the other', got.some((p) => p.event === 'look' && p.payload.look.who.tag === 'live'), got);
}

console.log('players');
const A = await player(), B = await player(), C = await player();
const me = await A.rpc('mp_me');
ok('mp_me gives a made-up username, not picked yet, and no character', /^[a-z]+[0-9]{2}$/.test(me.name) && me.named === false && me.has_character === false, me);
ok('searching without a character is refused', (await A.rpc('mp_join')).err === 'no character');
ok('a bad look is refused', !!(await A.rpc('mp_save', { p_look: { v: 2 } })).err);
for (const [p, tag] of [[A, 'A0'], [B, 'B0'], [C, 'C0']]) await p.rpc('mp_save', { p_look: look(tag) });
ok('mp_me returns the saved character', (await A.rpc('mp_me')).look.who.tag === 'A0');

console.log('names');
const nick = `t_${Math.random().toString(36).slice(2, 10)}`;
ok('a typed name is taken (the @ and capitals dropped)', (await B.rpc('mp_set_name', { p_name: `@${nick.toUpperCase()}` })).name === nick);
ok('mp_me shows it, picked', ((m) => m.name === nick && m.named === true)(await B.rpc('mp_me')));
ok('too short is refused', (await C.rpc('mp_set_name', { p_name: 'ab' })).err === 'bad name');
ok('spaces and symbols are refused', (await C.rpc('mp_set_name', { p_name: 'hi there!' })).err === 'bad name');
ok('a rude name is refused', (await C.rpc('mp_set_name', { p_name: 'bigshit99' })).err === 'not allowed');
ok("someone else's name is refused", (await C.rpc('mp_set_name', { p_name: nick })).err === 'name taken');

console.log('privacy');
ok('tables are closed', (await fetch(`${API}/rest/v1/mp_matches?select=id`, { headers: H(A.t) })).status === 403);
ok('helpers are not callable', (await fetch(`${API}/rest/v1/rpc/mp_view`, { method: 'POST', headers: H(A.t), body: '{}' })).status === 404);

console.log('random match');
ok('first searcher waits', (await A.rpc('mp_join')) === null);
let vb = await B.rpc('mp_join');
ok('second searcher is matched with the first', vb && vb.state === 'preview' && vb.theirs.who.tag === 'A0', vb);
ok('the partner sees the chosen name', (await A.rpc('mp_join')).partner === nick);
const m1 = vb.id;
ok('the first searcher sees the same match', (await A.rpc('mp_join')).id === m1);
ok('a stranger cannot see it', (await C.rpc('mp_state', { p_match: m1 })).err === 'no such match');
await A.rpc('mp_ready', { p_match: m1 });
let v = await B.rpc('mp_ready', { p_match: m1 });
ok('both ready: the turn is on for 93 s', v.state === 'playing' && Math.round((Date.parse(v.ends_at) - Date.parse(v.now)) / 1000) === 93, v);
ok('no skipping once it started', (await A.rpc('mp_skip', { p_match: m1 })).err === 'too late to skip');
ok('no handing in for a partner before the bell', (await A.rpc('mp_submit', { p_match: m1, p_look: look('x'), p_mine: true })).err === 'wait for them');
await A.rpc('mp_submit', { p_match: m1, p_look: look('B1 by A') });
v = await B.rpc('mp_submit', { p_match: m1, p_look: look('A1 by B') });
ok('both handed in: the reveal, each with their own after', v.state === 'reveal' && v.mine_after.who.tag === 'B1 by A' && v.theirs_after.who.tag === 'A1 by B', v);

console.log('reactions');
ok('an unknown reaction is refused', !!(await A.rpc('mp_react', { p_match: m1, p_kind: 'meh' })).err);
await A.rpc('mp_react', { p_match: m1, p_kind: 'love' });
v = await B.rpc('mp_state', { p_match: m1 });
ok('the other player sees the reaction', v.reactions.some((r) => r.from === 'them' && r.kind === 'love'), v.reactions);
ok('the reaction counts toward their work', (await B.rpc('mp_me')).got.love === 1);

console.log('again');
await A.rpc('mp_again', { p_match: m1 });
v = await B.rpc('mp_again', { p_match: m1 });
ok('both want again: round 2 on the characters as left', v.state === 'playing' && v.round === 2 && v.mine.who.tag === 'B1 by A' && v.theirs.who.tag === 'A1 by B', v);
await A.rpc('mp_end', { p_match: m1 });
ok('leaving ends the match for both', (await B.rpc('mp_state', { p_match: m1 })).state === 'over');

console.log('lineage');
const hist = await A.rpc('mp_history');
ok('history: newest first, back to as made', hist.length === 2 && hist[0].look.who.tag === 'A1 by B' && hist[0].by && hist[1].by === null, hist.map((h) => [h.gen, h.by]));
ok('the next match brings the character as left', (await A.rpc('mp_me')).look.who.tag === 'A1 by B');

console.log('skip');
await A.rpc('mp_join');
vb = await B.rpc('mp_join');
ok('matched again', vb && vb.state === 'preview', vb);
await B.rpc('mp_skip', { p_match: vb.id });
ok('after a skip they are not paired again', (await A.rpc('mp_join')) === null && (await B.rpc('mp_join')) === null);
await A.rpc('mp_leave'); await B.rpc('mp_leave');

console.log('rooms');
const D = await player(); // a friend with no character yet
const dName = (await D.rpc('mp_me')).name;
let room = await A.rpc('mp_room_create');
ok('a room has a 6 character code without look-alikes, and no guest yet', /^[A-HJKMNP-Z2-9]{6}$/.test(room.code) && room.role === 'host' && room.guest === null, room);
ok('your own code is refused', (await A.rpc('mp_room_enter', { p_code: room.code })).error === 'your own room');
ok('a wrong code is refused', (await C.rpc('mp_room_enter', { p_code: 'ZZZZ22' })).error === 'no such room');
let rd = await D.rpc('mp_room_enter', { p_code: room.code.toLowerCase() });
ok('a friend with no character gets in by code (any case), by name', rd.role === 'guest' && rd.guest && rd.guest.name === dName && rd.host.name === me.name, rd);
ok('the host sees them in the room', (await A.rpc('mp_room_view', { p_code: room.code })).guest.name === dName);
ok('a full room is refused', (await B.rpc('mp_room_enter', { p_code: room.code })).error === 'room is full');
let ra = await A.rpc('mp_room_ready', { p_code: room.code, p_ready: true });
ok('one ready: no game yet', ra.match === null && ra.host.ready === true && ra.guest.ready === false, ra);
rd = await D.rpc('mp_room_ready', { p_code: room.code, p_ready: true });
ok('both ready: the game starts with 93 s to make characters', rd.match && rd.match.state === 'create' && Math.round((Date.parse(rd.match.ends_at) - Date.parse(rd.match.now)) / 1000) === 93, rd.match);
const m2 = rd.match.id;
ok('the host is in the same game', (await A.rpc('mp_room_view', { p_code: room.code })).match.id === m2);
v = await A.rpc('mp_made', { p_match: m2, p_look: look('A made') });
ok('one made theirs: still making', v.state === 'create' && v.mine.who.tag === 'A made', v);
v = await D.rpc('mp_made', { p_match: m2, p_look: look('D made') });
ok('both made: the turn on each other\'s starts', v.state === 'playing' && v.mine.who.tag === 'D made' && v.theirs.who.tag === 'A made', v);
ok('what they made is the character they bring', (await D.rpc('mp_me')).look.who.tag === 'D made');
await A.rpc('mp_end', { p_match: m2 });
rd = await D.rpc('mp_room_view', { p_code: room.code });
ok('after the game: back in the room, nobody ready', rd.match === null && rd.guest.name === dName && !rd.host.ready && !rd.guest.ready, rd);
await D.rpc('mp_room_leave', { p_code: room.code });
ok('a friend who leaves frees the seat', (await A.rpc('mp_room_view', { p_code: room.code })).guest === null);
await A.rpc('mp_room_leave', { p_code: room.code });
ok('a room the host left is closed', (await D.rpc('mp_room_enter', { p_code: room.code })).error === 'no such room');
let last;
for (let i = 0; i < 21; i++) last = await C.rpc('mp_room_enter', { p_code: `QQQQQ${'23456789'[i % 8]}` });
ok('guessing is limited', last.error === 'too many tries', last);

console.log('realtime');
await realtime();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
