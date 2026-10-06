"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";
import { ProjectsProvider } from "./projects-provider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ProjectsProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="border-sidebar-border border-l bg-background">
            <Toaster position="top-center" theme="system" />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ProjectsProvider>
    </TooltipProvider>
  );
}
