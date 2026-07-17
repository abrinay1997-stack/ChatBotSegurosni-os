import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import { buildToolsForState } from "../../src/conversation/router.js";
import { makeCalculateQuoteTool, makeGetProductInfoTool } from "../../src/brain/tools/index.js";
import tariffs from "../../src/domain/quote/tariffs.example.json" with { type: "json" };

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

// E2E: flujo consent + cotización contra la rama Postgres de test (sin red de Telegram/LLM).
describe("e2e: wizard + quote", () => {
  it("flujo consent + cotización produce prima", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const r = engine.calculate({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 });
    expect(r.primaMensual).toBeGreaterThan(0);
    const s = await sm.load(chatId);
    expect(s?.consentParentAt).not.toBeNull();
  });

  it("sin consentimiento, calculateQuote NO está disponible para el LLM", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.appendTurn(chatId, "user", "hola"); // crea sesión con consentParentAt: null
    const session = (await sm.load(chatId))!;
    const tools = buildToolsForState(session, [makeCalculateQuoteTool(engine), makeGetProductInfoTool()]);
    expect(tools.find((t) => t.name === "calculateQuote")).toBeUndefined();
    expect(tools.find((t) => t.name === "getProductInfo")).toBeDefined();
  });

  it("con consentimiento, calculateQuote SÍ está disponible", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 6000 });
    const engine = createQuoteEngine(tariffs as never);
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const session = (await sm.load(chatId))!;
    const tools = buildToolsForState(session, [makeCalculateQuoteTool(engine), makeGetProductInfoTool()]);
    expect(tools.find((t) => t.name === "calculateQuote")).toBeDefined();
  });
});
