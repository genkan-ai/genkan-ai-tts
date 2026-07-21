// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("selects Gemini 3.1 Flash-Lite with free-tier and latency-oriented defaults", () => {
    const config = loadConfig({ CONVERSATION_PROVIDER: "gemini" });

    expect(config).toMatchObject({
      conversationProvider: "gemini",
      geminiApiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      geminiModel: "gemini-3.1-flash-lite",
      geminiReasoningEffort: "low",
      geminiTimeoutMs: 20_000,
    });
  });

  it("selects the Sakana Fugu provider with latency-oriented defaults", () => {
    const config = loadConfig({ CONVERSATION_PROVIDER: "sakana-fugu" });

    expect(config).toMatchObject({
      conversationProvider: "sakana-fugu",
      sakanaApiUrl: "https://api.sakana.ai/v1/responses",
      sakanaModel: "fugu",
      sakanaReasoningEffort: "high",
      sakanaTimeoutMs: 20_000,
    });
  });

  it("uses Groq Whisper Turbo by default and keeps local Whisper selectable", () => {
    expect(loadConfig({})).toMatchObject({
      sttProvider: "groq-whisper",
      whisperModelPath: expect.stringContaining("ggml-medium.bin"),
      groqWhisperApiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      groqWhisperModel: "whisper-large-v3-turbo",
      groqWhisperTimeoutMs: 15_000,
    });
    expect(loadConfig({ STT_PROVIDER: "local-whisper" }).sttProvider).toBe("local-whisper");
  });

  it("pins Fish TTS to S2.1 Pro Free and the selected public Japanese voice", () => {
    expect(loadConfig({})).toMatchObject({
      fishModel: "s2.1-pro-free",
      fishReferenceId: "0089dce5fefb4c6ba9b9f2f0debe1ddc",
      fishMaleReferenceId: "fa7a9c54f30b4cbdba742f77777173b2",
    });
    expect(loadConfig({ FISH_AUDIO_REFERENCE_ID: "another-public-voice" }).fishReferenceId).toBe(
      "another-public-voice",
    );
    expect(loadConfig({ FISH_AUDIO_FEMALE_REFERENCE_ID: "female-voice" }).fishReferenceId).toBe(
      "female-voice",
    );
    expect(loadConfig({ FISH_AUDIO_MALE_REFERENCE_ID: "male-voice" }).fishMaleReferenceId).toBe(
      "male-voice",
    );
  });

  it("falls back to supported Sakana reasoning effort values", () => {
    expect(loadConfig({ SAKANA_REASONING_EFFORT: "invalid" }).sakanaReasoningEffort).toBe("high");
    expect(loadConfig({ SAKANA_REASONING_EFFORT: "xhigh" }).sakanaReasoningEffort).toBe("xhigh");
  });

  it("accepts only supported Gemini reasoning effort values", () => {
    expect(loadConfig({ GEMINI_REASONING_EFFORT: "invalid" }).geminiReasoningEffort).toBe("none");
    expect(loadConfig({ GEMINI_REASONING_EFFORT: "low" }).geminiReasoningEffort).toBe("low");
  });
});
