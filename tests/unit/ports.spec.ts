import { describe, it, expect } from "vitest";
import type * as Ports from "../../src/shared/ports/index.js";

describe("ports exports", () => {
  it("compila y exporta tipos", () => {
    const x: Ports.Session = { chatId: "1", history: [], quoteState: {}, consentParentAt: null, updatedAt: 0 };
    expect(x.chatId).toBe("1");
  });
});
