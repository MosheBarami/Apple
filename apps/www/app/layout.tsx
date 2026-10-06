import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "StudPilot is a co-pilot that builds parts of your game inside your Roblox Studio: screens, systems, props and areas.",
  metadataBase: new URL("https://studpilot.app"),
  title: {
    default: "StudPilot: a co-pilot that builds inside Roblox Studio",
    template: "%s | StudPilot",
  },
  openGraph: {
    siteName: "StudPilot",
    type: "website",
  },
};

const geist = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist",
});

const fredoka = Fredoka({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["500", "600", "700"],
});

// Code and tool names in the app only: not preloaded, so it does not compete with the landing's first paint.
const geistMono = Geist_Mono({
  display: "swap",
  preload: false,
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const LIGHT_THEME_COLOR = "hsl(0 0% 100%)";
const DARK_THEME_COLOR = "hsl(240deg 10% 3.92%)";
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
    <html
      className={`${geist.variable} ${geistMono.variable} ${fredoka.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "Required"
          dangerouslySetInnerHTML={{
            __html: THEME_COLOR_SCRIPT,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
