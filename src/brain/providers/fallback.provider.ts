import type { LLMProvider, LLMChatRequest } from "../../shared/ports/index.js";

// Envuelve un provider primario con uno secundario: si el primario tira
// (401/429/5xx/timeout — ver parseOpenAIResponse), reintenta una vez con
// el secundario antes de dejar que el error suba a composition.ts. No hay
// reintento en cascada más allá de dos niveles — si el secundario también
// falla, el error real es el del secundario.
export function createFallbackProvider(opts: {
  primary: LLMProvider;
  secondary: LLMProvider;
  onFallback?: (error: unknown) => void;
}): LLMProvider {
  return {
    async chat(req: LLMChatRequest) {
      try {
        return await opts.primary.chat(req);
      } catch (e) {
        opts.onFallback?.(e);
        return opts.secondary.chat(req);
      }
    },
  };
}
