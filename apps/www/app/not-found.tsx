import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteNav />
      <main
        className="relative isolate flex flex-1 items-center overflow-hidden bg-background text-foreground"
        id="main"
      >
        <div aria-hidden className="drafting-grid absolute inset-0 -z-10" />
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8">
          <h1
            className="font-semibold tracking-tight text-signal text-[88px] leading-none sm:text-[128px]"
            style={{ "--sh": "7px", "--sw": "10px" } as React.CSSProperties}
          >
            404
          </h1>
          <p className="mt-6 max-w-md font-medium text-[1.2rem]">
            That page is not here. It may have moved, or the link may have a
            typo.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link className="studio-button" href="/">
              Back to home
            </Link>
            <Link className="studio-button" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
