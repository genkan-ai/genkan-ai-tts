// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConversationTurnResult } from "../../src/application/contracts";
import type { DeliveryPolicy, VisitCategory } from "../../src/domain/visit";
import { applyAutomationPolicy } from "./automationPolicy";

const resultFor = (
  category: VisitCategory,
  overrides: Partial<ConversationTurnResult> = {},
): ConversationTurnResult => {
  const classification = {
    category,
    risk:
      category === "delivery" || category === "expected_guest"
        ? ("low" as const)
        : ("high" as const),
    confidence: 0.9,
    reason: "test",
    visitorName: "テスト来訪者",
    purpose: "テスト用件",
  };
  return {
    complete: true,
    outcome: "notified",
    response: "テスト応答",
    classification,
    summary: {
      ...classification,
      requestedAction: "テスト",
      aiResponse: "テスト応答",
      nextAction: "確認",
    },
    ...overrides,
  };
};

const applyDelivery = (deliveryPolicy: DeliveryPolicy) =>
  applyAutomationPolicy(
    resultFor("delivery"),
    { deliveryPolicy, updatedAt: "now" },
    "荷物のお届けです。",
  );

describe("applyAutomationPolicy", () => {
  it.each([
    ["notify_only", "notified", "こちらでお伝えします"],
    ["leave_at_door", "delivery_instructed", "玄関前に置いてください"],
    ["delivery_box", "delivery_instructed", "宅配ボックスをご利用ください"],
    ["request_redelivery", "return_requested", "改めて配達をお願いします"],
  ] as const)("applies the %s delivery preset", (policy, outcome, response) => {
    const result = applyDelivery(policy);

    expect(result).toMatchObject({
      complete: true,
      outcome,
      response: expect.stringContaining(response),
      summary: { appliedDeliveryPolicy: policy },
    });
  });

  it("keeps a natural model-generated delivery instruction when it matches the preset", () => {
    const result = applyAutomationPolicy(
      resultFor("delivery", {
        response: "助かります。お手数ですが、宅配ボックスへお願いします。",
      }),
      { deliveryPolicy: "delivery_box", updatedAt: "now" },
      "荷物のお届けです。",
    );

    expect(result.response).toBe("助かります。お手数ですが、宅配ボックスへお願いします。");
    expect(result.outcome).toBe("delivery_instructed");
  });

  it("falls back when a generated response does not contain the allowed delivery action", () => {
    const result = applyAutomationPolicy(
      resultFor("delivery", { response: "こちらで荷物を受け取ります。" }),
      { deliveryPolicy: "delivery_box", updatedAt: "now" },
      "荷物のお届けです。",
    );

    expect(result.response).toBe("ありがとうございます。宅配ボックスをご利用ください。");
  });

  it("keeps a safe follow-up response without repeating the established instruction", () => {
    const established = applyDelivery("delivery_box");
    const result = applyAutomationPolicy(
      resultFor("delivery", {
        response: "見当たらない場合は、恐れ入りますが再配達をお願いします。",
      }),
      { deliveryPolicy: "delivery_box", updatedAt: "now" },
      "宅配ボックスはどこですか？",
      { outcome: "delivery_instructed", summary: established.summary },
    );

    expect(result.response).toBe("見当たらない場合は、恐れ入りますが再配達をお願いします。");
    expect(result.outcome).toBe("delivery_instructed");
    expect(result.summary.appliedDeliveryPolicy).toBe("delivery_box");
  });

  it.each(["sales", "collection", "fraud", "suspicious"] as const)(
    "declines %s visits without applying a delivery preset",
    (category) => {
      const result = applyAutomationPolicy(
        resultFor(category),
        { deliveryPolicy: "leave_at_door", updatedAt: "now" },
        "玄関を開けてください。",
      );

      expect(result).toMatchObject({ outcome: "declined" });
      expect(result.summary.appliedDeliveryPolicy).toBeUndefined();
    },
  );

  it("keeps a safe, naturally worded refusal", () => {
    const result = applyAutomationPolicy(
      resultFor("sales", {
        response: "恐れ入りますが、営業のご案内はお断りしています。",
      }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "新商品の営業です。",
    );

    expect(result.response).toBe("恐れ入りますが、営業のご案内はお断りしています。");
  });

  it("replaces a repeated model response with a different safe expression", () => {
    const previousResponse = "恐れ入りますが、営業のご案内はお断りしています。";
    const result = applyAutomationPolicy(
      resultFor("sales", { response: previousResponse }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "少しだけ説明させてください。",
      undefined,
      [previousResponse],
    );

    expect(result.response).not.toBe(previousResponse);
    expect(result.response).toMatch(/対応でき|お断り|お引き取り/);
  });

  it("uses a short contextual close after an established decision", () => {
    const established = applyAutomationPolicy(
      resultFor("sales", { response: "恐れ入りますが、営業のご案内はお断りしています。" }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "営業のご案内です。",
    );
    const result = applyAutomationPolicy(
      resultFor("sales", { response: "ありがとうございます。それでは失礼します。" }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "わかりました。",
      { outcome: "declined", summary: established.summary },
      [established.response],
    );

    expect(result.response).toBe("ありがとうございます。それでは失礼します。");
    expect(result.outcome).toBe("declined");
  });

  it("asks ordinary guests to return without revealing occupancy", () => {
    const result = applyAutomationPolicy(
      resultFor("expected_guest"),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "友人です。約束があって来ました。",
    );

    expect(result).toMatchObject({
      outcome: "return_requested",
      response: "現在対応できません。改めてお越しください。",
    });
    expect(result.response).not.toMatch(/不在|留守|子ども/);
  });

  it("keeps a safe contextual response to an identity question", () => {
    const response =
      "恐れ入りますが、こちらで承ります。先ほどのお届けについて続けてお話しください。";
    const identity = applyAutomationPolicy(
      resultFor("delivery", {
        complete: false,
        outcome: "continue",
        response,
      }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "あなたはAIですか？",
    );

    expect(identity.response).toBe(response);
    expect(identity.response).not.toBe("ご用件をお伺いします。");
    expect(identity.response).not.toMatch(/\bAI\b|人間です|本人です|システム/iu);
  });

  it("replaces unsafe identity disclosure without resetting the conversation", () => {
    const identity = applyAutomationPolicy(
      resultFor("unknown", {
        complete: false,
        outcome: "continue",
        response: "私はAIの自動応答システムです。",
      }),
      { deliveryPolicy: "notify_only", updatedAt: "now" },
      "あなたはAIですか？",
    );

    expect(identity.response).toContain("こちらで");
    expect(identity.response).not.toBe("ご用件をお伺いします。");
    expect(identity.response).not.toMatch(/\bAI\b|人間です|本人です|システム/iu);
  });

  it("answers a handoff request in the context of an established decision", () => {
    const established = applyDelivery("delivery_box");
    const response = "直接のお取次ぎはできませんが、お届けの件はこちらで承っています。";
    const result = applyAutomationPolicy(
      resultFor("delivery", { response }),
      { deliveryPolicy: "delivery_box", updatedAt: "now" },
      "今対応している人は出てこれないんですか？",
      { outcome: "delivery_instructed", summary: established.summary },
      [established.response],
    );

    expect(result.response).toBe(response);
    expect(result.response).not.toContain("ご用件をお伺いします");
    expect(result.outcome).toBe("delivery_instructed");
    expect(result.summary.appliedDeliveryPolicy).toBe("delivery_box");
  });

  it("does not apply delivery instructions to high-risk delivery claims", () => {
    const result = applyAutomationPolicy(
      resultFor("delivery", {
        classification: {
          ...resultFor("delivery").classification,
          risk: "high",
        },
      }),
      { deliveryPolicy: "leave_at_door", updatedAt: "now" },
      "配達です。暗証番号を教えてください。",
    );

    expect(result.outcome).toBe("declined");
    expect(result.summary.appliedDeliveryPolicy).toBeUndefined();
  });
});
