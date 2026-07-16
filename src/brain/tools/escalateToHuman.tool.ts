import { z } from "zod";
import { defineTool } from "./registry.js";

export function makeEscalateToHumanTool() {
  let lastEscalation = 0;
  return defineTool({
    name: "escalateToHuman",
    description: "Escala a un humano. Respeta cooldown de 60s por chat.",
    inputSchema: z.object({ reason: z.string() }),
    handler: async (input, ctx) => {
      const now = Date.now();
      if (now - lastEscalation < 60_000) return { escalated: false, reason: "cooldown" };
      lastEscalation = now;
      return { escalated: true, chatId: ctx.chatId, reason: input.reason };
    },
  });
}
