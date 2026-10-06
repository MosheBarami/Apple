"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

export { STARTERS } from "./starters";

export function Composer({
  onSend,
  busy,
  disabled,
  large = false,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <PromptInput
      onSubmit={({ text }) => {
        const t = text.trim();
        if (t && !busy && !disabled) {
          onSend(t);
        }
      }}
    >
      <PromptInputBody>
        <PromptInputTextarea
          autoFocus={autoFocus}
          className={cn(large ? "min-h-28 text-base" : "min-h-14")}
          placeholder="Ask StudPilot to build something in your place"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <span className="hidden px-2 text-muted-foreground text-xs sm:inline">
            Enter to send, Shift+Enter for a new line
          </span>
        </PromptInputTools>
        <PromptInputSubmit
          className="size-9 rounded-md bg-signal text-signal-foreground shadow-card transition-[transform,filter,box-shadow] duration-150 hover:-translate-y-px hover:bg-signal hover:brightness-105 hover:shadow-float active:translate-y-0 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
          disabled={disabled}
          size="icon-sm"
          status={busy ? "streaming" : "ready"}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
