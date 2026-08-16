"use client";

import { useEffect } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { createBrowserAuth, syncSessionCookie } from "@/lib/firebase/client";

/**
 * Keeps the server-readable ID-token cookie in step with the browser session.
 *
 * Firebase ID tokens last one hour and the SDK refreshes them silently; without
 * this the cookie would go stale mid-session and the user would appear signed
 * out on the next server render. Renders nothing; no-op when Firebase is
 * unconfigured (offline/dev).
 */
export function FirebaseSessionSync() {
  useEffect(() => {
    const auth = createBrowserAuth();
    if (!auth) return;
    return onIdTokenChanged(auth, async (user) => {
      await syncSessionCookie(user ? await user.getIdToken() : null);
    });
  }, []);

  return null;
}
