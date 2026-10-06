import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // OpenNext on Cloudflare bundles the middleware from Next's traced files; Next's optional tracer import is not traced.
  outputFileTracingIncludes: { "/*": ["./node_modules/@opentelemetry/api/**/*"] },
  experimental: {
    inlineCss: true,
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
