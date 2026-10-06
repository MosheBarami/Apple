"use client";

import {
  BookOpenIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { supabase, useSession } from "@/lib/supabase";

/** Changes the theme with a short colour transition instead of a hard cut. */
function useSmoothTheme() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const change = (next: string) => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
  };
  return { theme: mounted ? (theme ?? "system") : "system", change };
}

export function AccountMenu() {
  const session = useSession();
  const { theme, change } = useSmoothTheme();
  const email = session?.user.email ?? "Account";

  const signOut = async () => {
    await supabase().auth.signOut();
    location.assign("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="h-11 gap-2.5 px-2"
          data-testid="account-menu"
          tooltip="Account"
        >
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground font-medium text-background text-xs uppercase"
          >
            {email.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 min-w-64"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-1 text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={change} value={theme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/docs">
            <BookOpenIcon /> Docs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/pricing">
            <TagIcon /> Pricing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
