import { cookies } from "next/headers";
import { isFirebaseConfigured, publicEnv } from "@/lib/env";

/** Cookie holding the Firebase ID token (kept in sync by the browser client). */
export const SESSION_COOKIE = "di_id_token";

/** The identity we expose to server components / route handlers. */
export type FirebaseUser = {
  id: string;
  email: string | null;
  /** Firebase Auth display name, when the account has one set. */
  name: string | null;
};

/**
 * Verify a Firebase ID token and return its owner, or `null` when the token is
 * missing, expired, revoked, or Firebase is unconfigured (offline/dev).
 *
 * Verification is delegated to Identity Toolkit's `accounts:lookup`, which
 * rejects anything not currently valid for this project — no Admin SDK and no
 * service-account credentials on the frontend, and it works in both the node
 * and edge runtimes.
 *
 * ponytail: one HTTPS round-trip per verification. If page latency matters,
 * upgrade to a local JWT verify against Google's cached signing certs
 * (`jose` + the securetoken JWKS) — same contract, no network hop.
 */
export async function verifyIdToken(
  idToken: string | undefined | null,
): Promise<FirebaseUser | null> {
  if (!idToken || !isFirebaseConfigured()) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${publicEnv.firebaseApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      users?: { localId?: string; email?: string; displayName?: string }[];
    };
    const user = json.users?.[0];
    if (!user?.localId) return null;
    return {
      id: user.localId,
      email: user.email ?? null,
      name: user.displayName ?? null,
    };
  } catch {
    // Network/parse failure must not 500 a page: treat it as "not signed in",
    // which the callers already handle (anonymous path, or the auth gate).
    return null;
  }
}

/**
 * Resolve the current authenticated user, or `null` when there is no session or
 * Firebase is not configured (offline/dev).
 */
export async function getUser(): Promise<FirebaseUser | null> {
  if (!isFirebaseConfigured()) return null;
  const cookieStore = await cookies();
  return verifyIdToken(cookieStore.get(SESSION_COOKIE)?.value);
}
