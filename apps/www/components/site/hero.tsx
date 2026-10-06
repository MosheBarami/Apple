import Link from "next/link";

/**
 * The hero (owner's master plan §7, 2026-10-07): a headline, one line and "Start building". Nothing else: no renders,
 * tabs, galleries, chips or captions.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-gradient-to-b from-[#52d0fb] via-[#27aef0] to-[#1788d6] text-ink"
    >
      <div
        aria-hidden
        className="studs absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-30"
        data-parallax="0.1"
      />
      <div className="mx-auto flex w-full max-w-[1000px] flex-col items-center px-5 pt-24 pb-28 text-center sm:px-8 lg:pt-32 lg:pb-36">
        <h1
          className="outline-text rise text-[46px] leading-[1.04] sm:text-[64px] lg:text-[84px]"
          id="hero-title"
          style={{ "--d": "0ms", "--sw": "10px", "--sh": "7px" } as React.CSSProperties}
        >
          A co-pilot that{" "}
          <span style={{ color: "var(--color-sun)" }}>builds</span> inside Roblox Studio
        </h1>
        <p
          className="rise mt-8 max-w-[40rem] font-medium text-[19px] leading-relaxed sm:text-[22px]"
          style={{ "--d": "120ms" } as React.CSSProperties}
        >
          Tell StudPilot what your game needs, and it builds it in your own place, step by step.
        </p>
        <div className="rise mt-10" style={{ "--d": "220ms" } as React.CSSProperties}>
          <Link className="btn-candy text-[1.3rem]" href="/login" style={{ minHeight: "3.8rem", padding: "0 2.4rem" }}>
            Start building
          </Link>
        </div>
      </div>

      {/* the ground: a lime plate with studs */}
      <div aria-hidden className="relative h-5 border-lime-edge border-t-4 bg-lime">
        <div className="studs-dark absolute inset-0 opacity-70" />
        <div className="absolute inset-x-0 top-0 h-1 bg-lime-hi" />
      </div>
    </section>
  );
}
