import { describe, expect, it } from "vitest";
import {
  hasNoSpeechElapsed,
  hasTrailingSilenceElapsed,
  hasVoiceActivity,
  voiceCapturePolicy,
} from "./voiceCapturePolicy";

describe("voiceCapturePolicy", () => {
  it("keeps recording through a short pause after speech", () => {
    expect(hasTrailingSilenceElapsed(1_499, 0)).toBe(false);
    expect(hasTrailingSilenceElapsed(1_500, 0)).toBe(true);
  });

  it("recognizes quieter visitor speech without treating very low noise as speech", () => {
    expect(hasVoiceActivity(voiceCapturePolicy.speechRmsThreshold)).toBe(true);
    expect(hasVoiceActivity(voiceCapturePolicy.speechRmsThreshold - 0.001)).toBe(false);
  });

  it("ends an unanswered listening window after ten seconds", () => {
    expect(hasNoSpeechElapsed(9_999, 0)).toBe(false);
    expect(hasNoSpeechElapsed(10_000, 0)).toBe(true);
  });
});
