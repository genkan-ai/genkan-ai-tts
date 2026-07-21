import {
  AudioLines,
  ChevronDown,
  FileAudio2,
  FileText,
  MessageSquareText,
  Mic,
  PhoneOff,
  Send,
  Volume2,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import type { TranscriptEntry } from "../domain/visit";
import { Transcript } from "./Transcript";
import { voiceCapturePolicy } from "./voiceCapturePolicy";
import type { VoicePhase } from "./voiceState";

const scenarios = [
  "山田運輸です。荷物のお届けに来ました。",
  "近くで設備点検をしている会社です。ご案内に来ました。",
  "佐藤です。田中さんとの約束で伺いました。",
] as const;

const pipelineSteps = [
  { id: "capture", label: "音声入力", icon: Mic },
  { id: "transcribe", label: "文字起こし", icon: FileText },
  { id: "respond", label: "応答生成", icon: MessageSquareText },
  { id: "synthesize", label: "音声生成", icon: FileAudio2 },
] as const;

type PipelineStepId = (typeof pipelineSteps)[number]["id"];
type PipelineState = "active" | "complete" | "waiting" | "error";

const phaseOrder: Record<VoicePhase, number> = {
  idle: 0,
  listening: 1,
  recording: 1,
  transcribing: 2,
  thinking: 3,
  synthesizing: 4,
  playing: 5,
  error: -1,
};

const stepOrder: Record<PipelineStepId, number> = {
  capture: 1,
  transcribe: 2,
  respond: 3,
  synthesize: 4,
};

const pipelineState = (step: PipelineStepId, phase: VoicePhase): PipelineState => {
  if (phase === "error") return "error";
  const current = phaseOrder[phase];
  const target = stepOrder[step];
  if (current === target || (step === "synthesize" && phase === "playing")) return "active";
  if (current > target) return "complete";
  return "waiting";
};

const pipelineStateLabel: Record<PipelineState, string> = {
  active: "処理中",
  complete: "完了",
  waiting: "待機中",
  error: "要確認",
};

interface PresenterPanelProps {
  open: boolean;
  phase: VoicePhase;
  transcript: TranscriptEntry[];
  isActive: boolean;
  voiceEnabled: boolean;
  error?: string;
  canPlayAudio: boolean;
  onClose: () => void;
  onSendText: (message: string) => void;
  onStartListening: () => void;
  onPlayAudio: () => void;
  onEnd: () => void;
}

export const PresenterPanel = ({
  open,
  phase,
  transcript,
  isActive,
  voiceEnabled,
  error,
  canPlayAudio,
  onClose,
  onSendText,
  onStartListening,
  onPlayAudio,
  onEnd,
}: PresenterPanelProps) => {
  const [message, setMessage] = useState("");

  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage) return;
    onSendText(nextMessage);
    setMessage("");
  };

  return (
    <aside className="presenter-panel" aria-label="プレゼンターモード">
      <header className="presenter-panel__header">
        <div>
          <AudioLines size={20} aria-hidden="true" />
          <strong>プレゼンターモード</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="デモ情報を閉じる">
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <section className="presenter-panel__section" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title">処理パイプライン</h2>
        <ol className="presenter-pipeline">
          {pipelineSteps.map((step) => {
            const state = pipelineState(step.id, phase);
            const Icon = step.icon;
            return (
              <li key={step.id} className={`presenter-pipeline__step is-${state}`}>
                <Icon size={19} aria-hidden="true" />
                <span>{step.label}</span>
                <strong>
                  <i aria-hidden="true" />
                  {pipelineStateLabel[state]}
                </strong>
              </li>
            );
          })}
        </ol>
        <p className="presenter-capture-policy">
          最大{voiceCapturePolicy.maxRecordingMs / 1_000}秒・約
          {voiceCapturePolicy.trailingSilenceMs / 1_000}秒の無音で自動送信・無発話が
          {voiceCapturePolicy.noSpeechMs / 1_000}秒続くと通話終了
        </p>
      </section>

      {error ? (
        <p className="presenter-panel__error" role="status">
          {error}
        </p>
      ) : null}

      <details className="presenter-log" open={transcript.length > 0}>
        <summary>
          会話ログ
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="presenter-log__body">
          {transcript.length > 0 ? (
            <Transcript entries={transcript} compact />
          ) : (
            <p>呼び出しボタンを押すと、ここに診断用ログが表示されます。</p>
          )}
        </div>
      </details>

      <section
        className="presenter-panel__section presenter-controls"
        aria-labelledby="demo-input-title"
      >
        <h2 id="demo-input-title">デモ入力</h2>
        <fieldset className="presenter-scenarios">
          <legend className="visually-hidden">デモシナリオ</legend>
          {scenarios.map((scenario, index) => (
            <button
              type="button"
              key={scenario}
              disabled={!isActive}
              onClick={() => setMessage(scenario)}
            >
              シナリオ {index + 1}
            </button>
          ))}
        </fieldset>
        <form onSubmit={submit}>
          <label htmlFor="presenter-message">テキスト代替入力</label>
          <textarea
            id="presenter-message"
            value={message}
            disabled={!isActive}
            placeholder="来訪者の発話を入力"
            onChange={(event) => setMessage(event.target.value)}
          />
          <button type="submit" disabled={!isActive || !message.trim()}>
            <Send size={16} aria-hidden="true" />
            送信
          </button>
        </form>

        <div className="presenter-controls__actions">
          {voiceEnabled ? (
            <button type="button" disabled={!isActive} onClick={onStartListening}>
              <Mic size={16} aria-hidden="true" />
              音声入力を開始
            </button>
          ) : null}
          {canPlayAudio ? (
            <button type="button" onClick={onPlayAudio}>
              <Volume2 size={16} aria-hidden="true" />
              生成音声を再生
            </button>
          ) : null}
          <button className="is-danger" type="button" disabled={!isActive} onClick={onEnd}>
            <PhoneOff size={16} aria-hidden="true" />
            テストを強制終了
          </button>
        </div>
      </section>
    </aside>
  );
};
