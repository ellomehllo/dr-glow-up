#!/bin/zsh
# Runs tests/mp-api.mjs against the live multiplayer functions, then deletes every throwaway
# player it made (their characters, matches, reactions and rooms go with them), pass or fail.
# Needs the Supabase CLI linked to the project and the DB password in the keychain.
cd "${0:A:h}/.."
ids=$(mktemp)
cleanup() {
  [[ -s $ids ]] && tests/mp-cleanup.sh $(cat $ids)
  rm -f $ids
}
trap cleanup EXIT
MP_IDS=$ids node tests/mp-api.mjs
