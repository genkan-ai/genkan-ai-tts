import type {
  SpeechRecognitionInput,
  SpeechRecognitionPort,
  SpeechRecognitionResult,
} from "../../src/application/contracts";

interface WhisperJsonResponse {
  text?: string;
  transcription?: Array<{ text?: string }>;
}

export interface LocalWhisperOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class LocalWhisperAdapter implements SpeechRecognitionPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: LocalWhisperOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async transcribe(input: SpeechRecognitionInput): Promise<SpeechRecognitionResult> {
    const startedAt = performance.now();
    const body = new FormData();
    const bytes = Uint8Array.from(input.audio);
    body.append("file", new Blob([bytes], { type: input.mimeType }), input.fileName);
    body.append("language", input.language);
    body.append("temperature", "0.0");
    body.append("response_format", "json");

    const response = await this.fetchImpl(`${this.baseUrl}/inference`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Local Whisper returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as WhisperJsonResponse;
    const text =
      payload.text?.trim() ??
      payload.transcription
        ?.map((segment) => segment.text ?? "")
        .join("")
        .trim() ??
      "";

    if (!text) {
      throw new Error("Local Whisper returned an empty transcription");
    }

    return {
      text,
      durationMs: Math.round(performance.now() - startedAt),
      provider: "local-whisper",
    };
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.baseUrl, {
        signal: AbortSignal.timeout(800),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
