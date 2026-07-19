import { pgTable, text, bigint, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  chatId: text("chat_id").primaryKey(),
  history: text("history"),
  quoteState: text("quote_state"),
  consentParentAt: bigint("consent_parent_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const processedUpdates = pgTable("processed_updates", {
  // BIGINT, no INTEGER: los update_id de Telegram crecen sin techo y superan
  // el máximo de int32 (~2.147e9) con el tiempo. Con INTEGER, el primer
  // update_id que desborda hace fallar el INSERT de markProcessed → la función
  // crashea (502) y el bot deja de responder. Ver docs/errors-learned.md 2026-07-19.
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  processedAt: bigint("processed_at", { mode: "number" }),
});

export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chatId: text("chat_id").notNull(),
  quote: text("quote").notNull(),
  consentParentAt: bigint("consent_parent_at", { mode: "number" }),
  piiConsentAt: bigint("pii_consent_at", { mode: "number" }),
  retentionDays: integer("retention_days").notNull().default(90),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const promptVersions = pgTable("prompt_versions", {
  version: text("version").primaryKey(),
  hash: text("hash").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const knowledge = pgTable("knowledge", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  text: text("text").notNull(),
});
