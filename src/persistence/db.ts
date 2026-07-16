import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export interface DatabaseHandle {
  db: BetterSQLite3Database<typeof schema> & {
    run(sql: string, params: unknown[]): Database.RunResult;
    get(sql: string, params: unknown[]): unknown;
    all(sql: string, params: unknown[]): unknown[];
  };
  close(): void;
}

export function createDatabase(url: string): DatabaseHandle {
  // better-sqlite3 no crea el directorio del archivo; en una instalación
  // nueva "./data/" no existe todavía (está en .gitignore) y esto revienta
  // con "Cannot open database because the directory does not exist".
  if (url !== ":memory:") {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("secure_delete = ON");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id TEXT PRIMARY KEY, history TEXT, quote_state TEXT,
      consent_parent_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, processed_at INTEGER);
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, quote TEXT NOT NULL,
      consent_parent_at INTEGER, pii_consent_at INTEGER, retention_days INTEGER NOT NULL DEFAULT 90,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_versions (version TEXT PRIMARY KEY, hash TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);

  // Expose sqlite client for raw SQL operations
  const dbWithExt = db as any;
  dbWithExt.run = (sql: string, params: unknown[]) => {
    return sqlite.prepare(sql).run(...(params || []));
  };
  dbWithExt.get = (sql: string, params: unknown[]) => {
    return sqlite.prepare(sql).get(...(params || []));
  };
  dbWithExt.all = (sql: string, params: unknown[]) => {
    return sqlite.prepare(sql).all(...(params || []));
  };

  return { db: dbWithExt, close: () => sqlite.close() };
}
