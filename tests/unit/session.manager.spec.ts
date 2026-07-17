import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";

const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!;

describe("SessionManager", () => {
  it("appendTurn + setQuoteState mantienen estado separado", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    const chatId = randomUUID();
    await sm.setQuoteState(chatId, { step: 2, edadPadre: 30 });
    await sm.appendTurn(chatId, "user", "hola");
    const s = await sm.load(chatId);
    expect(s?.quoteState.step).toBe(2);
    expect(s?.history[0].content).toBe("hola");
  });
  it("poda history pero NO quoteState", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 50 });
    const chatId = randomUUID();
    await sm.setQuoteState(chatId, { step: 1 });
    for (let i = 0; i < 20; i++) await sm.appendTurn(chatId, "user", "mensaje largo ".repeat(5));
    const s = await sm.load(chatId);
    expect(s?.history.length).toBeLessThan(20);
    expect(s?.quoteState.step).toBe(1);
  });
  it("setConsent marca consentParentAt", async () => {
    const h = createDatabase(TEST_DB_URL);
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    const chatId = randomUUID();
    await sm.setConsent(chatId);
    const s = await sm.load(chatId);
    expect(s?.consentParentAt).not.toBeNull();
  });
});
