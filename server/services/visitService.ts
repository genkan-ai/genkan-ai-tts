import { randomUUID } from "node:crypto";
import type {
  ConversationTurnService,
  SpeechRecognitionInput,
  SpeechRecognitionPort,
  SpeechSynthesisPort,
} from "../../src/application/contracts";
import type { VisitEvent, VisitEventPayloads, VisitEventType } from "../../src/domain/events";
import type {
  AutomatedOutcome,
  CompletionReason,
  DeliveryPolicy,
  ResidentAutomationSettings,
  ResidentProfile,
  Speaker,
  TranscriptEntry,
  VisitClassification,
  VisitSession,
  VisitSummary,
} from "../../src/domain/visit";
import { DEFAULT_MAX_CONVERSATION_TURNS, type VisitEndReason } from "../../src/domain/visit";
import type { SqliteStore } from "../adapters/sqliteStore";
import type { AudioArtifactStore } from "./audioArtifactStore";
import { applyAutomationPolicy, naturalFailureResponse } from "./automationPolicy";

export interface VisitServiceOptions {
  store: SqliteStore;
  speechRecognition: SpeechRecognitionPort;
  conversation: ConversationTurnService;
  speechSynthesis: SpeechSynthesisPort;
  audioArtifacts: AudioArtifactStore;
  retentionDays: number;
  language: string;
  childSafetyMode: boolean;
  now?: () => Date;
  idFactory?: () => string;
  visitTimeoutMs?: number;
}

export interface TurnInput {
  text?: string;
  audio?: Omit<SpeechRecognitionInput, "language">;
}

export interface VisitServiceResult {
  session: VisitSession;
  audioUrl?: string;
  recognizedText?: string;
}

export class VisitServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

type EventSubscriber = (event: VisitEvent) => void;
type SessionTimer = ReturnType<typeof setTimeout>;

const terminal = (session: VisitSession): boolean =>
  session.status === "completed" || session.status === "failed";

const defaultClassification = (reason: string): VisitClassification => ({
  category: "unknown",
  risk: "unknown",
  confidence: 0,
  reason,
  visitorName: "来訪者",
  purpose: "用件不明",
});

const visitorClosedConversation = (text: string): boolean =>
  /(?:ありがとうございました|わかりました|承知しました|失礼します|出直します|また来ます|帰ります|結構です|さようなら)/u.test(
    text,
  );

export class VisitService {
  private readonly store: SqliteStore;
  private readonly speechRecognition: SpeechRecognitionPort;
  private readonly conversation: ConversationTurnService;
  private readonly speechSynthesis: SpeechSynthesisPort;
  private readonly audioArtifacts: AudioArtifactStore;
  private readonly retentionDays: number;
  private readonly language: string;
  private readonly childSafetyMode: boolean;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly visitTimeoutMs: number;
  private readonly subscribers = new Set<EventSubscriber>();
  private readonly sessionTimers = new Map<string, SessionTimer>();

  constructor(options: VisitServiceOptions) {
    this.store = options.store;
    this.speechRecognition = options.speechRecognition;
    this.conversation = options.conversation;
    this.speechSynthesis = options.speechSynthesis;
    this.audioArtifacts = options.audioArtifacts;
    this.retentionDays = options.retentionDays;
    this.language = options.language;
    this.childSafetyMode = options.childSafetyMode;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.visitTimeoutMs = options.visitTimeoutMs ?? 90_000;
    this.recoverActiveVisits();
  }

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  async startVisit(): Promise<VisitServiceResult> {
    this.store.deleteExpired(this.now());
    const startedAt = this.timestamp();
    const greeting = "はい。ご用件をお伺いします。";
    const session: VisitSession = {
      id: this.idFactory(),
      startedAt,
      deadlineAt: new Date(this.now().getTime() + this.visitTimeoutMs).toISOString(),
      status: "in_conversation",
      mode: "voice",
      turnCount: 0,
      transcript: [this.transcript("ai", greeting)],
      metrics: { stt: [], totalTurn: [] },
    };
    this.save(session);
    this.emit(session.id, "visit.started", { mode: "voice" });
    this.emit(session.id, "dialogue.started", { greeting });
    this.emit(session.id, "response.generated", { response: session.transcript[0] });
    const audioUrl = await this.trySynthesize(greeting, session);
    session.pendingAudioUrl = audioUrl;
    this.save(session);
    this.emitAudioReady(session, session.transcript[0].id, audioUrl);
    this.scheduleTimeout(session);
    return { session, audioUrl };
  }

