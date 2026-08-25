/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @jaypos/shared is published as source TypeScript (no build step); Next must
  // transpile it. See MONOREPO_STRATEGY.md §3.
  transpilePackages: ['@jaypos/shared'],
  eslint: {
    // Phase 1: keep the first build green without an ESLint config. Type errors
    // still fail the build (typescript.ignoreBuildErrors stays false).
    // TODO(phase-1-cleanup): add eslint-config-next and remove this.
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;
