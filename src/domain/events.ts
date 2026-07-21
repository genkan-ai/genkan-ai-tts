import type { AutomatedOutcome, TranscriptEntry, VisitClassification, VisitSummary } from "./visit";

export interface VisitEventPayloads {
  "visit.started": { mode: "simulator" | "voice" };
  "dialogue.started": { greeting: string };
  "utterance.received": { utterance: TranscriptEntry };
  "voice.phase_changed": {
    phase: "transcribing" | "thinking" | "synthesizing";
  };
  "voice.audio_ready": { responseId: string; audioUrl?: string };
  "purpose.classified": { classification: VisitClassification };
  "response.generated": { response: TranscriptEntry };
  "summary.generated": { summary: VisitSummary };
  "notification.requested": { summary: VisitSummary };
  "visit.ended": { outcome: AutomatedOutcome };
  "visit.failed": { reason: string };
}

export type VisitEventType = keyof VisitEventPayloads;

export type VisitEvent<T extends VisitEventType = VisitEventType> = {
  [K in T]: {
    id: string;
    type: K;
    sessionId: string;
    occurredAt: string;
    payload: VisitEventPayloads[K];
  };
}[T];

export const eventLabels: Record<VisitEventType, string> = {
  "visit.started": "来訪開始",
  "dialogue.started": "対話開始",
  "utterance.received": "発話受信",
  "voice.phase_changed": "音声処理",
  "voice.audio_ready": "音声準備完了",
  "purpose.classified": "用件分類",
  "response.generated": "応答生成",
  "summary.generated": "要約生成",
  "notification.requested": "通知要求",
  "visit.ended": "来訪終了",
  "visit.failed": "来訪失敗",
};
