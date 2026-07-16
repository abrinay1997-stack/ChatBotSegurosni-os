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

export interface LLMChatRequest {
  messages: { role: "system" | "user" | "assistant" | "tool"; content: string }[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "none";
}

export interface LLMProvider {
  chat(req: LLMChatRequest): Promise<LLMResponse>;
}
