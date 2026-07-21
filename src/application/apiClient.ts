import type {
  ApiErrorResponse,
  HealthResponse,
  ResidentProfileResponse,
  ResidentSettingsResponse,
  VisitDetailResponse,
  VisitListResponse,
  VisitMutationResponse,
} from "../domain/api";
import type { DeliveryPolicy, ResidentProfile, VisitEndReason } from "../domain/visit";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    let payload: ApiErrorResponse | undefined;
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      payload = undefined;
    }
    throw new ApiClientError(
      payload?.error ?? `Request failed with HTTP ${response.status}`,
      payload?.code ?? "REQUEST_FAILED",
      response.status,
    );
  }
  return (await response.json()) as T;
};

export const visitApi = {
  start: (): Promise<VisitMutationResponse> => request("/api/visits", { method: "POST" }),

  sendText: (sessionId: string, text: string): Promise<VisitMutationResponse> =>
    request(`/api/visits/${encodeURIComponent(sessionId)}/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),

  sendAudio: (sessionId: string, audio: Blob): Promise<VisitMutationResponse> => {
    const body = new FormData();
    body.append("file", audio, audio.type.includes("webm") ? "utterance.webm" : "utterance.wav");
    return request(`/api/visits/${encodeURIComponent(sessionId)}/turns`, {
      method: "POST",
      body,
    });
  },

  end: (
    sessionId: string,
    reason: VisitEndReason = "visitor_ended",
  ): Promise<VisitMutationResponse> =>
    request(`/api/visits/${encodeURIComponent(sessionId)}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),

  list: (): Promise<VisitListResponse> => request("/api/visits"),

  detail: (sessionId: string): Promise<VisitDetailResponse> =>
    request(`/api/visits/${encodeURIComponent(sessionId)}`),

  health: (): Promise<HealthResponse> => request("/api/health"),
};

export const residentApi = {
  list: (): Promise<VisitListResponse> => request("/api/resident/visits"),

  detail: (sessionId: string): Promise<VisitDetailResponse> =>
    request(`/api/resident/visits/${encodeURIComponent(sessionId)}`),

  settings: (): Promise<ResidentSettingsResponse> => request("/api/resident/settings"),

  updateSettings: (deliveryPolicy: DeliveryPolicy): Promise<ResidentSettingsResponse> =>
    request("/api/resident/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryPolicy }),
    }),

  profile: (): Promise<ResidentProfileResponse> => request("/api/resident/profile"),

  updateProfile: (
    profile: Pick<ResidentProfile, "householdName" | "residentNames">,
  ): Promise<ResidentProfileResponse> =>
    request("/api/resident/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }),
};
