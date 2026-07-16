import { z } from "zod";
import { defineTool } from "./registry.js";
import type { KnowledgeRepository } from "../../shared/ports/index.js";

export function makeLookupKnowledgeTool(repo: KnowledgeRepository) {
  return defineTool({
    name: "lookupKnowledge",
    description: "Recupera información del producto/cobertura. Siempre cita la fuente.",
    inputSchema: z.object({ query: z.string().min(3) }),
    handler: async ({ query }) => {
      const chunks = await repo.retrieve(query, 3);
      return { chunks, instruction: "Responde usando SOLO estos chunks. Cita source." };
    },
  });
}
