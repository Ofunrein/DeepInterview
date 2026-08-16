"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { createBrowserAuth, syncSessionCookie } from "@/lib/firebase/client";
import { GoogleSignInButton } from "@/components/google-signin-button";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";

/**
 * Post-login destination. Resolve the candidate against a sentinel origin and
 * require it to stay there — this rejects absolute URLs, protocol-relative
 * `//host`, and the URL parser's backslash / control-character normalization
 * tricks (`/\evil.com`, `/%09/evil.com`) that prefix checks miss.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/setup";
  try {
    const resolved = new URL(raw, "http://internal");
    if (resolved.origin !== "http://internal") return "/setup";
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/setup";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const messages = useMessages();
  // createBrowserAuth() reads NEXT_PUBLIC_* (inlined) so this is correct
  // client-side: null means Firebase is unconfigured → dev mode.
  const auth = useMemo(() => createBrowserAuth(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Hand the ID token to the server so server components, route handlers
      // and the proxy can resolve this user on the very next navigation.
      await syncSessionCookie(await cred.user.getIdToken());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
      return;
    }
    // Read ?next= at submit time (client event) — avoids useSearchParams,
    // which would force the prerendered page into a blank Suspense shell.
    router.push(
      safeNext(new URLSearchParams(window.location.search).get("next")),
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6 py-16">
      <Eyebrow>{t(messages, "common.appName")}</Eyebrow>
      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{t(messages, "auth.loginTitle")}</CardTitle>
          <CardDescription>{t(messages, "auth.loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {auth ? (
            <>
              <GoogleSignInButton
                auth={auth}
                label={t(messages, "auth.continueWithGoogle")}
                failedLabel={t(messages, "auth.googleFailed")}
                onDone={() =>
                  router.push(
                    safeNext(
                      new URLSearchParams(window.location.search).get("next"),
                    ),
                  )
                }
              />
              <div className="my-4 flex items-center gap-3 text-[12px] text-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="email">
                    {t(messages, "auth.emailLabel")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="password">
                    {t(messages, "auth.passwordLabel")}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="text-[13px] text-ink-soft" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={busy}>
                  {busy && <Spinner className="text-white" />}
                  {t(messages, "auth.signIn")}
                </Button>
                <p className="text-[13px] text-muted">
                  {t(messages, "auth.noAccount")}{" "}
                  <Link href="/signup">{t(messages, "auth.toSignup")}</Link>
                </p>
              </form>
            </>
          ) : (
            <DevModeNotice
              notice={t(messages, "auth.devNotice")}
              cta={t(messages, "auth.devContinue")}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function DevModeNotice({ notice, cta }: { notice: string; cta: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[10px] border border-line bg-accent-soft px-3.5 py-3 text-[13px] text-ink-soft">
        {notice}
      </p>
      <Link href="/setup">
        <Button size="lg" className="w-full">
          {cta}
        </Button>
      </Link>
    </div>
  );
}
