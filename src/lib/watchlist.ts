/**
 * Client-side watchlist storage. This app is a static export (GitHub
 * Pages) with no server, so the watch list and last-checked timestamp
 * live entirely in the visitor's own browser (localStorage) — nothing
 * is sent anywhere, which is also what keeps one visitor's list private
 * from anyone else without needing accounts or a login.
 */

export interface WatchedCompany {
  id: string;
  code: string;
  name: string;
  createdAt: string;
}

const COMPANIES_KEY = "ir-watch:companies";
const LAST_CHECKED_KEY = "ir-watch:last-checked-at";
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

export function getLastCheckedAt(storage?: StorageLike): Date | null {
  const store = getStorage(storage);
  if (!store) return null;
  const raw = store.getItem(LAST_CHECKED_KEY);
  return raw ? new Date(raw) : null;
}

export function setLastCheckedAt(date: Date, storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(LAST_CHECKED_KEY, date.toISOString());
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
 * Drops dismissed ids that no longer appear in the current snapshot, so
 * this list doesn't grow forever as old disclosures roll out of the
 * (rolling 7-day) snapshot window.
 */
export function pruneDismissedIds(validIds: Iterable<string>, storage?: StorageLike): void {
  const valid = new Set(validIds);
  const ids = readDismissedIds(storage);
  const pruned = ids.filter((id) => valid.has(id));
  if (pruned.length !== ids.length) {
    writeDismissedIds(pruned, storage);
  }
}
