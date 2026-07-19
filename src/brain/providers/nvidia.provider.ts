import type { LLMProvider, LLMChatRequest } from "../../shared/ports/index.js";
import { toolToJsonSchema, type Tool } from "../tools/registry.js";
import { parseOpenAIResponse, toOpenAIMessages, type FetchImpl } from "./openai-response.js";

export function createNvidiaProvider(opts: { apiKey: string; model?: string; fetchImpl?: FetchImpl }): LLMProvider {
  // Default: llama-3.1-8b (latencia ~1.7s). NO usar 70b acá: mide ~12.8s por
  // llamada, y las funciones de Netlify cortan a los 10s → 502 Bad Gateway →
  // Telegram no recibe respuesta (diagnosticado 2026-07-19, ver
  // docs/errors-learned.md). Como este provider es el fallback serverless,
  // prioriza latencia sobre calidad. kimi-k2.6 seguía dando 404 del lado de
  // NVIDIA al momento de escribir esto.
  const model = opts.model ?? "meta/llama-3.1-8b-instruct";
  const fetchImpl: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  return {
    async chat(req: LLMChatRequest) {
      const res = await fetchImpl("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model,
          messages: toOpenAIMessages(req.messages),
          tools: req.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: toolToJsonSchema(t as unknown as Tool) } })),
          tool_choice: req.toolChoice === "none" ? "none" : "auto",
        }),
      });
      return parseOpenAIResponse(res);
    },
  };
}
