import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inline the public release marker; the Worker does not inherit the build shell's env.
  env: {
    STUDPILOT_WEB_BUILD_SHA: process.env.STUDPILOT_WEB_BUILD_SHA ?? "development",
  },
  // Keep production-preview verification separate from the running development server.
  distDir: process.env.STUDPILOT_PREVIEW_DIST_DIR || ".next",
  devIndicators: false,
  // OpenNext on Cloudflare bundles the middleware from Next's traced files; Next's optional tracer import is not traced.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@opentelemetry/api/**/*"],
  },
  experimental: {
    inlineCss: true,
    // Opt out on constrained local review machines; production builds are unchanged.
    turbopackFileSystemCacheForDev: process.env.STUDPILOT_LOW_DISK !== "1",
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  poweredByHeader: false,
  reactCompiler: true,
};

export default nextConfig;
