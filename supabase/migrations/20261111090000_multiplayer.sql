-- Multiplayer "Salon Swap" (MULTIPLAYER_PLAN.md): live matches between two players, each
-- working 90 seconds on the other's character, then a before and after and reactions.
--
-- Players are the same anonymous Supabase users as the cloud save. Every table here is
-- closed to them (RLS on, no policies, no grants): everything goes through the mp_*
-- functions below, which check who is asking and what state the match is in, and hand
-- back one JSON view of the match (mp_view). Looks are js/look.js JSON, capped in size.
-- No free text anywhere: names are made here from fixed word lists.

-- ---------- tables ----------
create table public.mp_players (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  current uuid, -- the character they bring to their next match (fk below)
  skipped uuid[] not null default '{}', -- the last few players they skipped: not matched again for now
  created_at timestamptz not null default now()
);

-- every version of every character: a player's own (gen 0, made in the creator) and each
-- turn someone else had on it (parent: the version before, edited_by: who had the turn)
create table public.mp_characters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  parent uuid references public.mp_characters (id) on delete set null,
  gen int not null default 0 check (gen >= 0),
  edited_by uuid references auth.users (id) on delete set null,
  look jsonb not null check (jsonb_typeof(look) = 'object' and look ->> 'v' = '1' and octet_length(look::text) <= 20000),
  created_at timestamptz not null default now()
);
create index mp_characters_owner on public.mp_characters (owner, created_at desc);
create index mp_characters_parent on public.mp_characters (parent);

alter table public.mp_players add constraint mp_players_current_fkey
  foreign key (current) references public.mp_characters (id) on delete set null;

-- players looking for a match right now (seen_at: their last call; stale after 12 s)
create table public.mp_queue (
  player uuid primary key references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);

-- a match: preview (both see who they got; skip or ready) -> playing (90 s) -> reveal
-- (before and after, reactions; again starts the next round) -> over
create table public.mp_matches (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  a_char uuid references public.mp_characters (id) on delete set null, -- a's character this round
  b_char uuid references public.mp_characters (id) on delete set null,
  a_done uuid references public.mp_characters (id) on delete set null, -- what a made of b's character
  b_done uuid references public.mp_characters (id) on delete set null, -- what b made of a's character
  a_ok boolean not null default false, b_ok boolean not null default false,     -- ready after the preview
  a_again boolean not null default false, b_again boolean not null default false, -- another round
  state text not null default 'preview' check (state in ('preview', 'playing', 'reveal', 'over')),
  round int not null default 1,
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (a <> b)
);
create index mp_matches_a on public.mp_matches (a, updated_at desc);
create index mp_matches_b on public.mp_matches (b, updated_at desc);

create table public.mp_reactions (
  match uuid not null references public.mp_matches (id) on delete cascade,
  round int not null,
  from_player uuid not null references auth.users (id) on delete cascade,
  to_player uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('love', 'funny', 'ruined')),
  created_at timestamptz not null default now(),
  primary key (match, round, from_player)
);

alter table public.mp_players enable row level security;
alter table public.mp_characters enable row level security;
alter table public.mp_queue enable row level security;
alter table public.mp_matches enable row level security;
alter table public.mp_reactions enable row level security;
revoke all on public.mp_players, public.mp_characters, public.mp_queue, public.mp_matches, public.mp_reactions from anon, authenticated;

-- ---------- helpers (not callable by players) ----------
-- a made-up name: an adjective and an animal
create function public.mp_name()
returns text
language sql
volatile
set search_path = ''
as $$
  select (array['Pink','Sunny','Fizzy','Mint','Comet','Bubbly','Jolly','Cosmic','Peachy','Breezy','Sparkly','Lucky','Zippy','Cozy','Velvet','Rosy'])[1 + floor(random() * 16)::int]
    || ' ' ||
    (array['Otter','Panda','Koala','Llama','Fox','Penguin','Bunny','Hedgehog','Sloth','Dolphin','Kitten','Puffin','Gecko','Moose','Lemur','Walrus'])[1 + floor(random() * 16)::int];
$$;

-- the caller's player row (made on first use)
create function public.mp_player()
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
  select * into r from public.mp_players where id = uid;
  if not found then
    insert into public.mp_players (id, name) values (uid, public.mp_name()) returning * into r;
  end if;
  return r;
end;
$$;

