import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { isFirebaseConfigured, publicEnv } from "@/lib/env";

/**
 * Browser Firebase Auth instance. Returns `null` when Firebase is not
 * configured so offline/dev rendering never crashes — callers guard on the null
 * exactly as they did on the previous provider's client.
 *
 * `initializeApp` is idempotent per name, so this is safe to call from any
 * component render.
 */
export function createBrowserAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: publicEnv.firebaseApiKey as string,
        authDomain: publicEnv.firebaseAuthDomain as string,
        projectId: publicEnv.firebaseProjectId as string,
      });
  return getAuth(app);
}

/** Cookie the server reads to resolve the signed-in user. */
export const SESSION_COOKIE = "di_id_token";

/**
 * Mirror the current Firebase ID token into the server-readable cookie.
 * Called after sign-in and on every token refresh; `null` clears it.
 */
export async function syncSessionCookie(idToken: string | null): Promise<void> {
  await fetch("/api/auth/session", {
    method: idToken ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: idToken ? JSON.stringify({ idToken }) : undefined,
  });
}
