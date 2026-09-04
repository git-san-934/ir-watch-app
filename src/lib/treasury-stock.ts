/**
 * Builds a per-company summary table for treasury stock (自社株買い)
 * buybacks: the announced total planned amount, the cumulative amount
 * purchased so far, and last month's purchased amount.
 *
 * TDnet's disclosure list (src/lib/tdnet.ts) only has titles and links —
 * these figures live inside each disclosure's PDF. So this module
 * downloads the PDFs of each company's most recent buyback-related
 * disclosures and text-parses them for labeled yen amounts.
 *
 * Server-only: statically imports pdf-parse (needs Node's fs/Buffer), so
 * this must never be imported from client code (src/components/**) — the
 * static export build would try to bundle it for the browser and break.
 * Only scripts/fetch-tdnet.ts should import from here; the browser reads
 * the resulting public/treasury-stock-summary.json via
 * fetchTreasuryStockSummary() in src/lib/tdnet.ts instead.
 *
 * This is inherently best-effort. TSE treasury-stock disclosure PDFs
 * follow a conventional layout but wording varies company to company,
 * and this environment's outbound network restrictions meant the
 * patterns below could not be checked against a real filing — expect to
 * tune parseBuybackPdfText() after seeing it run against live data.
 */
import pdfParse from "pdf-parse";
import {
  filterTreasuryStockDisclosures,
  normalizeCode,
  type Disclosure,
  type TreasuryStockSummaryRow,
} from "./tdnet";

export interface ParsedBuybackFigures {
  totalPlannedAmountYen: number | null;
  cumulativeAmountYen: number | null;
  periodAmountYen: number | null;
}

function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/**
 * Pure text parser — no network/PDF involved, so this is the part unit
 * tests can actually exercise. Looks for a labeled amount ("取得価額の
 * 総額 ... 円" etc.) rather than an exact phrase, since real filings pad
 * the text between the label and the number with things like "(上限)"
 * or full-width spaces.
 */
