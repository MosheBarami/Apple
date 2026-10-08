"use client";

import Link from "next/link";
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

  const fail = (err: unknown) =>
    setError(
      err instanceof Error
        ? err.message
        : "Could not connect. Please try again."
    );
  const oauth = async (provider: "google" | "discord") => {
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase().auth.signInWithOAuth({
        options: { redirectTo: callback() },
        provider,
      });
      if (err) {
        throw err;
      }
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };
  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback() },
      });
      if (err) {
        throw err;
      }
      setStep("code");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (err) {
        throw err;
      }
      location.assign("/app");
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-7">
      <div className="space-y-2">
        <h1 className="font-display font-semibold text-[2rem] leading-tight">
          Sign in to StudPilot
        </h1>
        <p className="text-muted-foreground">
          Your ideas and projects, all in one place. New here? We’ll create an
          account when you sign in.
        </p>
      </div>

      {step === "choose" ? (
        <div className="space-y-5">
          <div className="grid gap-3">
            <Button
              className="h-11 text-[0.95rem]"
              disabled={busy}
              onClick={() => oauth("google")}
              type="button"
              variant="outline"
            >
              Continue with Google
            </Button>
            <Button
              className="h-11 text-[0.95rem]"
              disabled={busy}
              onClick={() => oauth("discord")}
              type="button"
              variant="outline"
            >
              Continue with Discord
            </Button>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-[0.12em]">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="grid gap-3" onSubmit={sendLink}>
            <label className="sr-only" htmlFor="login-email">
              Email address
            </label>
            <Input
              autoComplete="email"
              className="h-11 text-base"
              id="login-email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !email.trim()}
              type="submit"
            >
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={verify}>
          <p className="text-sm leading-relaxed">
            We sent a link to <strong>{email}</strong>. Open it on this device,
            or type the code from the email.
          </p>
          <label className="sr-only" htmlFor="login-code">
            Code from the email
          </label>
          <Input
            autoComplete="one-time-code"
            className="h-11 text-base tracking-widest"
            id="login-code"
            inputMode="numeric"
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code from the email"
            value={code}
          />
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !code.trim()}
            type="submit"
          >
            {busy ? "Signing in…" : "Sign in with the code"}
          </button>
          <Button
            disabled={busy}
            onClick={() => {
              setError(null);
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
        <p
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs leading-relaxed">
        By continuing you agree to the{" "}
        <Link
          className="underline underline-offset-4 hover:text-foreground"
          href="/terms"
        >
          Terms
        </Link>{" "}
        and the{" "}
        <Link
          className="underline underline-offset-4 hover:text-foreground"
          href="/privacy"
        >
          Privacy Policy
        </Link>
        . StudPilot is for people 13 and older.
      </p>
    </div>
  );
}
