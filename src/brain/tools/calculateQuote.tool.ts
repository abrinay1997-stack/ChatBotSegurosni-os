import { defineTool } from "./registry.js";
import { QuoteInputSchema } from "../../domain/quote/quote.schema.js";
import type { QuoteEngine } from "../../domain/quote/QuoteEngine.js";

export function makeCalculateQuoteTool(engine: QuoteEngine) {
  return defineTool({
    name: "calculateQuote",
    description: "Cotiza el seguro educacional. Solo llamar tras consentimiento parental.",
    inputSchema: QuoteInputSchema,
    handler: async (input) => engine.calculate(input),
  });
}
