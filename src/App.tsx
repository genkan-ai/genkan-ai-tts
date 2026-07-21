import { BellRing, DoorOpen, Home, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { createDemoRuntime } from "./application/createDemoRuntime";
import { BrandMark } from "./components/BrandMark";
import type { VisitMutationResponse } from "./domain/api";
import type { VisitEvent } from "./domain/events";
import type {
  DeliveryPolicy,
  ResidentAutomationSettings,
  ResidentProfile,
  VisitEndReason,
  VisitSession,
} from "./domain/visit";
import { ResidentDashboard } from "./features/ResidentDashboard";
import { useResidentApi } from "./features/useResidentApi";
import { type ServerVoicePhase, useVisitApi } from "./features/useVisitApi";
import { useVisitDemo } from "./features/useVisitDemo";
import { VisitorIntercom } from "./features/VisitorIntercom";

type AppView = "resident" | "visitor";
type Mutation = undefined | Promise<VisitMutationResponse | undefined>;

interface AppController {
  activeSession?: VisitSession;
  history: VisitSession[];
  events: VisitEvent[];
  startVisit: () => Mutation;
  sendVisitorMessage: (message: string) => Mutation;
  sendVisitorAudio?: (audio: Blob) => Promise<VisitMutationResponse | undefined>;
  endVisit: (reason?: VisitEndReason) => Mutation;
  error?: string;
  serverVoicePhase?: ServerVoicePhase;
  audioReadyResponseId?: string;
}

interface ResidentController {
  session?: VisitSession;
  history: VisitSession[];
  events: VisitEvent[];
  settings: ResidentAutomationSettings;
  profile: ResidentProfile;
  savingSettings: boolean;
  updateDeliveryPolicy: (policy: DeliveryPolicy) => void | Promise<void>;
  savingProfile: boolean;
  updateProfile: (
    profile: Pick<ResidentProfile, "householdName" | "residentNames">,
  ) => void | Promise<void>;
  error?: string;
}

const initialView = (): AppView => {
  if (typeof window === "undefined") return "resident";
  return new URLSearchParams(window.location.search).get("view") === "visitor"
    ? "visitor"
    : "resident";
};

const AppShell = ({
  controller,
  residentController,
  voiceEnabled,
}: {
  controller: AppController;
  residentController: ResidentController;
  voiceEnabled: boolean;
}) => {
  const [view, setViewState] = useState<AppView>(initialView);

  const setView = (next: AppView) => {
    setViewState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url);
    }
  };

  return (
    <div className={`app-shell app-shell--${view}`}>
      <aside className="app-sidebar">
        <div className="app-brand">
          <BrandMark />
          <div>
            <strong>GenkanAI</strong>
            <span>玄関AI</span>
          </div>
        </div>
        <nav aria-label="メインナビゲーション">
          <button
            className={view === "resident" ? "is-active" : undefined}
            type="button"
            onClick={() => setView("resident")}
          >
            <Home size={20} aria-hidden="true" />
            居住者画面
          </button>
          <button
            className={view === "visitor" ? "is-active" : undefined}
            type="button"
            onClick={() => setView("visitor")}
          >
            <BellRing size={20} aria-hidden="true" />
            来訪者テスト
          </button>
        </nav>
        <div className="sidebar-safety">
          <ShieldCheck size={21} aria-hidden="true" />
          <div>
            <strong>安全モード</strong>
            <span>有効</span>
          </div>
        </div>
      </aside>

      <div className="mobile-app-bar">
        <div className="app-brand">
          <BrandMark />
          <strong>玄関AI</strong>
        </div>
        <nav className="mobile-view-switch" aria-label="画面切り替え">
          <button
            className={view === "resident" ? "is-active" : undefined}
            type="button"
            onClick={() => setView("resident")}
          >
            居住者
          </button>
          <button
            className={view === "visitor" ? "is-active" : undefined}
            type="button"
            onClick={() => setView("visitor")}
          >
            来訪者
          </button>
        </nav>
      </div>

      <div className="app-content">
        {view === "resident" ? (
          <ResidentDashboard
            session={residentController.session}
            history={residentController.history}
            events={residentController.events}
            settings={residentController.settings}
            settingsSaving={residentController.savingSettings}
            onDeliveryPolicyChange={residentController.updateDeliveryPolicy}
            profile={residentController.profile}
            profileSaving={residentController.savingProfile}
            onProfileSave={residentController.updateProfile}
            onOpenVisitor={() => setView("visitor")}
            error={residentController.error}
          />
        ) : (
          <VisitorIntercom
            session={controller.activeSession}
            onStart={controller.startVisit}
            onSend={controller.sendVisitorMessage}
            onSendAudio={controller.sendVisitorAudio}
            onEnd={controller.endVisit}
            voiceEnabled={voiceEnabled}
            processingPhase={controller.serverVoicePhase}
            audioReadyResponseId={controller.audioReadyResponseId}
            apiError={controller.error}
          />
        )}
      </div>

      <a
        className="health-link"
        href={voiceEnabled ? "/api/health" : "/health.json"}
        aria-label="ヘルスチェック"
      >
        <DoorOpen size={15} aria-hidden="true" />
        {voiceEnabled ? "local" : "mock"}
      </a>
    </div>
  );
};

const DemoApp = () => {
  const runtime = useMemo(() => createDemoRuntime(), []);
  const demo = useVisitDemo(runtime);
  const [settings, setSettings] = useState<ResidentAutomationSettings>({
    deliveryPolicy: "notify_only",
    updatedAt: new Date(0).toISOString(),
  });
  const [profile, setProfile] = useState<ResidentProfile>({
    householdName: "",
    residentNames: [],
    updatedAt: new Date(0).toISOString(),
  });
  const controller: AppController = {
    ...demo,
    startVisit: () => {
      demo.startVisit();
      return undefined;
    },
    sendVisitorMessage: (message) => {
      demo.sendVisitorMessage(message);
      return undefined;
    },
    endVisit: () => {
      demo.endVisit();
      return undefined;
    },
  };
  const completedHistory = demo.history.filter(
    (visit) => visit.status === "completed" || visit.status === "failed",
  );
  const residentController: ResidentController = {
    session:
      demo.activeSession?.status === "completed" || demo.activeSession?.status === "failed"
        ? demo.activeSession
        : completedHistory[0],
    history: completedHistory,
    events:
      demo.activeSession?.status === "completed" || demo.activeSession?.status === "failed"
        ? demo.events
        : [],
    settings,
    profile,
    savingSettings: false,
    savingProfile: false,
    updateDeliveryPolicy: (deliveryPolicy) =>
      setSettings({ deliveryPolicy, updatedAt: new Date().toISOString() }),
    updateProfile: (nextProfile) =>
      setProfile({ ...nextProfile, updatedAt: new Date().toISOString() }),
  };
  return (
    <AppShell
      controller={controller}
      residentController={residentController}
      voiceEnabled={false}
    />
  );
};

const ApiApp = () => {
  const api = useVisitApi();
  const resident = useResidentApi();
  return <AppShell controller={api} residentController={resident} voiceEnabled />;
};

export const App = () => (import.meta.env.MODE === "test" ? <DemoApp /> : <ApiApp />);
