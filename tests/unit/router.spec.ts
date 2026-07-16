import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool } from "../../src/brain/tools/registry.js";
import { buildToolsForState, buildMessages } from "../../src/conversation/router.js";
import type { Session } from "../../src/shared/ports/index.js";

const calc = defineTool({ name: "calculateQuote", description: "", inputSchema: z.object({}), handler: async () => ({}) });
const faq = defineTool({ name: "getProductInfo", description: "", inputSchema: z.object({}), handler: async () => ({}) });

const noConsent = { consentParentAt: null } as unknown as Session;
const consent = { consentParentAt: Date.now() } as unknown as Session;

describe("router", () => {
  it("sin consentimiento → no expone calculateQuote", () => {
    const tools = buildToolsForState(noConsent, [calc, faq]);
    expect(tools.map((t) => t.name)).not.toContain("calculateQuote");
    expect(tools.map((t) => t.name)).toContain("getProductInfo");
  });
  it("con consentimiento → expone calculateQuote", () => {
    const tools = buildToolsForState(consent, [calc, faq]);
    expect(tools.map((t) => t.name)).toContain("calculateQuote");
  });
  it("buildMessages pone RAG en user msg con delimitadores, no en system", () => {
    const empty = { history: [], quoteState: {} } as unknown as Session;
    const msgs = buildMessages(empty, "SYSTEM", [{ id: "1", source: "faq", text: "cotiza" }]);
    const sys = msgs.find((m) => m.role === "system");
    expect(sys?.content).toBe("SYSTEM");
    const user = msgs.find((m) => m.role === "user");
    expect(user).toBeUndefined();

    const withQuery = { history: [{ role: "user", content: "pregunta" }], quoteState: {} } as unknown as Session;
    const msgs2 = buildMessages(withQuery, "SYSTEM", [{ id: "1", source: "faq", text: "info" }]);
    expect(msgs2.some((m) => m.content.includes("===CONTEXTO==="))).toBe(true);
  });
});
