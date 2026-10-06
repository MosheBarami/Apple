import Link from "next/link";
import { BUILD_COSTS } from "@/lib/site-data";
import { PricingCards } from "./pricing-cards";
import { Reveal } from "./reveal";

export function PricingSection({ withHeading = true }: { withHeading?: boolean }) {
  return (
    <section
      aria-label={withHeading ? undefined : "Plans and prices"}
      aria-labelledby={withHeading ? "pricing-title" : undefined}
      className="relative isolate overflow-hidden bg-ink text-white py-16 lg:py-24"
      id="pricing"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgb(31_166_224/0.35),transparent_70%)]"
      />
      <div aria-hidden className="studs absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-20" data-parallax="0.06" />
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {withHeading ? null : <h2 className="sr-only">Plans</h2>}
        {withHeading ? (
        <Reveal className="max-w-2xl">
          <p className="inline-flex items-center gap-2 font-display font-semibold text-lg text-sun">
            Pricing
            <span className="rounded-[4px] border-2 border-sun-edge bg-sun px-2 py-0.5 font-sans font-bold text-[11px] text-ink uppercase tracking-[0.08em]">
              Beta
            </span>
          </p>
          <h2 className="mt-2 font-display font-semibold text-[32px] leading-[1.1] md:text-[46px]" id="pricing-title">
            Start free. Add credits when you need more.
          </h2>
          <p className="mt-4 text-[1.05rem] text-white/85 leading-relaxed">
            StudPilot is in beta. Pro, Max and the top-up are listed so you can plan ahead, but
            checkout is off for now, so every button here takes you to sign-in.
          </p>
        </Reveal>

        ) : null}

        <div className={withHeading ? "mt-12" : ""}>
          <PricingCards />
        </div>

        <Reveal className="mt-10">
          <div className="rounded-[6px] border-[3px] border-ink bg-night-2 p-5 shadow-[0_5px_0_var(--color-ink)] sm:p-6">
            <h3 className="font-display font-semibold text-[1.2rem] text-sun">What a credit buys</h3>
            <p className="mt-1 text-[0.95rem] text-white/80">
              A credit is about $0.05 of AI compute. A build is charged for the work it used.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {BUILD_COSTS.map((c) => (
                <div className="rounded-[5px] border-2 border-ink bg-ink/60 px-4 py-3" key={c.label}>
                  <dt className="text-[0.9rem] text-white/80">{c.label}</dt>
                  <dd className="mt-1 font-display font-semibold text-[1.15rem]">{c.credits}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.9rem] text-white/80">
              More in the{" "}
              <Link className="text-lime underline decoration-2 underline-offset-4 hover:text-white" href="/docs#credits">
                credits section of the docs
              </Link>
              .
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
