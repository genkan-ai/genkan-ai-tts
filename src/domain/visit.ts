export type VisitCategory =
  | "delivery"
  | "expected_guest"
  | "collection"
  | "sales"
  | "fraud"
  | "suspicious"
  | "emergency"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type VisitStatus = "ringing" | "in_conversation" | "completed" | "failed";

export const deliveryPolicies = [
  "notify_only",
  "leave_at_door",
  "delivery_box",
  "request_redelivery",
] as const;

export type DeliveryPolicy = (typeof deliveryPolicies)[number];

export const speechVoices = ["female", "male"] as const;

export type SpeechVoice = (typeof speechVoices)[number];

export interface ResidentAutomationSettings {
  deliveryPolicy: DeliveryPolicy;
  speechVoice?: SpeechVoice;
  updatedAt: string;
}

export interface ResidentProfile {
  householdName: string;
  residentNames: string[];
  updatedAt: string;
}

export const RESIDENT_PROFILE_MAX_RESIDENTS = 8;
export const RESIDENT_PROFILE_MAX_NAME_LENGTH = 40;

export type AutomatedOutcome =
  | "delivery_instructed"
  | "notified"
  | "return_requested"
  | "declined"
  | "emergency_guidance"
  | "ended"
  | "failed";
export type ConversationOutcome = AutomatedOutcome | "continue";

export type Speaker = "ai" | "visitor";

export type CompletionReason =
  | "conversation_complete"
  | "visitor_ended"
  | "tester_forced"
  | "inactivity"
  | "timeout"
  | "max_turns"
  | "stt_failure"
  | "llm_failure"
  | "recovered_after_restart";

export type VisitEndReason = "visitor_ended" | "tester_forced" | "inactivity";

export const DEFAULT_MAX_CONVERSATION_TURNS = 8;

export interface TranscriptEntry {
  id: string;
  speaker: Speaker;
  text: string;
  createdAt: string;
}

export interface VisitClassification {
  category: VisitCategory;
  risk: RiskLevel;
  confidence: number;
  reason: string;
  visitorName: string;
  purpose: string;
}

export interface VisitSummary extends VisitClassification {
  requestedAction: string;
  aiResponse: string;
  nextAction: string;
  automatedOutcome?: AutomatedOutcome;
  appliedDeliveryPolicy?: DeliveryPolicy;
  completionReason?: CompletionReason;
  voiceResponseStatus?: "generated" | "text_fallback";
}

export interface VisitSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: VisitStatus;
  mode?: "simulator" | "voice";
  turnCount?: number;
  deadlineAt?: string;
  transcript: TranscriptEntry[];
  classification?: VisitClassification;
  summary?: VisitSummary;
  automatedOutcome?: AutomatedOutcome;
  pendingSummary?: VisitSummary;
  pendingOutcome?: AutomatedOutcome;
  failureReason?: string;
  lastError?: string;
  pendingAudioUrl?: string;
  metrics?: VisitMetrics;
}

export interface TimingSample {
  durationMs: number;
  recordedAt: string;
}

export interface VisitMetrics {
  stt: TimingSample[];
  totalTurn: TimingSample[];
}

export const categoryLabels: Record<VisitCategory, string> = {
  delivery: "配達",
  expected_guest: "予定された訪問",
  collection: "集金・契約",
  sales: "営業・勧誘",
  fraud: "詐欺の疑い",
  suspicious: "不審な訪問",
  emergency: "緊急の可能性",
  unknown: "不明",
};

export const riskLabels: Record<RiskLevel, string> = {
  low: "低",
  medium: "注意",
  high: "高",
  unknown: "不明",
};