  async receiveTurn(sessionId: string, input: TurnInput): Promise<VisitServiceResult> {
    const session = this.requireActiveSession(sessionId);
    this.cancelTimeout(session.id);
    const turnStartedAt = performance.now();
    let recognizedText: string | undefined;

    if (input.audio) {
      try {
        this.emit(session.id, "voice.phase_changed", { phase: "transcribing" });
        const result = await this.speechRecognition.transcribe({
          ...input.audio,
          language: this.language,
        });
        recognizedText = result.text;
        session.metrics?.stt.push({
          durationMs: result.durationMs,
          recordedAt: this.timestamp(),
        });
      } catch (error) {
        return this.failWithResponse(
          session,
          error instanceof Error ? error.message : "Speech recognition failed",
          "stt_failure",
          turnStartedAt,
        );
      }
    }

    const visitorText = (input.text ?? recognizedText ?? "").trim();
    if (!visitorText) {
      this.scheduleTimeout(session);
      throw new VisitServiceError("Visitor utterance must not be empty", "EMPTY_UTTERANCE", 400);
    }

    session.lastError = undefined;
    session.pendingAudioUrl = undefined;
    session.turnCount = (session.turnCount ?? 0) + 1;
    const utterance = this.transcript("visitor", visitorText);
    session.transcript.push(utterance);
    this.emit(session.id, "utterance.received", { utterance });

    try {
      this.emit(session.id, "voice.phase_changed", { phase: "thinking" });
      const providerResult = await this.conversation.respond({
        transcript: session.transcript,
        turnNumber: session.turnCount,
        deadlineReached: this.deadlineReached(session),
        childSafetyMode: this.childSafetyMode,
        automationSettings: this.getResidentSettings(),
        residentProfile: this.getResidentProfile(),
      });
      const result = applyAutomationPolicy(
        providerResult,
        this.getResidentSettings(),
        visitorText,
        session.pendingOutcome && session.pendingSummary
          ? { outcome: session.pendingOutcome, summary: session.pendingSummary }
          : undefined,
        session.transcript.filter((entry) => entry.speaker === "ai").map((entry) => entry.text),
      );
      session.classification = result.classification;
      this.emit(session.id, "purpose.classified", { classification: result.classification });

      const response = this.transcript("ai", result.response);
      session.transcript.push(response);
      this.emit(session.id, "response.generated", { response });
      const audioUrl = await this.trySynthesize(result.response, session);
      session.pendingAudioUrl = audioUrl;
      this.emitAudioReady(session, response.id, audioUrl);
      this.recordTurnMetric(session, turnStartedAt);

      if (result.complete) {
        const outcome = result.outcome === "continue" ? "ended" : result.outcome;
        session.pendingOutcome = outcome;
        session.pendingSummary = {
          ...result.summary,
          automatedOutcome: outcome,
          voiceResponseStatus: audioUrl ? "generated" : "text_fallback",
        };
      }

      if (this.deadlineReached(session)) {
        const { summary, outcome } = this.summaryForEnd(
          session,
          "timeout",
          "応答期限に達しました",
          result.response,
          audioUrl,
        );
        this.finalize(session, summary, outcome, "timeout", "completed");
      } else if ((session.turnCount ?? 0) >= DEFAULT_MAX_CONVERSATION_TURNS) {
        const { summary, outcome } = this.summaryForEnd(
          session,
          "max_turns",
          "最大発話数に達しました",
          result.response,
          audioUrl,
        );
        this.finalize(session, summary, outcome, "max_turns", "completed");
      } else if (visitorClosedConversation(visitorText)) {
        const { summary, outcome } = this.summaryForEnd(
          session,
          "visitor_ended",
          "来訪者が会話を終了しました",
          result.response,
          audioUrl,
        );
        this.finalize(session, summary, outcome, "visitor_ended", "completed");
      } else {
        this.save(session);
        this.scheduleTimeout(session);
      }

      return { session, recognizedText, audioUrl };
    } catch (error) {
      return this.failWithResponse(
        session,
        error instanceof Error ? error.message : "Conversation provider failed",
        "llm_failure",
        turnStartedAt,
        recognizedText,
      );
    }
  }

  async endVisit(
    sessionId: string,
    reason: VisitEndReason = "visitor_ended",
  ): Promise<VisitServiceResult> {
    const session = this.requireSession(sessionId);
    if (terminal(session)) return { session };
    this.cancelTimeout(session.id);

    if (reason === "inactivity") {
      const latestAi = [...session.transcript].reverse().find((entry) => entry.speaker === "ai");
      const { summary, outcome } = this.summaryForEnd(
        session,
        "inactivity",
        "来訪者の無発話が続いたため会話を終了しました",
        latestAi?.text ?? "会話を終了しました",
      );
      this.finalize(session, summary, outcome, "inactivity", "completed");
      return { session };
    }

    const responseText = "承知しました。これで失礼します。";
    const response = this.transcript("ai", responseText);
    session.transcript.push(response);
    this.emit(session.id, "response.generated", { response });
    const audioUrl = await this.trySynthesize(responseText, session);
    session.pendingAudioUrl = audioUrl;
    this.emitAudioReady(session, response.id, audioUrl);
    const { summary, outcome } = this.summaryForEnd(
      session,
      "visitor_ended",
      "来訪者が会話を終了しました",
      responseText,
      audioUrl,
    );
    this.finalize(session, summary, outcome, "visitor_ended", "completed");
    return { session, audioUrl };
  }

