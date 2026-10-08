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
        <SidebarProvider className="studpilot-app" style={{ "--sidebar-width": "232px" } as CSSProperties}>
          <a
            className="sr-only z-50 bg-background p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
            href="#workspace-main"
          >
            Skip to content
          </a>
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-background">
            <Toaster position="bottom-right" theme="system" />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ProjectsProvider>
    </TooltipProvider>
  );
}
