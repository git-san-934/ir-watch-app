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
 * follow a conventional layout but wording varies company to company.
 * The label patterns below were tuned against 8 real filings pulled via
 * this file's own DEBUG_TREASURY_PDF_TEXT logging (see
 * buildTreasuryStockSummary) — that couldn't be done from the sandbox
 * this code was first written in, so treat this as a first real pass
 * rather than exhaustively validated; more filing variants may still
 * need handling as they show up.
 *
 * A key finding from those samples: the label "(株式の)取得価額の総額"
 * appears up to three times in the same monthly progress-report PDF —
 * once for the reporting month itself, once for the board resolution's
 * upper limit, and once for the cumulative-to-date total — with no
 * label text distinguishing them. What does distinguish them:
 *   - the upper-limit one is usually suffixed with "上限" nearby
 *     ("...円（上限）" / "...円（上限とする）")
 *   - failing that, it's often instead introduced by a heading recapping
 *     the original board resolution, e.g. "◯年◯月◯日開催の取締役会に
 *     おける決議内容" or "自己株式の取得に関する決議内容（過去開催
 *     取締役会）" — the resolution's total plan amount follows shortly
 *     after, again without "上限" directly on it
 *   - the cumulative one follows a "累計" heading, typically within a
 *     couple hundred characters
 *   - the reporting-month one is whichever is left — normally the
 *     first occurrence in the document, since it appears before the
 *     "（ご参考）" section that carries the other two
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

const AMOUNT_LABEL = "取得価額の総額";
// Real filings sometimes state the amount in 百万円 (millions) instead of
// 円 directly (e.g. "2,000百万円"), especially for very large buybacks.
const AMOUNT_AFTER_LABEL = /^[^0-9]{0,15}([0-9,]{1,15})(百万)?円/;
const UPPER_LIMIT_MARKER = /^[^0-9]{0,6}上限/;
// How far a "累計" heading can precede its amount and still count as
// governing it — generous enough to span the item's own sub-heading
// and numbering (e.g. "(2026年8月31日現在)(1)取得した株式の総数…株(2)")
// without being so wide it could pick up an unrelated later occurrence.
const CUMULATIVE_HEADING_WINDOW = 200;

// Fallback for the plan-total amount when it isn't marked "上限": a
// heading recapping the original board resolution ("取締役会における
// 決議内容" / "決議内容（過去開催取締役会）", in either order). Matches
// both example phrasings seen in real filings.
const RESOLUTION_HEADING = /取締役会.{0,20}決議(の)?内容|決議(の)?内容.{0,20}取締役会/;
const RESOLUTION_HEADING_WINDOW = 300;

interface LabeledAmount {
  value: number;
  /** Index of the amount digits themselves (after the label), for ordering/windowing. */
  index: number;
  hasUpperLimitMarker: boolean;
}

/** Finds every occurrence of `label` immediately followed by a yen amount. */
function findLabeledAmounts(text: string, label: string): LabeledAmount[] {
  const results: LabeledAmount[] = [];
  let searchFrom = 0;
  for (;;) {
    const labelIdx = text.indexOf(label, searchFrom);
    if (labelIdx === -1) break;
    searchFrom = labelIdx + label.length;

    const after = text.slice(searchFrom, searchFrom + 40);
    const match = after.match(AMOUNT_AFTER_LABEL);
    if (!match) continue;

    const digits = match[1].replace(/,/g, "");
    let value = Number(digits);
    if (match[2]) value *= 1_000_000; // "百万円"
    if (!Number.isFinite(value) || value <= 0) continue;

    const amountIndex = searchFrom + match.index!;
    const tailAfterAmount = text.slice(searchFrom + match[0].length, searchFrom + match[0].length + 10);
    results.push({
      value,
      index: amountIndex,
      hasUpperLimitMarker: UPPER_LIMIT_MARKER.test(tailAfterAmount),
    });
  }
  return results;
}

/**
 * Pure text parser — no network/PDF involved, so this is the part unit
 * tests can actually exercise.
 */
export function parseBuybackPdfText(rawText: string): ParsedBuybackFigures {
  const text = toHalfWidthDigits(rawText)
    .replace(/[，]/g, ",")
    .replace(/\s+/g, "");

  const amounts = findLabeledAmounts(text, AMOUNT_LABEL);
  let totalPlanned = amounts.find((a) => a.hasUpperLimitMarker);

  const cumulativeHeadingIndex = text.indexOf("累計");
  const cumulative =
    cumulativeHeadingIndex === -1
      ? undefined
      : amounts.find(
          (a) =>
            !a.hasUpperLimitMarker &&
            a.index > cumulativeHeadingIndex &&
            a.index - cumulativeHeadingIndex < CUMULATIVE_HEADING_WINDOW
        );

  if (!totalPlanned) {
    const resolutionMatch = RESOLUTION_HEADING.exec(text);
    if (resolutionMatch) {
      const headingIndex = resolutionMatch.index;
      totalPlanned = amounts.find(
        (a) =>
          !a.hasUpperLimitMarker &&
          a !== cumulative &&
          a.index > headingIndex &&
          a.index - headingIndex < RESOLUTION_HEADING_WINDOW
      );
    }
  }

  const period = amounts.find(
    (a) => !a.hasUpperLimitMarker && a !== cumulative && a !== totalPlanned
  );

  return {
    totalPlannedAmountYen: totalPlanned?.value ?? null,
    cumulativeAmountYen: cumulative?.value ?? null,
    periodAmountYen: period?.value ?? null,
  };
}

export interface ExtractPdfText {
  (buffer: ArrayBuffer): Promise<string>;
}

/**
 * pdf-parse's underlying pdfjs-dist logs a "Warning: ..." line per
 * console.{log,warn} call for every minor font/encoding quirk it works
 * around — thousands of them across a batch of real-world PDFs, which
 * drowns out anything else in the CI log (including this file's own
 * DEBUG_TREASURY_PDF_TEXT output). None of it indicates a real failure
 * (text extraction still succeeds), so silence it for the duration of
 * the parse call only.
 */
async function defaultExtractPdfText(buffer: ArrayBuffer): Promise<string> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    const data = await pdfParse(Buffer.from(buffer));
    return data.text;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
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
