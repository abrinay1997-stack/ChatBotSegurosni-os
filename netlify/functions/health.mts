import type { Context, Config } from "@netlify/functions";
import { parseConfig } from "../../src/infra/config.js";
import { createDatabase } from "../../src/persistence/db.js";

export default async (req: Request, context: Context) => {
  try {
    const cfg = parseConfig(process.env);
    const db = createDatabase(cfg.databaseUrl);
    await db.db.get("SELECT 1", []);
    return new Response("ok", { status: 200 });
  } catch (e) {
    // DIAGNÓSTICO TEMPORAL: se revierte después de confirmar el deploy.
    return new Response(`db-down: ${e instanceof Error ? e.message : String(e)} | DATABASE_URL_present=${!!process.env.DATABASE_URL}`, { status: 500 });
  }
};

export const config: Config = {
  path: "/health",
};
