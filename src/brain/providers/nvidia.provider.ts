import type { LLMProvider, LLMChatRequest } from "../../shared/ports/index.js";
import { toolToJsonSchema, type Tool } from "../tools/registry.js";
import { parseOpenAIResponse, toOpenAIMessages, type FetchImpl } from "./openai-response.js";

export function createNvidiaProvider(opts: { apiKey: string; model?: string; fetchImpl?: FetchImpl }): LLMProvider {
  // kimi-k2.6 figura en el catálogo pero devuelve 404 ("Function not found
  // for account") incluso desde el Playground oficial de NVIDIA (2026-07-17)
  // — backend roto del lado de NVIDIA, no un problema de la key. Usar un
  // modelo confirmado funcionando hasta que lo arreglen.
  const model = opts.model ?? "meta/llama-3.1-70b-instruct";
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
