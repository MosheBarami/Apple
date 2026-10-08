"use client";

import {
  BookOpenIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { supabase, useSession } from "@/lib/supabase";

export function AccountMenu() {
  const session = useSession();
  const email = session?.user.email ?? "Account";

  const signOut = async () => {
    await supabase().auth.signOut();
    location.assign("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-10 gap-2.5 px-2" data-testid="account-menu" tooltip="Account">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground font-medium text-[11px] text-background uppercase"
          >
            {email.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{email}</span>
          <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top" sideOffset={8}>
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground text-xs">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
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
