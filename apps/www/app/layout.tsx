import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { AtmosphereProvider } from "@/components/creative/atmosphere";

import "./globals.css";
import "./uiverse.css";
import "./luminous.css";

export const metadata: Metadata = {
  description:
    "StudPilot is a co-pilot that builds parts of your game inside your Roblox Studio: screens, systems, props and areas.",
  metadataBase: new URL("https://studpilot.app"),
  openGraph: {
    siteName: "StudPilot",
    type: "website",
  },
  title: {
    default: "StudPilot: a co-pilot that builds inside Roblox Studio",
    template: "%s | StudPilot",
  },
};

const LIGHT_THEME_COLOR = "#f1f3fb";
const DARK_THEME_COLOR = "#080b14";
const THEME_COLOR_SCRIPT = `\
(function() {
  var html = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  function updateThemeColor() {
    var isDark = html.classList.contains('dark');
    meta.setAttribute('content', isDark ? '${DARK_THEME_COLOR}' : '${LIGHT_THEME_COLOR}');
  }
  var observer = new MutationObserver(updateThemeColor);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  updateThemeColor();
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required"
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased" data-ui-library="uiverse">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AtmosphereProvider>{children}</AtmosphereProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
