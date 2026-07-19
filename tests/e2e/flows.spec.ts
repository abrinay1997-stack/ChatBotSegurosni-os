import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";
import { createSessionManager } from "../../src/conversation/session.manager.js";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import tariffs from "../../src/domain/quote/tariffs.example.json" with { type: "json" };

import { TEST_DB_URL, hasTestDb } from "../helpers/testDb.js";

// E2E: SessionManager + QuoteEngine contra la rama Postgres de test (sin red
// de Telegram/LLM). setConsent() se mantiene como registro interno silencioso
// (ya no gatea ninguna tool, ver Tarea 2 del plan de ruteo conversacional).
describe.skipIf(!hasTestDb)("e2e: sesión + cotización", () => {
  it("registra consentimiento interno y produce una prima", async () => {
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
});
