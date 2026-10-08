import { cn } from "@/lib/utils";
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("logo-mark size-7 shrink-0", className)}
      viewBox="0 0 32 32"
    >
      <path d="M16 2 29 9.5v13L16 30 3 22.5v-13L16 2Z" fill="var(--signal)" />
      <path
        d="M16 5 26 11v10l-10 6-10-6V11l10-6Z"
        fill="none"
        stroke="white"
        strokeOpacity=".22"
      />
      <path d="m10 11 6-3.5 6 3.5v7l-6 3.5V15l-6-4Z" fill="white" />
      <path d="m16 15 6-4v7l-6 3.5V15Z" fill="var(--cyan)" />
      <path d="M10 11v12l6 3.5v-12L10 11Z" fill="white" fillOpacity=".8" />
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
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-xl font-semibold tracking-[-.035em]">
        StudPilot<span className="logo-dot">.</span>
      </span>
    </span>
  );
}
