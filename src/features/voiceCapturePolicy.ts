export const voiceCapturePolicy = {
  trailingSilenceMs: 1_500,
  noSpeechMs: 10_000,
  maxRecordingMs: 15_000,
  speechRmsThreshold: 0.02,
} as const;

export const hasVoiceActivity = (rms: number): boolean =>
  rms >= voiceCapturePolicy.speechRmsThreshold;

export const hasTrailingSilenceElapsed = (now: number, lastSpeechAt: number): boolean =>
  now - lastSpeechAt >= voiceCapturePolicy.trailingSilenceMs;

export const hasNoSpeechElapsed = (now: number, startedAt: number): boolean =>
  now - startedAt >= voiceCapturePolicy.noSpeechMs;
