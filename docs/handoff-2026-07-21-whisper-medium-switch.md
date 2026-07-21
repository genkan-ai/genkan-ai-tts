# Handoff: local Whisper Medium switch

Date: 2026-07-21
Status: Implementation and runtime verification complete; maker run has not accepted the MVP

## Changes made

- Changed the default STT provider from Groq to localhost `whisper.cpp`.
- Changed the default model from `ggml-small.bin` to multilingual `ggml-medium.bin`.
- Updated `.env.local`, `.env.example`, server defaults, start scripts, tests, README, requirements, and architecture.
- Updated `npm run setup:whisper` to install and verify Medium by default while retaining optional Small installation with `WHISPER_MODEL_NAME=small`.
- Updated `npm run dev:all` and `npm run dev:tailnet` to start `whisper-server` again.
- Kept the Groq adapter as a selectable cloud fallback.

## Verification evidence

- Downloaded `.models/whisper/ggml-medium.bin`: 1,533,763,059 bytes.
- SHA-1: `fd9727b6e1217c2f614f9b698455c4ffd82463b4`, matching the official whisper.cpp model list.
- `whisper-server` loaded model type `medium`, 1,533.14 MB, using Apple M4 Metal.
- `/api/health`: app, database, whisper, conversation, and speech synthesis all `true`.
- Synthetic 3.2-second Japanese audio completed through the full GenkanAI audio endpoint.
- STT metric: 806 ms. Full turn metric including Sakana Fugu was 12,849 ms.
- Recognized text: `山田雲家です荷物のお届けに来 ました`. The delivery purpose was correct, but `山田運輸` was not recognized correctly.
- The session completed automatically as `delivery / low / notified`, and Fish TTS audio was generated.
- `npm run lint`, `npm run typecheck`, 13 test files / 35 tests, and `npm run build` passed.

## Unverified assumptions and risks

- Synthetic macOS speech is not representative of intercom speaker and microphone acoustics.
- Proper-noun accuracy remains a known issue despite switching to Medium.
- The initial STT p95 target still needs multiple real external-device samples.
- Full-turn latency exceeded the 8-second initial target because the measured total was 12.849 seconds; STT itself was under one second in this sample.

## Rollback

- Small: set `WHISPER_MODEL_PATH=.models/whisper/ggml-small.bin` and restart Whisper/API.
- Groq: set `STT_PROVIDER=groq-whisper`, configure `GROQ_API_KEY`, and restart the API.

## Next decision

Use the external device to record several names, delivery phrases, background-noise cases, and quiet speech. Compare Medium against the retained Small model before deciding whether Medium accuracy justifies its resource cost.
