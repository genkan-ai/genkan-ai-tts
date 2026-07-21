import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "デモ情報" }));
    expect(await screen.findByRole("button", { name: "生成音声を再生" })).toBeInTheDocument();
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
    expect(screen.getByText("応答しています")).toBeInTheDocument();
    expect(screen.getByText("最終応答中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "応答中" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "もう一度呼び出す" })).toBeNull();
  });

  it("keeps diagnostics hidden until presenter mode is opened", async () => {
    const user = userEvent.setup();
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

    expect(screen.getByText("お話しください")).toBeInTheDocument();
    expect(screen.queryByText("処理パイプライン")).toBeNull();
    expect(screen.queryByLabelText("テキスト代替入力")).toBeNull();

    await user.click(screen.getByRole("button", { name: "デモ情報" }));
    expect(screen.getByText("処理パイプライン")).toBeInTheDocument();
    expect(
      screen.getByText(/最大15秒・約1\.5秒の無音で自動送信・無発話が10秒続くと通話終了/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("テキスト代替入力")).toBeInTheDocument();
  });

  it("presents a product-only waiting screen before a call starts", () => {
    render(
      <VisitorIntercom onStart={vi.fn()} onSend={vi.fn()} onEnd={vi.fn()} voiceEnabled={false} />,
    );

    expect(screen.getByText("呼び出してください")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "呼び出す" })).toBeEnabled();
    expect(screen.queryByText("AI")).toBeNull();
  });
});
