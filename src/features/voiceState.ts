export type VoicePhase =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "thinking"
  | "synthesizing"
  | "playing"
  | "error";

export type VoiceAction =
  | { type: "LISTEN" }
  | { type: "SPEECH_DETECTED" }
  | { type: "CAPTURED" }
  | { type: "TRANSCRIBED" }
  | { type: "RESPONSE_READY" }
  | { type: "AUDIO_READY" }
  | { type: "PLAYBACK_ENDED"; continueConversation: boolean }
  | { type: "FAIL" }
  | { type: "RESET" };

export const voicePhaseLabels: Record<VoicePhase, string> = {
  idle: "待機中",
  listening: "お話しください",
  recording: "聞き取り中",
  transcribing: "文字起こし中",
  thinking: "応答を考えています",
  synthesizing: "音声を準備しています",
  playing: "AIが応答中",
  error: "音声を利用できません",
};

export const voiceStateReducer = (_phase: VoicePhase, action: VoiceAction): VoicePhase => {
  switch (action.type) {
    case "LISTEN":
      return "listening";
    case "SPEECH_DETECTED":
      return "recording";
    case "CAPTURED":
      return "transcribing";
    case "TRANSCRIBED":
      return "thinking";
    case "RESPONSE_READY":
      return "synthesizing";
    case "AUDIO_READY":
      return "playing";
    case "PLAYBACK_ENDED":
      return action.continueConversation ? "listening" : "idle";
    case "FAIL":
      return "error";
    case "RESET":
      return "idle";
  }
};
