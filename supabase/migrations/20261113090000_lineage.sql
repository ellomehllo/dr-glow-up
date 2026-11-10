-- Multiplayer milestone 5 (MULTIPLAYER_PLAN.md): a character's history and how players
-- liked your work. Reactions go to the player who did the work (mp_react: to_player), so
-- the ones a player got are their score as a stylist.

-- who I am, the character I bring, and the reactions my work got
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
    'gen', (select gen from public.mp_characters where id = p.current),
    'got', (select jsonb_build_object(
        'love', count(*) filter (where kind = 'love'),
        'funny', count(*) filter (where kind = 'funny'),
        'ruined', count(*) filter (where kind = 'ruined'))
      from public.mp_reactions where to_player = p.id)
  );
end;
$$;

-- the character I bring, version by version back to how I made it (newest first, up to 20):
-- [{ gen, by (the player who had that turn; null: I made it), at, look }]
create function public.mp_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select c.id, c.parent, c.gen, c.edited_by, c.created_at, c.look, 1 as n
      from public.mp_characters c
      join public.mp_players p on p.current = c.id
      where p.id = auth.uid() and c.owner = auth.uid()
    union all
    select c.id, c.parent, c.gen, c.edited_by, c.created_at, c.look, chain.n + 1
      from public.mp_characters c join chain on c.id = chain.parent
      where chain.n < 20 and c.owner = auth.uid()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'gen', chain.gen,
      'by', case when chain.edited_by is null then null
                 else coalesce((select name from public.mp_players where id = chain.edited_by), 'Someone') end,
      'at', chain.created_at,
      'look', chain.look) order by chain.n), '[]'::jsonb)
  from chain;
$$;

revoke all on function public.mp_history() from public, anon;
grant execute on function public.mp_history() to authenticated;
