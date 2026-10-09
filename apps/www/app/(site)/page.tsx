import { ArrowRightIcon, BookOpenIcon, HouseIcon, RotateCcwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentTranscript } from "@/components/site/agent-transcript";
import { PLANS } from "@/lib/site-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const EXAMPLES = [
  { area: "Interface", href: "/docs/build-an-interface", text: "Add a settings menu with music and SFX volume sliders that save between sessions." },
  { area: "Game system", href: "/docs/script-a-game-system", text: "Make a round system: 20 second intermission, teleport everyone to the arena, last player standing gets 50 coins." },
  { area: "Terrain", href: "/docs/build-a-map", text: "Turn the baseplate into a small rocky island with a sandy beach where players spawn and a low cliff to the north." },
  { area: "Creator Store", href: "/docs/creator-store-assets", text: "Find a free low-poly campfire, put it by the spawn and add a crackle you only hear up close." },
  { area: "Effects and sound", href: "/docs/vfx-and-sound", text: "When a coin is collected, play a small sparkle burst and a bright ding where it was." },
  { area: "Animation", href: "/docs/animate-a-rig", text: "Give the shopkeeper a gentle idle loop and have him wave when a player walks up." },
  { area: "Debugging", href: "/docs/fix-errors", text: "My leaderboard stops updating after a player rejoins. Find out why and fix it." },
  { area: "Existing game", href: "/docs/improve-an-existing-game", text: "Explain how saving works in this game, then add a daily login reward on top of it." },
];

const STEPS = [
  { title: "Open a project", body: "Sign in on studpilot.app and make a project for your game. It keeps that game’s chat and checkpoints." },
  { title: "Install the plugin once", body: "Add the StudPilot plugin to Roblox Studio. It stays there for every place you open." },
  { title: "Click Connect", body: "With your place open in Studio, click Connect in the project. No codes to copy." },
  { title: "Describe it and watch", body: "Say what you want. The agent thinks out loud, checks the Roblox docs and builds in your place as you watch." },
];

const TRUST = [
  {
    Icon: RotateCcwIcon,
    title: "Every run can be undone",
    body: "A checkpoint is saved before anything changes. One click puts your place back, and each change is a normal Studio undo step too.",
  },
  {
    Icon: HouseIcon,
    title: "Your place stays yours",
    body: "What it builds is ordinary instances and scripts in your place. It never publishes your game or touches a place you did not connect, and it uploads art or sound only to your own Roblox account, only if you allow it.",
  },
  {
    Icon: BookOpenIcon,
    title: "It checks the official docs",
    body: "When it needs to know how Roblox works, it searches the Creator Documentation while it builds, and cites the pages it used.",
  },
];

