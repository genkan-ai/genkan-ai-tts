#!/bin/sh
set -eu

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale was not found. Install and connect Tailscale first."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq was not found."
  exit 1
fi

TAILSCALE_HOST=$(tailscale status --json | jq -r '.Self.DNSName // "" | sub("\\.$"; "")')
if [ -z "$TAILSCALE_HOST" ]; then
  echo "Tailscale DNS name could not be detected."
  exit 1
fi

export GENKAN_ALLOWED_HOST="$TAILSCALE_HOST"
exec vite
