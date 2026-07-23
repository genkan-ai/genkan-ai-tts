import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  PackageCheck,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  Users,
  Volume2,
} from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { StatusDot } from "../components/StatusDot";
import type { VisitEvent } from "../domain/events";
import {
  type AutomatedOutcome,
  categoryLabels,
  type DeliveryPolicy,
  RESIDENT_PROFILE_MAX_RESIDENTS,
  type ResidentAutomationSettings,
  type ResidentProfile,
  riskLabels,
  type SpeechVoice,
  type VisitSession,
} from "../domain/visit";
import { EventTimeline } from "./EventTimeline";
import { Transcript } from "./Transcript";

interface ResidentDashboardProps {
  session?: VisitSession;
  history: VisitSession[];
  events: VisitEvent[];
  onOpenVisitor: () => void;
  settings: ResidentAutomationSettings;
  settingsSaving: boolean;
  onDeliveryPolicyChange: (policy: DeliveryPolicy) => void | Promise<void>;
  onSpeechVoiceChange: (voice: SpeechVoice) => void | Promise<void>;
  profile: ResidentProfile;
  profileSaving: boolean;
  onProfileSave: (
    profile: Pick<ResidentProfile, "householdName" | "residentNames">,
  ) => void | Promise<void>;
  error?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const automatedOutcomeLabels: Record<AutomatedOutcome, string> = {
  delivery_instructed: "配達方法をご案内",
  notified: "居住者へ通知済み",
  return_requested: "再訪をご案内",
  declined: "AIがお断り",
  emergency_guidance: "緊急窓口をご案内",
  ended: "AIが会話を終了",
  failed: "対応中にエラー",
};

const deliveryPolicyLabels: Record<DeliveryPolicy, string> = {
  notify_only: "用件の通知のみ",
  leave_at_door: "玄関前への置き配",
  delivery_box: "宅配ボックス",
  request_redelivery: "再配達を依頼",
};

const speechVoiceLabels: Record<SpeechVoice, string> = {
  female: "女性（落ち着いた声）",
  male: "男性（明瞭で通る声）",
};

export const ResidentDashboard = ({
  session,
  history,
  events,
  onOpenVisitor,
  settings,
  settingsSaving,
  onDeliveryPolicyChange,
  onSpeechVoiceChange,
  profile,
  profileSaving,
  onProfileSave,
  error,
}: ResidentDashboardProps) => {
  const classification = session?.classification;
  const summary = session?.summary;

  if (!session) {
    return (
      <main className="resident-main">
        <header className="page-heading">
          <div>
            <h1>玄関</h1>
            <p>来訪者との会話と安全な対応を確認します。</p>
          </div>
        </header>
        <section className="resident-empty">
          <BellRing size={42} strokeWidth={1.6} aria-hidden="true" />
          <h2>現在、来訪はありません</h2>
          <p>開発用シミュレーターから呼び出しを始めると、ここに用件と判断結果が表示されます。</p>
          <button className="button button--primary" type="button" onClick={onOpenVisitor}>
            来訪者シミュレーターを開く
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>
        <DeliverySettings
          settings={settings}
          saving={settingsSaving}
          onChange={onDeliveryPolicyChange}
          onVoiceChange={onSpeechVoiceChange}
        />
        <ResidentProfileSettings
          key={profile.updatedAt}
          profile={profile}
          saving={profileSaving}
          onSave={onProfileSave}
        />
        {error ? <p className="resident-error">{error}</p> : null}
        <RecentVisits history={history} />
      </main>
    );
  }

  return (
    <main className="resident-main">
      <header className="page-heading">
        <div>
          <h1>玄関</h1>
          <p>来訪者との会話と安全な対応を確認します。</p>
        </div>
        <span className="page-heading__state">
          <StatusDot tone="safe" />
          対応完了
        </span>
      </header>

      <section className="active-visit" aria-labelledby="active-visit-title">
        <div className="active-visit__content">
          <div className="visitor-identity">
            <span className="visitor-avatar" aria-hidden="true">
              {classification?.visitorName.slice(0, 1) ?? "来"}
            </span>
            <div>
              <span className="section-label">来訪者</span>
              <h2 id="active-visit-title">{classification?.visitorName ?? "確認中"}</h2>
              <p>{classification?.purpose ?? "AIがご用件を伺っています"}</p>
            </div>
          </div>

          <div className="visit-facts">
            <div>
              <span className="section-label">来訪者の種別</span>
              <strong>{classification ? categoryLabels[classification.category] : "確認中"}</strong>
            </div>
            <div>
              <span className="section-label">AI判定の根拠</span>
              <strong>{classification?.reason ?? "会話内容を待っています"}</strong>
            </div>
            <div>
              <span className="section-label">リスク評価</span>
              <strong className={`risk-text risk-text--${classification?.risk ?? "unknown"}`}>
                {classification ? riskLabels[classification.risk] : "未判定"}
              </strong>
            </div>
          </div>

          <details className="resident-details">
            <summary>会話全文と処理履歴を確認</summary>
            <div className="transcript-panel">
              <div className="transcript-panel__heading">
                <div>
                  <span className="section-label">会話の内容</span>
                  <h3>文字起こし</h3>
                </div>
                <span>
                  <StatusDot tone="safe" />
                  終了
                </span>
              </div>
              <Transcript entries={session.transcript} />
            </div>
            <EventTimeline events={events} />
          </details>
        </div>

        <aside className="resident-actions" aria-label="AI自動応答">
          <div className="resident-actions__complete">
            {session.status === "completed" ? (
              <CheckCircle2 size={40} aria-hidden="true" />
            ) : (
              <ShieldQuestion size={40} aria-hidden="true" />
            )}
            <span className="section-label">AIによる自動応答</span>
            <h3>
              {session.status === "completed" ? "AIが対応しました" : "対応を完了できませんでした"}
            </h3>
            <p>{summary?.aiResponse ?? "対応結果を確認してください。"}</p>
            {session.automatedOutcome ? (
              <strong className="automated-outcome">
                {automatedOutcomeLabels[session.automatedOutcome]}
              </strong>
            ) : null}
            <dl className="resident-result-details">
              <div>
                <dt>要約</dt>
                <dd>
                  {summary
                    ? `${summary.visitorName}：${summary.purpose}`
                    : "取得できた内容を確認してください。"}
                </dd>
              </div>
              <div>
                <dt>適用した配達方針</dt>
                <dd>
                  {summary?.appliedDeliveryPolicy
                    ? deliveryPolicyLabels[summary.appliedDeliveryPolicy]
                    : "適用なし"}
                </dd>
              </div>
              <div>
                <dt>次の行動</dt>
                <dd>{summary?.nextAction ?? "必要に応じて会話内容を確認してください。"}</dd>
              </div>
            </dl>
          </div>

          <div className="safety-note">
            <ShieldCheck size={21} aria-hidden="true" />
            <div>
              <strong>安全なご利用のために</strong>
              <p>在宅状況、家族構成、認証情報は来訪者へ伝えません。</p>
            </div>
          </div>
        </aside>
      </section>

      <DeliverySettings
        settings={settings}
        saving={settingsSaving}
        onChange={onDeliveryPolicyChange}
        onVoiceChange={onSpeechVoiceChange}
      />
      <ResidentProfileSettings
        key={profile.updatedAt}
        profile={profile}
        saving={profileSaving}
        onSave={onProfileSave}
      />
      {error ? <p className="resident-error">{error}</p> : null}

      <RecentVisits history={history} />
    </main>
  );
};

const RecentVisits = ({ history }: { history: VisitSession[] }) => (
  <section className="recent-visits" aria-labelledby="recent-visits-title">
    <div className="recent-visits__heading">
      <h2 id="recent-visits-title">最近の来訪</h2>
      <span>{history.length}件</span>
    </div>
    {history.length === 0 ? (
      <p className="recent-visits__empty">対応履歴はまだありません。</p>
    ) : (
      <ul>
        {history.map((visit) => (
          <li key={visit.id}>
            <span
              className={`recent-visits__icon recent-visits__icon--${visit.classification?.risk ?? "unknown"}`}
            >
              {visit.classification?.category === "delivery" ? (
                <PackageCheck size={18} aria-hidden="true" />
              ) : (
                <ShieldCheck size={18} aria-hidden="true" />
              )}
            </span>
            <div className="recent-visits__who">
              <strong>{visit.classification?.visitorName ?? "用件確認中"}</strong>
              <span>{visit.classification?.purpose ?? "会話中"}</span>
            </div>
            <time dateTime={visit.startedAt}>
              {dateTimeFormatter.format(new Date(visit.startedAt))}
            </time>
            <span className="recent-visits__result">
              {visit.automatedOutcome
                ? automatedOutcomeLabels[visit.automatedOutcome]
                : visit.status === "completed"
                  ? "自動応答済み"
                  : "対応エラー"}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const DeliverySettings = ({
  settings,
  saving,
  onChange,
  onVoiceChange,
}: {
  settings: ResidentAutomationSettings;
  saving: boolean;
  onChange: (policy: DeliveryPolicy) => void | Promise<void>;
  onVoiceChange: (voice: SpeechVoice) => void | Promise<void>;
}) => (
  <section className="delivery-settings" aria-labelledby="delivery-settings-title">
    <div>
      <Settings2 size={22} aria-hidden="true" />
      <div>
        <h2 id="delivery-settings-title">自動応答設定</h2>
        <p>配達方針と、インターホンから再生する応答音声を選べます。</p>
      </div>
    </div>
    <label>
      <span>配達方針</span>
      <select
        value={settings.deliveryPolicy}
        disabled={saving}
        onChange={(event) => void onChange(event.target.value as DeliveryPolicy)}
      >
        {Object.entries(deliveryPolicyLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
    <label>
      <span>
        <Volume2 size={14} aria-hidden="true" />
        応答音声
      </span>
      <select
        aria-label="応答音声"
        value={settings.speechVoice ?? "female"}
        disabled={saving}
        onChange={(event) => void onVoiceChange(event.target.value as SpeechVoice)}
      >
        {Object.entries(speechVoiceLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
    <span className="delivery-settings__state">{saving ? "保存中…" : "保存済み"}</span>
  </section>
);

const ResidentProfileSettings = ({
  profile,
  saving,
  onSave,
}: {
  profile: ResidentProfile;
  saving: boolean;
  onSave: (
    profile: Pick<ResidentProfile, "householdName" | "residentNames">,
  ) => void | Promise<void>;
}) => {
  const fieldIdPrefix = useId();
  const nextFieldId = useRef(Math.max(profile.residentNames.length, 1));
  const [householdName, setHouseholdName] = useState(profile.householdName);
  const [residentNames, setResidentNames] = useState(
    (profile.residentNames.length > 0 ? profile.residentNames : [""]).map((value, index) => ({
      id: `${fieldIdPrefix}-${index}`,
      value,
    })),
  );

  const updateResidentName = (id: string, value: string) => {
    setResidentNames((current) =>
      current.map((name) => (name.id === id ? { ...name, value } : name)),
    );
  };

  const createEmptyResidentName = () => ({
    id: `${fieldIdPrefix}-${nextFieldId.current++}`,
    value: "",
  });

  const removeResidentName = (id: string) => {
    setResidentNames((current) => {
      const next = current.filter((name) => name.id !== id);
      return next.length > 0 ? next : [createEmptyResidentName()];
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedNames = [...new Set(residentNames.map(({ value }) => value.trim()))].filter(
      Boolean,
    );
    void onSave({ householdName: householdName.trim(), residentNames: normalizedNames });
  };

  return (
    <section className="resident-profile-settings" aria-labelledby="resident-profile-title">
      <div className="resident-profile-settings__heading">
        <Users size={22} aria-hidden="true" />
        <div>
          <h2 id="resident-profile-title">居住者プロフィール</h2>
          <p>来訪者が誰宛てに来たかを判断するための内部情報です。</p>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          <span>世帯名・表札名</span>
          <input
            value={householdName}
            maxLength={40}
            placeholder="例：横倉"
            disabled={saving}
            onChange={(event) => setHouseholdName(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>居住者名</legend>
          <div className="resident-profile-settings__names">
            {residentNames.map((name, index) => (
              <div className="resident-profile-settings__name" key={name.id}>
                <label>
                  <span className="visually-hidden">居住者名 {index + 1}</span>
                  <input
                    value={name.value}
                    maxLength={40}
                    placeholder={`例：横倉 琉伊${index > 0 ? `（${index + 1}人目）` : ""}`}
                    disabled={saving}
                    onChange={(event) => updateResidentName(name.id, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`居住者名 ${index + 1} を削除`}
                  disabled={saving}
                  onClick={() => removeResidentName(name.id)}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            className="resident-profile-settings__add"
            type="button"
            disabled={saving || residentNames.length >= RESIDENT_PROFILE_MAX_RESIDENTS}
            onClick={() => setResidentNames((current) => [...current, createEmptyResidentName()])}
          >
            <Plus size={16} aria-hidden="true" />
            居住者を追加
          </button>
        </fieldset>
        <div className="resident-profile-settings__privacy">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            会話判断のため外部AIへ送信されますが、登録名・家族構成・在宅状況を来訪者へ回答しません。
          </p>
        </div>
        <button className="button button--primary" type="submit" disabled={saving}>
          <Save size={17} aria-hidden="true" />
          {saving ? "保存中…" : "プロフィールを保存"}
        </button>
      </form>
    </section>
  );
};
