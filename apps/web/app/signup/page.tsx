"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { createBrowserAuth, syncSessionCookie } from "@/lib/firebase/client";
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

export default function SignupPage() {
  const router = useRouter();
  const messages = useMessages();
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
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Firebase signs the new account in immediately, so the session is live
      // and setup can proceed; the verification mail is informational (this
      // build does not gate on a verified address).
      await syncSessionCookie(await cred.user.getIdToken());
      void sendEmailVerification(cred.user).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign up.");
      setBusy(false);
      return;
    }
    router.push("/setup");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6 py-16">
      <Eyebrow>{t(messages, "common.appName")}</Eyebrow>
      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{t(messages, "auth.signupTitle")}</CardTitle>
          <CardDescription>
            {t(messages, "auth.signupSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {!auth ? (
            <DevModeNotice
              notice={t(messages, "auth.devNotice")}
              cta={t(messages, "auth.devContinue")}
            />
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="email">{t(messages, "auth.emailLabel")}</Label>
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
                  autoComplete="new-password"
                  required
                  minLength={6}
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
                {t(messages, "auth.signUp")}
              </Button>
              <p className="text-[13px] text-muted">
                {t(messages, "auth.haveAccount")}{" "}
                <Link href="/login">{t(messages, "auth.toLogin")}</Link>
              </p>
            </form>
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
