-- Friend rooms as a game (MULTIPLAYER_PLAN.md):
--  * Opening an invite link puts the friend in the room at once, under just their name, so
--    the host sees them arrive. Both see who is in and who is ready (a Ready button).
--  * When both are ready the match starts with its own first part: 90 seconds for each to
--    make a character (state 'create'), then the usual 90 seconds on each other's.
--  * After a room match ends both are back in the room, not ready, for another game.
--  * Names are usernames the player types (shown as @name): 3-20 of a-z 0-9 _, unique,
--    with a short list of words that are not allowed.
-- Players who stop checking in (closed the page) drop out of the room after 45 seconds.

-- ---------- usernames ----------
create function public.mp_bad_name(n text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select n ~ '(fuck|shit|bitch|cunt|nigg|fag|dick|pussy|whore|slut|rapist|nazi|hitler|porn|penis|vagin|sex|admin|moderator|drglowup|official)';
$$;

-- a made-up username: two words from the lists and a number (zippyotter42)
create or replace function public.mp_name()
returns text
language sql
volatile
set search_path = ''
as $$
  with w as (select public.mp_name_words() as j)
  select lower((j -> 'first' ->> floor(random() * jsonb_array_length(j -> 'first'))::int)
    || (j -> 'second' ->> floor(random() * jsonb_array_length(j -> 'second'))::int))
    || (10 + floor(random() * 90))::int
  from w;
$$;

-- names so far ("Zippy Hedgehog") become usernames (zippyhedgehog), each one once
update public.mp_players set name = left(lower(regexp_replace(name, '[^A-Za-z0-9_]', '', 'g')), 20);
update public.mp_players set name = 'player' || substr(md5(id::text), 1, 6) where length(name) < 3;
with d as (select id, name, row_number() over (partition by name order by created_at) as n from public.mp_players)
update public.mp_players p set name = left(d.name, 17) || d.n from d where d.id = p.id and d.n > 1;
alter table public.mp_players add constraint mp_players_name_ok check (name ~ '^[a-z0-9_]{3,20}$');
create unique index mp_players_name on public.mp_players (name);
alter table public.mp_players add column named boolean not null default false; -- picked by the player

-- the player row (made on first use, with a free made-up name)
create or replace function public.mp_player()
returns public.mp_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.mp_players;
begin
  if uid is null then raise exception 'not signed in'; end if;
  loop
    select * into r from public.mp_players where id = uid;
    if found then return r; end if;
    begin
      insert into public.mp_players (id, name) values (uid, public.mp_name()) returning * into r;
      return r;
    exception when unique_violation then -- that name was taken (or a second call made the row): go again
    end;
  end loop;
end;
$$;

drop function public.mp_set_name(text, text);
-- my username (with or without the @): { name }, or raises 'bad name' | 'not allowed' | 'name taken'
create function public.mp_set_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  n text := lower(ltrim(btrim(coalesce(p_name, '')), '@'));
begin
  if n !~ '^[a-z0-9_]{3,20}$' then raise exception 'bad name'; end if;
  if public.mp_bad_name(n) then raise exception 'not allowed'; end if;
  begin
    update public.mp_players set name = n, named = true where id = p.id;
  exception when unique_violation then raise exception 'name taken';
  end;
  return jsonb_build_object('name', n);
end;
$$;

create or replace function public.mp_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
begin
  return jsonb_build_object(
    'name', p.name,
    'named', p.named,
    'has_character', p.current is not null,
    'look', (select look from public.mp_characters where id = p.current),
    'gen', (select gen from public.mp_characters where id = p.current),
    'got', (select jsonb_build_object(
        'love', count(*) filter (where kind = 'love'),
        'funny', count(*) filter (where kind = 'funny'),
        'ruined', count(*) filter (where kind = 'ruined'))
      from public.mp_reactions where to_player = p.id)
  );
end;
$$;

-- ---------- the make-your-character part of a match ----------
alter table public.mp_matches drop constraint mp_matches_state_check;
alter table public.mp_matches add constraint mp_matches_state_check check (state in ('create', 'preview', 'playing', 'reveal', 'over'));

-- the character I made in the first 90 seconds (it becomes the one I bring); when both are
-- in, the turn on each other's starts: 3 s, then 90
create function public.mp_made(p_match uuid, p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
  cid uuid;
begin
  if m.state <> 'create' then return public.mp_view(m, uid); end if;
  if now() > m.ends_at + interval '30 seconds' then raise exception 'not now'; end if;
  if (case when m.a = uid then m.a_char else m.b_char end) is not null then return public.mp_view(m, uid); end if;
  insert into public.mp_characters (owner, look) values (uid, p_look) returning id into cid;
  update public.mp_players set current = cid where id = uid;
  if m.a = uid then m.a_char := cid; else m.b_char := cid; end if;
  if m.a_char is not null and m.b_char is not null then
    m.state := 'playing'; m.starts_at := now() + interval '3 seconds'; m.ends_at := m.starts_at + interval '90 seconds';
  end if;
  update public.mp_matches set a_char = m.a_char, b_char = m.b_char, state = m.state, starts_at = m.starts_at, ends_at = m.ends_at, updated_at = now()
    where id = m.id returning * into m;
  return public.mp_view(m, uid);
end;
$$;

-- ---------- rooms with a lobby ----------
alter table public.mp_rooms add column guest uuid references auth.users (id) on delete set null;
alter table public.mp_rooms add column host_ready boolean not null default false;
alter table public.mp_rooms add column guest_ready boolean not null default false;
alter table public.mp_rooms add column host_seen timestamptz not null default now();
alter table public.mp_rooms add column guest_seen timestamptz;

-- a room as one of its players sees it: { code, role, host: { name, ready }, guest (or null), match (or null) }
create function public.mp_room_json(r public.mp_rooms, uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code,
    'role', case when r.host = uid then 'host' else 'guest' end,
    'host', (select jsonb_build_object('name', p.name, 'ready', r.host_ready) from public.mp_players p where p.id = r.host),
    'guest', (select jsonb_build_object('name', p.name, 'ready', r.guest_ready) from public.mp_players p where p.id = r.guest),
    'match', (select public.mp_view(m, uid) from public.mp_matches m where m.id = r.match and m.state <> 'over')
  );
$$;

-- a room whose match is over is a lobby again: nobody ready, everyone just seen
create function public.mp_room_fresh(r public.mp_rooms)
returns public.mp_rooms
language plpgsql
security definer
set search_path = ''
as $$
begin
  if r.match is not null and coalesce((select state from public.mp_matches where id = r.match), 'over') = 'over' then
    update public.mp_rooms set match = null, host_ready = false, guest_ready = false, host_seen = now(),
      guest_seen = case when guest is null then null else now() end
      where code = r.code returning * into r;
  end if;
  return r;
end;
$$;
revoke all on function public.mp_bad_name(text) from public, anon, authenticated;
revoke all on function public.mp_room_json(public.mp_rooms, uuid) from public, anon, authenticated;
revoke all on function public.mp_room_fresh(public.mp_rooms) from public, anon, authenticated;

-- a room for a friend (no character needed: that's made in the match)
create or replace function public.mp_room_create()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  r public.mp_rooms;
begin
  if (select count(*) from public.mp_rooms where host = p.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many rooms';
  end if;
  delete from public.mp_rooms where host = p.id;
  delete from public.mp_queue where player = p.id;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    begin
      insert into public.mp_rooms (code, host) values (c, p.id) returning * into r;
      exit;
    exception when unique_violation then
    end;
  end loop;
  return public.mp_room_json(r, p.id);
end;
$$;

-- go into a friend's room by its code: the room, or { error: 'no such room' | 'room is full'
-- | 'your own room' | 'too many tries' } (not raised, so the count of wrong tries stays)
create function public.mp_room_enter(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r public.mp_rooms;
begin
  if p.room_tries >= 20 and p.room_tries_at > now() - interval '10 minutes' then return jsonb_build_object('error', 'too many tries'); end if;
  select * into r from public.mp_rooms where code = c for update;
  if not found or r.expires_at < now() or r.host_seen < now() - interval '45 seconds' then
    update public.mp_players set
      room_tries = case when room_tries_at > now() - interval '10 minutes' then room_tries + 1 else 1 end,
      room_tries_at = now()
      where id = p.id;
    return jsonb_build_object('error', 'no such room');
  end if;
  if r.host = p.id then return jsonb_build_object('error', 'your own room'); end if;
  r := public.mp_room_fresh(r);
  if r.guest is not null and r.guest <> p.id and (r.match is not null or r.guest_seen > now() - interval '45 seconds') then
    return jsonb_build_object('error', 'room is full');
  end if;
  if r.guest is distinct from p.id then
    update public.mp_rooms set guest = p.id, guest_ready = false, host_ready = false, guest_seen = now()
      where code = r.code returning * into r;
  else
    update public.mp_rooms set guest_seen = now() where code = r.code returning * into r;
  end if;
  delete from public.mp_queue where player = p.id;
  return public.mp_room_json(r, p.id);
end;
$$;

-- the room now (every couple of seconds while in it; it also says I'm still here).
-- Raises 'room closed' once it's gone (the host left, or I'm no longer in it)
create function public.mp_room_view(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.mp_rooms;
begin
  select * into r from public.mp_rooms where code = upper(p_code) and (host = uid or guest = uid) for update;
  if not found then raise exception 'room closed'; end if;
  r := public.mp_room_fresh(r);
  if r.host = uid then
    update public.mp_rooms set host_seen = now(), expires_at = greatest(expires_at, now() + interval '30 minutes')
      where code = r.code returning * into r;
    if r.match is null and r.guest is not null and r.guest_seen < now() - interval '45 seconds' then -- the guest left
      update public.mp_rooms set guest = null, guest_ready = false, host_ready = false where code = r.code returning * into r;
    end if;
  else
    if r.match is null and r.host_seen < now() - interval '45 seconds' then raise exception 'room closed'; end if;
    update public.mp_rooms set guest_seen = now() where code = r.code returning * into r;
  end if;
  return public.mp_room_json(r, uid);
end;
$$;

-- ready or not; once both are, the match starts with making characters: 3 s, then 90
create function public.mp_room_ready(p_code text, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.mp_rooms;
  m public.mp_matches;
begin
  select * into r from public.mp_rooms where code = upper(p_code) and (host = uid or guest = uid) for update;
  if not found then raise exception 'room closed'; end if;
  r := public.mp_room_fresh(r);
  if r.match is not null then return public.mp_room_json(r, uid); end if;
  if r.host = uid then
    update public.mp_rooms set host_ready = p_ready, host_seen = now() where code = r.code returning * into r;
  else
    update public.mp_rooms set guest_ready = p_ready, guest_seen = now() where code = r.code returning * into r;
  end if;
  if r.host_ready and r.guest_ready and r.guest is not null then
    insert into public.mp_matches (a, b, a_ok, b_ok, state, starts_at, ends_at)
      values (r.host, r.guest, true, true, 'create', now() + interval '3 seconds', now() + interval '93 seconds')
      returning * into m;
    update public.mp_rooms set match = m.id where code = r.code returning * into r;
  end if;
  return public.mp_room_json(r, uid);
end;
$$;

-- leave the room: the host closes it, a guest frees the seat
create function public.mp_room_leave(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  delete from public.mp_rooms where code = upper(p_code) and host = uid;
  update public.mp_rooms set guest = null, guest_ready = false, host_ready = false, match = null
    where code = upper(p_code) and guest = uid;
end;
$$;

-- the old room calls (a friend joined with a character, straight into a match)
drop function public.mp_room_wait(text);
drop function public.mp_room_join(text);
drop function public.mp_room_cancel(text);

revoke all on function public.mp_set_name(text) from public, anon;
revoke all on function public.mp_made(uuid, jsonb) from public, anon;
revoke all on function public.mp_room_enter(text) from public, anon;
revoke all on function public.mp_room_view(text) from public, anon;
revoke all on function public.mp_room_ready(text, boolean) from public, anon;
revoke all on function public.mp_room_leave(text) from public, anon;
grant execute on function public.mp_set_name(text) to authenticated;
grant execute on function public.mp_made(uuid, jsonb) to authenticated;
grant execute on function public.mp_room_enter(text) to authenticated;
grant execute on function public.mp_room_view(text) to authenticated;
grant execute on function public.mp_room_ready(text, boolean) to authenticated;
grant execute on function public.mp_room_leave(text) to authenticated;
