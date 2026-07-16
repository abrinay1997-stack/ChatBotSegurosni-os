import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/persistence/db.js";
import { createSessionRepository } from "../../src/persistence/repositories/session.repository.js";

describe("SessionRepository", () => {
  it("save + get redondo", async () => {
    const h = createDatabase(":memory:");
    const repo = createSessionRepository(h);
    await repo.save({ chatId: "c1", history: [{ role: "user", content: "h" }], quoteState: { step: 1 }, consentParentAt: null, updatedAt: Date.now() });
    const s = await repo.get("c1");
    expect(s?.history[0].content).toBe("h");
    expect(s?.quoteState.step).toBe(1);
  });
  it("markProcessed true la 1ra vez, false la 2da", async () => {
    const h = createDatabase(":memory:");
    const repo = createSessionRepository(h);
    expect(await repo.markProcessed(1)).toBe(true);
    expect(await repo.markProcessed(1)).toBe(false);
  });
});
