/**
 * Client for TSE (Tokyo Stock Exchange) TDnet timely disclosure data.
 *
 * TDnet itself (release.tdnet.info) has no public JSON API, so this uses the
 * community-run Yanoshin mirror (https://webapi.yanoshin.jp/webapi/tdnet/),
 * which republishes each day's TDnet disclosures as JSON. Field names below
 * are based on that service's documented shape; the parser accepts a couple
 * of reasonable variants defensively since the exact response could not be
 * verified against a live call from this environment (outbound network here
 * is restricted to an allowlist that does not include this host).
 *
 * The functions below that hit this API directly (fetchDisclosuresForDate,
 * fetchRecentDisclosures) only run server-side, from scripts/fetch-tdnet.ts
 * in CI — confirmed against the deployed site that the mirror does not send
 * CORS headers, so a direct browser fetch is blocked. The browser instead
 * reads the pre-fetched snapshot via fetchDisclosuresSnapshot() below.
 */

export interface Disclosure {
  id: string;
  code: string;
  companyName: string;
  title: string;
  url: string;
  publishedAt: string;
}

const DEFAULT_BASE_URL = "https://webapi.yanoshin.jp/webapi/tdnet";

interface RawTdnetItem {
  id?: string | number;
  company_code?: string;
  companyCode?: string;
  company_name?: string;
  companyName?: string;
  title?: string;
  pubdate?: string;
  published_at?: string;
  document_url?: string;
  documentUrl?: string;
}

interface RawTdnetEnvelope {
  Tdnet?: RawTdnetItem;
}

type RawTdnetResponse =
  | RawTdnetEnvelope[]
  | { items?: RawTdnetEnvelope[] }
  | { Tdnet?: RawTdnetItem[] };

function toYyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function extractItems(payload: RawTdnetResponse): RawTdnetItem[] {
  if (Array.isArray(payload)) {
    return payload.map((entry) => entry.Tdnet).filter((v): v is RawTdnetItem => Boolean(v));
  }
  if ("items" in payload && Array.isArray(payload.items)) {
    return payload.items
      .map((entry) => entry.Tdnet)
      .filter((v): v is RawTdnetItem => Boolean(v));
  }
  if ("Tdnet" in payload && Array.isArray(payload.Tdnet)) {
    return payload.Tdnet;
  }
  return [];
}

function normalizeItem(raw: RawTdnetItem, fallbackDate: string): Disclosure | null {
  const code = raw.company_code ?? raw.companyCode;
  const companyName = raw.company_name ?? raw.companyName;
  const title = raw.title;
  const url = raw.document_url ?? raw.documentUrl;
  const publishedAt = raw.pubdate ?? raw.published_at ?? fallbackDate;

  if (!code || !companyName || !title || !url) {
    return null;
  }

  const id = raw.id != null ? String(raw.id) : `${code}-${publishedAt}-${title}`;

  return {
    id,
    code: String(code),
    companyName,
    title,
    url,
    publishedAt,
  };
}

export interface FetchDisclosuresOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchDisclosuresForDate(
  date: Date,
  options: FetchDisclosuresOptions = {}
): Promise<Disclosure[]> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const dateStr = toYyyymmdd(date);
  const url = `${baseUrl}/list/${dateStr}.json?limit=1000`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 404) {
        // No disclosures published on this date (e.g. weekend/holiday).
        return [];
      }
      throw new Error(`TDnet request failed: ${res.status} ${res.statusText}`);
    }
    const payload = (await res.json()) as RawTdnetResponse;
    const items = extractItems(payload);
    return items
      .map((item) => normalizeItem(item, date.toISOString()))
      .filter((v): v is Disclosure => v !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRecentDisclosures(
  days: number,
  options: FetchDisclosuresOptions = {}
): Promise<Disclosure[]> {
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return d;
  });

  const results = await Promise.allSettled(
    dates.map((date) => fetchDisclosuresForDate(date, options))
  );

  if (results.every((r) => r.status === "rejected")) {
    const firstReason = (results[0] as PromiseRejectedResult).reason;
    throw new Error("Failed to fetch TDnet disclosures for any recent date", {
      cause: firstReason,
    });
  }

  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const byId = new Map<string, Disclosure>();
  for (const item of all) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export interface DisclosuresSnapshot {
  generatedAt: string;
  days: number;
  disclosures: Disclosure[];
}

/**
 * Loads the pre-fetched, same-origin snapshot at /tdnet-disclosures.json
 * (built by scripts/fetch-tdnet.ts). The browser can't call the TDnet
 * mirror API directly — it doesn't send CORS headers — so this is the
 * only disclosure data source the deployed site can actually read.
 */
export async function fetchDisclosuresSnapshot(
  fetchImpl: typeof fetch = fetch
): Promise<DisclosuresSnapshot> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const res = await fetchImpl(`${basePath}/tdnet-disclosures.json`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load TDnet snapshot: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DisclosuresSnapshot;
}

export function normalizeCode(code: string): string {
  return code.trim().replace(/[^0-9A-Za-z]/g, "").slice(0, 4).toUpperCase();
}

export function filterByCodes(
  disclosures: Disclosure[],
  codes: string[]
): Disclosure[] {
  const wanted = new Set(codes.map(normalizeCode));
  return disclosures.filter((d) => wanted.has(normalizeCode(d.code)));
}

// Matches titles like "自己株式取得状況に関するお知らせ" (buyback progress
// report) or "自己株式の取得(買付け)開始に関するお知らせ" (buyback start),
// across any company — not just ones on the visitor's watchlist. Titles
// vary in exact wording, so this looks for "自己株式" (treasury stock)
// together with a purchase-related word rather than an exact phrase.
const TREASURY_STOCK_KEYWORD = "自己株式";
const TREASURY_STOCK_ACTION_KEYWORDS = ["取得", "買付", "買い付け"];

export function isTreasuryStockDisclosure(title: string): boolean {
  return (
    title.includes(TREASURY_STOCK_KEYWORD) &&
    TREASURY_STOCK_ACTION_KEYWORDS.some((keyword) => title.includes(keyword))
  );
}

export function filterTreasuryStockDisclosures(disclosures: Disclosure[]): Disclosure[] {
  return disclosures.filter((d) => isTreasuryStockDisclosure(d.title));
}
