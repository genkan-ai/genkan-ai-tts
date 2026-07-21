# Handoff Pack: TTS重複再生修正

## Classification

- Existing Eguino business / GenkanAI MVP bug repair
- Status: implementation and maker-side verification completed; independent acceptance remains required

## Root cause

- The visitor SSE endpoint broadcast every visit event to every visitor client.
- A blank visitor tab automatically selected the newest visit from the shared visit list.
- The automatic-playback guard lived only in a component `useRef`, so remounting the
  visitor UI could attempt the same response again.
- Manual playback did not have a component-wide unmount cleanup.

Together, multiple open visitor tabs or remounted visitor screens could attach to
one visit and replay the same generated response.

## Changes made

- Persist only the current tab's visitor session ID in versioned `sessionStorage`.
- Do not attach a blank visitor tab to another tab's active or historical visit.
- Subscribe to `/api/events?sessionId=...` only after the tab owns a visit.
- Filter SSE events on both the server and client by session ID.
- Persist per-response playback state (`attempted` / `completed`) in versioned
  `sessionStorage`, preventing automatic replay across component remounts.
- Keep one active audio element per visitor component and stop it on replacement or
  unmount, including manual playback.
- Clear delayed microphone restart timers during effect cleanup.

## Verification

- `npm run check`: passed.
  - Biome lint: passed.
  - TypeScript type check: passed.
  - Vitest: 16 files, 57 tests passed.
  - Vite production build: passed.
- Added regression tests proving:
  - A blank visitor tab does not attach to another active visit.
  - SSE uses the tab-owned session ID and ignores another visit's events.
  - The same AI response is not automatically replayed after unmount/remount.
- Live two-tab browser check through the Tailscale URL:
  - Both tabs started blank.
  - Starting a visit in the owner tab moved only that tab into the call state.
  - The observer tab remained at `訪問をお知らせください` and did not receive the
    conversation or generated audio state.
  - Reloading the owner tab produced no console warning or error.
- API health after the fix reported app, SQLite, Whisper, conversation, and speech
  synthesis as available.

## Exact failures and skips

- The in-app browser's screenshot command timed out on both tabs. DOM snapshots and
  console logs were captured, but no screenshot artifact is attached.
- Audible waveform-level counting was not available in browser automation. Playback
  multiplicity is covered by the media `play()` regression test and tab-isolation
  browser proof.
- This maker run did not independently accept its own implementation.

## Rollback

- Revert `audioPlaybackGuard.ts`, the tab-scoped logic in `useVisitApi.ts`, the audio
  cleanup in `VisitorIntercom.tsx`, and the session filter in `server/app.ts` as one
  unit.
- Session-storage entries contain only opaque visit/response IDs and may safely
  expire when the tab closes.

## Next decision

Run one independent real-device voice exchange with two simultaneously open visitor
clients. Confirm that only the client that starts the visit plays each response once,
including after switching views and returning to the visitor screen.
