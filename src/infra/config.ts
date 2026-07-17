import { z } from "zod";
import type { Config } from "../shared/ports/index.js";

const Schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_ALLOWLIST: z.string().optional(),
  LLM_PROVIDER: z.enum(["groq", "glm"]).default("groq"),
  GROQ_API_KEY: z.string().optional(),
  GLM_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida (connection string de Postgres/Neon)"),
  LLM_DAILY_BUDGET_USD: z.coerce.number().default(5),
  LLM_PROVIDER_RESIDENT_ONLY: z.coerce.boolean().default(false),
  PROMPT_VERSION: z.string().default("v1"),
  PROMPT_AB: z.enum(["control", "test"]).default("control"),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
});

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const p = Schema.parse(env);
  return {
    telegramBotToken: p.TELEGRAM_BOT_TOKEN ?? "",
    telegramWebhookSecret: p.TELEGRAM_WEBHOOK_SECRET,
    telegramAllowlist: p.TELEGRAM_ALLOWLIST ? p.TELEGRAM_ALLOWLIST.split(",") : [],
    llmProvider: p.LLM_PROVIDER,
    groqApiKey: p.GROQ_API_KEY,
    glmApiKey: p.GLM_API_KEY,
    databaseUrl: p.DATABASE_URL,
    llmDailyBudgetUsd: p.LLM_DAILY_BUDGET_USD,
    llmProviderResidentOnly: p.LLM_PROVIDER_RESIDENT_ONLY,
    promptVersion: p.PROMPT_VERSION,
    promptAb: p.PROMPT_AB,
    logLevel: p.LOG_LEVEL,
    nodeEnv: p.NODE_ENV,
    port: p.PORT,
  };
}
