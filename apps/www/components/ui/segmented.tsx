"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A single-choice segmented control (Radix ToggleGroup) that always keeps one option selected. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: Omit<ComponentProps<typeof ToggleGroupPrimitive.Root>, "type" | "value" | "onValueChange" | "defaultValue"> & {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn("inline-flex rounded-lg border border-border bg-muted/60 p-0.5", className)}
      onValueChange={(v) => v && onValueChange(v as T)}
      type="single"
      value={value}
      {...props}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[color:var(--brand)] data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-4"
          key={o.value}
          value={o.value}
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
