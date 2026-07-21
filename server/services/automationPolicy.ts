import type { ConversationTurnResult } from "../../src/application/contracts";
import type {
  AutomatedOutcome,
  DeliveryPolicy,
  ResidentAutomationSettings,
  VisitSummary,
} from "../../src/domain/visit";

const forbiddenSpokenContent =
  /(?:\bAI\b|人工知能|自動応答|システム|OpenAI|Sakana|Fish Audio|Whisper|不在|留守|子どもだけ)/iu;
const forbiddenIdentityClaim =
  /(?:(?:私は|わたしは|こちらは|対応しているのは).{0,12}(?:人間|本人|居住者|家族|管理会社)|(?:人間|本人|居住者|家族|管理会社)(?:です|でございます|ではありません|が対応しています|として対応しています))/u;
const forbiddenCommitment =
  /(?:解錠|鍵を開け|支払い|決済|受け取り(?:ます|ました)|待っていて|お待ちください|折り返し|こちらから通報|連絡先|暗証番号|認証コード)/u;
const identityOrHandoffQuestion =
  /(?:AI|人工知能|人間|ご本人|本人ですか|誰ですか|誰が対応|出てこられ|出てこれ|出られない|代わって|代われ|呼んで|取り次い|取次い|直接.*(?:話|対応))/iu;
const newlyUnsafeRequest =
  /(?:暗証番号|認証コード|鍵を開け|解錠|現金|カード番号|支払い|契約書にサイン)/u;
const benignFollowUp =
  /(?:わかりました|分かりました|承知しました|了解しました|ありがとう|そうですか|失礼します|帰ります|また来ます|結構です|ですか)[。！!？?]*$/u;

type ResponsePool = readonly [string, ...string[]];

const safeResponsePools: Record<Exclude<AutomatedOutcome, "failed">, ResponsePool> = {
  delivery_instructed: [
    "ご指定の場所へ置いてください。",
    "その方法でお願いいたします。",
    "ご対応をお願いします。",
  ],
  notified: [
    "ご用件を承りました。こちらでお伝えします。",
    "内容はこちらでお預かりします。",
    "ご用件はこちらで記録いたします。",
  ],
  return_requested: [
    "現在対応できません。改めてお越しください。",
    "恐れ入りますが、別の機会にお越しください。",
    "申し訳ありませんが、日を改めてお願いします。",
  ],
  declined: [
    "申し訳ありませんが、対応できません。",
    "恐れ入りますが、今回はお断りします。",
    "今回は結構ですので、お引き取りください。",
  ],
  emergency_guidance: [
    "緊急の場合は110番または119番へご連絡ください。",
    "危険が迫っている場合は、110番か119番へ直接ご連絡ください。",
    "緊急性がある場合は、110番または119番へお願いします。",
  ],
  ended: [
    "申し訳ありませんが、現在対応できません。",
    "恐れ入りますが、これ以上の対応はできません。",
    "今回は対応いたしかねます。失礼します。",
  ],
};

const deliveryInstructions: Record<
  DeliveryPolicy,
  { outcome: AutomatedOutcome; responses: ResponsePool; requiredMeaning: RegExp }
> = {
  notify_only: {
    outcome: "notified",
    responses: [
      "ご用件を承りました。こちらでお伝えします。",
      "配達の件はこちらでお預かりします。",
      "お届けの件はこちらで記録いたします。",
    ],
    requiredMeaning: /(?:承り|伝え|知らせ|記録|用件)/u,
  },
  leave_at_door: {
    outcome: "delivery_instructed",
    responses: [
      "ありがとうございます。玄関前に置いてください。",
      "お手数ですが、荷物はドア前へお願いします。",
      "恐れ入りますが、玄関前への置き配でお願いします。",
    ],
    requiredMeaning: /(?=.*(?:玄関前|ドア前))(?=.*(?:置いて|置き配|お願いします))/u,
  },
  delivery_box: {
    outcome: "delivery_instructed",
    responses: [
      "ありがとうございます。宅配ボックスをご利用ください。",
      "お手数ですが、宅配ボックスへお願いします。",
      "荷物は宅配ボックスに入れていただけますか。",
    ],
    requiredMeaning: /(?=.*宅配ボックス)(?=.*(?:利用|入れて|お願いします))/u,
  },
  request_redelivery: {
    outcome: "return_requested",
    responses: [
      "申し訳ありません。改めて配達をお願いします。",
      "恐れ入りますが、別の機会に再配達をお願いします。",
      "お手数ですが、日を改めて配達してください。",
    ],
    requiredMeaning: /(?:再配達|改めて.*配達|別の機会.*配達)/u,
  },
};

const withTerminalResponse = (
  result: ConversationTurnResult,
  outcome: AutomatedOutcome,
  response: string,
  nextAction: string,
  appliedDeliveryPolicy?: DeliveryPolicy,
): ConversationTurnResult => ({
  ...result,
  complete: true,
  outcome,
  response,
  summary: {
    ...result.summary,
    aiResponse: response,
    nextAction,
    automatedOutcome: outcome,
    ...(appliedDeliveryPolicy ? { appliedDeliveryPolicy } : {}),
  },
});

