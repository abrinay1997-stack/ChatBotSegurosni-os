import { defineTool } from "./registry.js";
import { QuoteInputSchema } from "../../domain/quote/quote.schema.js";
import type { QuoteEngine } from "../../domain/quote/QuoteEngine.js";
import type { RateLimiter } from "../../shared/ports/index.js";

export function makeCalculateQuoteTool(engine: QuoteEngine, limiter?: RateLimiter) {
  return defineTool({
    name: "calculateQuote",
    description:
      "Calcula la cotización del seguro. Llamar SOLO con valores que el " +
      "cliente mencionó explícitamente en esta conversación — nunca " +
      "inventar, asumir, ni redondear un dato que falta. Si falta algún " +
      "dato, preguntárselo al cliente antes de llamar esta herramienta.",
    inputSchema: QuoteInputSchema,
    handler: async (input, ctx) => {
      const chatId = String((ctx as { chatId?: string }).chatId ?? "");
      if (limiter && !limiter.allowQuote(chatId)) {
        throw new Error("Límite de cotizaciones alcanzado. Esperá un momento o pedí que te derive a un asesor.");
      }
      return engine.calculate(input);
    },
  });
}
