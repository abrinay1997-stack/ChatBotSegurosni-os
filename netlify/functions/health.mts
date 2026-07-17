import type { Context, Config } from "@netlify/functions";
import { parseConfig } from "../../src/infra/config.js";
import { createDatabase } from "../../src/persistence/db.js";

export default async (req: Request, context: Context) => {
  try {
    // process.env NO está poblado en el runtime de Netlify Functions v2;
    // las variables de entorno del sitio se leen vía el global Netlify.env.
    const cfg = parseConfig(Netlify.env.toObject());
    const db = createDatabase(cfg.databaseUrl);
    await db.db.get("SELECT 1", []);
    return new Response("ok", { status: 200 });
  } catch (e) {
    // DIAGNÓSTICO TEMPORAL: se revierte después de confirmar el deploy.
    const keys = Object.keys(Netlify.env.toObject());
    return new Response(`db-down: ${e instanceof Error ? e.message : String(e)} | env_keys=${keys.join(",")}`, { status: 500 });
  }
};

export const config: Config = {
  path: "/health",
};
