"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DocsSearch } from "./docs-search";

export interface NavSection {
  title: string;
  pages: { href: string; title: string }[];
}

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-7">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="px-2.5 font-medium text-[12.5px] text-muted-foreground tracking-normal">{section.title}</h2>
          <ul className="mt-2 space-y-px">
            {section.pages.map((page) => {
              const active = pathname === page.href;
              return (
                <li key={page.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-[5px] text-[14px] text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground",
                      active && "bg-accent font-medium text-foreground",
                    )}
                    href={page.href}
                    onClick={onNavigate}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar({ sections }: { sections: NavSection[] }) {
  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[248px] shrink-0 overflow-y-auto border-r py-8 pr-5 lg:block">
      <DocsSearch className="mb-7" />
      <NavList sections={sections} />
    </aside>
  );
}

export function DocsMobileBar({ sections, current }: { sections: NavSection[]; current: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-14 z-30 -mx-4 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8 lg:hidden">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <button className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-left text-[14px]" type="button">
            <MenuIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{current}</span>
          </button>
        </SheetTrigger>
        <SheetContent className="w-[86vw] max-w-sm overflow-y-auto bg-background p-4 pt-12" side="left">
          <SheetTitle className="sr-only">Docs navigation</SheetTitle>
          <NavList onNavigate={() => setOpen(false)} sections={sections} />
        </SheetContent>
      </Sheet>
      <DocsSearch compact />
    </div>
  );
}
