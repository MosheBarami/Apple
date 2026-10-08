"use client";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
export function ThemeChoices() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="theme-choices" role="group" aria-label="Appearance">
      {[
        { value: "system", label: "System", icon: MonitorIcon },
        { value: "light", label: "Light", icon: SunIcon },
        { value: "dark", label: "Dark", icon: MoonIcon },
      ].map((t) => (
        <button
          type="button"
          key={t.value}
          aria-pressed={mounted && theme === t.value}
          onClick={() => setTheme(t.value)}
        >
          <t.icon />
          {t.label}
        </button>
      ))}
    </div>
  );
}
