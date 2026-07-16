import { describe, it, expect } from "vitest";
import { createPromptManager } from "../../src/brain/prompt.manager.js";

describe("promptManager", () => {
  it("carga v1 y produce hash", () => {
    const pm = createPromptManager({ version: "v1", ab: "control" });
    const p = pm.get();
    expect(p.system).toMatch(/seguro educacional/);
    expect(p.hash).toHaveLength(16);
  });
});
