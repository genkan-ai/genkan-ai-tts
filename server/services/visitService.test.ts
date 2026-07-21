// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type {
  ConversationTurnInput,
  ConversationTurnService,
  SpeechRecognitionPort,
  SpeechSynthesisPort,
} from "../../src/application/contracts";
import { MockConversationTurnService } from "../adapters/mockConversationTurnService";
import { SqliteStore } from "../adapters/sqliteStore";
import { AudioArtifactStore } from "./audioArtifactStore";
import { VisitService } from "./visitService";

const silentTts: SpeechSynthesisPort = {
  synthesize: async () => undefined,
  health: async () => false,
};

const createFixture = (
  speechRecognition?: SpeechRecognitionPort,
  conversation: ConversationTurnService = new MockConversationTurnService(),
  speechSynthesis: SpeechSynthesisPort = silentTts,
) => {
  let sequence = 0;
  const store = new SqliteStore(":memory:");
  const service = new VisitService({
    store,
    speechRecognition:
      speechRecognition ??
      ({
        transcribe: async () => ({
          text: "山田運輸です。荷物のお届けです。",
          durationMs: 120,
          provider: "test",
        }),
        health: async () => true,
      } satisfies SpeechRecognitionPort),
    conversation,
    speechSynthesis,
    audioArtifacts: new AudioArtifactStore(),
    retentionDays: 7,
    language: "ja",
    childSafetyMode: true,
    now: () => new Date("2026-07-21T09:00:00.000Z"),
    idFactory: () => `id-${++sequence}`,
  });
  return { service, store };
};

