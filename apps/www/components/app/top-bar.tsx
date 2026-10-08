"use client";

import { ThemeToggle } from "@/components/creative/experience";
import { MotionControl } from "@/components/creative/atmosphere";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { StudioLight } from "./studio-light";

export function TopBar({
  title,
  projectId,
  openStudioOnMount,
  active = false,
}: {
  title: string;
  projectId: string | null;
  openStudioOnMount?: boolean;
  active?: boolean;
}) {
  return (
    <header className="agent-topbar">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-medium text-sm">{title}</h1>
      </div>
      {active ? (
        <span
          className="mr-2 flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-signal" />
          <span className="hidden sm:inline">Working</span>
        </span>
      ) : null}

      <MotionControl />
      <ThemeToggle />
      <StudioLight openOnMount={openStudioOnMount} projectId={projectId} />
    </header>
  );
}
