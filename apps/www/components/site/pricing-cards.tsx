import { ArrowUpRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { PLANS } from "@/lib/site-data";
import { Reveal } from "./reveal";
export function PricingCards() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((p, i) => (
        <Reveal as="li" delay={i * 60} key={p.id}>
          <article
            className={`flex h-full flex-col rounded-md border p-6 ${p.id === "free" ? "border-signal bg-signal/5" : "border-border bg-card"}`}
          >
            <p className="studio-eyebrow">
              {p.id === "free" ? "AVAILABLE IN BETA" : "COMING AFTER BETA"}
            </p>
            <h3 className="mt-5 text-lg font-medium">{p.name}</h3>
            <p className="mt-4 text-4xl font-semibold tracking-tight">
              {p.price}
              <span className="ml-2 text-xs font-normal tracking-normal text-muted-foreground">
                {p.unit}
              </span>
            </p>
            <p className="mt-5 text-sm font-medium">{p.credits}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.creditsNote}
            </p>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              {p.blurb}
            </p>
            <ul className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
              {p.features.map((f) => (
                <li className="flex gap-2" key={f}>
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-signal" />
                  {f}
                </li>
              ))}
            </ul>
            {p.id === "free" ? (
              <Link
                className="studio-button mt-7 justify-between"
                href="/login"
              >
                Start building
                <ArrowUpRightIcon className="size-4" />
              </Link>
            ) : (
              <p className="mt-auto pt-7 text-xs text-muted-foreground">
                Not available for purchase yet
              </p>
            )}
          </article>
        </Reveal>
      ))}
    </ul>
  );
}
