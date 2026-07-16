import { describe, it, expect } from "vitest";
import { createQuoteEngine } from "../../src/domain/quote/QuoteEngine.js";
import type { Tariffs } from "../../src/domain/quote/quote.schema.js";

const t: Tariffs = {
  ejemplo: true,
  basePorEdadPadre: [
    { edadMin: 18, edadMax: 30, factor: 1.0 },
    { edadMin: 31, edadMax: 40, factor: 1.4 },
  ],
  factorPorPlazo: { "1": 1.0, "10": 1.6 },
  factorPorMonto: [{ montoMin: 1000, factor: 1.0 }, { montoMin: 50000, factor: 0.95 }],
  tasaBaseMensual: 0.004,
};

const engine = createQuoteEngine(t);

describe("QuoteEngine.calculate", () => {
  it("prima positiva y = cobertura * tasa * factores", () => {
    const r = engine.calculate({ edadPadre: 25, edadNino: 5, montoCobertura: 10000, plazo: 10 });
    const expected = 10000 * 0.004 * 1.0 * 1.6 * 1.0;
    expect(r.primaMensual).toBeCloseTo(expected, 6);
    expect(r.cobertura).toBe(10000);
  });
  it("factor de monto aplica banda correcta", () => {
    const r = engine.calculate({ edadPadre: 25, edadNino: 5, montoCobertura: 60000, plazo: 1 });
    expect(r.breakdown["factorMonto"]).toBe(0.95);
  });
  it("edad límite 18 y 70 válidas", () => {
    expect(() => engine.calculate({ edadPadre: 18, edadNino: 0, montoCobertura: 1000, plazo: 1 })).not.toThrow();
    expect(() => engine.calculate({ edadPadre: 70, edadNino: 17, montoCobertura: 1000, plazo: 1 })).not.toThrow();
  });
  it("terms indica datos de ejemplo", () => {
    const r = engine.calculate({ edadPadre: 25, edadNino: 5, montoCobertura: 1000, plazo: 1 });
    expect(r.terms).toMatch(/ejemplo/i);
  });
  it("idempotente: misma entrada = misma salida", () => {
    const i = { edadPadre: 35, edadNino: 5, montoCobertura: 20000, plazo: 5 };
    expect(engine.calculate(i)).toEqual(engine.calculate(i));
  });

  // Casos adicionales (más allá de los 5 mínimos del brief) para cubrir las
  // ramas de "clamp" defensivas que garantizan que el motor NUNCA lance una
  // excepción, incluso si las bandas de la tarifa no cubren todo el rango
  // válido de QuoteInputSchema.
  it("clamp de edad por debajo de la primera banda definida en la tarifa", () => {
    const tarifaIncompleta: Tariffs = {
      ...t,
      basePorEdadPadre: [{ edadMin: 20, edadMax: 30, factor: 1.0 }],
    };
    const motor = createQuoteEngine(tarifaIncompleta);
    const r = motor.calculate({ edadPadre: 18, edadNino: 0, montoCobertura: 1000, plazo: 1 });
    expect(r.breakdown["factorEdad"]).toBe(1.0);
  });

  it("clamp de plazo por encima de la banda máxima definida en la tarifa", () => {
    const tarifaIncompleta: Tariffs = {
      ...t,
      factorPorPlazo: { "1": 1.0 },
    };
    const motor = createQuoteEngine(tarifaIncompleta);
    const r = motor.calculate({ edadPadre: 25, edadNino: 5, montoCobertura: 1000, plazo: 20 });
    expect(r.breakdown["factorPlazo"]).toBe(1.0);
  });

  it("factorEdad clampea arriba de la última banda", () => {
    const r = engine.calculate({ edadPadre: 70, edadNino: 5, montoCobertura: 10000, plazo: 10 });
    expect(r.breakdown["factorEdad"]).toBe(1.4);
  });
});
