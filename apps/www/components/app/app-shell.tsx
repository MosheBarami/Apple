"use client";

import type { CSSProperties, ReactNode } from "react";
import { Toaster } from "sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";
import { ProjectsProvider } from "./projects-provider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ProjectsProvider>
        <SidebarProvider
          style={{ "--sidebar-width": "220px" } as CSSProperties}
        >
          <a
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 z-50 bg-background p-3"
            href="#workspace-main"
          >
            Skip to workspace
          </a>
          <AppSidebar />
          <SidebarInset className="workspace-shell border-sidebar-border border bg-background">
            <Toaster position="top-center" theme="system" />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ProjectsProvider>
    </TooltipProvider>
  );
}
