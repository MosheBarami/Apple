"use client";
import { UiverseDots } from "@/components/uiverse/elements";
import {
  ArrowUpIcon,
  CornerDownLeftIcon,
} from "lucide-react";
import { useRef, useState } from "react";
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
  value,
  onChange,
}: {
  onSend: (text: string) => unknown | Promise<unknown>;
  busy: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  value?: string;
  onChange?: (text: string) => void;
}) {
  const [local, setLocal] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const text = value ?? local;
  const change = onChange ?? setLocal;
  return (
    <div className="studio-composer">
      <PromptInput
        onSubmit={async () => {
          if (!text.trim() || busy || disabled || locked.current) {
            return;
          }
          locked.current = true;
          setSending(true);
          setError(null);
          try {
            await onSend(text.trim());
            change("");
          } catch {
            setError("Your message is still here. Please try again.");
          } finally {
            locked.current = false;
            setSending(false);
          }
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message StudPilot"
            autoFocus={autoFocus}
            className={cn(
              "px-5 pt-5 leading-7",
              large ? "min-h-28 text-base" : "min-h-16"
            )}
            onChange={(e) => change(e.target.value)}
            placeholder="Plan, build, or change your game…"
            readOnly={sending}
            value={text}
          />
        </PromptInputBody>
        <PromptInputFooter className="px-4 pb-3">
          <PromptInputTools>
            <span className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              StudPilot<span className="mx-1 text-border">/</span>Roblox Studio
            </span>
          </PromptInputTools>
          <div className="flex items-center gap-3">
            <CornerDownLeftIcon
              aria-hidden
              className="hidden size-3.5 text-muted-foreground sm:block"
            />
            <PromptInputSubmit
              aria-label={busy ? "StudPilot is working" : "Send message"}
              className="size-9 rounded-md bg-primary text-primary-foreground transition-transform hover:-translate-y-px disabled:opacity-40"
              disabled={disabled || busy || sending || !text.trim()}
              status="ready"
              title={
                busy ? "Wait for the current request to finish" : "Send message"
              }
            >
              {busy || sending ? (
                <UiverseDots className="size-4" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
      {error ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