-- a match as one player sees it: their side, the other player's name, the characters
-- (mine: theirs to work on is "theirs"; what each did, once done) and the reactions
create function public.mp_view(m public.mp_matches, uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'state', m.state, 'round', m.round,
    'starts_at', m.starts_at, 'ends_at', m.ends_at, 'now', now(),
    'side', case when m.a = uid then 'a' else 'b' end,
    'partner', (select name from public.mp_players where id = case when m.a = uid then m.b else m.a end),
    'me_ok', case when m.a = uid then m.a_ok else m.b_ok end,
    'they_ok', case when m.a = uid then m.b_ok else m.a_ok end,
    'me_again', case when m.a = uid then m.a_again else m.b_again end,
    'they_again', case when m.a = uid then m.b_again else m.a_again end,
    'mine', (select look from public.mp_characters where id = case when m.a = uid then m.a_char else m.b_char end),
    'theirs', (select look from public.mp_characters where id = case when m.a = uid then m.b_char else m.a_char end),
    'mine_after', (select look from public.mp_characters where id = case when m.a = uid then m.b_done else m.a_done end),
    'theirs_after', (select look from public.mp_characters where id = case when m.a = uid then m.a_done else m.b_done end),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('from', case when r.from_player = uid then 'me' else 'them' end, 'kind', r.kind))
      from public.mp_reactions r where r.match = m.id and r.round = m.round), '[]'::jsonb)
  );
$$;

-- the caller's match by id (raises if it isn't theirs), locked for an update
create function public.mp_mine(p_match uuid)
returns public.mp_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mp_matches;
begin
  select * into m from public.mp_matches where id = p_match and (a = auth.uid() or b = auth.uid()) for update;
  if not found then raise exception 'no such match'; end if;
  return m;
end;
$$;

revoke all on function public.mp_name() from public, anon, authenticated;
revoke all on function public.mp_player() from public, anon, authenticated;
revoke all on function public.mp_view(public.mp_matches, uuid) from public, anon, authenticated;
revoke all on function public.mp_mine(uuid) from public, anon, authenticated;

-- ---------- what players can call ----------
-- who I am: { name, has_character }
create function public.mp_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
begin
  return jsonb_build_object('name', p.name, 'has_character', p.current is not null);
end;
$$;

