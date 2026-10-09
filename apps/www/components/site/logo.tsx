import { cn } from "@/lib/utils";

/**
 * The mark (2026-10-09): a brick seen from above, three studs in place and one orange stud being placed, lifted out of
 * its slot (its shadow stays behind). Studs are what Roblox builds with; the lifted one is the pilot at work. The tile
 * takes the text colour, so it is ink on paper and paper on ink. Drawn in code, no image. Same geometry as app/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn("size-[22px] shrink-0", className)} viewBox="0 0 64 64">
      <rect fill="currentColor" height="64" rx="15" width="64" />
      <circle cx="21" cy="43" fill="var(--background)" r="8.5" />
      <circle cx="43" cy="43" fill="var(--background)" r="8.5" />
      <circle cx="21" cy="21" fill="var(--background)" r="8.5" />
      <circle cx="43" cy="21" fill="#000" fillOpacity="0.3" r="8.5" />
      <circle cx="47" cy="17" fill="var(--brand)" r="8.5" />
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
