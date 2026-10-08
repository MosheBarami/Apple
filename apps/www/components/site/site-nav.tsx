"use client";
import { ArrowUpRightIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/creative/experience";
import { Wordmark } from "./logo";
const LINKS = [
  { href: "/#how-it-works", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const read = () => setScrolled(scrollY > 10);
    read();
    addEventListener("scroll", read, { passive: true });
    return () => removeEventListener("scroll", read);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  return (
    <header className={`saas-nav ${scrolled ? "scrolled" : ""}`}>
      <nav className="site-container" aria-label="Main">
        <Link href="/" aria-label="StudPilot, home">
          <Wordmark />
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-actions">
          <ThemeToggle />
          <Link href="/login" className="nav-signin">
            Sign in
          </Link>
          <Link href="/login" className="studio-button is-sm">
            <span>Start building</span>
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>
      <div
        id="mobile-menu"
        inert={!open}
        className={`nav-mobile ${open ? "is-open" : ""}`}
      >
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </Link>
        ))}
        <Link href="/login">Sign in</Link>
      </div>
    </header>
  );
}
