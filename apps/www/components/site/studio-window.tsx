"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "egg-shop",
    label: "Egg shop",
    alt: "A Roblox Studio viewport showing an egg shop window with a featured Void Egg and five more eggs, each with a gem price.",
  },
  {
    id: "main-menu",
    label: "Main menu",
    alt: "A Roblox Studio viewport showing a game main menu with a title and three stacked buttons: Play, Settings and Shop.",
  },
  {
    id: "shop-hud",
    label: "Shop with HUD",
    alt: "A Roblox Studio viewport showing a shop window with tabs, icon tiles on the left, currency at the bottom left and a hotbar.",
  },
] as const;

/** A framed Studio window around real renders. The tabs swap the render; nothing here is a screenshot of the product. */
export function StudioWindow() {
  const [active, setActive] = useState(0);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") {
      next = (i + 1) % TABS.length;
    } else if (e.key === "ArrowLeft") {
      next = (i - 1 + TABS.length) % TABS.length;
    } else {
      return;
    }
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-[7px] border-[3px] border-ink bg-[#10173f] shadow-[0_10px_0_var(--color-ink),0_36px_60px_-20px_rgb(5_10_40/0.55)]">
        {/* title bar */}
        <div className="flex items-center gap-3 border-white/10 border-b bg-[#0b1233] px-3 py-2">
          <span aria-hidden className="flex gap-1.5">
            <i className="size-2.5 rounded-[2px] bg-berry" />
            <i className="size-2.5 rounded-[2px] bg-sun" />
            <i className="size-2.5 rounded-[2px] bg-lime" />
          </span>
          <span className="truncate text-white/80 text-xs">MyGame - Roblox Studio</span>
        </div>
        {/* viewport tabs */}
        <div
          aria-label="Renders"
          className="flex gap-px overflow-x-auto bg-[#0b1233] px-2 pt-1.5"
          role="tablist"
        >
          {TABS.map((t, i) => (
            <button
              aria-controls={`${uid}-p-${t.id}`}
              aria-selected={active === i}
              className={cn(
                "relative -mb-px whitespace-nowrap rounded-t-[4px] px-3.5 py-2 text-[13px] transition-colors duration-200",
                active === i
                  ? "bg-[#10173f] font-medium text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
              id={`${uid}-t-${t.id}`}
              key={t.id}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              tabIndex={active === i ? 0 : -1}
              type="button"
            >
              {t.label}
              {active === i ? (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-lime" />
              ) : null}
            </button>
          ))}
        </div>
        {/* the render */}
        <div className="relative aspect-[1174/623] bg-[#10173f]">
          {TABS.map((t, i) => (
            <div
              aria-labelledby={`${uid}-t-${t.id}`}
              className={cn(
                "absolute inset-0 transition-opacity duration-500 ease-out",
                active === i ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              aria-hidden={active !== i}
              id={`${uid}-p-${t.id}`}
              key={t.id}
              role="tabpanel"
            >
              {/* biome-ignore lint/performance/noImgElement: a fixed-size static render; the host has no image optimiser */}
              <img
                alt={t.alt}
                className="size-full object-cover"
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
                height={623}
                loading={i === 0 ? "eager" : "lazy"}
                sizes="(min-width: 1024px) 640px, 92vw"
                src={`/renders/${t.id}.webp`}
                srcSet={`/renders/${t.id}-640.webp 640w, /renders/${t.id}.webp 1174w`}
                width={1174}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-white/10 border-t bg-[#0b1233] px-3 py-2 text-[12px] text-white/75">
          <figcaption>Rendered by StudPilot's kit in Roblox Studio</figcaption>
        </div>
      </div>
    </figure>
  );
}
