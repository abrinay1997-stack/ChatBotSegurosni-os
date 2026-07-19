import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";

import { TEST_DB_URL, hasTestDb } from "../helpers/testDb.js";

describe.skipIf(!hasTestDb)("SessionRepository", () => {
  it("save + get redondo", async () => {
    const h = createDatabase(TEST_DB_URL);
    const repo = createSessionRepository(h);
    const chatId = randomUUID();
    await repo.save({ chatId, history: [{ role: "user", content: "h" }], quoteState: { step: 1 }, consentParentAt: null, updatedAt: Date.now() });
    const s = await repo.get(chatId);
    expect(s?.history[0].content).toBe("h");
    expect(s?.quoteState.step).toBe(1);
  });
  it("markProcessed true la 1ra vez, false la 2da", async () => {
    const h = createDatabase(TEST_DB_URL);
    const repo = createSessionRepository(h);
    const updateId = Math.floor(Math.random() * 1_000_000_000);
    expect(await repo.markProcessed(updateId)).toBe(true);
    expect(await repo.markProcessed(updateId)).toBe(false);
  });
});
