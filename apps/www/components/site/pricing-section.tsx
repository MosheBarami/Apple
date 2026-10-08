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
      className="pricing-section section-space"
      id="pricing"
    >
      <div className="site-container">
        {withHeading ? (
          <Reveal className="section-heading">
            <p className="studio-eyebrow">
              <span />A LITTLE SPACE TO EXPERIMENT
            </p>
            <h2>
              Start free.
              <br />
              <span className="gradient-text">Let your ideas grow.</span>
            </h2>
            <p>
              Room for your first idea. More room when you need it.
              <br />
              Paid plans are planned; checkout stays closed during beta.
            </p>
          </Reveal>
        ) : null}
        <PricingCards />
        <p className="pricing-note">
          Credits reflect the AI work a request uses.{" "}
          <Link href="/docs#credits">
            See how credits work <span>↗</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
