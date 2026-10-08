import type { Metadata } from "next";
import { CtaBand } from "@/components/site/cta-band";
import { FaqList } from "@/components/site/faq-list";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { PricingSection } from "@/components/site/pricing-section";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />

      <PricingSection />

      <section
        aria-labelledby="faq-title"
        className="faq-section section-space"
        id="faq"
      >
        <div className="site-container grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <p className="studio-eyebrow">FAQ</p>
            <h2
              className="mt-2 font-semibold text-3xl tracking-tight leading-[1.1] md:text-4xl"
              id="faq-title"
            >
              Curious minds.
            </h2>
            <p className="mt-4 text-[1.05rem] text-muted-foreground leading-relaxed lg:max-w-xs">
              A few answers before your next big idea.
            </p>
          </Reveal>
          <FaqList />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
