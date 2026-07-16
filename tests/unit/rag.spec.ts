import { describe, it, expect } from "vitest";
import { createDatabase } from "../../src/persistence/db.js";
import { createFtsKnowledge } from "../../src/domain/knowledge/rag.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("FTS knowledge", () => {
  it("recupera chunks por query", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kb-"));
    writeFileSync(join(dir, "faq.md"), "# ¿Cómo cotizo?\nResponde quiero cotizar y el bot te guía.\n");
    const h = createDatabase(":memory:");
    const kb = createFtsKnowledge(h, dir);
    const chunks = await kb.retrieve("cotizar", 3);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toMatch(/cotizar/i);
  });
});
