# Voice MVP Architecture

## Goal

localhost上で、ブラウザの来訪者画面から音声会話を開始し、AIの安全な最終応答と居住者画面への結果通知までを再現する。カメラ、実インターホン、解錠、本番公開は扱わない。

## Runtime

```text
Visitor browser ─┐
                 ├─ Vite :4173 ─proxy─ Fastify :8787 ─ SQLite
Resident browser ┘                         │
                                          ├─ whisper-server :8080 (Medium)
                                          ├─ Gemini OpenAI互換Chat Completions API
                                          └─ Fish Audio TTS
```

すべてのローカルプロセスは`127.0.0.1`へbindする。APIキーはFastifyだけが読み、ブラウザへ渡さない。Viteは`/api`をFastifyへproxyする。来訪者画面は処理イベント、居住者画面は完了通知だけを別々のSSEで受信する。

## Layers and provider boundaries

- `domain`: 来訪セッション、分類、要約、イベント、API契約
- `application`: ユースケースと音声・会話・通知・保存ポート
- `server/services`: 非同期会話の順序制御、タイムアウト、安全な失敗処理
- `server/adapters`: Groq/localhost Whisper、Gemini、Sakana Fugu、Fish Audio、SQLite
- `features`: 自動半二重録音、来訪者画面、居住者ダッシュボード

`SpeechRecognitionPort`、`ConversationTurnService`、`SpeechSynthesisPort`を独立させる。既定はGroq STT、ローカル代替は`whisper.cpp` Mediumとし、環境変数だけで切り替える。

## Voice turn

1. AI応答の再生終了後にマイクを開始する。
2. 音量閾値を超えたら発話開始とし、1.5秒の無音または15秒で録音を終了する。音声を一度も検出しない状態が10秒続いた場合は、来訪者が離れたものとして通話を終了する。
3. `POST /api/visits/:id/turns`へ録音を送る。
4. Fastifyが形式、5MiB上限を検証し、設定されたSTTプロバイダーへ転送する。
5. Geminiが安全な応答、追加質問、分類、要約、自動対応結果をJSON Schemaに沿って構造化出力する。サーバーが分類と居住者設定を検証し、生成された自然な案内が許可済みの意味と安全条件を満たす場合だけ採用する。直近4件と高い類似性がある応答は再利用せず、不適切な場合は重複しない許可済み候補へフォールバックする。
6. Fish Audioが応答を合成する。失敗時は文字表示を続行する。
7. 情報が不足していれば次の録音へ戻る。対応方針が決まった後も確認や返答を受け付け、明示的な終了発話、10秒の無発話、最大8発話、または90秒で`completed`へ移る。

AI再生中は録音せず、入力音声はWhisper処理後に永続化しない。生成音声はメモリ内に最大5分保持し、最初の取得で削除する。

## Session and safety

- 氏名または所属、訪問目的、要求内容を収集し、最大8発話・90秒を安全上の上限とする。
- 在宅状況、子どもの存在、家族構成、認証情報、解錠方法を回答しない。
- 読み上げ音声ではAIと名乗らず、人間や居住者本人とも名乗らない。身元質問や直接の取次ぎ要求には肯否で答えず、既知の用件を聞き直さない文脈的な表現で会話を継続する。
- 居住者の応答選択は待たず、AIが用件とリスクに基づいて安全な案内を行い、その後の自然なラリーも継続する。
- STTまたはLLM失敗は自然な安全メッセージを残して`failed`で終了し、フォールバック要約を通知する。
- TTS失敗はセッションを継続し、応答本文を表示する。
- SQLiteにはセッション、イベント、配達設定、構造化した居住者プロフィールを保存し、訪問履歴は既定7日で期限切れ削除する。
- 居住者プロフィールは世帯名・表札名と最大8名の居住者名に限定する。ConversationTurnServiceへ内部参照情報として直接渡し、VisitSessionや来訪者向けAPIレスポンスには含めない。
- 会話AIにはプロフィール値を命令ではなくデータとしてJSONで渡し、訪問対象者の理解にだけ使う。登録名、居住の事実、世帯構成、在宅状況は確認・開示しない。
- 居住者画面には完了済み訪問だけを返し、会話全文は折りたたみ表示とする。

## API

- `POST /api/visits`
- `POST /api/visits/:id/turns`（multipart音声またはJSONテキスト）
- `POST /api/visits/:id/end`
- `GET /api/visits`
- `GET /api/visits/:id`
- `GET /api/events`（SSE）
- `GET /api/resident/visits`、`GET /api/resident/visits/:id`（完了済みのみ）
- `GET /api/resident/events`（完了通知専用SSE）
- `GET /api/resident/settings`、`PUT /api/resident/settings`
- `GET /api/resident/profile`、`PUT /api/resident/profile`
- `GET /api/audio/:id`（一度だけ取得可能な合成音声）
- `GET /api/health`

## Verification boundary

自動テストは外部プロバイダーをモック化する。実Groq Whisper Large V3 Turbo、Gemini、Fish Audio、マイク権限、日本語精度、p50/p95遅延はローカル手動確認として分離する。実装runは自己受け入れせず、差分、テスト、build、ブラウザ証跡を別の検証者が確認する。
