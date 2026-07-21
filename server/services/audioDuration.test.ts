// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseFfprobeDuration, validateAudioDuration } from "./audioDuration";

describe("validateAudioDuration", () => {
  it("accepts an utterance at or below the API limit", async () => {
    const probe = vi.fn().mockResolvedValue(15);
    await expect(validateAudioDuration(new Uint8Array([1]), probe)).resolves.toBe("valid");
  });

  it("rejects an utterance longer than 20 seconds", async () => {
    const probe = vi.fn().mockResolvedValue(20.1);
    await expect(validateAudioDuration(new Uint8Array([1]), probe)).resolves.toBe("too-long");
  });
});

describe("parseFfprobeDuration", () => {
  it("uses the container duration when available", () => {
    expect(parseFfprobeDuration(JSON.stringify({ format: { duration: "1.25" } }))).toBe(1.25);
  });

  it("falls back to packet timestamps for MediaRecorder WebM", () => {
    const output = JSON.stringify({
      format: { duration: "N/A" },
      packets: [
        { pts_time: "0.000", duration_time: "0.020" },
        { pts_time: "0.980", duration_time: "0.020" },
      ],
    });

    expect(parseFfprobeDuration(output)).toBeCloseTo(1, 5);
  });

  it("rejects output without a measurable duration", () => {
    expect(() => parseFfprobeDuration(JSON.stringify({ packets: [] }))).toThrow("invalid duration");
  });
});
