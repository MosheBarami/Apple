import type { Metadata } from "next";
import { DocView } from "@/components/site/docs/doc-view";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to use StudPilot: install the plugin, connect Studio, write requests, follow the agent, undo runs, and guides for every kind of build.",
  alternates: { canonical: "/docs" },
};

export default function DocsHome() {
  return <DocView slug="overview" />;
}
