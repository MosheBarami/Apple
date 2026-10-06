// The words and numbers the website shows. The plan figures come from PLAN_TABLE and TOPUP_PACK in
// packages/shared/src/index.ts (the table the quota enforces); they are typed here because this app
// is built on its own and imports nothing outside apps/www. Change them in both places together.

export const SUPPORT_EMAIL = "support@studpilot.app";

export const NAV_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
] as const;

export interface Plan {
  id: "free" | "pro" | "max" | "topup";
  name: string;
  /** Price text before the unit, e.g. "$9.99". */
  price: string;
  unit: string;
  credits: string;
  creditsNote: string;
  builds: string;
  blurb: string;
  features: string[];
  cta: string;
  /** The candy colour family of the card header. */
  tone: "lime" | "sky" | "sun" | "teal";
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    unit: "",
    credits: "5 credits a day",
    creditsNote: "Up to 30 a month",
    builds: "About 20 builds a month",
    blurb: "Enough to build something real and see if StudPilot is for you.",
    features: [
      "No card needed",
      "Pair Studio and build",
      "Undo any run with a checkpoint",
    ],
    cta: "Start free",
    tone: "lime",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    unit: "a month",
    credits: "100 credits a month",
    creditsNote: "Refills every month",
    builds: "About 70 builds a month",
    blurb: "For building most days.",
    features: ["Everything in Free", "About 3 times the Free monthly allowance"],
    cta: "Sign in to start",
    tone: "sky",
  },
  {
    id: "max",
    price: "$24.99",
    name: "Max",
    unit: "a month",
    credits: "300 credits a month",
    creditsNote: "Refills every month",
    builds: "About 200 builds a month",
    blurb: "For long sessions and bigger systems and areas.",
    features: ["Everything in Pro", "About 10 times the Free monthly allowance"],
    cta: "Sign in to start",
    tone: "sun",
  },
  {
    id: "topup",
    name: "Top-up",
    price: "$4.99",
    unit: "once",
    credits: "50 credits",
    creditsNote: "They do not expire",
    builds: "About 35 builds",
    blurb: "A one-time pack for when you run out.",
    features: ["Added on top of your plan", "Used after your daily credits"],
    cta: "Sign in to start",
    tone: "teal",
  },
];

export const BUILD_COSTS = [
  { label: "Small build", credits: "0.5 to 1.4 credits" },
  { label: "Typical build", credits: "about 1.4 credits" },
  { label: "Big build: a system or an area", credits: "4 to 12 credits (an estimate)" },
] as const;

export type RenderKind = "screen" | "system" | "prop" | "area";

export interface RenderItem {
  id: string;
  title: string;
  kind: RenderKind;
  alt: string;
  /** Shown on the "All" tab. */
  featured: boolean;
}

export const KIND_LABEL: Record<RenderKind, string> = {
  screen: "Screens",
  system: "Systems",
  prop: "Props",
  area: "Areas",
};

export const RENDERS: RenderItem[] = [
  { id: "egg-shop", title: "Egg shop", kind: "screen", featured: true, alt: "An egg shop window with a featured Void Egg and five more eggs, each with a gem price." },
  { id: "main-menu", title: "Main menu", kind: "screen", featured: true, alt: "A game main menu with a title and three stacked buttons: Play, Settings and Shop." },
  { id: "gamepasses", title: "Gamepasses", kind: "screen", featured: true, alt: "A gamepass window with a featured double-coins pass and three smaller passes with prices." },
  { id: "shop-hud", title: "Shop with a HUD", kind: "screen", featured: false, alt: "A shop window with tabs at the top, icon tiles on the left, currency at the bottom left and a hotbar." },
  { id: "inventory", title: "Inventory grid", kind: "screen", featured: true, alt: "An inventory window with a grid of animal cards, each with a rarity and an Equip button." },
  { id: "daily-quests", title: "Daily quests", kind: "system", featured: true, alt: "A daily quests window with three quests, progress bars and Claim buttons." },
  { id: "daily-rewards", title: "Daily rewards", kind: "system", featured: true, alt: "A seven-day rewards window with claimed days, today's reward and locked days." },
  { id: "upgrades", title: "Upgrades", kind: "system", featured: true, alt: "An upgrades window with four upgrades, each with a level, a progress bar and a price." },
  { id: "rebirth", title: "Rebirth", kind: "system", featured: false, alt: "A rebirth window showing the current and next multiplier, a cost and a progress bar." },
  { id: "park-props", title: "Park props", kind: "prop", featured: true, alt: "Blocky trees, a rock, two benches and a lamp post standing on studded grass." },
  { id: "park-wide", title: "Props in place", kind: "prop", featured: false, alt: "A wide view of a small park: a clump of trees, benches and a flag on a green baseplate." },
  { id: "pet-shop-area", title: "Pet shop area", kind: "area", featured: true, alt: "A brick path leading to a striped market stall under a Pet Shop sign, with a flower bed beside it." },
  { id: "pet-shop-wide", title: "Pet shop, wide", kind: "area", featured: false, alt: "A wide view of the pet shop area ringed by rounded green hills under a blue sky." },
];

export const FAQ = [
  {
    q: "What does StudPilot build?",
    a: "Parts of your game, inside the place you connect: screens such as menus, shops and HUDs, systems such as rewards and quests, props, and small areas. It is a co-pilot for your game. It does not turn one sentence into a finished game.",
  },
  {
    q: "Do I need to know how to script?",
    a: "No. You describe what you want in plain words. Everything it makes lands in your own place, where you can open it, change it or delete it like anything else you built.",
  },
  {
    q: "Can it break my place?",
    a: "Edits start switched off for every new connection, and you turn them on yourself. Before a run changes anything, StudPilot saves a checkpoint, and Undo changes puts the place back to it. Each change is also a normal undo step in Studio.",
  },
  {
    q: "How do credits work?",
    a: "A credit is a unit of AI work. A typical build is about 1.4 credits, a small one about half a credit to 1.4, and a big system or area roughly 4 to 12. Your balance shows in the app with two decimals.",
  },
  {
    q: "Is it free?",
    a: "Yes, to start: the Free plan gives 5 credits a day and needs no card. StudPilot is in beta. Pro, Max and top-ups are listed so you can see the plan, but checkout is off for now.",
  },
  {
    q: "How do I get the Studio plugin?",
    a: "StudPilot works through a plugin that pairs with a 6-character code. Its Creator Store listing is not available at the moment, so it cannot be installed by everyone yet. The chat on this site works without it. The docs say what is open today.",
  },
  {
    q: "Is it made by Roblox?",
    a: "No. StudPilot is an independent product and is not affiliated with or endorsed by Roblox Corporation. It is made for Roblox Studio.",
  },
] as const;
