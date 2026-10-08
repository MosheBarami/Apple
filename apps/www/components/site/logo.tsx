import { cn } from "@/lib/utils";

/** The mark: an ink tile with one accent stud in its corner. Drawn in code, no image. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn("size-[22px] shrink-0", className)} viewBox="0 0 24 24">
      <rect fill="currentColor" height="24" rx="6" width="24" />
      <path d="M7 15.5c0 1.4 1.6 2.5 5 2.5s5-1 5-2.6c0-3.6-9.6-1.8-9.6-5.4C7.4 8.6 9 7 12 7s4.6 1.1 4.6 2.6" fill="none" stroke="var(--background)" strokeLinecap="round" strokeWidth="2.1" />
      <rect fill="var(--brand)" height="5" rx="1.5" width="5" x="16" y="3" />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-[17px] tracking-[-0.03em] text-foreground", className)}>
      <LogoMark className={markClassName} />
      <span>StudPilot</span>
    </span>
  );
}