export function parseBuybackPdfText(rawText: string): ParsedBuybackFigures {
  const text = toHalfWidthDigits(rawText)
    .replace(/[，]/g, ",")
    .replace(/\s+/g, "");

  function findAmount(labelPattern: RegExp): number | null {
    const match = text.match(labelPattern);
    if (!match) return null;
    const digits = match[1].replace(/,/g, "");
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return {
    totalPlannedAmountYen: findAmount(/取得価額の総額[^0-9]{0,12}([0-9,]{4,})円/),
    cumulativeAmountYen: findAmount(/累計(?:の)?取得価額[^0-9]{0,12}([0-9,]{4,})円/),
    periodAmountYen: findAmount(
      /(?:当月中|当該報告期間中|報告期間中)[^0-9]{0,20}取得価額[^0-9]{0,12}([0-9,]{4,})円/
    ),
  };
}

export interface ExtractPdfText {
  (buffer: ArrayBuffer): Promise<string>;
}

async function defaultExtractPdfText(buffer: ArrayBuffer): Promise<string> {
  const data = await pdfParse(Buffer.from(buffer));
  return data.text;
}

export interface BuildTreasuryStockSummaryOptions {
  fetchImpl?: typeof fetch;
  extractPdfText?: ExtractPdfText;
  /** How many of a company's most recent buyback disclosures to try before giving up on it. */
  maxDisclosuresPerCompany?: number;
  /** Total PDF downloads allowed across the whole run, so a busy market day can't blow up CI time. */
  maxTotalPdfFetches?: number;
  timeoutMs?: number;
}

/**
 * `disclosures` should be the full snapshot (all companies), not
 * pre-filtered — this does the treasury-stock filtering itself.
 */
export async function buildTreasuryStockSummary(
  disclosures: Disclosure[],
  options: BuildTreasuryStockSummaryOptions = {}
): Promise<TreasuryStockSummaryRow[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const extractPdfText = options.extractPdfText ?? defaultExtractPdfText;
  const maxPerCompany = options.maxDisclosuresPerCompany ?? 3;
  const maxTotalFetches = options.maxTotalPdfFetches ?? 400;
  const timeoutMs = options.timeoutMs ?? 20_000;

  const treasuryDisclosures = filterTreasuryStockDisclosures(disclosures)
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Group by company, newest disclosure first, capped per company. Map
  // insertion order follows the sort above, so companies with the most
  // recent activity are processed first if maxTotalPdfFetches is hit.
  const byCompany = new Map<string, Disclosure[]>();
  for (const d of treasuryDisclosures) {
    const code = normalizeCode(d.code);
    const list = byCompany.get(code) ?? [];
    if (list.length < maxPerCompany) {
      list.push(d);
      byCompany.set(code, list);
    }
  }

  let fetchesRemaining = maxTotalFetches;
  const rows: TreasuryStockSummaryRow[] = [];

  // One-off debugging aid: when DEBUG_TREASURY_PDF_TEXT=true (set via the
  // deploy.yml workflow_dispatch "debug_pdf" input), print a sample of
  // each PDF's extracted text so parseBuybackPdfText's label patterns can
  // be tuned against what TDnet filings actually say — this couldn't be
  // observed from the sandbox this code was originally written in.
  const debugPdfText = process.env.DEBUG_TREASURY_PDF_TEXT === "true";
  let debugSamplesLogged = 0;
  const DEBUG_SAMPLE_LIMIT = 8;
  const DEBUG_SAMPLE_CHARS = 4000;

  for (const [code, companyDisclosures] of byCompany) {
    if (fetchesRemaining <= 0) break;

    let totalPlannedAmountYen: number | null = null;
    let cumulativeAmountYen: number | null = null;
    let lastMonthAmountYen: number | null = null;

    for (const disclosure of companyDisclosures) {
      if (fetchesRemaining <= 0) break;
      const haveEverything =
        totalPlannedAmountYen !== null &&
        cumulativeAmountYen !== null &&
        lastMonthAmountYen !== null;
      if (haveEverything) break;

      fetchesRemaining -= 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(disclosure.url, { signal: controller.signal });
        if (!res.ok) continue;
        const buffer = await res.arrayBuffer();
        const text = await extractPdfText(buffer);
        const parsed = parseBuybackPdfText(text);

        if (debugPdfText && debugSamplesLogged < DEBUG_SAMPLE_LIMIT) {
          debugSamplesLogged += 1;
          console.log(
            `\n===== DEBUG PDF TEXT SAMPLE ${debugSamplesLogged}/${DEBUG_SAMPLE_LIMIT} =====\n` +
              `code=${code} title=${JSON.stringify(disclosure.title)} url=${disclosure.url}\n` +
              `parsed=${JSON.stringify(parsed)}\n` +
              `--- text (first ${DEBUG_SAMPLE_CHARS} chars) ---\n` +
              `${text.slice(0, DEBUG_SAMPLE_CHARS)}\n` +
              `===== END SAMPLE =====\n`
          );
        }

        totalPlannedAmountYen ??= parsed.totalPlannedAmountYen;
        cumulativeAmountYen ??= parsed.cumulativeAmountYen;
        lastMonthAmountYen ??= parsed.periodAmountYen;
      } catch (err) {
        console.warn(`Failed to parse buyback PDF for ${code} (${disclosure.url}):`, err);
      } finally {
        clearTimeout(timeout);
      }
    }

    rows.push({
      code,
      companyName: companyDisclosures[0].companyName,
      totalPlannedAmountYen,
      cumulativeAmountYen,
      lastMonthAmountYen,
      latestDisclosureAt: companyDisclosures[0].publishedAt,
      sourceUrl: companyDisclosures[0].url,
    });
  }

  return rows.sort(
    (a, b) => new Date(b.latestDisclosureAt).getTime() - new Date(a.latestDisclosureAt).getTime()
  );
}
