import Link from "next/link";
import { Reveal } from "./reveal";

export function CtaBand() {
  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden border-lime-edge border-y-4 bg-gradient-to-b from-lime-hi to-lime text-ink"
    >
      <div aria-hidden className="studs-dark absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-50" data-parallax="0.1" />
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-5 py-16 sm:px-8 lg:py-20">
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
      </div>
    </section>
  );
}
