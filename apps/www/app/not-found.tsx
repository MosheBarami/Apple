import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <SiteNav />
      <main className="relative isolate flex flex-1 items-center overflow-hidden bg-gradient-to-b from-[#52d0fb] to-[#1788d6] text-ink" id="main">
        <div aria-hidden className="studs absolute inset-0 -z-10 opacity-30" />
        <div className="mx-auto w-full max-w-[1200px] px-5 py-20 sm:px-8">
          <h1 className="outline-text text-[88px] leading-none sm:text-[128px]" style={{ "--sw": "10px", "--sh": "7px" } as React.CSSProperties}>
            404
          </h1>
          <p className="mt-6 max-w-md font-medium text-[1.2rem]">
            That page is not here. It may have moved, or the link may have a typo.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link className="btn-candy" href="/">
              Back to home
            </Link>
            <Link className="btn-candy is-white" href="/docs">
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
