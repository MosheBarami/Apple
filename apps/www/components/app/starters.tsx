"use client";

import {
  CoinsIcon,
  GiftIcon,
  LayoutPanelTopIcon,
  type LucideIcon,
  SearchIcon,
  StoreIcon,
  TreePineIcon,
} from "lucide-react";

export interface Starter {
  icon: LucideIcon;
  title: string;
  text: string;
}

/** Example requests on the empty chat. Each one is sent as written. */
export const STARTERS: Starter[] = [
  {
    icon: LayoutPanelTopIcon,
    title: "A shop screen",
    text: "Build a shop screen with three items and a Buy button on each",
  },
  {
    icon: GiftIcon,
    title: "Daily rewards",
    text: "Make a daily rewards screen with seven days and a Claim button",
  },
  {
    icon: CoinsIcon,
    title: "A coin counter",
    text: "Add a coin counter at the top of the screen that updates when I collect coins",
  },
  {
    icon: TreePineIcon,
    title: "Park props",
    text: "Place a few trees, two benches and a lamp post near the spawn",
  },
  {
    icon: StoreIcon,
    title: "A market area",
    text: "Build a small market area with two stalls and a path leading to it",
  },
  {
    icon: SearchIcon,
    title: "Look around",
    text: "What is in my place?",
  },
];

export function StarterGrid({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {STARTERS.map((s, i) => (
        <li
          className="fade-up"
          key={s.title}
          style={{ animationDelay: `${120 + i * 55}ms` }}
        >
          <button
            className="group flex h-full w-full flex-col gap-1.5 rounded-md border border-border bg-card p-3.5 text-left shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-float active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={() => onPick(s.text)}
            type="button"
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              <s.icon
                aria-hidden
                className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
              />
              {s.title}
            </span>
            <span className="text-muted-foreground text-[13px] leading-snug">
              {s.text}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
