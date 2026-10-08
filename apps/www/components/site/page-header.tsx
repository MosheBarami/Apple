import type { ReactNode } from "react";
export function PageHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-muted/30">
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:px-8 lg:py-24">
        <p className="studio-eyebrow rise">{kicker}</p>
        <h1 className="rise mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        {children ? (
          <div className="rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
