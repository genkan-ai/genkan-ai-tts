# Voice MVP Handoff Pack — 2026-07-21

## Classification

- Existing Eguino business / GenkanAI software MVP
- Business progress changed: localhost voice MVP implementation completed; external-provider acceptance pending
- Durable detail remains in this repository; Company OS should retain only this source pointer after review

## Changes made

- Added localhost Fastify API, SSE, SQLite persistence, seven-day retention, health reporting, and one-time TTS audio artifacts.
- Added provider boundaries and implementations for local whisper.cpp, OpenAI structured conversation, Fish Audio TTS, plus deterministic mocks.
- Added automatic half-duplex browser capture: speech threshold, 800ms silence stop, 15s maximum, 10s no-speech handling, and text fallback.
- Added multi-turn collection up to four visitor turns / 90 seconds and safe provider-failure behavior.
- Preserved the existing text simulator for automated frontend tests and added local setup scripts and documentation.

## Verification evidence

- `npm run check`: pass（lint、typecheck、9 test files / 19 tests、production build）
- Browser: localhost visitor-to-resident text fallback flow, SSE synchronization across two tabs, resident decline, final visitor text fallback verified
- Visual: resident dashboard compared with `docs/design/resident-dashboard-concept-v2.png`; visitor mobile view compared with `docs/design/visitor-intercom-concept.png`
- Responsive: 390×844 Chrome screenshot, document `scrollWidth=390`
- Health without local providers: app/database/conversation true; Whisper and Fish false; overall `degraded` as expected

## Unverified assumptions and risks

- Homebrew `whisper-server` and the 466MiB `ggml-small.bin` model are not installed in this environment, so real microphone-to-STT behavior and latency remain unverified.
- No OpenAI or Fish API keys were used. OpenAI structured output and Fish request shape are covered by types/mocks but require live smoke tests.
- Fish TTS requires a configured `FISH_AUDIO_REFERENCE_ID`; without it, the UI intentionally stays text-only.
- Node 22 currently reports `node:sqlite` as experimental. It is acceptable for localhost MVP, not yet a production storage decision.
- The energy-threshold VAD must be tuned with actual intercom audio and echo conditions.

## Rollback

- Stop `npm run dev:all` and remove `.data/`, `.models/`, and `.env.local`; none are tracked.
- The previous deterministic simulator remains available in tests and through the in-memory application layer.
- Provider changes are isolated behind ports; Groq can be added without changing the browser contract.

## Next decision

1. Install whisper.cpp/model and run 20–30 Japanese intercom-like samples.
2. Record recognition of names, companies, purposes, p50/p95 STT, and full-turn latency.
3. If accuracy or latency misses the target, compare the same fixtures with Groq Whisper Large v3 Turbo.
4. Have Core or a separate Codex run verify the final diff and live-provider evidence; Rui retains MVP acceptance.
