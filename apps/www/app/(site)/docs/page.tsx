import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/page-header";
import { BUILD_COSTS, SUPPORT_EMAIL } from "@/lib/site-data";

export const metadata: Metadata = {
  alternates: { canonical: "/docs" },
  description:
    "How to pair Roblox Studio with StudPilot, what it can build, and how credits work.",
  title: "Docs",
};

const TOC = [
  { id: "pair", label: "Pair Studio" },
  { id: "build", label: "What it can build" },
  { id: "credits", label: "Credits" },
] as const;

export default function DocsPage() {
  return (
    <>
      <PageHeader kicker="Docs" title="Pair, build, and keep an eye on credits">
        One page with everything you need to start: how to connect Studio, what
        StudPilot can make, and how credits work.
      </PageHeader>

      <div className="bg-background py-12 lg:py-20">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-[220px_1fr] lg:gap-16">
          <nav
            aria-label="On this page"
            className="lg:sticky lg:top-24 lg:self-start"
          >
            <p className="mb-3 font-sans font-semibold text-[#0b5fa3] text-lg">
              On this page
            </p>
            <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    className="block whitespace-nowrap rounded-[5px] border border-border bg-white px-3.5 py-2 font-medium text-[0.95rem] text-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-muted hover:shadow-sm active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-ink)]"
                    href={`#${t.id}`}
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="longform max-w-[760px]">
            <h2 id="pair">Pair Studio</h2>
            <p>
              Pairing links one Roblox Studio window to one StudPilot chat.
              Until you pair, the plugin does nothing and StudPilot cannot see
              your place.
            </p>
            <ol className="mb-6 list-decimal space-y-3 pl-6 marker:font-bold marker:text-[#0b5fa3]">
              <li>
                <Link href="/login">Sign in</Link> and start a chat.
              </li>
              <li>
                Open your place in Roblox Studio, then open StudPilot from the
                Plugins tab. The panel says Not connected.
              </li>
              <li>
                In the chat, press <strong>Connect Studio</strong> at the top.
                You get a 6-character code, like <code>K7M3QP</code>.
              </li>
              <li>
                Type the code into the panel and press Connect. The light at the
                top of the chat turns green and says{" "}
                <strong>Studio connected</strong>.
              </li>
            </ol>
            <ul>
              <li>
                A code works once and expires after 10 minutes. Ask for a new
                one if it runs out.
              </li>
              <li>
                Every new connection starts with edits off. Press Enable edits
                in the panel when you want StudPilot to build, and turn them off
                again whenever you like.
              </li>
              <li>
                One Studio window pairs with one chat. Open another place, or
                another window, and pair that too.
              </li>
              <li>
                You can disconnect from the panel or from the website. Nothing
                already built is undone.
              </li>
            </ul>
            <div className="callout">
              <p>
                <strong>About the plugin.</strong> StudPilot builds through its
                Studio plugin. Its Creator Store listing is not available at the
                moment, so people who do not already have it cannot install it
                yet. The chat on this site works without Studio. If that
                changes, this page will say so.
              </p>
            </div>

            <h2 id="build">What it can build</h2>
            <p>
              StudPilot is a co-pilot for your game. You ask for one part at a
              time, and it builds that part inside your place.
            </p>
            <ul>
              <li>
                <strong>Screens.</strong> Menus, shops, inventories and HUDs
                with currency and buttons.
              </li>
              <li>
                <strong>Systems.</strong> Things that run behind a screen, such
                as daily rewards, quests, upgrades and rebirth.
              </li>
              <li>
                <strong>Props.</strong> Benches, trees, lamp posts, market
                stalls and other objects for the world.
              </li>
              <li>
                <strong>Areas.</strong> Small spaces such as a market, a park or
                a pet shop with a path to it.
              </li>
            </ul>
            <h3>What it does not do</h3>
            <ul>
              <li>It does not make a whole game from one sentence.</li>
              <li>
                It works only inside the place you paired, and only while Studio
                is open.
              </li>
              <li>It does not publish your game. Publishing stays with you.</li>
            </ul>
            <h3>Keep it safe</h3>
            <p>
              Before a run changes anything, StudPilot saves a checkpoint.{" "}
              <strong>Undo changes</strong> in the chat puts the place back to
              it, and each change is also a normal undo step in Studio. A reply
              in the chat is not proof that your place changed, so look at the
              result in Studio and play it.
            </p>

            <h2 id="credits">Credits</h2>
            <p>
              A credit is a unit of AI work: about $0.05 of compute. You see
              your balance at the bottom of the chat sidebar, with two decimals.
            </p>
            <ul>
              <li>
                <strong>Free:</strong> 5 credits a day, up to 30 a month.
              </li>
              <li>
                <strong>Pro:</strong> 100 credits a month, $9.99.
              </li>
              <li>
                <strong>Max:</strong> 300 credits a month, $24.99.
              </li>
              <li>
                <strong>Top-up:</strong> 50 credits that do not expire, $4.99.
              </li>
            </ul>
            <p>What a build costs depends on its size:</p>
            <ul>
              {BUILD_COSTS.map((c) => (
                <li key={c.label}>
                  {c.label}: {c.credits}
                </li>
              ))}
            </ul>
            <p>
              These are typical costs, not quotes. A long build can climb past
              its figure, because it is charged for the work it actually used.
            </p>
            <p>
              StudPilot is in beta, so Pro, Max and the top-up are listed on the{" "}
              <Link href="/pricing">pricing page</Link> but checkout is off for
              now. Questions? Write to{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </article>
        </div>
      </div>
    </>
  );
}
