import { describe, it, expect } from "vitest";
import { parseConfig } from "../../src/infra/config.js";

describe("parseConfig", () => {
  it("parsea env válido", () => {
    const c = parseConfig({ LLM_PROVIDER: "groq", LLM_DAILY_BUDGET_USD: "5", DATABASE_URL: "./x.db" });
    expect(c.llmProvider).toBe("groq");
    expect(c.llmDailyBudgetUsd).toBe(5);
  });
  it("falla si LLM_PROVIDER inválido", () => {
    expect(() => parseConfig({ LLM_PROVIDER: "x" })).toThrow();
  });
});
