import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool, toolToJsonSchema, runToolLoop } from "../../src/brain/tools/registry.js";
import type { LLMProvider } from "../../src/shared/ports/index.js";

const add = defineTool({
  name: "add", description: "suma",
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  handler: async (i: { a: number; b: number }) => ({ result: i.a + i.b }),
});

describe("tool registry", () => {
  it("toolToJsonSchema produce type object", () => {
    const s = toolToJsonSchema(add);
    expect(s.type).toBe("object");
    expect(s.properties).toHaveProperty("a");
  });
  it("dispatcher ejecuta handler y devuelve ToolResult ok", async () => {
    const fake: LLMProvider = {
      async chat() { return { toolCalls: [{ id: "1", name: "add", arguments: { a: 2, b: 3 } }], usage: { promptTokens: 0, completionTokens: 0 } }; },
    };
    const res = await runToolLoop({ provider: fake, tools: [add], messages: [], ctx: {} as any, maxRounds: 1 });
    expect(res.toolResults[0].output).toEqual({ result: 5 });
  });
  it("input inválido devuelve ToolResult error estructurado (no throw)", async () => {
    const fake: LLMProvider = {
      async chat() { return { toolCalls: [{ id: "1", name: "add", arguments: { a: "x" } }], usage: { promptTokens: 0, completionTokens: 0 } }; },
    };
    const res = await runToolLoop({ provider: fake, tools: [add], messages: [], ctx: {} as any, maxRounds: 1 });
    expect(res.toolResults[0].ok).toBe(false);
    expect(res.toolResults[0].error).toMatch(/a/);
  });
  it("para tras maxRounds", async () => {
    let calls = 0;
    const fake: LLMProvider = {
      async chat() { calls++; return { toolCalls: [{ id: String(calls), name: "add", arguments: { a: 1, b: 1 } }], usage: { promptTokens: 0, completionTokens: 0 } }; },
    };
    const res = await runToolLoop({ provider: fake, tools: [add], messages: [], ctx: {} as any, maxRounds: 3 });
    expect(calls).toBe(3);
    expect(res.truncated).toBe(true);
  });
});
