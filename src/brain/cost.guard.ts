import type { LLMUsage } from "../shared/ports/index.js";

export interface CostGuard {
  add(usage: LLMUsage): void;
  isOpen(): boolean;
  spentUsd(): number;
  reset(): void;
}

export function createCostGuard(opts: {
  budgetUsd: number;
  pricePer1k: { input: number; output: number };
}): CostGuard {
  let spent = 0;
  let open = false;
  return {
    add(u) {
      spent +=
        (u.promptTokens / 1000) * opts.pricePer1k.input +
        (u.completionTokens / 1000) * opts.pricePer1k.output;
      if (spent >= opts.budgetUsd) open = true;
    },
    isOpen: () => open,
    spentUsd: () => spent,
    reset: () => {
      spent = 0;
      open = false;
    },
  };
}
