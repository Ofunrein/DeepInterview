"use client";

import { GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth";
import { useState } from "react";
import { syncSessionCookie } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Continue with Google" — the second enabled provider on this project.
 *
 * Popup rather than redirect so the half-filled email form behind it survives,
 * and so the flow works the same on the deployed origin as on localhost (both
 * are in Firebase Auth's authorized-domain list). On success the ID token is
 * mirrored into the server-readable cookie exactly as the password path does,
 * then the caller navigates.
 */
export function GoogleSignInButton({
  auth,
  onDone,
  label,
  failedLabel,
}: {
  auth: Auth;
  onDone: () => void;
  label: string;
  failedLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await syncSessionCookie(await cred.user.getIdToken());
    } catch (err) {
      // A closed popup is a normal user action, not an error worth shouting about.
      const code = (err as { code?: string })?.code ?? "";
      if (
        code !== "auth/popup-closed-by-user" &&
        code !== "auth/cancelled-popup-request"
      ) {
        setError(err instanceof Error ? err.message : failedLabel);
      }
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="out"
        size="lg"
        onClick={onClick}
        disabled={busy}
        className="w-full"
      >
        {busy ? <Spinner /> : <GoogleMark />}
        {label}
      </Button>
      {error && (
        <p className="text-[13px] text-ink-soft" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86a5.33 5.33 0 0 1-5-3.68H1.02v2.34A8.99 8.99 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M4 10.74a5.4 5.4 0 0 1 0-3.44V4.96H1.02a9 9 0 0 0 0 8.08L4 10.74Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 1.02 4.96L4 7.3A5.33 5.33 0 0 1 9 3.58Z"
      />
    </svg>
  );
}
