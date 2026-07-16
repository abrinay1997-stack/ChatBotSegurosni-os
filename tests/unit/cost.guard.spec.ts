import { describe, it, expect } from "vitest";
import { createCostGuard } from "../../src/brain/cost.guard.js";

describe("CostGuard", () => {
  it("abre el circuito al pasar el budget diario", () => {
    const g = createCostGuard({ budgetUsd: 1, pricePer1k: { input: 0.1, output: 0.2 } });
    g.add({ promptTokens: 5000, completionTokens: 5000 });
    expect(g.isOpen()).toBe(true);
  });
  it("no abre si no se excede", () => {
    const g = createCostGuard({ budgetUsd: 5, pricePer1k: { input: 0.1, output: 0.2 } });
    g.add({ promptTokens: 100, completionTokens: 100 });
    expect(g.isOpen()).toBe(false);
  });
});
