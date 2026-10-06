"use client";

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

  let text = "Checking credits";
  if (credits === null) {
    text = "Credits unavailable";
  } else if (credits?.unmetered) {
    text = "Credits: not metered";
  } else if (credits) {
    text = `${two(credits.allowance)} credits left today`;
    if (credits.purchased > 0) {
      text += `, ${two(credits.purchased)} purchased`;
    }
  }

  return (
    <p
      className="px-2 text-sidebar-foreground/70 text-xs group-data-[collapsible=icon]:hidden"
      data-testid="credits-meter"
    >
      {text}
    </p>
  );
}
