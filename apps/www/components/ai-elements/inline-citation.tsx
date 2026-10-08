"use client";

// After vercel/ai-elements `inline-citation` (Apache-2.0): a numbered chip in running text that shows the cited
// page on hover or focus, and opens it in a new tab on click.
import type { ComponentProps } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { hostOf } from "./sources";

export type InlineCitationProps = ComponentProps<"span">;

export const InlineCitation = ({ className, ...props }: InlineCitationProps) => (
  <span className={cn("group inline items-center gap-1", className)} {...props} />
);

export interface CitedSource {
  url: string;
  title?: string;
}

export type InlineCitationChipProps = {
  index: number;
  source: CitedSource;
  className?: string;
};

export const InlineCitationChip = ({
  index,
  source,
  className,
}: InlineCitationChipProps) => (
  <HoverCard closeDelay={80} openDelay={120}>
    <HoverCardTrigger asChild>
      <a
        aria-label={`Source ${index}: ${source.title ?? hostOf(source.url)}`}
        className={cn(
          "mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-[5px] border border-border bg-muted px-1 align-middle font-mono text-[10.5px] text-muted-foreground no-underline tabular-nums transition-colors hover:border-[color:var(--brand)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-[color:var(--brand)]",
          className
        )}
        href={source.url}
        rel="noreferrer noopener"
        target="_blank"
      >
        {index}
      </a>
    </HoverCardTrigger>
    <HoverCardContent align="start" className="w-72 p-3">
      <InlineCitationCardBody source={source} />
    </HoverCardContent>
  </HoverCard>
);

export const InlineCitationCardBody = ({ source }: { source: CitedSource }) => (
  <div className="space-y-1">
    <p className="font-medium text-foreground text-sm leading-snug">
      {source.title || hostOf(source.url)}
    </p>
    <p className="truncate text-muted-foreground text-xs">{source.url}</p>
  </div>
);
