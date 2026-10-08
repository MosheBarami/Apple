import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col site-shell bg-background font-sans text-foreground">
      <a
        className="sr-only z-[60] rounded-md bg-white px-4 py-2 font-medium text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        href="#main"
      >
        Skip to content
      </a>
      <SiteNav />
      <main className="flex-1" id="main">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
