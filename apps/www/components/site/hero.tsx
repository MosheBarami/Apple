import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { CreationOrbit } from "@/components/creative/creation-orbit";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="studio-hero relative overflow-hidden border-b border-border"
    >
      <CreationOrbit className="hero-orbit" />
      <div className="relative mx-auto max-w-5xl px-6 pt-52 pb-24 text-center sm:pt-64 sm:pb-28">
        <h1
          className="rise text-balance text-[clamp(3rem,6.8vw,6rem)] font-semibold leading-[1.03] tracking-[-0.065em]"
          id="hero-title"
        >
          Your next idea.
          <br />
          <span className="creative-title">Built in Studio.</span>
        </h1>
        <p
          className="rise mx-auto mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          style={{ animationDelay: "80ms" }}
        >
          A creative co-pilot for your Roblox game. Describe what you want to
          build or change, and work on it together.
        </p>
        <Link
          className="studio-button rise mt-9 inline-flex gap-3"
          href="/login"
          style={{ animationDelay: "160ms" }}
        >
          Start building <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>
    </section>
  );
}
