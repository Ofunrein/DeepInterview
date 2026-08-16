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

## Auth: one manual step remains

Sign-in is wired end to end (email/password via the Firebase browser SDK → ID
token → httpOnly cookie → server-side verification through Identity Toolkit),
but the **email/password provider is not enabled on the project yet**. Enabling
it via the API (`identityPlatform:initializeAuth`) returns:

```
BILLING_NOT_ENABLED : Identity Platform feature requires billing to be enabled.
```

Two ways forward:

1. Enable **Authentication → Sign-in method → Email/Password** once in the
   Firebase console (free tier, no billing needed), or
2. attach an open billing account and re-run the API call.

Until then, leave the three `NEXT_PUBLIC_FIREBASE_*` variables **unset**: the app
runs its anonymous path (no sign-in required), which is the OSS default. Setting
them earlier would render a sign-in form that cannot succeed.

The auth design uses no Admin SDK on the frontend — tokens are verified against
Identity Toolkit, so Netlify needs no service-account credentials. See
`apps/web/lib/firebase/server.ts` for the verification helper and its documented
upgrade path (local JWT verification against Google's cached certs) if the
per-request round-trip ever shows up in page latency.
