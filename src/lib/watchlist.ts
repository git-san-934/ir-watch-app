/**
 * Client-side watchlist storage. This app is a static export (GitHub
 * Pages) with no server, so the watch list and every disclosure ever
 * matched against it live entirely in the visitor's own browser
 * (localStorage) — nothing is sent anywhere, which is also what keeps
 * one visitor's data private from anyone else without needing accounts
 * or a login.
 */

import type { Disclosure } from "./tdnet";
import type { EdinetFiling } from "./edinet";

export interface WatchedCompany {
  id: string;
  code: string;
  name: string;
  createdAt: string;
}

const COMPANIES_KEY = "ir-watch:companies";
const ARCHIVE_KEY = "ir-watch:archived-disclosures";
const DISMISSED_KEY = "ir-watch:dismissed-ids";
const EDINET_ARCHIVE_KEY = "ir-watch:archived-edinet-filings";

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

function readArchive(storage?: StorageLike): Disclosure[] {
  const store = getStorage(storage);
  if (!store) return [];
  const raw = store.getItem(ARCHIVE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArchive(disclosures: Disclosure[], storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(ARCHIVE_KEY, JSON.stringify(disclosures));
}

/** Every disclosure ever merged in, across all companies ever watched. */
export function getArchivedDisclosures(storage?: StorageLike): Disclosure[] {
  return readArchive(storage);
}

/**
 * Adds any of `candidates` not already in the archive (matched by id) —
 * everything merged in stays permanently (until dismissed), independent
 * of how long the server-side snapshot's rolling window keeps it around.
 * Returns just the newly-added ones, e.g. to flag them "NEW" in the UI.
 */
export function mergeArchivedDisclosures(
  candidates: Disclosure[],
  storage?: StorageLike
): Disclosure[] {
  const archive = readArchive(storage);
  const knownIds = new Set(archive.map((d) => d.id));
  const added = candidates.filter((d) => !knownIds.has(d.id));
  if (added.length > 0) {
    writeArchive([...archive, ...added], storage);
  }
  return added;
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

function readEdinetArchive(storage?: StorageLike): EdinetFiling[] {
  const store = getStorage(storage);
  if (!store) return [];
  const raw = store.getItem(EDINET_ARCHIVE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEdinetArchive(filings: EdinetFiling[], storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(EDINET_ARCHIVE_KEY, JSON.stringify(filings));
}

/** Every EDINET filing ever merged in, across all companies ever watched. */
export function getArchivedFilings(storage?: StorageLike): EdinetFiling[] {
  return readEdinetArchive(storage);
}

/**
 * Adds any of `candidates` not already in the archive (matched by docId) —
 * everything merged in stays permanently, independent of how long the
 * server-side snapshot's rolling window keeps it around. Returns just the
 * newly-added ones, e.g. to flag them "NEW" in the UI.
 */
export function mergeArchivedFilings(
  candidates: EdinetFiling[],
  storage?: StorageLike
): EdinetFiling[] {
  const archive = readEdinetArchive(storage);
  const knownIds = new Set(archive.map((f) => f.docId));
  const added = candidates.filter((f) => !knownIds.has(f.docId));
  if (added.length > 0) {
    writeEdinetArchive([...archive, ...added], storage);
  }
  return added;
}

/**
 * Drops dismissed ids that no longer appear in the (permanent) archive —
 * e.g. because the disclosure's company was removed from the watchlist
 * before it was ever archived — so this list doesn't grow forever for
 * no reason. Pass the current archive's ids, not the server snapshot's:
 * the archive is what persists, the snapshot is just a rolling window.
 */
export function pruneDismissedIds(validIds: Iterable<string>, storage?: StorageLike): void {
  const valid = new Set(validIds);
  const ids = readDismissedIds(storage);
  const pruned = ids.filter((id) => valid.has(id));
  if (pruned.length !== ids.length) {
    writeDismissedIds(pruned, storage);
  }
}
