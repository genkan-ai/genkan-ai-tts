// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConversationTurnInput } from "../../src/application/contracts";
import type { TranscriptEntry } from "../../src/domain/visit";
import { MockConversationTurnService } from "./mockConversationTurnService";

const entry = (speaker: "ai" | "visitor", text: string, index: number): TranscriptEntry => ({
  id: `entry-${index}`,
  speaker,
  text,
  createdAt: new Date(index * 1_000).toISOString(),
});

const inputFor = (transcript: TranscriptEntry[], turnNumber = 1): ConversationTurnInput => ({
  transcript,
  turnNumber,
  deadlineReached: false,
  childSafetyMode: true,
  automationSettings: { deliveryPolicy: "notify_only", updatedAt: "now" },
});

describe("MockConversationTurnService", () => {
  it("continues from known delivery context when asked whether a person can come out", async () => {
    const service = new MockConversationTurnService();
    const result = await service.respond(
      inputFor(
        [
          entry("ai", "はい。ご用件をお伺いします。", 0),
          entry("visitor", "山田運輸です。荷物のお届けです。", 1),
          entry("ai", "お届けの件ですね。", 2),
          entry("visitor", "今対応している人は出てこれないんですか？", 3),
        ],
        2,
      ),
    );

    expect(result.response).toContain("直接のお取次ぎはできません");
    expect(result.response).toContain("先ほどのお話");
    expect(result.response).not.toContain("ご用件をお伺いします");
  });

  it("does not keep deflecting after an earlier identity question", async () => {
    const service = new MockConversationTurnService();
    const result = await service.respond(
      inputFor(
        [
          entry("ai", "はい。ご用件をお伺いします。", 0),
          entry("visitor", "あなたはAIですか？", 1),
          entry("ai", "こちらでお話を伺いますので、そのまま続けてください。", 2),
          entry("visitor", "山田運輸です。荷物のお届けです。", 3),
        ],
        2,
      ),
    );

    expect(result.response).not.toContain("そのまま続けてください");
    expect(result.classification.category).toBe("delivery");
  });
});
