"use client";

import { LogOutIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { supabase, useSession } from "@/lib/supabase";
import { CreditsMeter } from "./credits-meter";
import { useProjects } from "./projects-provider";

export function AppSidebar() {
  const pathname = usePathname();
  const session = useSession();
  const { projects } = useProjects();
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const email = session?.user.email ?? "Account";

  const signOut = async () => {
    await supabase().auth.signOut();
    location.assign("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="border border-sidebar-border"
              tooltip="New chat"
            >
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <PenSquareIcon className="size-4" />
                <span className="font-medium">New chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarInput
          aria-label="Search chats"
          className="group-data-[collapsible=icon]:hidden"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          value={query}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects && shown.length === 0 ? (
                <p className="px-2 py-1 text-sidebar-foreground/60 text-xs">
                  {query ? "No chats match." : "No chats yet."}
                </p>
              ) : null}
              {shown.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/chat/${p.id}`}
                  >
                    <Link
                      href={`/chat/${p.id}`}
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

      <SidebarFooter className="gap-2 border-sidebar-border border-t">
        <CreditsMeter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton data-testid="account-menu">
              <span className="truncate">{email}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOutIcon className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
