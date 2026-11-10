-- Name your character (MULTIPLAYER_PLAN.md): players pick their name from two word lists
-- (a describing word and an animal), never type it, so no name needs checking. The lists
-- live here only: the game reads them with mp_name_words(), and mp_set_name() takes only
-- words from them. The made-up names players start with come from the same lists.

create function public.mp_name_words()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'first', jsonb_build_array('Pink','Sunny','Fizzy','Mint','Comet','Bubbly','Jolly','Cosmic','Peachy','Breezy','Sparkly','Lucky',
      'Zippy','Cozy','Velvet','Rosy','Glitter','Happy','Snazzy','Dreamy','Bouncy','Silly','Shiny','Groovy'),
    'second', jsonb_build_array('Otter','Panda','Koala','Llama','Fox','Penguin','Bunny','Hedgehog','Sloth','Dolphin','Kitten','Puffin',
      'Gecko','Moose','Lemur','Walrus','Unicorn','Dragon','Bear','Duck','Frog','Owl','Tiger','Whale')
  );
$$;

-- a made-up name from the lists
create or replace function public.mp_name()
returns text
language sql
volatile
set search_path = ''
as $$
  with w as (select public.mp_name_words() as j)
  select (j -> 'first' ->> floor(random() * jsonb_array_length(j -> 'first'))::int)
    || ' ' || (j -> 'second' ->> floor(random() * jsonb_array_length(j -> 'second'))::int)
  from w;
$$;

-- my name: one word from each list. Returns { name }
create function public.mp_set_name(p_first text, p_second text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.mp_players := public.mp_player();
  w jsonb := public.mp_name_words();
begin
  if not (w -> 'first') ? p_first or not (w -> 'second') ? p_second then raise exception 'not a name word'; end if;
  update public.mp_players set name = p_first || ' ' || p_second where id = p.id;
  return jsonb_build_object('name', p_first || ' ' || p_second);
end;
$$;

revoke all on function public.mp_name_words() from public, anon;
revoke all on function public.mp_set_name(text, text) from public, anon;
grant execute on function public.mp_name_words() to authenticated;
grant execute on function public.mp_set_name(text, text) to authenticated;
