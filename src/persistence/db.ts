import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export interface DatabaseHandle {
  db: NeonHttpDatabase<typeof schema> & {
    run(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
    get(sql: string, params?: unknown[]): Promise<unknown>;
    all(sql: string, params?: unknown[]): Promise<unknown[]>;
  };
  close(): void;
}

export function createDatabase(url: string): DatabaseHandle {
  const sql = neon(url, { fullResults: true });
  const base = drizzle(sql, { schema });
  const db = base as unknown as DatabaseHandle["db"];

  db.run = async (text: string, params: unknown[] = []) => {
    const result = await (sql as any)(text, params);
    return { rowCount: (result as { rowCount: number | null }).rowCount ?? 0 };
  };
  db.get = async (text: string, params: unknown[] = []) => {
    const result = await (sql as any)(text, params);
    return (result as { rows: unknown[] }).rows[0];
  };
  db.all = async (text: string, params: unknown[] = []) => {
    const result = await (sql as any)(text, params);
    return (result as { rows: unknown[] }).rows;
  };

  // El driver HTTP de Neon no mantiene una conexión persistente que cerrar;
  // cada query es un request HTTP independiente. close() es un no-op que
  // preserva la interfaz que usan index.ts y los tests.
  return { db, close: () => {} };
}
