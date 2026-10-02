import type { NextConfig } from "next";

const config: NextConfig = {
  // Tool runs only on 127.0.0.1; keep the server runtime lean.
  serverExternalPackages: ["minisearch"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  devIndicators: false,
  agentRules: false, // do not auto-generate AGENTS.md/CLAUDE.md into this folder
};

export default config;
