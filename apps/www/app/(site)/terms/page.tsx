import type { Metadata } from "next";
import { TERMS_UPDATED, TermsBody } from "@/components/site/legal/terms-body";
import { PageHeader } from "@/components/site/page-header";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  description:
    "The terms for using StudPilot: for people 13 and older, a beta service provided as-is, your content staying yours, and plain-language rules of use.",
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        kicker={`Updated ${TERMS_UPDATED}`}
        title="Terms of Service"
      />
      <div className="bg-background py-14 lg:py-20">
        <article className="longform mx-auto w-full max-w-[760px] px-5 sm:px-8">
          <TermsBody />
        </article>
      </div>
    </>
  );
}
