import { describe, expect, it, vi } from "vitest";
import {
  fetchDisclosuresForDate,
  fetchDisclosuresSnapshot,
  fetchRecentDisclosures,
  filterByCodes,
  filterTreasuryStockDisclosures,
  isTreasuryStockDisclosure,
  normalizeCode,
} from "@/lib/tdnet";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeCode", () => {
  it("takes the first 4 alphanumeric characters, uppercased", () => {
    expect(normalizeCode("7203")).toBe("7203");
    expect(normalizeCode("72030")).toBe("7203");
    expect(normalizeCode(" 7203 ")).toBe("7203");
    expect(normalizeCode("130a")).toBe("130A");
  });
});

describe("fetchDisclosuresForDate", () => {
  it("parses items wrapped in { items: [{ Tdnet: {...} }] }", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            Tdnet: {
              id: "1",
              company_code: "72030",
              company_name: "トヨタ自動車",
              title: "決算短信",
              pubdate: "2026-09-02T15:00:00+09:00",
              document_url: "https://example.com/1.pdf",
            },
          },
        ],
      })
    );

    const result = await fetchDisclosuresForDate(new Date("2026-09-02"), { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        id: "1",
        code: "72030",
        companyName: "トヨタ自動車",
        title: "決算短信",
        url: "https://example.com/1.pdf",
        publishedAt: "2026-09-02T15:00:00+09:00",
      },
    ]);
  });

  it("parses a bare array of { Tdnet: {...} } entries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          Tdnet: {
            id: "2",
            company_code: "99840",
            company_name: "ソフトバンクグループ",
            title: "自己株式取得",
            pubdate: "2026-09-01T10:00:00+09:00",
            document_url: "https://example.com/2.pdf",
          },
        },
      ])
    );

    const result = await fetchDisclosuresForDate(new Date("2026-09-01"), { fetchImpl });
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("99840");
  });

  it("skips entries missing required fields instead of throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          { Tdnet: { id: "3", company_code: "1234" } },
          {
            Tdnet: {
              id: "4",
              company_code: "1234",
              company_name: "Example Co",
              title: "Notice",
              pubdate: "2026-09-01T10:00:00+09:00",
              document_url: "https://example.com/4.pdf",
            },
          },
        ],
      })
    );

    const result = await fetchDisclosuresForDate(new Date("2026-09-01"), { fetchImpl });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("returns an empty array on 404 (no disclosures that day)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const result = await fetchDisclosuresForDate(new Date("2026-09-01"), { fetchImpl });
    expect(result).toEqual([]);
  });

  it("throws on other non-ok responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(
      fetchDisclosuresForDate(new Date("2026-09-01"), { fetchImpl })
    ).rejects.toThrow();
  });
});

describe("fetchRecentDisclosures", () => {
  it("aggregates multiple days, dedupes by id, and sorts newest first", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("20260903")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                Tdnet: {
                  id: "a",
                  company_code: "1111",
                  company_name: "A社",
                  title: "新着",
                  pubdate: "2026-09-03T09:00:00+09:00",
                  document_url: "https://example.com/a.pdf",
                },
              },
            ],
          })
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: [
            {
              Tdnet: {
                id: "b",
                company_code: "2222",
                company_name: "B社",
                title: "旧着",
                pubdate: "2026-09-01T09:00:00+09:00",
                document_url: "https://example.com/b.pdf",
              },
            },
          ],
        })
      );
    });

    vi.setSystemTime(new Date("2026-09-03T12:00:00+09:00"));
    const result = await fetchRecentDisclosures(3, { fetchImpl });
    vi.useRealTimers();

    expect(result.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("throws if every day's request fails, instead of silently returning empty", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchRecentDisclosures(3, { fetchImpl })).rejects.toThrow();
  });

  it("still returns results when only some days fail", async () => {
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                Tdnet: {
                  id: "ok",
                  company_code: "1111",
                  company_name: "A社",
                  title: "t",
                  pubdate: "2026-09-03T09:00:00+09:00",
                  document_url: "https://example.com/ok.pdf",
                },
              },
            ],
          })
        );
      }
      return Promise.reject(new Error("network down"));
    });

    const result = await fetchRecentDisclosures(3, { fetchImpl });
    expect(result.map((d) => d.id)).toEqual(["ok"]);
  });
});

describe("filterByCodes", () => {
  it("matches disclosures whose normalized code is in the watch list", () => {
    const disclosures = [
      {
        id: "1",
        code: "72030",
        companyName: "トヨタ自動車",
        title: "t",
        url: "u",
        publishedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "2",
        code: "99840",
        companyName: "ソフトバンクグループ",
        title: "t",
        url: "u",
        publishedAt: "2026-09-01T00:00:00Z",
      },
    ];

    expect(filterByCodes(disclosures, ["7203"])).toEqual([disclosures[0]]);
    expect(filterByCodes(disclosures, ["9999"])).toEqual([]);
  });
});

describe("isTreasuryStockDisclosure / filterTreasuryStockDisclosures", () => {
  it("matches titles mentioning treasury stock together with an acquisition word", () => {
    expect(isTreasuryStockDisclosure("自己株式取得状況に関するお知らせ")).toBe(true);
    expect(isTreasuryStockDisclosure("自己株式の取得(買付け)開始に関するお知らせ")).toBe(true);
    expect(isTreasuryStockDisclosure("自己株式買付状況(経過報告)")).toBe(true);
  });

  it("does not match unrelated titles, or treasury-stock titles without an action word", () => {
    expect(isTreasuryStockDisclosure("決算短信〔日本基準〕(連結)")).toBe(false);
    expect(isTreasuryStockDisclosure("自己株式の消却に関するお知らせ")).toBe(false);
    expect(isTreasuryStockDisclosure("株式取得(子会社化)に関するお知らせ")).toBe(false);
  });

  it("filters a mixed list down to just the treasury-stock ones, regardless of company", () => {
    const disclosures = [
      {
        id: "1",
        code: "7203",
        companyName: "トヨタ自動車",
        title: "自己株式取得状況に関するお知らせ",
        url: "u",
        publishedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "2",
        code: "9999",
        companyName: "例社",
        title: "決算短信〔日本基準〕(連結)",
        url: "u",
        publishedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "3",
        code: "1111",
        companyName: "別社",
        title: "自己株式の取得(買付け)開始に関するお知らせ",
        url: "u",
        publishedAt: "2026-09-01T00:00:00Z",
      },
    ];

    expect(filterTreasuryStockDisclosures(disclosures).map((d) => d.id)).toEqual(["1", "3"]);
  });
});

describe("fetchDisclosuresSnapshot", () => {
  it("loads the pre-fetched same-origin snapshot", async () => {
    const snapshot = {
      generatedAt: "2026-09-03T12:00:00Z",
      days: 7,
      disclosures: [
        {
          id: "1",
          code: "7203",
          companyName: "トヨタ自動車",
          title: "t",
          url: "u",
          publishedAt: "2026-09-03T09:00:00Z",
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(snapshot));

    const result = await fetchDisclosuresSnapshot(fetchImpl);

    expect(result).toEqual(snapshot);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/tdnet-disclosures.json"),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("throws when the snapshot can't be loaded (e.g. not built yet)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchDisclosuresSnapshot(fetchImpl)).rejects.toThrow();
  });
});
