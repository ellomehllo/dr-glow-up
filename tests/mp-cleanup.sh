#!/bin/zsh
# Deletes the given test players (anonymous users) from the live database; their saves,
# characters, matches, reactions and rooms go with them. Usage: tests/mp-cleanup.sh <uuid>...
# Only ever pass ids of players a test made.
cd "${0:A:h}/.."
(( $# )) || { echo "usage: $0 <user uuid>..."; exit 1; }
for id in "$@"; do [[ $id =~ '^[0-9a-f-]{36}$' ]] || { echo "not a uuid: $id"; exit 1; }; done
export SUPABASE_DB_PASSWORD="$(security find-generic-password -s 'Dr Glow Up Supabase DB' -w)"
sql=$(mktemp)
print -r -- "delete from auth.users where id in ($(printf "'%s'," "$@" | sed 's/,$//'));
select (select count(*) from public.saves) saves, (select count(*) from auth.users) users, (select count(*) from public.mp_players) mp_players;" > $sql
echo "removing $# test players"
supabase db query --linked -f $sql 2>/dev/null | python3 -c "import json,sys;print('left:', json.load(sys.stdin)['rows'][0])"
rm -f $sql
