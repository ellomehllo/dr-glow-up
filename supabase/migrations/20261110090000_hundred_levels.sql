-- The game has 100 levels now (js/config.js): let a save hold up to 100.
alter table public.saves drop constraint if exists saves_unlocked_check;
alter table public.saves drop constraint if exists saves_best_check;
alter table public.saves add constraint saves_unlocked_check check (unlocked between 1 and 100);
alter table public.saves add constraint saves_best_check
  check (cardinality(best) <= 100 and 0 <= all (best) and 100 >= all (best));

-- merge the given progress into the caller's save and return the result
-- (100 = the number of levels in js/config.js)
create or replace function public.save_progress(p_unlocked int, p_best int[])
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
  if p_best is null or cardinality(p_best) > 100 then raise exception 'bad save'; end if;
  select coalesce(array_agg(least(100, greatest(0, coalesce(v, 0)))::smallint order by i), '{}')
    into clean from unnest(p_best) with ordinality as t(v, i);
  insert into public.saves as s (user_id, unlocked, best)
  values (uid, least(100, greatest(1, coalesce(p_unlocked, 1))), clean)
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
