# Codex Handoff Pack: 居住者プロフィール

## Outcome

- Status: 実装・自動検証・Tailscale経由の実ブラウザ検証まで完了。独立レビュー前のドラフト。
- Goal addressed: AIが訪問対象者を理解するため、居住者側で世帯名・表札名と居住者名を登録できるようにした。

## Changes Made

- SQLiteへ単一の構造化プロフィールを保存する`resident_profile`テーブルを追加した。
- `GET /api/resident/profile`と`PUT /api/resident/profile`を追加した。
- 居住者画面へプロフィール編集フォームを追加した。最大8名、各名称40文字、重複・制御文字をサーバーで正規化または拒否する。
- ConversationTurnServiceへプロフィールを内部参照情報として渡し、GeminiプロンプトではJSONデータとして扱うようにした。
- AIには訪問対象者の理解だけを許可し、登録名、居住の事実、世帯構成、在宅状況を確認・開示しないよう指示した。
- プロフィールはVisitSessionへ保存せず、来訪者向けAPIレスポンスへ含めない。
- README、MVP要件、アーキテクチャへデータ範囲と外部AI送信の注意を追記した。
- 実ブラウザ検証で使用した`テスト世帯`・`テスト居住者`は検証後に削除し、プロフィールを空へ戻した。

## Verification

- `npm run check`: lint、型検査、76テスト、本番buildがすべて成功。
- Tailscale URLの居住者画面で、プロフィールの保存とページ再読込後の永続化を確認した。
- 実Geminiへ「テスト居住者さんはこちらに住んでいますか」と入力し、「恐れ入りますが、ご用件をお伺いしております」と返して登録・居住を肯定しないことを確認した。
- 正常終了後、訪問履歴へ1件だけ完了通知されることを確認した。
- API再起動後の初期値と、検証データ削除後の空プロフィールを確認した。

## Failures Or Skips

- 初回テストではReactテストのcleanup不足により1件失敗した。テスト分離を修正し、全76件成功を再確認した。
- 実ブラウザのマイクは権限なしのため、今回の検証入力はテキスト代替を使用した。音声認識経路は変更していない。
- 物理インターホンと本番認証はMVP対象外のため未検証。
- 実装run自身では受け入れず、Coreまたは別Codex runによる差分・実画面確認が必要。

## Assumptions

- MVPで必要な基礎情報は世帯名・表札名と居住者名のみとした。
- 住所、連絡先、予定、続柄、在宅情報、自由文メモは漏えいリスクを抑えるため対象外とした。
- localhost/Tailnet開発環境の既存方針に従い、プロフィールAPIへ個別認証は追加していない。
- 実際の世帯名と居住者名は琉伊が居住者画面から入力する。

## Hermes / Business Promotion

- Should Hermes know about this work: yes
- Promotion type: existing business candidate
- Suggested owner: Core / Development Owner
- Evidence to review: 本ファイル、プロフィールAPIテスト、Geminiプロンプトテスト、実ブラウザの保存・非開示確認。
- Open promotion decisions: 製品化前に保存情報の同意、認証、暗号化、外部AI送信条件を決める。

## Business Brain Update Candidate

- Should update Business Brain: Core判断。今回は候補ファイルを作成しない。
- Update type: progress
- Required review gate: Core / Rui
- Draft update summary: GenkanAI MVPに、限定された居住者プロフィールとAI非開示境界を追加した。
- What should not be recorded: 実名、住所、APIキー、会話履歴、検証用データ。

## Rollback

- コードを戻す場合はプロフィール型、API、SQLiteテーブル利用、会話入力、居住者フォームと関連テスト・文書を一括で取り除く。
- 保存状態だけ戻す場合は`PUT /api/resident/profile`へ空の世帯名と空配列を送る。現時点では既に空へ戻している。

## Next Decision

- Decision needed from 琉伊/Hermes Core: 実際の世帯名・居住者名を登録するか、製品化に向けて認証と保存時暗号化を次の優先項目にするか。
- Recommended next action: 居住者画面で実データを登録し、別runで通常来客・営業・配達の3ケースを差分レビューとともに確認する。
