# Handoff: AI automatic response and cloud STT

Date: 2026-07-21
Status: Implementation draft; maker run has not accepted the MVP

## Changes made

- Removed the resident decision API and UI controls. The resident dashboard is now monitoring-only.
- Added an AI terminal outcome to structured conversation output: `notified`, `declined`, `emergency_guidance`, or `ended`.
- Changed completed conversations to return the final safe response, notify the resident, save the outcome, and end without waiting for resident input.
- Added `GroqWhisperAdapter` and made `groq-whisper` with `whisper-large-v3-turbo` the default STT provider.
- Kept `LocalWhisperAdapter` selectable with `STT_PROVIDER=local-whisper`.
- Updated start scripts so the default cloud-STT path no longer launches `whisper-server`.
- Updated requirements, architecture, README, UI specification, and tests.

## Verification evidence

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 13 files, 35 tests passed.
- `npm run build`: passed.
- Real Sakana Fugu text turn: one delivery utterance completed with `automatedOutcome=notified`; generated a safe final response and Fish TTS audio. Measured conversation turn metric was 6.21 seconds; HTTP request including synthesis was 7.65 seconds.
- Browser flow: visitor call, text fallback utterance, AI final response, automatic completion, and resident result display passed.
- Browser accessibility check: resident response buttons `応答する`, `お断りする`, and `あとで確認` each had count 0.
- Browser screenshot capture was attempted three times but `Page.captureScreenshot` timed out. Updated pixel-level visual comparison remains unverified.

## Unverified assumptions and risks

- `GROQ_API_KEY` is not currently set in `.env.local`. `/api/health` correctly reports `whisper=false`, while app, database, Sakana Fugu, and Fish Audio report healthy.
- The Groq adapter is covered by deterministic tests, but real Japanese audio has not yet been sent to Groq from this environment.
- Old SQLite sessions retain legacy resident decisions and `awaiting_resident` compatibility for history display; new sessions do not create those states.
- The in-app browser showed the TTS phase as `AIが応答中` after the final text appeared. The session itself completed; audio end behavior should be rechecked in the target mobile browser.

## Rollback

- Set `STT_PROVIDER=local-whisper`, start `whisper-server`, and use `npm run dev:local-whisper` to return to local STT.
- Reverting the automatic outcome changes requires restoring the removed decision endpoint, client method, resident controls, and `awaiting_resident` transition together.

## Next decision

1. 琉伊 sets `GROQ_API_KEY` locally without sharing it in chat or Git.
2. Run 15–30 second and short Japanese intercom samples from the external device; record transcription quality and p50/p95 latency.
3. Core or a separate Codex review run checks the diff, real Groq audio flow, browser audio completion, and visual state before 琉伊 accepts the MVP.
