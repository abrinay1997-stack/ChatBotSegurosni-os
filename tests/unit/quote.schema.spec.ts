import { describe, it, expect } from "vitest";
import { QuoteInputSchema, TariffsSchema } from "../../src/domain/quote/quote.schema.js";
import tariffs from "../../src/domain/quote/tariffs.example.json" with { type: "json" };

describe("quote schema", () => {
  it("tarifas de ejemplo válidas", () => {
    expect(() => TariffsSchema.parse(tariffs)).not.toThrow();
  });
  it("rechaza edad de padre fuera de rango", () => {
    expect(() => QuoteInputSchema.parse({ edadPadre: 17, edadNino: 5, montoCobertura: 10000, plazo: 10 })).toThrow();
  });
  it("rechaza monto no entero", () => {
    expect(() => QuoteInputSchema.parse({ edadPadre: 30, edadNino: 5, montoCobertura: 10000.5, plazo: 10 })).toThrow();
  });
});
