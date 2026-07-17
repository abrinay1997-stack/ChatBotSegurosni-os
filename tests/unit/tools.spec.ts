import { describe, it, expect } from "vitest";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import { makeCalculateQuoteTool } from "../../src/brain/tools/calculateQuote.tool.js";

describe("calculateQuote tool", () => {
  it("devuelve QuoteResult con el plan correspondiente al monto", async () => {
    const t = {
      ejemplo: true,
      basePorEdadPadre: [{ edadMin: 18, edadMax: 70, factor: 1 }],
      factorPorPlazo: { "10": 1.6 },
      factorPorMonto: [{ montoMin: 1000, factor: 1 }, { montoMin: 50000, factor: 0.95 }, { montoMin: 100000, factor: 0.9 }],
      tasaBaseMensual: 0.004,
    };
    const tool = makeCalculateQuoteTool(createQuoteEngine(t as any));
    const bajo = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 }, {} as any);
    expect((bajo as any).primaMensual).toBeGreaterThan(0);
    expect((bajo as any).terms).toMatch(/ejemplo/i);
    expect((bajo as any).plan).toBe("A");

    const medio = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 60000, plazo: 10 }, {} as any);
    expect((medio as any).plan).toBe("B");

    const alto = await tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 150000, plazo: 10 }, {} as any);
    expect((alto as any).plan).toBe("C");
  });

  it("respeta el RateLimiter de cotizaciones cuando se le inyecta uno", async () => {
    const t = {
      ejemplo: true,
      basePorEdadPadre: [{ edadMin: 18, edadMax: 70, factor: 1 }],
      factorPorPlazo: { "10": 1.6 },
      factorPorMonto: [{ montoMin: 1000, factor: 1 }],
      tasaBaseMensual: 0.004,
    };
    const limiter = { allowMessage: () => true, allowQuote: () => false };
    const tool = makeCalculateQuoteTool(createQuoteEngine(t as any), limiter);
    await expect(
      tool.handler({ edadPadre: 30, edadNino: 5, montoCobertura: 10000, plazo: 10 }, { chatId: "1" } as any),
    ).rejects.toThrow(/límite/i);
  });
});
