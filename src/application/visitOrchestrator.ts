import type { VisitEvent, VisitEventPayloads, VisitEventType } from "../domain/events";
import type { Speaker, TranscriptEntry, VisitSession } from "../domain/visit";
import type { ConversationService, EventBus, NotificationPort, VisitRepository } from "./contracts";

export interface VisitOrchestratorDependencies {
  conversationService: ConversationService;
  eventBus: EventBus;
  notificationPort: NotificationPort;
  repository: VisitRepository;
  idFactory?: () => string;
  now?: () => Date;
}

const defaultIdFactory = (): string => crypto.randomUUID();

export class VisitOrchestrator {
  private readonly conversationService: ConversationService;
  private readonly eventBus: EventBus;
  private readonly notificationPort: NotificationPort;
  private readonly repository: VisitRepository;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(dependencies: VisitOrchestratorDependencies) {
    this.conversationService = dependencies.conversationService;
    this.eventBus = dependencies.eventBus;
    this.notificationPort = dependencies.notificationPort;
    this.repository = dependencies.repository;
    this.idFactory = dependencies.idFactory ?? defaultIdFactory;
    this.now = dependencies.now ?? (() => new Date());
  }

  startVisit(): VisitSession {
    const sessionId = this.idFactory();
    const startedAt = this.timestamp();
    const greeting = "はい。ご用件をお伺いします。";
    const session: VisitSession = {
      id: sessionId,
      startedAt,
      status: "in_conversation",
      transcript: [this.transcript("ai", greeting)],
    };

    this.repository.save(session);
    this.emit(sessionId, "visit.started", { mode: "simulator" });
    this.emit(sessionId, "dialogue.started", { greeting });
    this.emit(sessionId, "response.generated", { response: session.transcript[0] });
    return session;
  }

  receiveVisitorUtterance(sessionId: string, text: string): VisitSession {
    const session = this.requireSession(sessionId);
    if (session.status !== "in_conversation") {
      throw new Error(`Session ${sessionId} does not accept visitor utterances`);
    }

    const visitorText = text.trim();
    if (!visitorText) {
      throw new Error("Visitor utterance must not be empty");
    }

    const utterance = this.transcript("visitor", visitorText);
    session.transcript.push(utterance);
    this.emit(sessionId, "utterance.received", { utterance });

    const result = this.conversationService.analyze(visitorText);
    session.classification = result.classification;
    this.emit(sessionId, "purpose.classified", { classification: result.classification });

    const response = this.transcript("ai", result.response);
    session.transcript.push(response);
    this.emit(sessionId, "response.generated", { response });

    session.summary = {
      ...result.summary,
      automatedOutcome: result.outcome === "continue" ? "ended" : result.outcome,
      ...(result.classification.category === "delivery" &&
      result.classification.risk === "low" &&
      result.classification.confidence >= 0.8
        ? { appliedDeliveryPolicy: "notify_only" as const }
        : {}),
      completionReason: "conversation_complete",
      voiceResponseStatus: "text_fallback",
    };
    session.automatedOutcome = result.outcome === "continue" ? "ended" : result.outcome;
    session.status = "completed";
    session.endedAt = this.timestamp();
    this.repository.save(session);
    this.emit(sessionId, "summary.generated", { summary: session.summary });
    this.emit(sessionId, "visit.ended", { outcome: session.automatedOutcome });
    this.notificationPort.notify(sessionId, session.summary);
    this.emit(sessionId, "notification.requested", { summary: session.summary });
    return session;
  }

  endByVisitor(sessionId: string): VisitSession {
    const session = this.requireSession(sessionId);
    if (session.status === "completed" || session.status === "failed") {
      return session;
    }
    const responseText = "承知しました。これで失礼します。";
    session.transcript.push(this.transcript("ai", responseText));
    session.classification ??= {
      category: "unknown",
      risk: "unknown",
      confidence: 0,
      reason: "来訪者が会話を終了しました",
      visitorName: "来訪者",
      purpose: "用件不明",
    };
    session.summary = {
      ...session.classification,
      requestedAction:
        session.transcript
          .filter((entry) => entry.speaker === "visitor")
          .map((entry) => entry.text)
          .join(" ") || "取得できませんでした",
      aiResponse: responseText,
      nextAction: "会話内容を確認する",
      automatedOutcome: "ended",
      completionReason: "visitor_ended",
      voiceResponseStatus: "text_fallback",
    };
    session.automatedOutcome = "ended";
    session.status = "completed";
    session.endedAt = this.timestamp();
    this.repository.save(session);
    this.emit(sessionId, "summary.generated", { summary: session.summary });
    this.emit(sessionId, "visit.ended", { outcome: "ended" });
    this.notificationPort.notify(sessionId, session.summary);
    this.emit(sessionId, "notification.requested", { summary: session.summary });
    return session;
  }

  failSession(sessionId: string, reason: string): VisitSession {
    const session = this.requireSession(sessionId);
    session.status = "failed";
    session.failureReason = reason;
    session.endedAt = this.timestamp();
    session.automatedOutcome = "failed";
    session.classification ??= {
      category: "unknown",
      risk: "unknown",
      confidence: 0,
      reason: "応答処理に失敗しました",
      visitorName: "来訪者",
      purpose: "用件不明",
    };
    session.summary = {
      ...session.classification,
      requestedAction: "取得できませんでした",
      aiResponse: "申し訳ありません。現在対応できません。改めてお越しください。",
      nextAction: "失敗理由を確認する",
      automatedOutcome: "failed",
      completionReason: "llm_failure",
      voiceResponseStatus: "text_fallback",
    };
    this.repository.save(session);
    this.emit(sessionId, "summary.generated", { summary: session.summary });
    this.emit(sessionId, "visit.failed", { reason });
    this.emit(sessionId, "visit.ended", { outcome: "failed" });
    this.notificationPort.notify(sessionId, session.summary);
    this.emit(sessionId, "notification.requested", { summary: session.summary });
    return session;
  }

  getSession(sessionId: string): VisitSession | undefined {
    return this.repository.findById(sessionId);
  }

  listSessions(): VisitSession[] {
    return this.repository.list();
  }

  listEvents(sessionId?: string): VisitEvent[] {
    return this.eventBus.list(sessionId);
  }

  private requireSession(sessionId: string): VisitSession {
    const session = this.repository.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found`);
    }
    return session;
  }

  private emit<T extends VisitEventType>(
    sessionId: string,
    type: T,
    payload: VisitEventPayloads[T],
  ): void {
    this.eventBus.publish({
      id: this.idFactory(),
      type,
      sessionId,
      occurredAt: this.timestamp(),
      payload,
    } as VisitEvent<T>);
  }

  private transcript(speaker: Speaker, text: string): TranscriptEntry {
    return {
      id: this.idFactory(),
      speaker,
      text,
      createdAt: this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
