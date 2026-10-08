import "katex/dist/katex.min.css";
import "./app.css";
import { AppShell } from "@/components/app/app-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>{children}</AppShell>
  );
}
