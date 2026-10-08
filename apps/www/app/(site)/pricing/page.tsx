import type { Metadata } from "next";
import { PricingSection } from "@/components/site/pricing-section";
import { FaqList } from "@/components/site/faq-list";
import { CtaBand } from "@/components/site/cta-band";
export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
};
export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <section className="reference-pricing-faq site-container">
        <h2>Questions & Answers</h2>
        <FaqList />
      </section>
      <CtaBand />
    </>
  );
}
