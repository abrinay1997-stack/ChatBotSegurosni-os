import { createHash } from "node:crypto";
import { v1SystemPrompt } from "./prompts/v1.system.js";
import { v2SystemPrompt } from "./prompts/v2.system.js";

export interface PromptManager {
  get(): { system: string; version: string; hash: string };
}

// v1: prompt original tool-heavy (guía a la LLM a llamar herramientas).
// v2: RAG-first, la LLM responde libre anclada en el contexto (default actual).
// El prompt vive como constante TS (no .md leído en runtime): un archivo .md
// cargado con readFileSync no lo empaqueta el bundler de Netlify Functions
// (esbuild solo sigue imports de código), así que en producción serverless
// fallaba con ENOENT. Como módulo TS, tsc/esbuild lo incluyen igual que
// cualquier otra dependencia, sin pasos de copia adicionales.
const PROMPTS: Record<string, string> = {
  v1: v1SystemPrompt,
  v2: v2SystemPrompt,
};

export function createPromptManager(opts: { version: string; ab: "control" | "test" }): PromptManager {
  const version = opts.ab === "test" ? `${opts.version}-b` : opts.version;
  const system = PROMPTS[opts.version] ?? v2SystemPrompt;
  const hash = createHash("sha256").update(system).digest("hex").slice(0, 16);
  return { get: () => ({ system, version, hash }) };
}
