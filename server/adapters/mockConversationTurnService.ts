import { MockConversationService } from "../../src/adapters/mockConversationService";
import type {
  ConversationTurnInput,
  ConversationTurnResult,
  ConversationTurnService,
} from "../../src/application/contracts";
import { DEFAULT_MAX_CONVERSATION_TURNS } from "../../src/domain/visit";

const missingNameResponse = "ありがとうございます。お名前かご所属を教えていただけますか。";
const missingPurposeResponse = "ありがとうございます。どのようなご用件でしょうか。";
const identityOrHandoffQuestion =
  /(?:AI|人工知能|人間|ご本人|本人ですか|誰ですか|誰が対応|出てこられ|出てこれ|出られない|代わって|代われ|呼んで|取り次い|取次い|直接.*(?:話|対応))/iu;

export class MockConversationTurnService implements ConversationTurnService {
  private readonly analyzer = new MockConversationService();

  async respond(input: ConversationTurnInput): Promise<ConversationTurnResult> {
    const visitorText = input.transcript
      .filter((entry) => entry.speaker === "visitor")
      .map((entry) => entry.text)
      .join("。 ");
    const latestVisitorText =
      [...input.transcript].reverse().find((entry) => entry.speaker === "visitor")?.text ?? "";
    const analyzed = this.analyzer.analyze(visitorText);
    const forceComplete =
      input.turnNumber >= DEFAULT_MAX_CONVERSATION_TURNS || input.deadlineReached;
    if (identityOrHandoffQuestion.test(latestVisitorText) && !forceComplete) {
      const hasName = analyzed.classification.visitorName !== "来訪者";
      const hasPurpose = analyzed.classification.category !== "unknown";
      const response = hasPurpose
        ? hasName
          ? "恐れ入りますが、直接のお取次ぎはできません。先ほどのお話の続きをお願いします。"
          : "恐れ入りますが、直接のお取次ぎはできません。差し支えなければ、お名前をお願いします。"
        : "こちらでお話を伺いますので、そのまま続けてください。";
      return {
        ...analyzed,
        complete: false,
        outcome: "continue",
        response,
        summary: { ...analyzed.summary, aiResponse: response },
      };
    }
    const hasName = analyzed.classification.visitorName !== "来訪者";
    const hasPurpose = analyzed.classification.category !== "unknown";
    const complete = (hasName && hasPurpose) || forceComplete;

    if (complete) {
      return { ...analyzed, complete: true, outcome: analyzed.outcome };
    }

    const response = hasName ? missingPurposeResponse : missingNameResponse;
    return {
      complete: false,
      outcome: "continue",
      classification: analyzed.classification,
      response,
      summary: {
        ...analyzed.summary,
        aiResponse: response,
      },
    };
  }

  async health(): Promise<boolean> {
    return true;
  }
}
