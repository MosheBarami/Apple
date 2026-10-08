import { cn } from "@/lib/utils";
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("size-6 shrink-0", className)}
      viewBox="0 0 32 32"
    >
      <path d="M5 10 16 4l11 6v15l-11 6-11-6V10Z" fill="currentColor" />
      <path
        d="m5 10 11 6 11-6M16 16v15"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1.8"
      />
      <path d="m10 7 5-3 5 3-5 3-5-3Z" fill="var(--background)" />
      <path d="m18 11 5-3 5 3-5 3-5-3Z" fill="var(--background)" />
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
    <span className={cn("wordmark", className)}>
      <LogoMark className={markClassName} />
      <span>STUDPILOT</span>
    </span>
  );
}
