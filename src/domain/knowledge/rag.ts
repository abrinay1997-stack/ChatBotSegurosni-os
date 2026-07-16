import { readFileSync, readdirSync } from "node:fs";
import type { KnowledgeRepository } from "../../shared/ports/index.js";
import type { DatabaseHandle } from "../../persistence/db.js";

// Convierte texto libre del usuario en una query MATCH segura para FTS5.
// Sin esto, caracteres con significado especial en FTS5 (comillas, guiones,
// dos puntos, paréntesis) rompen el parser con "fts5: syntax error" ante
// mensajes tan comunes como "10-20 años" o "cobertura (niño)".
function sanitizeFts5Query(raw: string): string {
  const tokens = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

// RAG Fase 1: FTS5 nativo de SQLite (BM25), cero dependencias.
// Chunking por sección markdown (líneas que empiezan con #).
export function createFtsKnowledge(handle: DatabaseHandle, docsDir: string): KnowledgeRepository {
  handle.db.run("CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(id, source, text)", []);
  for (const file of readdirSync(docsDir)) {
    if (!file.endsWith(".md")) continue;
    const src = `${docsDir}/${file}`;
    const content = readFileSync(src, "utf-8");
    let section = "";
    let title = file;
    for (const line of content.split("\n")) {
      if (line.startsWith("#")) {
        if (section) {
          handle.db.run("INSERT INTO knowledge_fts(id, source, text) VALUES (?,?,?)", [`${file}:${title}`, src, section.trim()]);
        }
        title = line;
        section = "";
      }
      section += line + "\n";
    }
    if (section) {
      handle.db.run("INSERT INTO knowledge_fts(id, source, text) VALUES (?,?,?)", [`${file}:${title}`, src, section.trim()]);
    }
  }
  return {
    async retrieve(query, k) {
      const sanitized = sanitizeFts5Query(query);
      if (!sanitized) return [];
      const rows = handle.db.all(
        "SELECT id, source, text FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT ?",
        [sanitized, k],
      ) as { id: string; source: string; text: string }[];
      return rows.map((r) => ({ id: r.id, source: r.source, text: r.text }));
    },
  };
}
