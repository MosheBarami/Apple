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
    <header className="reference-page-header site-container">
      <p>{kicker}</p>
      <h1>{title}</h1>
      {children ? <div>{children}</div> : null}
    </header>
  );
}