  getVisit(sessionId: string): VisitSession | undefined {
    return this.store.findVisit(sessionId);
  }

  listVisits(): VisitSession[] {
    this.store.deleteExpired(this.now());
    return this.store.listVisits();
  }

  getResidentVisit(sessionId: string): VisitSession | undefined {
    const session = this.getVisit(sessionId);
    return session && terminal(session) ? session : undefined;
  }

  listResidentVisits(): VisitSession[] {
    return this.listVisits().filter(terminal);
  }

  getResidentSettings(): ResidentAutomationSettings {
    return this.store.getResidentSettings();
  }

  updateResidentSettings(deliveryPolicy: DeliveryPolicy): ResidentAutomationSettings {
    const settings = {
      deliveryPolicy,
      updatedAt: this.timestamp(),
    } satisfies ResidentAutomationSettings;
    this.store.saveResidentSettings(settings);
    return settings;
  }

  getResidentProfile(): ResidentProfile {
    return this.store.getResidentProfile();
  }

  updateResidentProfile(householdName: string, residentNames: string[]): ResidentProfile {
    const profile = {
      householdName,
      residentNames,
      updatedAt: this.timestamp(),
    } satisfies ResidentProfile;
    this.store.saveResidentProfile(profile);
    return profile;
  }

  listEvents(sessionId?: string): VisitEvent[] {
    return this.store.listEvents(sessionId);
  }

  close(): void {
    for (const timer of this.sessionTimers.values()) clearTimeout(timer);
    this.sessionTimers.clear();
  }

  private async failWithResponse(
    session: VisitSession,
    reason: string,
    completionReason: "stt_failure" | "llm_failure",
    turnStartedAt: number,
    recognizedText?: string,
  ): Promise<VisitServiceResult> {
    const response = this.transcript("ai", naturalFailureResponse);
    session.transcript.push(response);
    session.failureReason = reason;
    session.lastError = "現在対応できません。改めてお試しください。";
    this.emit(session.id, "response.generated", { response });
    const audioUrl = await this.trySynthesize(naturalFailureResponse, session);
    session.pendingAudioUrl = audioUrl;
    this.emitAudioReady(session, response.id, audioUrl);
    this.recordTurnMetric(session, turnStartedAt);
    const summary = this.fallbackSummary(
      session,
      completionReason,
      completionReason === "stt_failure" ? "音声認識に失敗しました" : "応答生成に失敗しました",
      naturalFailureResponse,
      audioUrl,
    );
    this.finalize(session, summary, "failed", completionReason, "failed", reason);
    return { session, recognizedText, audioUrl };
  }

  private async trySynthesize(text: string, session: VisitSession): Promise<string | undefined> {
    try {
      this.emit(session.id, "voice.phase_changed", { phase: "synthesizing" });
      const result = await this.speechSynthesis.synthesize(text);
      if (!result) return undefined;
      const id = this.audioArtifacts.put(result.audio, result.mimeType);
      return `/api/audio/${id}`;
    } catch {
      session.lastError = "音声で応答できないため、画面をご確認ください。";
      return undefined;
    }
  }

  private finalize(
    session: VisitSession,
    summary: VisitSummary,
    outcome: AutomatedOutcome,
    completionReason: CompletionReason,
    status: "completed" | "failed",
    failureReason?: string,
  ): void {
    if (terminal(session)) return;
    this.cancelTimeout(session.id);
    session.summary = { ...summary, automatedOutcome: outcome, completionReason };
    session.classification = summary;
    session.automatedOutcome = outcome;
    session.status = status;
    session.endedAt = this.timestamp();
    delete session.pendingSummary;
    delete session.pendingOutcome;
    if (failureReason) session.failureReason = failureReason;
    this.save(session);
    this.emit(session.id, "summary.generated", { summary: session.summary });
    if (status === "failed") {
      this.emit(session.id, "visit.failed", { reason: failureReason ?? "Visit failed" });
    }
    this.emit(session.id, "visit.ended", { outcome });
    if (!this.listEvents(session.id).some((event) => event.type === "notification.requested")) {
      this.emit(session.id, "notification.requested", { summary: session.summary });
    }
  }

