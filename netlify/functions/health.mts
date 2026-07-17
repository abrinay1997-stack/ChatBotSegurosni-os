import type { Context, Config } from "@netlify/functions";
import { parseConfig } from "../../src/infra/config.js";
import { createDatabase } from "../../src/persistence/db.js";

export default async (req: Request, context: Context) => {
  try {
    const cfg = parseConfig(process.env);
    const db = createDatabase(cfg.databaseUrl);
    await db.db.get("SELECT 1", []);
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("db-down", { status: 500 });
  }
};

export const config: Config = {
  path: "/health",
};
