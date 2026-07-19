import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createDatabase, type DatabaseHandle } from "../../src/persistence/db.js";
import { createPgKnowledge } from "../../src/domain/knowledge/rag.js";

import { TEST_DB_URL, hasTestDb } from "../helpers/testDb.js";

async function insertChunk(id: string, source: string, text: string) {
  const sql = neon(TEST_DB_URL);
  await sql`INSERT INTO knowledge (id, source, text) VALUES (${id}, ${source}, ${text})
             ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`;
}

async function deleteChunk(id: string) {
  const sql = neon(TEST_DB_URL);
  await sql`DELETE FROM knowledge WHERE id = ${id}`;
}

describe.skipIf(!hasTestDb)("PG knowledge (full-text search)", () => {
  it("recupera chunks por query", async () => {
    const id = randomUUID();
    await insertChunk(id, "test.md", "Para cotizar escribí quiero cotizar y el bot te guía.");
    try {
      const h: DatabaseHandle = createDatabase(TEST_DB_URL);
      const kb = createPgKnowledge(h);
      const chunks = await kb.retrieve("cotizar", 3);
      expect(chunks.some((c) => c.id === id)).toBe(true);
    } finally {
      await deleteChunk(id);
    }
  });

  it("no revienta con texto libre (guiones, comillas, paréntesis, dos puntos)", async () => {
    const h: DatabaseHandle = createDatabase(TEST_DB_URL);
    const kb = createPgKnowledge(h);
    for (const q of ["10-20 años", "edad: 25", "cobertura (niño)", '¿me ayudás con un "seguro"?', "   ", "!!!"]) {
      const chunks = await kb.retrieve(q, 3);
      expect(Array.isArray(chunks)).toBe(true);
    }
  });

  it("fallback OR: una consulta conversacional que el AND deja vacía igual recupera algo", async () => {
    const h = createDatabase(TEST_DB_URL);
    const kb = createPgKnowledge(h);
    // El AND (websearch) de "¿qué planes de seguro ofrecen ustedes?" no matchea
    // ningún chunk (ninguno tiene todos los términos juntos) → antes devolvía
    // vacío y el bot no podía nombrar los planes. Con el fallback OR recupera
    // por el término 'planes' (de la base sembrada). Debe venir NO vacío.
    const chunks = await kb.retrieve("¿qué planes de seguro ofrecen ustedes?", 5);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.source === "plans.md")).toBe(true);
  });

  it("essentials() trae la info core (plans.md + product.md) sembrada", async () => {
    const h = createDatabase(TEST_DB_URL);
    const kb = createPgKnowledge(h);
    const ess = await kb.essentials();
    const sources = new Set(ess.map((c) => c.source));
    // La base de test está sembrada con el contenido real; essentials no debe venir vacío
    // y debe cubrir planes y/o producto (nunca terms/faq sueltos como esenciales).
    expect(ess.length).toBeGreaterThan(0);
    for (const s of sources) expect(["plans.md", "product.md"]).toContain(s);
  });
});
