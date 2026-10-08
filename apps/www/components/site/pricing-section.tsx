import Link from "next/link";
import { PricingCards } from "./pricing-cards";
import { Reveal } from "./reveal";
export function PricingSection({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <section
      aria-label="Plans and prices"
      className="bg-muted/40 py-20 lg:py-28"
      id="pricing"
    >
      <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
        {withHeading ? (
          <Reveal className="mb-12">
            <p className="studio-eyebrow">Room to experiment</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with an idea. Start free.
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Try StudPilot during the beta. Paid plans are previewed below;
              checkout is not open yet.
            </p>
          </Reveal>
        ) : null}
        <PricingCards />
        <p className="mt-8 text-sm text-muted-foreground">
          Credits reflect the AI work your request uses.{" "}
          <Link
            className="text-signal underline underline-offset-4"
            href="/docs#credits"
          >
            Learn how credits work
          </Link>
        </p>
      </div>
    </section>
  );
}
