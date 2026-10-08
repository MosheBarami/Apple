// The words and numbers the website shows. The plan figures come from PLAN_TABLE and TOPUP_PACK in
// packages/shared/src/index.ts (the table the quota enforces); they are typed here because this app
// is built on its own and imports nothing outside apps/www. Change them in both places together.

export const SUPPORT_EMAIL = "support@studpilot.app";

/** STUDIO_PLUGIN_STORE_LIVE and STUDIO_PLUGIN_URL in packages/shared: the public Creator Store install
 *  path is unavailable today. Flip both places together when it is verified live again. */
export const PLUGIN_STORE_LIVE = false;
export const PLUGIN_STORE_URL = "https://create.roblox.com/store/asset/107230158271368";

export const NAV_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
] as const;

export interface Plan {
  id: "free" | "pro" | "max" | "topup";
  name: string;
  /** Price text, e.g. "$9.99". */
  price: string;
  unit: string;
  credits: string;
  creditsNote: string;
  builds: string;
  blurb: string;
  features: string[];
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
    features: ["No card needed", "The full agent, in your own place", "Undo any run with a checkpoint"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    unit: "a month",
    credits: "100 credits a month",
    creditsNote: "Up to 20 a day, refills monthly",
    builds: "About 70 builds a month",
    blurb: "For building most days.",
    features: ["Everything in Free", "About 3 times the Free monthly allowance"],
  },
  {
    id: "max",
    name: "Max",
    price: "$24.99",
    unit: "a month",
    credits: "300 credits a month",
    creditsNote: "Up to 30 a day, refills monthly",
    builds: "About 200 builds a month",
    blurb: "For long sessions and bigger systems and maps.",
    features: ["Everything in Pro", "About 10 times the Free monthly allowance"],
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
  },
];

export const BUILD_COSTS = [
  { label: "A small change", credits: "0.5 to 1.4 credits" },
  { label: "A typical request", credits: "About 1.4 credits" },
  { label: "A big system or a whole area", credits: "4 to 12 credits (an estimate)" },
] as const;

export const FAQ = [
  {
    q: "What can StudPilot do?",
    a: "Whatever you can describe for a Roblox place: interfaces, scripts and game systems, terrain and maps, models from the Creator Store, effects and sound, animation, and fixes to a game that already exists. There is no menu of things to pick from. You write what you want and the agent works out how.",
  },
  {
    q: "Do I need to know how to script?",
    a: "No. You describe what you want in plain words. What it makes lands in your own place as ordinary instances and scripts, so you can open, change or delete it like anything else you built.",
  },
  {
    q: "Can it break my place?",
    a: "Before a run changes anything, StudPilot saves a checkpoint, and Undo puts the place back to it. Each change is also an ordinary undo step in Studio.",
  },
  {
    q: "How do credits work?",
    a: "A credit is a unit of AI work. A typical request is about 1.4 credits, a small one half a credit to 1.4, and a big system or area roughly 4 to 12. Your balance shows in the composer as you write.",
  },
  {
    q: "Is it free?",
    a: "Yes, to start: the Free plan gives 5 credits a day and needs no card. StudPilot is in beta. Pro, Max and top-ups are listed so you can see the plan, but checkout is closed for now.",
  },
  {
    q: "Is it made by Roblox?",
    a: "No. StudPilot is an independent product and is not affiliated with or endorsed by Roblox Corporation. It is made for Roblox Studio.",
  },
] as const;
