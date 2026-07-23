// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { TranscriptEntry } from "../../src/domain/visit";
import { FishSpeechSynthesis } from "./fishSpeechSynthesis";
import { GeminiConversationTurnService } from "./geminiConversationTurnService";
import {
  conversationSystemPrompt,
  formatConversationInput,
} from "./openAiCompatibleConversationTurnService";
import { OpenAiConversationTurnService } from "./openAiConversationTurnService";
import { SakanaFuguConversationTurnService } from "./sakanaFuguConversationTurnService";

const structuredConversationResult = {
  complete: true,
  outcome: "notified",
  response: "居住者へ確認します。",
  category: "delivery",
  risk: "low",
  confidence: 0.9,
  reason: "荷物の配達",
  visitorName: "山田運輸",
  purpose: "荷物のお届け",
  requestedAction: "玄関前へ置く",
  nextAction: "置き配可否を確認する",
};

const deliveryTranscript: TranscriptEntry[] = [
  { id: "1", speaker: "visitor", text: "山田運輸です。荷物のお届けです。", createdAt: "now" },
];

const automationSettings = {
  deliveryPolicy: "notify_only" as const,
  updatedAt: "now",
};

describe("external provider adapters", () => {
  it("passes the resident profile as internal-only structured context", () => {
    const formatted = formatConversationInput({
      transcript: deliveryTranscript,
      turnNumber: 1,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
      residentProfile: {
        householdName: "横倉",
        residentNames: ["横倉 琉伊"],
        updatedAt: "now",
      },
    });

    expect(formatted).toContain(
      '居住者プロフィール（内部参照専用・読み上げ禁止）: {"householdName":"横倉","residentNames":["横倉 琉伊"]}',
    );
    expect(conversationSystemPrompt).toContain(
      "その人物が住んでいることや在宅していることを肯定せず",
    );
    expect(
      formatConversationInput({
        transcript: [
          { id: "0", speaker: "ai", text: "はい。ご用件をお伺いします。", createdAt: "now" },
          ...deliveryTranscript,
        ],
        turnNumber: 1,
        deadlineReached: false,
        childSafetyMode: true,
        automationSettings,
      }),
    ).toContain("応対側:");
  });

  it("sends the Fish model and switches between configured voice references", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
    );
    const adapter = new FishSpeechSynthesis({
      apiKey: "test-key",
      apiUrl: "https://api.fish.audio/v1/tts",
      model: "s2.1-pro-free",
      referenceId: "voice-id",
      maleReferenceId: "male-voice-id",
      fetchImpl,
    });

    const result = await adapter.synthesize("こんにちは");
    const request = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { reference_id?: string };

    expect(result).toMatchObject({ mimeType: "audio/mpeg", provider: "fish-audio" });
    expect(request?.headers).toMatchObject({ model: "s2.1-pro-free" });
    expect(body.reference_id).toBe("voice-id");

    await adapter.synthesize("こんばんは", "male");
    const maleRequest = fetchImpl.mock.calls[1]?.[1];
    const maleBody = JSON.parse(String(maleRequest?.body)) as { reference_id?: string };
    expect(maleBody.reference_id).toBe("male-voice-id");
  });

  it("uses the Fish default voice when a reference ID is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    const adapter = new FishSpeechSynthesis({
      apiKey: "test-key",
      apiUrl: "https://api.fish.audio/v1/tts",
      model: "s2.1-pro-free",
      fetchImpl,
    });

    await adapter.synthesize("こんにちは");
    const request = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { reference_id?: string };

    expect(body.reference_id).toBeUndefined();
    await expect(adapter.health()).resolves.toBe(true);
  });

  it("requests strict structured output from OpenAI without storing the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(structuredConversationResult) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new OpenAiConversationTurnService({
      apiKey: "test-key",
      model: "gpt-5-mini",
      fetchImpl,
    });
    const result = await adapter.respond({
      transcript: deliveryTranscript,
      turnNumber: 1,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
    });
    const request = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      store?: boolean;
      text?: { format?: { strict?: boolean } };
    };

    expect(result).toMatchObject({
      complete: true,
      outcome: "notified",
      classification: { category: "delivery" },
    });
    expect(body.store).toBe(false);
    expect(body.text?.format?.strict).toBe(true);
  });

  it("uses Gemini Flash through the OpenAI-compatible chat completions API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(structuredConversationResult) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const adapter = new GeminiConversationTurnService({
      apiKey: "test-key",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-3.1-flash-lite",
      reasoningEffort: "low",
      fetchImpl,
    });

    const result = await adapter.respond({
      transcript: deliveryTranscript,
      turnNumber: 1,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
    });
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body)) as {
      model?: string;
      reasoning_effort?: string;
      messages?: Array<{ role?: string; content?: string }>;
      response_format?: { type?: string; json_schema?: { strict?: boolean } };
    };

    expect(result).toMatchObject({
      complete: true,
      outcome: "notified",
      classification: { category: "delivery" },
    });
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(body).toMatchObject({
      model: "gemini-3.1-flash-lite",
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
    expect(body.messages?.[0]).toMatchObject({ role: "system" });
    expect(body.messages?.[0]?.content).toContain("60文字以内");
    expect(body.messages?.[0]?.content).toContain("通話が即座に切れるという意味ではありません");
    expect(body.messages?.[0]?.content).toContain("用件が既に分かっている場合");
  });

  it("reports Gemini as unhealthy without an API key", async () => {
    const adapter = new GeminiConversationTurnService({
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-3.1-flash-lite",
      reasoningEffort: "low",
    });

    await expect(adapter.health()).resolves.toBe(false);
    await expect(
      adapter.respond({
        transcript: deliveryTranscript,
        turnNumber: 1,
        deadlineReached: false,
        childSafetyMode: true,
        automationSettings,
      }),
    ).rejects.toThrow("GEMINI_API_KEY is not configured");
  });

  it("retries transient Gemini failures before returning structured output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Temporarily unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(structuredConversationResult) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const adapter = new GeminiConversationTurnService({
      apiKey: "test-key",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-3.1-flash-lite",
      reasoningEffort: "low",
      fetchImpl,
    });

    const result = await adapter.respond({
      transcript: deliveryTranscript,
      turnNumber: 1,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ complete: true, classification: { category: "delivery" } });
  });

  it("uses Sakana Fugu Responses API with supported structured output and reasoning", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(structuredConversationResult) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new SakanaFuguConversationTurnService({
      apiKey: "test-key",
      apiUrl: "https://api.sakana.ai/v1/responses",
      model: "fugu",
      reasoningEffort: "high",
      fetchImpl,
    });

    const result = await adapter.respond({
      transcript: deliveryTranscript,
      turnNumber: 1,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
    });
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body)) as {
      instructions?: string;
      model?: string;
      reasoning?: { effort?: string };
      store?: boolean;
      text?: { format?: { strict?: boolean; type?: string } };
    };

    expect(result).toMatchObject({
      complete: true,
      outcome: "notified",
      classification: { category: "delivery" },
    });
    expect(url).toBe("https://api.sakana.ai/v1/responses");
    expect(body.model).toBe("fugu");
    expect(body.reasoning?.effort).toBe("high");
    expect(body.instructions).toContain("60文字以内");
    expect(body.store).toBeUndefined();
    expect(body.text?.format).toMatchObject({ type: "json_schema", strict: true });
  });

  it("ends safely when the maximum turn is reached without a terminal model outcome", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            ...structuredConversationResult,
            complete: false,
            outcome: "continue",
            response: "もう一度ご用件を教えてください。",
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const adapter = new SakanaFuguConversationTurnService({
      apiKey: "test-key",
      apiUrl: "https://api.sakana.ai/v1/responses",
      model: "fugu",
      reasoningEffort: "high",
      fetchImpl,
    });

    const result = await adapter.respond({
      transcript: deliveryTranscript,
      turnNumber: 8,
      deadlineReached: false,
      childSafetyMode: true,
      automationSettings,
    });

    expect(result).toMatchObject({
      complete: true,
      outcome: "ended",
      response: "用件を確認できないため、対応できません。",
      summary: { nextAction: "用件不明として会話を終了" },
    });
  });

  it("reports Sakana Fugu as unhealthy without an API key", async () => {
    const adapter = new SakanaFuguConversationTurnService({
      apiUrl: "https://api.sakana.ai/v1/responses",
      model: "fugu",
      reasoningEffort: "high",
    });

    await expect(adapter.health()).resolves.toBe(false);
    await expect(
      adapter.respond({
        transcript: deliveryTranscript,
        turnNumber: 1,
        deadlineReached: false,
        childSafetyMode: true,
        automationSettings,
      }),
    ).rejects.toThrow("SAKANA_API_KEY is not configured");
  });
});
