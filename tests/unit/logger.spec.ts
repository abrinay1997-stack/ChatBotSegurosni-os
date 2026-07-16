import { describe, it, expect } from "vitest";
import { createLogger, withConversation, resetContext } from "../../src/infra/logger.js";

describe("logger", () => {
  it("redacta CI panameño X-XXX-XXXX", () => {
    const lines: string[] = [];
    const l = createLogger("info", (m) => lines.push(m));
    l.info("msg", { txt: "mi CI es 8-123-456 ok" });
    expect(lines[0]).not.toContain("8-123-456");
    expect(lines[0]).toContain("[REDACTED]");
  });
  it("asocia conversation_id vía ALS", async () => {
    const lines: string[] = [];
    const l = createLogger("info", (m) => lines.push(m));
    await withConversation("conv-1", async () => l.info("hola"));
    expect(lines[0]).toContain('"conversation_id":"conv-1"');
  });
});
