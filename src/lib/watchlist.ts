import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface WatchedCompany {
  id: string;
  userId: string;
  code: string;
  name: string;
  createdAt: string;
}

interface WatchedCompanyRow {
  id: string;
  user_id: string;
  code: string;
  name: string;
  created_at: string;
}

function rowToCompany(row: WatchedCompanyRow): WatchedCompany {
  return {
    id: row.id,
    userId: row.user_id,
    code: row.code,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function listWatchedCompanies(userId: string): WatchedCompany[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, code, name, created_at
       FROM watched_companies
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId) as WatchedCompanyRow[];
  return rows.map(rowToCompany);
}

export class DuplicateCompanyError extends Error {
  constructor(code: string) {
    super(`Company ${code} is already on the watchlist`);
    this.name = "DuplicateCompanyError";
  }
}

export function addWatchedCompany(
  userId: string,
  code: string,
  name: string
): WatchedCompany {
  const existing = db
    .prepare(
      `SELECT id, user_id, code, name, created_at
       FROM watched_companies
       WHERE user_id = ? AND code = ?`
    )
    .get(userId, code) as WatchedCompanyRow | undefined;
  if (existing) {
    throw new DuplicateCompanyError(code);
  }

  const row: WatchedCompanyRow = {
    id: randomUUID(),
    user_id: userId,
    code,
    name,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO watched_companies (id, user_id, code, name, created_at)
     VALUES (@id, @user_id, @code, @name, @created_at)`
  ).run(row);

  return rowToCompany(row);
}

export function removeWatchedCompany(userId: string, id: string): boolean {
  const result = db
    .prepare(`DELETE FROM watched_companies WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}

export function getLastCheckedAt(userId: string): Date | null {
  const row = db
    .prepare(`SELECT last_checked_at FROM user_state WHERE user_id = ?`)
    .get(userId) as { last_checked_at: string | null } | undefined;
  return row?.last_checked_at ? new Date(row.last_checked_at) : null;
}

export function setLastCheckedAt(userId: string, date: Date): void {
  db.prepare(
    `INSERT INTO user_state (user_id, last_checked_at)
     VALUES (@user_id, @last_checked_at)
     ON CONFLICT(user_id) DO UPDATE SET last_checked_at = excluded.last_checked_at`
  ).run({ user_id: userId, last_checked_at: date.toISOString() });
}
