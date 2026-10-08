"use client";
import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "./logo";
import { MotionControl } from "@/components/creative/atmosphere";
const MENUS = [
  {
    label: "Create",
    links: [
      ["Interfaces", "/app/library"],
      ["Systems", "/app/library"],
      ["Worlds", "/app/library"],
      ["Edit a project", "/app/projects"],
    ],
  },
  {
    label: "Product",
    links: [
      ["The workspace", "/product"],
      ["Studio connection", "/docs#pair"],
      ["Projects", "/app/projects"],
    ],
  },
  {
    label: "Resources",
    links: [
      ["Documentation", "/docs"],
      ["Getting started", "/docs#pair"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
];
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, []);
  return (
    <header className="reference-nav">
      <nav className="site-container" aria-label="Main">
        <Link href="/" aria-label="StudPilot, home">
          <Wordmark />
        </Link>
        <div className="reference-nav-links">
          {MENUS.slice(0, 2).map((menu) => (
            <DropdownMenu key={menu.label}>
              <DropdownMenuTrigger className="nav-menu-trigger">
                {menu.label}
                <span>↓</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="reference-menu" align="start">
                {menu.links.map(([label, href]) => (
                  <DropdownMenuItem key={label} asChild>
                    <Link href={href}>{label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          <Link href="/docs#pair">Studio</Link>
          <Link href="/pricing">Pricing</Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="nav-menu-trigger">
              Resources<span>↓</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="reference-menu">
              {MENUS[2].links.map(([label, href]) => (
                <DropdownMenuItem key={label} asChild>
                  <Link href={href}>{label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="reference-nav-actions">
          <MotionControl />
          <Link href="/login" className="nav-signin">
            Sign in
          </Link>
          <Link href="/docs" className="nav-secondary">
            Get started
          </Link>
          <Link href="/app" className="nav-primary">
            Open app
          </Link>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-controls="mobile-menu"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>
      <div
        className={`nav-mobile ${open ? "is-open" : ""}`}
        id="mobile-menu"
        inert={!open}
      >
        {[
          ["Product", "/product"],
          ["Studio", "/docs#pair"],
          ["Pricing", "/pricing"],
          ["Docs", "/docs"],
          ["Sign in", "/login"],
        ].map(([label, href]) => (
          <Link key={label} href={href} onClick={() => setOpen(false)}>
            {label}
          </Link>
        ))}
      </div>
    </header>
  );
}
