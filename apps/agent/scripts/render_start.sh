#!/bin/sh
# Render free-web start: listen on $PORT, optional Firestore SA from env JSON.
set -eu
if [ -n "${FIREBASE_CREDENTIALS_JSON:-}" ]; then
  printf '%s' "$FIREBASE_CREDENTIALS_JSON" > /tmp/firebase-sa.json
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
  export FIREBASE_CREDENTIALS_PATH=/tmp/firebase-sa.json
fi
exec uv run uvicorn deepinterview_agent.app:app --host 0.0.0.0 --port "${PORT:-8000}"
