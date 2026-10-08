import Link from "next/link";
import { ThemeChoices } from "@/components/creative/experience";
const GROUPS = [
  {
    title: "Product",
    links: [
      ["Workspace", "/app"],
      ["Projects", "/app/projects"],
      ["Prompt library", "/app/library"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Documentation", "/docs"],
      ["Get started", "/docs#pair"],
      ["Studio connection", "/docs#pair"],
      ["Credits", "/docs#credits"],
    ],
  },
  {
    title: "StudPilot",
    links: [
      ["Sign in", "/login"],
      ["Settings", "/app/settings"],
      ["Contact", "mailto:support@studpilot.app"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms of service", "/terms"],
      ["Privacy policy", "/privacy"],
    ],
  },
  {
    title: "Create",
    links: [
      ["New project", "/app"],
      ["Edit a project", "/app/projects"],
      ["Example requests", "/app/library"],
    ],
  },
];
export function SiteFooter() {
  return (
    <footer className="reference-footer">
      <div className="site-container">
        <div className="footer-columns">
          {GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2>{g.title}</h2>
              {g.links.map(([label, href]) => (
                <Link key={label} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getUTCFullYear()} StudPilot · Independent. Not
            affiliated with Roblox Corporation.
          </span>
          <ThemeChoices />
        </div>
      </div>
    </footer>
  );
}
