import type { CSSProperties, ElementType, ReactNode } from "react";

/** Fades and slides its children in when they scroll into view (see LandingFx). */
export function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
  from = "up",
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: "up" | "left" | "right" | "scale";
}) {
  return (
    <Tag
      className={className}
      data-reveal={from === "up" ? "" : from}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
