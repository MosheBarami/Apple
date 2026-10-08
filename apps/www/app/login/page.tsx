import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/login-form";
import { CreationOrbit } from "@/components/creative/creation-orbit";
import { Wordmark } from "@/components/site/logo";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden login-scene border-r border-border bg-muted/40 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="drafting-grid absolute inset-0" />
        <Link className="relative w-fit" href="/">
          <Wordmark />
        </Link>
        <div className="relative max-w-lg">
          <CreationOrbit className="login-orbit" />
          <p className="studio-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[1.1] tracking-[-0.045em]">
            A space for your
            <br />
            <span className="text-signal">next big idea.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-7 text-muted-foreground">
            Start something new. Make something better. Your Roblox Studio, with
            a creative co-pilot beside you.
          </p>
        </div>
        <p className="relative text-xs text-muted-foreground">
          StudPilot · Made for creators
        </p>
      </aside>
      <main className="flex flex-col px-6 py-8 sm:px-12" id="main">
        <Link className="mb-8 w-fit lg:hidden" href="/">
          <Wordmark />
        </Link>
        <div className="rise flex flex-1 items-center justify-center py-8">
          <LoginForm />
        </div>
        <Link
          className="mx-auto mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          href="/"
        >
          <ArrowLeftIcon className="size-3" />
          Back to StudPilot
        </Link>
      </main>
    </div>
  );
}
