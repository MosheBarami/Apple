import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocView } from "@/components/site/docs/doc-view";
import { DOC_PAGES } from "@/lib/docs";

export const dynamicParams = false;

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
  if (slug === "overview") notFound();
  return <DocView slug={slug} />;
}
