"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "@/lib/site-data";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => !href.startsWith("/#") && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <nav aria-label="Main" className="site-container flex h-14 items-center gap-8">
        <Link aria-label="StudPilot home" className="rounded-md" href="/">
          <Wordmark />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[14px] text-muted-foreground transition-colors duration-150 hover:text-foreground",
                  isActive(link.href) && "text-foreground",
                )}
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <a className="rounded-md px-2.5 py-1.5 text-[14px] text-muted-foreground transition-colors duration-150 hover:text-foreground" href="/login">
            Sign in
          </a>
          <a
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 font-medium text-[14px] text-primary-foreground transition-opacity duration-150 hover:opacity-85"
            href="/app"
          >
            Open app
          </a>
        </div>
        <Sheet onOpenChange={setOpen} open={open}>
          <SheetTrigger asChild>
            <button
              aria-label="Open menu"
              className="ml-auto inline-flex size-9 items-center justify-center rounded-lg border text-foreground md:hidden"
              type="button"
            >
              <MenuIcon className="size-4" />
            </button>
          </SheetTrigger>
          <SheetContent className="w-[86vw] max-w-sm bg-background p-0" id="mobile-menu" side="right">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-14 items-center border-b px-4">
              <Wordmark />
            </div>
            <ul className="flex flex-col p-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link className="block rounded-md px-3 py-3 text-[16px]" href={link.href} onClick={() => setOpen(false)}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a className="block rounded-md px-3 py-3 text-[16px]" href="/login">
                  Sign in
                </a>
              </li>
            </ul>
            <div className="px-4">
              <a className="flex h-10 items-center justify-center rounded-lg bg-primary font-medium text-[15px] text-primary-foreground" href="/app">
                Open app
              </a>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
