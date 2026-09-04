/**
 * Fetches recently-submitted EDINET filings (有価証券報告書・四半期報告書・
 * 半期報告書, all listed companies, not just any one visitor's watchlist)
 * and writes them to public/edinet-filings.json so the static site can
 * read them same-origin at runtime. See src/lib/edinet.ts for why this is
 * a separate data source from TDnet.
 *
 * Run via `npx tsx scripts/fetch-edinet.ts`. See .github/workflows/deploy.yml
 * for how this fits into the build.
 *
 * Requires an EDINET_API_KEY env var (a free EDINET API v2 Subscription-Key
 * — see README for how to obtain one). This is a newer, optional data
 * source layered on top of the existing TDnet-based site, so a missing key
 * only skips this step (leaving public/edinet-filings.json unwritten,
 * which src/lib/edinet.ts's snapshot loader treats as "not built yet")
 * rather than failing the whole deploy the way a broken TDnet fetch does.
 *
 * DAYS is the same kind of safety margin as fetch-tdnet.ts's: the browser
 * (src/lib/watchlist.ts) merges every matching filing it sees into a
 * permanent per-visitor archive in localStorage, so once a filing has
 * been fetched at least once it's kept regardless of DAYS.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRecentFilings } from "../src/lib/edinet";

const DAYS = 30;

async function main() {
  if (!process.env.EDINET_API_KEY) {
    console.warn(
      "EDINET_API_KEY is not set — skipping EDINET filings fetch. " +
        "See README for how to obtain a free EDINET API subscription key and add it as a repo secret."
    );
    return;
  }

  const filings = await fetchRecentFilings(DAYS);

  const outDir = path.join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "edinet-filings.json");

  writeFileSync(
    outPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      days: DAYS,
      filings,
    })
  );

  console.log(`Wrote ${filings.length} EDINET filings (last ${DAYS} days) to ${outPath}`);
}

main().catch((err) => {
  console.error("Failed to fetch EDINET filings:", err);
  process.exit(1);
});
