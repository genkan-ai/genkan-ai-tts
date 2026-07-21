import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(cleanup);

describe("GenkanAI demo", () => {
  it("edits and keeps a structured resident profile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("世帯名・表札名"), "テスト世帯");
    await user.type(screen.getByLabelText("居住者名 1"), "テスト居住者");
    await user.click(screen.getByRole("button", { name: "居住者を追加" }));
    await user.type(screen.getByLabelText("居住者名 2"), "テスト同居人");
    await user.click(screen.getByRole("button", { name: "プロフィールを保存" }));

    expect(screen.getByLabelText("世帯名・表札名")).toHaveValue("テスト世帯");
    expect(screen.getByLabelText("居住者名 1")).toHaveValue("テスト居住者");
    expect(screen.getByLabelText("居住者名 2")).toHaveValue("テスト同居人");
  });

  it("completes the text simulator flow with an automated AI outcome", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "来訪者テスト" }));
    await user.click(screen.getByRole("button", { name: "呼び出す" }));
    await user.click(screen.getByRole("button", { name: "デモ情報" }));
    await user.type(
      screen.getByLabelText("テキスト代替入力"),
      "山田運輸です。荷物のお届けに来ました。",
    );
    await user.click(screen.getByRole("button", { name: "送信" }));

    expect(screen.getByText("ご用件を承りました。こちらでお伝えします。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "居住者画面を開く" }));

    expect(screen.getByRole("heading", { name: "山田運輸" })).toBeInTheDocument();
    expect(screen.getByText("配達")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AIが対応しました" })).toBeInTheDocument();
    expect(screen.getAllByText("居住者へ通知済み").length).toBeGreaterThan(0);
    expect(screen.getByText("要約")).toBeInTheDocument();
    expect(screen.getByText("適用した配達方針")).toBeInTheDocument();
    expect(screen.getAllByText("用件の通知のみ").length).toBeGreaterThan(0);
    expect(screen.getByText("次の行動")).toBeInTheDocument();
    expect(screen.getByText("荷物の宛名と対応方法を確認する")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /応答する|お断りする|あとで確認/ })).toBeNull();
    expect(screen.getByText("会話全文と処理履歴を確認").closest("details")).not.toHaveAttribute(
      "open",
    );
  });
});