const normalizeForComparison = (value: string): string =>
  value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");

const bigrams = (value: string): string[] => {
  const normalized = normalizeForComparison(value);
  if (normalized.length < 2) return normalized ? [normalized] : [];
  return Array.from({ length: normalized.length - 1 }, (_, index) =>
    normalized.slice(index, index + 2),
  );
};

const responseSimilarity = (left: string, right: string): number => {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const pair of rightPairs) remaining.set(pair, (remaining.get(pair) ?? 0) + 1);
  let overlap = 0;
  for (const pair of leftPairs) {
    const count = remaining.get(pair) ?? 0;
    if (count <= 0) continue;
    overlap += 1;
    remaining.set(pair, count - 1);
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
};

const repeatsRecentResponse = (candidate: string, recentAiResponses: readonly string[]): boolean =>
  recentAiResponses.slice(-4).some((previous) => {
    const normalizedCandidate = normalizeForComparison(candidate);
    const normalizedPrevious = normalizeForComparison(previous);
    return (
      normalizedCandidate === normalizedPrevious ||
      (normalizedCandidate.length >= 8 && responseSimilarity(candidate, previous) >= 0.82)
    );
  });

const selectFallback = (candidates: ResponsePool, recentAiResponses: readonly string[]): string =>
  candidates.find((candidate) => !repeatsRecentResponse(candidate, recentAiResponses)) ??
  candidates[recentAiResponses.length % candidates.length];

const safeGeneratedResponse = (
  generated: string,
  fallbacks: ResponsePool,
  recentAiResponses: readonly string[],
  requiredMeaning?: RegExp,
): string => {
  const candidate = generated.trim();
  if (
    !candidate ||
    candidate.length > 90 ||
    forbiddenSpokenContent.test(candidate) ||
    forbiddenIdentityClaim.test(candidate) ||
    forbiddenCommitment.test(candidate) ||
    repeatsRecentResponse(candidate, recentAiResponses) ||
    (requiredMeaning && !requiredMeaning.test(candidate))
  ) {
    return selectFallback(fallbacks, recentAiResponses);
  }
  return candidate;
};

interface EstablishedAutomationDecision {
  outcome: AutomatedOutcome;
  summary: VisitSummary;
}

const followUpFallbackPools: Record<Exclude<AutomatedOutcome, "failed">, ResponsePool> = {
  delivery_instructed: [
    "承知しました。よろしくお願いします。",
    "ありがとうございます。ご対応をお願いします。",
    "お手数をおかけしますが、お願いします。",
  ],
  notified: [
    "承知しました。ご用件をお預かりします。",
    "ありがとうございます。内容は記録しました。",
    "かしこまりました。こちらで承ります。",
  ],
  return_requested: [
    "恐れ入りますが、改めてお越しください。",
    "申し訳ありませんが、別の機会にお願いします。",
    "今回は対応できませんので、日を改めてください。",
  ],
  declined: [
    "恐れ入りますが、ご案内したとおり対応できません。",
    "申し訳ありませんが、今回はお断りします。",
    "これ以上の対応はいたしかねます。失礼します。",
  ],
  emergency_guidance: [
    "緊急の場合は110番または119番へご連絡ください。",
    "危険がある場合は、110番か119番へ直接お願いします。",
    "緊急性があれば、すぐに110番または119番へご連絡ください。",
  ],
  ended: [
    "恐れ入りますが、現在対応できません。",
    "申し訳ありませんが、これで失礼します。",
    "今回は対応いたしかねます。",
  ],
};

const continueFallbacks: ResponsePool = [
  "恐れ入ります。もう少し詳しくご用件を伺えますか。",
  "差し支えなければ、ご用件をお聞かせください。",
  "どのようなご用件でしょうか。",
];

const identityDeflectionFallbacks: ResponsePool = [
  "恐れ入りますが、こちらで承ります。先ほどのお話の続きをお願いします。",
  "直接のお取次ぎはできませんが、こちらで内容を承ります。",
  "こちらでお話を伺いますので、そのまま続けてください。",
];

const identityFollowUpFallbackPools: Record<Exclude<AutomatedOutcome, "failed">, ResponsePool> = {
  delivery_instructed: [
    "直接のお取次ぎはできませんが、お届けの件はこちらで承っています。",
    "恐れ入りますが、こちらで対応します。先ほどのご案内でお願いします。",
    "こちらで承っていますので、お届けについて続けてお話しください。",
  ],
  notified: [
    "直接のお取次ぎはできませんが、伺った内容はこちらで承ります。",
    "恐れ入りますが、こちらでお話を伺います。そのまま続けてください。",
    "こちらで内容を承っていますので、続きがあればお話しください。",
  ],
  return_requested: [
    "恐れ入りますが、直接の対応はできません。先ほどのご案内どおりお願いします。",
    "直接のお取次ぎはできませんので、日を改めてお願いします。",
    "申し訳ありませんが、こちらでのご案内は変わりません。改めてお越しください。",
  ],
  declined: [
    "恐れ入りますが、直接のお取次ぎはできません。今回はお断りしています。",
    "こちらで対応していますが、ご案内した内容は変わりません。",
    "申し訳ありませんが、どなたへのお取次ぎもできません。これで失礼します。",
  ],
  emergency_guidance: [
    "直接のお取次ぎはできません。危険がある場合は110番か119番へお願いします。",
    "こちらから代わることはできませんので、緊急なら110番または119番へご連絡ください。",
    "恐れ入りますが、緊急の場合はご自身で110番か119番へお願いします。",
  ],
  ended: [
    "恐れ入りますが、直接のお取次ぎはできません。現在はこれ以上対応できません。",
    "こちらでの対応はここまでとなります。改めてお越しください。",
    "申し訳ありませんが、どなたへのお取次ぎもできません。失礼します。",
  ],
};

