// Example requests shown by the website (components/site/how-it-works.tsx). The app has no prompt library.
import {
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