-- keep the character made in the creator as the one I bring (a fresh line: gen 0)
create function public.mp_save(p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  cid uuid;
begin
  if (select count(*) from public.mp_characters where owner = p.id and edited_by is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many saves';
  end if;
  insert into public.mp_characters (owner, look) values (p.id, p_look) returning id into cid;
  update public.mp_players set current = cid where id = p.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- look for a match (call every couple of seconds while searching): the match I'm in, a
-- new match with someone else who is searching, or null (still searching)
create function public.mp_join()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  m public.mp_matches;
  other uuid;
begin
  if p.current is null then raise exception 'no character'; end if;
  -- already matched (the other player found me)
  select * into m from public.mp_matches
    where (a = p.id or b = p.id) and state <> 'over' and updated_at > now() - interval '3 minutes'
    order by created_at desc limit 1;
  if found then
    delete from public.mp_queue where player = p.id;
    return public.mp_view(m, p.id);
  end if;
  insert into public.mp_queue (player, seen_at) values (p.id, now())
    on conflict (player) do update set seen_at = now();
  -- (the upsert holds my queue row, so anyone else looking right now skips me, and I them:
  -- no one ends up in two matches)
  -- the longest waiting player who is still here, with a character, and not skipped either way
  select q.player into other
    from public.mp_queue q join public.mp_players o on o.id = q.player
    where q.player <> p.id and q.seen_at > now() - interval '12 seconds' and o.current is not null
      and not (q.player = any (p.skipped)) and not (p.id = any (o.skipped))
      and not exists (select 1 from public.mp_matches x where (x.a = q.player or x.b = q.player) and x.state <> 'over' and x.updated_at > now() - interval '3 minutes')
    order by q.seen_at
    limit 1
    for update of q skip locked;
  if other is null then return null; end if;
  delete from public.mp_queue where player in (p.id, other);
  insert into public.mp_matches (a, b, a_char, b_char)
    values (other, p.id, (select current from public.mp_players where id = other), p.current)
    returning * into m;
  return public.mp_view(m, p.id);
end;
$$;

-- stop searching
create function public.mp_leave()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.mp_queue where player = auth.uid();
$$;

-- the match as I see it now (for polling and after a signal from the other player)
create function public.mp_state(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mp_matches;
begin
  select * into m from public.mp_matches where id = p_match and (a = auth.uid() or b = auth.uid());
  if not found then raise exception 'no such match'; end if;
  return public.mp_view(m, auth.uid());
end;
$$;

-- ready after the preview; when both are, the turn starts 3 s later and runs 90 s
create function public.mp_ready(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
begin
  if m.state <> 'preview' then return public.mp_view(m, uid); end if;
  if m.a = uid then m.a_ok := true; else m.b_ok := true; end if;
  if m.a_ok and m.b_ok then
    m.state := 'playing'; m.starts_at := now() + interval '3 seconds'; m.ends_at := m.starts_at + interval '90 seconds';
  end if;
  update public.mp_matches set a_ok = m.a_ok, b_ok = m.b_ok, state = m.state, starts_at = m.starts_at, ends_at = m.ends_at, updated_at = now()
    where id = m.id returning * into m;
  return public.mp_view(m, uid);
end;
$$;

-- skip the other player (in the preview): the match ends and we aren't paired again soon
create function public.mp_skip(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
  other uuid := case when m.a = uid then m.b else m.a end;
begin
  if m.state <> 'preview' then raise exception 'too late to skip'; end if;
  update public.mp_matches set state = 'over', updated_at = now() where id = m.id;
  update public.mp_players set skipped = (array_prepend(other, array_remove(skipped, other)))[1:10] where id = uid;
end;
$$;

-- hand in what I made of the other player's character (or, p_mine, my own character as
-- they last showed it, when they dropped out before handing theirs in). It becomes the
-- character's next version, and the one its owner brings next time.
create function public.mp_submit(p_match uuid, p_look jsonb, p_mine boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
  side_a boolean := m.a = uid;
  base uuid; -- the character version this turn worked on
  editor uuid;
  prev public.mp_characters;
  cid uuid;
begin
  if m.state not in ('playing', 'reveal') or m.starts_at is null or now() > m.ends_at + interval '30 seconds' then
    raise exception 'not now';
  end if;
  if p_mine then
    if now() < m.ends_at + interval '10 seconds' then raise exception 'wait for them'; end if;
    base := case when side_a then m.a_char else m.b_char end;
    editor := case when side_a then m.b else m.a end;
    if (case when side_a then m.b_done else m.a_done end) is not null then return public.mp_view(m, uid); end if;
  else
    base := case when side_a then m.b_char else m.a_char end;
    editor := uid;
    if (case when side_a then m.a_done else m.b_done end) is not null then return public.mp_view(m, uid); end if;
  end if;
  select * into prev from public.mp_characters where id = base;
  if not found then raise exception 'no character'; end if;
  insert into public.mp_characters (owner, parent, gen, edited_by, look)
    values (prev.owner, prev.id, prev.gen + 1, editor, p_look) returning id into cid;
  update public.mp_players set current = cid where id = prev.owner and current = prev.id;
  if editor = m.a then m.a_done := cid; else m.b_done := cid; end if;
  if m.a_done is not null and m.b_done is not null then m.state := 'reveal'; end if;
  update public.mp_matches set a_done = m.a_done, b_done = m.b_done, state = m.state, updated_at = now()
    where id = m.id returning * into m;
  return public.mp_view(m, uid);
end;
$$;

-- in the reveal: what I think of what they did to my character
create function public.mp_react(p_match uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
begin
  if m.state not in ('reveal', 'over') then raise exception 'not now'; end if;
  insert into public.mp_reactions (match, round, from_player, to_player, kind)
    values (m.id, m.round, uid, case when m.a = uid then m.b else m.a end, p_kind)
    on conflict (match, round, from_player) do update set kind = excluded.kind, created_at = now();
  return public.mp_view(m, uid);
end;
$$;

-- in the reveal: another round with the same player; when both want one it starts at once,
-- each working on the other's character as it is now
create function public.mp_again(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.mp_matches := public.mp_mine(p_match);
begin
  if m.state <> 'reveal' then return public.mp_view(m, uid); end if;
  if m.a = uid then m.a_again := true; else m.b_again := true; end if;
  if m.a_again and m.b_again then
    update public.mp_matches set
      round = round + 1, a_char = b_done, b_char = a_done, a_done = null, b_done = null,
      a_again = false, b_again = false, state = 'playing',
      starts_at = now() + interval '3 seconds', ends_at = now() + interval '93 seconds', updated_at = now()
      where id = m.id returning * into m;
  else
    update public.mp_matches set a_again = m.a_again, b_again = m.b_again, updated_at = now() where id = m.id returning * into m;
  end if;
  return public.mp_view(m, uid);
end;
$$;

-- leave the match (next player, or quit)
create function public.mp_end(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mp_matches := public.mp_mine(p_match);
begin
  update public.mp_matches set state = 'over', updated_at = now() where id = m.id;
end;
$$;

revoke all on function public.mp_me() from public, anon;
revoke all on function public.mp_save(jsonb) from public, anon;
revoke all on function public.mp_join() from public, anon;
revoke all on function public.mp_leave() from public, anon;
revoke all on function public.mp_state(uuid) from public, anon;
revoke all on function public.mp_ready(uuid) from public, anon;
revoke all on function public.mp_skip(uuid) from public, anon;
revoke all on function public.mp_submit(uuid, jsonb, boolean) from public, anon;
revoke all on function public.mp_react(uuid, text) from public, anon;
revoke all on function public.mp_again(uuid) from public, anon;
revoke all on function public.mp_end(uuid) from public, anon;
grant execute on function public.mp_me() to authenticated;
grant execute on function public.mp_save(jsonb) to authenticated;
grant execute on function public.mp_join() to authenticated;
grant execute on function public.mp_leave() to authenticated;
grant execute on function public.mp_state(uuid) to authenticated;
grant execute on function public.mp_ready(uuid) to authenticated;
grant execute on function public.mp_skip(uuid) to authenticated;
grant execute on function public.mp_submit(uuid, jsonb, boolean) to authenticated;
grant execute on function public.mp_react(uuid, text) to authenticated;
grant execute on function public.mp_again(uuid) to authenticated;
grant execute on function public.mp_end(uuid) to authenticated;
