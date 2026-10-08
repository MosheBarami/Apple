"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div aria-label="Theme" className={cn("inline-flex rounded-lg border bg-background p-0.5", className)} role="group">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground",
              active && "bg-accent text-foreground",
            )}
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            type="button"
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
