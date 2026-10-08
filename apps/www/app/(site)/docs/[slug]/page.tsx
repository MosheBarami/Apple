import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/site/docs/doc-view";
import { DOC_PAGES } from "@/lib/docs";

// Pages not built ahead are rendered on request (the Cloudflare adapter did not serve the prebuilt ones); an unknown
// slug is a 404.

export function generateStaticParams() {
  return DOC_PAGES.filter((p) => p.slug !== "overview").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = DOC_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  return { title: `${page.title} | Docs`, description: page.description, alternates: { canonical: `/docs/${slug}` } };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "overview" || !DOC_PAGES.some((p) => p.slug === slug)) notFound();
  return <DocView slug={slug} />;
}
