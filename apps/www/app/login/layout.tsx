import { LegacyAppFrame } from "@/components/legacy-app-frame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LegacyAppFrame>{children}</LegacyAppFrame>;
}
