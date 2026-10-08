"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={copied ? "Copied" : "Copy"}
      className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      type="button"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}
