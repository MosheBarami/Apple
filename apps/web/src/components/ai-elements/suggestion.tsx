"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/suggestion.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/suggestion.tsx.txt
// and ./NOTICE lists every local substitution. Only imports are swapped and `ai-suggestion*`
// classes appended beside the inert Tailwind strings; the components are otherwise upstream's.
import { Button } from "./ui/button";
import {
  ScrollArea,
  ScrollBar,
} from "./ui/scroll-area";
import { cn } from "./lib/utils";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import "./suggestion.css";

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <ScrollArea className="w-full overflow-x-auto whitespace-nowrap ai-suggestions" {...props}>
    <div className={cn("flex w-max flex-nowrap items-center gap-2 ai-suggestions__list", className)}>
      {children}
    </div>
    <ScrollBar className="hidden" orientation="horizontal" />
  </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4 ai-suggestion", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
