import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site-data";
import { Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "What it does" },
      { href: "/#how", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs", label: "Getting started" },
      { href: "/docs/build-an-interface", label: "Guides" },
      { href: "/docs/plugin", label: "Studio plugin" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: `mailto:${SUPPORT_EMAIL}`, label: "Contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="site-container grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col items-start gap-4">
          <Wordmark />
          <p className="max-w-[30ch] text-[14px] text-muted-foreground leading-relaxed">
            AI for Roblox. Describe it, and it is built in your place in Studio.
          </p>
          <ThemeToggle />
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="font-medium text-[13px] text-foreground tracking-normal">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link className="text-[14px] text-muted-foreground transition-colors duration-150 hover:text-foreground" href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="site-container flex flex-col gap-2 py-6 text-[13px] text-muted-foreground sm:flex-row sm:justify-between">
          <p>© 2026 StudPilot</p>
          <p>Not affiliated with or endorsed by Roblox Corporation.</p>
        </div>
      </div>
    </footer>
  );
}
