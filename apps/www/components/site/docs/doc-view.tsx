import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_SECTIONS } from "@/content/docs";
import { docHref, getDoc } from "@/lib/docs";
import { DocBlocks } from "./doc-content";
import { DocsMobileBar, type NavSection } from "./docs-nav";
import { DocsToc } from "./docs-toc";

export const NAV_SECTIONS: NavSection[] = DOC_SECTIONS.map((s) => ({
  title: s.title,
  pages: s.pages.map((p) => ({ href: docHref(p.slug), title: p.title })),
}));

export function DocView({ slug }: { slug: string }) {
  const doc = getDoc(slug);
  if (!doc) notFound();
  const { page, blocks, toc, prev, next } = doc;
  return (
    <div className="flex gap-12 lg:pl-12">
      <article className="min-w-0 max-w-[720px] flex-1 pb-20 lg:pt-10">
        <DocsMobileBar current={page.title} sections={NAV_SECTIONS} />
        <header className="mt-8 border-b pb-8 lg:mt-0">
          <p className="font-mono text-[12.5px] text-muted-foreground">{page.section}</p>
          <h1 className="mt-3 text-balance font-semibold text-[34px] leading-[1.1] tracking-[-0.035em] sm:text-[40px]">{page.title}</h1>
          <p className="mt-4 text-pretty text-[17px] text-muted-foreground leading-relaxed">{page.description}</p>
        </header>
        <div className="prose-site mt-8">
          <DocBlocks blocks={blocks} />
        </div>
        <nav aria-label="Previous and next" className="mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2">
          {prev ? (
            <Link className="group rounded-[10px] border p-4 transition-colors duration-150 hover:bg-accent/50" href={docHref(prev.slug)}>
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <ArrowLeftIcon className="size-3.5" /> Previous
              </span>
              <span className="mt-1 block font-medium text-[15px]">{prev.title}</span>
            </Link>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next ? (
            <Link className="group rounded-[10px] border p-4 text-right transition-colors duration-150 hover:bg-accent/50" href={docHref(next.slug)}>
              <span className="flex items-center justify-end gap-1.5 text-[12.5px] text-muted-foreground">
                Next <ArrowRightIcon className="size-3.5" />
              </span>
              <span className="mt-1 block font-medium text-[15px]">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
      <DocsToc items={toc.map((t) => ({ id: t.id, text: t.text, level: t.type === "h2" ? 2 : 3 }))} />
    </div>
  );
}
