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

  it("no revienta con texto que rompe la sintaxis MATCH de FTS5 (guiones, comillas, paréntesis, dos puntos)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kb-"));
    writeFileSync(join(dir, "faq.md"), "# Cobertura\nCobertura de 10 a 20 años, edad: 25.\n");
    const h = createDatabase(":memory:");
    const kb = createFtsKnowledge(h, dir);
    for (const q of ['10-20 años', 'edad: 25', 'cobertura (niño)', '¿me ayudás con un "seguro"?', '   ', '!!!']) {
      const chunks = await kb.retrieve(q, 3);
      expect(Array.isArray(chunks)).toBe(true);
    }
  });
});
