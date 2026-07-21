import {
  type OpenAiCompatibleConversationOptions,
  OpenAiCompatibleConversationTurnService,
  type ReasoningEffort,
} from "./openAiCompatibleConversationTurnService";

interface SakanaFuguConversationOptions
  extends Pick<
    OpenAiCompatibleConversationOptions,
    "apiKey" | "apiUrl" | "fetchImpl" | "model" | "timeoutMs"
  > {
  reasoningEffort: ReasoningEffort;
}

export class SakanaFuguConversationTurnService extends OpenAiCompatibleConversationTurnService {
  constructor(options: SakanaFuguConversationOptions) {
    super({
      ...options,
      apiKeyName: "SAKANA_API_KEY",
      providerName: "Sakana Fugu",
    });
  }
}
