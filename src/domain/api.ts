import type { VisitEvent } from "./events";
import type {
  DeliveryPolicy,
  ResidentAutomationSettings,
  ResidentProfile,
  VisitEndReason,
  VisitSession,
} from "./visit";

export interface VisitMutationResponse {
  session: VisitSession;
  audioUrl?: string;
  recognizedText?: string;
}

export interface VisitListResponse {
  visits: VisitSession[];
}

export interface VisitDetailResponse {
  session: VisitSession;
  events: VisitEvent[];
}

export interface TextTurnRequest {
  text: string;
}

export interface EndVisitRequest {
  reason: VisitEndReason;
}

export interface ResidentSettingsResponse {
  settings: ResidentAutomationSettings;
}

export interface UpdateResidentSettingsRequest {
  deliveryPolicy: DeliveryPolicy;
}

export interface ResidentProfileResponse {
  profile: ResidentProfile;
}

export interface UpdateResidentProfileRequest {
  householdName: string;
  residentNames: string[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    app: boolean;
    database: boolean;
    whisper: boolean;
    conversation: boolean;
    speechSynthesis: boolean;
  };
}

export interface ApiErrorResponse {
  error: string;
  code: string;
}
