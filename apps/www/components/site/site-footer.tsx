import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/site-data";
import { Wordmark } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/pricing", label: "Pricing" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative border-lime border-t-4 bg-ink text-white">
      <div className="studs pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      <div className="relative mx-auto grid w-full max-w-[1200px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-[0.95rem] text-white/75 leading-relaxed">
            A co-pilot that builds parts of your game inside your Roblox Studio.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav aria-label={col.title} key={col.title}>
            <h2 className="font-display font-semibold text-lg text-sun">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    className="inline-block text-white/80 transition-all duration-200 hover:translate-x-0.5 hover:text-white hover:underline hover:decoration-lime hover:decoration-2 hover:underline-offset-4"
                    href={l.href}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <h2 className="font-display font-semibold text-lg text-sun">Support</h2>
          <p className="mt-3">
            <a
              className="text-white/80 underline decoration-lime decoration-2 underline-offset-4 transition-colors hover:text-white"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
      <div className="relative border-white/10 border-t">
        <p className="mx-auto w-full max-w-[1200px] px-5 py-5 text-sm text-white/70 sm:px-8">
          StudPilot is in beta. It is an independent product and is not affiliated with or endorsed
          by Roblox Corporation. Made for Roblox Studio.
        </p>
      </div>
    </footer>
  );
}
