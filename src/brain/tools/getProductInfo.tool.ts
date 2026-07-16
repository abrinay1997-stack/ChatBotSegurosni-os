import { z } from "zod";
import { defineTool } from "./registry.js";

export const PRODUCT_INFO = {
  nombre: "Seguro Educativo Proantec",
  cobertura: "Cubre la educación del menor si los padres fallecen.",
  disclaimer: "DATOS DE EJEMPLO. Términos reales al ir a producción.",
};

export function makeGetProductInfoTool() {
  return defineTool({
    name: "getProductInfo",
    description: "Devuelve información general del producto.",
    inputSchema: z.object({}),
    handler: async () => PRODUCT_INFO,
  });
}
