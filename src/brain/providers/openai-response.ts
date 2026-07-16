import type { LLMResponse, ToolCall } from "../../shared/ports/index.js";

export type FetchImpl = (url: string, init: RequestInit) => Promise<FetchResponse>;

export interface FetchResponse {
  json(): Promise<any>;
  ok?: boolean;
  status?: number;
}

// Groq y GLM son ambos OpenAI-compatible: el parsing del response es idéntico.
export async function parseOpenAIResponse(res: FetchResponse): Promise<LLMResponse> {
  const json = await res.json();
  const choice = json.choices?.[0];
  const toolCalls: ToolCall[] | undefined = choice?.message?.tool_calls?.map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || "{}"),
  }));
  return {
    content: choice?.message?.content ?? undefined,
    toolCalls,
    usage: { promptTokens: json.usage?.prompt_tokens ?? 0, completionTokens: json.usage?.completion_tokens ?? 0 },
  };
}

export function buildOpenAIRequest(model: string, req: { messages: any; tools?: any; toolChoice?: string }, toolSchemas: { type: string; function: { name: string; description: string; parameters: any } }[]): Record<string, unknown> {
  return {
    model,
    messages: req.messages,
    tools: req.tools ? toolSchemas : undefined,
    tool_choice: req.toolChoice === "none" ? "none" : "auto",
  };
}
