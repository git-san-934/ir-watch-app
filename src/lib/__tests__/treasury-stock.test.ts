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

describe("parseBuybackPdfText", () => {
  it("extracts the total planned amount (取得価額の総額)", () => {
    const text = "1. 取得する株式の総数の上限 500,000株\n2. 取得価額の総額(上限) 3,000,000,000円";
    expect(parseBuybackPdfText(text).totalPlannedAmountYen).toBe(3_000_000_000);
  });

  it("extracts the cumulative amount (累計取得価額)", () => {
    const text = "累計取得株式数 120,000株　累計取得価額 720,000,000円";
    expect(parseBuybackPdfText(text).cumulativeAmountYen).toBe(720_000_000);
  });

  it("extracts this period's amount (当月中の取得価額)", () => {
    const text = "当月中に取得した株式に係る取得価額 45,000,000円";
    expect(parseBuybackPdfText(text).periodAmountYen).toBe(45_000_000);
  });

  it("handles full-width digits and commas", () => {
    const text = "取得価額の総額　３，０００，０００，０００円";
    expect(parseBuybackPdfText(text).totalPlannedAmountYen).toBe(3_000_000_000);
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
        "累計取得価額 720,000,000円 当月中の取得価額 45,000,000円",
      "https://example.com/old.pdf": "取得価額の総額(上限) 3,000,000,000円",
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
    const extractPdfText = vi
      .fn()
      .mockResolvedValue(
        "取得価額の総額 1,000,000円 累計取得価額 500,000円 当月中の取得価額 100,000円"
      );

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
