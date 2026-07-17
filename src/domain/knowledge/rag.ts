import type { KnowledgeRepository } from "../../shared/ports/index.js";
import type { DatabaseHandle } from "../../persistence/db.js";

// RAG Fase 1: full-text search nativo de Postgres (tsvector + índice GIN), cero
// dependencias externas. El seed de contenido corre en scripts/seed-knowledge.ts,
// no acá — ver ese archivo para el chunking por sección markdown.
export function createPgKnowledge(handle: DatabaseHandle): KnowledgeRepository {
  return {
    async retrieve(query, k) {
      if (!query.trim()) return [];
      const rows = (await handle.db.all(
        `SELECT id, source, text FROM knowledge
         WHERE to_tsvector('spanish', text) @@ websearch_to_tsquery('spanish', $1)
         ORDER BY ts_rank(to_tsvector('spanish', text), websearch_to_tsquery('spanish', $1)) DESC
         LIMIT $2`,
        [query, k],
      )) as { id: string; source: string; text: string }[];
      return rows.map((r) => ({ id: r.id, source: r.source, text: r.text }));
    },
  };
}
