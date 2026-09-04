import { describe, expect, it, vi } from "vitest";
import {
  buildTreasuryStockSummary,
  parseBuybackPdfText,
} from "@/lib/treasury-stock";
import type { Disclosure } from "@/lib/tdnet";

function makeDisclosure(overrides: Partial<Disclosure> = {}): Disclosure {
  return {
    id: "1",
    code: "72030",
    companyName: "トヨタ自動車",
    title: "自己株式取得状況に関するお知らせ",
    url: "https://example.com/1.pdf",
    publishedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// Real TDnet buyback progress reports repeat the same label
// "(株式の)取得価額の総額" up to three times with nothing else
// distinguishing them: once for the reporting month, once (marked "上限")
// for the board-approved plan total, and once under a "累計" heading for
// the cumulative-to-date total. These fixtures mirror that real structure.
const REALISTIC_FILING_TEXT =
  "３．当月中における自己株式の取得価額の総額　５０，０００，０００円" +
  "（ご参考）　取得価額の総額の上限　１０，０００，０００，０００円（上限）" +
  "累計取得自己株式に係る取得価額の総額　３，５００，０００，０００円";

describe("parseBuybackPdfText", () => {
  it("extracts the plan's total (upper-limit-marked) amount", () => {
    const text = "取得価額の総額　１０，０００，０００，０００円（上限）";
    expect(parseBuybackPdfText(text).totalPlannedAmountYen).toBe(10_000_000_000);
  });

  it("extracts the cumulative amount that follows a 累計 heading", () => {
    const text = "累計取得自己株式に係る取得価額の総額　３，５００，０００，０００円";
    expect(parseBuybackPdfText(text).cumulativeAmountYen).toBe(3_500_000_000);
  });

  it("extracts this period's amount (the remaining, unmarked occurrence)", () => {
    const text = "当月中における自己株式の取得価額の総額　４５，０００，０００円";
    expect(parseBuybackPdfText(text).periodAmountYen).toBe(45_000_000);
  });

  it("handles amounts stated in 百万円 (millions)", () => {
    const text = "取得価額の総額　２，０００百万円（上限）";
    expect(parseBuybackPdfText(text).totalPlannedAmountYen).toBe(2_000_000_000);
  });

  it("disambiguates all three figures when the same label appears three times in one filing", () => {
    const result = parseBuybackPdfText(REALISTIC_FILING_TEXT);
    expect(result).toEqual({
      totalPlannedAmountYen: 10_000_000_000,
      cumulativeAmountYen: 3_500_000_000,
      periodAmountYen: 50_000_000,
    });
  });

  it("returns null fields when nothing matches, instead of throwing", () => {
    const result = parseBuybackPdfText("決算短信〔日本基準〕(連結) 売上高 1,000,000,000円");
    expect(result).toEqual({
      totalPlannedAmountYen: null,
      cumulativeAmountYen: null,
      periodAmountYen: null,
    });
  });
});

describe("buildTreasuryStockSummary", () => {
  it("groups by company and merges fields found across its recent disclosures", async () => {
    const disclosures = [
      makeDisclosure({
        id: "old",
        title: "自己株式取得に係る事項",
        publishedAt: "2026-08-01T00:00:00Z",
        url: "https://example.com/old.pdf",
      }),
      makeDisclosure({
        id: "new",
        title: "自己株式取得状況に関するお知らせ",
        publishedAt: "2026-09-01T00:00:00Z",
        url: "https://example.com/new.pdf",
      }),
    ];

    const pdfTextByUrl: Record<string, string> = {
      "https://example.com/new.pdf":
        "当月中における自己株式の取得価額の総額45,000,000円" +
        "累計自己株式に係る取得価額の総額720,000,000円",
      "https://example.com/old.pdf": "取得価額の総額の上限3,000,000,000円（上限）",
    };

    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({}));
    const extractPdfText = vi.fn().mockImplementation(async () => {
      // The url isn't available inside extractPdfText, so route via a
      // shared call counter matched against fetchImpl's call order.
      const callIndex = extractPdfText.mock.calls.length - 1;
      const url = fetchImpl.mock.calls[callIndex][0] as string;
      return pdfTextByUrl[url] ?? "";
    });

    const rows = await buildTreasuryStockSummary(disclosures, { fetchImpl, extractPdfText });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "7203",
      companyName: "トヨタ自動車",
      cumulativeAmountYen: 720_000_000,
      lastMonthAmountYen: 45_000_000,
      totalPlannedAmountYen: 3_000_000_000,
    });
  });

  it("stops trying a company's older disclosures once all three fields are found", async () => {
    const disclosures = [
      makeDisclosure({ id: "new", publishedAt: "2026-09-02T00:00:00Z" }),
      makeDisclosure({ id: "old", publishedAt: "2026-09-01T00:00:00Z" }),
    ];

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const extractPdfText = vi.fn().mockResolvedValue(REALISTIC_FILING_TEXT);

    await buildTreasuryStockSummary(disclosures, { fetchImpl, extractPdfText });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps going (with null fields) when a PDF fetch fails", async () => {
    const disclosures = [makeDisclosure()];
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const extractPdfText = vi.fn();

    const rows = await buildTreasuryStockSummary(disclosures, { fetchImpl, extractPdfText });

    expect(rows).toEqual([
      {
        code: "7203",
        companyName: "トヨタ自動車",
        totalPlannedAmountYen: null,
        cumulativeAmountYen: null,
        lastMonthAmountYen: null,
        latestDisclosureAt: "2026-09-01T00:00:00Z",
        sourceUrl: "https://example.com/1.pdf",
      },
    ]);
  });

  it("respects maxTotalPdfFetches across companies", async () => {
    const disclosures = [
      makeDisclosure({ id: "a", code: "1111", companyName: "A社", url: "https://example.com/a.pdf" }),
      makeDisclosure({ id: "b", code: "2222", companyName: "B社", url: "https://example.com/b.pdf" }),
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const extractPdfText = vi.fn().mockResolvedValue("");

    const rows = await buildTreasuryStockSummary(disclosures, {
      fetchImpl,
      extractPdfText,
      maxTotalPdfFetches: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });
});
