"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { ProjectsProvider } from "./projects-provider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProjectsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Toaster position="top-center" theme="system" />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </ProjectsProvider>
  );
}
