#!/bin/sh
set -eu

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

MODEL_PATH="${WHISPER_MODEL_PATH:-.models/whisper/ggml-medium.bin}"
LANGUAGE="${WHISPER_LANGUAGE:-ja}"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server was not found. Run: brew install whisper-cpp"
  exit 1
fi

if [ ! -f "$MODEL_PATH" ]; then
  echo "Whisper model was not found at $MODEL_PATH. Run: npm run setup:whisper"
  exit 1
fi

exec whisper-server \
  --host 127.0.0.1 \
  --port 8080 \
  --model "$MODEL_PATH" \
  --language "$LANGUAGE" \
  --convert \
  --max-context 0
