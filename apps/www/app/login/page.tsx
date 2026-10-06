import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/login-form";
import { Wordmark } from "@/components/site/logo";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="surface-night grid min-h-dvh bg-background text-foreground lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden border-lime-edge border-r-4 bg-gradient-to-b from-[#52d0fb] to-[#1788d6] text-ink lg:block">
        <div aria-hidden className="studs absolute inset-0 -z-10 opacity-30" />
        <div className="flex h-full flex-col justify-between p-10">
          <Link className="w-fit rounded-md" href="/">
            <Wordmark />
          </Link>
          <div className="space-y-8">
            <h2
              className="outline-text text-[52px] leading-[1.05]"
              style={{ "--sw": "8px", "--sh": "5px" } as React.CSSProperties}
            >
              Welcome back, builder
            </h2>
          </div>
          <p className="font-medium text-sm">Free to start. 5 credits a day, no card.</p>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10" id="main">
        <Link className="mb-10 w-fit rounded-md text-foreground lg:hidden" href="/">
          <Wordmark />
        </Link>
        <div className="rise flex flex-1 items-center justify-center py-6">
          <LoginForm />
        </div>
        <Link
          className="mx-auto text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
          href="/"
        >
          Back to studpilot.app
        </Link>
      </main>
    </div>
  );
}
