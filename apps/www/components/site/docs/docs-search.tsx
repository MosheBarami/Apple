"use client";

import { Command } from "cmdk";
import { CornerDownLeftIcon, FileTextIcon, HashIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SearchEntry } from "@/lib/docs";
import { cn } from "@/lib/utils";

let cache: Promise<SearchEntry[]> | null = null;
function loadIndex() {
  cache ??= fetch("/docs/search.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

function rank(entries: SearchEntry[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { entry: SearchEntry; score: number; snippet: string }[] = [];
  for (const entry of entries) {
    const page = entry.page.toLowerCase();
    const heading = entry.heading.toLowerCase();
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const s = (page.includes(t) ? 6 : 0) + (heading.includes(t) ? 4 : 0) + (text.includes(t) ? 1 : 0);
      if (!s) {
        score = 0;
        break;
      }
      score += s;
    }
    if (!score) continue;
    const at = text.indexOf(terms[0]);
    const start = Math.max(0, at - 50);
    const snippet = at < 0 ? entry.text.slice(0, 120) : `${start ? "…" : ""}${entry.text.slice(start, start + 130)}…`;
    scored.push({ entry, score, snippet });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function DocsSearch({ className, compact = false }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<SearchEntry[]>([]);

  // Only one instance owns the shortcut (the sidebar one, mounted on every screen size), so it opens one dialog.
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  useEffect(() => {
    if (open) loadIndex().then(setEntries);
  }, [open]);

  const results = useMemo(() => rank(entries, query), [entries, query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        aria-label="Search docs"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border bg-card text-[14px] text-muted-foreground transition-colors duration-150 hover:text-foreground",
          compact ? "w-9 justify-center" : "w-full px-3",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <SearchIcon className="size-4 shrink-0" />
        {compact ? null : (
          <>
            <span>Search docs</span>
            <kbd className="ml-auto rounded border bg-background px-1.5 font-mono text-[11px]">/</kbd>
          </>
        )}
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="top-[12vh] max-w-[calc(100%-2rem)] translate-y-0 gap-0 border bg-popover overflow-hidden rounded-[14px] p-0 sm:max-w-[620px]" showCloseButton={false}>
          <DialogTitle className="sr-only">Search the docs</DialogTitle>
          <Command label="Search the docs" shouldFilter={false}>
            <div className="flex items-center gap-2.5 border-b px-4">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                onValueChange={setQuery}
                placeholder="Search the docs"
                value={query}
              />
              <kbd className="rounded border px-1.5 font-mono text-[11px] text-muted-foreground">Esc</kbd>
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
              {query && !results.length ? (
                <Command.Empty className="px-3 py-8 text-center text-[14px] text-muted-foreground">No results for &ldquo;{query}&rdquo;</Command.Empty>
              ) : null}
              {!query ? <p className="px-3 py-6 text-center text-[13.5px] text-muted-foreground">Search guides, the plugin, credits, troubleshooting…</p> : null}
              {results.map(({ entry, snippet }) => (
                <Command.Item
                  className="group flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
                  key={entry.href}
                  onSelect={() => go(entry.href)}
                  value={entry.href}
                >
                  {entry.heading ? (
                    <HashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">
                      <span className="font-medium">{entry.heading || entry.page}</span>
                      {entry.heading ? <span className="text-muted-foreground"> in {entry.page}</span> : <span className="text-muted-foreground"> in {entry.section}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{snippet}</p>
                  </div>
                  <CornerDownLeftIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
