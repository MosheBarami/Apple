import { cn } from "@/lib/utils";

/** A side-on brick with two studs: the StudPilot mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("size-7 shrink-0", className)}
      viewBox="0 0 32 32"
    >
      <rect fill="#7fd82a" height="6" rx="1.5" stroke="#3f7d1a" strokeWidth="2" width="7" x="6" y="4" />
      <rect fill="#7fd82a" height="6" rx="1.5" stroke="#3f7d1a" strokeWidth="2" width="7" x="19" y="4" />
      <rect fill="#7fd82a" height="18" rx="3" stroke="#3f7d1a" strokeWidth="2" width="28" x="2" y="10" />
      <rect fill="#c9f63e" height="5" rx="1.5" width="22" x="5" y="13" />
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
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="font-display font-bold text-[1.35rem] leading-none tracking-tight">
        StudPilot
      </span>
    </span>
  );
}
