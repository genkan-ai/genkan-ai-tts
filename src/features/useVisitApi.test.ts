import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitSession } from "../domain/visit";
import { useVisitApi } from "./useVisitApi";

const otherSession: VisitSession = {
  id: "other-visit",
  startedAt: "2026-07-21T00:00:00.000Z",
  status: "in_conversation",
  transcript: [],
};

const ownedSession: VisitSession = {
  id: "owned-visit",
  startedAt: "2026-07-21T00:01:00.000Z",
  status: "in_conversation",
  transcript: [
    {
      id: "owned-ai-1",
      speaker: "ai",
      text: "はい。ご用件をお伺いします。",
      createdAt: "2026-07-21T00:01:00.000Z",
    },
  ],
  pendingAudioUrl: "/api/audio/owned",
};

class EventSourceMock {
  static instances: EventSourceMock[] = [];
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener as (event: MessageEvent<string>) => void);
  }

  emit(type: string, payload: unknown): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(payload) }));
  }

  close(): void {}
}

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("useVisitApi session-scoped updates", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    EventSourceMock.instances = [];
    vi.stubGlobal("EventSource", EventSourceMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not attach a blank tab to another visit and scopes SSE to its own visit", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/visits" && init?.method === "POST") {
        return jsonResponse({ session: ownedSession, audioUrl: ownedSession.pendingAudioUrl });
      }
      if (url === "/api/visits") return jsonResponse({ visits: [otherSession] });
      if (url === "/api/visits/owned-visit") {
        return jsonResponse({ session: ownedSession, events: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useVisitApi());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeSession).toBeUndefined();
    expect(EventSourceMock.instances).toHaveLength(0);

    await act(async () => {
      await result.current.startVisit();
    });
    await waitFor(() => expect(EventSourceMock.instances).toHaveLength(1));

    const events = EventSourceMock.instances[0];
    expect(events?.url).toBe("/api/events?sessionId=owned-visit");

    act(() => {
      events?.emit("visit", {
        id: "event-other",
        sessionId: "other-visit",
        type: "voice.phase_changed",
        occurredAt: "2026-07-21T00:01:01.000Z",
        payload: { phase: "thinking" },
      });
    });
    expect(result.current.serverVoicePhase).toBeUndefined();

    act(() => {
      events?.emit("visit", {
        id: "event-owned",
        sessionId: "owned-visit",
        type: "voice.phase_changed",
        occurredAt: "2026-07-21T00:01:02.000Z",
        payload: { phase: "thinking" },
      });
    });
    await waitFor(() => expect(result.current.serverVoicePhase).toBe("thinking"));
  });
});
