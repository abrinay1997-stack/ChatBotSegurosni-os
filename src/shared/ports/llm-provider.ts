import type { ZodSchema } from "zod";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ZodSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  content?: string;
  toolCalls?: ToolCall[];
  usage: LLMUsage;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: ToolCall[]; // solo role: "assistant" — la llamada a tool que originó la ronda
  toolCallId?: string;    // solo role: "tool" — referencia al ToolCall que responde
}

export interface LLMChatRequest {
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "none";
}

export interface LLMProvider {
  chat(req: LLMChatRequest): Promise<LLMResponse>;
}
