import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
export const metadata = { title: "Page not found" };
export default function NotFound() {
  return (
    <div className="site-shell flex min-h-dvh flex-col bg-background text-foreground">
      <SiteNav />
      <main
        className="relative flex flex-1 items-center overflow-hidden py-24"
        id="main"
      >
        <div className="site-container relative">
          <p className="studio-eyebrow">
            <span />A SMALL DETOUR
          </p>
          <h1 className="mt-5 font-display text-[100px] leading-none font-semibold tracking-[-.06em]">
            404
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
            This page isn’t here. Let’s get you back to your next idea.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="studio-button">
              <span>Back to home</span>
              <ArrowUpRightIcon className="size-4" />
            </Link>
            <Link href="/docs" className="glass-button">
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
