# Fish Audio公開音声固定 Handoff Pack

## Changes made

- Fish AudioのTTSエンジンを`S2.1 Pro Free`のまま固定した。
- 話者をFish Audio公開ライブラリの日本語音声「落ち着いた女性」へ固定した。
- 公開モデルIDは`0089dce5fefb4c6ba9b9f2f0debe1ddc`。
- `.env.local`、`.env.example`、サーバー既定値、要件、READMEを同じ設定に揃えた。

## Verification

- Fish Audio公式APIで対象モデルが`public`、`trained`、日本語対応であることを確認した。
- `npm run check`が成功した（lint、型検査、36単体テスト、build）。
- 実API単体で55,169 bytes、玄関AI経由で69,380 bytesのMPEG音声が返ることを確認した。
- localhostとTailscale URLの`/api/health`が全サービス`true`であることを確認した。

## Assumptions and risks

- Fish Audio上で公開されていることは、第三者による商用利用権や恒久提供を保証しない。
- MVPでは公開モデルを使用するが、製品化前に提供状況、利用規約、音声の権利関係を再確認する。
- 公開モデルが削除・非公開化された場合は、別の公開モデルIDへ差し替える必要がある。

## Rollback

- `FISH_AUDIO_REFERENCE_ID`を別の公開モデルIDへ変更する。
- 固定前のFish既定話者に戻す場合は、サーバー既定値を削除し環境変数を空にする。

## Next decision

- 琉伊が実機再生で声質と聞き取りやすさを確認する。
- Maker自身では受け入れず、Coreまたは別Codex runが差分と実音声を確認する。