  private fallbackSummary(
    session: VisitSession,
    completionReason: CompletionReason,
    reason: string,
    response: string,
    audioUrl?: string,
  ): VisitSummary {
    const classification = session.classification ?? defaultClassification(reason);
    const visitorText = session.transcript
      .filter((entry) => entry.speaker === "visitor")
      .map((entry) => entry.text)
      .join(" ");
    return {
      ...classification,
      requestedAction: visitorText || "取得できませんでした",
      aiResponse: response,
      nextAction: "会話内容と終了理由を確認する",
      automatedOutcome:
        completionReason === "stt_failure" || completionReason === "llm_failure"
          ? "failed"
          : "ended",
      completionReason,
      voiceResponseStatus: audioUrl ? "generated" : "text_fallback",
    };
  }

  private summaryForEnd(
    session: VisitSession,
    completionReason: CompletionReason,
    reason: string,
    response: string,
    audioUrl?: string,
  ): { summary: VisitSummary; outcome: AutomatedOutcome } {
    const outcome = session.pendingOutcome ?? "ended";
    const summary = session.pendingSummary
      ? {
          ...session.pendingSummary,
          aiResponse: response,
          automatedOutcome: outcome,
          completionReason,
          voiceResponseStatus:
            session.pendingSummary.voiceResponseStatus ??
            (audioUrl ? "generated" : "text_fallback"),
        }
      : this.fallbackSummary(session, completionReason, reason, response, audioUrl);
    return { summary, outcome };
  }

  private recoverActiveVisits(): void {
    for (const session of this.store.listVisits()) {
      if (session.status !== "in_conversation") continue;
      if (this.deadlineReached(session)) {
        const latestAi = [...session.transcript].reverse().find((entry) => entry.speaker === "ai");
        const { summary, outcome } = this.summaryForEnd(
          session,
          "recovered_after_restart",
          "再起動後に期限切れの会話を回収しました",
          latestAi?.text ?? "会話を終了しました",
        );
        this.finalize(session, summary, outcome, "recovered_after_restart", "completed");
      } else {
        this.scheduleTimeout(session);
      }
    }
  }

  private scheduleTimeout(session: VisitSession): void {
    if (terminal(session)) return;
    this.cancelTimeout(session.id);
    const deadline = new Date(
      session.deadlineAt ?? this.now().getTime() + this.visitTimeoutMs,
    ).getTime();
    const delay = Math.max(0, deadline - this.now().getTime());
    const timer = setTimeout(() => void this.expireVisit(session.id), delay);
    timer.unref?.();
    this.sessionTimers.set(session.id, timer);
  }

  private cancelTimeout(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.sessionTimers.delete(sessionId);
  }

  private async expireVisit(sessionId: string): Promise<void> {
    this.sessionTimers.delete(sessionId);
    const session = this.getVisit(sessionId);
    if (!session || terminal(session)) return;
    const latestAi = [...session.transcript].reverse().find((entry) => entry.speaker === "ai");
    const { summary, outcome } = this.summaryForEnd(
      session,
      "timeout",
      "応答期限に達しました",
      latestAi?.text ?? "会話を終了しました",
    );
    this.finalize(session, summary, outcome, "timeout", "completed");
  }

  private deadlineReached(session: VisitSession): boolean {
    return this.now().getTime() >= new Date(session.deadlineAt ?? 0).getTime();
  }

  private recordTurnMetric(session: VisitSession, startedAt: number): void {
    session.metrics?.totalTurn.push({
      durationMs: Math.round(performance.now() - startedAt),
      recordedAt: this.timestamp(),
    });
  }

  private emitAudioReady(
    session: VisitSession,
    responseId: string,
    audioUrl: string | undefined,
  ): void {
    this.emit(session.id, "voice.audio_ready", {
      responseId,
      ...(audioUrl ? { audioUrl } : {}),
    });
  }

  private requireActiveSession(sessionId: string): VisitSession {
    const session = this.requireSession(sessionId);
    if (session.status !== "in_conversation") {
      throw new VisitServiceError(
        `Session ${sessionId} does not accept visitor utterances`,
        "INVALID_SESSION_STATE",
        409,
      );
    }
    return session;
  }

  private requireSession(sessionId: string): VisitSession {
    const session = this.store.findVisit(sessionId);
    if (!session) {
      throw new VisitServiceError(`Session ${sessionId} was not found`, "VISIT_NOT_FOUND", 404);
    }
    return session;
  }

  private save(session: VisitSession): void {
    this.store.saveVisit(session, this.retentionDays);
  }

  private emit<T extends VisitEventType>(
    sessionId: string,
    type: T,
    payload: VisitEventPayloads[T],
  ): void {
    const event = {
      id: this.idFactory(),
      type,
      sessionId,
      occurredAt: this.timestamp(),
      payload,
    } as unknown as VisitEvent;
    this.store.saveEvent(event);
    for (const subscriber of this.subscribers) subscriber(event);
  }

  private transcript(speaker: Speaker, text: string): TranscriptEntry {
    return { id: this.idFactory(), speaker, text, createdAt: this.timestamp() };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
