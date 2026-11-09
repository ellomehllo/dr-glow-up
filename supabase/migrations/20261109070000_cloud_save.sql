-- Cloud save for Dr. Glow Up.
-- Every player is an anonymous Supabase user (no sign-up). Their progress is one row:
-- the highest unlocked level (1-based) and the best aura (0-100) per level, as in
-- js/scoring.js. Players can read only their own row and write it only through
-- save_progress(), which merges and never lowers anything, so an old tab or device
-- can't wipe newer progress.

create table public.saves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unlocked smallint not null default 1 check (unlocked between 1 and 50),
  best smallint[] not null default '{}'
    check (cardinality(best) <= 50 and 0 <= all (best) and 100 >= all (best)),
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;
revoke all on public.saves from anon, authenticated;
grant select on public.saves to authenticated;
create policy "players read their own save" on public.saves
  for select to authenticated using (user_id = (select auth.uid()));

-- merge the given progress into the caller's save and return the result
-- (50 = the number of levels in js/config.js)
create function public.save_progress(p_unlocked int, p_best int[])
returns public.saves
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean smallint[];
  r public.saves;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_best is null or cardinality(p_best) > 50 then raise exception 'bad save'; end if;
  select coalesce(array_agg(least(100, greatest(0, coalesce(v, 0)))::smallint order by i), '{}')
    into clean from unnest(p_best) with ordinality as t(v, i);
  insert into public.saves as s (user_id, unlocked, best)
  values (uid, least(50, greatest(1, coalesce(p_unlocked, 1))), clean)
  on conflict (user_id) do update set
    unlocked = greatest(s.unlocked, excluded.unlocked),
    best = (
      select coalesce(array_agg(greatest(coalesce(s.best[i], 0), coalesce(excluded.best[i], 0))::smallint order by i), '{}')
      from generate_series(1, greatest(cardinality(s.best), cardinality(excluded.best))) as i
    ),
    updated_at = now()
  returning * into r;
  return r;
end;
$$;

revoke all on function public.save_progress(int, int[]) from public, anon;
grant execute on function public.save_progress(int, int[]) to authenticated;
