"use client";

import { HomeIcon, PlusIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/site/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountMenu } from "./account-menu";
import { useProjects } from "./projects-provider";

const RECENT = 12;

export function AppSidebar() {
  const pathname = usePathname();
  const { projects, error, refresh } = useProjects();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const recent = (projects ?? []).slice(0, RECENT);

  return (
    <Sidebar aria-label="Projects and account" collapsible="icon">
      <SidebarHeader className="gap-2 p-3">
        <Link
          aria-label="StudPilot home"
          className="flex h-8 items-center rounded-md px-1.5 text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          href="/app"
          onClick={close}
        >
          <Wordmark markClassName="size-5" />
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-8 border border-sidebar-border bg-background" tooltip="New project">
              <Link href="/app?new=1" onClick={close}>
                <PlusIcon className="size-4" />
                <span className="font-medium">New project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/app"} tooltip="Projects">
                <Link href="/app" onClick={close}>
                  <HomeIcon className="size-4" />
                  <span>Projects</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/app/settings"} tooltip="Settings">
                <Link href="/app/settings" onClick={close}>
                  <SettingsIcon className="size-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {error ? (
                <li className="px-2 py-1 text-muted-foreground text-xs">
                  Projects did not load.{" "}
                  <button className="underline underline-offset-2" onClick={refresh} type="button">
                    Retry
                  </button>
                </li>
              ) : null}
              {projects === null && !error
                ? [0, 1, 2].map((i) => (
                    <li className="flex h-8 items-center px-2" key={i}>
                      <Skeleton className="h-3.5" style={{ width: `${72 - i * 14}%` }} />
                    </li>
                  ))
                : null}
              {projects && projects.length === 0 ? (
                <li className="px-2 py-1 text-muted-foreground text-xs">No projects yet.</li>
              ) : null}
              {recent.map((p) => {
                const href = `/app/projects/${p.id}`;
                return (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton asChild className="h-8" isActive={pathname === href}>
                      <Link href={href} onClick={close}>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
