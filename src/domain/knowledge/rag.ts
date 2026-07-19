import type { KnowledgeRepository, KnowledgeChunk } from "../../shared/ports/index.js";
import type { DatabaseHandle } from "../../persistence/db.js";

// Fuentes con la info CORE del producto: se inyectan siempre (essentials).
const ESSENTIAL_SOURCES = ["plans.md", "product.md"];

// Construye un tsquery OR-safe a partir de texto libre: deja solo letras/dígitos
// y espacios (así no hay caracteres que rompan la sintaxis de to_tsquery) y une
// las palabras con ' | '. Devuelve "" si no queda ningún término útil.
function toOrTsQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return terms.join(" | ");
}

// RAG Fase 1: full-text search nativo de Postgres (tsvector + índice GIN), cero
// dependencias externas. El seed de contenido corre en scripts/seed-knowledge.ts.
export function createPgKnowledge(handle: DatabaseHandle): KnowledgeRepository {
  return {
    async retrieve(query, k) {
      if (!query.trim()) return [];
      // 1) Intento preciso con websearch_to_tsquery (semántica AND: exige que el
      //    chunk tenga todos los términos). Bueno cuando la consulta es directa.
      const precise = (await handle.db.all(
        `SELECT id, source, text FROM knowledge
         WHERE to_tsvector('spanish', text) @@ websearch_to_tsquery('spanish', $1)
         ORDER BY ts_rank(to_tsvector('spanish', text), websearch_to_tsquery('spanish', $1)) DESC
         LIMIT $2`,
        [query, k],
      )) as { id: string; source: string; text: string }[];
      if (precise.length) return precise.map((r) => ({ id: r.id, source: r.source, text: r.text }));

      // 2) Fallback OR: consultas conversacionales ("¿qué planes de seguro
      //    ofrecen?") no tienen todos los términos en un mismo chunk, y el AND
      //    devuelve vacío. Con OR recuperamos por cualquier término (más recall).
      const orQuery = toOrTsQuery(query);
      if (!orQuery) return [];
      const loose = (await handle.db.all(
        `SELECT id, source, text FROM knowledge
         WHERE to_tsvector('spanish', text) @@ to_tsquery('spanish', $1)
         ORDER BY ts_rank(to_tsvector('spanish', text), to_tsquery('spanish', $1)) DESC
         LIMIT $2`,
        [orQuery, k],
      )) as { id: string; source: string; text: string }[];
      return loose.map((r) => ({ id: r.id, source: r.source, text: r.text }));
    },

    async essentials(): Promise<KnowledgeChunk[]> {
      const rows = (await handle.db.all(
        `SELECT id, source, text FROM knowledge WHERE source = ANY($1) ORDER BY source, id`,
        [ESSENTIAL_SOURCES],
      )) as { id: string; source: string; text: string }[];
      return rows.map((r) => ({ id: r.id, source: r.source, text: r.text }));
    },
  };
}
