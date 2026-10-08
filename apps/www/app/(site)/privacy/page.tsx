import type { Metadata } from "next";
import { PRIVACY_UPDATED, PrivacyBody } from "@/components/site/legal/privacy-body";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description:
    "What StudPilot stores, who processes it, why Roblox data is never used for AI training, and how to export or delete your data.",
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={PRIVACY_UPDATED}>
      <PrivacyBody />
    </LegalPage>
  );
}
