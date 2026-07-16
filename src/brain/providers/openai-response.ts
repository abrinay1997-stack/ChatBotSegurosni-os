import type { ChatMessage, LLMResponse, ToolCall } from "../../shared/ports/index.js";

export type FetchImpl = (url: string, init: RequestInit) => Promise<FetchResponse>;

export interface FetchResponse {
  json(): Promise<any>;
  ok?: boolean;
  status?: number;
}

// Traduce el ChatMessage neutral al formato wire OpenAI-compatible: el
// mensaje assistant lleva tool_calls anidados y cada mensaje tool lleva
// tool_call_id — sin esto Groq/GLM devuelven 400.
export function toOpenAIMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content ?? null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content ?? "" };
    }
    return { role: m.role, content: m.content ?? "" };
  });
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
