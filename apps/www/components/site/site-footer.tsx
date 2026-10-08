import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { StyleTile } from "@/components/creative/style-tile";
import { SUPPORT_EMAIL } from "@/lib/site-data";
import { Wordmark } from "./logo";
export function SiteFooter() {
  return (
    <footer className="saas-footer">
      <div className="site-container">
        <div className="footer-top">
          <div>
            <Wordmark />
            <p>
              A little more imagination.
              <br />A lot more possibility.
            </p>
          </div>
          <nav aria-label="Product">
            <p>Explore</p>
            <Link href="/docs">Documentation</Link>
            <Link href="/pricing">Plans & credits</Link>
            <Link href="/login">Your workspace</Link>
          </nav>
          <nav aria-label="Legal">
            <p>The important things</p>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              Get in touch <ArrowUpRightIcon className="size-3" />
            </a>
          </nav>
          <div className="footer-design">
            <span className="footer-signal">
              <i />
              Always room for your next idea.
            </span>
            <StyleTile />
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getUTCFullYear()} StudPilot</span>
          <span>
            Independent. Made for Roblox Studio. Not affiliated with Roblox
            Corporation.
          </span>
        </div>
      </div>
    </footer>
  );
}
