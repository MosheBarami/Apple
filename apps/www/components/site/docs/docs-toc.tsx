"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function DocsToc({ items }: { items: { id: string; text: string; level: 2 | 3 }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const headings = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    if (!headings.length) return;
    const update = () => {
      let current = headings[0].id;
      for (const h of headings) if (h.getBoundingClientRect().top < 120) current = h.id;
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [items]);
  if (!items.length) return null;
  return (
    <nav aria-label="On this page" className="sticky top-14 hidden max-h-[calc(100dvh-3.5rem)] w-[208px] shrink-0 overflow-y-auto py-10 xl:block">
      <p className="font-medium text-[12.5px] text-muted-foreground">On this page</p>
      <ul className="mt-3 space-y-px border-l">
        {items.map((item) => (
          <li key={item.id}>
            <a
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l py-1 text-[13px] text-muted-foreground leading-snug transition-colors duration-150 hover:text-foreground",
                item.level === 3 ? "pl-6" : "pl-3",
                active === item.id ? "border-foreground text-foreground" : "border-transparent",
              )}
              href={`#${item.id}`}
            >
              {item.text.replace(/`/g, "")}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
