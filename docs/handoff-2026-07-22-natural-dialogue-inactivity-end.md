# Handoff: natural dialogue and inactivity-based end

Date: 2026-07-22
Status: implementation and maker-side verification complete; independent acceptance required

## Changes made

- Separated an automated decision from session termination. Delivery guidance, refusal, return
  requests, and other outcomes are stored as a pending decision while the visit remains
  `in_conversation`.
- Increased the fail-safe visitor-turn ceiling from 4 to 8. The existing 90-second visit deadline
  remains in place.
- Added `inactivity` as an explicit completion reason. After an AI response, ten seconds without
  detected speech ends the visit silently and preserves the already-decided outcome.
- Kept explicit visitor closing phrases and the manual end button as valid end conditions.
- Changed the Gemini prompt to generate varied, context-aware delivery guidance and refusals.
  The server accepts a generated response only when it passes disclosure, commitment, and required
  delivery-action checks. Fixed phrases remain safety fallbacks.
- Added follow-up handling that keeps the established outcome and delivery policy without forcing
  the original instruction to be repeated on every visitor question.
- Added an end-reason request body to `POST /api/visits/:id/end` and rejected unknown reasons.
- Updated the visitor diagnostic UI to show the 10-second inactivity behavior.
- Updated README, architecture, and MVP requirements to describe the new lifecycle.

## Main files

- `server/services/visitService.ts`
- `server/services/automationPolicy.ts`
- `server/adapters/openAiCompatibleConversationTurnService.ts`
- `server/app.ts`
- `src/features/useHalfDuplexRecorder.ts`
- `src/features/VisitorIntercom.tsx`
- `src/features/voiceCapturePolicy.ts`
- `src/domain/visit.ts`
- `src/application/apiClient.ts`
- `src/features/useVisitApi.ts`

## Verification evidence

- `npm run check`
  - lint: passed
  - typecheck: passed
  - tests: 17 files, 72 tests passed
  - production build: passed
- In-app browser, real configured Gemini and Fish providers:
  - A delivery turn produced the non-template response
    `お世話になっております。宅配ボックスへ入れていただけますでしょうか。`.
  - The session remained `通話中` after that guidance.
  - A follow-up question about the delivery-box location received a context-aware response while
    the session still remained active.
  - After the response finished, ten seconds with no visitor speech changed the visitor view to
    `会話終了` without adding another spoken closing line.
  - The resident view then displayed one completed delivery summary with the `宅配ボックス`
    policy and the full transcript available behind the disclosure control.
  - No browser console error or warning was observed during the final flow.
- The localhost API and Vite frontend were left running on ports 8787 and 4173 for user testing.

## Assumptions and remaining risks

- Ten seconds is the initial inactivity threshold. Ambient sound above the RMS threshold can keep
  a real intercom session open, so the target microphone and installation environment still need a
  physical-device test.
- The real-browser flow used the text fallback to provide visitor utterances; it did exercise real
  Gemini generation, Fish audio delivery, browser silence detection, inactivity ending, and the
  resident notification. A fresh physical-microphone/STT pass is still required for acceptance.
- LLM wording can still vary. Server-side semantic checks and fixed safety fallbacks intentionally
  remain, so an invalid or ambiguous generated response may still sound templated.
- Eight turns and 90 seconds are safety ceilings, not normal completion targets.

## Rollback

- Restore the previous immediate-finalization block in `VisitService.receiveTurn` and remove
  `pendingOutcome` / `pendingSummary` to return to decision-equals-end behavior.
- Restore the old `applyAutomationPolicy` fixed-response branches to disable generated wording.
- Remove the no-speech callback from `useHalfDuplexRecorder` and the `inactivity` end reason to
  return to retry-on-no-speech behavior.

## Next decision

琉伊 or an independent verifier should test several real microphone conversations on the target
phone/intercom environment and decide whether ten seconds, eight turns, and the current speech RMS
threshold feel natural enough for the MVP. This maker run does not accept its own output.
