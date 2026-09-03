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
};

export default nextConfig;
