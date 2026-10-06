"use client";

import { PenSquareIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Wordmark } from "@/components/site/logo";
import { AccountMenu } from "./account-menu";
import { CreditsMeter } from "./credits-meter";
import { useProjects } from "./projects-provider";

export function AppSidebar() {
  const pathname = usePathname();
  const { projects } = useProjects();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  return (
    <Sidebar aria-label="Chats and account" collapsible="icon" role="complementary">
      <SidebarHeader className="gap-3 p-3">
        <Link
          aria-label="StudPilot"
          className="flex h-8 items-center rounded-md px-1 text-sidebar-foreground transition-opacity hover:opacity-80 group-data-[collapsible=icon]:hidden"
          href="/app"
          onClick={() => setOpenMobile(false)}
        >
          <Wordmark markClassName="size-6" />
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-9 border border-sidebar-border bg-background shadow-card transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:bg-background hover:shadow-float active:translate-y-0"
              tooltip="New chat"
            >
              <Link href="/app" onClick={() => setOpenMobile(false)}>
                <PenSquareIcon className="size-4" />
                <span className="font-medium">New chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="relative group-data-[collapsible=icon]:hidden">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <SidebarInput
            aria-label="Search chats"
            className="h-9 pl-8"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            value={query}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects && shown.length === 0 ? (
                <p className="px-2 py-1 text-sidebar-foreground/70 text-xs">
                  {query ? "No chats match." : "No chats yet."}
                </p>
              ) : null}
              {projects === null
                ? [0, 1, 2].map((i) => (
                    <li
                      className="mx-2 my-1 h-7 animate-pulse rounded-md bg-sidebar-accent"
                      key={i}
                    />
                  ))
                : null}
              {shown.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    asChild
                    className="h-8 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                    isActive={pathname === `/app/chat/${p.id}`}
                  >
                    <Link
                      href={`/app/chat/${p.id}`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <span className="truncate">{p.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-sidebar-border border-t p-3">
        <CreditsMeter />
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
