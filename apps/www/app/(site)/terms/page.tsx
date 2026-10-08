import type { Metadata } from "next";
import { TERMS_UPDATED, TermsBody } from "@/components/site/legal/terms-body";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  description:
    "The terms for using StudPilot: for people 13 and older, a beta service provided as-is, your content staying yours, and plain-language rules of use.",
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={TERMS_UPDATED}>
      <TermsBody />
    </LegalPage>
  );
}
