import { SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AmbientField } from "@/components/creative/experience";
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
    <header className="inner-page-header">
      <AmbientField />
      <div className="site-container relative">
        <p className="studio-eyebrow rise">
          <SparklesIcon className="size-3" />
          {kicker}
        </p>
        <h1 className="rise">{title}</h1>
        {children ? <div className="rise">{children}</div> : null}
      </div>
    </header>
  );
}
