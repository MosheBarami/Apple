import type { Metadata } from "next";
import Link from "next/link";
import { StudioDemo } from "@/components/creative/studio-demo";
import { HowItWorks } from "@/components/site/how-it-works";
import { CtaBand } from "@/components/site/cta-band";
export const metadata: Metadata = {
  title: "Product",
  alternates: { canonical: "/product" },
};
export default function ProductPage() {
  return (
    <>
      <section className="reference-product-intro site-container">
        <h1>Turn ideas into your game</h1>
        <p>Direct the agent. Follow the changes. Keep building in Studio.</p>
        <div className="hero-actions">
          <Link href="/app" className="studio-button">
            Open the workspace ↗
          </Link>
          <Link href="/docs#pair" className="glass-button">
            Connect Studio →
          </Link>
        </div>
        <div className="product-demo-stage">
          <StudioDemo large />
        </div>
        <p className="stage-disclosure">
          Interactive example · your actual project stays in Roblox Studio.
        </p>
      </section>
      <HowItWorks />
      <CtaBand />
    </>
  );
}
