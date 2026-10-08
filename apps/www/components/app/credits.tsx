"use client";

// The credit allowance, read from GET /api/me and lowered live by the agent's `data-credits` parts while a turn runs.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Account, fetchAccount, formatCredits } from "@/lib/app-api";
import { cn } from "@/lib/utils";

export const CREDITS_REFRESH_EVENT = "studpilot:credits-refresh";

export function refreshCredits() {
  window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT));
}

/** undefined while loading, null when it could not be read. */
export function useAccount(): { account: Account | null | undefined; reload: () => void } {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const reload = useCallback(() => {
    fetchAccount().then(setAccount, () => setAccount(null));
  }, []);
  useEffect(() => {
    reload();
    const timer = setInterval(reload, 60_000);
    window.addEventListener(CREDITS_REFRESH_EVENT, reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CREDITS_REFRESH_EVENT, reload);
    };
  }, [reload]);
  return { account, reload };
}

const PLAN_NAMES: Record<string, string> = {
  builder: "Builder",
  enterprise: "Enterprise",
  free: "Free",
  studio: "Studio",
};

export const planName = (plan: string) => PLAN_NAMES[plan] ?? plan;

/**
 * The meter in the composer: remaining credits and a thin bar of today's allowance. `liveRemaining` (credits) comes
 * from the newest `data-credits` part of the running turn and wins over the last read while it is newer.
 */
export function CreditMeter({
  liveRemaining,
  spending,
}: {
  liveRemaining?: number | null;
  spending: boolean;
}) {
  const { account } = useAccount();
  // After a turn ends, keep its last live figure until the next read of the account replaces it.
  const held = useRef<{ value: number; account: Account | null | undefined } | null>(null);
  if (typeof liveRemaining === "number") {
    held.current = { account, value: liveRemaining };
  } else if (held.current && held.current.account !== account) {
    held.current = null;
  }
  const total = account ? account.allowance + account.purchased : null;
  const remaining = typeof liveRemaining === "number" ? liveRemaining : (held.current?.value ?? total);
  const daily = account?.daily ?? 0;
  const allowanceLeft =
    account && typeof liveRemaining === "number"
      ? Math.max(0, Math.min(account.allowance, liveRemaining - account.purchased))
      : (account?.allowance ?? 0);
  const fraction = daily > 0 ? Math.min(1, allowanceLeft / daily) : remaining && remaining > 0 ? 1 : 0;
  const low = account && !account.unmetered && remaining !== null && remaining < 5;

  let text = "…";
  if (account === null) {
    text = "Credits";
  } else if (account?.unmetered) {
    text = "Unmetered";
  } else if (remaining !== null) {
    text = formatCredits(remaining);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={
            remaining === null ? "Credits" : `${formatCredits(remaining)} credits left. Show details`
          }
          className={cn(
            "credit-meter group relative flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-[color:var(--brand)]",
            spending && "is-spending"
          )}
          data-testid="credit-meter"
          type="button"
        >
          <span
            className={cn("font-medium tabular-nums", low && "text-[color:var(--brand)]")}
          >
            {text}
          </span>
          {account && !account.unmetered ? (
            <span aria-hidden className="relative h-1 w-12 overflow-hidden rounded-full bg-border">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--brand)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </span>
          ) : null}
          <span className="hidden sm:inline">credits</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" side="top" sideOffset={8}>
        <CreditDetails account={account} remaining={remaining} />
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">
        {label}
        {hint ? <span className="block text-[11px]">{hint}</span> : null}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function CreditDetails({
  account,
  remaining,
}: {
  account: Account | null | undefined;
  remaining: number | null;
}) {
  if (account === undefined) {
    return <p className="p-4 text-muted-foreground text-sm">Reading your credits…</p>;
  }
  if (account === null) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        Your credits could not be read just now. They are still there; try again in a moment.
      </p>
    );
  }
  const resets = account.resetsAtIso
    ? new Date(account.resetsAtIso).toLocaleString([], {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <div className="text-sm">
      <div className="border-border border-b p-4">
        <p className="text-muted-foreground text-xs">{planName(account.plan)} plan</p>
        <p className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">
          {account.unmetered ? "Unmetered" : formatCredits(remaining ?? 0)}
          {account.unmetered ? null : (
            <span className="ml-1.5 font-normal text-muted-foreground text-sm">credits left</span>
          )}
        </p>
      </div>
      <div className="divide-y divide-border px-4 py-2">
        {account.daily > 0 ? (
          <Row
            hint={resets ? `Renews ${resets}` : undefined}
            label="Today’s allowance"
            value={`${formatCredits(account.allowance)} of ${formatCredits(account.daily)}`}
          />
        ) : null}
        {account.monthly > 0 ? (
          <Row
            label="This month"
            value={`${formatCredits(account.usedThisMonth)} of ${formatCredits(account.monthly)} used`}
          />
        ) : null}
        <Row label="Purchased" value={formatCredits(account.purchased)} hint="Never expires; used after the allowance" />
        <Row label="Used today" value={formatCredits(account.usedToday)} />
      </div>
      <div className="border-border border-t p-4 text-muted-foreground text-xs leading-relaxed">
        A request spends credits for the model time and steps it actually uses, so a small fix costs less than a new
        screen. The meter moves while StudPilot works.
        <Link className="mt-2 block font-medium text-foreground underline underline-offset-4" href="/pricing">
          Plans and credit packs
        </Link>
      </div>
    </div>
  );
}
