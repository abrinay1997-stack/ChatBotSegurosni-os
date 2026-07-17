import { pgTable, text, bigint, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  chatId: text("chat_id").primaryKey(),
  history: text("history"),
  quoteState: text("quote_state"),
  consentParentAt: bigint("consent_parent_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const processedUpdates = pgTable("processed_updates", {
  updateId: integer("update_id").primaryKey(),
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

export const botConversations = pgTable("bot_conversations", {
  key: text("key").primaryKey(),
  state: text("state").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
