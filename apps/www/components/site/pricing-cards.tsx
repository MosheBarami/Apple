import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { PLANS, type Plan } from "@/lib/site-data";
import { Reveal } from "./reveal";

const TONE: Record<Plan["tone"], { bar: string; btn: string }> = {
  lime: {
    bar: "[--bar-hi:var(--color-lime-hi)] [--bar-lo:var(--color-lime)] [--bar-edge:var(--color-lime-edge)]",
    btn: "",
  },
  sky: {
    bar: "[--bar-hi:var(--color-sky-hi)] [--bar-lo:var(--color-sky)] [--bar-edge:var(--color-sky-edge)]",
    btn: "is-white",
  },
  sun: {
    bar: "[--bar-hi:var(--color-sun-hi)] [--bar-lo:var(--color-sun-deep)] [--bar-edge:var(--color-sun-edge)]",
    btn: "is-white",
  },
  teal: {
    bar: "[--bar-hi:var(--color-teal-hi)] [--bar-lo:var(--color-teal)] [--bar-edge:var(--color-teal-edge)]",
    btn: "is-white",
  },
};

function PlanCard({ plan }: { plan: Plan }) {
  const tone = TONE[plan.tone];
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`window group flex h-full flex-col hover:-translate-y-1.5 hover:shadow-[0_12px_0_var(--color-ink)] ${tone.bar}`}
    >
      <header className="window-bar studs px-5 pt-4 pb-3">
        <h3 className="font-display font-semibold text-[1.4rem] text-ink leading-none" id={`plan-${plan.id}`}>
          {plan.name}
        </h3>
      </header>
      <div className="flex flex-1 flex-col p-5 text-white">
        <p className="flex items-baseline gap-2">
          <span className="font-display font-bold text-[2.6rem] leading-none">{plan.price}</span>
          {plan.unit ? <span className="text-[0.95rem] text-white/80">{plan.unit}</span> : null}
        </p>
        <p className="mt-3 font-display font-semibold text-[1.15rem] text-sun">{plan.credits}</p>
        <p className="min-h-5 text-[0.9rem] text-white/75">{plan.creditsNote}</p>
        <p className="mt-1 text-[0.9rem] text-white/85">{plan.builds}</p>
        <p className="mt-4 text-[0.95rem] text-white/90 leading-relaxed">{plan.blurb}</p>
        <ul className="mt-4 space-y-2 border-white/15 border-t pt-4 text-[0.95rem]">
          {plan.features.map((f) => (
            <li className="flex items-start gap-2.5" key={f}>
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] bg-lime text-ink">
                <CheckIcon className="size-3.5" strokeWidth={3.2} />
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <Link className={`btn-candy mt-6 w-full ${tone.btn}`} href="/login">
          {plan.cta}
        </Link>
        {plan.id === "free" ? null : (
          <p className="mt-3 text-center text-[0.8rem] text-white/70">Checkout opens after the beta</p>
        )}
      </div>
    </article>
  );
}

export function PricingCards() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((p, i) => (
        <Reveal as="li" delay={i * 90} key={p.id}>
          <PlanCard plan={p} />
        </Reveal>
      ))}
    </ul>
  );
}
