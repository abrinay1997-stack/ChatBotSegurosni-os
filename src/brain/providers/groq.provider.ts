import type { LLMProvider, LLMChatRequest } from "../../shared/ports/index.js";
import { toolToJsonSchema, type Tool } from "../tools/registry.js";
import { parseOpenAIResponse, toOpenAIMessages, type FetchImpl } from "./openai-response.js";

export function createGroqProvider(opts: { apiKey: string; model?: string; fetchImpl?: FetchImpl }): LLMProvider {
  const model = opts.model ?? "llama-3.3-70b-versatile";
  const fetchImpl: FetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  return {
    async chat(req: LLMChatRequest) {
      const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
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
