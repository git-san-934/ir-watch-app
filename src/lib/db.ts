import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

declare global {
  var __irWatchDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watched_companies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_companies_user_code
      ON watched_companies (user_id, code);
    CREATE INDEX IF NOT EXISTS idx_watched_companies_user
      ON watched_companies (user_id);

    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      last_checked_at TEXT
    );
  `);
  return db;
}

// Reuse a single connection across hot reloads / route invocations in dev.
export const db = globalThis.__irWatchDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__irWatchDb = db;
}
