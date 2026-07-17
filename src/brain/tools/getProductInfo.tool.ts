import { z } from "zod";
import { defineTool } from "./registry.js";

export const PRODUCT_INFO = {
  nombre: "Seguro Educativo Juancito Ads",
  cobertura: "Cubre la educación del menor si el padre/tutor fallece, y accidentes escolares (dentro y fuera del colegio).",
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
