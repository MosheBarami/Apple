"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditMeter } from "./credits";

/** Enter sends, Shift+Enter makes a new line; the box grows with the text. Stop replaces Send while working. */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  liveCredits,
  placeholder = "Ask StudPilot to build or change something…",
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  liveCredits?: number | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const canSend = value.trim().length > 0 && !busy && !disabled;

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus]);

  const send = async () => {
    if (!canSend) {
      return;
    }
    setError(null);
    const text = value.trim();
    onChange("");
    try {
      await onSend(text);
    } catch {
      onChange(text);
      setError("That did not send. Your message is back in the box; try again.");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div>
      <form
        className={cn(
          "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_14%,transparent)]",
          disabled && "opacity-70"
        )}
        data-testid="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="composer-input">
          Message StudPilot
        </label>
        <textarea
          className="block max-h-56 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] text-foreground leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground"
          disabled={disabled}
          id="composer-input"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          ref={ref}
          rows={1}
          value={value}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <CreditMeter liveRemaining={liveCredits} spending={busy} />
          {busy && onStop ? (
            <Button
              aria-label="Stop"
              className="size-8 rounded-lg"
              data-testid="stop"
              onClick={onStop}
              size="icon"
              type="button"
              variant="outline"
            >
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              aria-label="Send"
              className="size-8 rounded-lg"
              disabled={!canSend}
              size="icon"
              type="submit"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </form>
      {error ? (
        <p className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
