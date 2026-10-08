import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// https://uiverse.io/adamgiebl/new-bird-34 — MIT, adapted to a Next link.
export function UiverseAction({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link className={cn("uiverse-action", className)} data-uiverse="adamgiebl/new-bird-34" {...props}>
      <span>{children}</span>
      <span className="uiverse-action-icon" aria-hidden="true"><ArrowRightIcon /></span>
    </Link>
  );
}

// https://uiverse.io/adamgiebl/thin-lionfish-5 — MIT.
export function UiverseDots({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("uiverse-dots", className)} data-uiverse="adamgiebl/thin-lionfish-5" aria-hidden="true" {...props}>
      <i /><i /><i />
    </span>
  );
}

// https://uiverse.io/Nawsome/cold-liger-90 — MIT.
export function UiverseBuildLoader() {
  return (
    <span className="uiverse-build-loader" data-uiverse="Nawsome/cold-liger-90" aria-hidden="true">
      <span className="uiverse-boxes">
        {[1, 2, 3, 4].map(n => <span className="uiverse-box" key={n}><i /><i /><i /><i /></span>)}
      </span>
    </span>
  );
}
