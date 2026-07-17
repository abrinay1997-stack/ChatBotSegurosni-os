import type { Tariffs, QuoteInput, QuoteOutput } from "./quote.schema.js";

export interface QuoteEngine {
  calculate(input: QuoteInput): QuoteOutput;
}

export function createQuoteEngine(tariffs: Tariffs): QuoteEngine {
  const bandasEdadOrdenadas = [...tariffs.basePorEdadPadre].sort((x, y) => x.edadMin - y.edadMin);

  function factorEdad(edad: number): number {
    const b = bandasEdadOrdenadas.find((x) => edad >= x.edadMin && edad <= x.edadMax);
    if (b) return b.factor;
    // Edad válida (18-70 por QuoteInputSchema) pero fuera de las bandas configuradas
    // en la tarifa: nunca lanzar, clamp a la banda más cercana (inferior o superior).
    const primera = bandasEdadOrdenadas[0];
    const ultima = bandasEdadOrdenadas[bandasEdadOrdenadas.length - 1];
    return edad < primera.edadMin ? primera.factor : ultima.factor;
  }
  function factorMonto(monto: number): number {
    let f = 1;
    const bandasMontoOrdenadas = [...tariffs.factorPorMonto].sort((a, b) => a.montoMin - b.montoMin);
    for (const b of bandasMontoOrdenadas) if (monto >= b.montoMin) f = b.factor;
    return f;
  }
  function factorPlazo(plazo: number): number {
    const key = String(plazo);
    if (key in tariffs.factorPorPlazo) return tariffs.factorPorPlazo[key];
    // interpola a la banda más cercana superior
    const keys = Object.keys(tariffs.factorPorPlazo).map(Number).sort((a, b) => a - b);
    const ceil = keys.find((k) => k >= plazo) ?? keys[keys.length - 1];
    return tariffs.factorPorPlazo[String(ceil)];
  }
  // Mismos cortes que factorPorMonto en tariffs.example.json (1000/50000/100000)
  // — no son rangos nuevos, son los que ya existen para el cálculo de la prima.
  function planPorMonto(monto: number): "A" | "B" | "C" {
    if (monto >= 100000) return "C";
    if (monto >= 50000) return "B";
    return "A";
  }

  return {
    calculate(input): QuoteOutput {
      const fEdad = factorEdad(input.edadPadre);
      const fMonto = factorMonto(input.montoCobertura);
      const fPlazo = factorPlazo(input.plazo);
      const primaMensual = input.montoCobertura * tariffs.tasaBaseMensual * fEdad * fPlazo * fMonto;
      return {
        primaMensual: Math.round(primaMensual * 100) / 100,
        cobertura: input.montoCobertura,
        plan: planPorMonto(input.montoCobertura),
        terms: "Cotización con DATOS DE EJEMPLO. Los costos y términos reales se cargarán al ir a producción.",
        breakdown: { tasaBase: tariffs.tasaBaseMensual, factorEdad: fEdad, factorPlazo: fPlazo, factorMonto: fMonto },
      };
    },
  };
}
