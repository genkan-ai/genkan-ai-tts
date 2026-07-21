import path from "node:path";
import type { GeminiReasoningEffort } from "./adapters/geminiConversationTurnService";
import type { ReasoningEffort } from "./adapters/openAiCompatibleConversationTurnService";

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  retentionDays: number;
  sttProvider: "local-whisper" | "groq-whisper";
  whisperServerUrl: string;
  whisperModelPath: string;
  whisperLanguage: string;
  groqApiKey?: string;
  groqWhisperApiUrl: string;
  groqWhisperModel: string;
  groqWhisperPrompt?: string;
  groqWhisperTimeoutMs: number;
  conversationProvider: "gemini" | "openai" | "sakana-fugu" | "mock";
  geminiApiKey?: string;
  geminiApiUrl: string;
  geminiModel: string;
  geminiReasoningEffort: GeminiReasoningEffort;
  geminiTimeoutMs: number;
  openAiApiKey?: string;
  openAiModel: string;
  sakanaApiKey?: string;
  sakanaApiUrl: string;
  sakanaModel: string;
  sakanaReasoningEffort: ReasoningEffort;
  sakanaTimeoutMs: number;
  fishApiKey?: string;
  fishApiUrl: string;
  fishModel: string;
  fishReferenceId?: string;
  fishMaleReferenceId?: string;
  childSafetyMode: boolean;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const conversationProviderFromEnv = (
  value: string | undefined,
): AppConfig["conversationProvider"] => {
  if (value === "gemini" || value === "openai" || value === "sakana-fugu") return value;
  return "mock";
};

const sttProviderFromEnv = (value: string | undefined): AppConfig["sttProvider"] =>
  value === "local-whisper" ? "local-whisper" : "groq-whisper";

const reasoningEffortFromEnv = (value: string | undefined): ReasoningEffort => {
  if (value === "xhigh" || value === "max") return value;
  return "high";
};

const geminiReasoningEffortFromEnv = (value: string | undefined): GeminiReasoningEffort => {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "none";
};

export const DEFAULT_FISH_MODEL = "s2.1-pro-free";
export const DEFAULT_FISH_REFERENCE_ID = "0089dce5fefb4c6ba9b9f2f0debe1ddc";
export const DEFAULT_FISH_MALE_REFERENCE_ID = "fa7a9c54f30b4cbdba742f77777173b2";

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  host: "127.0.0.1",
  port: numberFromEnv(env.API_PORT, 8787),
  databasePath: env.DATABASE_PATH ?? path.resolve(".data/genkan-ai.sqlite"),
  retentionDays: numberFromEnv(env.RETENTION_DAYS, 7),
  sttProvider: sttProviderFromEnv(env.STT_PROVIDER),
  whisperServerUrl: env.WHISPER_SERVER_URL ?? "http://127.0.0.1:8080",
  whisperModelPath: env.WHISPER_MODEL_PATH ?? path.resolve(".models/whisper/ggml-medium.bin"),
  whisperLanguage: env.WHISPER_LANGUAGE ?? "ja",
  groqApiKey: env.GROQ_API_KEY,
  groqWhisperApiUrl:
    env.GROQ_WHISPER_API_URL ?? "https://api.groq.com/openai/v1/audio/transcriptions",
  groqWhisperModel: env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo",
  groqWhisperPrompt: env.GROQ_WHISPER_PROMPT,
  groqWhisperTimeoutMs: numberFromEnv(env.GROQ_WHISPER_TIMEOUT_MS, 15_000),
  conversationProvider: conversationProviderFromEnv(env.CONVERSATION_PROVIDER),
  geminiApiKey: env.GEMINI_API_KEY,
  geminiApiUrl:
    env.GEMINI_API_URL ??
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  geminiModel: env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
  geminiReasoningEffort: geminiReasoningEffortFromEnv(env.GEMINI_REASONING_EFFORT ?? "low"),
  geminiTimeoutMs: numberFromEnv(env.GEMINI_TIMEOUT_MS, 20_000),
  openAiApiKey: env.OPENAI_API_KEY,
  openAiModel: env.OPENAI_MODEL ?? "gpt-5-mini",
  sakanaApiKey: env.SAKANA_API_KEY,
  sakanaApiUrl: env.SAKANA_API_URL ?? "https://api.sakana.ai/v1/responses",
  sakanaModel: env.SAKANA_MODEL ?? "fugu",
  sakanaReasoningEffort: reasoningEffortFromEnv(env.SAKANA_REASONING_EFFORT),
  sakanaTimeoutMs: numberFromEnv(env.SAKANA_TIMEOUT_MS, 20_000),
  fishApiKey: env.FISH_AUDIO_API_KEY,
  fishApiUrl: env.FISH_AUDIO_API_URL ?? "https://api.fish.audio/v1/tts",
  fishModel: env.FISH_AUDIO_MODEL ?? DEFAULT_FISH_MODEL,
  fishReferenceId:
    env.FISH_AUDIO_FEMALE_REFERENCE_ID || env.FISH_AUDIO_REFERENCE_ID || DEFAULT_FISH_REFERENCE_ID,
  fishMaleReferenceId: env.FISH_AUDIO_MALE_REFERENCE_ID || DEFAULT_FISH_MALE_REFERENCE_ID,
  childSafetyMode: env.CHILD_SAFETY_MODE !== "false",
});
