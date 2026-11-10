-- Rooms of 2 to 4 players (MULTIPLAYER_PLAN.md). A room game: everyone makes a character
-- (90 s), then the characters go round: in round r each player works on the character of
-- the player r seats before them, as it is after the round before (90 s each). With n
-- players that is n - 1 rounds, so every character passes through every other player once.
-- The reveal shows every character as it came out; each player reacts to how theirs turned
-- out, and that counts for everyone who worked on it.
-- Random matchmaking stays one on one (mp_matches); rooms now play these games instead.

-- ---------- the games ----------
create table public.mp_games (
  id uuid primary key default gen_random_uuid(),
  room text, -- the code it was played under (rooms come and go)
  n int not null check (n between 2 and 4),
  state text not null default 'create' check (state in ('create', 'playing', 'reveal', 'over')),
  round int not null default 0, -- 0 while making characters
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.mp_game_players (
  game uuid not null references public.mp_games (id) on delete cascade,
  seat int not null check (seat between 0 and 3),
  player uuid not null references auth.users (id) on delete cascade,
  made uuid references public.mp_characters (id) on delete set null, -- as they made it
  cur uuid references public.mp_characters (id) on delete set null,  -- as it is now
  primary key (game, seat),
  unique (game, player)
);
create index mp_game_players_player on public.mp_game_players (player);
-- one row per player per round: whose character they work on, and what came of it
create table public.mp_game_work (
  game uuid not null references public.mp_games (id) on delete cascade,
  round int not null,
  seat int not null,  -- who works
  owner int not null, -- whose character (seat)
  base uuid references public.mp_characters (id) on delete set null,
  done uuid references public.mp_characters (id) on delete set null,
  primary key (game, round, seat)
);
create table public.mp_game_reactions (
  game uuid not null references public.mp_games (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade, -- about their own character
  kind text not null check (kind in ('love', 'funny', 'ruined')),
  created_at timestamptz not null default now(),
  primary key (game, player)
);

-- ---------- rooms: members instead of one guest ----------
delete from public.mp_rooms; -- rooms only last a while; the old shape goes
drop function public.mp_room_json(public.mp_rooms, uuid);
drop function public.mp_room_fresh(public.mp_rooms);
drop function public.mp_made(uuid, jsonb);
alter table public.mp_rooms drop column guest, drop column host_ready, drop column guest_ready,
  drop column host_seen, drop column guest_seen, drop column match;
alter table public.mp_rooms add column game uuid references public.mp_games (id) on delete set null;
create table public.mp_room_members (
  code text not null references public.mp_rooms (code) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  ready boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key (code, player)
);
create index mp_room_members_player on public.mp_room_members (player);

alter table public.mp_games enable row level security;
alter table public.mp_game_players enable row level security;
alter table public.mp_game_work enable row level security;
alter table public.mp_game_reactions enable row level security;
alter table public.mp_room_members enable row level security;
revoke all on public.mp_games, public.mp_game_players, public.mp_game_work, public.mp_game_reactions, public.mp_room_members from anon, authenticated;

-- ---------- game helpers (not callable by players) ----------
-- a game I'm in, locked
create function public.mp_game_mine(p_game uuid)
returns public.mp_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.mp_games;
begin
  select * into g from public.mp_games
    where id = p_game and exists (select 1 from public.mp_game_players where game = p_game and player = auth.uid())
    for update;
  if not found then raise exception 'no such game'; end if;
  return g;
end;
$$;

-- round r begins: each player gets the character r seats before them, as it is now; 3 s, then 90
create function public.mp_game_round(p_game uuid, p_round int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := (select g.n from public.mp_games g where g.id = p_game);
begin
  insert into public.mp_game_work (game, round, seat, owner, base)
    select p_game, p_round, gp.seat, o.seat, o.cur
    from public.mp_game_players gp
    join public.mp_game_players o on o.game = p_game and o.seat = ((gp.seat - p_round) % n + n) % n
    where gp.game = p_game;
  update public.mp_games set round = p_round, state = 'playing',
    starts_at = now() + interval '3 seconds', ends_at = now() + interval '93 seconds', updated_at = now()
    where id = p_game;
end;
$$;

-- a game as one of its players sees it:
--   { id, game: true, n, state, round, rounds, starts_at, ends_at, now, seat,
--     players: [{ seat, name, made, done }], partner (whose character I work on), theirs_seat,
--     worker (who works on mine), me_done, mine_done, mine (my character this round), theirs,
--     results (at the reveal): [{ seat, name, first, look, by: [names], kind }] }
create function public.mp_game_view(g public.mp_games, uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ps as (
    select gp.*, p.name from public.mp_game_players gp join public.mp_players p on p.id = gp.player where gp.game = g.id
  ),
  me as (select seat, cur from ps where player = uid),
  w as (select * from public.mp_game_work where game = g.id and round = g.round),
  mywork as (select w.* from w join me on w.seat = me.seat),
  onmine as (select w.* from w join me on w.owner = me.seat)
  select jsonb_build_object(
    'id', g.id, 'game', true, 'n', g.n, 'state', g.state, 'round', g.round, 'rounds', g.n - 1,
    'starts_at', g.starts_at, 'ends_at', g.ends_at, 'now', now(),
    'seat', (select seat from me),
    'players', (select jsonb_agg(jsonb_build_object('seat', ps.seat, 'name', ps.name, 'made', ps.made is not null,
        'done', exists (select 1 from w where w.seat = ps.seat and w.done is not null)) order by ps.seat) from ps),
    'partner', (select ps.name from ps join mywork on ps.seat = mywork.owner),
    'theirs_seat', (select owner from mywork),
    'worker', (select ps.name from ps join onmine on ps.seat = onmine.seat),
    'me_done', coalesce((select done is not null from mywork), false),
    'mine_done', coalesce((select done is not null from onmine), false),
    'mine', (select c.look from public.mp_characters c where c.id = coalesce((select base from onmine), (select cur from me))),
    'theirs', (select c.look from public.mp_characters c join mywork on c.id = mywork.base),
    'results', case when g.state in ('reveal', 'over') then (select jsonb_agg(jsonb_build_object(
        'seat', ps.seat, 'name', ps.name,
        'first', (select look from public.mp_characters where id = ps.made),
        'look', (select look from public.mp_characters where id = ps.cur),
        'by', (select coalesce(jsonb_agg(wp.name order by x.round), '[]'::jsonb)
                 from public.mp_game_work x join ps wp on wp.seat = x.seat where x.game = g.id and x.owner = ps.seat),
        'kind', (select kind from public.mp_game_reactions r where r.game = g.id and r.player = ps.player)
      ) order by ps.seat) from ps) end
  );
$$;
revoke all on function public.mp_game_mine(uuid) from public, anon, authenticated;
revoke all on function public.mp_game_round(uuid, int) from public, anon, authenticated;
revoke all on function public.mp_game_view(public.mp_games, uuid) from public, anon, authenticated;

-- ---------- game calls ----------
create function public.mp_game_state(p_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.mp_games;
begin
  select * into g from public.mp_games
    where id = p_game and exists (select 1 from public.mp_game_players where game = p_game and player = auth.uid());
  if not found then raise exception 'no such game'; end if;
  return public.mp_game_view(g, auth.uid());
end;
$$;

-- the character I made in the first 90 seconds; once everyone's is in, round 1
create function public.mp_game_made(p_game uuid, p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.mp_games := public.mp_game_mine(p_game);
  cid uuid;
begin
  if g.state <> 'create' then return public.mp_game_view(g, uid); end if;
  if now() > g.ends_at + interval '30 seconds' then raise exception 'not now'; end if;
  if (select made from public.mp_game_players where game = g.id and player = uid) is not null then return public.mp_game_view(g, uid); end if;
  insert into public.mp_characters (owner, look) values (uid, p_look) returning id into cid;
  update public.mp_players set current = cid where id = uid;
  update public.mp_game_players set made = cid, cur = cid where game = g.id and player = uid;
  if not exists (select 1 from public.mp_game_players where game = g.id and made is null) then
    perform public.mp_game_round(g.id, 1);
  end if;
  select * into g from public.mp_games where id = g.id;
  return public.mp_game_view(g, uid);
end;
$$;

-- what I made of the character I had this round. p_mine: the one working on MY character is
-- gone; it goes in as they last showed it (from 10 s after the bell). When every piece of
-- the round is in: the next round, or after the last one the reveal
create function public.mp_game_submit(p_game uuid, p_look jsonb, p_mine boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.mp_games := public.mp_game_mine(p_game);
  myseat int := (select seat from public.mp_game_players where game = g.id and player = uid);
  wk public.mp_game_work;
  prev public.mp_characters;
  editor uuid;
  cid uuid;
begin
  if g.state <> 'playing' or now() > g.ends_at + interval '30 seconds' then raise exception 'not now'; end if;
  if p_mine then
    if now() < g.ends_at + interval '10 seconds' then raise exception 'wait for them'; end if;
    select * into wk from public.mp_game_work where game = g.id and round = g.round and owner = myseat;
  else
    select * into wk from public.mp_game_work where game = g.id and round = g.round and seat = myseat;
  end if;
  if wk.done is not null then return public.mp_game_view(g, uid); end if;
  select * into prev from public.mp_characters where id = wk.base;
  if not found then raise exception 'no character'; end if;
  editor := (select player from public.mp_game_players where game = g.id and seat = wk.seat);
  insert into public.mp_characters (owner, parent, gen, edited_by, look)
    values (prev.owner, prev.id, prev.gen + 1, editor, p_look) returning id into cid;
  update public.mp_game_work set done = cid where game = g.id and round = g.round and seat = wk.seat;
  update public.mp_game_players set cur = cid where game = g.id and seat = wk.owner;
  update public.mp_players set current = cid where id = prev.owner and current = prev.id;
  if not exists (select 1 from public.mp_game_work where game = g.id and round = g.round and done is null) then
    if g.round < g.n - 1 then perform public.mp_game_round(g.id, g.round + 1);
    else update public.mp_games set state = 'reveal', updated_at = now() where id = g.id;
    end if;
  else
    update public.mp_games set updated_at = now() where id = g.id;
  end if;
  select * into g from public.mp_games where id = g.id;
  return public.mp_game_view(g, uid);
end;
$$;

-- what I think of how my character turned out (counts for everyone who worked on it)
create function public.mp_game_react(p_game uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.mp_games := public.mp_game_mine(p_game);
begin
  if g.state not in ('reveal', 'over') then raise exception 'not now'; end if;
  insert into public.mp_game_reactions (game, player, kind) values (g.id, uid, p_kind)
    on conflict (game, player) do update set kind = excluded.kind, created_at = now();
  return public.mp_game_view(g, uid);
end;
$$;

-- the game ends for everyone (someone left, or it's back to the room)
create function public.mp_game_end(p_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.mp_games := public.mp_game_mine(p_game);
begin
  update public.mp_games set state = 'over', updated_at = now() where id = g.id;
end;
$$;

-- ---------- rooms ----------
-- a room as one of its players sees it:
--   { code, role: 'host'|'guest', max, players: [{ name, ready, host, you }] (in the order
--     they came), game (a view, or null) }
create function public.mp_room_json(p_code text, uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code, 'role', case when r.host = uid then 'host' else 'guest' end, 'max', 4,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'ready', m.ready, 'host', m.player = r.host, 'you', m.player = uid)
        order by m.joined_at), '[]'::jsonb)
      from public.mp_room_members m join public.mp_players p on p.id = m.player where m.code = r.code),
    'game', (select public.mp_game_view(g, uid) from public.mp_games g where g.id = r.game and g.state <> 'over')
  )
  from public.mp_rooms r where r.code = p_code;
$$;

-- keep a room tidy: a game that's over leaves everyone in the room, not ready; players who
-- stopped checking in (45 s, and no game on) are gone
create function public.mp_room_tidy(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.mp_rooms;
begin
  select * into r from public.mp_rooms where code = p_code;
  if r.game is not null and coalesce((select state from public.mp_games where id = r.game), 'over') = 'over' then
    update public.mp_rooms set game = null where code = p_code;
    update public.mp_room_members set ready = false, seen_at = now() where code = p_code;
    r.game := null;
  end if;
  if r.game is null then
    delete from public.mp_room_members where code = p_code and player <> r.host and seen_at < now() - interval '45 seconds';
  end if;
end;
$$;

-- out of every other room (a player is in one room at a time)
create function public.mp_room_out(uid uuid, p_keep text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mp_games set state = 'over', updated_at = now()
    where state <> 'over' and id in (select game from public.mp_rooms r join public.mp_room_members m on m.code = r.code
      where m.player = uid and r.code <> coalesce(p_keep, '') and r.game is not null);
  delete from public.mp_rooms where host = uid and code <> coalesce(p_keep, '');
  delete from public.mp_room_members where player = uid and code <> coalesce(p_keep, '');
end;
$$;
revoke all on function public.mp_room_json(text, uuid) from public, anon, authenticated;
revoke all on function public.mp_room_tidy(text) from public, anon, authenticated;
revoke all on function public.mp_room_out(uuid, text) from public, anon, authenticated;

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
begin
  if (select count(*) from public.mp_rooms where host = p.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many rooms';
  end if;
  perform public.mp_room_out(p.id, null);
  delete from public.mp_queue where player = p.id;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    begin
      insert into public.mp_rooms (code, host) values (c, p.id);
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into public.mp_room_members (code, player) values (c, p.id);
  return public.mp_room_json(c, p.id);
end;
$$;

-- into a friend's room by code: the room, or { error: 'no such room' | 'room is full' |
-- 'game on' | 'your own room' | 'too many tries' } (not raised: the wrong-try count stays)
create or replace function public.mp_room_enter(p_code text)
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
  if not found or r.expires_at < now()
     or (r.game is null and coalesce((select seen_at from public.mp_room_members where code = c and player = r.host), now() - interval '1 hour') < now() - interval '45 seconds') then
    update public.mp_players set
      room_tries = case when room_tries_at > now() - interval '10 minutes' then room_tries + 1 else 1 end,
      room_tries_at = now()
      where id = p.id;
    return jsonb_build_object('error', 'no such room');
  end if;
  if r.host = p.id then return jsonb_build_object('error', 'your own room'); end if;
  perform public.mp_room_tidy(c);
  if exists (select 1 from public.mp_room_members where code = c and player = p.id) then
    update public.mp_room_members set seen_at = now() where code = c and player = p.id;
    return public.mp_room_json(c, p.id);
  end if;
  if (select game from public.mp_rooms where code = c) is not null then return jsonb_build_object('error', 'game on'); end if;
  if (select count(*) from public.mp_room_members where code = c) >= 4 then return jsonb_build_object('error', 'room is full'); end if;
  perform public.mp_room_out(p.id, c);
  delete from public.mp_queue where player = p.id;
  insert into public.mp_room_members (code, player) values (c, p.id);
  return public.mp_room_json(c, p.id);
end;
$$;

-- the room now (every couple of seconds while in it; it also says I'm still here).
-- Raises 'room closed' once it's gone (the host left) or I'm not in it any more
create or replace function public.mp_room_view(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c text := upper(p_code);
  r public.mp_rooms;
begin
  select * into r from public.mp_rooms where code = c for update;
  if not found then raise exception 'room closed'; end if;
  perform public.mp_room_tidy(c);
  update public.mp_room_members set seen_at = now() where code = c and player = uid;
  if not found then raise exception 'room closed'; end if;
  if r.host = uid then
    update public.mp_rooms set expires_at = greatest(expires_at, now() + interval '30 minutes') where code = c;
  elsif (select game from public.mp_rooms where code = c) is null
     and coalesce((select seen_at from public.mp_room_members where code = c and player = r.host), now() - interval '1 hour') < now() - interval '45 seconds' then
    raise exception 'room closed';
  end if;
  return public.mp_room_json(c, uid);
end;
$$;

-- ready or not; once everyone (2 to 4) is ready, the game starts with making characters
create or replace function public.mp_room_ready(p_code text, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c text := upper(p_code);
  r public.mp_rooms;
  gid uuid;
  n int;
begin
  select * into r from public.mp_rooms where code = c for update;
  if not found then raise exception 'room closed'; end if;
  perform public.mp_room_tidy(c);
  if (select game from public.mp_rooms where code = c) is not null then return public.mp_room_json(c, uid); end if;
  update public.mp_room_members set ready = p_ready, seen_at = now() where code = c and player = uid;
  if not found then raise exception 'room closed'; end if;
  n := (select count(*) from public.mp_room_members where code = c);
  if n >= 2 and not exists (select 1 from public.mp_room_members where code = c and not ready) then
    insert into public.mp_games (room, n, state, starts_at, ends_at)
      values (c, n, 'create', now() + interval '3 seconds', now() + interval '93 seconds') returning id into gid;
    insert into public.mp_game_players (game, seat, player)
      select gid, (row_number() over (order by joined_at)) - 1, player from public.mp_room_members where code = c;
    update public.mp_rooms set game = gid where code = c;
  end if;
  return public.mp_room_json(c, uid);
end;
$$;

-- leave the room: the host closes it; anyone leaving ends a game that's on
create or replace function public.mp_room_leave(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c text := upper(p_code);
  r public.mp_rooms;
begin
  select * into r from public.mp_rooms where code = c for update;
  if not found or not exists (select 1 from public.mp_room_members where code = c and player = uid) then return; end if;
  if r.game is not null then update public.mp_games set state = 'over', updated_at = now() where id = r.game and state <> 'over'; end if;
  if r.host = uid then delete from public.mp_rooms where code = c;
  else delete from public.mp_room_members where code = c and player = uid;
  end if;
end;
$$;

-- what others thought of my work: one-on-one reactions to me, and room games where I
-- worked on a character its owner reacted to
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
      from (
        select kind from public.mp_reactions where to_player = p.id
        union all
        select r.kind from public.mp_game_reactions r
          join public.mp_game_players op on op.game = r.game and op.player = r.player
          join public.mp_game_work w on w.game = r.game and w.owner = op.seat
          join public.mp_game_players wp on wp.game = w.game and wp.seat = w.seat
          where wp.player = p.id
      ) k)
  );
end;
$$;

revoke all on function public.mp_game_state(uuid) from public, anon;
revoke all on function public.mp_game_made(uuid, jsonb) from public, anon;
revoke all on function public.mp_game_submit(uuid, jsonb, boolean) from public, anon;
revoke all on function public.mp_game_react(uuid, text) from public, anon;
revoke all on function public.mp_game_end(uuid) from public, anon;
grant execute on function public.mp_game_state(uuid) to authenticated;
grant execute on function public.mp_game_made(uuid, jsonb) to authenticated;
grant execute on function public.mp_game_submit(uuid, jsonb, boolean) to authenticated;
grant execute on function public.mp_game_react(uuid, text) to authenticated;
grant execute on function public.mp_game_end(uuid) to authenticated;
