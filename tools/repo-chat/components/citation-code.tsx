"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationQuote,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import { CITATION_RE, type Evidence } from "@/lib/evidence";
import { cn } from "@/lib/utils";

export const EvidenceContext = createContext<Evidence | null>(null);

const VERDICT_TEXT = {
  verified: "Seen in this answer's tool results",
  "file-seen": "File was read, but not this exact line",
  unverified: "Not found in this answer's tool results - treat with care",
} as const;

/** Replaces inline `code`: a `path:line` becomes a hover-card citation checked against the tool results. */
export function CitationCode({ children, className }: { children?: ReactNode; className?: string }) {
  const evidence = useContext(EvidenceContext);
  const text = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
  const m = CITATION_RE.exec(text.trim());
  if (!m || !evidence) {
    return (
      <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)}>
        {children}
      </code>
    );
  }
  const [, path, line] = m;
  const { verdict, quote } = evidence.check(path, Number(line));
  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          sources={[text.trim()]}
          className={cn(
            "ml-0 cursor-default font-mono text-[0.78em] font-normal",
            verdict === "verified" && "border border-primary/40 bg-primary/10 text-accent-foreground",
            verdict === "file-seen" && "border border-border",
            verdict === "unverified" && "border border-dashed border-destructive/70 text-destructive",
          )}
        />
        <InlineCitationCardBody>
          <InlineCitationCarousel>
            <InlineCitationCarouselHeader>
              <span className="px-2 text-xs text-muted-foreground">{VERDICT_TEXT[verdict]}</span>
              <InlineCitationCarouselIndex />
            </InlineCitationCarouselHeader>
            <InlineCitationCarouselContent>
              <InlineCitationCarouselItem>
                <InlineCitationSource title={path} url={`line ${m[2]}${m[3] ? `-${m[3]}` : ""}`}>
                  {quote !== undefined && <InlineCitationQuote className="font-mono not-italic">{quote}</InlineCitationQuote>}
                </InlineCitationSource>
              </InlineCitationCarouselItem>
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  );
}
