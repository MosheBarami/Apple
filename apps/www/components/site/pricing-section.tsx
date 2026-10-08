import { PricingCards } from "./pricing-cards";
export function PricingSection({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <section
      className="reference-pricing site-container"
      id="pricing"
      aria-label="Plans and prices"
    >
      {withHeading ? <h1>Pricing</h1> : null}
      <PricingCards />
    </section>
  );
}
