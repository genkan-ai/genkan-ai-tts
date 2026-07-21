import type { VisitEvent, VisitEventType } from "../domain/events";
import type {
  ConversationOutcome,
  ResidentAutomationSettings,
  ResidentProfile,
  TranscriptEntry,
  VisitClassification,
  VisitSession,
  VisitSummary,
} from "../domain/visit";

export type EventListener = (event: VisitEvent) => void;

export interface EventBus {
  publish<T extends VisitEventType>(event: VisitEvent<T>): void;
  subscribe(listener: EventListener): () => void;
  list(sessionId?: string): VisitEvent[];
}

export interface ConversationResult {
  classification: VisitClassification;
  outcome: ConversationOutcome;
  response: string;
  summary: VisitSummary;
}

export interface ConversationService {
  analyze(visitorUtterance: string): ConversationResult;
}

export interface SpeechRecognitionInput {
  audio: Uint8Array;
  fileName: string;
  language: string;
  mimeType: string;
}

export interface SpeechRecognitionResult {
  text: string;
  durationMs: number;
  provider: string;
}

export interface SpeechRecognitionPort {
  transcribe(input: SpeechRecognitionInput): Promise<SpeechRecognitionResult>;
  health(): Promise<boolean>;
}

export interface SpeechSynthesisResult {
  audio: Uint8Array;
  mimeType: string;
  provider: string;
}

export interface SpeechSynthesisPort {
  synthesize(text: string): Promise<SpeechSynthesisResult | undefined>;
  health(): Promise<boolean>;
}

export interface ConversationTurnInput {
  transcript: TranscriptEntry[];
  turnNumber: number;
  deadlineReached: boolean;
  childSafetyMode: boolean;
  automationSettings: ResidentAutomationSettings;
  residentProfile?: ResidentProfile;
}

export interface ConversationTurnResult extends ConversationResult {
  complete: boolean;
}

export interface ConversationTurnService {
  respond(input: ConversationTurnInput): Promise<ConversationTurnResult>;
  health(): Promise<boolean>;
}

export interface NotificationPort {
  notify(sessionId: string, summary: VisitSummary): void;
}

export interface VisitRepository {
  save(session: VisitSession): void;
  findById(sessionId: string): VisitSession | undefined;
  list(): VisitSession[];
}
