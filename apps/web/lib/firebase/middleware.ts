import { NextResponse, type NextRequest } from "next/server";
import { gateRequest } from "@deepinterview/ee";
import { isFirebaseConfigured } from "@/lib/env";
import { SESSION_COOKIE, verifyIdToken } from "@/lib/firebase/server";

/**
 * Resolve the request's auth state, then consult the distribution gate (no-op
 * in OSS).
 *
 * The ID token cookie is VERIFIED here, not merely sniffed: a required-auth
 * distribution must fail CLOSED on a forged, expired, or revoked cookie — and
 * on missing/broken env, where `isFirebaseConfigured()` is false and the gate
 * still runs with `isAuthenticated: false`.
 *
 * Unlike the cookie-refresh dance this replaces, nothing needs to be written
 * back here: the browser SDK owns token refresh and re-posts the new token to
 * `/api/auth/session` (see components/firebase-session-sync.tsx).
 */
export async function updateSession(request: NextRequest) {
  let isAuthenticated = false;

  if (isFirebaseConfigured()) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    isAuthenticated = Boolean(await verifyIdToken(token));
  }

  // Distribution gate (no-op in OSS): pages only — API routes self-gate with
  // 401s in their handlers, a redirect-to-login is the wrong shape for them.
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/")) {
    const gate = gateRequest({ pathname, isAuthenticated });
    if (!gate.allow) {
      return NextResponse.redirect(
        new URL(gate.redirectTo ?? "/login", request.url),
      );
    }
  }

  return NextResponse.next({ request });
}
