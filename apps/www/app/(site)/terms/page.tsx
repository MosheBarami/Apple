import type { Metadata } from "next";
import { PageHeader } from "@/components/site/page-header";
import { TERMS_UPDATED, TermsBody } from "@/components/site/legal/terms-body";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using StudPilot: for people 13 and older, a beta service provided as-is, your content staying yours, and plain-language rules of use.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader kicker={`Updated ${TERMS_UPDATED}`} title="Terms of Service" />
      <div className="bg-ice py-14 lg:py-20">
        <article className="longform mx-auto w-full max-w-[760px] px-5 sm:px-8">
          <TermsBody />
        </article>
      </div>
    </>
  );
}
