import type { Metadata } from "next";
import { CtaBand } from "@/components/site/cta-band";
import { PageHeader } from "@/components/site/page-header";
import { FaqList } from "@/components/site/faq-list";
import { PricingSection } from "@/components/site/pricing-section";
import { Reveal } from "@/components/site/reveal";
import { FAQ } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "StudPilot is free to start: 5 credits a day. Pro is $9.99 a month for 100 credits, Max is $24.99 for 300, and a top-up is $4.99 for 50. Beta: checkout is off.",
  alternates: { canonical: "/pricing" },
};

const ITEMS = [
  FAQ[3],
  FAQ[4],
  {
    q: "Why is checkout off?",
    a: "StudPilot is in beta and charging starts later. Until it does, nothing on this site can charge you, and every plan button simply takes you to sign-in.",
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <PageHeader kicker="Beta" title="Start free, add credits later">
        StudPilot is in beta. Pro, Max and the top-up are listed so you can plan ahead, but checkout
        is off for now, so every button takes you to sign-in.
      </PageHeader>
      <PricingSection withHeading={false} />
      <section aria-labelledby="pricing-faq" className="bg-ice py-20 text-ink lg:py-24">
        <div className="mx-auto w-full max-w-[860px] px-5 sm:px-8">
          <Reveal>
            <h2 className="mb-8 font-display font-semibold text-[30px] leading-tight md:text-[38px]" id="pricing-faq">
              About credits and the beta
            </h2>
          </Reveal>
          <FaqList items={ITEMS} />
        </div>
      </section>
      <CtaBand />
    </>
  );
}
