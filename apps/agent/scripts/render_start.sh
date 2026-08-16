#!/bin/sh
# Render free-web start: listen on $PORT, optional Firestore SA from env JSON.
# Use the build-time venv directly. `uv run` would sync the :dev extra (ruff)
# and that failed the first deploy on a 502 from PyPI.
set -eu
if [ -n "${FIREBASE_CREDENTIALS_JSON:-}" ]; then
  printf '%s' "$FIREBASE_CREDENTIALS_JSON" > /tmp/firebase-sa.json
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
  export FIREBASE_CREDENTIALS_PATH=/tmp/firebase-sa.json
fi
export UV_NO_DEV=1
PORT="${PORT:-8000}"
if [ -x .venv/bin/uvicorn ]; then
  exec .venv/bin/uvicorn deepinterview_agent.app:app --host 0.0.0.0 --port "$PORT"
fi
exec uv run --frozen --no-dev --no-sync uvicorn deepinterview_agent.app:app --host 0.0.0.0 --port "$PORT"
