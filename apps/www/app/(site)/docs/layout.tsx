import { DocsSidebar } from "@/components/site/docs/docs-nav";
import { NAV_SECTIONS } from "@/components/site/docs/doc-view";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-container flex">
      <DocsSidebar sections={NAV_SECTIONS} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
