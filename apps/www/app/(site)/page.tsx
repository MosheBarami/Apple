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
        className="bg-ice py-20 text-ink lg:py-28"
        id="faq"
      >
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <p className="font-display font-semibold text-[#0b5fa3] text-lg">FAQ</p>
            <h2 className="mt-2 font-display font-semibold text-[32px] leading-[1.1] md:text-[46px]" id="faq-title">
              Questions, answered straight
            </h2>
            <p className="mt-4 text-[1.05rem] text-[#232c52] leading-relaxed lg:max-w-xs">
              Short answers about what it builds, what it costs and what is still closed.
            </p>
          </Reveal>
          <FaqList />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
