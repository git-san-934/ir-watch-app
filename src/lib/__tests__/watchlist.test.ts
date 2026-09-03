import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ir-watch-test-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");

const {
  addWatchedCompany,
  DuplicateCompanyError,
  getLastCheckedAt,
  listWatchedCompanies,
  removeWatchedCompany,
  setLastCheckedAt,
} = await import("@/lib/watchlist");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("watchlist storage", () => {
  it("adds and lists companies scoped to a user", () => {
    const company = addWatchedCompany("user-1", "7203", "トヨタ自動車");
    expect(company.code).toBe("7203");

    expect(listWatchedCompanies("user-1")).toHaveLength(1);
    expect(listWatchedCompanies("user-2")).toHaveLength(0);
  });

  it("rejects duplicate codes for the same user", () => {
    addWatchedCompany("user-dup", "9984", "ソフトバンクグループ");
    expect(() => addWatchedCompany("user-dup", "9984", "SBG")).toThrow(
      DuplicateCompanyError
    );
  });

  it("allows the same code for different users", () => {
    addWatchedCompany("user-a", "1234", "A社");
    expect(() => addWatchedCompany("user-b", "1234", "A社")).not.toThrow();
  });

  it("removes a company only for its owning user", () => {
    const company = addWatchedCompany("user-remove", "4321", "B社");
    expect(removeWatchedCompany("other-user", company.id)).toBe(false);
    expect(removeWatchedCompany("user-remove", company.id)).toBe(true);
    expect(listWatchedCompanies("user-remove")).toHaveLength(0);
  });

  it("tracks last checked timestamp per user", () => {
    expect(getLastCheckedAt("user-time")).toBeNull();
    const now = new Date("2026-09-01T00:00:00Z");
    setLastCheckedAt("user-time", now);
    expect(getLastCheckedAt("user-time")).toEqual(now);
  });
});
