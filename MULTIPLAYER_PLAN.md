# Multiplayer plan: Salon Swap

Decided with the user (2026-11-10): **live only**, **90 second** turns, scored by the **owner's
reaction**, **website first** (doctorglowup.site; the iOS/Mac app later, Playables never: it blocks
outside network calls).

## The loop

1. **Genesis** – make your character: kind, skin, hair, build, outfit, and the problems they come in
   with. It's yours: one per player, kept in the cloud.
2. **Matchmaking** – join the live queue; you're paired with another player who is online now. A
   match card shows their character; **Skip** sends you back to the queue (both can skip).
3. **Salon session** – 90 seconds. You work on *their* character with every tool you have unlocked
   in the main game (free play: no order, no guides, no aura). A small live window shows what they
   are doing to *yours*.
4. **The reveal** – your character side by side, before and after. You tap a reaction for what they
   did (love it / funny / ruined); they see it.
5. **Choice**
   - **Rematch** – both tap it: another 90 seconds with the same person, on the characters as they are now.
   - **Next** – your character, as they left it, goes with you to the next person (lineage: every
     change is kept as a step in its history).
   - **Quit** – back to the main game.

## What has to be built

| # | Piece | Notes |
|---|---|---|
| 1 | **Character look format** | Patient state (patient.js makeState: who, hair/curls, bald, burns, stains, pierced, dye, teeth, jaw, nose, style looks...) to compact JSON and back, versioned. Animation fields (blink, bob, mood) left out. The pixel dirt layer is saved as a small low-res mask or dropped. Size capped (~20 KB). Everything else depends on this. |
| 2 | **Character creator** | New screen built on people.js / hair.js / outfits.js options. Pick, randomise, preview. |
| 3 | **Free salon mode** | The game with any character, no order or scoring, a 90 s timer, tools filtered by your unlocked level. Mostly reuses the existing free-tool paths. |
| 4 | **Backend (Supabase)** | Tables: `mp_characters` (owner, look, generation, parent), `mp_matches` (two players, state, round), `mp_reactions`. RPC `mp_join()` pairs two queued players atomically (`for update skip locked`). RLS: you read your matches' characters, write only the one you are editing. Anonymous sign-in already exists (cloud.js). |
| 5 | **Live sync (Supabase Realtime)** | One channel per match. Presence for "still here". Each player owns the character they are editing and broadcasts its look about 4 times a second for the partner's live window; the final look is saved at the bell. Ready, skip, rematch and reaction go over the same channel. |
| 6 | **Reveal and choice screens** | Reuses the results split view (before and after). |
| 7 | **Lineage** | Each saved turn is a new row pointing at its parent, so a character's history can be shown later. |

## Safety (kids' game)

- No free text anywhere: no chat, no names (players get generated names like "Pink Otter").
- Only the game's own art can be on a character, so nothing uploaded and nothing to moderate.
- Rate limits on joining and saving; looks are validated by size and version on the server.

## Edge cases

- Partner leaves mid-turn: their work so far is kept; you finish your turn alone and the reveal shows what they managed.
- Nobody online: the search screen shows how many are playing and can be cancelled. Live-only means
  real waits while the player count is small.
- Both skip at once, or a match times out: back to the queue.

## Milestones

1. Look format plus creator, offline (testable on its own).
2. Free salon mode with a timer, offline, on your own character.
3. Supabase tables, RPC and RLS (migration, applied only with the user's go-ahead).
   Applied 2026-11-10 (backup first, in ~/Developer/marblemaxx-backups/2026-11-10-before-multiplayer):
   supabase/migrations/20261111090000_multiplayer.sql and the
   client js/mp.js. A match goes preview (skip or ready) -> playing (90 s, starts 3 s after
   both are ready) -> reveal (reactions, again) -> over. Tables are closed to players; only
   the mp_* functions touch them. Each turn's result is a new character version (parent,
   gen, edited_by), and it becomes the one its owner brings next: the lineage.
4. Modes, rooms and matchmaking, plus live sync, tested with two local tabs:
   - **Mode choice** on the title screen: **Single player** (the game exactly as before) or
     **Multiplayer**. Multiplayer opens your character (creator) and then three ways in:
   - **Invite a friend**: makes a private room with a short code (6 letters and numbers, no
     look-alikes such as O/0, I/1) and a link, doctorglowup.site/?room=CODE, to copy or share.
     The room waits for the friend and then works like any match (preview, 90 s, reveal, again).
   - **Join a room**: type the code, or open an invite link, which goes straight to joining
     (making your character first if you have none yet).
   - **Play with anyone**: the random matchmaking from milestone 3 (mp_join).
   - Needs a small second migration (rooms: code, host, expiry; mp_room_create, mp_room_join,
     mp_room_cancel), applied only with the user's go-ahead.
   Done 2026-11-10: js/multi.js (flow), js/lobby.js (screens), js/live.js (Realtime broadcast
   over a plain WebSocket), rooms migration 20261112090000 applied (backup in
   ~/Developer/marblemaxx-backups/2026-11-10-before-rooms). Tested with two tabs (p1.localhost,
   p2.localhost with ?debug&cloud): random match, invite link, typed code, wrong/own/full
   codes, guess limit, live window, reveal, again, leaving mid-turn.
5. Reveal, reactions, rematch, next and lineage.
   Done 2026-11-10: reveal has a Yours/Theirs switch; owner reacts (love it / funny / ruined),
   the other player gets a toast and a little effect; again and next as in milestone 4;
   lobby shows History (each version, who changed it) and Your work (reactions received).
   Migration 20261113090000_lineage applied (backup in ~/Developer/marblemaxx-backups/2026-11-10-before-lineage).
6. Polish, then deploy.
   Polish done 2026-11-10: the turn clock follows the server's end time (right after a hidden
   tab), closer framing above the sheet, Escape goes back, a removed player's session starts a
   new player, docs and tests kept off the site (.assetsignore).
   Checks: tests/mp-test.sh runs tests/mp-api.mjs (34 checks on the live functions with
   throwaway players) and removes them with tests/mp-cleanup.sh.
