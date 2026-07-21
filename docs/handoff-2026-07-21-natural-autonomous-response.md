# Handoff Pack: 自然音声応対・AI単独完結・完了後通知

## Classification

- Existing Eguino business / GenkanAI MVP implementation
- Status: implementation draft completed; independent acceptance remains required

## Changes made

- Replaced the resident approval state with terminal automated outcomes:
  `delivery_instructed`, `notified`, `return_requested`, `declined`,
  `emergency_guidance`, `ended`, and `failed`.
- Added a server-side automation policy that applies approved delivery phrases only
  to low-risk delivery visits with confidence of at least `0.8`.
- Added four persisted resident delivery policies and
  `GET/PUT /api/resident/settings`.
- Changed the spoken greeting to `はい。ご用件をお伺いします。` and added prompt and
  deterministic response safeguards against identity claims, provider disclosure,
  occupancy disclosure, and unsupported promises.
- Consolidated normal completion, visitor termination, timeout, maximum turns,
  STT failure, LLM failure, and restart recovery into a single terminal path.
- Added resident-only completed-visit APIs and SSE. Active visits and their live
  transcripts are not included in that feed.
- Removed resident decision UI and API behavior. The former decisions endpoint is
  absent and returns `404`.
- Added a completed-visit resident view with summary-first presentation, outcome,
  risk, explicitly labelled summary, applied delivery policy, next action, and
  collapsed transcript/event log.
- Kept the visitor page as an experiment UI with recording, transcription,
  provider-state diagnostics, and text fallback.
- Added migration-on-read for legacy `awaiting_resident` records and filtered the
  legacy decision event from loaded history.

## Verification evidence

- `npm run check`: passed.
  - Biome lint: passed.
  - TypeScript type check: passed.
  - Vitest: 15 files, 55 tests passed.
  - Vite production build: passed.
- Automated coverage includes all four delivery policies, suspicious and
  high-risk delivery denial, ordinary guest return requests, identity deflection,
  active-visit hiding, single terminal notification, STT/LLM/TTS failure paths,
  manual ending, and 90-second timeout.
- Live Sakana/Fish smoke test:
  - Greeting audio generated.
  - A two-turn delivery conversation completed with confidence `0.99`.
  - The `leave_at_door` approved phrase was applied and TTS audio was generated.
  - The active visit was absent from the resident feed and appeared after
    completion.
- Two-tab browser check through the Tailscale URL:
  - Resident summary appeared only after completion.
  - Transcript/event details were closed by default and could be expanded.
  - Delivery settings persisted through the UI and were restored to the default
    `notify_only` after the test.
  - No browser console warning or error was observed.
- API health reported app, SQLite, Whisper, conversation, and speech synthesis as
  available during the live check.

## Exact failures and skips

- The in-app browser viewport capability accepted a `390 x 844` request but the
  page continued to report a `1280`-pixel viewport. Smartphone responsive behavior
  was therefore not accepted in this run and needs an actual smartphone check.
- Microphone capture was not re-recorded during this final browser pass. The live
  test used text fallback to exercise the real LLM and TTS providers.
- This maker run did not independently accept its own implementation.

## Unverified assumptions and risks

- Prompt instructions reduce identity and sensitive-information leakage, but a
  separate adversarial voice review is still required before any product claim.
- Provider output can vary. The deterministic policy owns terminal action and
  delivery wording, while intermediate LLM replies still require scenario review.
- The current Tailscale/local environment has no product authentication and must
  not be treated as a production deployment.
- Legal and terms review for undisclosed automated interaction and recording
  indicators remains outside this implementation.

## Rollback notes

- Revert the domain outcome/settings additions, resident-only API/SSE routes,
  automation policy, and associated UI as one unit; these contracts are coupled.
- Existing SQLite visit records are normalized only when read and are not
  destructively rewritten. The `resident_settings` table can remain unused after
  rollback.
- Runtime settings are currently restored to `notify_only`.

## Next decision for 琉伊 / Hermes Core

Run an independent acceptance pass using two devices, including real microphone
audio and adversarial questions about identity, occupancy, family, contact details,
and fake-delivery scenarios. Accept or return defects based on that evidence; do
not treat this handoff as final MVP approval.
