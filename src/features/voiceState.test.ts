import { describe, expect, it } from "vitest";
import { voiceStateReducer } from "./voiceState";

describe("voiceStateReducer", () => {
  it("runs the automatic half-duplex turn sequence", () => {
    let phase = voiceStateReducer("idle", { type: "LISTEN" });
    phase = voiceStateReducer(phase, { type: "SPEECH_DETECTED" });
    phase = voiceStateReducer(phase, { type: "CAPTURED" });
    phase = voiceStateReducer(phase, { type: "TRANSCRIBED" });
    phase = voiceStateReducer(phase, { type: "RESPONSE_READY" });
    phase = voiceStateReducer(phase, { type: "AUDIO_READY" });

    expect(phase).toBe("playing");
    expect(voiceStateReducer(phase, { type: "PLAYBACK_ENDED", continueConversation: true })).toBe(
      "listening",
    );
  });

  it("returns to idle when the visit no longer needs another turn", () => {
    expect(
      voiceStateReducer("playing", { type: "PLAYBACK_ENDED", continueConversation: false }),
    ).toBe("idle");
  });
});
