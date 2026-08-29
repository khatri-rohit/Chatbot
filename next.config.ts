import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['langsmith', 'langium', '@mermaid-js/parser'],
  transpilePackages: ['shiki'],
  turbopack: {
    resolveAlias: {
      'vscode-jsonrpc': { browser: './lib/empty.ts' },
      langium: { browser: './lib/empty.ts' },
    },
  },
};

export default nextConfig;
