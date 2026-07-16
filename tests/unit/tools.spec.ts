import { describe, it, expect } from "vitest";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import { makeCalculateQuoteTool } from "../../src/brain/tools/calculateQuote.tool.js";

describe("calculateQuote tool", () => {
  it("devuelve QuoteResult", async () => {
    const t = {
      ejemplo: true,
      basePorEdadPadre: [{ edadMin: 18, edadMax: 70, factor: 1 }],
      factorPorPlazo: { "10": 1.6 },
      factorPorMonto: [{ montoMin: 1000, factor: 1 }],
      tasaBaseMensual: 0.004,
    };
    const tool = makeCalculateQuoteTool(createQuoteEngine(t as any));
    const r = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 }, {} as any);
    expect((r as any).primaMensual).toBeGreaterThan(0);
    expect((r as any).terms).toMatch(/ejemplo/i);
  });
});
