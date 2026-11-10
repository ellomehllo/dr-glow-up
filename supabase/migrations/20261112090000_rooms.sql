-- Multiplayer rooms (MULTIPLAYER_PLAN.md, milestone 4): play with a friend. The host makes a
-- room and gets a short code (and a link, doctorglowup.site/?room=CODE); the friend types the
-- code or opens the link, and the two are in a match like any other (mp_matches: preview,
-- 90 s turn, reveal). Codes are 6 characters with no look-alikes (no O/0, I/1/L) and last
-- 30 minutes; wrong guesses are limited. Also: mp_me now hands back the character I bring.

create table public.mp_rooms (
  code text primary key check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host uuid not null references auth.users (id) on delete cascade,
  match uuid references public.mp_matches (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index mp_rooms_host on public.mp_rooms (host, created_at desc);
alter table public.mp_rooms enable row level security;
revoke all on public.mp_rooms from anon, authenticated;

-- wrong room codes a player has tried lately (limits guessing)
alter table public.mp_players add column room_tries int not null default 0;
alter table public.mp_players add column room_tries_at timestamptz;

-- who I am, and the character I bring (as it is now: maybe as my last partner left it)
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
    'has_character', p.current is not null,
    'look', (select look from public.mp_characters where id = p.current),
    'gen', (select gen from public.mp_characters where id = p.current)
  );
end;
$$;

-- make a room (any open room of mine closes): { code, expires_at }
create function public.mp_room_create()
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
  if p.current is null then raise exception 'no character'; end if;
  if (select count(*) from public.mp_rooms where host = p.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many rooms';
  end if;
  delete from public.mp_rooms where host = p.id and match is null;
  delete from public.mp_queue where player = p.id;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    begin
      insert into public.mp_rooms (code, host) values (c, p.id) returning * into r;
      exit;
    exception when unique_violation then
      -- taken: try another
    end;
  end loop;
  return jsonb_build_object('code', r.code, 'expires_at', r.expires_at);
end;
$$;

-- the host waits: the match once the friend is in, else null (raises if the room is gone)
create function public.mp_room_wait(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.mp_rooms;
  m public.mp_matches;
begin
  select * into r from public.mp_rooms where code = upper(p_code) and host = auth.uid();
  if not found or (r.match is null and r.expires_at < now()) then raise exception 'room closed'; end if;
  if r.match is null then return null; end if;
  select * into m from public.mp_matches where id = r.match;
  return public.mp_view(m, auth.uid());
end;
$$;

-- join a friend's room by its code: the match, or { error } (not raised: a raise would undo
-- the count of wrong tries along with everything else)
create function public.mp_room_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r public.mp_rooms;
  m public.mp_matches;
begin
  if p.current is null then return jsonb_build_object('error', 'no character'); end if;
  if p.room_tries >= 20 and p.room_tries_at > now() - interval '10 minutes' then return jsonb_build_object('error', 'too many tries'); end if;
  select * into r from public.mp_rooms where code = c for update;
  if not found or (r.match is null and r.expires_at < now())
     or (select current from public.mp_players where id = r.host) is null then
    update public.mp_players set
      room_tries = case when room_tries_at > now() - interval '10 minutes' then room_tries + 1 else 1 end,
      room_tries_at = now()
      where id = p.id;
    return jsonb_build_object('error', 'no such room');
  end if;
  if r.host = p.id then return jsonb_build_object('error', 'your own room'); end if;
  if r.match is not null then
    select * into m from public.mp_matches where id = r.match;
    if m.b = p.id then return public.mp_view(m, p.id); end if; -- joined already (a second tap)
    return jsonb_build_object('error', 'room is full');
  end if;
  delete from public.mp_queue where player = p.id;
  insert into public.mp_matches (a, b, a_char, b_char)
    values (r.host, p.id, (select current from public.mp_players where id = r.host), p.current)
    returning * into m;
  update public.mp_rooms set match = m.id where code = r.code;
  return public.mp_view(m, p.id);
end;
$$;

-- close my room (stop waiting)
create function public.mp_room_cancel(p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.mp_rooms where code = upper(p_code) and host = auth.uid() and match is null;
$$;

revoke all on function public.mp_room_create() from public, anon;
revoke all on function public.mp_room_wait(text) from public, anon;
revoke all on function public.mp_room_join(text) from public, anon;
revoke all on function public.mp_room_cancel(text) from public, anon;
grant execute on function public.mp_room_create() to authenticated;
grant execute on function public.mp_room_wait(text) to authenticated;
grant execute on function public.mp_room_join(text) to authenticated;
grant execute on function public.mp_room_cancel(text) to authenticated;
