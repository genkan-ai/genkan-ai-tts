import { FishSpeechSynthesis } from "./adapters/fishSpeechSynthesis";
import { GeminiConversationTurnService } from "./adapters/geminiConversationTurnService";
import { GroqWhisperAdapter } from "./adapters/groqWhisperAdapter";
import { LocalWhisperAdapter } from "./adapters/localWhisperAdapter";
import { MockConversationTurnService } from "./adapters/mockConversationTurnService";
import { OpenAiConversationTurnService } from "./adapters/openAiConversationTurnService";
import { SakanaFuguConversationTurnService } from "./adapters/sakanaFuguConversationTurnService";
import { SqliteStore } from "./adapters/sqliteStore";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { AudioArtifactStore } from "./services/audioArtifactStore";
import { VisitService } from "./services/visitService";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Optional local configuration file.
  }
}

const config = loadConfig();
const store = new SqliteStore(config.databasePath);
const audioArtifacts = new AudioArtifactStore();
const speechRecognition =
  config.sttProvider === "local-whisper"
    ? new LocalWhisperAdapter({ baseUrl: config.whisperServerUrl })
    : new GroqWhisperAdapter({
        apiKey: config.groqApiKey,
        apiUrl: config.groqWhisperApiUrl,
        model: config.groqWhisperModel,
        prompt: config.groqWhisperPrompt,
        timeoutMs: config.groqWhisperTimeoutMs,
      });
const conversation = (() => {
  switch (config.conversationProvider) {
    case "gemini":
      return new GeminiConversationTurnService({
        apiKey: config.geminiApiKey,
        apiUrl: config.geminiApiUrl,
        model: config.geminiModel,
        reasoningEffort: config.geminiReasoningEffort,
        timeoutMs: config.geminiTimeoutMs,
      });
    case "openai":
      return new OpenAiConversationTurnService({
        apiKey: config.openAiApiKey,
        model: config.openAiModel,
      });
    case "sakana-fugu":
      return new SakanaFuguConversationTurnService({
        apiKey: config.sakanaApiKey,
        apiUrl: config.sakanaApiUrl,
        model: config.sakanaModel,
        reasoningEffort: config.sakanaReasoningEffort,
        timeoutMs: config.sakanaTimeoutMs,
      });
    default:
      return new MockConversationTurnService();
  }
})();
const speechSynthesis = new FishSpeechSynthesis({
  apiKey: config.fishApiKey,
  apiUrl: config.fishApiUrl,
  model: config.fishModel,
  referenceId: config.fishReferenceId,
  maleReferenceId: config.fishMaleReferenceId,
});
const visitService = new VisitService({
  store,
  speechRecognition,
  conversation,
  speechSynthesis,
  audioArtifacts,
  retentionDays: config.retentionDays,
  language: config.whisperLanguage,
  childSafetyMode: config.childSafetyMode,
});

const app = await createApp({
  config,
  visitService,
  store,
  audioArtifacts,
  providerHealth: {
    whisper: () => speechRecognition.health(),
    conversation: () => conversation.health(),
    speechSynthesis: () => speechSynthesis.health(),
  },
  logger: true,
});

await app.listen({ host: config.host, port: config.port });