describe("VisitService", () => {
  it("keeps listening after deciding an outcome and completes after inactivity", async () => {
    const { service, store } = createFixture();
    const started = await service.startVisit();
    const first = await service.receiveTurn(started.session.id, { text: "山田です。" });
    const second = await service.receiveTurn(started.session.id, {
      text: "荷物のお届けに来ました。玄関前への置き配を希望します。",
    });

    expect(first.session.status).toBe("in_conversation");
    expect(second.session).toMatchObject({
      status: "in_conversation",
      turnCount: 2,
      pendingOutcome: "notified",
    });
    expect(second.session.pendingSummary?.category).toBe("delivery");
    expect(service.listResidentVisits()).toHaveLength(0);

    const ended = await service.endVisit(started.session.id, "inactivity");
    expect(ended.session).toMatchObject({
      status: "completed",
      automatedOutcome: "notified",
      summary: { category: "delivery", completionReason: "inactivity" },
    });
    expect(
      service
        .listEvents(started.session.id)
        .filter((event) => event.type === "notification.requested"),
    ).toHaveLength(1);
    expect(
      service.listEvents(started.session.id).filter((event) => event.type === "visit.ended"),
    ).toHaveLength(1);
    service.close();
    store.close();
  });

  it("keeps active visits out of the resident feed until completion", async () => {
    const { service, store } = createFixture();
    const started = await service.startVisit();

    expect(service.listResidentVisits()).toHaveLength(0);

    const decided = await service.receiveTurn(started.session.id, {
      text: "山田運輸です。荷物のお届けに来ました。",
    });

    expect(decided.session.status).toBe("in_conversation");
    expect(service.listResidentVisits()).toHaveLength(0);
    await service.endVisit(started.session.id, "inactivity");
    expect(service.listResidentVisits()).toHaveLength(1);
    expect(service.getResidentVisit(started.session.id)?.status).toBe("completed");
    service.close();
    store.close();
  });

  it("persists a selected delivery policy until the conversation goes quiet", async () => {
    const { service, store } = createFixture();
    service.updateResidentSettings("leave_at_door");
    const started = await service.startVisit();
    const decided = await service.receiveTurn(started.session.id, {
      text: "山田運輸です。荷物のお届けに来ました。",
    });

    expect(service.getResidentSettings().deliveryPolicy).toBe("leave_at_door");
    expect(decided.session).toMatchObject({
      status: "in_conversation",
      pendingOutcome: "delivery_instructed",
      pendingSummary: { appliedDeliveryPolicy: "leave_at_door" },
    });
    expect(decided.session.pendingSummary?.aiResponse).toContain("玄関前に置いてください");

    const completed = await service.endVisit(started.session.id, "inactivity");
    expect(completed.session).toMatchObject({
      automatedOutcome: "delivery_instructed",
      summary: { appliedDeliveryPolicy: "leave_at_door", completionReason: "inactivity" },
    });
    service.close();
    store.close();
  });

  it("provides the saved resident profile to the conversation service", async () => {
    const mockConversation = new MockConversationTurnService();
    const respond = vi.fn((input: ConversationTurnInput) => mockConversation.respond(input));
    const conversation: ConversationTurnService = {
      respond,
      health: async () => true,
    };
    const { service, store } = createFixture(undefined, conversation);
    service.updateResidentProfile("横倉", ["横倉 琉伊"]);
    const started = await service.startVisit();

    await service.receiveTurn(started.session.id, {
      text: "横倉さんに会いに来ました。友人の佐藤です。",
    });

    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        residentProfile: expect.objectContaining({
          householdName: "横倉",
          residentNames: ["横倉 琉伊"],
        }),
      }),
    );
    service.close();
    store.close();
  });

  it("creates one summary notification when the visitor ends early", async () => {
    const { service, store } = createFixture();
    const started = await service.startVisit();
    const ended = await service.endVisit(started.session.id);

    expect(ended.session).toMatchObject({
      status: "completed",
      automatedOutcome: "ended",
      summary: { completionReason: "visitor_ended" },
    });
    expect(
      service
        .listEvents(started.session.id)
        .filter((event) => event.type === "notification.requested"),
    ).toHaveLength(1);
    service.close();
    store.close();
  });

  it("lets a tester force-end immediately without generating another response", async () => {
    const synthesize = vi.fn(async () => undefined);
    const { service, store } = createFixture(undefined, undefined, {
      synthesize,
      health: async () => true,
    });
    const started = await service.startVisit();
    const transcriptLength = started.session.transcript.length;
    const synthesisCount = synthesize.mock.calls.length;

    const ended = await service.endVisit(started.session.id, "tester_forced");

    expect(ended.session).toMatchObject({
      status: "completed",
      automatedOutcome: "ended",
      summary: { completionReason: "tester_forced" },
    });
    expect(ended.session.transcript).toHaveLength(transcriptLength);
    expect(synthesize).toHaveBeenCalledTimes(synthesisCount);
    expect(
      service
        .listEvents(started.session.id)
        .filter((event) => event.type === "notification.requested"),
    ).toHaveLength(1);
    service.close();
    store.close();
  });

  it("ends safely and notifies the resident when local STT fails", async () => {
    const { service, store } = createFixture({
      transcribe: async () => {
        throw new Error("whisper offline");
      },
      health: async () => false,
    });
    const started = await service.startVisit();

    const failed = await service.receiveTurn(started.session.id, {
      audio: {
        audio: new Uint8Array([1]),
        fileName: "utterance.wav",
        mimeType: "audio/wav",
      },
    });
    expect(failed.session).toMatchObject({
      status: "failed",
      automatedOutcome: "failed",
      summary: { completionReason: "stt_failure" },
    });
    expect(
      service
        .listEvents(started.session.id)
        .filter((event) => event.type === "notification.requested"),
    ).toHaveLength(1);
    service.close();
    store.close();
  });

  it("ends safely and notifies the resident when the conversation provider fails", async () => {
    const conversation: ConversationTurnService = {
      respond: async () => {
        throw new Error("provider timeout");
      },
      health: async () => false,
    };
    const { service, store } = createFixture(undefined, conversation);
    const started = await service.startVisit();
    const failed = await service.receiveTurn(started.session.id, {
      text: "佐藤です。友人として訪ねました。",
    });

    expect(failed.session).toMatchObject({
      status: "failed",
      automatedOutcome: "failed",
      summary: { completionReason: "llm_failure" },
    });
    expect(
      service
        .listEvents(started.session.id)
        .filter((event) => event.type === "notification.requested"),
    ).toHaveLength(1);
    service.close();
    store.close();
  });

  it("falls back to text and records the result when TTS fails", async () => {
    const failingTts: SpeechSynthesisPort = {
      synthesize: async () => {
        throw new Error("tts offline");
      },
      health: async () => false,
    };
    const { service, store } = createFixture(undefined, undefined, failingTts);
    const started = await service.startVisit();
    const decided = await service.receiveTurn(started.session.id, {
      text: "山田運輸です。荷物のお届けに来ました。",
    });

    expect(decided.audioUrl).toBeUndefined();
    expect(decided.session).toMatchObject({
      status: "in_conversation",
      pendingSummary: { voiceResponseStatus: "text_fallback" },
    });
    const completed = await service.endVisit(started.session.id, "inactivity");
    expect(completed.session).toMatchObject({
      status: "completed",
      summary: { voiceResponseStatus: "text_fallback" },
    });
    expect(completed.session.lastError).toContain("画面をご確認ください");
    service.close();
    store.close();
  });

  it("ends silently after inactivity and preserves the decided outcome", async () => {
    const synthesize = vi.fn(async () => undefined);
    const { service, store } = createFixture(undefined, undefined, {
      synthesize,
      health: async () => true,
    });
    const started = await service.startVisit();
    await service.receiveTurn(started.session.id, {
      text: "山田運輸です。荷物のお届けに来ました。",
    });

    const ended = await service.endVisit(started.session.id, "inactivity");

    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(ended.audioUrl).toBeUndefined();
    expect(ended.session).toMatchObject({
      status: "completed",
      automatedOutcome: "notified",
      summary: { completionReason: "inactivity" },
    });
    service.close();
    store.close();
  });

  it("allows a natural closing reply to finish an already-decided visit", async () => {
    const { service, store } = createFixture();
    const started = await service.startVisit();
    await service.receiveTurn(started.session.id, {
      text: "山田運輸です。荷物のお届けに来ました。",
    });
    const ended = await service.receiveTurn(started.session.id, {
      text: "わかりました。ありがとうございます。",
    });

    expect(ended.session).toMatchObject({
      status: "completed",
      automatedOutcome: "notified",
      summary: { completionReason: "visitor_ended" },
    });
    service.close();
    store.close();
  });

  it("finalizes and notifies an unanswered visit after 90 seconds", async () => {
    vi.useFakeTimers();
    try {
      const { service, store } = createFixture();
      const started = await service.startVisit();

      await vi.advanceTimersByTimeAsync(90_000);

      expect(service.getVisit(started.session.id)).toMatchObject({
        status: "completed",
        automatedOutcome: "ended",
        summary: { completionReason: "timeout" },
      });
      expect(
        service
          .listEvents(started.session.id)
          .filter((event) => event.type === "notification.requested"),
      ).toHaveLength(1);
      service.close();
      store.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
