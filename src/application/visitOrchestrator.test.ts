import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../adapters/inMemoryEventBus";
import { InMemoryNotificationPort } from "../adapters/inMemoryNotificationPort";
import { InMemoryVisitRepository } from "../adapters/inMemoryVisitRepository";
import { MockConversationService } from "../adapters/mockConversationService";
import { VisitOrchestrator } from "./visitOrchestrator";

const createFixture = () => {
  let sequence = 0;
  const eventBus = new InMemoryEventBus();
  const notificationPort = new InMemoryNotificationPort();
  const repository = new InMemoryVisitRepository();
  const orchestrator = new VisitOrchestrator({
    conversationService: new MockConversationService(),
    eventBus,
    notificationPort,
    repository,
    idFactory: () => `id-${++sequence}`,
    now: () => new Date("2026-07-20T08:00:00.000Z"),
  });

  return { eventBus, notificationPort, orchestrator, repository };
};

describe("VisitOrchestrator", () => {
  it("publishes the common event sequence through an automated AI outcome", () => {
    const { eventBus, orchestrator } = createFixture();
    const started = orchestrator.startVisit();

    const completed = orchestrator.receiveVisitorUtterance(
      started.id,
      "山田運輸です。荷物のお届けに来ました。",
    );

    expect(completed).toMatchObject({ status: "completed", automatedOutcome: "notified" });
    expect(eventBus.list(started.id).map((event) => event.type)).toEqual([
      "visit.started",
      "dialogue.started",
      "response.generated",
      "utterance.received",
      "purpose.classified",
      "response.generated",
      "summary.generated",
      "visit.ended",
      "notification.requested",
    ]);
  });

  it("sends only one resident notification per session", () => {
    const { notificationPort, orchestrator } = createFixture();
    const started = orchestrator.startVisit();

    orchestrator.receiveVisitorUtterance(started.id, "宅配便です。荷物を届けに来ました。");

    expect(notificationPort.list()).toHaveLength(1);
    expect(notificationPort.list()[0]?.sessionId).toBe(started.id);
  });

  it("rejects utterances after the AI completes the session", () => {
    const { orchestrator } = createFixture();
    const started = orchestrator.startVisit();
    orchestrator.receiveVisitorUtterance(started.id, "荷物のお届けです。");

    expect(() => orchestrator.receiveVisitorUtterance(started.id, "もう一件あります。")).toThrow(
      "does not accept visitor utterances",
    );
  });

  it("does not leave a failed session active", () => {
    const { orchestrator } = createFixture();
    const started = orchestrator.startVisit();
    const failed = orchestrator.failSession(started.id, "provider timeout");

    expect(failed).toMatchObject({ status: "failed", failureReason: "provider timeout" });
    expect(orchestrator.listEvents(started.id).at(-1)?.type).toBe("notification.requested");
    expect(orchestrator.listEvents(started.id).map((event) => event.type)).toContain(
      "visit.failed",
    );
  });
});
