"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_LINKS } from "@/lib/site-data";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A page change closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing on every path change is the point
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b-2 bg-ink/95 text-white backdrop-blur transition-[border-color,box-shadow] duration-300",
        scrolled
          ? "border-lime shadow-[0_6px_0_rgb(10_16_48/0.25)]"
          : "border-white/10"
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-5 sm:px-8"
      >
        <Link
          aria-label="StudPilot, home"
          className="rounded-md transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-white"
          href="/"
        >
          <Wordmark />
        </Link>

        <ul className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                aria-current={pathname === l.href ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-2 font-medium text-[0.95rem] text-white/85 transition-colors hover:text-white focus-visible:outline-white",
                  "after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-lime after:transition-transform after:duration-200 hover:after:scale-x-100",
                  pathname === l.href && "text-white after:scale-x-100"
                )}
                href={l.href}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <Link
            className="rounded-md px-3 py-2 font-medium text-[0.95rem] text-white/85 transition-colors hover:text-white focus-visible:outline-white"
            href="/login"
          >
            Sign in
          </Link>
          <Link className="btn-candy is-sm" href="/login">
            Start building
          </Link>
        </div>

        <button
          aria-controls="mobile-menu"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto inline-flex size-11 items-center justify-center rounded-md border-2 border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-white md:hidden"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </nav>

      <div
        className={cn(
          "grid overflow-hidden border-white/10 border-t bg-ink transition-[grid-template-rows] duration-300 ease-out md:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] border-t-0"
        )}
        id="mobile-menu"
        inert={!open}
      >
        <div className="min-h-0">
          <ul className="flex flex-col gap-1 px-5 py-4">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  className="block rounded-md px-3 py-3 font-medium text-lg text-white/90 hover:bg-white/10"
                  href={l.href}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                className="block rounded-md px-3 py-3 font-medium text-lg text-white/90 hover:bg-white/10"
                href="/login"
              >
                Sign in
              </Link>
            </li>
            <li className="pt-2">
              <Link className="btn-candy w-full" href="/login">
                Start building
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
