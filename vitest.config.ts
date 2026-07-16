import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: "unit", dir: "tests/unit", include: ["**/*.spec.ts"], setupFiles: ["./tests/setup.ts"] } },
      { test: { name: "contract", dir: "tests/contract", include: ["**/*.spec.ts"], setupFiles: ["./tests/setup.ts"] } },
      { test: { name: "e2e", dir: "tests/e2e", include: ["**/*.spec.ts"], setupFiles: ["./tests/setup.ts"] } },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 90, branches: 90, functions: 90, lines: 90,
        perFile: true,
      },
    },
  },
});
