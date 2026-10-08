"use client";

import { Wordmark } from "@/components/site/logo";
import Link from "next/link";
import { ThemeToggle } from "./experience";

export function StyleTile() {
  return (
    <details className="style-tile">
      <summary>
        Workspace style <span>Luminous studio</span>
      </summary>
      <div className="style-tile-body">
        <Wordmark />
        <div className="style-swatches">
          {[
            ["Canvas", "--background"],
            ["Surface", "--card"],
            ["Violet", "--signal"],
            ["Ice", "--cyan"],
            ["Text", "--foreground"],
          ].map(([name, token]) => (
            <div key={token}>
              <i style={{ background: `var(${token})` }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <p className="style-type-display">Think it. Build it.</p>
        <p className="style-type-body">A clear space for your next idea.</p>
        <div className="style-tile-actions">
          <Link className="studio-button is-sm" href="/app">
            Create something
          </Link>
          <Link className="glass-button" href="/docs">
            Read the guide
          </Link>
        </div>
        <div className="style-tile-controls">
          <span>Preview the other theme</span>
          <ThemeToggle />
        </div>
      </div>
    </details>
  );
}
