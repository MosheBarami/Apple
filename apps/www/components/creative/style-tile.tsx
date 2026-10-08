"use client";
import { PaletteIcon, ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wordmark } from "@/components/site/logo";
import { ThemeToggle } from "./experience";
const TOKENS = [
  { name: "Obsidian", key: "--background" },
  { name: "Glass", key: "--card" },
  { name: "Indigo", key: "--signal" },
  { name: "Cyan", key: "--cyan" },
  { name: "Ink", key: "--foreground" },
];
export function StyleTile() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pressed, setPressed] = useState("");
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const styles = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          TOKENS.map((t) => [t.key, styles.getPropertyValue(t.key).trim()])
        )
      );
    }, 30);
    return () => clearTimeout(timer);
  }, [open, resolvedTheme]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="style-tile-trigger"
      >
        <PaletteIcon className="size-3.5" />
        Design system
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="style-tile">
          <DialogHeader>
            <DialogTitle>Luminous Futurism</DialogTitle>
            <DialogDescription>
              The actual colors, type and controls used throughout StudPilot.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between py-3">
            <Wordmark />
            <ThemeToggle />
          </div>
          <div className="swatch-grid">
            {TOKENS.map((t) => (
              <div key={t.key}>
                <span style={{ background: `var(${t.key})` }} />
                <p>{t.name}</p>
                <code>{values[t.key]?.toUpperCase()}</code>
              </div>
            ))}
          </div>
          <div className="type-spec">
            <p className="studio-eyebrow">
              PLUS JAKARTA SANS / GEIST / GEIST MONO
            </p>
            <h2>
              Ideas deserve
              <br />
              <span className="gradient-text">room to become.</span>
            </h2>
            <p>Body · 16px / 1.7 — a clear voice for every step.</p>
            <code>Caption · 11px / 1.5 — context at a glance.</code>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="studio-button"
              onClick={() => setPressed("Primary button activated")}
            >
              <span>Start building</span>
              <ArrowUpRightIcon className="size-4" />
            </button>
            <button
              type="button"
              className="glass-button"
              onClick={() => setPressed("Secondary button activated")}
            >
              Explore the demo
            </button>
          </div>
          {pressed ? (
            <p role="status" className="text-xs text-cyan">
              <CheckIcon className="inline size-3" /> {pressed}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
