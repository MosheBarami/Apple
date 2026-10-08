import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteNav />
      <main className="flex flex-1 items-center py-24" id="main">
        <div className="site-container">
          <p className="font-mono text-[12.5px] text-muted-foreground">404</p>
          <h1 className="mt-4 font-semibold text-[40px] leading-[1.05] tracking-[-0.04em] sm:text-[56px]">This page isn&rsquo;t here.</h1>
          <p className="mt-5 max-w-md text-[16px] text-muted-foreground leading-relaxed">
            The link may be old, or the page may have moved. The docs have a search that can help.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="inline-flex h-10 items-center rounded-[10px] bg-primary px-4 font-medium text-[14.5px] text-primary-foreground" href="/">
              Back to home
            </Link>
            <Link className="inline-flex h-10 items-center rounded-[10px] border bg-card px-4 font-medium text-[14.5px]" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
