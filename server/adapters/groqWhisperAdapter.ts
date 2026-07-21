import type {
  SpeechRecognitionInput,
  SpeechRecognitionPort,
  SpeechRecognitionResult,
} from "../../src/application/contracts";

interface GroqTranscriptionResponse {
  text?: string;
}

export interface GroqWhisperOptions {
  apiKey?: string;
  apiUrl: string;
  model: string;
  prompt?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GroqWhisperAdapter implements SpeechRecognitionPort {
  private readonly apiKey?: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly prompt?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GroqWhisperOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl;
    this.model = options.model;
    this.prompt = options.prompt;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async transcribe(input: SpeechRecognitionInput): Promise<SpeechRecognitionResult> {
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const startedAt = performance.now();
    const body = new FormData();
    const bytes = Uint8Array.from(input.audio);
    body.append("file", new Blob([bytes], { type: input.mimeType }), input.fileName);
    body.append("model", this.model);
    body.append("language", input.language);
    body.append("temperature", "0");
    body.append("response_format", "json");
    if (this.prompt) {
      body.append("prompt", this.prompt);
    }

    const response = await this.fetchImpl(this.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Groq Whisper returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GroqTranscriptionResponse;
    const text = payload.text?.trim() ?? "";
    if (!text) {
      throw new Error("Groq Whisper returned an empty transcription");
    }

    return {
      text,
      durationMs: Math.round(performance.now() - startedAt),
      provider: `groq-${this.model}`,
    };
  }

  async health(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}
