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
 *
 * This window is just a safety margin, not the retention policy: the
 * browser (src/lib/watchlist.ts) merges every matching disclosure it
 * sees into a permanent per-visitor archive in localStorage, so once
 * something has been fetched at least once it's kept until dismissed
 * regardless of DAYS. DAYS only matters for a visitor who hasn't opened
 * the site in longer than this many days — anything published entirely
 * within that gap is missed, since there's no server keeping a longer
 * history. 30 days balances that risk against build time / file size.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRecentDisclosures } from "../src/lib/tdnet";
import { buildTreasuryStockSummary } from "../src/lib/treasury-stock";

const DAYS = 30;

async function main() {
  const disclosures = await fetchRecentDisclosures(DAYS);

  const outDir = path.join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });

  const generatedAt = new Date().toISOString();

  const disclosuresPath = path.join(outDir, "tdnet-disclosures.json");
  writeFileSync(
    disclosuresPath,
    JSON.stringify({
      generatedAt,
      days: DAYS,
      disclosures,
    })
  );
  console.log(
    `Wrote ${disclosures.length} disclosures (last ${DAYS} days) to ${disclosuresPath}`
  );

  // Best-effort: individual PDF fetch/parse failures are swallowed inside
  // buildTreasuryStockSummary (left as null fields), so this only throws
  // on something unexpected.
  const treasuryRows = await buildTreasuryStockSummary(disclosures);
  const treasuryPath = path.join(outDir, "treasury-stock-summary.json");
  writeFileSync(treasuryPath, JSON.stringify({ generatedAt, rows: treasuryRows }));
  console.log(
    `Wrote treasury-stock summary for ${treasuryRows.length} companies to ${treasuryPath}`
  );
}

main().catch((err) => {
  console.error("Failed to fetch TDnet disclosures:", err);
  process.exit(1);
});
