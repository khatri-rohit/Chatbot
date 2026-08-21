import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf.js out of the Next bundle so it can load pdf.worker.mjs from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
