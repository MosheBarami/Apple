"use client";

import { useState } from "react";
import { KIND_LABEL, type RenderItem, type RenderKind, RENDERS } from "@/lib/site-data";
import { cn } from "@/lib/utils";

type Tab = "all" | RenderKind;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "screen", label: KIND_LABEL.screen },
  { id: "system", label: KIND_LABEL.system },
  { id: "prop", label: KIND_LABEL.prop },
  { id: "area", label: KIND_LABEL.area },
];

const TAG: Record<RenderKind, string> = {
  screen: "bg-sky text-ink",
  system: "bg-lime text-ink",
  prop: "bg-berry-hi text-ink",
  area: "bg-teal-hi text-ink",
};

/** On a six-column grid, so a row of two, four or five fills its width. */
function span(count: number, i: number): string {
  if (count % 3 === 0) {
    return "lg:col-span-2";
  }
  if (count === 5) {
    return i < 3 ? "lg:col-span-2" : "lg:col-span-3";
  }
  return "lg:col-span-3";
}

function Card({ item, cols }: { item: RenderItem; cols: string }) {
  return (
    <li
      className={cn(
        "group window overflow-hidden bg-night fade-up hover:-translate-y-1.5 hover:shadow-[0_11px_0_var(--color-ink)]",
        cols
      )}
    >
      <figure className="m-0">
        <div className="relative aspect-[1174/623] overflow-hidden border-ink border-b-[3px] bg-night-2">
          {/* biome-ignore lint/performance/noImgElement: fixed-size static render; the host has no image optimiser */}
          <img
            alt={item.alt}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            decoding="async"
            height={340}
            loading="lazy"
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 46vw, 92vw"
            src={`/renders/${item.id}-640.webp`}
            srcSet={`/renders/${item.id}-640.webp 640w, /renders/${item.id}.webp 1174w`}
            width={640}
          />
        </div>
        <figcaption className="flex flex-col gap-1.5 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display font-semibold text-[1.2rem] text-white leading-tight">
              {item.title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-[4px] px-2 py-0.5 font-bold text-[11px] uppercase tracking-[0.06em]",
                TAG[item.kind]
              )}
            >
              {item.kind}
            </span>
          </div>
          <span className="text-[12.5px] text-white/75">
            Rendered by StudPilot's kit in Roblox Studio
          </span>
        </figcaption>
      </figure>
    </li>
  );
}

export function Gallery() {
  const [tab, setTab] = useState<Tab>("all");
  const items = RENDERS.filter((r) => (tab === "all" ? r.featured : r.kind === tab));

  return (
    <div>
      <div aria-label="Filter the renders" className="flex flex-wrap gap-2.5" role="group">
        {TABS.map((t) => (
          <button
            aria-pressed={tab === t.id}
            className={cn(
              "min-h-11 rounded-[5px] border-2 border-ink px-4 font-display font-semibold text-[1rem] transition-all duration-150",
              tab === t.id
                ? "translate-y-[2px] bg-ink text-white shadow-[0_1px_0_var(--color-ink)]"
                : "bg-white text-ink shadow-[0_4px_0_var(--color-ink)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--color-ink)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-ink)]"
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* The key restarts the entrance animation for the new set. */}
      <ul
        className="mt-9 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-6"
        key={tab}
      >
        {items.map((item, i) => (
          <Card cols={span(items.length, i)} item={item} key={item.id} />
        ))}
      </ul>
    </div>
  );
}
