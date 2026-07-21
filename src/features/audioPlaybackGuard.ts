const playbackKeyPrefix = "genkan-ai:tts-playback:v1";

export type AudioPlaybackState = "attempted" | "completed";

const storageKey = (sessionId: string, responseId: string): string =>
  `${playbackKeyPrefix}:${sessionId}:${responseId}`;

export const getAudioPlaybackState = (
  sessionId: string,
  responseId: string,
): AudioPlaybackState | undefined => {
  try {
    const value = window.sessionStorage.getItem(storageKey(sessionId, responseId));
    return value === "attempted" || value === "completed" ? value : undefined;
  } catch {
    return undefined;
  }
};

export const setAudioPlaybackState = (
  sessionId: string,
  responseId: string,
  state: AudioPlaybackState,
): void => {
  try {
    window.sessionStorage.setItem(storageKey(sessionId, responseId), state);
  } catch {
    // Playback still works when storage is disabled; the component ref remains the fallback guard.
  }
};
