import { useCallback, useEffect, useRef, useState } from "react";
import { residentApi } from "../application/apiClient";
import type { VisitEvent } from "../domain/events";
import type {
  DeliveryPolicy,
  ResidentAutomationSettings,
  ResidentProfile,
  SpeechVoice,
  VisitSession,
} from "../domain/visit";

interface ResidentApiState {
  session?: VisitSession;
  history: VisitSession[];
  events: VisitEvent[];
  settings: ResidentAutomationSettings;
  profile: ResidentProfile;
  loading: boolean;
  savingSettings: boolean;
  savingProfile: boolean;
  error?: string;
}

const initialSettings: ResidentAutomationSettings = {
  deliveryPolicy: "notify_only",
  speechVoice: "female",
  updatedAt: new Date(0).toISOString(),
};

const initialProfile: ResidentProfile = {
  householdName: "",
  residentNames: [],
  updatedAt: new Date(0).toISOString(),
};

export const useResidentApi = () => {
  const selectedSessionId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<ResidentApiState>({
    history: [],
    events: [],
    settings: initialSettings,
    profile: initialProfile,
    loading: true,
    savingSettings: false,
    savingProfile: false,
  });

  const refresh = useCallback(async (preferredSessionId?: string) => {
    try {
      const [{ visits }, { settings }, { profile }] = await Promise.all([
        residentApi.list(),
        residentApi.settings(),
        residentApi.profile(),
      ]);
      const target =
        visits.find((visit) => visit.id === (preferredSessionId ?? selectedSessionId.current)) ??
        visits[0];
      selectedSessionId.current = target?.id;
      const detail = target ? await residentApi.detail(target.id) : undefined;
      setState((current) => ({
        ...current,
        session: detail?.session,
        history: visits,
        events: detail?.events ?? [],
        settings,
        profile,
        loading: false,
        error: undefined,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "居住者画面を更新できませんでした。",
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/resident/events");
    events.addEventListener("notification", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as VisitEvent;
      void refresh(event.sessionId);
    });
    events.onerror = () => {
      setState((current) => ({ ...current, error: "完了通知を再接続しています。" }));
    };
    return () => events.close();
  }, [refresh]);

  const updateDeliveryPolicy = useCallback(async (deliveryPolicy: DeliveryPolicy) => {
    setState((current) => ({ ...current, savingSettings: true, error: undefined }));
    try {
      const { settings } = await residentApi.updateSettings({ deliveryPolicy });
      setState((current) => ({ ...current, settings, savingSettings: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        savingSettings: false,
        error: error instanceof Error ? error.message : "配達設定を保存できませんでした。",
      }));
    }
  }, []);

  const updateSpeechVoice = useCallback(async (speechVoice: SpeechVoice) => {
    setState((current) => ({ ...current, savingSettings: true, error: undefined }));
    try {
      const { settings } = await residentApi.updateSettings({ speechVoice });
      setState((current) => ({ ...current, settings, savingSettings: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        savingSettings: false,
        error: error instanceof Error ? error.message : "応答音声を保存できませんでした。",
      }));
    }
  }, []);

  const updateProfile = useCallback(
    async (profile: Pick<ResidentProfile, "householdName" | "residentNames">) => {
      setState((current) => ({ ...current, savingProfile: true, error: undefined }));
      try {
        const result = await residentApi.updateProfile(profile);
        setState((current) => ({
          ...current,
          profile: result.profile,
          savingProfile: false,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          savingProfile: false,
          error:
            error instanceof Error ? error.message : "居住者プロフィールを保存できませんでした。",
        }));
      }
    },
    [],
  );

  return { ...state, refresh, updateDeliveryPolicy, updateSpeechVoice, updateProfile };
};
