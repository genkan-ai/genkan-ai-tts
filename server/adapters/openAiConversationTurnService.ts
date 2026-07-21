import {
  type OpenAiCompatibleConversationOptions,
  OpenAiCompatibleConversationTurnService,
} from "./openAiCompatibleConversationTurnService";

interface OpenAiConversationOptions
  extends Pick<
    OpenAiCompatibleConversationOptions,
    "apiKey" | "fetchImpl" | "model" | "timeoutMs"
  > {}

export class OpenAiConversationTurnService extends OpenAiCompatibleConversationTurnService {
  constructor(options: OpenAiConversationOptions) {
    super({
      ...options,
      apiKeyName: "OPENAI_API_KEY",
      apiUrl: "https://api.openai.com/v1/responses",
      providerName: "OpenAI",
      store: false,
    });
  }
}
