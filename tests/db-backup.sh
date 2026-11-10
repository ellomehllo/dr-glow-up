#!/bin/zsh
# Exports the live Dr. Glow Up database (rows of every public table, function definitions,
# grants, migration list) to ~/Developer/marblemaxx-backups/<date>-<label>/, outside the repo.
# Run it before applying any migration. Usage: tests/db-backup.sh before-<what>
cd "${0:A:h}/.."
label=${1:?usage: $0 <label>}
B=~/Developer/marblemaxx-backups/$(date +%Y-%m-%d)-$label
mkdir -p $B/migrations
export SUPABASE_DB_PASSWORD="$(security find-generic-password -s 'Dr Glow Up Supabase DB' -w)"
q() { local f=$(mktemp); print -r -- "$2" > $f; supabase db query --linked -f $f > "$B/$1" 2>/dev/null; rm -f $f; }
q migrations.txt "select version, name from supabase_migrations.schema_migrations order by version;"
q counts.txt "select (select count(*) from auth.users) users, (select count(*) from public.saves) saves, (select count(*) from public.mp_players) mp_players, (select count(*) from public.mp_matches) mp_matches;"
for t in $(supabase db query --linked -f =(print "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE';") 2>/dev/null | python3 -c "import json,sys;print(' '.join(r['table_name'] for r in json.load(sys.stdin)['rows']))"); do
  q $t.json "select coalesce(json_agg(t), '[]'::json) as rows from public.$t t;"
done
q functions.txt "select p.proname, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace order by 1;"
q fn_grants.txt "select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' order by 1,2;"
q columns.txt "select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' order by table_name, ordinal_position;"
cp supabase/migrations/*.sql $B/migrations/
cp ~/Developer/marblemaxx-backups/2026-11-10-before-multiplayer/restore_saves.sql $B/restore_saves_original.sql 2>/dev/null
echo "backup in $B"
ls $B | tr '\n' ' '; echo
python3 -c "import json;print(json.load(open('$B/counts.txt'))['rows'][0])"
