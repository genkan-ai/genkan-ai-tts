#!/bin/sh
set -eu

MODEL_DIR="${WHISPER_MODEL_DIR:-.models/whisper}"
MODEL_NAME="${WHISPER_MODEL_NAME:-medium}"

case "$MODEL_NAME" in
  medium)
    MODEL_SHA1="fd9727b6e1217c2f614f9b698455c4ffd82463b4"
    ;;
  small)
    MODEL_SHA1="55356645c2b361a969dfd0ef2c5a50d530afd8d5"
    ;;
  *)
    echo "Unsupported Whisper model: $MODEL_NAME (supported: medium, small)"
    exit 1
    ;;
esac

MODEL_PATH="${MODEL_DIR}/ggml-${MODEL_NAME}.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL_NAME}.bin"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server was not found. Install it with: brew install whisper-cpp"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg was not found. Install it with: brew install ffmpeg"
  exit 1
fi

mkdir -p "$MODEL_DIR"

if [ -f "$MODEL_PATH" ]; then
  CURRENT_SHA1="$(shasum "$MODEL_PATH" | awk '{print $1}')"
  if [ "$CURRENT_SHA1" = "$MODEL_SHA1" ]; then
    echo "Whisper $MODEL_NAME model is already installed at $MODEL_PATH"
    exit 0
  fi
  echo "Existing model checksum does not match; refusing to overwrite $MODEL_PATH"
  exit 1
fi

TEMP_PATH="${MODEL_PATH}.download"
trap 'rm -f "$TEMP_PATH"' EXIT
curl --fail --location --progress-bar "$MODEL_URL" --output "$TEMP_PATH"

DOWNLOADED_SHA1="$(shasum "$TEMP_PATH" | awk '{print $1}')"
if [ "$DOWNLOADED_SHA1" != "$MODEL_SHA1" ]; then
  echo "Downloaded model checksum does not match the official whisper.cpp model list"
  exit 1
fi

mv "$TEMP_PATH" "$MODEL_PATH"
trap - EXIT
echo "Installed Whisper $MODEL_NAME model at $MODEL_PATH"