export default function Home() {
  return (
    <>
      <section className="site-container grid grid-cols-[minmax(0,1fr)] items-start gap-12 pt-16 pb-20 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16 lg:pt-28 lg:pb-28">
        <div className="max-w-[620px] lg:pt-6">
          <p className="font-mono text-[12.5px] text-muted-foreground">AI for Roblox Studio</p>
          <h1 className="mt-5 text-balance font-semibold text-[44px] leading-[1.02] tracking-[-0.045em] sm:text-[64px] lg:text-[68px]">
            Describe it. Watch it get built.
          </h1>
          <p className="mt-6 max-w-[34em] text-pretty text-[17px] text-muted-foreground leading-relaxed sm:text-[19px]">
            StudPilot is an AI agent that does whatever you can put into words, right inside your place in Roblox Studio.
            Interfaces, systems, maps, effects, fixes. Every change is yours to keep or undo.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-5 font-medium text-[15px] text-primary-foreground transition-opacity duration-150 hover:opacity-85"
              href="/app"
            >
              Start building
              <ArrowRightIcon className="size-4" />
            </a>
            <Link
              className="inline-flex h-11 items-center rounded-[10px] border bg-card px-5 font-medium text-[15px] transition-colors duration-150 hover:bg-accent"
              href="/docs"
            >
              Read the docs
            </Link>
          </div>
          <p className="mt-5 text-[13.5px] text-muted-foreground">Free to start with 5 credits a day. No card needed.</p>
        </div>
        <AgentTranscript className="w-full" />
      </section>

      <section className="border-t" id="product">
        <div className="site-container py-20 sm:py-28">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
            <h2 className="text-balance font-semibold text-[32px] leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
              Anything you can describe.
            </h2>
            <p className="max-w-[36em] text-pretty text-[17px] text-muted-foreground leading-relaxed lg:pt-2">
              There is no menu of things it can make, and no mode to pick. You talk to one agent. It reads your place,
              works out what you mean, and does it, whether that is a whole system or one stubborn bug. A few things people ask for:
            </p>
          </div>
          <ul className="mt-14 grid border-t sm:grid-cols-2">
            {EXAMPLES.map((ex, i) => (
              <li className={`border-b ${i % 2 === 0 ? "sm:border-r sm:pr-10" : "sm:pl-10"}`} key={ex.area}>
                <Link className="group block py-7" href={ex.href}>
                  <p className="text-pretty text-[18px] leading-snug tracking-[-0.01em] sm:text-[20px]">&ldquo;{ex.text}&rdquo;</p>
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
                    {ex.area}
                    <ArrowRightIcon className="size-3 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t bg-card" id="how">
        <div className="site-container py-20 sm:py-28">
          <h2 className="max-w-[18ch] text-balance font-semibold text-[32px] leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
            From a sentence to your place in Studio.
          </h2>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-[14px] border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li className="bg-card p-6 sm:p-7" key={step.title}>
                <span className="font-mono text-[13px] text-muted-foreground">0{i + 1}</span>
                <h3 className="mt-10 font-semibold text-[18px] tracking-[-0.02em]">{step.title}</h3>
                <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[14px] text-muted-foreground">
            The work happens in Studio; the app is where you ask and follow along.{" "}
            <Link className="text-foreground underline decoration-border underline-offset-4 hover:decoration-brand" href="/docs">
              Read the getting started guide
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t">
        <div className="site-container py-20 sm:py-28">
          <h2 className="max-w-[20ch] text-balance font-semibold text-[32px] leading-[1.08] tracking-[-0.035em] sm:text-[44px]">
            Built to be trusted with your game.
          </h2>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {TRUST.map(({ Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-foreground" strokeWidth={1.75} />
                <h3 className="mt-5 font-semibold text-[18px] tracking-[-0.02em]">{title}</h3>
                <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="site-container py-20 sm:py-28">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-semibold text-[32px] leading-[1.08] tracking-[-0.035em] sm:text-[44px]">Simple pricing.</h2>
              <p className="mt-4 max-w-[34em] text-[17px] text-muted-foreground leading-relaxed">
                Pay for the work the agent does, in credits. A typical request is about 1.4. Every plan gets the same agent.
              </p>
            </div>
            <Link className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[15px] hover:underline hover:underline-offset-4" href="/pricing">
              See pricing <ArrowRightIcon className="size-4" />
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border bg-border lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div className="bg-card p-5 sm:p-6" key={plan.id}>
                <p className="font-medium text-[14px]">{plan.name}</p>
                <p className="mt-4 font-semibold text-[28px] tracking-[-0.03em] sm:text-[32px]">
                  {plan.price}
                  {plan.unit ? <span className="ml-1 font-normal text-[13px] text-muted-foreground tracking-normal">{plan.unit === "once" ? "once" : "/ month"}</span> : null}
                </p>
                <p className="mt-2 text-[14px] text-muted-foreground">{plan.credits}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13.5px] text-muted-foreground">StudPilot is in beta. Paid plans are listed so you can see them; checkout is closed for now.</p>
        </div>
      </section>

      <section className="border-t bg-primary text-primary-foreground dark:bg-card dark:text-foreground">
        <div className="site-container flex flex-col items-start gap-8 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-[16ch] text-balance font-semibold text-[36px] leading-[1.05] tracking-[-0.04em] sm:text-[52px]">
            Open Studio. Say what you want.
          </h2>
          <a
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary-foreground px-5 focus-visible:outline-primary-foreground font-medium text-[15px] text-primary dark:bg-primary dark:text-primary-foreground dark:focus-visible:outline-ring transition-opacity duration-150 hover:opacity-90"
            href="/app"
          >
            Start building free
            <ArrowRightIcon className="size-4" />
          </a>
        </div>
      </section>
    </>
  );
}
