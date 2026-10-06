"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { StudioLight } from "./studio-light";

export function TopBar({
  title,
  projectId,
  openStudioOnMount,
}: {
  title: string;
  projectId: string | null;
  openStudioOnMount?: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-border border-b bg-background/85 px-3 backdrop-blur">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <h1 className="min-w-0 flex-1 truncate font-medium text-sm">{title}</h1>
      <StudioLight openOnMount={openStudioOnMount} projectId={projectId} />
    </header>
  );
}
