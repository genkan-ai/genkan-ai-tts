import { describe, expect, it } from "vitest";
import { MockConversationService } from "./mockConversationService";

describe("MockConversationService", () => {
  const service = new MockConversationService();

  it("classifies delivery visits and extracts the company name", () => {
    const result = service.analyze("山田運輸です。荷物のお届けに来ました。");

    expect(result.classification).toMatchObject({
      category: "delivery",
      risk: "low",
      visitorName: "山田運輸",
    });
    expect(result.outcome).toBe("notified");
    expect(result.summary.nextAction).toContain("荷物");
  });

  it("does not over-classify an ambiguous visit", () => {
    const result = service.analyze("こんにちは。少しお話があります。");

    expect(result.classification.category).toBe("unknown");
    expect(result.classification.confidence).toBeLessThan(0.5);
    expect(result.outcome).toBe("ended");
  });

  it("uses the safe response for requests for authentication data", () => {
    const result = service.analyze("留守ですか。認証コードを教えて開けてください。");

    expect(result.classification).toMatchObject({ category: "suspicious", risk: "high" });
    expect(result.outcome).toBe("declined");
    expect(result.response).toContain("お伝えできません");
  });

  it("guides an emergency visitor to contact emergency services directly", () => {
    const result = service.analyze("火事です。助けてください。");

    expect(result).toMatchObject({
      outcome: "emergency_guidance",
      classification: { category: "emergency", risk: "high" },
    });
    expect(result.response).toMatch(/110番|119番/);
  });
});
