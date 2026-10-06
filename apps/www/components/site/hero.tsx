import { BoxesIcon, HammerIcon, LayoutPanelTopIcon, TreePineIcon } from "lucide-react";
import Link from "next/link";
import { StudioWindow } from "./studio-window";

const CHIPS = [
  { label: "Screens", icon: LayoutPanelTopIcon, cls: "-left-3 top-[18%] sm:-left-8", tilt: "-4deg", delay: "0s", color: "bg-sun text-ink border-sun-edge" },
  { label: "Systems", icon: HammerIcon, cls: "-right-2 top-[6%] sm:-right-6", tilt: "3deg", delay: "-2s", color: "bg-lime text-ink border-lime-edge" },
  { label: "Props", icon: BoxesIcon, cls: "-left-2 bottom-[16%] sm:-left-8", tilt: "3deg", delay: "-4s", color: "bg-berry-hi text-ink border-berry-edge" },
  { label: "Areas", icon: TreePineIcon, cls: "-right-3 bottom-[22%] sm:-right-8", tilt: "-3deg", delay: "-1s", color: "bg-teal-hi text-ink border-teal-edge" },
] as const;

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
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 pt-14 pb-16 sm:px-8 lg:grid-cols-[1fr_1.12fr] lg:gap-10 lg:pt-20 lg:pb-24">
        <div className="max-w-xl">
          <p
            className="rise inline-flex items-center gap-2 rounded-[4px] border-2 border-ink bg-sun px-2.5 py-1 font-bold text-[12px] tracking-[0.08em] uppercase shadow-[0_3px_0_var(--color-ink)]"
            style={{ "--d": "0ms" } as React.CSSProperties}
          >
            Beta
            <span aria-hidden className="h-3 w-px bg-ink/40" />
            For Roblox Studio
          </p>
          <h1
            className="outline-text rise mt-5 text-[44px] leading-[1.04] sm:text-[58px] lg:text-[68px]"
            id="hero-title"
            style={{ "--d": "80ms", "--sw": "9px", "--sh": "6px" } as React.CSSProperties}
          >
            A co-pilot that{" "}
            <span style={{ color: "var(--color-sun)" }}>builds</span>{" "}
            inside Roblox Studio
          </h1>
          <p
            className="rise mt-7 max-w-[34rem] font-medium text-[18px] leading-relaxed sm:text-[20px]"
            style={{ "--d": "180ms" } as React.CSSProperties}
          >
            Tell StudPilot what you need. It makes the screens, systems, props and areas right in
            your place, and checks each step as it goes.
          </p>
          <div
            className="rise mt-8 flex flex-wrap items-center gap-4"
            style={{ "--d": "280ms" } as React.CSSProperties}
          >
            <Link className="btn-candy text-[1.2rem]" href="/login" style={{ minHeight: "3.4rem", padding: "0 1.8rem" }}>
              Start building
            </Link>
            <Link
              className="btn-candy is-white text-[1.2rem]"
              href="#gallery"
              style={{ minHeight: "3.4rem", padding: "0 1.6rem" }}
            >
              See it build
            </Link>
          </div>
          <p
            className="rise mt-6 font-medium text-[15px] text-ink/85"
            style={{ "--d": "360ms" } as React.CSSProperties}
          >
            Free to start. 5 credits a day, no card.
          </p>
        </div>

        <div
          className="rise relative mx-auto w-full max-w-[640px] lg:max-w-none"
          style={{ "--d": "220ms" } as React.CSSProperties}
        >
          <div className="float-slow" style={{ "--float": "9px" } as React.CSSProperties}>
            <StudioWindow />
          </div>
          {CHIPS.map((c) => (
            <span
              aria-hidden
              className={`float-slow absolute z-10 hidden items-center gap-1.5 rounded-[5px] border-2 px-2.5 py-1.5 font-display font-semibold text-[15px] shadow-[0_4px_0_var(--color-ink)] sm:inline-flex ${c.cls} ${c.color}`}
              key={c.label}
              style={
                {
                  "--float": "6px",
                  "--float-delay": c.delay,
                  "--tilt": c.tilt,
                } as React.CSSProperties
              }
            >
              <c.icon className="size-4" strokeWidth={2.4} />
              {c.label}
            </span>
          ))}
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
