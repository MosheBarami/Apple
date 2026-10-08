"use client";
import {
  ArrowUpLeftIcon,
  CoinsIcon,
  LayoutPanelTopIcon,
  type LucideIcon,
  SearchIcon,
  TreePineIcon,
  Wand2Icon,
  WrenchIcon,
} from "lucide-react";
export interface Starter {
  category: string;
  icon: LucideIcon;
  text: string;
  title: string;
}
export const STARTERS: Starter[] = [
  {
    category: "Interfaces",
    icon: LayoutPanelTopIcon,
    text: "Build a shop screen with three items. Ask me which currency to use before connecting purchases.",
    title: "Design a shop",
  },
  {
    category: "Mechanics",
    icon: CoinsIcon,
    text: "Add a coin counter that updates when the player collects coins. Check how my current currency works first.",
    title: "Add a coin counter",
  },
  {
    category: "Worlds",
    icon: TreePineIcon,
    text: "Place a few trees, two benches and a lamp post near the spawn, leaving the paths clear.",
    title: "Shape a small world",
  },
];
export const EDIT_STARTERS: Starter[] = [
  {
    category: "Understand",
    icon: SearchIcon,
    text: "Inspect my current place and explain what is already there before changing anything.",
    title: "Explore my project",
  },
  {
    category: "Improve",
    icon: Wand2Icon,
    text: "Review the layout of my existing shop. Suggest changes to spacing and mobile readability before editing it.",
    title: "Refine an interface",
  },
  {
    category: "Repair",
    icon: WrenchIcon,
    text: "Help me diagnose a mechanic in my current place. Ask me what is going wrong before making changes.",
    title: "Fix a mechanic",
  },
];
export function StarterGrid({
  onPick,
  disabled,
  mode = "create",
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
  mode?: "create" | "edit";
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {(mode === "edit" ? EDIT_STARTERS : STARTERS).map((s, i) => (
        <li
          className="fade-up"
          key={s.title}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <button
            className="prompt-tile group flex h-full w-full flex-col gap-5 rounded-md border border-border bg-card/70 p-4 text-left transition duration-200 hover:-translate-y-1 hover:border-signal/40 hover:shadow-md disabled:opacity-50"
            disabled={disabled}
            onClick={() => onPick(s.text)}
            type="button"
          >
            <div className="flex w-full items-center justify-between">
              <span className="prompt-object">
                <s.icon className="size-6" strokeWidth={1.5} />
              </span>
              <ArrowUpLeftIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </div>
            <div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {s.category}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
