import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, visitApi } from "../application/apiClient";
import type { VisitMutationResponse } from "../domain/api";
import type { VisitEvent } from "../domain/events";
import type { VisitEndReason, VisitSession } from "../domain/visit";

const visitorSessionStorageKey = "genkan-ai:visitor-session:v1";

const loadVisitorSessionId = (): string | undefined => {
  try {
    return window.sessionStorage.getItem(visitorSessionStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
};

const saveVisitorSessionId = (sessionId: string): void => {
  try {
    window.sessionStorage.setItem(visitorSessionStorageKey, sessionId);
  } catch {
    // A tab can still continue with the in-memory ref when storage is disabled.
  }
};

export type ServerVoicePhase = "transcribing" | "thinking" | "synthesizing";

interface VisitApiState {
  activeSession?: VisitSession;
  events: VisitEvent[];
  history: VisitSession[];
  loading: boolean;
  error?: string;
  serverVoicePhase?: ServerVoicePhase;
  audioReadyResponseId?: string;
}

const userMessageForError = (error: unknown): string => {
  if (error instanceof ApiClientError && error.code === "STT_UNAVAILABLE") {
    return "音声を認識できませんでした。もう一度話すか、テキストで入力してください。";
  }
  if (error instanceof ApiClientError && error.code === "UNSUPPORTED_AUDIO") {
    return "このブラウザの録音形式には対応していません。テキスト入力を利用してください。";
  }
  return error instanceof Error ? error.message : "localhost APIへ接続できませんでした。";
};

export const useVisitApi = () => {
  const activeSessionId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<VisitApiState>({
    events: [],
    history: [],
    loading: true,
  });

  const applyResult = useCallback((result: VisitMutationResponse) => {
    const latestAi = [...result.session.transcript]
      .reverse()
      .find((entry) => entry.speaker === "ai");
    activeSessionId.current = result.session.id;
    saveVisitorSessionId(result.session.id);
    setState((current) => ({
      ...current,
      activeSession: result.session,
      history: [
        result.session,
        ...current.history.filter((visit) => visit.id !== result.session.id),
      ],
      error: undefined,
      serverVoicePhase: undefined,
      audioReadyResponseId: latestAi?.id,
    }));
    return result;
  }, []);

  const refresh = useCallback(async (preferredSessionId?: string) => {
    try {
      const { visits } = await visitApi.list();
      const targetId = preferredSessionId ?? activeSessionId.current ?? loadVisitorSessionId();
      const active = targetId ? visits.find((visit) => visit.id === targetId) : undefined;
      activeSessionId.current = active?.id;
      if (active) saveVisitorSessionId(active.id);
      const detail = active ? await visitApi.detail(active.id) : undefined;
      setState((current) => ({
        ...current,
        activeSession: detail?.session,
        events: detail?.events ?? [],
        history: visits,
        loading: false,
        error: undefined,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: userMessageForError(error),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribedSessionId = state.activeSession?.id;

  useEffect(() => {
    if (typeof EventSource === "undefined" || !subscribedSessionId) return;
    const events = new EventSource(
      `/api/events?sessionId=${encodeURIComponent(subscribedSessionId)}`,
    );
    events.addEventListener("visit", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as VisitEvent;
      if (event.sessionId !== subscribedSessionId) return;
      if (event.type === "voice.phase_changed") {
        setState((current) => ({ ...current, serverVoicePhase: event.payload.phase }));
      }
      if (event.type === "voice.audio_ready") {
        setState((current) => ({
          ...current,
          serverVoicePhase: undefined,
          audioReadyResponseId: event.payload.responseId,
        }));
      }
      void refresh(event.sessionId);
    });
    events.onerror = () => {
      setState((current) => ({ ...current, error: "ライブ更新を再接続しています。" }));
    };
    return () => events.close();
  }, [refresh, subscribedSessionId]);

  const withError = useCallback(
    async (operation: () => Promise<VisitMutationResponse>) => {
      setState((current) => ({ ...current, error: undefined }));
      try {
        return applyResult(await operation());
      } catch (error) {
        setState((current) => ({ ...current, error: userMessageForError(error) }));
        await refresh(activeSessionId.current);
        throw error;
      }
    },
    [applyResult, refresh],
  );

  const startVisit = useCallback(() => withError(() => visitApi.start()), [withError]);

  const sendVisitorMessage = useCallback(
    (message: string) => {
      const id = activeSessionId.current;
      if (!id) return Promise.resolve(undefined);
      return withError(() => visitApi.sendText(id, message));
    },
    [withError],
  );

  const sendVisitorAudio = useCallback(
    (audio: Blob) => {
      const id = activeSessionId.current;
      if (!id) return Promise.resolve(undefined);
      return withError(() => visitApi.sendAudio(id, audio));
    },
    [withError],
  );

  const endVisit = useCallback(
    (reason: VisitEndReason = "visitor_ended") => {
      const id = activeSessionId.current;
      if (!id) return Promise.resolve(undefined);
      return withError(() => visitApi.end(id, reason));
    },
    [withError],
  );

  return {
    ...state,
    startVisit,
    sendVisitorMessage,
    sendVisitorAudio,
    endVisit,
    refresh,
  };
};
