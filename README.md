# GenkanAI

GenkanAI（玄関AI）は、来訪者への一次対応をAIが行い、訪問目的と重要度を整理して居住者へ通知するソフトウェアです。

## Current status

localhostで動作するソフトウェアMVPです。来訪者側ブラウザで自動半二重の音声会話を行い、AIが単独で対応を完了した後、別タブの居住者画面へ要約と対応結果を通知します。来訪者画面は実験用です。

- STT: Groq Speech to Text（既定 `whisper-large-v3-turbo`）
- 会話・分類・要約: Gemini API（既定 `gemini-3.1-flash-lite`）
- TTS: Fish Audio `s2.1-pro-free`、公開日本語音声「落ち着いた女性」
- 保存: ローカルSQLite、文字起こしは7日保持、入力音声は永続化しない

実インターホン、カメラ、解錠、住宅設備制御、本番公開は含みません。外部APIを使わないモック会話とテキスト入力も残してあります。

## Requirements

- Node.js 22.12以降、npm 10以降
- macOSの最新版ChromeまたはSafari
- Groq APIキー
- 音声MVPではGoogle AI Studioで作成したGemini APIキー
- Fish Audioを読み上げに使う場合はAPIキー。音声は公開モデルIDで固定済み

## Local setup

```bash
npm install
cp .env.example .env.local
```

`.env.local`で次を設定します。

```dotenv
CONVERSATION_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_REASONING_EFFORT=low
STT_PROVIDER=groq-whisper
GROQ_API_KEY=...
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
FISH_AUDIO_API_KEY=...
FISH_AUDIO_MODEL=s2.1-pro-free
FISH_AUDIO_FEMALE_REFERENCE_ID=0089dce5fefb4c6ba9b9f2f0debe1ddc
FISH_AUDIO_MALE_REFERENCE_ID=6b1baee70ebe4e20b326b2f5f804eeb4
```

`gemini-3.1-flash-lite` は高頻度・低コスト用途向けの安定版で、無料枠対象モデルです。Google AI Studioの
無料枠では対象モデルの入力・出力トークンを無償で利用できますが、レート制限があり、
無料枠の入力はGoogleの製品改善に使われる条件です。本番利用前に課金プランとデータ利用条件を
再確認してください。`CONVERSATION_PROVIDER=sakana-fugu` または `openai` と対応する
APIキーを設定すれば、従来のアダプターへ戻せます。

GroqはOpenAI互換の音声転写APIを使用し、日本語を明示して送信します。ローカルへ戻す場合は
`brew install whisper-cpp ffmpeg`、`npm run setup:whisper`を実行し、
`STT_PROVIDER=local-whisper`へ変更します。Mediumモデルは約1.5GiBでGitには含まれません。

Fish Audioの読み上げエンジンは`S2.1 Pro Free`のまま、居住者設定またはデモ情報から
公開日本語音声の女性（`0089dce5fefb4c6ba9b9f2f0debe1ddc`）と男性
（`6b1baee70ebe4e20b326b2f5f804eeb4`）を切り替えられます。既存の
`FISH_AUDIO_REFERENCE_ID`は女性音声の後方互換設定として引き続き使用できます。
公開モデルの提供状況や利用条件はFish Audio側で変更される可能性があるため、製品化前に再確認してください。

## Start

localhost APIとViteをまとめて起動します。

```bash
npm run dev
```

### 別ネットワークの登録済み端末からテストする

Macと外部端末を同じTailscaleネットワークへ接続すると、APIをMac内に残したまま、
別Wi-Fiやモバイル回線からHTTPSでテストできます。Vercelへフロントだけを配置してもMacの
ローカルAPIには到達できないため、このMVPではTailscale Serveを使用します。

```bash
npm run dev:tailnet
npm run serve:tailnet
```

`tailscale serve status` に表示されたHTTPS URLを外部端末で開きます。外部端末側でも
Tailscaleをオンにしてください。URLはtailnet内限定で、一般のインターネットには公開されません。
停止するときは `tailscale serve --https=443 off` を実行します。

ブラウザで次を開きます。

- 来訪者: `http://127.0.0.1:4173/?view=visitor`
- 居住者: `http://127.0.0.1:4173/?view=resident`
- ヘルスチェック: `http://127.0.0.1:4173/api/health`

外部APIなしで画面とテキストフローだけ確認する場合は、`.env.local`の`CONVERSATION_PROVIDER=mock`を使用し、テキスト入力で確認します。Fish Audioが未設定または失敗した場合もAI応答は画面に表示されます。

## Voice behavior

- AI再生中は録音しません。
- 発話開始後1.5秒の無音、または15秒経過で自動送信します。
- AIの応答後に10秒間音声を検出できなければ、来訪者が離れたものとして音声を追加せず会話を終了します。
- 対応方針が決まっても通話を即終了せず、質問や確認への自然な応答を続けます。明示的な終了発話、10秒の無発話、最大8回の来訪者発話、または90秒で会話を終了します。
- 配達案内やお断りはLLMが文脈に応じて生成し、サーバーが許可済みの意味と安全性を検証します。検証を通らない場合だけ安全な定型文へフォールバックします。
- 直近4件のAI応答と類似する文章は再利用せず、了承・質問・反論・新しい用件に応じて短く言い換えます。安全フォールバックも単一文ではなく、重複しない許可済み候補から選びます。
- 読み上げ音声ではAIと名乗らず、人間や居住者本人とも名乗りません。
- AIが配達方針の案内、通常来客への再訪依頼、営業・詐欺疑いのお断り、緊急窓口案内を自動判断します。居住者の応答選択操作はありません。
- 居住者画面には進行中の訪問を表示せず、正常終了・途中終了・障害を含む全訪問を完了後に通知します。
- 配達方針は居住者画面で「通知のみ・玄関前・宅配ボックス・再配達」から設定できます。
- 居住者画面で世帯名・表札名と居住者名を構造化して登録できます。この情報は来訪者が誰を訪ねているかをAIが理解するためだけに使い、登録名、世帯構成、在宅状況を来訪者へ開示しません。
- 居住者プロフィールは外部の会話AIへ送信されます。住所、連絡先、予定、続柄、自由文メモはMVPでは保存しません。
- 音声アップロードは最大5MiB。処理後の入力音声は保存しません。

## Verification

```bash
npm run check
```

実ローカルSTT確認では、`/api/health`の`whisper`が`true`であることを確認してから、15秒以下の日本語音声でSTT時間を測定してください。SQLite利用時にNode.jsのExperimentalWarningが表示されることがあります。

## Documentation

- [Software MVP requirements](docs/mvp-requirements.md)
- [MVP architecture](docs/architecture.md)
- [UI specification](docs/design/ui-spec.md)
- [Voice MVP handoff](docs/handoff-2026-07-21-voice-mvp.md)
- [Whisper Medium switch handoff](docs/handoff-2026-07-21-whisper-medium-switch.md)

## License

Copyright (c) 2026 Shion Oba, Rui Yokokura. All Rights Reserved. See [LICENSE](LICENSE).
