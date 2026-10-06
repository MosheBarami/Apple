"use client";

import { CoinsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type Credits, fetchCredits } from "@/lib/api";

export const CREDITS_REFRESH_EVENT = "studpilot:credits-refresh";

const two = (n: number) => n.toFixed(2);

export function CreditsMeter() {
  const [credits, setCredits] = useState<Credits | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchCredits().then(
        (c) => live && setCredits(c),
        () => live && setCredits(null)
      );
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(CREDITS_REFRESH_EVENT, load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener(CREDITS_REFRESH_EVENT, load);
    };
  }, []);

  let value: string | null = null;
  let label = "Checking credits";
  let extra: string | null = null;
  if (credits === null) {
    label = "Credits unavailable";
  } else if (credits?.unmetered) {
    label = "Credits: not metered";
  } else if (credits) {
    value = two(credits.allowance);
    label = "credits left today";
    if (credits.purchased > 0) {
      extra = `+ ${two(credits.purchased)} purchased`;
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-sidebar-border bg-background px-3 py-2.5 group-data-[collapsible=icon]:hidden"
      data-testid="credits-meter"
    >
      <CoinsIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 text-sm leading-tight">
        {value ? (
          <>
            <span className="font-semibold tabular-nums">{value}</span>{" "}
            <span className="text-muted-foreground">{label}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
        {extra ? (
          <span className="mt-0.5 block text-muted-foreground text-xs tabular-nums">
            {extra}
          </span>
        ) : null}
      </p>
    </div>
  );
}
