import { describe, it, expect, vi } from "vitest";
import { createGroqProvider } from "../../src/brain/providers/groq.provider.js";
import { createGlmProvider } from "../../src/brain/providers/glm.provider.js";
import { createNvidiaProvider } from "../../src/brain/providers/nvidia.provider.js";
import { createFallbackProvider } from "../../src/brain/providers/fallback.provider.js";
import type { FetchImpl } from "../../src/brain/providers/openai-response.js";
import type { LLMProvider } from "../../src/shared/ports/index.js";

// Fake fetch que devuelve respuestas OpenAI-compatible canónicas — 100% offline.
function fakeFetch(canned: any): FetchImpl {
  return async () => ({ json: async () => canned, ok: true, status: 200 });
}

const toolCallResponse = {
  choices: [{
    message: {
      content: null,
      tool_calls: [{
        id: "tc1", type: "function",
        function: { name: "calculateQuote", arguments: '{"edadPadre":30,"edadNino":5,"montoCobertura":10000,"plazo":10}' },
      }],
    },
  }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const textResponse = {
  choices: [{ message: { content: "hola" } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};

describe("Groq provider (contract, fake fetch)", () => {
  it("normaliza tool_calls al formato neutral", async () => {
    const p = createGroqProvider({ apiKey: "k", fetchImpl: fakeFetch(toolCallResponse) });
    const r = await p.chat({ messages: [{ role: "user", content: "cotiza" }] });
    expect(r.toolCalls?.[0].name).toBe("calculateQuote");
    expect(r.toolCalls?.[0].arguments.edadPadre).toBe(30);
    expect(r.usage.promptTokens).toBe(10);
  });
  it("maneja respuesta de texto plano", async () => {
    const p = createGroqProvider({ apiKey: "k", fetchImpl: fakeFetch(textResponse) });
    const r = await p.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.content).toBe("hola");
    expect(r.toolCalls).toBeUndefined();
  });
  it("traduce mensajes assistant/tool al formato wire OpenAI (tool_calls + tool_call_id)", async () => {
    let captured: any = {};
    const spy: FetchImpl = async (_url, init) => {
      captured = { url: _url, init };
      return { json: async () => textResponse, ok: true, status: 200 };
    };
    const p = createGroqProvider({ apiKey: "k", fetchImpl: spy });
    await p.chat({
      messages: [
        { role: "user", content: "cotiza" },
        { role: "assistant", toolCalls: [{ id: "tc1", name: "calculateQuote", arguments: { a: 1 } }] },
        { role: "tool", toolCallId: "tc1", content: '{"ok":true}' },
      ],
    });
    const body = JSON.parse(captured.init.body as string);
    expect(body.messages[1].tool_calls[0]).toMatchObject({ id: "tc1", type: "function" });
    expect(body.messages[1].tool_calls[0].function.name).toBe("calculateQuote");
    expect(body.messages[2].tool_call_id).toBe("tc1");
  });
  it("envía Authorization Bearer + body con modelo correcto", async () => {
    let captured: any = {};
    const spy: FetchImpl = async (_url, init) => {
      captured = { url: _url, init };
      return { json: async () => textResponse, ok: true, status: 200 };
    };
    const p = createGroqProvider({ apiKey: "secret", fetchImpl: spy });
    await p.chat({ messages: [{ role: "user", content: "x" }] });
    expect(captured.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(captured.init.headers.Authorization).toBe("Bearer secret");
    const body = JSON.parse(captured.init.body as string);
    expect(body.model).toBe("llama-3.3-70b-versatile");
  });
});

describe("GLM provider (contract, fake fetch)", () => {
  it("normaliza tool_calls y usa baseUrl de GLM", async () => {
    let captured: any = {};
    const spy: FetchImpl = async (_url, init) => {
      captured = { url: _url, init };
      return { json: async () => toolCallResponse, ok: true, status: 200 };
    };
    const p = createGlmProvider({ apiKey: "k", fetchImpl: spy });
    const r = await p.chat({ messages: [{ role: "user", content: "cotiza" }] });
    expect(r.toolCalls?.[0].name).toBe("calculateQuote");
    expect(captured.url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
  });
});

describe("NVIDIA provider (contract, fake fetch)", () => {
  it("usa el endpoint y el modelo por defecto", async () => {
    let captured: any = {};
    const spy: FetchImpl = async (_url, init) => {
      captured = { url: _url, init };
      return { json: async () => textResponse, ok: true, status: 200 };
    };
    const p = createNvidiaProvider({ apiKey: "k", fetchImpl: spy });
    const r = await p.chat({ messages: [{ role: "user", content: "hola" }] });
    expect(r.content).toBe("hola");
    expect(captured.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(captured.init.body as string);
    expect(body.model).toBe("meta/llama-3.1-8b-instruct");
  });
});

describe("Fallback provider", () => {
  it("usa el primario si responde bien, sin tocar el secundario", async () => {
    const primary: LLMProvider = { chat: vi.fn(async () => ({ content: "primario", usage: { promptTokens: 1, completionTokens: 1 } })) };
    const secondary: LLMProvider = { chat: vi.fn(async () => ({ content: "secundario", usage: { promptTokens: 1, completionTokens: 1 } })) };
    const p = createFallbackProvider({ primary, secondary });
    const r = await p.chat({ messages: [{ role: "user", content: "hola" }] });
    expect(r.content).toBe("primario");
    expect(secondary.chat).not.toHaveBeenCalled();
  });

  it("reintenta con el secundario si el primario tira (429/401/5xx)", async () => {
    const primary: LLMProvider = { chat: vi.fn(async () => { throw new Error("LLM provider error (status 429): rate limit"); }) };
    const secondary: LLMProvider = { chat: vi.fn(async () => ({ content: "secundario", usage: { promptTokens: 1, completionTokens: 1 } })) };
    const onFallback = vi.fn();
    const p = createFallbackProvider({ primary, secondary, onFallback });
    const r = await p.chat({ messages: [{ role: "user", content: "hola" }] });
    expect(r.content).toBe("secundario");
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("propaga el error del secundario si también falla", async () => {
    const primary: LLMProvider = { chat: vi.fn(async () => { throw new Error("primario caído"); }) };
    const secondary: LLMProvider = { chat: vi.fn(async () => { throw new Error("secundario caído"); }) };
    const p = createFallbackProvider({ primary, secondary });
    await expect(p.chat({ messages: [{ role: "user", content: "hola" }] })).rejects.toThrow("secundario caído");
  });
});
