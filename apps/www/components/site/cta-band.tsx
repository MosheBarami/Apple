import Link from "next/link";
import { Reveal } from "./reveal";

export function CtaBand() {
  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden border-lime-edge border-y-4 bg-gradient-to-b from-lime-hi to-lime text-ink"
    >
      <div aria-hidden className="studs-dark absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-50" data-parallax="0.1" />
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <Reveal>
          <h2 className="font-display font-bold text-[34px] leading-[1.08] md:text-[48px]" id="cta-title">
            Ready to build your next screen?
          </h2>
          <p className="mt-4 max-w-lg font-medium text-[1.1rem] leading-relaxed">
            Sign in, pair Studio with a code and ask for the first thing. The Free plan is 5 credits
            a day and needs no card.
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <Link className="btn-candy is-night text-[1.15rem]" href="/login" style={{ minHeight: "3.4rem", padding: "0 1.8rem" }}>
              Start building
            </Link>
            <Link className="btn-candy is-white text-[1.15rem]" href="/docs" style={{ minHeight: "3.4rem", padding: "0 1.6rem" }}>
              Read the docs
            </Link>
          </div>
        </Reveal>
        <Reveal className="relative hidden h-[300px] lg:block" from="right">
          {/* two real renders, tilted like cards on a table */}
          <div className="float-slow absolute top-2 right-0 w-[78%] overflow-hidden rounded-[7px] border-[3px] border-ink shadow-[0_8px_0_var(--color-ink)]" style={{ "--tilt": "3deg", "--float": "6px" } as React.CSSProperties}>
            {/* biome-ignore lint/performance/noImgElement: static render, fixed size */}
            <img alt="A game main menu with a Play, a Settings and a Shop button." className="block w-full" decoding="async" height={340} loading="lazy" src="/renders/main-menu-640.webp" width={640} />
          </div>
          <div className="float-slow absolute bottom-0 left-0 w-[66%] overflow-hidden rounded-[7px] border-[3px] border-ink shadow-[0_8px_0_var(--color-ink)]" style={{ "--tilt": "-4deg", "--float": "7px", "--float-delay": "-3s" } as React.CSSProperties}>
            {/* biome-ignore lint/performance/noImgElement: static render, fixed size */}
            <img alt="A daily quests window with three quests and Claim buttons." className="block w-full" decoding="async" height={340} loading="lazy" src="/renders/daily-quests-640.webp" width={640} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
