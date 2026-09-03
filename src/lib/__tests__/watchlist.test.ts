import { describe, expect, it } from "vitest";
import {
  addWatchedCompany,
  DuplicateCompanyError,
  getLastCheckedAt,
  listWatchedCompanies,
  removeWatchedCompany,
  setLastCheckedAt,
  type StorageLike,
} from "@/lib/watchlist";

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

  it("tracks the last-checked timestamp", () => {
    const storage = createMemoryStorage();
    expect(getLastCheckedAt(storage)).toBeNull();
    const now = new Date("2026-09-01T00:00:00Z");
    setLastCheckedAt(now, storage);
    expect(getLastCheckedAt(storage)).toEqual(now);
  });

  it("returns an empty list instead of throwing on corrupt stored JSON", () => {
    const storage = createMemoryStorage();
    storage.setItem("ir-watch:companies", "not json");
    expect(listWatchedCompanies(storage)).toEqual([]);
  });
});
