"use client";

// After vercel/ai-elements `sources` (Apache-2.0): a compact, collapsible list of the pages a reply drew on.
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn("not-prose text-muted-foreground text-xs", className)}
    {...props}
  />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        <span className="font-medium">
          {count} {count === 1 ? "source" : "sources"}
        </span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({ className, ...props }: SourcesContentProps) => (
  <CollapsibleContent
    className={cn("mt-2 flex flex-col gap-1", className)}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a"> & {
  index?: number;
  title?: string;
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const Source = ({
  href,
  title,
  index,
  className,
  children,
  ...props
}: SourceProps) => (
  <a
    className={cn(
      "flex min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground",
      className
    )}
    href={href}
    rel="noreferrer noopener"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        {index === undefined ? null : (
          <span className="shrink-0 font-mono tabular-nums">{index}</span>
        )}
        <span className="truncate text-foreground">{title || href}</span>
        <span className="shrink-0">{href ? hostOf(href) : null}</span>
      </>
    )}
  </a>
);
