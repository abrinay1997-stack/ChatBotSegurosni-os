import { z } from "zod";
import { defineTool } from "./registry.js";
import type { KnowledgeRepository } from "../../shared/ports/index.js";

export function makeShowPlansTool(repo: KnowledgeRepository) {
  return defineTool({
    name: "showPlans",
    description:
      "Devuelve el resumen de los planes disponibles (A, B y C) con su " +
      "cobertura. Usar cuando el cliente pregunta qué planes hay, qué " +
      "opciones tiene, o quiere conocer más antes de cotizar.",
    inputSchema: z.object({}),
    handler: async () => {
      const chunks = await repo.retrieve("planes A B C cobertura", 3);
      return { chunks, instruction: "Responde usando SOLO estos chunks para describir los planes. Cita source." };
    },
  });
}
