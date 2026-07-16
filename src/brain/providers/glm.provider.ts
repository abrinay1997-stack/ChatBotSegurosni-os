import type { LLMProvider, LLMChatRequest } from "../../shared/ports/index.js";
import { toolToJsonSchema, type Tool } from "../tools/registry.js";
import { parseOpenAIResponse, type FetchImpl } from "./openai-response.js";

export function createGlmProvider(opts: { apiKey: string; baseUrl?: string; model?: string; fetchImpl?: FetchImpl }): LLMProvider {
  const baseUrl = opts.baseUrl ?? "https://open.bigmodel.cn/api/paas/v4";
  const model = opts.model ?? "glm-4-plus";
  const fetchImpl: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  return {
    async chat(req: LLMChatRequest) {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model,
          messages: req.messages,
          tools: req.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: toolToJsonSchema(t as unknown as Tool) } })),
          tool_choice: req.toolChoice === "none" ? "none" : "auto",
        }),
      });
      return parseOpenAIResponse(res);
    },
  };
}
