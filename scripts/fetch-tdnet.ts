/**
 * Fetches recent TDnet disclosures (all listed companies, not just any
 * one visitor's watchlist) and writes them to public/tdnet-disclosures.json
 * so the static site can read them same-origin at runtime.
 *
 * This has to run server-side (CI), not in the browser: the TDnet mirror
 * API does not send CORS headers, so a direct browser fetch is blocked
 * (confirmed against the deployed site — see console errors referencing
 * "No 'Access-Control-Allow-Origin' header").
 *
 * Run via `npx tsx scripts/fetch-tdnet.ts`. See .github/workflows/deploy.yml
 * for how this fits into the build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRecentDisclosures } from "../src/lib/tdnet";

const DAYS = 7;

async function main() {
  const disclosures = await fetchRecentDisclosures(DAYS);

  const outDir = path.join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "tdnet-disclosures.json");

  writeFileSync(
    outPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      days: DAYS,
      disclosures,
    })
  );

  console.log(`Wrote ${disclosures.length} disclosures (last ${DAYS} days) to ${outPath}`);
}

main().catch((err) => {
  console.error("Failed to fetch TDnet disclosures:", err);
  process.exit(1);
});
