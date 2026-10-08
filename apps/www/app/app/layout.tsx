import "katex/dist/katex.min.css";
import "./app.css";
import { AppShell } from "@/components/app/app-shell";
import { LegacyAppFrame } from "@/components/legacy-app-frame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LegacyAppFrame>
      <AppShell>{children}</AppShell>
    </LegacyAppFrame>
  );
}
