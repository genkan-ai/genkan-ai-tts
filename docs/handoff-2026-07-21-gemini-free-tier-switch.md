# Handoff Pack: Gemini無料枠への会話モデル切替

## Classification

- Existing Eguino business / GenkanAI MVP provider migration
- Status: code, runtime configuration, and maker-side real-provider smoke tests complete;
  independent acceptance remains required

## Changes made

- Added `GeminiConversationTurnService` using Google's OpenAI-compatible Chat
  Completions endpoint and strict JSON Schema output.
- Reused the existing conversation prompt, input formatter, safe maximum-turn ending,
  classification mapping, and server-side automation policy.
- Added `gemini` to `CONVERSATION_PROVIDER` and configured:
  - model: `gemini-3.1-flash-lite`
  - endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  - reasoning effort: `low` for lower intercom latency
  - timeout: 20 seconds
- Added bounded retries (300 ms and 900 ms) for transient 429/5xx Gemini failures.
- Switched `.env.local` and `.env.example` from `sakana-fugu` to `gemini`.
- Kept Sakana Fugu and OpenAI adapters as explicit fallback options; no automatic
  fallback can silently incur use of another provider.
- Updated requirements, architecture, and setup documentation.

## Source verification

- Google lists `gemini-3.1-flash-lite` as the stable model for high-volume,
  cost-sensitive tasks and provides it through the configured API key.
- Google documents the OpenAI-compatible `/v1beta/openai/chat/completions` endpoint,
  Bearer API-key authentication, reasoning effort, and structured output support.
- Google states that free-tier content may be used to improve its products and that
  free-tier rate limits vary by project/model.

## Verification

- `npm run check`: passed after the provider and retry changes.
  - Biome lint: passed.
  - TypeScript type check: passed.
  - Vitest: 16 files, 62 tests passed.
  - Vite production build: passed.
- Gemini adapter tests verify endpoint, model, authentication header, `low`
  reasoning, system safety prompt, strict schema, response parsing, missing-key
  health behavior, and transient failure retries.
- API was restarted with the Gemini configuration.
- `/api/health` returned `ok`; app, SQLite, Whisper, Gemini conversation, and Fish
  TTS all returned healthy.
- Real delivery turn completed in one turn as `delivery / low`, applied the current
  `delivery_box` policy, returned the server-approved delivery phrase, and generated
  one Fish audio response.
- Real sales turn completed in one turn as `sales / low / declined`, refused the
  solicitation without disclosing whether the resident was home, and generated one
  Fish audio response.

## Exact failures and skips

- `gemini-2.5-flash` returned HTTP 404 for a newly created API user, so it was not
  retained.
- `gemini-3.5-flash` was valid and free-tier eligible but returned HTTP 503 due to
  current high demand on three retry attempts. The stable, lower-cost
  `gemini-3.1-flash-lite` model returned HTTP 200 and passed both real scenarios.
- The API health implementation checks key presence, not remote model availability;
  the real smoke tests above provide the remote verification for this run.
- This maker run did not independently accept its own implementation.

## Rollback

- Set `CONVERSATION_PROVIDER=sakana-fugu` and restart the API to return to Fugu.
- The Sakana configuration and adapter remain present and unchanged.

## Next decision

Run an independent browser/microphone test from the visitor UI and confirm the
resident receives exactly one completed notification for each visit before MVP
acceptance.
