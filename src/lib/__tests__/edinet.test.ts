import { describe, expect, it, vi } from "vitest";
import {
  fetchEdinetFilingsSnapshot,
  fetchFilingsForDate,
  fetchRecentFilings,
  filterFilingsByCodes,
  normalizeSecCode,
} from "@/lib/edinet";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeSecCode", () => {
  it("strips the trailing check digit from a 5-character secCode", () => {
    expect(normalizeSecCode("72030")).toBe("7203");
  });

  it("returns null for a missing or too-short secCode (unlisted filer)", () => {
    expect(normalizeSecCode(null)).toBeNull();
    expect(normalizeSecCode(undefined)).toBeNull();
    expect(normalizeSecCode("")).toBeNull();
    expect(normalizeSecCode("12")).toBeNull();
  });
});

describe("fetchFilingsForDate", () => {
  it("keeps only recognized doc types, drops withdrawn filings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        metadata: { status: "200" },
        results: [
          {
            docID: "S100AAAA",
            edinetCode: "E00001",
            secCode: "72030",
            filerName: "トヨタ自動車株式会社",
            docTypeCode: "120",
            docDescription: "有価証券報告書－第123期",
            periodStart: "2025-04-01",
            periodEnd: "2026-03-31",
            submitDateTime: "2026-06-27 15:00",
            withdrawalStatus: "0",
          },
          {
            docID: "S100BBBB",
            edinetCode: "E00002",
            secCode: "99840",
            filerName: "取り下げ会社",
            docTypeCode: "120",
            submitDateTime: "2026-06-27 15:00",
            withdrawalStatus: "1",
          },
          {
            docID: "S100CCCC",
            edinetCode: "E00003",
            secCode: "12340",
            filerName: "有価証券届出書だけの会社",
            docTypeCode: "030",
            submitDateTime: "2026-06-27 15:00",
            withdrawalStatus: "0",
          },
        ],
      })
    );

    const result = await fetchFilingsForDate(new Date("2026-06-27"), { apiKey: "key", fetchImpl });

    expect(result).toEqual([
      {
        docId: "S100AAAA",
        edinetCode: "E00001",
        secCode: "7203",
        filerName: "トヨタ自動車株式会社",
        docTypeCode: "120",
        docTypeLabel: "有価証券報告書",
        docDescription: "有価証券報告書－第123期",
        periodStart: "2025-04-01",
        periodEnd: "2026-03-31",
        submittedAt: "2026-06-27T15:00:00+09:00",
      },
    ]);
  });

  it("skips entries missing required fields instead of throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        metadata: { status: "200" },
        results: [{ docID: "S1", docTypeCode: "120" }],
      })
    );

    const result = await fetchFilingsForDate(new Date("2026-06-27"), { apiKey: "key", fetchImpl });
    expect(result).toEqual([]);
  });

  it("throws when no API key is available", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchFilingsForDate(new Date("2026-06-27"), { apiKey: undefined, fetchImpl })
    ).rejects.toThrow(/EDINET_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-ok HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(
      fetchFilingsForDate(new Date("2026-06-27"), { apiKey: "key", fetchImpl })
    ).rejects.toThrow();
  });

  it("throws when the API reports a logical error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ metadata: { status: "400", message: "invalid date" }, results: [] })
    );
    await expect(
      fetchFilingsForDate(new Date("2026-06-27"), { apiKey: "key", fetchImpl })
    ).rejects.toThrow(/invalid date/);
  });
});

describe("fetchRecentFilings", () => {
  it("aggregates multiple days, dedupes by docId, and sorts newest first", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("date=2026-09-03")) {
        return Promise.resolve(
          jsonResponse({
            metadata: { status: "200" },
            results: [
              {
                docID: "new",
                secCode: "11110",
                filerName: "A社",
                docTypeCode: "120",
                submitDateTime: "2026-09-03T09:00:00+09:00",
                withdrawalStatus: "0",
              },
            ],
          })
        );
      }
      return Promise.resolve(
        jsonResponse({
          metadata: { status: "200" },
          results: [
            {
              docID: "old",
              secCode: "22220",
              filerName: "B社",
              docTypeCode: "160",
              submitDateTime: "2026-09-01T09:00:00+09:00",
              withdrawalStatus: "0",
            },
          ],
        })
      );
    });

    vi.setSystemTime(new Date("2026-09-03T12:00:00+09:00"));
    const result = await fetchRecentFilings(3, { apiKey: "key", fetchImpl });
    vi.useRealTimers();

    expect(result.map((f) => f.docId)).toEqual(["new", "old"]);
  });

  it("throws if every day's request fails, instead of silently returning empty", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchRecentFilings(3, { apiKey: "key", fetchImpl })).rejects.toThrow();
  });
});

describe("filterFilingsByCodes", () => {
  it("matches filings whose normalized secCode is in the watch list", () => {
    const filings = [
      {
        docId: "1",
        edinetCode: "E1",
        secCode: "7203",
        filerName: "トヨタ自動車株式会社",
        docTypeCode: "120",
        docTypeLabel: "有価証券報告書",
        docDescription: null,
        periodStart: null,
        periodEnd: null,
        submittedAt: "2026-06-27 15:00",
      },
      {
        docId: "2",
        edinetCode: "E2",
        secCode: null,
        filerName: "非上場会社",
        docTypeCode: "120",
        docTypeLabel: "有価証券報告書",
        docDescription: null,
        periodStart: null,
        periodEnd: null,
        submittedAt: "2026-06-27 15:00",
      },
    ];

    expect(filterFilingsByCodes(filings, ["7203"])).toEqual([filings[0]]);
    expect(filterFilingsByCodes(filings, ["9999"])).toEqual([]);
  });
});

describe("fetchEdinetFilingsSnapshot", () => {
  it("loads the pre-fetched same-origin snapshot", async () => {
    const snapshot = {
      generatedAt: "2026-09-03T12:00:00Z",
      days: 30,
      filings: [],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(snapshot));

    const result = await fetchEdinetFilingsSnapshot(fetchImpl);

    expect(result).toEqual(snapshot);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/edinet-filings.json"),
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("treats a 404 as 'not built yet' rather than an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const result = await fetchEdinetFilingsSnapshot(fetchImpl);
    expect(result).toEqual({ generatedAt: null, days: 0, filings: [] });
  });

  it("throws on other non-ok responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchEdinetFilingsSnapshot(fetchImpl)).rejects.toThrow();
  });
});
