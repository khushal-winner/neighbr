import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Required for docker/Dockerfile.web (standalone server bundle)
  output: "standalone",

  // Monorepo root — avoids tracing entire repo on every compile
  outputFileTracingRoot: path.join(__dirname, "../.."),

  experimental: {
    // Smaller dev bundles / less memory for icon imports
    optimizePackageImports: ["lucide-react"],
  },

  // Next 16 uses Turbopack for `next build` by default; webpack is dev-only below.
  turbopack: {},

  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: ["**/node_modules/**", "**/.git/**"],
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
