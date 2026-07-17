import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está seteada");
  const sql = neon(url);

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT PRIMARY KEY,
    history TEXT,
    quote_state TEXT,
    consent_parent_at BIGINT,
    updated_at BIGINT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS processed_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at BIGINT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id TEXT NOT NULL,
    quote TEXT NOT NULL,
    consent_parent_at BIGINT,
    pii_consent_at BIGINT,
    retention_days INTEGER NOT NULL DEFAULT 90,
    created_at BIGINT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS prompt_versions (
    version TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    text TEXT NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_search_idx ON knowledge USING GIN (to_tsvector('spanish', text))`;

  console.log("Tablas creadas/verificadas en", url.replace(/:[^:@]+@/, ":***@"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
