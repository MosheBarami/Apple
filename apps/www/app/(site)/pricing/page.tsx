import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BUILD_COSTS, FAQ, PLANS } from "@/lib/site-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with 5 credits a day. Every plan gets the same agent; paying changes your allowance.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <section className="site-container pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[12.5px] text-muted-foreground">Pricing</p>
        <h1 className="mt-5 max-w-[16ch] text-balance font-semibold text-[40px] leading-[1.04] tracking-[-0.045em] sm:text-[60px]">
          Start free. Pay for more work, not more features.
        </h1>
        <p className="mt-6 max-w-[38em] text-pretty text-[17px] text-muted-foreground leading-relaxed sm:text-[19px]">
          Every plan gets the same agent, in your own place, with every run undoable. Plans differ only in how many credits you get.
        </p>
      </section>

      <section className="site-container pb-6">
        <div className="grid gap-px overflow-hidden rounded-[14px] border bg-border md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const free = plan.id === "free";
            return (
              <article className={cn("flex flex-col bg-card p-6 sm:p-7", free && "bg-background")} key={plan.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-[18px] tracking-[-0.02em]">{plan.name}</h2>
                  {free ? <span className="font-mono text-[11.5px] text-brand">Available now</span> : null}
                </div>
                <p className="mt-2 min-h-[3em] text-[14.5px] text-muted-foreground leading-snug">{plan.blurb}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-semibold text-[40px] leading-none tracking-[-0.04em]">{plan.price}</span>
                  <span className="text-[14px] text-muted-foreground">{plan.unit === "once" ? "once" : plan.unit ? "a month" : ""}</span>
                </p>
                <div className="mt-6 border-t pt-5">
                  <p className="font-medium text-[15px]">{plan.credits}</p>
                  <p className="mt-1 text-[13.5px] text-muted-foreground">{plan.creditsNote}</p>
                  <p className="mt-1 text-[13.5px] text-muted-foreground">{plan.builds}</p>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li className="flex gap-2.5 text-[14.5px]" key={f}>
                      <CheckIcon className="mt-[3px] size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                      {f}
                    </li>
                  ))}
                </ul>
                {free ? (
                  <a
                    className="mt-8 inline-flex h-10 items-center justify-center rounded-[10px] bg-primary font-medium text-[14.5px] text-primary-foreground transition-opacity duration-150 hover:opacity-85"
                    href="/app"
                  >
                    Start free
                  </a>
                ) : (
                  <p className="mt-8 inline-flex h-10 items-center justify-center rounded-[10px] border border-dashed text-[14px] text-muted-foreground">
                    Available after beta
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <p className="mt-4 text-[13.5px] text-muted-foreground">
          StudPilot is in beta. Paid plans and top-ups are listed so you can see them; checkout is closed for now. Prices in US dollars.
        </p>
      </section>

      <div className="border-t"><section className="site-container grid gap-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
        <div>
          <h2 className="font-semibold text-[28px] leading-[1.1] tracking-[-0.035em] sm:text-[36px]">What a request costs</h2>
          <p className="mt-4 max-w-[30em] text-[16px] text-muted-foreground leading-relaxed">
            A credit is a unit of AI work. Runs are charged for the work they actually do, and your balance shows in the composer as you
            write. A run that fails without changing your place gives its credits back.
          </p>
          <Link className="mt-5 inline-block text-[15px] underline decoration-border underline-offset-4 hover:decoration-brand" href="/docs/credits-and-limits">
            How credits work
          </Link>
        </div>
        <dl className="divide-y border-y">
          {BUILD_COSTS.map((row) => (
            <div className="flex items-baseline justify-between gap-6 py-5" key={row.label}>
              <dt className="text-[16px]">{row.label}</dt>
              <dd className="text-right font-mono text-[14px] text-muted-foreground">{row.credits}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-6 py-5">
            <dt className="text-[16px]">Daily reset</dt>
            <dd className="text-right font-mono text-[14px] text-muted-foreground">Midnight UTC</dd>
          </div>
        </dl>
      </section></div>

      <div className="border-t"><section className="site-container grid gap-10 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
        <h2 className="font-semibold text-[28px] leading-[1.1] tracking-[-0.035em] sm:text-[36px]">Questions</h2>
        <div className="border-t">
          {FAQ.map((item) => (
            <details className="group border-b" key={item.q}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="-mt-1 pb-6 text-[15.5px] text-muted-foreground leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section></div>
    </>
  );
}
