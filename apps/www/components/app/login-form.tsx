"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type Step = "choose" | "code";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(new URLSearchParams(location.search).get("error"));
  }, []);

  const callback = () => `${location.origin}/auth/callback`;

  const oauth = async (provider: "google" | "discord") => {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback() },
    });
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStep("code");
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    location.assign("/");
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-semibold text-2xl">Sign in to StudPilot</h1>
        <p className="text-muted-foreground text-sm">
          One account for the website and the chat.
        </p>
      </div>

      {step === "choose" ? (
        <div className="space-y-4">
          <div className="grid gap-2">
            <Button
              disabled={busy}
              onClick={() => oauth("google")}
              type="button"
              variant="outline"
            >
              Continue with Google
            </Button>
            <Button
              disabled={busy}
              onClick={() => oauth("discord")}
              type="button"
              variant="outline"
            >
              Continue with Discord
            </Button>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="grid gap-2" onSubmit={sendLink}>
            <Input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <Button disabled={busy || !email.trim()} type="submit">
              Email me a sign-in link
            </Button>
          </form>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={verify}>
          <p className="text-center text-sm">
            We sent a link to <strong>{email}</strong>. Open it on this device,
            or type the code from the email.
          </p>
          <Input
            autoComplete="one-time-code"
            inputMode="numeric"
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code from the email"
            value={code}
          />
          <Button disabled={busy || !code.trim()} type="submit">
            Sign in with the code
          </Button>
          <Button
            onClick={() => {
              setStep("choose");
              setCode("");
            }}
            type="button"
            variant="ghost"
          >
            Use a different email
          </Button>
        </form>
      )}

      {error ? (
        <p className="text-center text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
