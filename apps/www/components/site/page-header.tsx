import type { CSSProperties, ReactNode } from "react";

/** The sky band that opens every inner page. */
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
    <header className="relative isolate overflow-hidden border-lime-edge border-b-4 bg-gradient-to-b from-[#52d0fb] to-[#1c92dd] text-ink">
      <div aria-hidden className="studs absolute -inset-y-[300px] right-0 left-0 -z-10 opacity-30" data-parallax="0.1" />
      <div className="mx-auto w-full max-w-[1200px] px-5 py-14 sm:px-8 lg:py-20">
        <p className="rise inline-block rounded-[4px] border-2 border-ink bg-sun px-2.5 py-1 font-bold text-[12px] tracking-[0.08em] uppercase shadow-[0_3px_0_var(--color-ink)]">
          {kicker}
        </p>
        <h1
          className="outline-text rise mt-4 text-[40px] leading-[1.05] sm:text-[52px] lg:text-[60px]"
          style={{ "--d": "80ms", "--sw": "8px", "--sh": "5px" } as CSSProperties}
        >
          {title}
        </h1>
        {children ? (
          <div className="rise mt-5 max-w-2xl font-medium text-[1.1rem] leading-relaxed" style={{ "--d": "160ms" } as CSSProperties}>
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
