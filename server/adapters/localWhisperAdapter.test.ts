// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LocalWhisperAdapter } from "./localWhisperAdapter";

describe("LocalWhisperAdapter", () => {
  it("posts audio to the local inference endpoint and normalizes the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: " 山田運輸です。荷物のお届けです。 " }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new LocalWhisperAdapter({
      baseUrl: "http://127.0.0.1:8080/",
      fetchImpl,
    });

    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      fileName: "utterance.webm",
      mimeType: "audio/webm",
      language: "ja",
    });

    expect(result).toMatchObject({
      text: "山田運輸です。荷物のお届けです。",
      provider: "local-whisper",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/inference",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects an empty transcription", async () => {
    const adapter = new LocalWhisperAdapter({
      baseUrl: "http://127.0.0.1:8080",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ text: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });

    await expect(
      adapter.transcribe({
        audio: new Uint8Array([1]),
        fileName: "utterance.wav",
        mimeType: "audio/wav",
        language: "ja",
      }),
    ).rejects.toThrow("empty transcription");
  });
});
