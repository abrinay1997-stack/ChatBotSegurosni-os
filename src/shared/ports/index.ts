import type { ToolDef, ToolCall, LLMResponse, LLMChatRequest, LLMProvider, LLMUsage, ChatMessage } from "./llm-provider.js";

export interface Config {
  telegramBotToken: string;
  telegramWebhookSecret?: string;
  telegramAllowlist: string[];
  llmProvider: "groq" | "glm";
  groqApiKey?: string;
  glmApiKey?: string;
  nvidiaApiKey?: string;
  databaseUrl: string;
  llmDailyBudgetUsd: number;
  llmProviderResidentOnly: boolean;
  promptVersion: string;
  promptAb: "control" | "test";
  logLevel: string;
  nodeEnv: "development" | "production";
  port: number;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): Logger;
}

export type { ToolDef, ToolCall, LLMResponse, LLMChatRequest, LLMProvider, LLMUsage, ChatMessage };

export interface NormalizedMessage {
  chatId: string;
  text: string;
  updateId: number;
}

export interface ChannelAdapter {
  normalizeIn(update: unknown): NormalizedMessage | null;
  send(chatId: string, text: string): Promise<void>;
}

export interface Session {
  chatId: string;
  history: { role: string; content: string }[];
  quoteState: Record<string, unknown>;
  consentParentAt: number | null;
  updatedAt: number;
}

export interface SessionRepository {
  get(chatId: string): Promise<Session | null>;
  save(s: Session): Promise<void>;
  markProcessed(updateId: number): Promise<boolean>;  // false si ya existía
}

export interface QuoteResult {
  primaMensual: number;
  cobertura: number;
  terms: string;       // disclaimer "datos de ejemplo"
  breakdown: Record<string, number>;
}

export interface QuoteRepository {
  // solo lectura de tarifas; el QuoteEngine usa esto en runtime
  loadTariffs(): Promise<unknown>;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  source: string;
}

export interface KnowledgeRepository {
  retrieve(query: string, k: number): Promise<KnowledgeChunk[]>;
}

export interface VectorStore {
  // Fase 2, solo el puerto
  search(embedding: number[], k: number): Promise<KnowledgeChunk[]>;
}

export interface RateLimiter {
  allowMessage(chatId: string): boolean;
  allowQuote(chatId: string): boolean;
}
