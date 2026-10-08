import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/login-form";
import { Wordmark } from "@/components/site/logo";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh flex-col bg-background text-foreground"
      id="main"
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link aria-label="StudPilot home" href="/">
          <Wordmark />
        </Link>
        <Link
          className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/docs"
        >
          Docs
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
