import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasNoSpeechElapsed,
  hasTrailingSilenceElapsed,
  hasVoiceActivity,
  voiceCapturePolicy,
} from "./voiceCapturePolicy";
import type { VoicePhase } from "./voiceState";

const supportedMimeType = (): string => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

export const useHalfDuplexRecorder = () => {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string>();
  const cleanupRef = useRef<() => void>(() => undefined);

  const stop = useCallback(() => {
    cleanupRef.current();
    cleanupRef.current = () => undefined;
    setPhase("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const listen = useCallback(
    async (
      onCaptured: (audio: Blob) => void | Promise<void>,
      onNoSpeech?: () => void | Promise<void>,
    ) => {
      stop();
      setError(undefined);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("このブラウザではマイク録音を利用できません。テキスト入力を利用してください。");
        setPhase("error");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const chunks: BlobPart[] = [];
        const mimeType = supportedMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        let animationFrame = 0;
        let finished = false;
        let deliverRecording = false;
        let speechDetected = false;
        let lastSpeechAt = 0;
        const startedAt = performance.now();

        const release = () => {
          cancelAnimationFrame(animationFrame);
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          source.disconnect();
          for (const track of stream.getTracks()) track.stop();
          void audioContext.close();
        };

        const finish = (deliver: boolean) => {
          if (finished) return;
          finished = true;
          deliverRecording = deliver;
          release();
        };

        cleanupRef.current = () => finish(false);
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          cleanupRef.current = () => undefined;
          if (!deliverRecording) return;
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          setPhase("transcribing");
          void onCaptured(blob);
        });
        recorder.start(200);
        setPhase("listening");

        const observe = () => {
          if (finished) return;
          const now = performance.now();
          analyser.getFloatTimeDomainData(samples);
          let power = 0;
          for (const sample of samples) power += sample * sample;
          const rms = Math.sqrt(power / samples.length);
          if (hasVoiceActivity(rms)) {
            lastSpeechAt = now;
            if (!speechDetected) {
              speechDetected = true;
              setPhase("recording");
            }
          }

          if (speechDetected && hasTrailingSilenceElapsed(now, lastSpeechAt)) {
            finish(true);
            return;
          }
          if (speechDetected && now - startedAt >= voiceCapturePolicy.maxRecordingMs) {
            finish(true);
            return;
          }
          if (!speechDetected && hasNoSpeechElapsed(now, startedAt)) {
            finish(false);
            setPhase("idle");
            void Promise.resolve(onNoSpeech?.()).catch(() => {
              setError("無発話による会話終了に失敗しました。もう一度お試しください。");
              setPhase("error");
            });
            return;
          }
          animationFrame = requestAnimationFrame(observe);
        };
        animationFrame = requestAnimationFrame(observe);
      } catch (caught) {
        setError(
          caught instanceof DOMException && caught.name === "NotAllowedError"
            ? "マイクの利用が許可されていません。ブラウザ設定を確認してください。"
            : "マイクを開始できませんでした。テキスト入力を利用してください。",
        );
        setPhase("error");
      }
    },
    [stop],
  );

  return { phase, error, listen, stop, setPhase };
};
