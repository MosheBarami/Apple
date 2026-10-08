import type { Metadata } from "next";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { CtaBand } from "@/components/site/cta-band";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <CtaBand />
    </>
  );
}
