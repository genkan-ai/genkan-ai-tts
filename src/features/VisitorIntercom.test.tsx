import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitSession } from "../domain/visit";
import { VisitorIntercom } from "./VisitorIntercom";

const session: VisitSession = {
  id: "visit-1",
  startedAt: "2026-07-21T00:00:00.000Z",
  status: "in_conversation",
  mode: "voice",
  turnCount: 0,
  transcript: [
    {
      id: "ai-1",
      speaker: "ai",
      text: "はい。ご用件をお伺いします。",
      createdAt: "2026-07-21T00:00:00.000Z",
    },
  ],
  pendingAudioUrl: "/api/audio/test",
};

describe("VisitorIntercom TTS playback", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers manual playback when browser autoplay is blocked", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("Autoplay blocked", "NotAllowedError"),
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    render(
      <VisitorIntercom
        session={session}
        onStart={vi.fn()}
        onSend={vi.fn()}
        onSendAudio={vi.fn()}
        onEnd={vi.fn()}
        voiceEnabled
        audioReadyResponseId="ai-1"
      />,
    );

    expect(await screen.findByRole("button", { name: "AI音声を再生" })).toBeInTheDocument();
  });

  it("does not automatically replay the same AI response after remounting", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

    const props = {
      session,
      onStart: vi.fn(),
      onSend: vi.fn(),
      onSendAudio: vi.fn(),
      onEnd: vi.fn(),
      voiceEnabled: true,
      audioReadyResponseId: "ai-1",
    };
    const first = render(<VisitorIntercom {...props} />);
    expect(play).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<VisitorIntercom {...props} />);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps the final response playing while the session changes to completed", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const props = {
      onStart: vi.fn(),
      onSend: vi.fn(),
      onSendAudio: vi.fn(),
      onEnd: vi.fn(),
      voiceEnabled: true,
      audioReadyResponseId: "ai-1",
    };
    const view = render(<VisitorIntercom {...props} session={session} />);

    view.rerender(
      <VisitorIntercom
        {...props}
        session={{ ...session, status: "completed", endedAt: "2026-07-21T00:00:05.000Z" }}
      />,
    );

    expect(pause).not.toHaveBeenCalled();
    expect(screen.getByText("最後の応答を再生しています")).toBeInTheDocument();
    expect(screen.getByText("音声の再生が終わるまでお待ちください。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新しい呼び出し" })).toBeNull();
  });

  it("shows the longer trailing-silence capture window", () => {
    render(
      <VisitorIntercom
        session={{ ...session, pendingAudioUrl: undefined }}
        onStart={vi.fn()}
        onSend={vi.fn()}
        onSendAudio={vi.fn()}
        onEnd={vi.fn()}
        voiceEnabled
      />,
    );

    expect(
      screen.getByText(/最大15秒・約1\.5秒の無音で自動送信・無発話が10秒続くと通話終了/),
    ).toBeInTheDocument();
  });
});
