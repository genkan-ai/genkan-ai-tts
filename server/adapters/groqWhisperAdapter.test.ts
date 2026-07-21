// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GroqWhisperAdapter } from "./groqWhisperAdapter";

describe("GroqWhisperAdapter", () => {
  it("sends browser audio to the configured Groq transcription model", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: "山田運輸です。荷物のお届けです。" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new GroqWhisperAdapter({
      apiKey: "test-key",
      apiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3-turbo",
      prompt: "住宅のインターホン",
      fetchImpl,
    });

    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      fileName: "utterance.webm",
      language: "ja",
      mimeType: "audio/webm",
    });
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    const body = request?.body as FormData;

    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(request?.headers).toEqual({ Authorization: "Bearer test-key" });
    expect(body.get("model")).toBe("whisper-large-v3-turbo");
    expect(body.get("language")).toBe("ja");
    expect(body.get("prompt")).toBe("住宅のインターホン");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(result).toMatchObject({
      text: "山田運輸です。荷物のお届けです。",
      provider: "groq-whisper-large-v3-turbo",
    });
    await expect(adapter.health()).resolves.toBe(true);
  });

  it("reports unhealthy and rejects transcription without an API key", async () => {
    const adapter = new GroqWhisperAdapter({
      apiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3-turbo",
    });

    await expect(adapter.health()).resolves.toBe(false);
    await expect(
      adapter.transcribe({
        audio: new Uint8Array([1]),
        fileName: "utterance.webm",
        language: "ja",
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow("GROQ_API_KEY is not configured");
  });

  it("does not accept an empty transcription", async () => {
    const adapter = new GroqWhisperAdapter({
      apiKey: "test-key",
      apiUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3-turbo",
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ text: "  " }), { status: 200 })),
    });

    await expect(
      adapter.transcribe({
        audio: new Uint8Array([1]),
        fileName: "utterance.webm",
        language: "ja",
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow("empty transcription");
  });
});
