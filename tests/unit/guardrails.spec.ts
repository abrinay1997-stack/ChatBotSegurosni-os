import { describe, it, expect } from "vitest";
import { scrubPII } from "../../src/brain/guardrails/input.js";
import { checkOutput } from "../../src/brain/guardrails/output.js";
import { detectDistress } from "../../src/brain/guardrails/distress.js";

describe("guardrails", () => {
  it("scrubPII enmascara CI, teléfono, fecha", () => {
    const s = scrubPII("mi CI 8-123-456, tel 6000-1234, naci el 01/02/90");
    expect(s).not.toContain("8-123-456");
    expect(s).toContain("[CI]");
    expect(s).toContain("[TEL]");
    expect(s).toContain("[FECHA]");
  });
  it("checkOutput bloquea secretos y rutas", () => {
    expect(checkOutput("vea src/index.ts").ok).toBe(false);
    expect(checkOutput("mi key es sk-1234567890abc").ok).toBe(false);
    expect(checkOutput("respuesta normal").ok).toBe(true);
  });
  it("detectDistress detecta señales", () => {
    expect(detectDistress("mi papá falleció")).toBe(true);
    expect(detectDistress("hola")).toBe(false);
  });
});
