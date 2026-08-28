import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep LangSmith's AsyncLocalStorage tracer out of the bundler.
  serverExternalPackages: ["langsmith"],
};

export default nextConfig;
