import type { Metadata } from "next";
import {
  PRIVACY_UPDATED,
  PrivacyBody,
} from "@/components/site/legal/privacy-body";
import { PageHeader } from "@/components/site/page-header";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description:
    "What StudPilot stores, who processes it, why Roblox data is never used for AI training, and how to export or delete your data.",
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        kicker={`Updated ${PRIVACY_UPDATED}`}
        title="Privacy Policy"
      />
      <div className="bg-background py-14 lg:py-20">
        <article className="longform mx-auto w-full max-w-[760px] px-5 sm:px-8">
          <PrivacyBody />
        </article>
      </div>
    </>
  );
}
