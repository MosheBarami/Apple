"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export const STARTERS = [
  "What is in my place?",
  "List my scripts",
  "Are there errors in the output?",
];

export function Composer({
  onSend,
  busy,
  disabled,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  disabled?: boolean;
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
        <PromptInputTextarea placeholder="Ask StudPilot about your place" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit
          disabled={disabled}
          status={busy ? "streaming" : "ready"}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
