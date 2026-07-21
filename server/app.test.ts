// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SpeechRecognitionPort, SpeechSynthesisPort } from "../src/application/contracts";
import type { VisitMutationResponse } from "../src/domain/api";
import { MockConversationTurnService } from "./adapters/mockConversationTurnService";
import { SqliteStore } from "./adapters/sqliteStore";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { AudioArtifactStore } from "./services/audioArtifactStore";
import { VisitService } from "./services/visitService";

describe("localhost API", () => {
  it("runs a visit through an automated AI outcome without a decision endpoint", async () => {
    const store = new SqliteStore(":memory:");
    const audioArtifacts = new AudioArtifactStore();
    const speechRecognition: SpeechRecognitionPort = {
      transcribe: async () => ({ text: "", durationMs: 0, provider: "test" }),
      health: async () => true,
    };
    const speechSynthesis: SpeechSynthesisPort = {
      synthesize: async () => undefined,
      health: async () => false,
    };
    const conversation = new MockConversationTurnService();
    const service = new VisitService({
      store,
      speechRecognition,
      conversation,
      speechSynthesis,
      audioArtifacts,
      retentionDays: 7,
      language: "ja",
      childSafetyMode: true,
    });
    const app = await createApp({
      config: loadConfig({ DATABASE_PATH: ":memory:" }),
      visitService: service,
      store,
      audioArtifacts,
      providerHealth: {
        whisper: () => speechRecognition.health(),
        conversation: () => conversation.health(),
        speechSynthesis: () => speechSynthesis.health(),
      },
    });

    const startResponse = await app.inject({ method: "POST", url: "/api/visits" });
    const started = startResponse.json<VisitMutationResponse>();
    const residentBefore = await app.inject({ method: "GET", url: "/api/resident/visits" });
    const settingsResponse = await app.inject({
      method: "PUT",
      url: "/api/resident/settings",
      payload: { deliveryPolicy: "delivery_box" },
    });
    const invalidSettingsResponse = await app.inject({
      method: "PUT",
      url: "/api/resident/settings",
      payload: { deliveryPolicy: "custom_free_text" },
    });
    const profileBefore = await app.inject({ method: "GET", url: "/api/resident/profile" });
    const profileResponse = await app.inject({
      method: "PUT",
      url: "/api/resident/profile",
      payload: {
        householdName: " 横倉 ",
        residentNames: ["横倉 琉伊", "横倉 琉伊", " 横倉 花子 "],
      },
    });
    const invalidProfileResponse = await app.inject({
      method: "PUT",
      url: "/api/resident/profile",
      payload: { householdName: "横倉\n家", residentNames: [] },
    });
    const turnResponse = await app.inject({
      method: "POST",
      url: `/api/visits/${started.session.id}/turns`,
      payload: { text: "山田運輸です。荷物のお届けに来ました。" },
    });
    const turn = turnResponse.json<VisitMutationResponse>();
    const removedDecisionResponse = await app.inject({
      method: "POST",
      url: `/api/visits/${started.session.id}/decisions`,
      payload: { decision: "decline" },
    });

    expect(startResponse.statusCode).toBe(201);
    expect(residentBefore.json()).toEqual({ visits: [] });
    expect(settingsResponse.json()).toMatchObject({
      settings: { deliveryPolicy: "delivery_box" },
    });
    expect(invalidSettingsResponse.statusCode).toBe(400);
    expect(profileBefore.json()).toMatchObject({
      profile: { householdName: "", residentNames: [] },
    });
    expect(profileResponse.json()).toMatchObject({
      profile: {
        householdName: "横倉",
        residentNames: ["横倉 琉伊", "横倉 花子"],
      },
    });
    expect(invalidProfileResponse.statusCode).toBe(400);
    expect(turn.session).toMatchObject({
      status: "in_conversation",
      pendingOutcome: "delivery_instructed",
      pendingSummary: { appliedDeliveryPolicy: "delivery_box" },
    });
    const residentWhileListening = await app.inject({ method: "GET", url: "/api/resident/visits" });
    expect(residentWhileListening.json<{ visits: unknown[] }>().visits).toHaveLength(0);
    const invalidEndResponse = await app.inject({
      method: "POST",
      url: `/api/visits/${started.session.id}/end`,
      payload: { reason: "fixed_template_reached" },
    });
    expect(invalidEndResponse.statusCode).toBe(400);
    const endResponse = await app.inject({
      method: "POST",
      url: `/api/visits/${started.session.id}/end`,
      payload: { reason: "inactivity" },
    });
    expect(endResponse.json<VisitMutationResponse>().session).toMatchObject({
      status: "completed",
      automatedOutcome: "delivery_instructed",
      summary: { appliedDeliveryPolicy: "delivery_box", completionReason: "inactivity" },
    });
    const residentAfter = await app.inject({ method: "GET", url: "/api/resident/visits" });
    expect(residentAfter.json<{ visits: unknown[] }>().visits).toHaveLength(1);
    expect(removedDecisionResponse.statusCode).toBe(404);
    await app.close();
  });

  it("accepts the tester force-end reason", async () => {
    const store = new SqliteStore(":memory:");
    const audioArtifacts = new AudioArtifactStore();
    const speechRecognition: SpeechRecognitionPort = {
      transcribe: async () => ({ text: "", durationMs: 0, provider: "test" }),
      health: async () => true,
    };
    const speechSynthesis: SpeechSynthesisPort = {
      synthesize: async () => undefined,
      health: async () => true,
    };
    const conversation = new MockConversationTurnService();
    const service = new VisitService({
      store,
      speechRecognition,
      conversation,
      speechSynthesis,
      audioArtifacts,
      retentionDays: 7,
      language: "ja",
      childSafetyMode: true,
    });
    const app = await createApp({
      config: loadConfig({ DATABASE_PATH: ":memory:" }),
      visitService: service,
      store,
      audioArtifacts,
      providerHealth: {
        whisper: () => speechRecognition.health(),
        conversation: () => conversation.health(),
        speechSynthesis: () => speechSynthesis.health(),
      },
    });
    const started = (
      await app.inject({ method: "POST", url: "/api/visits" })
    ).json<VisitMutationResponse>();

    const ended = await app.inject({
      method: "POST",
      url: `/api/visits/${started.session.id}/end`,
      payload: { reason: "tester_forced" },
    });

    expect(ended.statusCode).toBe(200);
    expect(ended.json<VisitMutationResponse>().session).toMatchObject({
      status: "completed",
      summary: { completionReason: "tester_forced" },
    });
    await app.close();
  });
});
