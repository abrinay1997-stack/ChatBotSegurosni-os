import { z } from "zod";
import { defineTool } from "./registry.js";

const RecommendPlanInputSchema = z.object({
  edadNino: z.number().int().min(0).max(17),
  presupuestoMensual: z.number().positive(),
});

// Rangos de ejemplo (mismo criterio que el resto del motor de cotización,
// que ya está marcado como DATOS DE EJEMPLO): no son precios reales de SURA.
export function planPorPresupuesto(presupuestoMensual: number, edadNino: number): "A" | "B" | "C" {
  let plan: "A" | "B" | "C" = presupuestoMensual >= 50 ? "C" : presupuestoMensual >= 20 ? "B" : "A";
  // A menor edad del niño, más años de cobertura escolar quedan por
  // delante — sube un escalón la recomendación (tope: C).
  if (edadNino <= 5 && plan !== "C") plan = plan === "A" ? "B" : "C";
  return plan;
}

export function makeRecommendPlanTool() {
  return defineTool({
    name: "recommendPlan",
    description:
      "Recomienda un plan (A, B o C) según la edad del niño y el " +
      "presupuesto mensual del cliente. Usar cuando el cliente duda qué " +
      "plan le conviene, en vez de pedirle los datos exactos para cotizar.",
    inputSchema: RecommendPlanInputSchema,
    handler: async ({ edadNino, presupuestoMensual }) => {
      const plan = planPorPresupuesto(presupuestoMensual, edadNino);
      return {
        plan,
        motivo: `Con un presupuesto de B/.${presupuestoMensual}/mes y un niño de ${edadNino} años, el Plan ${plan} es el que mejor se ajusta (DATOS DE EJEMPLO).`,
      };
    },
  });
}
