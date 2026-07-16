export interface Config {
  telegramBotToken: string;
  telegramWebhookSecret?: string;
  telegramAllowlist: string[];
  llmProvider: "groq" | "glm";
  groqApiKey?: string;
  glmApiKey?: string;
  databaseUrl: string;
  llmDailyBudgetUsd: number;
  llmProviderResidentOnly: boolean;
  promptVersion: string;
  promptAb: "control" | "test";
  logLevel: string;
  nodeEnv: "development" | "production";
  port: number;
}
