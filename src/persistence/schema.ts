import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  chatId: text("chat_id").primaryKey(),
  history: text("history").$type<{ role: string; content: string }[]>(),
  quoteState: text("quote_state").$type<Record<string, unknown>>(),
  consentParentAt: integer("consent_parent_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const processedUpdates = sqliteTable("processed_updates", {
  updateId: integer("update_id").primaryKey(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull(),
  quote: text("quote").notNull().$type<Record<string, unknown>>(),
  consentParentAt: integer("consent_parent_at", { mode: "timestamp_ms" }),
  piiConsentAt: integer("pii_consent_at", { mode: "timestamp_ms" }),
  retentionDays: integer("retention_days").notNull().default(90),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const promptVersions = sqliteTable("prompt_versions", {
  version: text("version").primaryKey(),
  hash: text("hash").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
