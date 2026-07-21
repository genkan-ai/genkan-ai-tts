import { AudioWaveform, BellRing, Code2, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VisitMutationResponse } from "../domain/api";
import type { VisitEndReason, VisitSession } from "../domain/visit";
import { getAudioPlaybackState, setAudioPlaybackState } from "./audioPlaybackGuard";
import { PresenterPanel } from "./PresenterPanel";
import { useHalfDuplexRecorder } from "./useHalfDuplexRecorder";
import type { ServerVoicePhase } from "./useVisitApi";

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
  onOpenResident?: () => void;
}

const speakerHoles = Array.from({ length: 48 }, (_, index) => index);
const waveformBars = [7, 13, 20, 11, 27, 16, 32, 18, 25, 12, 29, 19, 34, 16, 23, 10, 18, 8].map(
  (height, position) => ({ id: `wave-${position + 1}`, height }),
);

const initialPresenterMode = (): boolean => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("presenter") === "1";
};

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
  onOpenResident,
}: VisitorIntercomProps) => {
  const [manualAudioUrl, setManualAudioUrl] = useState<string>();
  const [presenterOpen, setPresenterOpen] = useState(initialPresenterMode);
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

  const handleSendText = (message: string) => {
    if (!message.trim()) return;
    recorder.stop();
    recorder.setPhase("thinking");
    void Promise.resolve(onSend(message))
      .then(() => recorder.setPhase("idle"))
      .catch(() => recorder.setPhase("error"));
  };

  const handleEnd = () => {
    recorder.stop();
    void Promise.resolve(onEnd("visitor_ended")).catch(() => recorder.setPhase("error"));
  };

  const displayText = !session
    ? "呼び出してください"
    : isFinalPlayback || effectivePhase === "playing"
      ? "応答しています"
      : isFinished
        ? "ありがとうございました"
        : effectivePhase === "transcribing" ||
            effectivePhase === "thinking" ||
            effectivePhase === "synthesizing"
          ? "確認しています"
          : effectivePhase === "error"
            ? "現在対応できません"
            : "お話しください";

  const statusText = !session
    ? "待機中"
    : isFinalPlayback
      ? "最終応答中"
      : isActive
        ? "通話中"
        : "通話終了";

  const canStart = !session || (isFinished && !isFinalPlayback && recorder.phase !== "playing");
  const callButtonLabel = !session
    ? "呼び出す"
    : canStart
      ? "もう一度呼び出す"
      : isActive
        ? "通話中"
        : "応答中";

  return (
    <main className={`intercom-demo${presenterOpen ? " presenter-is-open" : ""}`}>
      <div className="intercom-demo__ambient" aria-hidden="true" />
      <div className="intercom-demo__utility">
        <button type="button" onClick={() => setPresenterOpen(true)} aria-expanded={presenterOpen}>
          <Code2 size={18} aria-hidden="true" />
          デモ情報
        </button>
      </div>

      <section className="intercom-device" aria-label="仮想インターホン">
        <span className="intercom-device__sensor" aria-hidden="true" />
        <div className={`intercom-display is-${effectivePhase}`} aria-live="polite">
          <strong>{displayText}</strong>
          <div className="intercom-waveform" aria-hidden="true">
            {waveformBars.map((bar) => (
              <i key={bar.id} style={{ height: bar.height }} />
            ))}
          </div>
          <span>{statusText}</span>
        </div>

        <div className="intercom-speaker" aria-hidden="true">
          {speakerHoles.map((hole) => (
            <i key={hole} />
          ))}
        </div>

        <span
          className={`intercom-status-light${isActive || isFinalPlayback ? " is-active" : ""}`}
          aria-hidden="true"
        />

        <button
          className={`intercom-call-button${isActive ? " is-active" : ""}`}
          type="button"
          disabled={!canStart}
          onClick={() => void onStart()}
          aria-label={callButtonLabel}
        >
          {isProcessing ? (
            <LoaderCircle className="intercom-call-button__spinner" size={38} aria-hidden="true" />
          ) : isActive ? (
            <AudioWaveform size={41} aria-hidden="true" />
          ) : (
            <BellRing size={38} aria-hidden="true" />
          )}
        </button>
        <strong className="intercom-call-label">{callButtonLabel}</strong>
        <span className="intercom-device__microphone" aria-hidden="true" />
      </section>

      <footer className="intercom-demo__footer">
        <span>音声は保存されません</span>
        {onOpenResident ? (
          <button type="button" onClick={onOpenResident} aria-label="居住者画面を開く">
            居住者画面
          </button>
        ) : null}
      </footer>

      <PresenterPanel
        open={presenterOpen}
        phase={effectivePhase}
        transcript={session?.transcript ?? []}
        isActive={isActive}
        voiceEnabled={voiceEnabled}
        error={recorder.error ?? apiError ?? session?.lastError}
        canPlayAudio={Boolean(manualAudioUrl)}
        onClose={() => setPresenterOpen(false)}
        onSendText={handleSendText}
        onStartListening={beginListening}
        onPlayAudio={playManually}
        onEnd={handleEnd}
      />
    </main>
  );
};
