import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";
export function CtaBand() {
  return (
    <section className="border-y border-border bg-signal/5 py-20">
      <Reveal className="mx-auto max-w-[1200px] px-6 sm:px-8">
        <p className="studio-eyebrow">Make something yours</p>
        <h2 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          What will you build next?
        </h2>
        <p className="mt-5 text-muted-foreground">
          Open a conversation. Bring your ideas. Keep creating.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Link className="studio-button" href="/login">
            Start building
            <ArrowUpRightIcon className="size-4" />
          </Link>
          <Link className="text-sm font-medium" href="/docs">
            Read the docs →
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
