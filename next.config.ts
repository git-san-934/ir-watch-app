import type { NextConfig } from "next";

// Served from https://git-san-934.github.io/ir-watch-app/ as a GitHub
// Pages project site, so the build needs a "/ir-watch-app" base path.
// Local dev/preview builds keep the root path (GITHUB_PAGES unset).
const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPagesBuild ? "/ir-watch-app" : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  // Inlined into client code so a manual fetch() of a public/ asset (e.g.
  // tdnet-disclosures.json) can build the right same-origin URL — Next
  // does NOT rewrite plain fetch() calls the way it does <Image>/<Script>.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
