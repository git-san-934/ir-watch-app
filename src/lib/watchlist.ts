/**
 * Client-side watchlist storage. This app is a static export (GitHub
 * Pages) with no server, so the watch list and every disclosure ever
 * matched against it live entirely in the visitor's own browser
 * (localStorage) — nothing is sent anywhere, which is also what keeps
 * one visitor's data private from anyone else without needing accounts
 * or a login.
 */

import type { Disclosure } from "./tdnet";

export interface WatchedCompany {
  id: string;
  code: string;
  name: string;
  createdAt: string;
}

const COMPANIES_KEY = "ir-watch:companies";
const ARCHIVE_KEY = "ir-watch:archived-disclosures";
const TREASURY_STOCK_ARCHIVE_KEY = "ir-watch:archived-disclosures:treasury-stock";
const DISMISSED_KEY = "ir-watch:dismissed-ids";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readCompanies(storage?: StorageLike): WatchedCompany[] {
  const store = getStorage(storage);
  if (!store) return [];
  const raw = store.getItem(COMPANIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCompanies(companies: WatchedCompany[], storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(COMPANIES_KEY, JSON.stringify(companies));
}

export function listWatchedCompanies(storage?: StorageLike): WatchedCompany[] {
  return readCompanies(storage);
}

export class DuplicateCompanyError extends Error {
  constructor(code: string) {
    super(`Company ${code} is already on the watchlist`);
    this.name = "DuplicateCompanyError";
  }
}

export function addWatchedCompany(
  code: string,
  name: string,
  storage?: StorageLike
): WatchedCompany {
  const companies = readCompanies(storage);
  if (companies.some((c) => c.code === code)) {
    throw new DuplicateCompanyError(code);
  }

  const company: WatchedCompany = {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${code}-${Date.now()}`,
    code,
    name,
    createdAt: new Date().toISOString(),
  };

  writeCompanies([...companies, company], storage);
  return company;
}

export function removeWatchedCompany(id: string, storage?: StorageLike): boolean {
  const companies = readCompanies(storage);
  const next = companies.filter((c) => c.id !== id);
  if (next.length === companies.length) return false;
  writeCompanies(next, storage);
  return true;
}

function readDisclosureArchive(key: string, storage?: StorageLike): Disclosure[] {
  const store = getStorage(storage);
  if (!store) return [];
  const raw = store.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDisclosureArchive(
  key: string,
  disclosures: Disclosure[],
  storage?: StorageLike
): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(key, JSON.stringify(disclosures));
}

/**
 * Adds any of `candidates` not already in the archive at `key` (matched
 * by id) — everything merged in stays permanently (until dismissed),
 * independent of how long the server-side snapshot's rolling window
 * keeps it around. Returns just the newly-added ones, e.g. to flag them
 * "NEW" in the UI.
 */
function mergeDisclosureArchive(
  key: string,
  candidates: Disclosure[],
  storage?: StorageLike
): Disclosure[] {
  const archive = readDisclosureArchive(key, storage);
  const knownIds = new Set(archive.map((d) => d.id));
  const added = candidates.filter((d) => !knownIds.has(d.id));
  if (added.length > 0) {
    writeDisclosureArchive(key, [...archive, ...added], storage);
  }
  return added;
}

/** Every disclosure ever merged in, across all companies ever watched. */
export function getArchivedDisclosures(storage?: StorageLike): Disclosure[] {
  return readDisclosureArchive(ARCHIVE_KEY, storage);
}

export function mergeArchivedDisclosures(
  candidates: Disclosure[],
  storage?: StorageLike
): Disclosure[] {
  return mergeDisclosureArchive(ARCHIVE_KEY, candidates, storage);
}

/**
 * A second, independent archive for the "自社株買い" (treasury stock
 * buyback) feed, which spans every company — not just ones on the
 * watchlist — so it's kept separate from getArchivedDisclosures above.
 */
export function getTreasuryStockArchive(storage?: StorageLike): Disclosure[] {
  return readDisclosureArchive(TREASURY_STOCK_ARCHIVE_KEY, storage);
}

export function mergeTreasuryStockArchive(
  candidates: Disclosure[],
  storage?: StorageLike
): Disclosure[] {
  return mergeDisclosureArchive(TREASURY_STOCK_ARCHIVE_KEY, candidates, storage);
}

function readDismissedIds(storage?: StorageLike): string[] {
  const store = getStorage(storage);
  if (!store) return [];
  const raw = store.getItem(DISMISSED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDismissedIds(ids: string[], storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

/** Disclosure ids the visitor has dismissed ("not needed") — hidden from their feed. */
export function getDismissedIds(storage?: StorageLike): string[] {
  return readDismissedIds(storage);
}

export function dismissDisclosure(id: string, storage?: StorageLike): void {
  const ids = readDismissedIds(storage);
  if (ids.includes(id)) return;
  writeDismissedIds([...ids, id], storage);
}

/**
 * Drops dismissed ids that no longer appear in either (permanent)
 * archive — e.g. because the disclosure's company was removed from the
 * watchlist before it was ever archived — so this list doesn't grow
 * forever for no reason. Pass the union of both archives' ids, not the
 * server snapshot's: the archives are what persist, the snapshot is
 * just a rolling window. A dismissed id is shared across both feeds
 * (getArchivedDisclosures and getTreasuryStockArchive) — dismissing a
 * disclosure hides it everywhere, not just in the tab it was dismissed
 * from, since the same TDnet disclosure can legitimately appear in both.
 */
export function pruneDismissedIds(validIds: Iterable<string>, storage?: StorageLike): void {
  const valid = new Set(validIds);
  const ids = readDismissedIds(storage);
  const pruned = ids.filter((id) => valid.has(id));
  if (pruned.length !== ids.length) {
    writeDismissedIds(pruned, storage);
  }
}
