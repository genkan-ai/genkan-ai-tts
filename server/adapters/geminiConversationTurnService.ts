import type {
  ConversationTurnInput,
  ConversationTurnResult,
  ConversationTurnService,
} from "../../src/application/contracts";
import {
  conversationResponseSchema,
  conversationSystemPrompt,
  formatConversationInput,
  parseConversationTurnResult,
} from "./openAiCompatibleConversationTurnService";

export type GeminiReasoningEffort = "none" | "low" | "medium" | "high";

interface GeminiConversationOptions {
  apiKey?: string;
  apiUrl: string;
  model: string;
  reasoningEffort: GeminiReasoningEffort;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const retryableStatuses = new Set([429, 500, 502, 503, 504]);
const retryDelaysMs = [300, 900];

const delay = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

const extractMessageContent = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
};

export class GeminiConversationTurnService implements ConversationTurnService {
  private readonly apiKey?: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly reasoningEffort: GeminiReasoningEffort;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GeminiConversationOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl;
    this.model = options.model;
    this.reasoningEffort = options.reasoningEffort;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async respond(input: ConversationTurnInput): Promise<ConversationTurnResult> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const requestBody = JSON.stringify({
      model: this.model,
      reasoning_effort: this.reasoningEffort,
      messages: [
        { role: "system", content: conversationSystemPrompt },
        { role: "user", content: formatConversationInput(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "genkan_ai_turn",
          strict: true,
          schema: conversationResponseSchema,
        },
      },
    });

    let response: Response | undefined;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      response = await this.fetchImpl(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (
        response.ok ||
        !retryableStatuses.has(response.status) ||
        attempt === retryDelaysMs.length
      ) {
        break;
      }
      await delay(retryDelaysMs[attempt] ?? 0);
    }

    if (!response?.ok) {
      const status = response?.status ?? "unknown";
      let providerMessage = "";
      try {
        const payload = (await response?.json()) as { error?: { message?: unknown } } | undefined;
        if (typeof payload?.error?.message === "string") {
          providerMessage = `: ${payload.error.message.slice(0, 300)}`;
        }
      } catch {
        // The status is still sufficient when the provider does not return JSON.
      }
      throw new Error(`Gemini returned HTTP ${status}${providerMessage}`);
    }
    const raw = extractMessageContent(await response.json());
    if (!raw) throw new Error("Gemini returned no structured output");
    return parseConversationTurnResult(raw, input);
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}