export const applyAutomationPolicy = (
  result: ConversationTurnResult,
  settings: ResidentAutomationSettings,
  latestVisitorText: string,
  establishedDecision?: EstablishedAutomationDecision,
  recentAiResponses: readonly string[] = [],
): ConversationTurnResult => {
  const isIdentityOrHandoffQuestion = identityOrHandoffQuestion.test(latestVisitorText);

  if (
    establishedDecision &&
    !newlyUnsafeRequest.test(latestVisitorText) &&
    (result.classification.risk !== "high" || benignFollowUp.test(latestVisitorText.trim())) &&
    (result.classification.category === establishedDecision.summary.category ||
      result.classification.category === "unknown")
  ) {
    const fallbacks: ResponsePool =
      establishedDecision.outcome === "failed"
        ? [naturalFailureResponse]
        : isIdentityOrHandoffQuestion
          ? identityFollowUpFallbackPools[establishedDecision.outcome]
          : followUpFallbackPools[establishedDecision.outcome];
    const response = safeGeneratedResponse(result.response, fallbacks, recentAiResponses);
    return {
      ...result,
      complete: true,
      outcome: establishedDecision.outcome,
      response,
      summary: {
        ...establishedDecision.summary,
        aiResponse: response,
      },
    };
  }

  if (!result.complete) {
    const response = safeGeneratedResponse(
      result.response,
      isIdentityOrHandoffQuestion ? identityDeflectionFallbacks : continueFallbacks,
      recentAiResponses,
    );
    return {
      ...result,
      outcome: "continue",
      response,
      summary: { ...result.summary, aiResponse: response },
    };
  }

  const { category, risk, confidence } = result.classification;
  if (category === "delivery") {
    if (risk === "high") {
      return withTerminalResponse(
        result,
        "declined",
        safeGeneratedResponse(
          result.response,
          safeResponsePools.declined,
          recentAiResponses,
          /(?:対応でき|お断り|遠慮|お引き取り|控えて)/u,
        ),
        "高リスクの配達として対応を終了",
      );
    }
    if (risk === "low" && confidence >= 0.8) {
      const instruction = deliveryInstructions[settings.deliveryPolicy];
      return withTerminalResponse(
        result,
        instruction.outcome,
        safeGeneratedResponse(
          result.response,
          instruction.responses,
          recentAiResponses,
          instruction.requiredMeaning,
        ),
        settings.deliveryPolicy === "notify_only"
          ? "配達内容を確認する"
          : "適用した配達方針を確認する",
        settings.deliveryPolicy,
      );
    }
    return withTerminalResponse(
      result,
      "notified",
      safeGeneratedResponse(result.response, safeResponsePools.notified, recentAiResponses),
      "配達内容とリスク判定を確認する",
    );
  }

  if (["sales", "collection", "fraud", "suspicious"].includes(category)) {
    return withTerminalResponse(
      result,
      "declined",
      safeGeneratedResponse(
        result.response,
        safeResponsePools.declined,
        recentAiResponses,
        /(?:対応でき|お断り|遠慮|お引き取り|控えて)/u,
      ),
      "断った訪問内容とリスク兆候を確認する",
    );
  }

  if (category === "expected_guest") {
    return withTerminalResponse(
      result,
      "return_requested",
      safeGeneratedResponse(
        result.response,
        safeResponsePools.return_requested,
        recentAiResponses,
        /(?:改めて|出直し|後ほど)/u,
      ),
      "来訪者名と再訪予定を確認する",
    );
  }

  if (category === "emergency") {
    return withTerminalResponse(
      result,
      "emergency_guidance",
      safeGeneratedResponse(
        result.response,
        safeResponsePools.emergency_guidance,
        recentAiResponses,
        /(?:110番|119番)/u,
      ),
      "緊急内容を直ちに確認する",
    );
  }

  const outcome: AutomatedOutcome = result.outcome === "continue" ? "ended" : result.outcome;
  const response = safeGeneratedResponse(
    result.response,
    outcome === "failed"
      ? ["申し訳ありませんが、現在対応できません。"]
      : safeResponsePools[outcome],
    recentAiResponses,
  );
  return withTerminalResponse(result, outcome, response, result.summary.nextAction);
};

export const naturalFailureResponse =
  "申し訳ありません。現在対応できません。改めてお越しください。";
