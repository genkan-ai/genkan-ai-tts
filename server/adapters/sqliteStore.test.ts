// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { VisitEvent } from "../../src/domain/events";
import type { VisitSession } from "../../src/domain/visit";
import { SqliteStore } from "./sqliteStore";

describe("SqliteStore compatibility", () => {
  it("normalizes legacy resident-approval sessions and events on read", () => {
    const store = new SqliteStore(":memory:");
    const legacySession = {
      id: "legacy-visit",
      startedAt: "2026-07-20T00:00:00.000Z",
      status: "awaiting_resident",
      residentDecision: "decline",
      transcript: [],
    } as unknown as VisitSession;
    const legacyEvent = {
      id: "legacy-event",
      sessionId: "legacy-visit",
      type: "resident.decision_recorded",
      occurredAt: "2026-07-20T00:01:00.000Z",
      payload: { decision: "decline" },
    } as unknown as VisitEvent;

    store.saveVisit(legacySession, 7);
    store.saveEvent(legacyEvent);

    expect(store.findVisit("legacy-visit")).toMatchObject({
      status: "completed",
      automatedOutcome: "declined",
    });
    expect(store.findVisit("legacy-visit")).not.toHaveProperty("residentDecision");
    expect(store.listEvents("legacy-visit")).toEqual([]);
    store.close();
  });

  it("returns safe resident settings by default and persists updates", () => {
    const store = new SqliteStore(":memory:");

    expect(store.getResidentSettings().deliveryPolicy).toBe("notify_only");
    store.saveResidentSettings({
      deliveryPolicy: "delivery_box",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(store.getResidentSettings()).toMatchObject({ deliveryPolicy: "delivery_box" });
    store.close();
  });

  it("returns an empty resident profile by default and persists structured names", () => {
    const store = new SqliteStore(":memory:");

    expect(store.getResidentProfile()).toMatchObject({ householdName: "", residentNames: [] });
    store.saveResidentProfile({
      householdName: "横倉",
      residentNames: ["横倉 琉伊", "横倉 花子"],
      updatedAt: "2026-07-22T00:00:00.000Z",
    });

    expect(store.getResidentProfile()).toEqual({
      householdName: "横倉",
      residentNames: ["横倉 琉伊", "横倉 花子"],
      updatedAt: "2026-07-22T00:00:00.000Z",
    });
    store.close();
  });
});
