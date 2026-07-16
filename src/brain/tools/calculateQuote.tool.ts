import { defineTool } from "./registry.js";
import { QuoteInputSchema } from "../../domain/quote/quote.schema.js";
import type { QuoteEngine } from "../../domain/quote/QuoteEngine.js";
import type { RateLimiter } from "../../shared/ports/index.js";

export function makeCalculateQuoteTool(engine: QuoteEngine, limiter?: RateLimiter) {
  return defineTool({
    name: "calculateQuote",
    description: "Cotiza el seguro educacional. Solo llamar tras consentimiento parental.",
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
