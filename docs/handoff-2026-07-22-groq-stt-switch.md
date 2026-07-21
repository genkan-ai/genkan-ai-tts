# Handoff Pack: Groq STT switch

Date: 2026-07-22
Status: Provider switch and maker-side real Groq smoke test complete; independent acceptance required

## Changes made

- Changed the default and local runtime STT provider to `groq-whisper`.
- Kept `LocalWhisperAdapter` available through `STT_PROVIDER=local-whisper`.
- Pinned the cloud model to `whisper-large-v3-turbo` and the official
  `https://api.groq.com/openai/v1/audio/transcriptions` endpoint.
- Kept the Japanese intercom prompt and explicit `ja` language input.
- Updated `.env.example`, README, requirements, architecture, and configuration tests.
- Changed the normal start command to `npm run dev`; local Whisper setup is now an
  optional rollback path.

## Verification

- Groq's current official documentation lists `whisper-large-v3-turbo` as a
  multilingual transcription model on the configured endpoint.
- `npm run check`: passed.
  - Biome: passed.
  - TypeScript: passed.
  - Vitest: 17 files, 65 tests passed.
  - Vite build: passed.
- API restarted with the new configuration.
- `/api/health`: app, SQLite, Groq STT, Gemini, and Fish Audio are all healthy.
- A 3.1-second 16 kHz mono Japanese WAV was sent through the real visit endpoint:
  - intended phrase: `山田運輸です。荷物のお届けに来ました。`
  - Groq transcript: `山田雲優です。荷物のお届けに来ました。`
  - STT time: 558 ms
  - full turn time: 3,984 ms
  - result: `delivery / low / delivery_instructed`
  - server delivery policy and Fish audio generation both completed.

## Unverified assumptions and risks

- The delivery intent and key terms were correct, but the synthetic proper noun
  `山田運輸` was misrecognized as the homophone `山田雲優`; proper-name accuracy
  remains a target-device evaluation item.
- A single request does not establish rate-limit behavior or p50/p95 latency.
- Free-tier or paid-tier audio processing sends visitor audio to Groq and should be
  covered by product privacy and consent review before release.
- This maker run did not independently accept its own change.

## Rollback

- Set `STT_PROVIDER=local-whisper`, start `whisper-server`, and run
  `npm run dev:local-whisper` or `npm run dev:all`.
- The local Medium model and adapter remain unchanged.

## Next decision

Run multiple real Japanese intercom recordings from the external device, including
company and visitor names, then record accuracy and p50/p95 latency before independent
acceptance.
