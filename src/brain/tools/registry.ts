import type { ZodSchema } from "zod";
import type { ChatMessage, LLMProvider, ToolCall } from "../../shared/ports/index.js";

export interface ToolCtx {
  // inyectado por composition root: repos, QuoteEngine, logger
  [k: string]: unknown;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  handler: (input: any, ctx: ToolCtx) => Promise<unknown>;
}

export function defineTool(t: Tool): Tool { return t; }

export type JSONSchema = { type: string; properties?: Record<string, any>; required?: string[]; description?: string };

export function toolToJsonSchema(tool: Tool): JSONSchema {
  // Introspección de Zod v3: ZodObject._def.shape() devuelve el mapa de campos.
  const shape = (tool.inputSchema as any)._def?.shape?.() ?? (tool.inputSchema as any)._def;
  const props: Record<string, any> = {};
  const required: string[] = [];
  if (shape) {
    for (const [k, v] of Object.entries(shape)) {
      const t = v as any;
      props[k] = { type: t._def?.typeName === "ZodNumber" ? "number" : "string" };
      if (!t.isOptional?.()) required.push(k);
    }
  }
  return { type: "object", properties: props, required, description: tool.description };
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface ToolLoopResult {
  toolResults: ToolResult[];
  finalResponse?: string;
  truncated: boolean;
  usage: { promptTokens: number; completionTokens: number };
}

export async function runToolLoop(opts: {
  provider: LLMProvider;
  tools: Tool[];
  messages: ChatMessage[];
  ctx: ToolCtx;
  maxRounds?: number;
}): Promise<ToolLoopResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const toolResults: ToolResult[] = [];
  const messages = [...opts.messages];
  const totalUsage = { promptTokens: 0, completionTokens: 0 };
  let last: { content?: string; toolCalls?: ToolCall[] } = { content: undefined, toolCalls: undefined };

  for (let round = 0; round < maxRounds; round++) {
    const res = await opts.provider.chat({
      messages,
      tools: opts.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      toolChoice: "auto",
    });
    totalUsage.promptTokens += res.usage.promptTokens;
    totalUsage.completionTokens += res.usage.completionTokens;
    last = res;
    if (!res.toolCalls?.length) {
      return { toolResults, finalResponse: res.content, truncated: false, usage: totalUsage };
    }
    // El mensaje assistant con tool_calls DEBE preceder a los mensajes tool
    // que lo responden — las APIs OpenAI-compatible (Groq/GLM) rechazan la
    // request si falta (400) o si un mensaje "tool" no trae tool_call_id.
    messages.push({ role: "assistant", content: res.content, toolCalls: res.toolCalls });
    for (const tc of res.toolCalls) {
      const tool = opts.tools.find((t) => t.name === tc.name);
      if (!tool) {
        toolResults.push({ toolCallId: tc.id, name: tc.name, ok: false, error: `tool desconocido: ${tc.name}` });
        messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify({ error: `tool desconocido: ${tc.name}` }) });
        continue;
      }
      const parsed = tool.inputSchema.safeParse(tc.arguments);
      if (!parsed.success) {
        toolResults.push({ toolCallId: tc.id, name: tc.name, ok: false, error: parsed.error.message });
        messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify({ error: parsed.error.message }) });
        continue;
      }
      try {
        const out = await tool.handler(parsed.data, opts.ctx);
        toolResults.push({ toolCallId: tc.id, name: tc.name, ok: true, output: out });
        messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(out) });
      } catch (e: any) {
        toolResults.push({ toolCallId: tc.id, name: tc.name, ok: false, error: e.message });
        messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify({ error: e.message }) });
      }
    }
  }
  return { toolResults, finalResponse: last.content, truncated: true, usage: totalUsage };
}
