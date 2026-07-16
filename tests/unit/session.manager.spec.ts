import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";

describe("SessionManager", () => {
  it("appendTurn + setQuoteState mantienen estado separado", async () => {
    const h = createDatabase(":memory:");
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    await sm.setQuoteState("c1", { step: 2, edadPadre: 30 });
    await sm.appendTurn("c1", "user", "hola");
    const s = await sm.load("c1");
    expect(s?.quoteState.step).toBe(2);
    expect(s?.history[0].content).toBe("hola");
  });
  it("poda history pero NO quoteState", async () => {
    const h = createDatabase(":memory:");
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 50 });
    await sm.setQuoteState("c1", { step: 1 });
    for (let i = 0; i < 20; i++) await sm.appendTurn("c1", "user", "mensaje largo ".repeat(5));
    const s = await sm.load("c1");
    expect(s?.history.length).toBeLessThan(20);
    expect(s?.quoteState.step).toBe(1);
  });
  it("setConsent marca consentParentAt", async () => {
    const h = createDatabase(":memory:");
    const sm = createSessionManager(createSessionRepository(h), { maxContextTokens: 1000 });
    await sm.setConsent("c1");
    const s = await sm.load("c1");
    expect(s?.consentParentAt).not.toBeNull();
  });
});
