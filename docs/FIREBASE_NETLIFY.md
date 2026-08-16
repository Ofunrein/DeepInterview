# Firebase + Netlify deployment

This fork stores sessions in **Firebase Firestore** and hosts the web app on
**Netlify**. There is no Postgres and no Supabase anywhere in the stack.

## What is already provisioned

| Piece | Value |
| --- | --- |
| GCP/Firebase project | `deepinterview-mf-2026` (number `525018911532`) |
| Firestore | Native mode, location `nam5`, collection `sessions` |
| Service account | `deepinterview-agent@deepinterview-mf-2026.iam.gserviceaccount.com`, role `roles/datastore.user` |
| Netlify site | `deepinterview-mf` → https://deepinterview-mf.netlify.app |

Firestore needs **no billing account** — Native mode runs on the free tier.

## Agent API (backend)

The session store is selected by one variable:

```bash
FIREBASE_PROJECT_ID=deepinterview-mf-2026
# Service-account JSON. Omit to use Application Default Credentials instead
# (GOOGLE_APPLICATION_CREDENTIALS locally, or the metadata server on Cloud Run).
FIREBASE_CREDENTIALS_PATH=/path/to/serviceAccount.json
FIRESTORE_COLLECTION=sessions
```

Unset `FIREBASE_PROJECT_ID` and sessions live in process memory (fine for local
dev, lost on restart). Setting credentials *without* a project id is logged as a
deployment mistake and also falls back to memory.

Install the SDK with the extra:

```bash
cd apps/agent && uv sync --extra firebase
```

Netlify hosts the frontend only. Deploy the agent API separately (Cloud Run is
the natural fit — Application Default Credentials work there with no key file)
and point the web app at it via `AGENT_API_URL`.

## Web app (Netlify)

```bash
pnpm add -D @netlify/plugin-nextjs      # already in devDependencies
netlify link --id <site-id> --filter @deepinterview/web
netlify deploy --build --prod --filter @deepinterview/web
```

`--filter` is required: the Netlify CLI otherwise prompts for which workspace
package to use and cannot run unattended.

Environment variables to set on the site:

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` | canonical/OG links |
| `AGENT_API_URL` | where the FastAPI agent runs |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | browser auth (see below) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | browser auth |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | browser auth |

## Auth

Both providers are **enabled** on this project (verified by reading the Identity
Toolkit admin config, not the console UI):

| Provider | State |
| --- | --- |
| Email/Password | enabled, password required |
| Google (`google.com`) | enabled, OAuth client auto-created in this project |

Authorized domains: `localhost`, `deepinterview-mf-2026.firebaseapp.com`,
`deepinterview-mf-2026.web.app`, `deepinterview-mf.netlify.app`. Add any new
deploy origin here or the Google popup will refuse it.

Enabling these through the API is NOT possible on the free plan:
`identityPlatform:initializeAuth` returns `BILLING_NOT_ENABLED`, because that
endpoint provisions Identity Platform (GCIP), not Firebase Auth. Firebase Auth
itself is free on Spark and is initialized by the console's own flow. Once the
console has initialized it, the admin API works normally — that is how the
Google IdP and the authorized-domain list above were verified and edited.

Sign-in design: the browser SDK holds the session; the ID token is mirrored into
an httpOnly cookie via `/api/auth/session` and verified server-side through
Identity Toolkit's `accounts:lookup`. No Admin SDK and no service-account
credentials on the frontend, so Netlify needs no privileged key, and the check
works in the edge runtime — the proxy can fail closed on a forged or expired
cookie. `components/firebase-session-sync.tsx` re-posts refreshed tokens so a
one-hour session does not silently expire. See
`apps/web/lib/firebase/server.ts` for the documented upgrade path (local JWT
verification against Google's cached certs) if the per-request round-trip ever
shows up in page latency.

## Voice stack

| Stage | Provider | Notes |
| --- | --- | --- |
| Transport | LiveKit Cloud | `LIVEKIT_URL` / key / secret |
| STT | Deepgram nova-3 | `STT_PROVIDER=deepgram` |
| TTS | Deepgram Aura-2 | `TTS_PROVIDER=deepgram`; de/en/es/fr/it/ja/nl only — vi/zh/ko fall through to ElevenLabs, then Gemini |
| LLM (live) | `gemini-3.5-flash-lite` | cheapest Flash tier, drives the real-time interviewer |
| LLM (prep/score) | `gemini-3.6-flash` | off the turn-critical path |
| Research | Tavily | `SEARCH_PROVIDER=tavily`; Exa key also present |

The LiveKit **CLI** is not installed on this machine: it is AGPL-3.0 and the
managed Homebrew wrapper refuses it under Apple's open-source policy. Nothing
depends on it — the Python SDK (`uv sync --extra livekit`) is what the worker
uses.
