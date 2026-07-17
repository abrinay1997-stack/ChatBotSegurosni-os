import { z } from "zod";

export const QuoteInputSchema = z.object({
  edadPadre: z.number().int().min(18).max(70),
  edadNino: z.number().int().min(0).max(17),
  montoCobertura: z.number().int().min(1000).max(200000),
  plazo: z.number().int().min(1).max(20),         // años
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

export const QuoteOutputSchema = z.object({
  primaMensual: z.number().positive(),
  cobertura: z.number().positive(),
  plan: z.enum(["A", "B", "C"]),
  terms: z.string(),
  breakdown: z.record(z.string(), z.number()),
});
export type QuoteOutput = z.infer<typeof QuoteOutputSchema>;

export const TariffsSchema = z.object({
  ejemplo: z.literal(true),
  basePorEdadPadre: z.array(z.object({ edadMin: z.number(), edadMax: z.number(), factor: z.number() })),
  factorPorPlazo: z.record(z.string(), z.number()),
  factorPorMonto: z.array(z.object({ montoMin: z.number(), factor: z.number() })),
  tasaBaseMensual: z.number().positive(),
});
export type Tariffs = z.infer<typeof TariffsSchema>;
