import { cn } from "@/lib/utils";

/** A side-on brick with two studs: the StudPilot mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("size-7 shrink-0", className)}
      viewBox="0 0 32 32"
    >
      <rect
        fill="#3965ed"
        height="6"
        rx="1.5"
        stroke="#2446ab"
        strokeWidth="2"
        width="7"
        x="6"
        y="4"
      />
      <rect
        fill="#3965ed"
        height="6"
        rx="1.5"
        stroke="#2446ab"
        strokeWidth="2"
        width="7"
        x="19"
        y="4"
      />
      <rect
        fill="#3965ed"
        height="18"
        rx="3"
        stroke="#2446ab"
        strokeWidth="2"
        width="28"
        x="2"
        y="10"
      />
      <rect fill="#90adff" height="5" rx="1.5" width="22" x="5" y="13" />
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
      <span className="font-sans font-semibold text-[1.35rem] leading-none tracking-tight">
        StudPilot
      </span>
    </span>
  );
}
