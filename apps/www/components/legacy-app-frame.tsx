import { AtmosphereProvider } from "@/components/creative/atmosphere";

import "@/app/legacy-app.css";
import "@/app/uiverse.css";
import "@/app/luminous.css";
import "@/app/assembly.css";

/** The pre-rebuild app styles and ambient-motion context, kept for the app routes only (app/app, login,
 *  dev/app) after the 2026-10-08 site rebuild took them out of the root layout. The app rebuild deletes this. */
export function LegacyAppFrame({ children }: { children: React.ReactNode }) {
  return <AtmosphereProvider>{children}</AtmosphereProvider>;
}
