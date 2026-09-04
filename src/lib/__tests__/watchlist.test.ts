import { describe, expect, it } from "vitest";
import {
  addWatchedCompany,
  dismissDisclosure,
  DuplicateCompanyError,
  getArchivedDisclosures,
  getDismissedIds,
  getTreasuryStockArchive,
  listWatchedCompanies,
  mergeArchivedDisclosures,
  mergeTreasuryStockArchive,
  pruneDismissedIds,
  removeWatchedCompany,
  type StorageLike,
} from "@/lib/watchlist";
import type { Disclosure } from "@/lib/tdnet";

function makeDisclosure(id: string, overrides: Partial<Disclosure> = {}): Disclosure {
  return {
    id,
    code: "7203",
    companyName: "トヨタ自動車",
    title: `開示 ${id}`,
    url: `https://example.com/${id}.pdf`,
    publishedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("watchlist storage", () => {
  it("adds and lists companies", () => {
    const storage = createMemoryStorage();
    const company = addWatchedCompany("7203", "トヨタ自動車", storage);
    expect(company.code).toBe("7203");
    expect(listWatchedCompanies(storage)).toHaveLength(1);
  });

  it("keeps separate storages independent", () => {
    const storageA = createMemoryStorage();
    const storageB = createMemoryStorage();
    addWatchedCompany("7203", "トヨタ自動車", storageA);
    expect(listWatchedCompanies(storageA)).toHaveLength(1);
    expect(listWatchedCompanies(storageB)).toHaveLength(0);
  });

  it("rejects duplicate codes", () => {
    const storage = createMemoryStorage();
    addWatchedCompany("9984", "ソフトバンクグループ", storage);
    expect(() => addWatchedCompany("9984", "SBG", storage)).toThrow(
      DuplicateCompanyError
    );
  });

  it("removes a company by id", () => {
    const storage = createMemoryStorage();
    const company = addWatchedCompany("4321", "B社", storage);
    expect(removeWatchedCompany("does-not-exist", storage)).toBe(false);
    expect(removeWatchedCompany(company.id, storage)).toBe(true);
    expect(listWatchedCompanies(storage)).toHaveLength(0);
  });

  it("returns an empty list instead of throwing on corrupt stored JSON", () => {
    const storage = createMemoryStorage();
    storage.setItem("ir-watch:companies", "not json");
    expect(listWatchedCompanies(storage)).toEqual([]);
  });

  it("tracks dismissed disclosure ids, without duplicating repeats", () => {
    const storage = createMemoryStorage();
    expect(getDismissedIds(storage)).toEqual([]);
    dismissDisclosure("a", storage);
    dismissDisclosure("b", storage);
    dismissDisclosure("a", storage);
    expect(getDismissedIds(storage)).toEqual(["a", "b"]);
  });

  it("prunes dismissed ids that no longer appear in the current snapshot", () => {
    const storage = createMemoryStorage();
    dismissDisclosure("a", storage);
    dismissDisclosure("b", storage);
    dismissDisclosure("c", storage);
    pruneDismissedIds(["b", "c", "d"], storage);
    expect(getDismissedIds(storage)).toEqual(["b", "c"]);
  });

  it("archives disclosures permanently, merging in only unseen ones", () => {
    const storage = createMemoryStorage();
    expect(getArchivedDisclosures(storage)).toEqual([]);

    const first = mergeArchivedDisclosures([makeDisclosure("a"), makeDisclosure("b")], storage);
    expect(first.map((d) => d.id)).toEqual(["a", "b"]);
    expect(getArchivedDisclosures(storage)).toHaveLength(2);

    // Re-merging the same ids plus one new one only reports the new one,
    // and the archive keeps everything (nothing rolls off).
    const second = mergeArchivedDisclosures(
      [makeDisclosure("a"), makeDisclosure("b"), makeDisclosure("c")],
      storage
    );
    expect(second.map((d) => d.id)).toEqual(["c"]);
    expect(getArchivedDisclosures(storage).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the treasury-stock archive independent of the watchlist archive", () => {
    const storage = createMemoryStorage();
    mergeArchivedDisclosures([makeDisclosure("a")], storage);
    mergeTreasuryStockArchive([makeDisclosure("t1"), makeDisclosure("t2")], storage);

    expect(getArchivedDisclosures(storage).map((d) => d.id)).toEqual(["a"]);
    expect(getTreasuryStockArchive(storage).map((d) => d.id)).toEqual(["t1", "t2"]);
  });
});
