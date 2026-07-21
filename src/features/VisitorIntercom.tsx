import {
  AudioWaveform,
  BellRing,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Mic,
  PhoneOff,
  Send,
  Volume2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { StatusDot } from "../components/StatusDot";
import type { VisitMutationResponse } from "../domain/api";
import type { VisitEndReason, VisitSession } from "../domain/visit";
import { getAudioPlaybackState, setAudioPlaybackState } from "./audioPlaybackGuard";
import { Transcript } from "./Transcript";
import { useHalfDuplexRecorder } from "./useHalfDuplexRecorder";
import type { ServerVoicePhase } from "./useVisitApi";
import { voiceCapturePolicy } from "./voiceCapturePolicy";
import { voicePhaseLabels } from "./voiceState";

interface VisitorIntercomProps {
  session?: VisitSession;
  onStart: () => undefined | Promise<VisitMutationResponse | undefined>;
  onSend: (message: string) => undefined | Promise<VisitMutationResponse | undefined>;
  onSendAudio?: (audio: Blob) => Promise<VisitMutationResponse | undefined>;
  onEnd: (reason?: VisitEndReason) => undefined | Promise<VisitMutationResponse | undefined>;
  voiceEnabled?: boolean;
  processingPhase?: ServerVoicePhase;
  audioReadyResponseId?: string;
  apiError?: string;
}

const examples = [
  "山田運輸です。荷物のお届けに来ました。",
  "点検料金の集金に来ました。",
  "キャンペーンのご案内です。",
];

export const VisitorIntercom = ({
  session,
  onStart,
  onSend,
  onSendAudio,
  onEnd,
  voiceEnabled = false,
  processingPhase,
  audioReadyResponseId,
  apiError,
}: VisitorIntercomProps) => {
  const [message, setMessage] = useState("");
  const [manualAudioUrl, setManualAudioUrl] = useState<string>();
  const recorder = useHalfDuplexRecorder();
  const handledAiTurn = useRef<string | undefined>(undefined);
  const activeAudio = useRef<HTMLAudioElement | undefined>(undefined);
  const sessionStatus = useRef(session?.status);
  sessionStatus.current = session?.status;

  useEffect(
    () => () => {
      activeAudio.current?.pause();
      activeAudio.current = undefined;
    },
    [],
  );

  const isActive = session?.status === "in_conversation";
  const isFinished = session?.status === "completed" || session?.status === "failed";
  const latestAiEntry = session
    ? [...session.transcript].reverse().find((entry) => entry.speaker === "ai")
    : undefined;
  const latestAiId = latestAiEntry?.id;
  const pendingAudioUrl = session?.pendingAudioUrl;
  const effectivePhase = processingPhase ?? recorder.phase;
  const isFinalPlayback = isFinished && recorder.phase === "playing";
  const isProcessing =
    effectivePhase === "transcribing" ||
    effectivePhase === "thinking" ||
    effectivePhase === "synthesizing" ||
    effectivePhase === "playing";

  const handleCaptured = useCallback(
    async (audio: Blob) => {
      if (!onSendAudio) return;
      recorder.setPhase("transcribing");
      try {
        await onSendAudio(audio);
      } catch {
        recorder.setPhase("error");
      }
    },
    [onSendAudio, recorder.setPhase],
  );

  const handleInactivity = useCallback(async () => {
    if (sessionStatus.current !== "in_conversation") return;
    recorder.setPhase("thinking");
    try {
      await onEnd("inactivity");
    } finally {
      recorder.setPhase("idle");
    }
  }, [onEnd, recorder.setPhase]);

  const beginListening = useCallback(() => {
    if (!voiceEnabled || !onSendAudio || sessionStatus.current !== "in_conversation") return;
    void recorder.listen(handleCaptured, handleInactivity);
  }, [handleCaptured, handleInactivity, onSendAudio, recorder.listen, voiceEnabled]);

  useEffect(() => {
    if (!voiceEnabled || !latestAiId) return;
    if (handledAiTurn.current === latestAiId || audioReadyResponseId !== latestAiId) {
      return;
    }
    handledAiTurn.current = latestAiId;
    recorder.stop();
    const audioUrl = pendingAudioUrl;
    const sessionId = session?.id;
    setManualAudioUrl(undefined);

    if (audioUrl && sessionId) {
      const playbackState = getAudioPlaybackState(sessionId, latestAiId);
      if (playbackState === "completed") {
        if (sessionStatus.current === "in_conversation") {
          const timer = window.setTimeout(beginListening, 350);
          return () => window.clearTimeout(timer);
        }
        recorder.setPhase("idle");
        return;
      }
      if (playbackState === "attempted") {
        setManualAudioUrl(audioUrl);
        recorder.setPhase("idle");
        return;
      }

      setAudioPlaybackState(sessionId, latestAiId, "attempted");
      activeAudio.current?.pause();
      const audio = new Audio(audioUrl);
      activeAudio.current = audio;
      recorder.setPhase("playing");
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        setAudioPlaybackState(sessionId, latestAiId, "completed");
        if (activeAudio.current === audio) activeAudio.current = undefined;
        if (sessionStatus.current === "in_conversation") {
          beginListening();
        } else {
          recorder.setPhase("idle");
        }
      };
      const offerManualPlayback = () => {
        if (settled) return;
        settled = true;
        audio.pause();
        if (activeAudio.current === audio) activeAudio.current = undefined;
        setManualAudioUrl(audioUrl);
        recorder.setPhase("idle");
      };
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", offerManualPlayback, { once: true });
      void audio.play().catch(offerManualPlayback);
      return () => {
        audio.pause();
        if (activeAudio.current === audio) activeAudio.current = undefined;
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", offerManualPlayback);
      };
    }

    if (sessionStatus.current === "in_conversation") {
      const timer = window.setTimeout(beginListening, 350);
      return () => window.clearTimeout(timer);
    }
    recorder.setPhase("idle");
  }, [
    audioReadyResponseId,
    beginListening,
    latestAiId,
    pendingAudioUrl,
    recorder.setPhase,
    recorder.stop,
    session?.id,
    voiceEnabled,
  ]);

  const playManually = useCallback(() => {
    const audioUrl = manualAudioUrl;
    if (!audioUrl) return;
    setManualAudioUrl(undefined);
    recorder.stop();
    recorder.setPhase("playing");
    activeAudio.current?.pause();
    const audio = new Audio(audioUrl);
    activeAudio.current = audio;
    const sessionId = session?.id;
    const responseId = latestAiId;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (sessionId && responseId) setAudioPlaybackState(sessionId, responseId, "completed");
      if (activeAudio.current === audio) activeAudio.current = undefined;
      if (sessionStatus.current === "in_conversation") {
        beginListening();
      } else {
        recorder.setPhase("idle");
      }
    };
    const retry = () => {
      if (settled) return;
      settled = true;
      if (activeAudio.current === audio) activeAudio.current = undefined;
      setManualAudioUrl(audioUrl);
      recorder.setPhase("error");
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", retry, { once: true });
    void audio.play().catch(retry);
  }, [beginListening, latestAiId, manualAudioUrl, recorder.setPhase, recorder.stop, session?.id]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      return;
    }
    recorder.stop();
    recorder.setPhase("thinking");
    void Promise.resolve(onSend(message)).catch(() => recorder.setPhase("error"));
    setMessage("");
  };

  const handleEnd = () => {
    recorder.stop();
    void Promise.resolve(onEnd("visitor_ended")).catch(() => recorder.setPhase("error"));
  };

  return (
    <main className="visitor-page">
      <header className="visitor-header">
        <BrandMark />
        <div>
          <h1>玄関AI</h1>
          <p>AIがご用件を伺います</p>
        </div>
      </header>

      {!session ? (
        <section className="visitor-call-card" aria-labelledby="visitor-start-title">
          <BellRing size={46} strokeWidth={1.8} aria-hidden="true" />
          <h2 id="visitor-start-title">訪問をお知らせください</h2>
          <p>居住者の在宅状況を明かさず、AIが安全にご用件を伺います。</p>
          <button
            className="button button--primary button--large"
            type="button"
            onClick={() => void onStart()}
          >
            <BellRing size={22} aria-hidden="true" />
            呼び出す
          </button>
          <span className="privacy-note">
            <LockKeyhole size={15} aria-hidden="true" />
            音声は保存されません
          </span>
        </section>
      ) : (
        <>
          <section className="visitor-session" aria-labelledby="visitor-session-title">
            <div className="visitor-session__status">
              <span>
                <StatusDot tone={isActive ? "safe" : "live"} />
                {isActive
                  ? "通話中"
                  : isFinalPlayback
                    ? "最終応答中"
                    : isFinished
                      ? "会話終了"
                      : "居住者へ通知済み"}
              </span>
              <span className="visitor-session__mode">
                {voiceEnabled
                  ? `音声モード · ${voicePhaseLabels[effectivePhase]}`
                  : "テキストモード"}
              </span>
            </div>
            <div className="visitor-session__lead">
              <MessageSquareText size={26} aria-hidden="true" />
              <div>
                <h2 id="visitor-session-title">
                  {isActive
                    ? "ご用件をお話しください"
                    : isFinalPlayback
                      ? "最後の応答をお伝えしています"
                      : isFinished
                        ? "会話が終了しました"
                        : "内容を確認しています"}
                </h2>
                <p>
                  {isActive
                    ? voiceEnabled
                      ? "発話後の無音を検出し、AIが順番に応答します。"
                      : "音声対応の前に、安全な会話フローをテキストで検証しています。"
                    : isFinalPlayback
                      ? "音声の再生が終わるまで、この画面で待機します。"
                      : isFinished
                        ? "AIの最終応答を画面でも確認できます。"
                        : "内容を確認しています。少々お待ちください。"}
                </p>
              </div>
            </div>
            {voiceEnabled && (isActive || isFinalPlayback) ? (
              <div className={`voice-stage voice-stage--${effectivePhase}`} aria-live="polite">
                <span className="voice-stage__icon" aria-hidden="true">
                  {isProcessing ? (
                    <LoaderCircle className="voice-stage__spinner" size={28} />
                  ) : effectivePhase === "recording" || effectivePhase === "listening" ? (
                    <AudioWaveform size={30} />
                  ) : (
                    <Mic size={28} />
                  )}
                </span>
                <div>
                  <strong>
                    {isFinalPlayback
                      ? "最後の応答を再生しています"
                      : voicePhaseLabels[effectivePhase]}
                  </strong>
                  {isFinalPlayback ? (
                    <span>再生が終わると自動で会話を終了します。</span>
                  ) : (
                    <span>
                      最大{voiceCapturePolicy.maxRecordingMs / 1_000}秒・約
                      {voiceCapturePolicy.trailingSilenceMs / 1_000}
                      秒の無音で自動送信・無発話が
                      {voiceCapturePolicy.noSpeechMs / 1_000}秒続くと通話終了
                    </span>
                  )}
                </div>
                {manualAudioUrl ? (
                  <button type="button" onClick={playManually}>
                    <Volume2 size={17} aria-hidden="true" />
                    AI音声を再生
                  </button>
                ) : effectivePhase === "error" || recorder.phase === "idle" ? (
                  <button type="button" onClick={beginListening}>
                    <Mic size={17} aria-hidden="true" />
                    音声入力を開始
                  </button>
                ) : null}
              </div>
            ) : null}
            {(recorder.error || apiError || session.lastError) && (
              <p className="voice-error" role="status">
                {recorder.error ?? apiError ?? session.lastError}
              </p>
            )}
            <Transcript entries={session.transcript} compact />
          </section>

          {isActive ? (
            <section className="visitor-input-panel" aria-label="ご用件の入力">
              <form onSubmit={handleSubmit}>
                <label htmlFor="visitor-message">
                  {voiceEnabled ? "テキストで入力（開発・代替用）" : "ご用件を入力"}
                </label>
                <div className="visitor-input-panel__row">
                  <input
                    id="visitor-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="例：荷物のお届けに来ました"
                  />
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={!message.trim()}
                  >
                    <Send size={18} aria-hidden="true" />
                    送信
                  </button>
                </div>
              </form>
              <fieldset className="example-actions">
                <legend className="visually-hidden">入力例</legend>
                {examples.map((example) => (
                  <button type="button" key={example} onClick={() => setMessage(example)}>
                    {example}
                  </button>
                ))}
              </fieldset>
            </section>
          ) : isFinalPlayback ? (
            <p className="visitor-playback-wait" role="status">
              音声の再生が終わるまでお待ちください。
            </p>
          ) : (
            <button
              className="button button--primary visitor-resident-link"
              type="button"
              onClick={() => void onStart()}
            >
              <BellRing size={18} aria-hidden="true" />
              新しい呼び出し
            </button>
          )}

          {!isFinished && (
            <button
              className="button button--danger-outline visitor-end"
              type="button"
              onClick={handleEnd}
            >
              <PhoneOff size={19} aria-hidden="true" />
              会話を終了
            </button>
          )}
        </>
      )}
    </main>
  );
};
