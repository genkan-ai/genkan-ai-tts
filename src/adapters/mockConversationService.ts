import type { ConversationResult, ConversationService } from "../application/contracts";
import type { AutomatedOutcome, RiskLevel, VisitCategory } from "../domain/visit";

interface ClassificationRule {
  category: VisitCategory;
  risk: RiskLevel;
  keywords: string[];
  reason: string;
  purpose: string;
  response: string;
  nextAction: string;
  outcome: AutomatedOutcome;
}

const rules: ClassificationRule[] = [
  {
    category: "fraud",
    risk: "high",
    keywords: ["還付金", "口座番号", "キャッシュカード", "認証番号", "詐欺"],
    reason: "詐欺や認証情報の要求を示す内容です",
    purpose: "詐欺の疑いがある訪問",
    response: "申し訳ありませんが、対応できません。",
    nextAction: "内容を確認し、必要なら関係機関へ相談する",
    outcome: "declined",
  },
  {
    category: "emergency",
    risk: "high",
    keywords: ["火事", "救急", "倒れ", "緊急", "助けて"],
    reason: "緊急性を示す表現が含まれています",
    purpose: "緊急の申し出",
    response: "緊急の場合は110番または119番へ連絡してください。",
    nextAction: "内容を確認し、必要に応じて人が緊急対応する",
    outcome: "emergency_guidance",
  },
  {
    category: "delivery",
    risk: "low",
    keywords: ["配達", "宅配", "荷物", "お届け", "伝票"],
    reason: "配達または荷物のお届けを示す内容です",
    purpose: "荷物のお届け",
    response: "ご用件を承りました。こちらでお伝えします。",
    nextAction: "荷物の宛名と対応方法を確認する",
    outcome: "notified",
  },
  {
    category: "collection",
    risk: "medium",
    keywords: ["集金", "料金", "契約", "支払い", "点検"],
    reason: "金銭または契約に関する用件が含まれています",
    purpose: "集金・契約に関する訪問",
    response: "金銭や契約には対応できません。失礼いたします。",
    nextAction: "事業者名と訪問予定を確認する",
    outcome: "declined",
  },
  {
    category: "sales",
    risk: "medium",
    keywords: ["営業", "勧誘", "ご案内", "おすすめ", "キャンペーン"],
    reason: "営業または勧誘を示す内容です",
    purpose: "営業・勧誘",
    response: "営業や勧誘には対応できません。失礼いたします。",
    nextAction: "必要がなければ訪問を断る",
    outcome: "declined",
  },
  {
    category: "suspicious",
    risk: "high",
    keywords: ["暗証", "認証コード", "開けて", "今すぐ", "家族構成", "留守"],
    reason: "機密情報や在宅状況を求める表現が含まれています",
    purpose: "確認が必要な訪問",
    response: "安全のため、その情報や対応はお伝えできません。これで失礼いたします。",
    nextAction: "応答せず、必要に応じて関係先へ確認する",
    outcome: "declined",
  },
  {
    category: "expected_guest",
    risk: "low",
    keywords: ["約束", "予約", "友人", "知人", "伺いました"],
    reason: "予定または知人による訪問を示す内容です",
    purpose: "予定された訪問",
    response: "現在対応できません。改めてお越しください。",
    nextAction: "予定と来訪者名を確認する",
    outcome: "return_requested",
  },
];

const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

const extractVisitorName = (utterance: string): string => {
  const normalized = utterance.replace(/[。！!？?]/g, " ");
  const companyMatch = normalized.match(
    /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9ー]{2,16}(?:運輸|配送|便|株式会社|会社|サービス))/u,
  );
  if (companyMatch?.[1]) {
    return companyMatch[1];
  }

  const namedMatch = normalized.match(
    /(?:私は|わたしは|こちらは)?\s*([^\s、,]{2,16})(?:です|と申します)/u,
  );
  return namedMatch?.[1] ?? "来訪者";
};

export class MockConversationService implements ConversationService {
  analyze(visitorUtterance: string): ConversationResult {
    const normalized = normalize(visitorUtterance);
    const matchedRule = rules.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(normalize(keyword))),
    );
    const rule =
      matchedRule ??
      ({
        category: "unknown",
        risk: "unknown",
        reason: "訪問目的を確実に分類できる情報が不足しています",
        purpose: "用件不明",
        response: "用件を確認できないため、対応できません。",
        nextAction: "文字起こしを確認して判断する",
        outcome: "ended",
      } satisfies Omit<ClassificationRule, "keywords">);

    const visitorName = extractVisitorName(visitorUtterance);
    const classification = {
      category: rule.category,
      risk: rule.risk,
      confidence: matchedRule ? 0.86 : 0.35,
      reason: rule.reason,
      visitorName,
      purpose: rule.purpose,
    };

    return {
      classification,
      outcome: rule.outcome,
      response: rule.response,
      summary: {
        ...classification,
        requestedAction: visitorUtterance.trim(),
        aiResponse: rule.response,
        nextAction: rule.nextAction,
      },
    };
  }
}
