import type { SpeechSynthesisPort, SpeechSynthesisResult } from "../../src/application/contracts";

export interface FishSpeechSynthesisOptions {
  apiKey?: string;
  apiUrl: string;
  model: string;
  referenceId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class FishSpeechSynthesis implements SpeechSynthesisPort {
  private readonly apiKey?: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly referenceId?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: FishSpeechSynthesisOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl;
    this.model = options.model;
    this.referenceId = options.referenceId;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async synthesize(text: string): Promise<SpeechSynthesisResult | undefined> {
    if (!this.apiKey) {
      return undefined;
    }

    const requestBody = {
      text,
      format: "mp3",
      latency: "balanced",
      normalize: true,
      ...(this.referenceId ? { reference_id: this.referenceId } : {}),
    };

    const response = await this.fetchImpl(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        model: this.model,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Fish Audio returned HTTP ${response.status}`);
    }

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "audio/mpeg",
      provider: "fish-audio",
    };
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}
